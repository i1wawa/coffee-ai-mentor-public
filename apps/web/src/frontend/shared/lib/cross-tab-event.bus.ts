// apps/web/src/frontend/shared/lib/cross-tab-event.bus.ts
// ===============================================================
// 概要:
// - 同一オリジン内で、タブ間にイベントを配信するための軽量バス
//
// 責務:
// - BroadcastChannel を優先し、非対応時は storage イベントにフォールバックする
// - BroadcastChannel と storage の二重配送を eventId で 1 回に抑える
// - 送信元タブの自己受信を抑止する
//
// 前提:
// - payload の検証は呼び出し側が行う
// ===============================================================

import "client-only";

const DEFAULT_MAX_SEEN_EVENT_IDS = 128;

export type CrossTabEventEnvelope<TData> = {
  eventId: string;
  sourceTabId: string;
  emittedAtMs: number;
  data: TData;
};

type CreateCrossTabEventBusArgs = {
  channelName: string;
  storageKey: string;
  maxSeenEventIds?: number;
  ignoreSelf?: boolean;
};

type SubscribeArgs = {
  // data は unknown のまま返し、呼び出し側で解釈する
  onEvent: (event: CrossTabEventEnvelope<unknown>) => void | Promise<void>;
};

export type CrossTabEventBus<TPublishData> = {
  publish: (data: TPublishData) => void;
  subscribe: (args: SubscribeArgs) => () => void;
};

// ----------------------------------------------------------------------------
// 内部ユーティリティ
// ----------------------------------------------------------------------------

const SOURCE_TAB_ID = createOpaqueId();

function isBrowserRuntime(): boolean {
  return typeof window !== "undefined";
}

function canUseBroadcastChannel(): boolean {
  return isBrowserRuntime() && typeof BroadcastChannel !== "undefined";
}

function createOpaqueId(): string {
  // 1) 利用可能なら標準 UUID を使う
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  // 2) UUID が無くても暗号学的乱数が使える場合はそれを使う
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  ) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return `${Date.now()}_${toHex(bytes)}`;
  }

  // 3) 最後の手段として時間 + 疑似乱数
  return `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function toHex(bytes: Uint8Array): string {
  let result = "";
  for (let i = 0; i < bytes.length; i += 1) {
    result += bytes[i].toString(16).padStart(2, "0");
  }
  return result;
}

function buildEnvelope<TData>(data: TData): CrossTabEventEnvelope<TData> {
  // payload の形式を 1 箇所で固定する
  return {
    eventId: createOpaqueId(),
    sourceTabId: SOURCE_TAB_ID,
    emittedAtMs: Date.now(),
    data,
  };
}

function parseEnvelope(raw: unknown): CrossTabEventEnvelope<unknown> | null {
  // 外部入力を最低限検証して、ランタイム例外を避ける
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;

  if (typeof record.eventId !== "string") return null;
  if (typeof record.sourceTabId !== "string") return null;
  if (typeof record.emittedAtMs !== "number") return null;

  return {
    eventId: record.eventId,
    sourceTabId: record.sourceTabId,
    emittedAtMs: record.emittedAtMs,
    data: record.data as unknown,
  };
}

function writeEnvelopeToStorage(storageKey: string, envelope: unknown): void {
  if (!isBrowserRuntime()) return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(envelope));
  } catch {
    // storage が使えない環境でもアプリ処理を妨げない
  }
}

// ----------------------------------------------------------------------------
// 本体
// ----------------------------------------------------------------------------

/**
 * クロスタブイベントバスを生成する。
 * - payload の中身は解釈せず、そのまま配信する。
 */
export function createCrossTabEventBus<TData>(
  args: CreateCrossTabEventBusArgs,
): CrossTabEventBus<TData> {
  const maxSeenEventIds = args.maxSeenEventIds ?? DEFAULT_MAX_SEEN_EVENT_IDS;
  const ignoreSelf = args.ignoreSelf ?? true;

  return {
    /**
     * 全タブへイベントを配信する。
     */
    publish: (data: TData) => {
      if (!isBrowserRuntime()) return;

      // 1) 配信データを envelope に包む
      const envelope = buildEnvelope(data);

      // 2) BroadcastChannel を優先して配信する
      if (canUseBroadcastChannel()) {
        let channel: BroadcastChannel | null = null;
        try {
          channel = new BroadcastChannel(args.channelName);
          channel.postMessage(envelope);
        } catch {
          // 配信に失敗しても fallback に任せる
        } finally {
          channel?.close();
        }
      }

      // 3) fallback と保険として storage にも書く
      // - 二重配送は subscribe 側で eventId により 1 回に抑える
      writeEnvelopeToStorage(args.storageKey, envelope);
    },

    /**
     * 全タブからイベントを受信する。
     * - 戻り値は購読解除関数。
     */
    subscribe: (subArgs: SubscribeArgs) => {
      // ------------------------------------------------------------------------
      // subscribe 内部状態
      // ------------------------------------------------------------------------

      // 二重配送抑止のために、受信済み eventId を保持する
      const seenEventIds: string[] = [];

      /**
       * eventId を記録し、既存なら false を返す
       */
      const markEventAsSeen = (eventId: string): boolean => {
        if (seenEventIds.includes(eventId)) return false;

        seenEventIds.push(eventId);

        // メモリが増え続けないように上限を設ける
        if (seenEventIds.length > maxSeenEventIds) {
          seenEventIds.shift();
        }

        return true;
      };

      /**
       * 外部からの生データを受け取り、envelope に変換して callback を呼ぶ
       */
      const handleExternalRaw = (raw: unknown) => {
        // 1) envelope を最低限検証して取り出す
        // - data 部分の解釈は呼び出し側に任せる
        const parsedEnvelope = parseEnvelope(raw);
        if (!parsedEnvelope) return;

        // 2) 自己受信を抑止する
        if (ignoreSelf && parsedEnvelope.sourceTabId === SOURCE_TAB_ID) return;

        // 3) 二重配送を 1 回に抑える
        if (!markEventAsSeen(parsedEnvelope.eventId)) return;

        // 4) 呼び出し側の例外はここで吸収する
        //    同期 throw と非同期 reject の両方を吸収する
        Promise.resolve()
          .then(() => subArgs.onEvent(parsedEnvelope))
          .catch(() => {});
      };

      // BroadcastChannel を購読する
      const broadcastChannel = canUseBroadcastChannel()
        ? new BroadcastChannel(args.channelName)
        : null;

      // storage イベントを購読する
      const onStorage = (event: StorageEvent) => {
        if (event.key !== args.storageKey) return;
        if (!event.newValue) return;

        try {
          const raw = JSON.parse(event.newValue) as unknown;
          handleExternalRaw(raw);
        } catch {
          // JSON が壊れていたら無視する
        }
      };

      // ------------------------------------------------------------------------
      // subscribe 本体
      // ------------------------------------------------------------------------

      // 1) ブラウザ環境でなければ何もしない
      if (!isBrowserRuntime()) {
        return () => {};
      }

      // 2) BroadcastChannel の購読設定
      // - 存在しない場合はスキップ
      if (broadcastChannel) {
        broadcastChannel.onmessage = (event: MessageEvent<unknown>) => {
          handleExternalRaw(event.data);
        };
      }

      // 3) storage イベントの購読設定
      window.addEventListener("storage", onStorage);

      /**
       * subscribe の戻り値は購読解除関数
       */
      return () => {
        window.removeEventListener("storage", onStorage);

        if (broadcastChannel) {
          broadcastChannel.onmessage = null;
          broadcastChannel.close();
        }
      };
    },
  };
}
