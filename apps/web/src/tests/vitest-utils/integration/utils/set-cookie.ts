// apps/web/src/tests/vitest-utils/integration/utils/set-cookie.ts
// ========================================================
// 概要:
// - 統合（HTTP境界）テスト用: Response から Set-Cookie を取得する
//
// 責務:
// - テスト用 Response から Set-Cookie 値を string[] として抽出する
// - 実行環境差（Node/Undici の拡張）を吸収し、呼び出し側の分岐を不要にする
//
// 前提:
// - Vitest の fetch 実装は環境により Undici/Node の挙動差が出る
// ========================================================

/**
 * 統合（HTTP境界）テスト用: Response から Set-Cookie を取得する
 */
export function getSetCookiesFromFetchResponse(response: Response): string[] {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };

  // Node/Undici は getSetCookie() が生えることがある
  if (typeof headers.getSetCookie === "function") {
    // Set-Cookieヘッダーのすべての値を文字列の配列として取得
    return headers.getSetCookie();
  }

  // フォールバック（環境によっては結合される可能性あり）
  const raw = response.headers.get("set-cookie");
  return raw ? [raw] : [];
}
