// apps/web/src/app/_shared/providers/AuthCrossTabSync.test.tsx
// ========================================================
// 概要:
// - AuthCrossTabSync のユニットテスト
//
// 契約:
// - signed_out 受信時に認証系クエリを更新し、/sign-in へ遷移する
// - クエリ更新順は cancel -> set(null) -> replace の順を維持する
// - auth:signed_in 受信時は invalidate して遷移しない
// ========================================================

import { ok } from "@packages/shared/src/result";
import { act } from "@testing-library/react";
import { useRouter } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AuthEventPayload,
  subscribeAuthEvents,
} from "@/frontend/entities/session/lib/cross-tab-auth-events";
import { SESSION_USER_QUERY_KEY } from "@/frontend/entities/user/model/session-user.query";
import { USER_ME_QUERY_KEY } from "@/frontend/entities/user/model/user-me.query";
import { createTestQueryClient } from "@/tests/vitest-utils/utils/react-query";
import { renderWithProviders } from "@/tests/vitest-utils/utils/render";
import { AuthCrossTabSync } from "./AuthCrossTabSync";

const routerReplace = vi.fn();
const cleanupMock = vi.fn();
let authEventHandler:
  | ((event: AuthEventPayload) => void | Promise<void>)
  | null = null;

vi.mock("next/navigation", () => {
  return {
    useRouter: vi.fn(),
  };
});

vi.mock(
  "@/frontend/entities/session/lib/cross-tab-auth-events",
  async (importOriginal) => {
    const originalModule =
      await importOriginal<
        typeof import("@/frontend/entities/session/lib/cross-tab-auth-events")
      >();

    return {
      ...originalModule,
      subscribeAuthEvents: vi.fn(),
    };
  },
);

