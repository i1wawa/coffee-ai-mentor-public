// apps/web/src/tests/vitest-utils/integration/utils/http.ts
// ========================================================
// 概要:
// - 統合（HTTP境界）テスト用の HTTP クライアント補助
// - Cookie を自動管理しない Node.js の fetch を、CookieJar 付きで扱えるようにする
//
// 責務:
// - RFC 6265 (HTTP State Management Mechanism) 準拠の CookieJar をテスト単位で作成できる
// - fetch に CookieJar を自動連携し、テスト中の Cookie 往復を自然に再現する
// - 相対パスをテスト用 baseURL 付きの絶対URLに正規化する
//
// 前提:
// - TEST_BASE_URL はテスト対象サーバーの起動先（例: http://127.0.0.1:3000）を指す
// ========================================================

import makeFetchCookie from "fetch-cookie";
import { CookieJar } from "tough-cookie";
import { TEST_BASE_URL } from "@/tests/utils/test-config";

/**
 * 統合テスト用のHTTPクライアントセットを作成する
 * - CookieJar をテスト単位で分離したい場合に使う
 */
export function createHttpTestClient() {
  const cookieJar = new CookieJar();
  const cookieFetch = makeFetchCookie(fetch, cookieJar);
  return { cookieJar, cookieFetch };
}

export type HttpTestClient = ReturnType<typeof createHttpTestClient>;

/**
 * 相対パスならテスト用のベースURLを付けるユーティリティ
 */
export function resolveTestUrl(pathname: string): string {
  if (pathname.startsWith("http")) return pathname;
  return `${TEST_BASE_URL}${pathname.startsWith("/") ? "" : "/"}${pathname}`;
}
