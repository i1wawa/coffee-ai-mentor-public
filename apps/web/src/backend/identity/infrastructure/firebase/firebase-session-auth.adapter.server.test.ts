// apps/web/src/backend/identity/infrastructure/firebase/firebase-session-auth.adapter.server.test.ts
// ================================================================
// 概要:
// - FirebaseSessionAuthAdapter のユニットテスト
//
// 契約:
// - verifySessionUser
//   - sessionCookieValue は trim して verifySessionCookie(..., true) に渡す
//   - sessionCookieValue が空なら AUTH_REQUIRED（SDK未呼び出し）
//   - SDK例外時は mapFirebaseAuthError(..., VERIFY_SESSION_COOKIE) の結果を返す
// - issueSessionCookie
//   - idToken は trim して verifyIdToken -> createSessionCookie の順で処理する
//   - idToken が空、または expiresInMs が不正なら VALIDATION_FAILED（SDK未呼び出し）
//   - verify/create の SDK例外時は mapper 結果を使うが shouldClearSessionCookie は false 固定
// - revokeRefreshTokens
//   - uid は trim して revokeRefreshTokens に渡す
//   - uid が空なら VALIDATION_FAILED（SDK未呼び出し）
//   - SDK例外時は mapFirebaseAuthError(..., REVOKE_REFRESH_TOKENS) の結果を返す
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
import { createFirebaseSessionAuthPort } from "./firebase-session-auth.adapter.server";

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
      verifySessionCookie: vi.fn(),
      verifyIdToken: vi.fn(),
      createSessionCookie: vi.fn(),
      revokeRefreshTokens: vi.fn(),
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