describe("app providers AuthCrossTabSync", () => {
  const mockedUseRouter = vi.mocked(useRouter);
  const mockedSubscribeAuthEvents = vi.mocked(subscribeAuthEvents);

  beforeEach(() => {
    mockedUseRouter.mockReset();
    mockedSubscribeAuthEvents.mockReset();
    routerReplace.mockReset();
    cleanupMock.mockReset();
    authEventHandler = null;
    mockedUseRouter.mockReturnValue({
      replace: routerReplace,
    } as unknown as ReturnType<typeof useRouter>);
    mockedSubscribeAuthEvents.mockImplementation((args) => {
      authEventHandler = args.onAuthEvent;
      return cleanupMock;
    });
  });

  it("signed_in 受信: 認証系クエリを invalidate し、遷移しない", async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(USER_ME_QUERY_KEY, ok({ uid: "u1" }));
    queryClient.setQueryData(SESSION_USER_QUERY_KEY, ok({ uid: "u1" }));

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const setSpy = vi.spyOn(queryClient, "setQueryData");

    renderWithProviders(<AuthCrossTabSync />, { queryClient });
    expect(authEventHandler).toBeTypeOf("function");

    await act(async () => {
      await authEventHandler?.({
        type: "signed_in",
        eventId: "event_1",
        sourceTabId: "tab_1",
        emittedAtMs: Date.now(),
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: USER_ME_QUERY_KEY,
      exact: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: SESSION_USER_QUERY_KEY,
      exact: true,
    });
    expect(setSpy).toHaveBeenCalledTimes(0);
    expect(routerReplace).toHaveBeenCalledTimes(0);
  });

  it("同時受信: 処理中に来た 2 回目イベントは無視される（多重受信抑止）", async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(USER_ME_QUERY_KEY, ok({ uid: "u1" }));
    queryClient.setQueryData(SESSION_USER_QUERY_KEY, ok({ uid: "u1" }));

    let releaseFirstCancel: (() => void) | undefined;
    const firstCancelBlocked = new Promise<void>((resolve) => {
      releaseFirstCancel = () => resolve();
    });

    const cancelSpy = vi
      .spyOn(queryClient, "cancelQueries")
      .mockImplementationOnce(async () => {
        await firstCancelBlocked;
      });

    renderWithProviders(<AuthCrossTabSync />, { queryClient });
    expect(authEventHandler).toBeTypeOf("function");

    // 1) 1 回目を開始し、最初の cancelQueries で待機させる
    const firstEventPromise = authEventHandler?.({
      type: "signed_out",
      eventId: "event_1",
      sourceTabId: "tab_1",
      emittedAtMs: Date.now(),
    });

    // 2) 処理中に 2 回目を投入すると、ロックにより即 return される
    await act(async () => {
      await authEventHandler?.({
        type: "signed_out",
        eventId: "event_2",
        sourceTabId: "tab_2",
        emittedAtMs: Date.now(),
      });
    });
    expect(routerReplace).toHaveBeenCalledTimes(0);

    // 3) 1 回目の待機を解除すると、1 回分だけ処理が進む
    if (!releaseFirstCancel) {
      throw new Error("test setup error: releaseFirstCancel is undefined");
    }
    releaseFirstCancel();
    await act(async () => {
      await firstEventPromise;
    });

    expect(cancelSpy).toHaveBeenCalledTimes(2);
    expect(routerReplace).toHaveBeenCalledTimes(1);
    expect(routerReplace).toHaveBeenCalledWith("/sign-in");
    expect(queryClient.getQueryData(USER_ME_QUERY_KEY)).toEqual(ok(null));
    expect(queryClient.getQueryData(SESSION_USER_QUERY_KEY)).toEqual(ok(null));
  });

  it("連続受信: 2 回目イベントも処理できる（ロックが解除される）", async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(USER_ME_QUERY_KEY, ok({ uid: "u1" }));
    queryClient.setQueryData(SESSION_USER_QUERY_KEY, ok({ uid: "u1" }));

    renderWithProviders(<AuthCrossTabSync />, { queryClient });
    expect(authEventHandler).toBeTypeOf("function");

    await act(async () => {
      await authEventHandler?.({
        type: "signed_out",
        eventId: "event_1",
        sourceTabId: "tab_1",
        emittedAtMs: Date.now(),
      });
    });
    await act(async () => {
      await authEventHandler?.({
        type: "signed_out",
        eventId: "event_2",
        sourceTabId: "tab_2",
        emittedAtMs: Date.now(),
      });
    });

    expect(routerReplace).toHaveBeenCalledTimes(2);
  });

  it("signed_out 受信時: cancel -> set(null) -> replace の順で更新し /sign-in へ遷移する", async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(USER_ME_QUERY_KEY, ok({ uid: "u1" }));
    queryClient.setQueryData(SESSION_USER_QUERY_KEY, ok({ uid: "u1" }));

    const cancelSpy = vi.spyOn(queryClient, "cancelQueries");
    const setSpy = vi.spyOn(queryClient, "setQueryData");

    renderWithProviders(<AuthCrossTabSync />, { queryClient });
    expect(mockedSubscribeAuthEvents).toHaveBeenCalledTimes(1);
    expect(authEventHandler).toBeTypeOf("function");

    await act(async () => {
      await authEventHandler?.({
        type: "signed_out",
        eventId: "event_1",
        sourceTabId: "tab_1",
        emittedAtMs: Date.now(),
      });
    });

    // 1) 認証系クエリが null 化される
    expect(queryClient.getQueryData(USER_ME_QUERY_KEY)).toEqual(ok(null));
    expect(queryClient.getQueryData(SESSION_USER_QUERY_KEY)).toEqual(ok(null));
    expect(routerReplace).toHaveBeenCalledWith("/sign-in");

    // 2) 順序（cancel -> set -> replace）を固定する（画面のチラつきを防止するため）
    const firstCancelOrder = cancelSpy.mock.invocationCallOrder[0] ?? 0;
    const firstSetOrder = setSpy.mock.invocationCallOrder[0] ?? 0;
    const firstReplaceOrder = routerReplace.mock.invocationCallOrder[0] ?? 0;
    expect(firstCancelOrder).toBeLessThan(firstSetOrder);
    expect(firstSetOrder).toBeLessThan(firstReplaceOrder);
  });

  it("account_deleted 受信時: signed_out と同様に /sign-in へ遷移する", async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(USER_ME_QUERY_KEY, ok({ uid: "u1" }));
    queryClient.setQueryData(SESSION_USER_QUERY_KEY, ok({ uid: "u1" }));

    renderWithProviders(<AuthCrossTabSync />, { queryClient });
    expect(authEventHandler).toBeTypeOf("function");

    await act(async () => {
      await authEventHandler?.({
        type: "account_deleted",
        eventId: "event_1",
        sourceTabId: "tab_1",
        emittedAtMs: Date.now(),
      });
    });

    expect(queryClient.getQueryData(USER_ME_QUERY_KEY)).toEqual(ok(null));
    expect(queryClient.getQueryData(SESSION_USER_QUERY_KEY)).toEqual(ok(null));
    expect(routerReplace).toHaveBeenCalledWith("/sign-in");
  });
});
