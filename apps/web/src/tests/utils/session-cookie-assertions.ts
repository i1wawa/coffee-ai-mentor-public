// apps/web/src/tests/utils/session-cookie-assertions.ts
// ========================================================
// 概要:
// - テスト用 Set-Cookie ユーティリティ（共通）
//
// 責務:
// - クライアント差が出る「Set-Cookie の取得結果」を string[] として受け取り、検査側へ渡せる形に整える
// - Set-Cookie の属性（HttpOnly/Secure/SameSite/Max-Age/Path）を契約として検査する
//
// 前提:
// - 取得元（fetch/Playwright/Nodeなど）により Set-Cookie の取得形式が揺れるため、呼び出し側は string[] に正規化して渡す
// ========================================================

import {
  createTestFailureError,
  TEST_FAILURE_REASON,
} from "@packages/tests/src/error-message";

/**
 * session cookie 成功時の属性を検査する。
 * - Cookie名は固定しない
 * - SameSiteの値は固定しない（Lax/Strict/None いずれでもOK）
 */
export function assertSessionCookieAttributes(setCookieLines: string[]): void {
  // すべて連結し小文字化
  const joined = setCookieLines.join("\n").toLowerCase();

  // HttpOnly
  // - httponlyという文字列が含まれていることを確認
  if (!joined.includes("httponly")) {
    throw createTestFailureError({
      reason: TEST_FAILURE_REASON.CONTRACT_VIOLATION,
      summary:
        "session成功時の Set-Cookie には HttpOnly が付与されるべきです。",
      expected: "Set-Cookie に HttpOnly が含まれる",
      observed: joined,
    });
  }

  // Secure
  // - secureという文字列が含まれていることを確認
  if (!joined.includes("secure")) {
    throw createTestFailureError({
      reason: TEST_FAILURE_REASON.CONTRACT_VIOLATION,
      summary: "session成功時の Set-Cookie には Secure が付与されるべきです。",
      expected: "Set-Cookie に Secure が含まれる",
      observed: joined,
    });
  }

  // SameSite（値は固定しない）
  // - samesite=lax|strict|none のいずれかが含まれていることを確認
  if (!/samesite=(lax|strict|none)/.test(joined)) {
    throw createTestFailureError({
      reason: TEST_FAILURE_REASON.CONTRACT_VIOLATION,
      summary:
        "session成功時の Set-Cookie には SameSite が付与されるべきです。",
      expected: "SameSite=Lax|Strict|None のいずれかが含まれる",
      observed: joined,
    });
  }

  // Max-Age
  // - max-age=<number> が含まれていることを確認
  if (!/max-age=\d+/.test(joined)) {
    throw createTestFailureError({
      reason: TEST_FAILURE_REASON.CONTRACT_VIOLATION,
      summary: "session成功時の Set-Cookie には Max-Age が付与されるべきです。",
      expected: "Max-Age=<number> が含まれる",
      observed: joined,
    });
  }

  // Path
  // - path=という文字列が含まれていることを確認
  if (!joined.includes("path=")) {
    throw createTestFailureError({
      reason: TEST_FAILURE_REASON.CONTRACT_VIOLATION,
      summary: "session成功時の Set-Cookie には Path が付与されるべきです。",
      expected: "Path=/ など Path 指定が含まれる",
      observed: joined,
    });
  }
}

/**
 * session cookie 削除時の属性を検査する。
 *
 * 期待する削除指示:
 * - Max-Age=0
 * - __Host- の要件（Secure + Path=/ + Domainなし）を満たす
 * - SameSite の値は固定しない（Lax/Strict/None いずれでもOK）
 */
export function assertSessionCookieDeletionAttributes(
  setCookieLines: string[],
): void {
  // 1) Set-Cookie は取得形式が揺れるので、連結して一括で検査する
  // - 大文字小文字を吸収するため小文字化する
  const joined = setCookieLines.join("\n").toLowerCase();

  // 2) HttpOnly は必須
  // - JavaScript から読めない状態を維持し、XSSで盗まれにくくする
  if (!joined.includes("httponly")) {
    throw createTestFailureError({
      reason: TEST_FAILURE_REASON.CONTRACT_VIOLATION,
      summary:
        "session削除時の Set-Cookie には HttpOnly が付与されるべきです。",
      expected: "Set-Cookie に HttpOnly が含まれる",
      observed: joined,
    });
  }

  // 3) Secure は必須
  // - HTTPS のときだけ送る属性を削除時も一致させ、__Host- 要件を満たす
  if (!joined.includes("secure")) {
    throw createTestFailureError({
      reason: TEST_FAILURE_REASON.CONTRACT_VIOLATION,
      summary: "session削除時の Set-Cookie には Secure が付与されるべきです。",
      expected: "Set-Cookie に Secure が含まれる",
      observed: joined,
    });
  }

  // 4) SameSite は必須（値は固定しない）
  // - CSRF緩和の方針を削除時も維持する
  if (!/samesite=(lax|strict|none)/.test(joined)) {
    throw createTestFailureError({
      reason: TEST_FAILURE_REASON.CONTRACT_VIOLATION,
      summary:
        "session削除時の Set-Cookie には SameSite が付与されるべきです。",
      expected: "SameSite=Lax|Strict|None のいずれかが含まれる",
      observed: joined,
    });
  }

  // 5) Path は必須
  // - __Host- prefix の要件により Path=/ が必要になる
  if (!joined.includes("path=")) {
    throw createTestFailureError({
      reason: TEST_FAILURE_REASON.CONTRACT_VIOLATION,
      summary: "session削除時の Set-Cookie には Path が付与されるべきです。",
      expected: "Path=/ など Path 指定が含まれる",
      observed: joined,
    });
  }

  // 6) 削除の決め手は Max-Age=0
  // - Max-Age=0 が入っていないと「削除」ではなく「上書き」になり得る
  if (!/max-age=0\b/.test(joined)) {
    throw createTestFailureError({
      reason: TEST_FAILURE_REASON.CONTRACT_VIOLATION,
      summary:
        "session削除時の Set-Cookie は Max-Age=0 で即時失効を指示すべきです。",
      expected: "Max-Age=0 が含まれる",
      observed: joined,
    });
  }
}