describe("createFirebaseSessionAuthPort", () => {
  const sessionAuthPort = createFirebaseSessionAuthPort();
  const mockedVerifySessionCookie = vi.mocked(adminAuth.verifySessionCookie);
  const mockedVerifyIdToken = vi.mocked(adminAuth.verifyIdToken);
  const mockedCreateSessionCookie = vi.mocked(adminAuth.createSessionCookie);
  const mockedRevokeRefreshTokens = vi.mocked(adminAuth.revokeRefreshTokens);
  const mockedMapFirebaseAuthError = vi.mocked(mapFirebaseAuthError);

  beforeEach(() => {
    mockedVerifySessionCookie.mockReset();
    mockedVerifyIdToken.mockReset();
    mockedCreateSessionCookie.mockReset();
    mockedRevokeRefreshTokens.mockReset();
    mockedMapFirebaseAuthError.mockReset();
  });

  describe("verifySessionUser", () => {
    it("sessionCookieValue は trim して verifySessionCookie(..., true) に渡す", async () => {
      const sessionCookieValue = "session_cookie";

      mockedVerifySessionCookie.mockResolvedValueOnce(createDecodedIdToken());

      const result = await sessionAuthPort.verifySessionUser({
        sessionCookieValue: ` ${sessionCookieValue} `,
      });

      expect(mockedVerifySessionCookie).toHaveBeenCalledTimes(1);
      expect(mockedVerifySessionCookie).toHaveBeenCalledWith(
        sessionCookieValue,
        true,
      );
      expect(result.ok).toBe(true);
    });

    it("sessionCookieValue が空なら AUTH_REQUIRED（SDK未呼び出し）", async () => {
      const result = await sessionAuthPort.verifySessionUser({
        sessionCookieValue: "   ",
      });

      expect(mockedVerifySessionCookie).toHaveBeenCalledTimes(0);
      expect(mockedMapFirebaseAuthError).toHaveBeenCalledTimes(0);
      expectErrCode(result, errorCode.AUTH_REQUIRED, {
        shouldClearSessionCookie: false,
      });
    });

    it("email が無い場合は email: null で返す", async () => {
      const expectedUid = "uid_1";
      const expectedAuthTimeSeconds = 1_700_000_001;

      mockedVerifySessionCookie.mockResolvedValueOnce(
        createDecodedIdToken({
          uid: expectedUid,
          auth_time: expectedAuthTimeSeconds,
        }),
      );

      const result = await sessionAuthPort.verifySessionUser({
        sessionCookieValue: "session_cookie",
      });

      expectOkValue(result, {
        uid: expectedUid,
        email: null,
        authTimeSeconds: expectedAuthTimeSeconds,
      });
    });

    it("email があり email_verified=false の場合は ACCESS_DENIED で拒否する", async () => {
      mockedVerifySessionCookie.mockResolvedValueOnce(
        createDecodedIdToken({
          email: "user@example.com",
          email_verified: false,
        }),
      );

      const result = await sessionAuthPort.verifySessionUser({
        sessionCookieValue: "session_cookie",
      });

      expect(mockedMapFirebaseAuthError).toHaveBeenCalledTimes(0);
      expectErrCode(result, errorCode.ACCESS_DENIED, {
        shouldClearSessionCookie: true,
      });
    });

    it("SDK例外時は mapper の結果を返す", async () => {
      const sdkError = new Error("verify session failed");
      const expectedMappedErrorCode = errorCode.AUTH_INVALID;
      const expectedShouldClearFlag = true;

      mockedVerifySessionCookie.mockRejectedValueOnce(sdkError);
      mockedMapFirebaseAuthError.mockReturnValueOnce({
        error: buildErrorFields(expectedMappedErrorCode),
        shouldClearSessionCookie: expectedShouldClearFlag,
        firebaseAuthCode: "auth/session-cookie-revoked",
      });

      const result = await sessionAuthPort.verifySessionUser({
        sessionCookieValue: "session_cookie",
      });

      expect(mockedMapFirebaseAuthError).toHaveBeenCalledTimes(1);
      expectErrCode(result, expectedMappedErrorCode, {
        shouldClearSessionCookie: expectedShouldClearFlag,
      });
    });

    it("成功時は SessionUser を返す", async () => {
      const decodedData = createDecodedIdToken({
        uid: "uid_123",
        email: "user@example.com",
        auth_time: 1700000000,
      });

      mockedVerifySessionCookie.mockResolvedValueOnce(decodedData);

      const result = await sessionAuthPort.verifySessionUser({
        sessionCookieValue: "session_cookie",
      });

      expectOkValue(result, {
        uid: decodedData.uid,
        email: decodedData.email,
        authTimeSeconds: decodedData.auth_time,
      });
    });
  });

  describe("issueSessionCookie", () => {
    it("idToken は trim して verifyIdToken/createSessionCookie に渡す", async () => {
      const idToken = "id_token";

      mockedVerifyIdToken.mockResolvedValueOnce(createDecodedIdToken());
      mockedCreateSessionCookie.mockResolvedValueOnce("session_cookie");

      const expectedInMs = 60_000;
      const result = await sessionAuthPort.issueSessionCookie({
        idToken: ` ${idToken} `,
        expiresInMs: expectedInMs,
      });

      expect(mockedVerifyIdToken).toHaveBeenCalledTimes(1);
      expect(mockedVerifyIdToken).toHaveBeenCalledWith(idToken);
      expect(mockedCreateSessionCookie).toHaveBeenCalledTimes(1);
      expect(mockedCreateSessionCookie).toHaveBeenCalledWith(idToken, {
        expiresIn: expectedInMs,
      });
      expect(result.ok).toBe(true);
    });

    it("idToken が空なら VALIDATION_FAILED（SDK未呼び出し）", async () => {
      const result = await sessionAuthPort.issueSessionCookie({
        idToken: "   ",
        expiresInMs: 60_000,
      });

      expect(mockedVerifyIdToken).toHaveBeenCalledTimes(0);
      expect(mockedCreateSessionCookie).toHaveBeenCalledTimes(0);
      expect(mockedMapFirebaseAuthError).toHaveBeenCalledTimes(0);
      expectErrCode(result, errorCode.VALIDATION_FAILED, {
        shouldClearSessionCookie: false,
      });
    });

    it.each([
      0,
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ])("expiresInMs=%s は VALIDATION_FAILED（SDK未呼び出し）", async (expiresInMs) => {
      const result = await sessionAuthPort.issueSessionCookie({
        idToken: "id_token",
        expiresInMs,
      });

      expect(mockedVerifyIdToken).toHaveBeenCalledTimes(0);
      expect(mockedCreateSessionCookie).toHaveBeenCalledTimes(0);
      expect(mockedMapFirebaseAuthError).toHaveBeenCalledTimes(0);
      expectErrCode(result, errorCode.VALIDATION_FAILED, {
        shouldClearSessionCookie: false,
      });
    });

    it("verifyIdToken の SDK例外時は mapper の結果を返し、cookie削除フラグは false 固定", async () => {
      const sdkError = new Error("verify id token failed");
      const expectedMappedErrorCode = errorCode.AUTH_INVALID;

      mockedVerifyIdToken.mockRejectedValueOnce(sdkError);
      mockedMapFirebaseAuthError.mockReturnValueOnce({
        error: buildErrorFields(expectedMappedErrorCode),
        shouldClearSessionCookie: true,
        firebaseAuthCode: "auth/invalid-id-token",
      });

      const result = await sessionAuthPort.issueSessionCookie({
        idToken: "id_token",
        expiresInMs: 60_000,
      });

      expect(mockedMapFirebaseAuthError).toHaveBeenCalledTimes(1);
      expect(mockedCreateSessionCookie).toHaveBeenCalledTimes(0);
      expectErrCode(result, expectedMappedErrorCode, {
        shouldClearSessionCookie: false,
      });
    });

    it("verifyIdToken 成功でも email_verified=false の場合は ACCESS_DENIED で拒否し、cookie を発行しない", async () => {
      mockedVerifyIdToken.mockResolvedValueOnce(
        createDecodedIdToken({
          email: "user@example.com",
          email_verified: false,
        }),
      );

      const result = await sessionAuthPort.issueSessionCookie({
        idToken: "id_token",
        expiresInMs: 60_000,
      });

      expect(mockedCreateSessionCookie).toHaveBeenCalledTimes(0);
      expect(mockedMapFirebaseAuthError).toHaveBeenCalledTimes(0);
      expectErrCode(result, errorCode.ACCESS_DENIED, {
        shouldClearSessionCookie: false,
      });
    });

    it("createSessionCookie の SDK例外時は mapper の結果を返し、cookie削除フラグは false 固定", async () => {
      const sdkError = new Error("create session cookie failed");
      const expectedMappedErrorCode = errorCode.UNAVAILABLE;

      mockedVerifyIdToken.mockResolvedValueOnce(createDecodedIdToken());
      mockedCreateSessionCookie.mockRejectedValueOnce(sdkError);
      mockedMapFirebaseAuthError.mockReturnValueOnce({
        error: buildErrorFields(expectedMappedErrorCode),
        shouldClearSessionCookie: true,
        firebaseAuthCode: "auth/internal-error",
      });

      const result = await sessionAuthPort.issueSessionCookie({
        idToken: "id_token",
        expiresInMs: 60_000,
      });

      expect(mockedMapFirebaseAuthError).toHaveBeenCalledTimes(1);
      expectErrCode(result, expectedMappedErrorCode, {
        shouldClearSessionCookie: false,
      });
    });

    it("成功時は sessionCookieValue を返す", async () => {
      mockedVerifyIdToken.mockResolvedValueOnce(createDecodedIdToken());
      mockedCreateSessionCookie.mockResolvedValueOnce("session_cookie");

      const result = await sessionAuthPort.issueSessionCookie({
        idToken: "id_token",
        expiresInMs: 86_400_000,
      });

      expectOkValue(result, {
        sessionCookieValue: "session_cookie",
      });
    });
  });

  describe("revokeRefreshTokens", () => {
    it("uid は trim して revokeRefreshTokens に渡す", async () => {
      const uid = "uid_1";

      mockedRevokeRefreshTokens.mockResolvedValueOnce(undefined);

      const result = await sessionAuthPort.revokeRefreshTokens({
        uid: ` ${uid} `,
      });

      expect(mockedRevokeRefreshTokens).toHaveBeenCalledTimes(1);
      expect(mockedRevokeRefreshTokens).toHaveBeenCalledWith(uid);
      expect(result.ok).toBe(true);
    });

    it("uid が空なら VALIDATION_FAILED（SDK未呼び出し）", async () => {
      const result = await sessionAuthPort.revokeRefreshTokens({
        uid: "   ",
      });

      expect(mockedRevokeRefreshTokens).toHaveBeenCalledTimes(0);
      expect(mockedMapFirebaseAuthError).toHaveBeenCalledTimes(0);
      expectErrCode(result, errorCode.VALIDATION_FAILED, {
        shouldClearSessionCookie: false,
      });
    });

    it("SDK例外時は mapper の結果を返す", async () => {
      const sdkError = new Error("revoke refresh tokens failed");
      const expectedMappedErrorCode = errorCode.AUTH_INVALID;

      mockedRevokeRefreshTokens.mockRejectedValueOnce(sdkError);
      mockedMapFirebaseAuthError.mockReturnValueOnce({
        error: buildErrorFields(expectedMappedErrorCode),
        shouldClearSessionCookie: true,
        firebaseAuthCode: "auth/user-not-found",
      });

      const result = await sessionAuthPort.revokeRefreshTokens({
        uid: "uid_1",
      });

      expect(mockedMapFirebaseAuthError).toHaveBeenCalledTimes(1);
      expectErrCode(result, expectedMappedErrorCode, {
        shouldClearSessionCookie: true,
      });
    });

    it("成功時は ok(null) を返す", async () => {
      mockedRevokeRefreshTokens.mockResolvedValueOnce(undefined);

      const result = await sessionAuthPort.revokeRefreshTokens({
        uid: "uid_1",
      });

      expectOkValue(result, null);
    });
  });
});
