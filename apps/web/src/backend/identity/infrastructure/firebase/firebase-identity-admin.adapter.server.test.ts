// apps/web/src/backend/identity/infrastructure/firebase/firebase-identity-admin.adapter.server.test.ts
// ================================================================
// 概要:
// - FirebaseIdentityAdminAdapter のユニットテスト
//
// 契約:
// - verifyIdTokenForSensitiveAction
//   - idToken は trim して verifyIdToken(..., true) に渡す
//   - auth_time が number 以外なら authTimeSeconds は null
//   - idToken が空なら VALIDATION_FAILED（SDK未呼び出し）
//   - SDK例外時は mapFirebaseAuthError(..., VERIFY_ID_TOKEN) の結果を返す
// - deleteUser
//   - uid は trim して deleteUser に渡す
//   - uid が空なら VALIDATION_FAILED（SDK未呼び出し）
//   - SDK例外時は mapFirebaseAuthError(..., DELETE_USER) の結果を返す
// ================================================================

import {
  buildErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import type { DecodedIdToken } from "firebase-admin/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminAuth } from "@/backend/identity/infrastructure/firebase/admin.server";
import {
  expectErrCode,
  expectOkValue,
} from "@/tests/vitest-utils/utils/result-assertions";
import { mapFirebaseAuthError } from "./firebase-auth-error.mapper.server";
import { createFirebaseIdentityAdminPort } from "./firebase-identity-admin.adapter.server";

function createDecodedIdToken(
  overrides: Partial<DecodedIdToken> = {},
): DecodedIdToken {
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const uid = overrides.uid ?? "uid_1";
  return {
    aud: "test-project",
    auth_time: nowInSeconds,
    exp: nowInSeconds + 60 * 60,
    firebase: {
      identities: {},
      sign_in_provider: "custom",
    },
    iat: nowInSeconds,
    iss: "https://securetoken.google.com/test-project",
    sub: uid,
    uid,
    email_verified: true,
    ...overrides,
  };
}

vi.mock("@/backend/identity/infrastructure/firebase/admin.server", () => {
  return {
    adminAuth: {
      verifyIdToken: vi.fn(),
      deleteUser: vi.fn(),
    },
  };
});

vi.mock(
  "@/backend/identity/infrastructure/firebase/firebase-auth-error.mapper.server",
  async () => {
    const actual = await vi.importActual<
      typeof import("./firebase-auth-error.mapper.server")
    >("./firebase-auth-error.mapper.server");
    return {
      ...actual,
      mapFirebaseAuthError: vi.fn(),
    };
  },
);

describe("createFirebaseIdentityAdminPort", () => {
  const identityAdminPort = createFirebaseIdentityAdminPort();
  const mockedVerifyIdToken = vi.mocked(adminAuth.verifyIdToken);
  const mockedDeleteUser = vi.mocked(adminAuth.deleteUser);
  const mockedMapFirebaseAuthError = vi.mocked(mapFirebaseAuthError);

  beforeEach(() => {
    mockedVerifyIdToken.mockReset();
    mockedDeleteUser.mockReset();
    mockedMapFirebaseAuthError.mockReset();
  });

  it("verifyIdTokenForSensitiveAction: idToken は trim して verifyIdToken(..., true) に渡す", async () => {
    const idToken = "id_token";
    const expectedUid = "uid_1";
    const expectedAuthTime = 1700000000;

    mockedVerifyIdToken.mockResolvedValueOnce(
      createDecodedIdToken({
        uid: expectedUid,
        auth_time: expectedAuthTime,
      }),
    );

    const result = await identityAdminPort.verifyIdTokenForSensitiveAction({
      idToken: ` ${idToken} `,
    });

    expect(mockedVerifyIdToken).toHaveBeenCalledTimes(1);
    expect(mockedVerifyIdToken).toHaveBeenCalledWith(idToken, true);
    expectOkValue(result, {
      uid: expectedUid,
      authTimeSeconds: expectedAuthTime,
    });
  });

  it("verifyIdTokenForSensitiveAction: idToken が空なら VALIDATION_FAILED（SDK未呼び出し）", async () => {
    const result = await identityAdminPort.verifyIdTokenForSensitiveAction({
      idToken: "   ",
    });

    expect(mockedVerifyIdToken).toHaveBeenCalledTimes(0);
    expect(mockedMapFirebaseAuthError).toHaveBeenCalledTimes(0);
    expectErrCode(result, errorCode.VALIDATION_FAILED, {
      shouldClearSessionCookie: false,
    });
  });

  it("verifyIdTokenForSensitiveAction: auth_time が number 以外なら authTimeSeconds は null", async () => {
    const expectedUid = "uid_1";
    const decodedIdToken: DecodedIdToken = {
      ...createDecodedIdToken({ uid: expectedUid }),
      // @ts-expect-error テストで不正値を注入して分岐を検証する
      auth_time: "not_a_number",
    };

    mockedVerifyIdToken.mockResolvedValueOnce(decodedIdToken);

    const result = await identityAdminPort.verifyIdTokenForSensitiveAction({
      idToken: "id_token",
    });

    expectOkValue(result, {
      uid: expectedUid,
      authTimeSeconds: null,
    });
  });

  it("verifyIdTokenForSensitiveAction: email があり email_verified=false の場合は ACCESS_DENIED で拒否する", async () => {
    mockedVerifyIdToken.mockResolvedValueOnce(
      createDecodedIdToken({
        email: "user@example.com",
        email_verified: false,
      }),
    );

    const result = await identityAdminPort.verifyIdTokenForSensitiveAction({
      idToken: "id_token",
    });

    expect(mockedMapFirebaseAuthError).toHaveBeenCalledTimes(0);
    expectErrCode(result, errorCode.ACCESS_DENIED, {
      shouldClearSessionCookie: false,
    });
  });

  it("verifyIdTokenForSensitiveAction: SDK例外時は mapper の結果を返す", async () => {
    const sdkError = new Error("verify failed");
    mockedVerifyIdToken.mockRejectedValueOnce(sdkError);
    mockedMapFirebaseAuthError.mockReturnValueOnce({
      error: buildErrorFields(errorCode.AUTH_INVALID),
      shouldClearSessionCookie: true,
      firebaseAuthCode: "auth/invalid-id-token",
    });

    const result = await identityAdminPort.verifyIdTokenForSensitiveAction({
      idToken: "id_token",
    });

    expect(mockedMapFirebaseAuthError).toHaveBeenCalledTimes(1);
    expectErrCode(result, errorCode.AUTH_INVALID, {
      shouldClearSessionCookie: true,
    });
  });

  it("deleteUser: uid は trim して deleteUser に渡す", async () => {
    const uid = "uid_1";
    mockedDeleteUser.mockResolvedValueOnce(undefined);

    const result = await identityAdminPort.deleteUser({
      uid: ` ${uid} `,
    });

    expect(mockedDeleteUser).toHaveBeenCalledTimes(1);
    expect(mockedDeleteUser).toHaveBeenCalledWith(uid);
    expectOkValue(result, null);
  });

  it("deleteUser: uid が空なら VALIDATION_FAILED（SDK未呼び出し）", async () => {
    const result = await identityAdminPort.deleteUser({
      uid: "   ",
    });

    expect(mockedDeleteUser).toHaveBeenCalledTimes(0);
    expect(mockedMapFirebaseAuthError).toHaveBeenCalledTimes(0);
    expectErrCode(result, errorCode.VALIDATION_FAILED, {
      shouldClearSessionCookie: false,
    });
  });

  it("deleteUser: SDK例外時は mapper の結果を返す", async () => {
    const sdkError = new Error("delete failed");
    mockedDeleteUser.mockRejectedValueOnce(sdkError);
    mockedMapFirebaseAuthError.mockReturnValueOnce({
      error: buildErrorFields(errorCode.AUTH_INVALID),
      shouldClearSessionCookie: true,
      firebaseAuthCode: "auth/user-not-found",
    });

    const result = await identityAdminPort.deleteUser({
      uid: "uid_1",
    });

    expect(mockedMapFirebaseAuthError).toHaveBeenCalledTimes(1);
    expectErrCode(result, errorCode.AUTH_INVALID, {
      shouldClearSessionCookie: true,
    });
  });
});
