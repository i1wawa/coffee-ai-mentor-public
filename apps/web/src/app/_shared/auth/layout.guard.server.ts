// apps/web/src/app/_shared/auth/layout.guard.server.ts
// ================================================================
// 概要:
// - layout.tsx で重複しがちな認証ゲート処理を共通化する
//
// 目的:
// - 各 layout が errorCode 分岐を持たないようにする
// - 認証済み/未認証/想定外エラーの扱いを統一する
//
// 責務:
// - public 領域: 認証済みなら /app に飛ばす
// - protected 領域: 未認証なら /sign-in に飛ばす
// - 想定外エラー: 呼び出し元で共通エラーUIを出すため ErrorFields を返す
// ================================================================

import type { ErrorFields } from "@packages/observability/src/logging/telemetry-error-common";
import { err, ok, type Result } from "@packages/shared/src/result";
import { redirect } from "next/navigation";
import { getSessionUserForUi } from "@/app/_shared/auth/get-session-user.server";

/**
 * public 領域用ゲート
 *
 * 返り値
 * - ok: 未認証なので表示してよい
 * - err: 想定外エラー
 *
 * 副作用
 * - 認証済みなら /app に redirect して戻らない
 */
export async function redirectToAppIfAuthenticated(): Promise<
  Result<void, ErrorFields>
> {
  // 1) セッションユーザーを取得する
  const result = await getSessionUserForUi();

  // 2) 想定外エラーは呼び出し元へ返す
  if (!result.ok) return err(result.error);

  // 3) 認証済みなら /app
  if (result.value !== null) {
    redirect("/app");
  }

  // 4) 未認証なら表示してよい
  return ok(undefined);
}

/**
 * protected 領域用ゲート
 *
 * 返り値
 * - ok({ uid }): 認証OK
 * - err: 想定外エラー
 *
 * 副作用
 * - 未認証なら /sign-in に redirect して戻らない
 */
export async function requireAuthenticatedOrRedirectToSignIn(): Promise<
  Result<{ uid: string }, ErrorFields>
> {
  // 1) セッションユーザーを取得する
  const result = await getSessionUserForUi();

  // 2) 想定外エラーは呼び出し元へ返す
  if (!result.ok) return err(result.error);

  // 3) 未認証なら /sign-in
  if (result.value === null) {
    redirect("/sign-in");
  }

  // 4) 認証OKなら uid を返す
  return ok({ uid: result.value.uid });
}
