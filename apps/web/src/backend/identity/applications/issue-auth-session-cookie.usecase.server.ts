// apps/web/src/backend/identity/applications/issue-auth-session-cookie.usecase.server.ts
// ================================================================
// 概要:
// - ID token からセッション cookie を発行する usecase
//
// 責務:
// - idToken / expiresInMs を前処理・検証する
// - SessionAuthPort.issueSessionCookie を呼び、結果を透過して返す
// - cookie 設定に必要な maxAgeSeconds を算出する
// ================================================================

import "server-only";

import {
  buildErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import type { Result } from "@packages/shared/src/result";
import { err, ok } from "@packages/shared/src/result";
import type {
  SessionAuthError,
  SessionAuthPort,
} from "@/backend/identity/applications/session-auth.port";

export type IssueAuthSessionCookieDeps = {
  sessionAuth: Pick<SessionAuthPort, "issueSessionCookie">;
};

export type IssueAuthSessionCookieInput = {
  idToken: string;
  expiresInMs: number;
};

export type IssueAuthSessionCookieOutput = {
  sessionCookieValue: string;
  maxAgeSeconds: number;
};

/**
 * ID token からセッション cookie を発行する usecase
 * - idToken / expiresInMs を前処理・検証する
 * - SessionAuthPort.issueSessionCookie を呼び、結果を透過して返す
 * - cookie 設定に必要な maxAgeSeconds を算出する
 */
export async function issueAuthSessionCookie(
  deps: IssueAuthSessionCookieDeps,
  input: IssueAuthSessionCookieInput,
): Promise<Result<IssueAuthSessionCookieOutput, SessionAuthError>> {
  // 1) 入力の前処理
  const idToken = input.idToken.trim();
  const expiresInMs = input.expiresInMs;

  // 2) token 空は入力不正
  if (!idToken) {
    return err({
      ...buildErrorFields(errorCode.VALIDATION_FAILED),
      shouldClearSessionCookie: false,
    });
  }

  // 3) expiresIn の基本検証
  // - ここで弾けるとログノイズが減る
  if (!Number.isFinite(expiresInMs) || expiresInMs <= 0) {
    return err({
      ...buildErrorFields(errorCode.VALIDATION_FAILED),
      shouldClearSessionCookie: false,
    });
  }

  // 4) port を呼ぶ
  // - adapter 側で verifyIdToken と createSessionCookie を実行する
  const issued = await deps.sessionAuth.issueSessionCookie({
    idToken,
    expiresInMs,
  });

  // 5) 失敗ならそのまま返す
  // - usecase は HTTP の status を決めない
  if (!issued.ok) return issued;

  // 6) Max-Age を算出する
  // - cookie オプションに使うため、秒に変換する
  // - 小数秒は切り捨てる
  const maxAgeSeconds = Math.floor(expiresInMs / 1000);

  // 7) 結果を返す
  return ok({
    sessionCookieValue: issued.value.sessionCookieValue,
    maxAgeSeconds,
  });
}
