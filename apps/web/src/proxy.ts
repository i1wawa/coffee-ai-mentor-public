// apps/web/src/proxy.ts
// ========================================================
// 概要:
// - Next.js の入口ガード
// - ルートがレンダリングされる前にリクエストを検査し、必要なら別ページへリダイレクトできる。
//
// 契約:
// - 対象: /app および /app/*
// - cookie が未設定 または 異常に長い場合: /sign-in へリダイレクト
// - それ以外: 通過（NextResponse.next）
// - Set-Cookie による削除は行わない（削除の責務は別へ委譲）
//
// 前提:
// - ここでは「軽い存在チェック」までに留め、重い検証は行わない
// - Proxy はアプリの入口で動き、プリフェッチ等でも実行され得るため軽量であることが重要
// ========================================================

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/backend/shared/http/cookies";
import {
  isStringTooLong,
  MAX_SESSION_COOKIE_CHARS,
  parseTrimmedString,
} from "@/backend/shared/http/request.guard.server";

const APP_PATH = "/app";
const SIGN_IN_PATH = "/sign-in";

function isAppPath(pathname: string): boolean {
  return pathname === APP_PATH || pathname.startsWith(`${APP_PATH}/`);
}

// session cookie の取得
function getSessionCookieValue(request: NextRequest): string {
  const raw = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  // 外部入力なので正規化する
  return parseTrimmedString(raw);
}

/**
 * リダイレクトURL構築
 * - request.nextUrl.clone() でホストとプロトコルを維持する
 * - search は空にして、意図しないクエリ混入を避ける
 */
function buildRedirectUrl(request: NextRequest, pathname: string): URL {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  return url;
}

// --------------------------------------------------------
// Proxy 本体
// --------------------------------------------------------

// Next.js が Proxy を実行するためには、この関数をエクスポートする必要がある
// - Proxyはリクエスト完了前、ルートがレンダリングされる前にコードを実行できる
export function proxy(request: NextRequest) {
  // 1) リクエストパスを取得する
  const pathname = request.nextUrl.pathname;

  // 2) session cookie を取得する
  const sessionCookieValue = getSessionCookieValue(request);

  // 3) 異常に長い cookie を早期に無効扱いにする
  // - DoS対策、SDK呼び出し前の例外抑制、無駄なログ抑制
  const isTooLongCookie = isStringTooLong(
    sessionCookieValue,
    MAX_SESSION_COOKIE_CHARS,
  );

  // 4) /app 配下のガード
  // - cookie 有りなら通過
  if (isAppPath(pathname)) {
    // - cookie 無し or 異常に長い cookie なら /sign-in に誘導
    if (!sessionCookieValue || isTooLongCookie) {
      const redirectUrl = buildRedirectUrl(request, SIGN_IN_PATH);
      return NextResponse.redirect(redirectUrl);
    }

    // cookie がある場合は通過
    // - cookie の正当性検証自体は /api/users/me が担当する
    return NextResponse.next();
  }

  // 5) 対象外はそのまま通す
  return NextResponse.next();
}

// --------------------------------------------------------
// Proxy 適用範囲の制御
// - matcher で対象パスを限定し、不要な実行を減らす
// --------------------------------------------------------

// Next.js が Proxy の設定として読むために、この関数をエクスポートする必要がある
export const config = {
  matcher: ["/app/:path*"],
};
