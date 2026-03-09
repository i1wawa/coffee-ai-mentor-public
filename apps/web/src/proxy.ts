// apps/web/src/proxy.ts
// ========================================================
// 概要:
// - Next.js の入口ガード
// - ルートがレンダリングされる前にリクエストを検査し、必要なら別ページへリダイレクトできる。
//
// 契約:
// - 対象:
//   - 認証ガード: /app および /app/*
//   - CSP/nonce 付与: 画面系ルート全体（静的資産/API/プリフェッチは除外）
//   - reporting 付与: report-uri/report-to + Reporting-Endpoints/Report-To を返す
// - cookie が未設定 または 異常に長い場合: /sign-in へリダイレクト
// - それ以外: 通過（NextResponse.next）
// - Set-Cookie による削除は行わない（削除の責務は別へ委譲）
//
// 前提:
// - proxy.ts はファイル規約として、プロジェクトルート または app 、 src に置く必要がある
// - ここでは「軽い存在チェック」までに留め、重い検証は行わない
// - Proxy はアプリの入口で動き、プリフェッチ等でも実行され得るため軽量であることが重要
// - Firebase Auth helper（/__/auth/*）は authDomain 側で直接配信される前提にする
//   - app domain への内部転送（rewrite）を試しても popup 時の COOP 警告は解消しなかったため、
//     ここでは popup 互換に必要な CSP プロファイル分岐だけを維持する
// - popup 用 CSP を使う画面は当面 /sign-in と /app/settings/account に限定し、それ以外の画面系ルートは default を使う
// ========================================================

import { SECURITY_PATHS } from "@contracts/src/security/security-contract";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/backend/shared/http/cookies";
import {
  isStringTooLong,
  MAX_SESSION_COOKIE_CHARS,
  parseTrimmedString,
} from "@/backend/shared/http/request.guard.server";
import { createContentSecurityPolicyHeaderValue } from "./csp-header";
import { getServerBaseEnv } from "./env.server";

const APP_PATH = "/app";
const SIGN_IN_PATH = "/sign-in";
const SETTINGS_ACCOUNT_PATH = "/app/settings/account";
const CONTENT_SECURITY_POLICY_HEADER_NAME = "Content-Security-Policy";
const REPORTING_ENDPOINTS_HEADER_NAME = "Reporting-Endpoints";
const REPORT_TO_HEADER_NAME = "Report-To";
const NONCE_HEADER_NAME = "x-nonce";
const CSP_REPORT_GROUP_NAME = "csp-endpoint";
const serverBaseEnv = getServerBaseEnv();
const INTERNAL_BIND_HOSTNAME = "0.0.0.0";

function isAppPath(pathname: string): boolean {
  return pathname === APP_PATH || pathname.startsWith(`${APP_PATH}/`);
}

