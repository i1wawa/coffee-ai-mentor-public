// apps/web/src/frontend/features/users/model/use-user-me.hook.test.ts
// ================================================================
// 概要:
// - useUserMe hook のユニットテスト（React Query）
//
// 契約:
// - getUserMe が ok のとき userMe を保持し、isAuthenticated=true
// - getUserMe が AUTH_REQUIRED 相当なら未サインイン扱いで userMe=null、isAuthenticated=false
// - それ以外の失敗は未サインイン相当で継続しつつ error を保持する
// ================================================================

import "client-only";

import {
  buildErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { err, ok } from "@packages/shared/src/result";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UI_ERROR_ACTION } from "@/frontend/shared/errors/error-ui-action.mapper";
import { createQueryClientWrapper } from "@/tests/vitest-utils/utils/react-query";
import { getUserMe } from "../api/get-user-me";
import { useUserMe } from "./use-user-me.hook";

vi.mock("../api/get-user-me", () => {
  return {
    getUserMe: vi.fn(),
  };
});

describe("features/users/model useUserMe", () => {
  const mockedGetUserMe = vi.mocked(getUserMe);

  beforeEach(() => {
    // 1) テスト間の干渉を防ぐ
    mockedGetUserMe.mockReset();
  });

  it("失敗: getUserMe が throw しても INTERNAL_ERROR に畳み込んで継続する", async () => {
    // 1) 例外 throw を発生させる
    mockedGetUserMe.mockRejectedValue(new Error("boom"));

    // 2) hook 実行
    const { result } = renderHook(() => useUserMe(), {
      wrapper: createQueryClientWrapper(),
    });

    // 3) 最終状態（INTERNAL_ERROR）になるまで待つ
    await waitFor(() => {
      expect(result.current.error?.errorCode).toBe(errorCode.INTERNAL_ERROR);
    });

    // 4) 未サインイン相当で継続する
    expect(result.current.userMe).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it("未サインイン: AUTH_REQUIRED は userMe=null になり error は保持しない", async () => {
    // 1) 未サインイン相当を返す
    // - hook 内で SIGN_IN に分類されれば ok(null) に畳まれる契約
    mockedGetUserMe.mockResolvedValue(
      err(buildErrorFields(errorCode.AUTH_REQUIRED)),
    );

    // 2) hook 実行
    const { result } = renderHook(() => useUserMe(), {
      wrapper: createQueryClientWrapper(),
    });

    // 3) API が呼ばれるまで待つ（初期値の null と区別するため）
    await waitFor(() => {
      expect(mockedGetUserMe).toHaveBeenCalledTimes(1);
    });

    // 4) 未サインイン扱い
    expect(result.current.userMe).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);

    // 5) SIGN_IN は null に畳む方針なので error は出さない
    // - ここが落ちる場合は、UI_ERROR_ACTION の分類が想定と違う
    expect(result.current.error).toBeNull();
  });

  it("失敗: UNAVAILABLE は userMe=null になり error が入る", async () => {
    // 1) 通信異常を返す
    const unavailableError = buildErrorFields(errorCode.UNAVAILABLE);
    mockedGetUserMe.mockResolvedValue(err(unavailableError));

    // 2) hook 実行
    const { result } = renderHook(() => useUserMe(), {
      wrapper: createQueryClientWrapper(),
    });

    // 3) 最終状態（error）になるまで待つ
    await waitFor(() => {
      expect(result.current.error?.errorCode).toBe(errorCode.UNAVAILABLE);
    });

    // 4) 未サインイン相当で継続する
    expect(result.current.userMe).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.error).toEqual(
      expect.objectContaining({
        errorCode: errorCode.UNAVAILABLE,
        errorId: unavailableError.errorId,
        uiErrorAction: UI_ERROR_ACTION.RETRY,
      }),
    );
  });

  it("成功: userMe が入り isAuthenticated=true になる", async () => {
    // 1) 成功を返す
    mockedGetUserMe.mockResolvedValue(ok({ uid: "u1" }));

    // 2) hook 実行
    const { result } = renderHook(() => useUserMe(), {
      wrapper: createQueryClientWrapper(),
    });

    // 3) 最終状態（uid）になるまで待つ
    await waitFor(() => {
      expect(result.current.userMe?.uid).toBe("u1");
    });

    // 4) 成功状態の確認
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it("refetch: 明示呼び出しで getUserMe を再実行し、最新値に更新する", async () => {
    // 1) 1回目と2回目で返り値を変える
    mockedGetUserMe.mockResolvedValueOnce(ok({ uid: "u1" }));
    mockedGetUserMe.mockResolvedValueOnce(ok({ uid: "u2" }));

    // 2) hook 実行
    const { result } = renderHook(() => useUserMe(), {
      wrapper: createQueryClientWrapper(),
    });

    // 3) 初回取得完了を待つ
    await waitFor(() => {
      expect(result.current.userMe?.uid).toBe("u1");
    });
    expect(mockedGetUserMe).toHaveBeenCalledTimes(1);

    // 4) refetch を呼ぶ
    await act(async () => {
      result.current.refetch();
    });

    // 5) 再取得完了を待つ
    await waitFor(() => {
      expect(result.current.userMe?.uid).toBe("u2");
    });
    expect(mockedGetUserMe).toHaveBeenCalledTimes(2);
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.error).toBeNull();
  });
});
