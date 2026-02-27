// apps/web/src/app/_shared/auth/get-session-user.server.ts
// ================================================================
// 概要:
// - UI（Server Component）向けにセッションユーザー（uid）を取得する。
//
// 責務:
// - Next.js の cookies() から session cookie を読む。
// - 外部入力を正規化し、軽い前処理（空/過長）で弾く。
// - 検証は backend の usecase（getSessionUser）へ委譲し、結果をUI用に整形する。
//
// 契約:
// - 成功: { uid } を返す。
// - 未認証扱い: null を返す（cookie 無し / 過長 / AUTH_REQUIRED / AUTH_INVALID）。
// - それ以外の失敗: ErrorFields を返す。
// ================================================================

import "server-only";

import type { ErrorFields } from "@packages/observability/src/logging/telemetry-error-common";
import { errorCode } from "@packages/observability/src/logging/telemetry-error-common";
import { err, ok, type Result } from "@packages/shared/src/result";
import { cookies } from "next/headers";
import { createIdentityDeps } from "@/backend/composition/identity.composition.server";
import { getSessionUser } from "@/backend/identity/applications/get-session-user.usecase.server";
import { SESSION_COOKIE_NAME } from "@/backend/shared/http/cookies";
import {
  isStringTooLong,
  MAX_SESSION_COOKIE_CHARS,
  parseTrimmedString,
} from "@/backend/shared/http/request.guard.server";

/**
 * セッションユーザーを取得する。
 *
 * AUTH_REQUIRED / AUTH_INVALID は未認証扱いとして null を返す。
 * それ以外のエラーは ErrorFields として返す。
 */
export async function getSessionUserForUi(): Promise<
  Result<{ uid: string } | null, ErrorFields>
> {
  // 1) cookie store を取得する
  // - Next.js 実装差分に備えて await しておく
  const cookieStore = await cookies();

  // 2) session cookie の raw 値を取り出す
  // - cookie が無い場合は undefined になる
  const rawSessionCookieValue = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  // 3) 外部入力を正規化する
  // - undefined や非文字列を空文字へ寄せる
  // - 前後空白を取り除く
  const sessionCookieValue = parseTrimmedString(rawSessionCookieValue);

  // 4) 異常に長い cookie は未認証扱い
  // - 目的: SDK に渡す前に落とす（DoS/無駄な例外ログ抑制）
  if (isStringTooLong(sessionCookieValue, MAX_SESSION_COOKIE_CHARS)) {
    // エラーではないので null を返す
    return ok(null);
  }

  // 5) backend の依存を合成する
  // - 有効な cookie がある場合のみ初期化する
  const { getSessionUserDeps } = createIdentityDeps();

  // 6) usecase を呼ぶ
  // - ここで Firebase を直接呼ばず、port(adapter) 経由にする
  const result = await getSessionUser(getSessionUserDeps, {
    sessionCookieValue,
  });

  // 7) 検証失敗は未認証扱い
  if (!result.ok) {
    if (
      result.error.errorCode === errorCode.AUTH_REQUIRED ||
      result.error.errorCode === errorCode.AUTH_INVALID
    ) {
      // エラーではないので null を返す
      return ok(null);
    }

    return err({
      errorId: result.error.errorId,
      errorCode: result.error.errorCode,
    });
  }

  // 8) 認証OKなら uid を返す
  return ok({ uid: result.value.uid });
}
