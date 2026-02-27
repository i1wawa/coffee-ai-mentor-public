// apps/web/src/frontend/shared/lib/cross-tab-event.bus.test.ts
// ================================================================
// 概要:
// - browser cross-tab event bus のユニットテスト
//
// 契約:
// - publish は BroadcastChannel と storage fallback を使う
// - subscribe は重複通知を eventId で 1 回に抑える
// - self-event を無視する
// - callback の同期 throw / 非同期 reject を外へ出さない
// ================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type CrossTabEventEnvelope,
  createCrossTabEventBus,
} from "./cross-tab-event.bus";

type MockMessageEvent = MessageEvent<unknown>;

type MockBroadcastChannelInstance = {
  readonly name: string;
  onmessage: ((event: MockMessageEvent) => void) | null;
  postMessage: ReturnType<typeof vi.fn<(payload: unknown) => void>>;
  close: ReturnType<typeof vi.fn<() => void>>;
};

const mockChannelInstances: MockBroadcastChannelInstance[] = [];

function resetMockBroadcastChannels(): void {
  mockChannelInstances.length = 0;
}

function emitToMockBroadcastChannel(index: number, payload: unknown): void {
  mockChannelInstances[index]?.onmessage?.({
    data: payload,
  } as MockMessageEvent);
}

const MockBroadcastChannel = vi.fn(function MockBroadcastChannel(name: string) {
  const instance: MockBroadcastChannelInstance = {
    name,
    onmessage: null,
    postMessage: vi.fn<(payload: unknown) => void>(),
    close: vi.fn<() => void>(),
  };
  mockChannelInstances.push(instance);
  return instance;
});