function isFirebasePopupAuthPath(pathname: string): boolean {
  return (
    pathname === SIGN_IN_PATH ||
    pathname.startsWith(`${SIGN_IN_PATH}/`) ||
    pathname === SETTINGS_ACCOUNT_PATH ||
    pathname.startsWith(`${SETTINGS_ACCOUNT_PATH}/`)
  );
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

function createNonce(): string {
  // UUID を base64 化して、CSP nonce 形式として扱いやすい文字列にする
  return btoa(crypto.randomUUID());
}

function normalizeForwardedHost(value: string | null): string {
  return value?.split(",")[0]?.trim() ?? "";
}

function normalizeForwardedProto(
  value: string | null,
): "http" | "https" | null {
  const normalized = value?.split(",")[0]?.trim().toLowerCase() ?? "";
  if (normalized === "http" || normalized === "https") {
    return normalized;
  }
  return null;
}

function toOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    // 0.0.0.0 は Cloud Run / Docker の bind 用であり、ブラウザが到達する公開URLとしては使えない
    if (url.hostname === INTERNAL_BIND_HOSTNAME) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * report-to / Reporting-Endpoints 用の絶対URLを組み立てる
 * - APP_ORIGIN があればそれを優先する
 * - 無ければ X-Forwarded-* を優先し、その次に request.nextUrl から組み立てる
 * - browser が到達できない origin のときは report-to を返さず、report-uri のみにフォールバックする
 */
export function buildCspReportEndpointUrl(
  request: NextRequest,
  configuredAppOrigin = serverBaseEnv.APP_ORIGIN,
): string | null {
  const normalizedConfiguredAppOrigin = parseTrimmedString(configuredAppOrigin);
  const forwardedHost = normalizeForwardedHost(
    request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
  );
  const forwardedProto =
    normalizeForwardedProto(request.headers.get("x-forwarded-proto")) ??
    normalizeForwardedProto(request.nextUrl.protocol.replace(":", ""));

  // APP_ORIGIN > X-Forwarded-* > request.nextUrl の順で、ブラウザが到達できる公開URLを組み立てる
  const reportBaseOrigin =
    toOrigin(normalizedConfiguredAppOrigin) ??
    (forwardedHost && forwardedProto
      ? toOrigin(`${forwardedProto}://${forwardedHost}`)
      : null) ??
    toOrigin(request.nextUrl.origin);

  if (!reportBaseOrigin) {
    return null;
  }

  return new URL(SECURITY_PATHS.cspReport, reportBaseOrigin).toString();
}

function buildReportToHeaderValue(reportEndpointUrl: string): string {
  return JSON.stringify({
    group: CSP_REPORT_GROUP_NAME,
    max_age: 10_886_400, // 126日
    endpoints: [{ url: reportEndpointUrl }],
  });
}

function buildReportingEndpointsHeaderValue(reportEndpointUrl: string): string {
  return `${CSP_REPORT_GROUP_NAME}="${reportEndpointUrl}"`;
}

/**
 * CSP ヘッダー値の構築
 * - nonce を引数で受け取る（リダイレクトと通過で同じ値を使うため）
 * - その他のパラメータは環境変数から直接参照する
 */
function buildContentSecurityPolicyHeaderValue(
  nonce: string,
  pathname: string,
  reportEndpointUrl: string | null,
): string {
  // popup 認証が走る画面だけ firebasePopupAuth を使い、それ以外の画面系ルートは default に固定する
  return createContentSecurityPolicyHeaderValue({
    nodeEnv: process.env.NODE_ENV,
    nonce,
    profile: isFirebasePopupAuthPath(pathname)
      ? "firebasePopupAuth"
      : "default",
    firebaseAuthDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    useFirebaseAuthEmulator: process.env.NEXT_PUBLIC_USE_FIREBASE_AUTH_EMULATOR,
    // report-uri は同一オリジン前提で相対パスを使い、localhost/127.0.0.1 差異を吸収する
    reportUri: SECURITY_PATHS.cspReport,
    // report-to は絶対URLを正しく組み立てられるときだけ返す
    reportToGroup: reportEndpointUrl ? CSP_REPORT_GROUP_NAME : undefined,
  });
}

/**
 * CSP + Reporting ヘッダーをレスポンスに設定
 */
function setSecurityHeaders(
  response: NextResponse,
  contentSecurityPolicyHeaderValue: string,
  reportEndpointUrl: string | null,
): NextResponse {
  response.headers.set(
    CONTENT_SECURITY_POLICY_HEADER_NAME,
    contentSecurityPolicyHeaderValue,
  );
  // report-to / Reporting-Endpoints は両方セットする必要がある（ブラウザ互換のため）
  if (reportEndpointUrl) {
    response.headers.set(
      REPORTING_ENDPOINTS_HEADER_NAME,
      buildReportingEndpointsHeaderValue(reportEndpointUrl),
    );
    response.headers.set(
      REPORT_TO_HEADER_NAME,
      buildReportToHeaderValue(reportEndpointUrl),
    );
  }
  return response;
}

/**
 * CSP ヘッダーを付与した通過レスポンスを作成
 * - x-nonce は「サーバー内の描画連携」用で、layout.tsx が headers() から受け取る
 * - Content-Security-Policy は「ブラウザ制御」用で、script/style の実行可否を制御する
 */
function createPassThroughResponseWithSecurityHeaders(
  request: NextRequest,
  nonce: string,
  contentSecurityPolicyHeaderValue: string,
  reportEndpointUrl: string | null,
): NextResponse {
  const requestHeaders = new Headers(request.headers);
  // 1) 後続の SSR/layout が参照できるよう、内部ヘッダーとして nonce を渡す
  requestHeaders.set(NONCE_HEADER_NAME, nonce);
  // 2) Next.js の nonce 自動適用のため、CSP を request 側にも引き継ぐ
  // - Next.js はレンダリング時に request の Content-Security-Policy を参照し、
  //   nonce を framework script などへ自動付与する
  // - response 側ヘッダーだけだと、この内部連携が崩れる可能性がある
  requestHeaders.set(
    CONTENT_SECURITY_POLICY_HEADER_NAME,
    contentSecurityPolicyHeaderValue,
  );

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  return setSecurityHeaders(
    response,
    contentSecurityPolicyHeaderValue,
    reportEndpointUrl,
  );
}

/**
 * CSP ヘッダーを付与したリダイレクトレスポンスを作成
 * - リダイレクト応答は画面描画しないため、x-nonce の内部引き継ぎは不要
 * - 遷移先リクエストで proxy が再実行され、新しい nonce が設定される
 */
function createRedirectResponseWithSecurityHeaders(
  request: NextRequest,
  pathname: string,
  contentSecurityPolicyHeaderValue: string,
  reportEndpointUrl: string | null,
): NextResponse {
  const redirectUrl = buildRedirectUrl(request, pathname);
  const response = NextResponse.redirect(redirectUrl);
  return setSecurityHeaders(
    response,
    contentSecurityPolicyHeaderValue,
    reportEndpointUrl,
  );
}

// --------------------------------------------------------
// Proxy 本体
// --------------------------------------------------------

// Next.js が Proxy を実行するためには、この関数をエクスポートする必要がある
// - Proxyはリクエスト完了前、ルートがレンダリングされる前にコードを実行できる
export function proxy(request: NextRequest) {
  // 1) リクエストパスを取得する
  const pathname = request.nextUrl.pathname;

  // 0) CSP nonce とヘッダー値を先に作る
  // - 通過/リダイレクトのどちらでも一貫して同じ CSP を返す
  const nonce = createNonce();
  const reportEndpointUrl = buildCspReportEndpointUrl(request);
  const contentSecurityPolicyHeaderValue =
    buildContentSecurityPolicyHeaderValue(nonce, pathname, reportEndpointUrl);

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
      return createRedirectResponseWithSecurityHeaders(
        request,
        SIGN_IN_PATH,
        contentSecurityPolicyHeaderValue,
        reportEndpointUrl,
      );
    }

    // cookie がある場合は通過
    // - cookie の正当性検証自体は /api/users/me が担当する
    return createPassThroughResponseWithSecurityHeaders(
      request,
      nonce,
      contentSecurityPolicyHeaderValue,
      reportEndpointUrl,
    );
  }

  // 5) 対象外はそのまま通す
  return createPassThroughResponseWithSecurityHeaders(
    request,
    nonce,
    contentSecurityPolicyHeaderValue,
    reportEndpointUrl,
  );
}

// --------------------------------------------------------
// Proxy 適用範囲の制御
// - matcher で対象パスを限定し、不要な実行を減らす
// --------------------------------------------------------

// Next.js が Proxy の設定として読むために、この関数をエクスポートする必要がある
export const config = {
  matcher: [
    {
      // 画面系ルートにだけ適用し、API/静的資産は除外する
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      // 画面プリフェッチには適用しない
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
