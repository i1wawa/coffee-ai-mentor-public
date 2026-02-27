// apps/web/src/frontend/features/auth/model/sign-out.test.ts
// ========================================================
// 概要:
// - sign-out（model）のユニットテスト
//
// 契約:
// - API が失敗したらその err を返し、Firebase を呼ばない
// - Firebase が失敗しても ok を返し、観測へ送る
// - API と Firebase が成功したら ok を返し、観測へ送らない
// - revokeSession も同様の契約
// ========================================================

import {
  buildErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { err, ok } from "@packages/shared/src/result";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { revokeSession } from "@/frontend/features/auth/api/revoke-session";
import { signOut } from "@/frontend/features/auth/api/sign-out";
import { toUiErrorFields } from "@/frontend/shared/errors/error-ui-action.mapper";
import { signOutFirebase } from "@/frontend/shared/firebase/firebase-auth";
import { captureErrorToSentry } from "@/frontend/shared/observability/sentry.client";
import { TELEMETRY_OPERATION } from "@/frontend/shared/observability/telemetry-tags";
import {
  expectOkValue,
  expectUiErrCode,
} from "@/tests/vitest-utils/utils/result-assertions";
import {
  revokeSessionAndClearClientState,
  signOutAndClearClientState,
} from "./sign-out";

vi.mock("../api/sign-out", () => {
  return {
    signOut: vi.fn(),
  };
});

vi.mock("../api/revoke-session", () => {
  return {
    revokeSession: vi.fn(),
  };
});

vi.mock("@/frontend/shared/firebase/firebase-auth", () => {
  return {
    signOutFirebase: vi.fn(),
  };
});

vi.mock("@/frontend/shared/observability/sentry.client", () => {
  return {
    captureErrorToSentry: vi.fn(),
  };
});

describe("features/auth/model sign-out", () => {
  const mockedSignOut = vi.mocked(signOut);
  const mockedRevokeSession = vi.mocked(revokeSession);
  const mockedSignOutFirebase = vi.mocked(signOutFirebase);
  const mockedCaptureErrorToSentry = vi.mocked(captureErrorToSentry);

  beforeEach(() => {
    // 1) テスト間の干渉を防ぐ
    mockedSignOut.mockReset();
    mockedRevokeSession.mockReset();
    mockedSignOutFirebase.mockReset();
    mockedCaptureErrorToSentry.mockReset();
  });

  it("signOut: API が失敗したらその err を返し、Firebase を呼ばない", async () => {
    // 1) arrange: API 失敗を作る
    const apiError = buildErrorFields(errorCode.UNAVAILABLE);
    mockedSignOut.mockResolvedValue(err(apiError));

    // 2) act: 実行する
    const result = await signOutAndClearClientState();

    // 3) assert: err になる
    expectUiErrCode(
      result,
      apiError.errorCode,
      toUiErrorFields(apiError).uiErrorAction,
    );

    // 4) assert: Firebase は呼ばれない
    expect(mockedSignOutFirebase).toHaveBeenCalledTimes(0);
  });

  it("signOut: Firebase が失敗しても ok を返し、観測へ送る", async () => {
    // 1) arrange: API 成功
    mockedSignOut.mockResolvedValue(ok(undefined));

    // 2) arrange: Firebase 失敗（INTERNAL_ERROR は観測対象）
    const firebaseError = buildErrorFields(errorCode.INTERNAL_ERROR);
    mockedSignOutFirebase.mockResolvedValue(err(firebaseError));

    // 3) act: 実行する
    const result = await signOutAndClearClientState();

    // 4) assert: ok になる
    expectOkValue(result, undefined);

    // 5) assert: 観測へ送る
    expect(mockedCaptureErrorToSentry).toHaveBeenCalledTimes(1);
    expect(mockedCaptureErrorToSentry).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: TELEMETRY_OPERATION.SIGN_OUT,
        layer: "sdk",
        error: firebaseError,
      }),
    );
  });

  it("signOut: API と Firebase が成功したら ok を返し、観測へ送らない", async () => {
    // 1) arrange: API 成功
    mockedSignOut.mockResolvedValue(ok(undefined));

    // 2) arrange: Firebase 成功
    mockedSignOutFirebase.mockResolvedValue(ok(undefined));

    // 3) act: 実行する
    const result = await signOutAndClearClientState();

    // 4) assert: ok になる
    expectOkValue(result, undefined);

    // 5) assert: 観測へ送らない
    expect(mockedCaptureErrorToSentry).toHaveBeenCalledTimes(0);
  });

  it("revokeSession: API が失敗したらその err を返し、Firebase を呼ばない", async () => {
    // 1) arrange: revoke 失敗を作る
    const apiError = buildErrorFields(errorCode.UNAVAILABLE);
    mockedRevokeSession.mockResolvedValue(err(apiError));

    // 2) act: 実行する
    const result = await revokeSessionAndClearClientState();

    // 3) assert: err になる
    expectUiErrCode(
      result,
      apiError.errorCode,
      toUiErrorFields(apiError).uiErrorAction,
    );

    // 4) assert: Firebase は呼ばれない
    expect(mockedSignOutFirebase).toHaveBeenCalledTimes(0);
  });

  it("revokeSession: Firebase が失敗しても ok を返し、観測へ送る", async () => {
    // 1) arrange: revoke 成功
    mockedRevokeSession.mockResolvedValue(ok(undefined));

    // 2) arrange: Firebase 失敗（INTERNAL_ERROR は観測対象）
    const firebaseError = buildErrorFields(errorCode.INTERNAL_ERROR);
    mockedSignOutFirebase.mockResolvedValue(err(firebaseError));

    // 3) act: 実行する
    const result = await revokeSessionAndClearClientState();

    // 4) assert: ok になる
    expectOkValue(result, undefined);

    // 5) assert: 観測へ送る
    expect(mockedCaptureErrorToSentry).toHaveBeenCalledTimes(1);
    expect(mockedCaptureErrorToSentry).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: TELEMETRY_OPERATION.REVOKE_SESSION,
        layer: "sdk",
        error: firebaseError,
      }),
    );
  });

  it("revokeSession: API と Firebase が成功したら ok を返し、観測へ送らない", async () => {
    // 1) arrange: revoke 成功
    mockedRevokeSession.mockResolvedValue(ok(undefined));

    // 2) arrange: Firebase 成功
    mockedSignOutFirebase.mockResolvedValue(ok(undefined));

    // 3) act: 実行する
    const result = await revokeSessionAndClearClientState();

    // 4) assert: ok になる
    expectOkValue(result, undefined);

    // 5) assert: 観測へ送らない
    expect(mockedCaptureErrorToSentry).toHaveBeenCalledTimes(0);
  });
});
