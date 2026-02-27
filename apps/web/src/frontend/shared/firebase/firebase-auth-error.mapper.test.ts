// apps/web/src/frontend/shared/firebase/firebase-auth-error.mapper.test.ts
// ================================================================
// 概要:
// - firebase-auth-error.mapper のユニットテスト
//
// 契約（固定する仕様）:
// - auth/* の代表的なコードは errorCode に分類される
// - code が無い / auth/* でない場合は INTERNAL_ERROR
// - 未知の auth/* は安全側（UNAVAILABLE）
// - 調査用メタ（sdk: provider/code/name/operation）と cause を同梱する
// ================================================================

import { errorCode } from "@packages/observability/src/logging/telemetry-error-common";
import { describe, expect, it } from "vitest";
import { TELEMETRY_OPERATION } from "@/frontend/shared/observability/telemetry-tags";
import { mapFirebaseAuthErrorToModelError } from "./firebase-auth-error.mapper";

describe("mapFirebaseAuthErrorToModelError", () => {
  it("code が無い場合は INTERNAL_ERROR（provider は unknown）", () => {
    const cause = new Error("boom");
    const mapped = mapFirebaseAuthErrorToModelError(
      cause,
      TELEMETRY_OPERATION.SIGN_IN_WITH_POPUP,
    );

    expect(mapped.errorCode).toBe(errorCode.INTERNAL_ERROR);
    expect(mapped.errorId).toEqual(expect.stringMatching(/.+/));
    expect(mapped.cause).toBe(cause);
    expect(mapped.sdk).toEqual({
      provider: "unknown",
      code: undefined,
      name: "Error",
      operation: TELEMETRY_OPERATION.SIGN_IN_WITH_POPUP,
    });
  });

  it("auth/* でない code は INTERNAL_ERROR（provider は unknown）", () => {
    const cause = { code: "firestore/permission-denied", name: "X" };
    const mapped = mapFirebaseAuthErrorToModelError(
      cause,
      TELEMETRY_OPERATION.SIGN_IN_WITH_POPUP,
    );

    expect(mapped.errorCode).toBe(errorCode.INTERNAL_ERROR);
    expect(mapped.cause).toBe(cause);
    expect(mapped.sdk?.provider).toBe("unknown");
    expect(mapped.sdk?.code).toBe("firestore/permission-denied");
    expect(mapped.sdk?.operation).toBe(TELEMETRY_OPERATION.SIGN_IN_WITH_POPUP);
  });

  const cases: Array<{
    title: string;
    code: string;
    expectedErrorCode: (typeof errorCode)[keyof typeof errorCode];
  }> = [
    {
      title: "CANCELLED",
      code: "auth/popup-closed-by-user",
      expectedErrorCode: errorCode.CANCELLED,
    },
    {
      title: "PRECONDITION_FAILED",
      code: "auth/popup-blocked",
      expectedErrorCode: errorCode.PRECONDITION_FAILED,
    },
    {
      title: "UNAVAILABLE（ネットワーク一時障害）",
      code: "auth/network-request-failed",
      expectedErrorCode: errorCode.UNAVAILABLE,
    },
    {
      title: "DEADLINE_EXCEEDED",
      code: "auth/timeout",
      expectedErrorCode: errorCode.DEADLINE_EXCEEDED,
    },
    {
      title: "RATE_LIMITED",
      code: "auth/too-many-requests",
      expectedErrorCode: errorCode.RATE_LIMITED,
    },
    {
      title: "QUOTA_EXCEEDED",
      code: "auth/quota-exceeded",
      expectedErrorCode: errorCode.QUOTA_EXCEEDED,
    },
    {
      title: "RESOURCE_CONFLICT",
      code: "auth/account-exists-with-different-credential",
      expectedErrorCode: errorCode.RESOURCE_CONFLICT,
    },
    {
      title: "AUTH_INVALID",
      code: "auth/invalid-credential",
      expectedErrorCode: errorCode.AUTH_INVALID,
    },
    {
      title: "ACCESS_DENIED",
      code: "auth/user-disabled",
      expectedErrorCode: errorCode.ACCESS_DENIED,
    },
    {
      title: "VALIDATION_FAILED",
      code: "auth/invalid-argument",
      expectedErrorCode: errorCode.VALIDATION_FAILED,
    },
    {
      title: "未知の auth/* は UNAVAILABLE",
      code: "auth/something-new",
      expectedErrorCode: errorCode.UNAVAILABLE,
    },
  ];

  it.each(cases)("$title", ({ code, expectedErrorCode }) => {
    const cause = {
      code,
      name: "FirebaseError",
      message: "boom",
    };

    const mapped = mapFirebaseAuthErrorToModelError(
      cause,
      TELEMETRY_OPERATION.SIGN_IN_WITH_POPUP,
    );

    expect(mapped.errorCode).toBe(expectedErrorCode);
    expect(mapped.errorId).toEqual(expect.stringMatching(/.+/));
    expect(mapped.cause).toBe(cause);
    expect(mapped.sdk).toEqual({
      provider: "firebase_auth",
      code,
      name: "FirebaseError",
      operation: TELEMETRY_OPERATION.SIGN_IN_WITH_POPUP,
    });
  });

  it("SIGN_OUT: auth/user-signed-out は CANCELLED（冪等扱い）", () => {
    const cause = {
      code: "auth/user-signed-out",
      name: "FirebaseError",
      message: "boom",
    };

    const mapped = mapFirebaseAuthErrorToModelError(
      cause,
      TELEMETRY_OPERATION.SIGN_OUT,
    );

    expect(mapped.errorCode).toBe(errorCode.CANCELLED);
    expect(mapped.errorId).toEqual(expect.stringMatching(/.+/));
    expect(mapped.cause).toBe(cause);
    expect(mapped.sdk).toEqual({
      provider: "firebase_auth",
      code: "auth/user-signed-out",
      name: "FirebaseError",
      operation: TELEMETRY_OPERATION.SIGN_OUT,
    });
  });
});
