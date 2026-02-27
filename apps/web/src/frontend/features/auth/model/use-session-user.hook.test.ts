// apps/web/src/frontend/features/auth/model/use-session-user.hook.test.ts
// ================================================================
// 概要:
// - useSessionUser hook のユニットテスト（React Query）
//
// 契約:
// - getSessionUser が ok のとき sessionUser を保持し、isAuthenticated=true
// - getSessionUser が ok(null) のとき未サインイン扱いで sessionUser=null、isAuthenticated=false
// ================================================================

import "client-only";

import {
  buildErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { err, ok } from "@packages/shared/src/result";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSessionUser } from "@/frontend/entities/user/api/get-session-user";
import { createQueryClientWrapper } from "@/tests/vitest-utils/utils/react-query";
import { useSessionUser } from "./use-session-user.hook";

vi.mock("@/frontend/entities/user/api/get-session-user", () => {
  return {
    getSessionUser: vi.fn(),
  };
});

describe("features/auth/model useSessionUser", () => {
  const mockedGetSessionUser = vi.mocked(getSessionUser);

  beforeEach(() => {
    // 1) テスト間の干渉を防ぐ
    mockedGetSessionUser.mockReset();
  });

  it("未サインイン: AUTH_REQUIRED は sessionUser=null になる", async () => {
    // 1) 未サインインを返す
    const signedOutResult = ok(null);
    mockedGetSessionUser.mockResolvedValue(signedOutResult);

    // 2) hook 実行
    const { result } = renderHook(() => useSessionUser(), {
      wrapper: createQueryClientWrapper(),
    });

    // 3) query が反映されるまで待つ
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // 4) 未サインイン扱い
    expect(result.current.sessionUser).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it("失敗: UNAVAILABLE は sessionUser=null になり error が入る", async () => {
    // 1) 通信異常を返す
    const unavailableError = buildErrorFields(errorCode.UNAVAILABLE);
    const unavailableResult = err(unavailableError);
    mockedGetSessionUser.mockResolvedValue(unavailableResult);

    // 2) hook 実行
    const { result } = renderHook(() => useSessionUser(), {
      wrapper: createQueryClientWrapper(),
    });

    // 3) query が反映されるまで待つ
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // 4) 未サインイン相当で継続する
    expect(result.current.sessionUser).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.error?.errorCode).toBe(unavailableError.errorCode);
  });

  it("成功: sessionUser が入り isAuthenticated=true になる", async () => {
    // 1) 成功を返す
    const sessionUser = { uid: "u1" };
    const sessionUserResult = ok(sessionUser);
    mockedGetSessionUser.mockResolvedValue(sessionUserResult);

    // 2) hook 実行
    const { result } = renderHook(() => useSessionUser(), {
      wrapper: createQueryClientWrapper(),
    });

    // 3) query が反映されるまで待つ
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // 4) 成功状態の確認
    expect(result.current.sessionUser).toEqual(sessionUser);
    expect(result.current.isAuthenticated).toBe(true);
  });
});
