// apps/web/src/frontend/entities/session/lib/cross-tab-auth-events.ts
// ========================================================
// 概要:
// - 認証イベントを全タブに同期するための軽量イベントバス
//
// 責務:
// 1. 認証イベント種別と payload の定義
// 2. 受信 payload の厳格な検証
// 3. publish と subscribe の auth 向け薄いラッパー
// ========================================================

import {
  type CrossTabEventEnvelope,
  createCrossTabEventBus,
} from "@/frontend/shared/lib/cross-tab-event.bus";
import { runBoundaryCallbackWithTelemetry } from "@/frontend/shared/observability/boundary-callback-telemetry";
import {
  TELEMETRY_LAYER,
  TELEMETRY_OPERATION,
} from "@/frontend/shared/observability/telemetry-tags";

// チャンネル名と storage key は同一ドメイン内で衝突しない固定値にする
const AUTH_EVENT_CHANNEL_NAME = "auth:events:v1";
const AUTH_EVENT_STORAGE_KEY = "auth:events:v1";

// 二重配送の抑止で保持する eventId の上限
const MAX_SEEN_EVENT_IDS = 128;

/**
 * 認証イベント種別の定数。
 * - 送信と受信の両方で同じ値を使うことで typo を防ぐ
 */
export const AUTH_EVENT_TYPE = {
  SIGNED_OUT: "signed_out",
  SIGNED_IN: "signed_in",
  ACCOUNT_DELETED: "account_deleted",
} as const;

export type AuthEventType =
  (typeof AUTH_EVENT_TYPE)[keyof typeof AUTH_EVENT_TYPE];

export type AuthEventPayload = {
  type: AuthEventType;
  eventId: string;
  sourceTabId: string;
  emittedAtMs: number;
};

type SubscribeAuthEventsArgs = {
  onAuthEvent: (event: AuthEventPayload) => void | Promise<void>;
};

// ----------------------------------------------------------------------------
// 内部ユーティリティ
// ----------------------------------------------------------------------------

// browser バスのインスタンス
const authEventBus = createCrossTabEventBus<{ type: AuthEventType }>({
  channelName: AUTH_EVENT_CHANNEL_NAME,
  storageKey: AUTH_EVENT_STORAGE_KEY,
  maxSeenEventIds: MAX_SEEN_EVENT_IDS,
  // ignoreSelf はデフォルト true なので指定不要だが、意図が明確になるので残す
  ignoreSelf: true,
});

function isAuthEventType(value: unknown): value is AuthEventType {
  return (
    value === AUTH_EVENT_TYPE.SIGNED_OUT ||
    value === AUTH_EVENT_TYPE.SIGNED_IN ||
    value === AUTH_EVENT_TYPE.ACCOUNT_DELETED
  );
}

function parseAuthEventFromEnvelope(
  envelope: CrossTabEventEnvelope<unknown>,
): AuthEventPayload | null {
  // 1) data 部分だけを auth として厳格に検証する
  if (typeof envelope.data !== "object" || envelope.data === null) return null;

  const record = envelope.data as Record<string, unknown>;
  if (!isAuthEventType(record.type)) return null;

  // 2) auth payload 形式に組み立てる
  return {
    type: record.type,
    eventId: envelope.eventId,
    sourceTabId: envelope.sourceTabId,
    emittedAtMs: envelope.emittedAtMs,
  };
}

// ----------------------------------------------------------------------------
// 本体
// ----------------------------------------------------------------------------

/**
 * 全タブへ サインアウト完了 を通知する。
 */
export function publishAuthSignedOut(): void {
  authEventBus.publish({ type: AUTH_EVENT_TYPE.SIGNED_OUT });
}

/**
 * 全タブへ サインイン完了 を通知する。
 */
export function publishAuthSignedIn(): void {
  authEventBus.publish({ type: AUTH_EVENT_TYPE.SIGNED_IN });
}

/**
 * 全タブへ アカウント削除完了 を通知する。
 */
export function publishAuthAccountDeleted(): void {
  authEventBus.publish({ type: AUTH_EVENT_TYPE.ACCOUNT_DELETED });
}

/**
 * 全タブの認証イベント通知を購読する。
 * - 戻り値は購読解除関数
 */
export function subscribeAuthEvents(args: SubscribeAuthEventsArgs): () => void {
  return authEventBus.subscribe({
    onEvent: (envelope) => {
      // 1) 受信データを必ず検証する
      const payload = parseAuthEventFromEnvelope(envelope);
      if (!payload) return;

      // 2) 受信 callback は boundary ラッパへ寄せる
      // - 同期 throw / 非同期 reject を吸収して処理継続する
      // - 例外は observability 側へ送る
      void runBoundaryCallbackWithTelemetry({
        operation: TELEMETRY_OPERATION.AUTH_CROSS_TAB_EVENT,
        layer: TELEMETRY_LAYER.BOUNDARY,
        fn: async () => {
          await args.onAuthEvent(payload);
        },
      });
    },
  });
}
