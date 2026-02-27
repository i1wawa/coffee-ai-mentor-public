// apps/web/src/backend/identity/applications/delete-user-me.usecase.server.ts
// ================================================================
// 概要
// - 自分のアカウント削除 usecase（cookie認証）
//
// 責務
// 1) session cookie を検証して uid を確定する
// 2) recent login 判定（authTime）を満たす場合のみ deleteUser を呼ぶ
// ================================================================

import "server-only";

import {
  buildErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { err, ok, type Result } from "@packages/shared/src/result";
import type { IdentityAdminPort } from "@/backend/identity/applications/identity-admin.port";
import type {
  SessionAuthError,
  SessionAuthPort,
} from "@/backend/identity/applications/session-auth.port";

export type DeleteUserMeDeps = {
  sessionAuth: Pick<SessionAuthPort, "verifySessionUser">;
  identityAdmin: Pick<IdentityAdminPort, "deleteUser">;
  clock: {
    nowMs: () => number;
  };
};

export type DeleteUserMeInput = {
  sessionCookieValue: string;
  recentAuthMaxAgeMs: number;
};

export type DeleteUserMeOutput = {
  uid: string;
};

/**
 * 自分のアカウントを削除する（cookie認証）。
 */
export async function deleteUserMe(
  deps: DeleteUserMeDeps,
  input: DeleteUserMeInput,
): Promise<Result<DeleteUserMeOutput, SessionAuthError>> {
  // 1) 入力の前処理
  const sessionCookieValue = input.sessionCookieValue.trim();
  const recentAuthMaxAgeMs = input.recentAuthMaxAgeMs;

  // 2) cookie が空なら認証が必要
  if (!sessionCookieValue) {
    return err({
      ...buildErrorFields(errorCode.AUTH_REQUIRED),
      shouldClearSessionCookie: false,
    });
  }

  // 3) recentAuthMaxAgeMs が壊れている場合は内部エラー扱い
  if (!Number.isFinite(recentAuthMaxAgeMs) || recentAuthMaxAgeMs <= 0) {
    return err({
      ...buildErrorFields(errorCode.INTERNAL_ERROR),
      shouldClearSessionCookie: false,
    });
  }

  // 4) session cookie を検証して uid と authTime を得る
  const verified = await deps.sessionAuth.verifySessionUser({
    sessionCookieValue,
  });
  if (!verified.ok) return verified;

  const uid = verified.value.uid;
  const authTimeSeconds = verified.value.authTimeSeconds;
  if (typeof authTimeSeconds !== "number") {
    return err({
      ...buildErrorFields(errorCode.PRECONDITION_FAILED),
      shouldClearSessionCookie: false,
    });
  }

  // 5) recent login 判定
  const authTimeMs = authTimeSeconds * 1000;
  const nowMs = deps.clock.nowMs();
  if (nowMs - authTimeMs > recentAuthMaxAgeMs) {
    return err({
      ...buildErrorFields(errorCode.PRECONDITION_FAILED),
      shouldClearSessionCookie: false,
    });
  }

  // 6) ユーザーを削除する
  const deleted = await deps.identityAdmin.deleteUser({ uid });
  if (!deleted.ok) return deleted;

  // 7) 成功
  return ok({ uid });
}
