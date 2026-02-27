// apps/web/src/tests/vitest-utils/integration/utils/auth-requests-for-fetch.ts
// ========================================================
// 概要:
// - 統合（HTTP境界）テスト用: fetch に渡す RequestInit を組み立てる
//
// 責務:
// - Node fetch では省略されるブラウザ由来ヘッダを明示し、サーバ側ガードの契約を再現する
//
// 契約:
// - idToken は body のみに入れる（各エンドポイントの契約に従う）
// - unsafe method 防御（サーバ側）を通すため、最小限の同一オリジン系ヘッダを付与する
// - JSONボディのときは content-type を application/json にする
// - redirect は観測性のため manual に固定する
//
// 前提:
// - Node fetch はブラウザと異なり Origin / Sec-Fetch-Site を自動付与しない
// - TEST_BASE_URL はサーバ側の same-origin 判定と一致している必要がある
// ========================================================

import type { AuthSessionIssueRequest } from "@contracts/src/auth/auth-contract";
import { TEST_BASE_URL } from "@/tests/utils/test-config";

/**
 * unsafe method の同一オリジンを示すための最小ヘッダを組み立てる。
 */
function buildWebSameOriginHeaders(): Record<string, string> {
  return {
    // サーバ側が Origin/Referer 検証をする場合のフォールバックに必要
    // - テストでは Referer を付けないことも多いため、最小で Origin を合わせる
    origin: TEST_BASE_URL,
    // Fetch Metadata による same-origin 判定を想定したガードに必要
    // - ブラウザでは自動付与されるが、Node fetch では省略されるため明示する
    "sec-fetch-site": "same-origin",
  };
}

/**
 * unsafe method 防御（Fetch Metadata + Origin/Referer）を通すためのヘッダを組み立てる。
 *
 * 使いどころ:
 * - cookieFetch / fetch で unsafe method（POST/DELETE など）を打つ統合テスト
 *
 * 方針:
 * - 実際に叩く URL から origin を導出し、ガードが比較しやすい値に揃える
 */
export function buildUnsafeMethodSameOriginHeadersForFetch(params: {
  url: string;
}): Record<string, string> {
  const origin = new URL(params.url).origin;

  return {
    Origin: origin,
    Referer: `${origin}/`,
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Dest": "empty",
  };
}

/**
 * JSONボディを持つ POST の RequestInit を共通化して組み立てる。
 *
 * 注意:
 * - ここは URL を持たないため、同一オリジンの最終保証は URL 側で行う必要がある
 * - Cookie の扱いは Node fetch の実装差が大きいので、必要なら Cookie ヘッダは呼び出し側で付与する
 */
function buildJsonPostRequestInit<TBody>(params: {
  requestBody: TBody;
}): RequestInit {
  // 1) ヘッダを組み立てる
  // - unsafe method 防御のための最小ヘッダを付与
  // - JSONボディ契約として content-type を付与
  const headers: Record<string, string> = {
    ...buildWebSameOriginHeaders(),
    "content-type": "application/json",
  };

  // 2) body を JSON 文字列に変換する
  // - fetch の body は文字列や Blob などを受け取るため、オブジェクトは JSON 文字列化が必要
  // - テストでは body の形が契約通りかを確認しやすい
  const jsonBody = JSON.stringify(params.requestBody);

  // 3) RequestInit を返す
  // - method は POST 固定
  // - redirect は観測性のため manual 固定
  return {
    method: "POST",
    redirect: "manual",
    headers,
    body: jsonBody,
  };
}

/**
 * 統合（HTTP境界）テスト用: session発行リクエストの RequestInit を組み立てる。
 *
 * 対象:
 * - POST /api/auth/session
 *
 * 契約:
 * - csrf は使わない
 * - idToken は body のみに入れる（{ idToken }）
 */
export function buildSessionIssueRequestForFetch(params: {
  requestBody: AuthSessionIssueRequest;
}): RequestInit {
  // POST + JSON の共通ビルダーを利用して組み立てる
  // - endpoint 固有の追加設定が必要になったら、この関数内で差分だけ足す
  return buildJsonPostRequestInit(params);
}
