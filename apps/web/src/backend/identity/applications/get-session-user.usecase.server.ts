// apps/web/src/backend/identity/applications/get-session-user.usecase.server.ts
// ================================================================
// 概要:
// - セッション cookie からユーザー（uid 等）を取得する usecase
//
// 責務:
// - session cookie を前処理し、空なら AUTH_REQUIRED を返す
// - SessionAuthPort.verifySessionUser を呼び、結果を透過して返す
// ================================================================

import "server-only";

import {
  buildErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { err, ok, type Result } from "@packages/shared/src/result";
import type {
  SessionAuthError,
  SessionAuthPort,
  SessionUser,
} from "@/backend/identity/applications/session-auth.port";

export type GetSessionUserDeps = {
  sessionAuth: Pick<SessionAuthPort, "verifySessionUser">;
};

export type GetSessionUserInput = {
  sessionCookieValue: string;
};

/**
 * セッション cookie からユーザー情報を取得する
 */
export async function getSessionUser(
  deps: GetSessionUserDeps,
  input: GetSessionUserInput,
): Promise<Result<SessionUser, SessionAuthError>> {
  // 1) 入力の前処理
  // - usecase は外部入力をそのまま信用しない
  const sessionCookieValue = input.sessionCookieValue.trim();

  // 2) 空なら認証が必要
  // - ここで AUTH_REQUIRED を返すと、呼び出し側は 401 を作りやすい
  // - shouldClearSessionCookie は false
  if (!sessionCookieValue) {
    return err({
      ...buildErrorFields(errorCode.AUTH_REQUIRED),
      shouldClearSessionCookie: false,
    });
  }

  // 3) port を呼ぶ
  // - 具体的に Firebase を呼ぶのは adapter
  const result = await deps.sessionAuth.verifySessionUser({
    sessionCookieValue,
  });

  // 4) そのまま返す
  // - usecase はここで HTTP レスポンスを作らない
  // - cookie削除 Set-Cookie も作らない
  if (!result.ok) return result;

  return ok(result.value);
}
