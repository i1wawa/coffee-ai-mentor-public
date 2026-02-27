// apps/web/src/tests/e2e/setup/session-request.ts
// ========================================================
// 概要:
// - E2E 専用: /api/auth/session の「発行リクエスト」を組み立てる
//
// 契約:
// - 入力: body に { idToken } のみ（SessionIssueBody）
// - CSRF (Cross-Site Request Forgery) トークンは使わない
// - サーバ側の unsafe method 防御を通すため、最小限のヘッダを付与する
//   - Origin: Origin/Referer 検証フォールバック用
//   - Sec-Fetch-Site: Fetch Metadata（Sec-Fetch-Site）検証用（same-origin 固定）
//
// 前提:
// - このヘッダ付与は「テストでブラウザ相当の入力を再現する」ためのものであり、
//   実運用のクライアント実装仕様をここで決めない
// ========================================================

import type { AuthSessionIssueRequest } from "@contracts/src/auth/auth-contract";

/**
 * Playwright 専用: session発行リクエストの組み立て
 * - 共通契約に従い、csrf=headerのみ / idToken=bodyのみ
 */
export function buildSessionIssueRequestForPlaywright(params: {
  origin: string;
  requestBody: AuthSessionIssueRequest;
}) {
  return {
    headers: {
      // フォールバック（Origin/Referer検証）に必要
      Origin: params.origin,
      // Fetch Metadata（モダンブラウザ想定）を擬似的に付与
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
    },
    data: params.requestBody,
  } as const;
}
