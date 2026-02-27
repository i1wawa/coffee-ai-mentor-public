// apps/web/src/tests/vitest-utils/integration/utils/auth-session.ts
// ========================================================
// 統合（HTTP境界）テスト用: 認証済みセッションを作るヘルパー
//
// 概要:
// - 統合テスト（fetch）から /api/auth/session を叩き、認証済みセッションCookieを CookieJar に入れる。
//
// 契約:
// - /api/auth/session は idToken を body のみに入れる（{ idToken }）。
// - unsafe method 防御（Fetch Metadata + Origin/Referer）を通すための最小ヘッダ付与は
//   buildSessionIssueRequestForFetch に委譲する。
// - cookieFetch は呼び出し元が明示的に渡す（暗黙のデフォルトclientは持たない）。
// - cookieFetch は CookieJar を保持し、Set-Cookie を自動で反映する。
//
// 対象ケース:
// - 正常系: Auth Emulator の idToken で session を発行し、以後のリクエストがサインイン状態になる。
// - 異常系: idToken を差し替えて、idToken 不正などの失敗ケースを作れる。
//
// 前提:
// - Auth Emulator が起動しており、テストユーザーで idToken を取得できる。
// - テスト対象の Next.js サーバが起動しており、/api/auth/session が疎通する。
// ========================================================

import {
  AUTH_PATHS,
  type AuthSessionIssueRequest,
} from "@contracts/src/auth/auth-contract";
import {
  createTestFailureError,
  TEST_FAILURE_REASON,
} from "@packages/tests/src/error-message";
import { createVerifiedTestUserAndFetchIdToken } from "@/tests/utils/auth-emulator";
import {
  buildSessionIssueRequestForFetch,
  buildUnsafeMethodSameOriginHeadersForFetch,
} from "@/tests/vitest-utils/integration/utils/auth-requests-for-fetch";
import {
  type HttpTestClient,
  resolveTestUrl,
} from "@/tests/vitest-utils/integration/utils/http";

// ------------------------------
// 内部ユーティリティ
// ------------------------------

type CookieFetch = HttpTestClient["cookieFetch"];

// idToken をモジュール内でキャッシュ取得する（シングルトン）
// - テストプロセス内で1度だけ Auth Emulator から取得して再利用する
let cachedIdTokenPromise: Promise<string> | null = null;
/**
 * Auth Emulator から idToken を取得（モジュール内キャッシュ）。
 */
async function getCachedIdToken(): Promise<string> {
  // 1) まだ取得していなければ開始（Auth Emulator から取得）
  if (!cachedIdTokenPromise) {
    cachedIdTokenPromise = createVerifiedTestUserAndFetchIdToken();
  }

  // 2) 念のため空文字チェック（異常なら早期に落とす）
  const idToken = (await cachedIdTokenPromise).trim();
  if (!idToken) {
    throw createTestFailureError({
      reason: TEST_FAILURE_REASON.PRECONDITION_FAILED,
      summary: "Auth Emulator から idToken を取得できませんでした。",
      expected: "idToken が空でない",
      observed: "idToken is empty",
      nextActions: ["Auth Emulator の起動状況と設定値を確認する"],
    });
  }

  return idToken;
}

// ------------------------------
// エクスポート関数
// ------------------------------

/**
 * HTTP境界で session を発行する
 * - /api/auth/session のレスポンス契約（Set-Cookie等）をテストで検査できるように Response を返す
 * - idToken を差し替え可能（テストで idToken不正 を作るため）
 * - idToken 省略時は Auth Emulator（モジュールキャッシュ）を使用
 * - cookieFetch は呼び出し元が必ず渡す
 */
export async function issueSessionOverHttp(params: {
  idToken?: string;
  cookieFetch: CookieFetch;
}): Promise<Response> {
  // 1) idToken（bodyのみ）
  const idToken = (params.idToken ?? (await getCachedIdToken())).trim();
  const requestBody: AuthSessionIssueRequest = { idToken };

  // 2) session発行（idToken=bodyのみ）
  const sessionUrl = resolveTestUrl(AUTH_PATHS.session);
  return await params.cookieFetch(
    sessionUrl,
    buildSessionIssueRequestForFetch({ requestBody }),
  );
}

