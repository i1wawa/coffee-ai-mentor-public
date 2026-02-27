// apps/web/src/frontend/features/auth/model/reauthenticate-with-popup-and-issue-session-cookie.ts
// ================================================================
// 概要:
// - 危険操作の前提条件（recent login）を満たすために、再認証して session cookie を再発行する
//
// 責務:
// - Popupサインインで idToken を取り直す
// - POST /api/auth/session で session cookie を再発行する
// ================================================================

import "client-only";

import { err, ok, type Result } from "@packages/shared/src/result";
import type { AuthProvider } from "firebase/auth";
import { exchangeIdTokenForSessionCookie } from "@/frontend/entities/session/api/exchange-id-token-for-session-cookie";
import type { TelemetryErrorFields } from "@/frontend/shared/errors/telemetry-error-result";
import { signInWithPopupAndGetIdToken } from "@/frontend/shared/firebase/firebase-auth";

/**
 * 再認証して session cookie を再発行する
 */
export async function reauthenticateWithPopupAndIssueSessionCookie(args: {
  provider: AuthProvider;
}): Promise<Result<void, TelemetryErrorFields>> {
  // 1) Popupサインインで idToken を取り直す
  const signedIn = await signInWithPopupAndGetIdToken({
    provider: args.provider,
  });
  if (!signedIn.ok) return err(signedIn.error);

  // 2) session cookie を再発行する
  const exchanged = await exchangeIdTokenForSessionCookie({
    idToken: signedIn.value.idToken,
  });
  if (!exchanged.ok) return err(exchanged.error);

  return ok(undefined);
}
