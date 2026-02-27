// apps/web/src/backend/shared/http/cookies.ts
// ========================================================
// 概要:
// - apps/web のセッション Cookie を扱う共通ユーティリティ
// - Cookie名（契約）と set/delete をこのファイルに集約する
//
// 契約:
// - Cookie名は SESSION_COOKIE_NAME に固定する
// - __Host- prefix の要件（Secure + Path=/ + Domainなし）を必ず満たす
// - 削除は Set-Cookie（Max-Age=0）で統一する
// ========================================================

/**
 * セッション Cookie 名（サインイン状態を表す）
 * - ローカルHTTPS化により 1本運用（Secure必須）に寄せる
 * - Cookie名を固定しておくことで、削除やテストが安定する
 */
export const SESSION_COOKIE_NAME = "__Host-session" as const;

/**
 * セッションCookieの属性オプション
 * - Route Handler から上書きしたい項目だけを公開する
 *
 * 補足:
 * - Expires より Max-Age を優先（ブラウザ間の差異が出にくい）
 * - Domain は __Host- と相性が悪いので公開しない（指定させない）
 */
export type SessionCookieOptions = {
  /**
   * Max-Age（秒）
   * - 未指定なら 14日（一般的なセッションCookie運用の範囲）
   */
  maxAgeSeconds?: number;

  /**
   * SameSite
   * - Lax: 通常のWebアプリで扱いやすい（初期値）
   * - Strict: より厳格（ただしUXが落ちやすい）
   * - None: クロスサイトで送る必要がある場合（Secure必須）
   */
  sameSite?: "lax" | "strict" | "none";
};

/**
 * Cookieを書き込む最小インターフェース（NextResponse.cookies 互換）
 *
 * 目的:
 * - Route Handler が NextResponse を使う場合にも、このユーティリティをそのまま適用できるようにする
 * - 単体テスト時は、この型を満たすスタブ（偽物）を差し替え可能にする
 *
 * 設計上の注意:
 * - Next.js の cookies.set はオーバーロード（複数の呼び出し形）を持つため、
 *   「(name, value, options)」形式の最小型を自作すると型が噛み合わないことがある。
 * - そのため、本ユーティリティは「オブジェクト1引数」で set する形式に統一する。
 */
type CookieWriter = {
  set: (cookie: {
    // Cookie名（例: "__Host-session"）
    name: string;
    // Cookie値（例: "session-cookie-value"）
    value: string;
    // セキュリティ属性（必要な分だけ使う）
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "lax" | "strict" | "none";
    // __Host- の要件で "/" 固定
    path?: "/";
    // Max-Age（秒）
    maxAge?: number;
  }) => void;
};

/**
 * セッションCookieをbodyにセットする
 *
 * 契約:
 * - __Host- prefix の要件（Secure + Path=/ + Domainなし）を必ず満たす
 *
 * 使い方:
 * - Route Handler 側で `response.cookies` を渡して呼ぶ
 */
export function setSessionCookie(params: {
  cookies: CookieWriter;
  sessionCookieValue: string;
  options?: SessionCookieOptions;
}): void {
  // 1) オプションを決定（未指定は安全寄りのデフォルト）
  // - maxAgeSeconds: セッションの寿命（秒）
  const maxAge = params.options?.maxAgeSeconds ?? 60 * 60 * 24 * 14; // 14 days
  // - sameSite: CSRF緩和（運用要件で strict/none に変更可能）
  //   - "none" にすると全クロスサイトリクエストで送信されるため、使うなら CSRF トークンなど別防御が必須
  const sameSite = params.options?.sameSite ?? "lax";

  // 2) Cookie をセット
  params.cookies.set({
    // Cookie名は固定（契約）
    name: SESSION_COOKIE_NAME,
    value: params.sessionCookieValue,
    // HttpOnly: JavaScript から読めない（XSSで盗まれにくい）
    httpOnly: true,
    // Secure: HTTPS のときだけ送る（平文送信を防ぐ）
    secure: true,
    // SameSite: CSRF緩和（要件に応じて変更）
    sameSite,
    // __Host- の要件で Path=/ を固定
    path: "/",
    // Max-Age（秒）
    maxAge,
  });
}

/**
 * セッションCookieを削除する（サインアウト/無効化時）
 *
 * 契約:
 * - Max-Age=0 で「即時失効」を指示する
 *
 * 方針:
 * - delete() ではなく Set-Cookie（Max-Age=0）で統一する
 *   - 環境差で Set-Cookie の出方がブレるのを避ける
 * - __Host- prefix の要件（Secure + Path=/ + Domainなし）を必ず満たす
 */
export function deleteSessionCookie(params: { cookies: CookieWriter }): void {
  params.cookies.set({
    // Cookie名は固定（契約）
    name: SESSION_COOKIE_NAME,
    // 値は空文字にする（削除目的なので意味は持たない）
    value: "",
    // セット時と同じく安全属性を付与（__Host- の要件を満たすため）
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    // Max-Age=0 で「即時失効」を指示する
    maxAge: 0,
  });
}