/**
 * HTTP境界で session status を取得する
 * - /api/auth/session を GET で呼び、CookieJar 付きで状態を観測する
 */
export async function getSessionStatusOverHttp(params: {
  cookieFetch: CookieFetch;
}): Promise<Response> {
  // 1) URL を組み立てる
  const sessionUrl = resolveTestUrl(AUTH_PATHS.session);

  // 2) GET を投げる
  // - redirect はテストの観測性のため manual
  // - cookieFetch は CookieJar を保持しており、既存の session cookie を自動送信する
  return await params.cookieFetch(sessionUrl, {
    method: "GET",
    redirect: "manual",
  });
}

/**
 * HTTP境界で session を削除する
 * - 通常サインアウト用途
 *
 * 注意:
 * - unsafe method 防御（Fetch Metadata + Origin/Referer）を通すため、
 *   最低限のヘッダを付与する
 * - cookieFetch は CookieJar を持っているため、削除Set-Cookie を受け取ると Jar に反映される前提
 */
export async function deleteSessionOverHttp(params: {
  cookieFetch: CookieFetch;
}): Promise<Response> {
  // 1) URL を組み立てる
  const sessionUrl = resolveTestUrl(AUTH_PATHS.session);

  // 2) DELETE を投げる
  // - redirect はテストの観測性のため manual
  // - guard が参照する可能性があるため Origin/Referer と Sec-Fetch を付ける
  return await params.cookieFetch(sessionUrl, {
    method: "DELETE",
    redirect: "manual",
    headers: buildUnsafeMethodSameOriginHeadersForFetch({ url: sessionUrl }),
  });
}

/**
 * HTTP境界で セキュリティ用サインアウト を実行する
 * - 全端末サインアウトや盗難疑いの遮断を想定する
 *
 * 期待する Route の責務:
 * - session cookie を検証して uid を得る
 * - adminAuth.revokeRefreshTokens(uid) を実行する
 * - 削除Set-Cookie（Max-Age=0）を返す
 *
 * 注意:
 * - unsafe method 防御（Fetch Metadata + Origin/Referer）を通すため、最低限のヘッダを付与する
 * - body は不要な契約にする（必要になったら後で足す）
 */
export async function revokeSessionsOverHttp(params: {
  cookieFetch: CookieFetch;
}): Promise<Response> {
  // 1) 対象URL
  // - contracts へ追加するまではテスト側で固定する
  const revokeUrl = resolveTestUrl(AUTH_PATHS.revoke);

  // 2) POST を送る
  // - redirect はテストの観測性のため manual
  // - guard が参照する可能性があるため Origin/Referer と Sec-Fetch を付ける
  return await params.cookieFetch(revokeUrl, {
    method: "POST",
    redirect: "manual",
    headers: buildUnsafeMethodSameOriginHeadersForFetch({ url: revokeUrl }),
  });
}

/**
 * 認証済みセッションCookieを CookieJar に入れる（cookieFetch が保持する）。
 * - idToken は body のみに入れる
 */
export async function ensureLoggedInSessionCookie(params: {
  cookieFetch: CookieFetch;
}): Promise<void> {
  // 1) idToken取得（モジュール内キャッシュ）
  const response = await issueSessionOverHttp({
    cookieFetch: params.cookieFetch,
  });

  // 失敗したら前提が崩れている（認証済み前提を作れない）
  if (!response.ok) {
    throw createTestFailureError({
      reason: TEST_FAILURE_REASON.PRECONDITION_FAILED,
      summary: "session発行APIが失敗しました（認証済み前提を作れません）。",
      expected: "HTTP 2xx + Set-Cookie を返す",
      observed: `status=${response.status}`,
      nextActions: [
        "Next.js側に FIREBASE_AUTH_EMULATOR_HOST が渡っているか確認する",
        "サーバ側が idToken を検証できているか確認する",
      ],
    });
  }
}
