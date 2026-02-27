// apps/web/src/frontend/entities/session/lib/cross-tab-auth-events.test.ts
// ========================================================
// 概要:
// - auth 向け cross-tab ラッパーのユニットテスト
//
// 契約:
// - publish は browser bus へ正しい payload を委譲する
// - subscribe は envelope を auth payload へ変換する
// - 不正 data は無視する
// - 受信 callback は boundary telemetry ラッパー経由で実行する
// ========================================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import { runBoundaryCallbackWithTelemetry } from "@/frontend/shared/observability/boundary-callback-telemetry";
import {
  TELEMETRY_LAYER,
  TELEMETRY_OPERATION,
} from "@/frontend/shared/observability/telemetry-tags";
import {
  AUTH_EVENT_TYPE,
  publishAuthAccountDeleted,
  publishAuthSignedIn,
  publishAuthSignedOut,
  subscribeAuthEvents,
} from "./cross-tab-auth-events";

const busMocks = vi.hoisted(() => {
  return {
    publish: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    onEvent: null as ((envelope: unknown) => void | Promise<void>) | null,
  };
});

vi.mock("@/frontend/shared/lib/cross-tab-event.bus", () => {
  return {
    createCrossTabEventBus: () => {
      return {
        publish: (data: unknown) => {
          busMocks.publish(data);
        },
        subscribe: (args: {
          onEvent: (envelope: unknown) => void | Promise<void>;
        }) => {
          busMocks.onEvent = args.onEvent;
          busMocks.subscribe(args);
          return busMocks.unsubscribe;
        },
      };
    },
  };
});

vi.mock("@/frontend/shared/observability/boundary-callback-telemetry", () => {
  return {
    runBoundaryCallbackWithTelemetry: vi.fn(),
  };
});

describe("frontend/shared/lib cross-tab-auth-events", () => {
  const mockedRunBoundaryCallbackWithTelemetry = vi.mocked(
    runBoundaryCallbackWithTelemetry,
  );

  beforeEach(() => {
    busMocks.publish.mockReset();
    busMocks.subscribe.mockReset();
    busMocks.unsubscribe.mockReset();
    busMocks.onEvent = null;

    mockedRunBoundaryCallbackWithTelemetry.mockReset();
    mockedRunBoundaryCallbackWithTelemetry.mockImplementation(
      async (args: { fn: () => void | Promise<void> }) => {
        try {
          await args.fn();
        } catch {
          // boundary ラッパーの契約どおり握りつぶす
        }
      },
    );
  });

  it("publishAuthSignedOut: signed_out を publish する", () => {
    publishAuthSignedOut();

    expect(busMocks.publish).toHaveBeenCalledTimes(1);
    expect(busMocks.publish).toHaveBeenCalledWith({
      type: AUTH_EVENT_TYPE.SIGNED_OUT,
    });
  });

  it("publishAuthSignedIn: signed_in を publish する", () => {
    publishAuthSignedIn();

    expect(busMocks.publish).toHaveBeenCalledTimes(1);
    expect(busMocks.publish).toHaveBeenCalledWith({
      type: AUTH_EVENT_TYPE.SIGNED_IN,
    });
  });

  it("publishAuthAccountDeleted: account_deleted を publish する", () => {
    publishAuthAccountDeleted();

    expect(busMocks.publish).toHaveBeenCalledTimes(1);
    expect(busMocks.publish).toHaveBeenCalledWith({
      type: AUTH_EVENT_TYPE.ACCOUNT_DELETED,
    });
  });

  it("subscribeAuthEvents: data が object 以外の envelope は無視する", async () => {
    const onAuthEvent = vi.fn<() => void>();
    subscribeAuthEvents({ onAuthEvent });

    await busMocks.onEvent?.({
      eventId: "e_non_object_data",
      sourceTabId: "other_tab",
      emittedAtMs: 1234,
      data: "signed_in",
    });

    expect(mockedRunBoundaryCallbackWithTelemetry).toHaveBeenCalledTimes(0);
    expect(onAuthEvent).toHaveBeenCalledTimes(0);
  });

  it("subscribeAuthEvents: data が null の envelope は無視する", async () => {
    const onAuthEvent = vi.fn<() => void>();
    subscribeAuthEvents({ onAuthEvent });

    await busMocks.onEvent?.({
      eventId: "e_null_data",
      sourceTabId: "other_tab",
      emittedAtMs: 1234,
      data: null,
    });

    expect(mockedRunBoundaryCallbackWithTelemetry).toHaveBeenCalledTimes(0);
    expect(onAuthEvent).toHaveBeenCalledTimes(0);
  });

  it("subscribeAuthEvents: data.type が不正な envelope は無視する", async () => {
    const onAuthEvent = vi.fn<() => void>();
    subscribeAuthEvents({ onAuthEvent });

    await busMocks.onEvent?.({
      eventId: "e_invalid",
      sourceTabId: "other_tab",
      emittedAtMs: 1234,
      data: { type: "invalid_type" },
    });

    expect(mockedRunBoundaryCallbackWithTelemetry).toHaveBeenCalledTimes(0);
    expect(onAuthEvent).toHaveBeenCalledTimes(0);
  });

  it("subscribeAuthEvents: onAuthEvent は boundary ラッパー経由で実行される", async () => {
    const onAuthEvent = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("boom"));
    subscribeAuthEvents({ onAuthEvent });

    expect(busMocks.onEvent).toBeTypeOf("function");
    await busMocks.onEvent?.({
      eventId: "e_throw",
      sourceTabId: "other_tab",
      emittedAtMs: 9999,
      data: { type: AUTH_EVENT_TYPE.SIGNED_OUT },
    });

    expect(mockedRunBoundaryCallbackWithTelemetry).toHaveBeenCalledTimes(1);
    expect(onAuthEvent).toHaveBeenCalledTimes(1);
  });

  it("subscribeAuthEvents: envelope を AuthEventPayload に変換して callback を実行する", async () => {
    const onAuthEvent =
      vi.fn<(event: { type: string; eventId: string }) => void>();
    const unsubscribe = subscribeAuthEvents({ onAuthEvent });

    expect(busMocks.subscribe).toHaveBeenCalledTimes(1);
    expect(busMocks.onEvent).toBeTypeOf("function");
    expect(unsubscribe).toBe(busMocks.unsubscribe);

    const envelope = {
      eventId: "e1",
      sourceTabId: "other_tab",
      emittedAtMs: 1234,
      data: { type: AUTH_EVENT_TYPE.SIGNED_IN },
    } as const;
    await busMocks.onEvent?.(envelope);

    expect(mockedRunBoundaryCallbackWithTelemetry).toHaveBeenCalledTimes(1);
    const [boundaryArgs] =
      mockedRunBoundaryCallbackWithTelemetry.mock.calls[0] ?? [];
    expect(boundaryArgs).toMatchObject({
      operation: TELEMETRY_OPERATION.AUTH_CROSS_TAB_EVENT,
      layer: TELEMETRY_LAYER.BOUNDARY,
    });
    expect(onAuthEvent).toHaveBeenCalledTimes(1);
    expect(onAuthEvent).toHaveBeenCalledWith({
      type: envelope.data.type,
      eventId: envelope.eventId,
      sourceTabId: envelope.sourceTabId,
      emittedAtMs: envelope.emittedAtMs,
    });
  });
});