describe("shared/lib cross-tab-event.bus", () => {
  beforeEach(() => {
    // 1) BroadcastChannel モックの保持配列を毎テストで初期化する
    resetMockBroadcastChannels();
    // 2) 実環境 API をモックへ差し替える
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
    // 3) storage の状態を毎回クリアする
    window.localStorage.clear();
  });

  afterEach(() => {
    // 1) stub したグローバルを元に戻す
    vi.unstubAllGlobals();
    // 2) 次テストへ状態を持ち越さない
    window.localStorage.clear();
  });

  it("publish: BroadcastChannel と storage fallback の両方に通知する", () => {
    // 1) storage へ書き込まれた事実を検証するために setItem を監視する
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    // 2) publish 対象のバスを作る
    const bus = createCrossTabEventBus<{ type: string }>({
      channelName: "auth:events:v1",
      storageKey: "auth:events:v1",
    });

    // 3) イベントを publish する
    bus.publish({ type: "signed_in" });

    // 4) BroadcastChannel 経由で 1 回配信されたことを確認する
    expect(mockChannelInstances).toHaveLength(1);
    const channel = mockChannelInstances[0];
    expect(channel?.postMessage).toHaveBeenCalledTimes(1);

    // 5) 配信 envelope の必須項目が埋まっていることを確認する
    const envelope = channel?.postMessage.mock.calls[0]?.[0] as {
      eventId: string;
      sourceTabId: string;
      emittedAtMs: number;
      data: { type: string };
    };
    expect(envelope?.eventId).toEqual(expect.stringMatching(/.+/));
    expect(envelope?.sourceTabId).toEqual(expect.stringMatching(/.+/));
    expect(envelope?.emittedAtMs).toEqual(expect.any(Number));
    expect(envelope?.emittedAtMs).toBeGreaterThan(0);
    expect(envelope?.data?.type).toBe("signed_in");

    // 6) fallback として storage 書き込みも実行されることを確認する
    expect(setItemSpy).toHaveBeenCalledTimes(1);
    expect(setItemSpy).toHaveBeenCalledWith(
      "auth:events:v1",
      expect.stringMatching(/.+/),
    );
  });

  it("subscribe: BroadcastChannel -> storage の重複通知を 1 回に抑える", async () => {
    // 0) 受信側のバスとコールバックを準備する
    const bus = createCrossTabEventBus<{ type: string }>({
      channelName: "auth:events:v1",
      storageKey: "auth:events:v1",
    });
    const onEvent = vi.fn<(event: CrossTabEventEnvelope<unknown>) => void>();
    const unsubscribe = bus.subscribe({ onEvent });

    // 1) subscribe で BroadcastChannel が 1 つ作られることを先に確認する
    expect(mockChannelInstances).toHaveLength(1);
    const envelope = {
      eventId: "e1",
      sourceTabId: "other_tab",
      emittedAtMs: Date.now(),
      data: { type: "signed_out" },
    };

    // 2) まず BroadcastChannel 経由で 1 回配信し、onEvent が 1 回呼ばれることを確認する
    emitToMockBroadcastChannel(0, envelope);
    await Promise.resolve();

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ data: { type: "signed_out" } }),
    );

    // 3) 同じ eventId を storage 経由で再配信しても、重複扱いで 1 回のままを確認する
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "auth:events:v1",
        newValue: JSON.stringify(envelope),
      }),
    );
    await Promise.resolve();

    expect(onEvent).toHaveBeenCalledTimes(1);
    // 4) 後始末として購読を解除する
    unsubscribe();
  });

  it("subscribe: storage -> BroadcastChannel の重複通知を 1 回に抑える", async () => {
    // 0) 受信側のバスとコールバックを準備する
    const bus = createCrossTabEventBus<{ type: string }>({
      channelName: "auth:events:v1",
      storageKey: "auth:events:v1",
    });
    const onEvent = vi.fn<(event: CrossTabEventEnvelope<unknown>) => void>();
    const unsubscribe = bus.subscribe({ onEvent });

    // 1) storage で先に受信した eventId を作る
    const envelope = {
      eventId: "e2",
      sourceTabId: "other_tab",
      emittedAtMs: Date.now(),
      data: { type: "signed_out" },
    };

    // 2) storage 経由で 1 回目を受信させる
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "auth:events:v1",
        newValue: JSON.stringify(envelope),
      }),
    );
    await Promise.resolve();
    expect(onEvent).toHaveBeenCalledTimes(1);

    // 3) 同じ eventId を BroadcastChannel で再受信しても 1 回のままを確認する
    emitToMockBroadcastChannel(0, envelope);
    await Promise.resolve();
    expect(onEvent).toHaveBeenCalledTimes(1);

    // 4) 後始末として購読を解除する
    unsubscribe();
  });

  it("subscribe: 不正 envelope は無視する", async () => {
    // 1) subscribe を開始し、受信コールバックを監視する
    const bus = createCrossTabEventBus<{ type: string }>({
      channelName: "auth:events:v1",
      storageKey: "auth:events:v1",
    });
    const onEvent = vi.fn<() => void>();
    const unsubscribe = bus.subscribe({ onEvent });

    // 2) BroadcastChannel で必須項目欠落の不正 envelope を流す
    emitToMockBroadcastChannel(0, {
      eventId: "e_invalid",
      sourceTabId: "other_tab",
      // emittedAtMs 欠落
      data: { type: "signed_out" },
    });

    // 3) storage でも壊れた JSON を流す
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "auth:events:v1",
        newValue: "{",
      }),
    );

    // 4) マイクロタスクを進めて非同期処理を完了させる
    await Promise.resolve();

    // 5) どちらの不正入力でも onEvent は呼ばれないことを確認する
    expect(onEvent).toHaveBeenCalledTimes(0);

    // 6) 後始末として購読を解除する
    unsubscribe();
  });

  it("subscribe: self-event は無視する", async () => {
    // 0) デフォルト設定でバスを作り、self-event 抑止を確認する
    const bus = createCrossTabEventBus<{ type: string }>({
      channelName: "auth:events:v1",
      storageKey: "auth:events:v1",
    });

    // 1) publish でこのタブ由来の envelope を作る
    bus.publish({ type: "signed_out" });
    const publishChannel = mockChannelInstances[0];
    const selfEnvelope = publishChannel?.postMessage.mock.calls[0]?.[0];
    expect(selfEnvelope).toBeDefined();

    // 2) subscribe 側へ同 envelope を流しても処理されない
    const onEvent = vi.fn<() => void>();
    const unsubscribe = bus.subscribe({ onEvent });
    emitToMockBroadcastChannel(1, selfEnvelope);

    // 3) 非同期実行を待ってから結果を検証する
    await Promise.resolve();

    // 4) self-event は無視されるため、onEvent は 0 回のまま
    expect(onEvent).toHaveBeenCalledTimes(0);

    // 5) 後始末として購読を解除する
    unsubscribe();
  });

  it("subscribe: ignoreSelf が false なら self-event を受信する", async () => {
    // 1) 自己受信を無効化してバスを作る
    const bus = createCrossTabEventBus<{ type: string }>({
      channelName: "auth:events:v1",
      storageKey: "auth:events:v1",
      ignoreSelf: false,
    });

    // 2) このタブ由来の envelope を publish で作る
    bus.publish({ type: "signed_out" });
    const publishChannel = mockChannelInstances[0];
    const selfEnvelope = publishChannel?.postMessage.mock.calls[0]?.[0];
    expect(selfEnvelope).toBeDefined();

    // 3) subscribe 側で同 envelope を受け取らせる
    const onEvent = vi.fn<(event: CrossTabEventEnvelope<unknown>) => void>();
    const unsubscribe = bus.subscribe({ onEvent });
    emitToMockBroadcastChannel(1, selfEnvelope);

    // 4) 非同期実行を待ってから結果を検証する
    await Promise.resolve();

    // 5) ignoreSelf が false なので self-event を受信することを確認する
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ data: { type: "signed_out" } }),
    );

    // 6) 後始末として購読を解除する
    unsubscribe();
  });

  it("subscribe: maxSeenEventIds 上限超過で古い eventId は再受信される", async () => {
    // 1) seenEventIds の上限を小さくして eviction を再現しやすくする
    const bus = createCrossTabEventBus<{ type: string }>({
      channelName: "auth:events:v1",
      storageKey: "auth:events:v1",
      maxSeenEventIds: 2,
    });
    const onEvent = vi.fn<(event: CrossTabEventEnvelope<unknown>) => void>();
    const unsubscribe = bus.subscribe({ onEvent });

    // 2) e1, e2, e3 の順に受信して e1 を seenEventIds から押し出す
    emitToMockBroadcastChannel(0, {
      eventId: "e1",
      sourceTabId: "other_tab",
      emittedAtMs: Date.now(),
      data: { type: "signed_out" },
    });
    emitToMockBroadcastChannel(0, {
      eventId: "e2",
      sourceTabId: "other_tab",
      emittedAtMs: Date.now(),
      data: { type: "signed_out" },
    });
    emitToMockBroadcastChannel(0, {
      eventId: "e3",
      sourceTabId: "other_tab",
      emittedAtMs: Date.now(),
      data: { type: "signed_out" },
    });

    // 3) e1 を再送すると、押し出し済みなので再受信される
    emitToMockBroadcastChannel(0, {
      eventId: "e1",
      sourceTabId: "other_tab",
      emittedAtMs: Date.now(),
      data: { type: "signed_out" },
    });

    // 4) 非同期実行を待ってから総呼び出し回数を検証する
    await Promise.resolve();
    await Promise.resolve();

    // 5) e1/e2/e3/e1(再送) の合計 4 回が受信される
    expect(onEvent).toHaveBeenCalledTimes(4);

    // 6) 後始末として購読を解除する
    unsubscribe();
  });

  it("subscribe: onEvent が reject しても処理全体は落ちない", async () => {
    // 1) onEvent が非同期 reject するケースを準備する
    const bus = createCrossTabEventBus<{ type: string }>({
      channelName: "auth:events:v1",
      storageKey: "auth:events:v1",
    });
    const onEvent = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("reject"));
    const unsubscribe = bus.subscribe({ onEvent });

    // 2) 正常な envelope を受信させる
    emitToMockBroadcastChannel(0, {
      eventId: "e_reject",
      sourceTabId: "other_tab",
      emittedAtMs: Date.now(),
      data: { type: "signed_out" },
    });

    // 3) Promise.resolve().then(...).catch(...) の非同期連鎖完了を待つ
    await Promise.resolve();
    await Promise.resolve();

    // 4) reject があっても onEvent 呼び出し自体は実行される
    expect(onEvent).toHaveBeenCalledTimes(1);

    // 5) 後始末として購読を解除する
    unsubscribe();
  });

  it("subscribe: onEvent が同期 throw しても処理全体は落ちない", async () => {
    // 1) onEvent が同期 throw するケースを準備する
    const bus = createCrossTabEventBus<{ type: string }>({
      channelName: "auth:events:v1",
      storageKey: "auth:events:v1",
    });
    const onEvent = vi.fn<() => void>(() => {
      throw new Error("sync");
    });
    const unsubscribe = bus.subscribe({ onEvent });

    // 2) 受信処理の呼び出し元へ例外が漏れないことを確認する
    expect(() => {
      emitToMockBroadcastChannel(0, {
        eventId: "e_sync_throw",
        sourceTabId: "other_tab",
        emittedAtMs: Date.now(),
        data: { type: "signed_out" },
      });
    }).not.toThrow();

    // 3) 非同期連鎖完了を待ってから呼び出し回数を確認する
    await Promise.resolve();
    await Promise.resolve();

    // 4) throw しても onEvent の呼び出しは 1 回発生している
    expect(onEvent).toHaveBeenCalledTimes(1);

    // 5) 後始末として購読を解除する
    unsubscribe();
  });

  it("subscribe: unsubscribe 後は storage イベントを受け取らない", async () => {
    // 1) subscribe 直後に unsubscribe して storage リスナーを解除する
    const bus = createCrossTabEventBus<{ type: string }>({
      channelName: "auth:events:v1",
      storageKey: "auth:events:v1",
    });
    const onEvent = vi.fn<(event: CrossTabEventEnvelope<unknown>) => void>();
    const unsubscribe = bus.subscribe({ onEvent });
    unsubscribe();

    // 2) 解除後に storage イベントを流しても受信しないことを確認する
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "auth:events:v1",
        newValue: JSON.stringify({
          eventId: "e_after_unsubscribe",
          sourceTabId: "other_tab",
          emittedAtMs: Date.now(),
          data: { type: "signed_out" },
        }),
      }),
    );

    // 3) 非同期実行を待ってから未受信を検証する
    await Promise.resolve();
    await Promise.resolve();

    // 4) unsubscribe 後なので onEvent は呼ばれない
    expect(onEvent).toHaveBeenCalledTimes(0);
  });
});
