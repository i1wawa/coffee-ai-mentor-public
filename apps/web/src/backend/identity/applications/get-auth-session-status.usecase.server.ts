// apps/web/src/backend/identity/applications/get-auth-session-status.usecase.server.ts
// ================================================================
// 概要:
// - セッション状態確認 usecase
//
// 責務:
// - cookie の有無や検証結果から、状態確認向けの Result を返す
// ================================================================

import "server-only";

import { errorCode } from "@packages/observability/src/logging/telemetry-error-common";
import { ok, type Result } from "@packages/shared/src/result";
import type {
  SessionAuthError,
  SessionAuthPort,
} from "@/backend/identity/applications/session-auth.port";

export type GetAuthSessionStatusDeps = {
  sessionAuth: Pick<SessionAuthPort, "verifySessionUser">;
};

export type GetAuthSessionStatusInput = {
  sessionCookieValue?: string | null;
};

export type AuthSessionStatus =
  | {
      authenticated: true;
      uid: string;
    }
  | {
      authenticated: false;
      shouldClearSessionCookie: boolean;
    };

/**
 * セッション状態（サインイン済みか）を取得する
 */
export async function getAuthSessionStatus(
  deps: GetAuthSessionStatusDeps,
  input: GetAuthSessionStatusInput,
): Promise<Result<AuthSessionStatus, SessionAuthError>> {
  // 1) 入力の前処理
  // - 未サインインは正常系なので、空でも err にしない
  const sessionCookieValue = (input.sessionCookieValue ?? "").trim();
  if (!sessionCookieValue) {
    return ok({
      authenticated: false,
      shouldClearSessionCookie: false,
    });
  }

  // 2) 検証を呼ぶ
  const verified = await deps.sessionAuth.verifySessionUser({
    sessionCookieValue,
  });
  if (verified.ok) {
    return ok({
      authenticated: true,
      uid: verified.value.uid,
    });
  }

  // 3) 未サインイン相当は ok(false) に寄せる
  // - AUTH_INVALID は cookie削除を促したい
  if (
    verified.error.errorCode === errorCode.AUTH_REQUIRED ||
    verified.error.errorCode === errorCode.AUTH_INVALID
  ) {
    return ok({
      authenticated: false,
      shouldClearSessionCookie: verified.error.shouldClearSessionCookie,
    });
  }

  // 4) それ以外は照会失敗として透過する
  return verified;
}
