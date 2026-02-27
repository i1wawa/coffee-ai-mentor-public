// apps/web/src/backend/identity/applications/revoke-auth-session.usecase.server.ts
// ================================================================
// 概要:
// - セキュリティ用サインアウト（全端末サインアウト / 盗難疑い）usecase
//
// 責務:
// 1) session cookie を検証して uid を得る
// 2) uid を使って refresh tokens を revoke する
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
} from "@/backend/identity/applications/session-auth.port";

// ---------------------------------------------------------------
// 依存
// ---------------------------------------------------------------

export type RevokeAuthSessionDeps = {
  sessionAuth: Pick<
    SessionAuthPort,
    "verifySessionUser" | "revokeRefreshTokens"
  >;
};

// ---------------------------------------------------------------
// 入力
// ---------------------------------------------------------------

export type RevokeAuthSessionInput = {
  sessionCookieValue: string;
};

// ---------------------------------------------------------------
// 出力
// - uid は HTTP レスポンスには出さない
// - 観測（userHash 算出）などのために戻す
// ---------------------------------------------------------------

export type RevokeAuthSessionOutput = {
  uid: string;
};

/**
 * セッションを取り消し、全端末サインアウトを実行する。
 */
export async function revokeAuthSession(
  deps: RevokeAuthSessionDeps,
  input: RevokeAuthSessionInput,
): Promise<Result<RevokeAuthSessionOutput, SessionAuthError>> {
  // 1) 入力の前処理
  const sessionCookieValue = input.sessionCookieValue.trim();

  // 2) 空なら認証が必要
  // - revoke は uid を特定できないと実行できない
  if (!sessionCookieValue) {
    return err({
      ...buildErrorFields(errorCode.AUTH_REQUIRED),
      shouldClearSessionCookie: false,
    });
  }

  // 3) まず session cookie を検証する
  // - checkRevoked=true の挙動は adapter に閉じ込める
  const verified = await deps.sessionAuth.verifySessionUser({
    sessionCookieValue,
  });

  // 4) 検証に失敗したらそのまま返す
  if (!verified.ok) return verified;

  // 5) uid を取り出す
  // - 値そのものはログに出さない
  const uid = verified.value.uid;

  // 6) refresh tokens を revoke する
  // - 全端末サインアウトとして効く
  const revoked = await deps.sessionAuth.revokeRefreshTokens({ uid });

  // 7) revoke に失敗したらそのまま返す
  if (!revoked.ok) return revoked;

  // 8) 成功
  return ok({ uid });
}
