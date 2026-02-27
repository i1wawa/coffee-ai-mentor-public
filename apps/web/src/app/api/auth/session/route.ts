// apps/web/src/app/api/auth/session/route.ts
// ================================================================
// 概要:
// - セッション状態照会・Cookie発行・Cookie削除エンドポイント（Web向け）
//
// 外部契約の正本:
// - contracts/src/auth/auth-session.http.md
// - HTTP status / errorCode / Set-Cookie 契約の完全な一覧は上記を参照する
//
// 責務:
// 1) HTTP 境界のガード（unsafe method / JSON入力制約 / cookie長さ）を適用する
// 2) usecase の Result を HTTP status / body / headers に写像する
// 3) 成功時と shouldClearSessionCookie に応じて Set-Cookie を発行/削除する
//
// 観測:
// - request.summary は wrapper が必ず 1 本出す
// ================================================================

import {
  AUTH_PATHS,
  type AuthSessionDeleteResponse,
  type AuthSessionIssueRequest,
  type AuthSessionIssueResponse,
  type AuthSessionResponse,
} from "@contracts/src/auth/auth-contract";
import {
  buildErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { mapErrorCodeToHttpStatusCode } from "@packages/observability/src/logging/telemetry-error-http-mapping";
import { errHttp, okHttp } from "@packages/shared/src/result";
import { type NextRequest, NextResponse } from "next/server";
import * as z from "zod";
import { createIdentityDeps } from "@/backend/composition/identity.composition.server";
import { getAuthSessionStatus } from "@/backend/identity/applications/get-auth-session-status.usecase.server";
import { issueAuthSessionCookie } from "@/backend/identity/applications/issue-auth-session-cookie.usecase.server";
import {
  buildApiErrorBody,
  buildApiOkBody,
} from "@/backend/shared/http/api-response";
import {
  deleteSessionCookie,
  SESSION_COOKIE_NAME,
  type SessionCookieOptions,
  setSessionCookie,
} from "@/backend/shared/http/cookies";
import {
  createNoStoreHeaders,
  isBodyTooLargeByContentLength,
  isJsonContentType,
  isStringTooLong,
  MAX_JSON_BODY_BYTES,
  MAX_SESSION_COOKIE_CHARS,
  parseTrimmedString,
  SESSION_EXPIRES_IN_MS,
  safeReadJson,
} from "@/backend/shared/http/request.guard.server";
import { guardUnsafeMethodByFetchMetadataAndOrigin } from "@/backend/shared/http/request-origin.guard";
import { runRouteHandlerWithRequestSummary } from "@/backend/shared/observability/request-summary";
import { hashUidToUserHash } from "@/backend/shared/observability/user-hash";

// Next.jsのランタイムをNode.jsに指定
export const runtime = "nodejs";
// Next.jsのキャッシュ設定を動的にする
export const dynamic = "force-dynamic";

/**
 * POST request body の Zod スキーマ
 * - trim().min(1) で空文字や空白だけを弾く
 * - max() で異常に長い文字列を弾く
 * - 追加フィールドを許容しない（z.strictObject）
 */
const sessionIssueBodySchema = z.strictObject({
  idToken: z.string().trim().min(1).max(10_000),
});

/**
 * GET /api/auth/session
 *
 * 目的:
 * - セッション状態（サインイン済みか）を照会する
 *
 * 方針:
 * - 未サインインは正常系として 200 を返す
 * - 一時障害などで照会できない場合のみ 5xx を返す
 */
export async function GET(req: NextRequest) {
  // セッション検証後に userHash を確定させるため、外側変数で保持する
  let computedUserHash: string | undefined;

  // 0) Composition Root で依存を合成する
  const { getAuthSessionStatusDeps } = createIdentityDeps();

  return await runRouteHandlerWithRequestSummary(
    req,
    {
      routePattern: AUTH_PATHS.session,
      // この時点ではユーザー確定前なので anonymous 固定
      createUserHash: () => "anonymous",
      // 検証後に uid をsha化した userHash へ差し替える
      overrideUserHash: () => computedUserHash,
    },
    async () => {
      // 1) session cookie 取得
      const sessionCookie = parseTrimmedString(
        req.cookies.get(SESSION_COOKIE_NAME)?.value,
      );

      // 2) 異常に長い cookie は早期に「無効cookie」として扱う
      // - 理由: SDK に渡す前に落とす（DoS/無駄な例外ログを減らす）
      // - 契約: 照会APIのため 200（authenticated=false）+ 削除 Set-Cookie
      if (isStringTooLong(sessionCookie, MAX_SESSION_COOKIE_CHARS)) {
        const data: AuthSessionResponse = {
          authenticated: false,
          user: null,
        };
        const res = NextResponse.json(buildApiOkBody(data), {
          status: 200,
          // 認証系はキャッシュさせない
          headers: createNoStoreHeaders(),
        });
        deleteSessionCookie(res);
        return okHttp(res);
      }

      // 3) セッション状態を取得する
      const status = await getAuthSessionStatus(getAuthSessionStatusDeps, {
        sessionCookieValue: sessionCookie,
      });
      if (!status.ok) {
        // 一時障害などは失敗扱いにし、監視できるようにする
        const res = NextResponse.json(buildApiErrorBody(status.error), {
          status: mapErrorCodeToHttpStatusCode(status.error.errorCode),
          // 認証系はキャッシュさせない
          headers: createNoStoreHeaders(),
        });
        return errHttp(res, status.error);
      }

      // 4) 未サインインは 200 + authenticated=false を返す
      if (!status.value.authenticated) {
        const data: AuthSessionResponse = {
          authenticated: false,
          user: null,
        };
        const res = NextResponse.json(buildApiOkBody(data), {
          status: 200,
          // 認証系はキャッシュさせない
          headers: createNoStoreHeaders(),
        });
        if (status.value.shouldClearSessionCookie) {
          deleteSessionCookie(res);
        }
        return okHttp(res);
      }

      // 5) 検証成功後に userHash を確定（uidはログに出さない）
      computedUserHash = hashUidToUserHash(status.value.uid);

      // 6) 成功レスポンス
      const data: AuthSessionResponse = {
        authenticated: true,
        user: { uid: status.value.uid },
      };
      const res = NextResponse.json(buildApiOkBody(data), {
        status: 200,
        // 認証系はキャッシュさせない
        headers: createNoStoreHeaders(),
      });
      return okHttp(res);
    },
  );
}

/**
 * POST /api/auth/session
 *
 * 契約:
 * - Body: { idToken } のみ（JSON）
 * - Success: 200 + Set-Cookie（HttpOnly セッションCookie）
 * - Failure: 4xx/5xx（失敗時は Set-Cookie を出さない）
 *
 * セキュリティ:
 * - unsafe method は Fetch Metadata（Sec-Fetch-Site）を優先し、Origin/Referer をフォールバックに cross-site を拒否する
 * - token/cookie はログに出さない
 */
export async function POST(req: NextRequest) {
  // 0) Composition Root で依存を合成する
  const { issueAuthSessionCookieDeps: issueSessionCookieDeps } =
    createIdentityDeps();

  return await runRouteHandlerWithRequestSummary(
    req,
    {
      routePattern: AUTH_PATHS.session,
      // この時点ではユーザー確定前なので anonymous 固定
      createUserHash: () => "anonymous",
    },
    async () => {
      // 1) unsafe method 防御（CSRFトークン配布は使わない）
      const guardFailure = guardUnsafeMethodByFetchMetadataAndOrigin(req);
      if (guardFailure) {
        // 失敗レスポンス
        const res = NextResponse.json(
          buildApiErrorBody(guardFailure.errorFields),
          {
            status: guardFailure.httpStatus,
            // 認証系はキャッシュさせない
            headers: createNoStoreHeaders(),
          },
        );
        return errHttp(res, guardFailure.errorFields);
      }

      //  2) Content-Type を JSON に制限する
      // - 目的: 解析経路を減らし、意図しない入力を弾く
      if (!isJsonContentType(req)) {
        const errorFields = buildErrorFields(errorCode.VALIDATION_FAILED);
        // 失敗レスポンス
        const res = NextResponse.json(buildApiErrorBody(errorFields), {
          status: mapErrorCodeToHttpStatusCode(errorFields.errorCode),
          // 認証系はキャッシュさせない
          headers: createNoStoreHeaders(),
        });
        return errHttp(res, errorFields);
      }

      //  3) Content-Length で巨大ボディを読む前に弾く
      // - Content-Length が無い場合はここでは弾けない（safeReadJson 側へ進む）
      // - その場合でも Zod の max(10_000) で「値としての上限」は必ず守れる
      if (isBodyTooLargeByContentLength(req, MAX_JSON_BODY_BYTES)) {
        // 失敗レスポンス
        const errorFields = buildErrorFields(errorCode.VALIDATION_FAILED);
        const res = NextResponse.json(buildApiErrorBody(errorFields), {
          status: mapErrorCodeToHttpStatusCode(errorFields.errorCode),
          // 認証系はキャッシュさせない
          headers: createNoStoreHeaders(),
        });
        return errHttp(res, errorFields);
      }

      // 4) JSON body を安全に読み取る
      const rawBody = await safeReadJson<AuthSessionIssueRequest>(req);
      // Zod で検証
      const parsed = sessionIssueBodySchema.safeParse(rawBody);
      if (!parsed.success) {
        // 失敗レスポンス
        const errorFields = buildErrorFields(errorCode.VALIDATION_FAILED);
        const res = NextResponse.json(buildApiErrorBody(errorFields), {
          status: mapErrorCodeToHttpStatusCode(errorFields.errorCode),
          // 認証系はキャッシュさせない
          headers: createNoStoreHeaders(),
        });
        return errHttp(res, errorFields);
      }

      // 5) idToken を取り出す
      // - 値はログに出さない
      const idToken = parsed.data.idToken;

      // 6) idToken検証し、セッションCookie発行
      // - 値はログに出さない
      const issued = await issueAuthSessionCookie(issueSessionCookieDeps, {
        idToken,
        expiresInMs: SESSION_EXPIRES_IN_MS,
      });
      if (!issued.ok) {
        // 失敗レスポンス
        const res = NextResponse.json(buildApiErrorBody(issued.error), {
          status: mapErrorCodeToHttpStatusCode(issued.error.errorCode),
          // 認証系はキャッシュさせない
          headers: createNoStoreHeaders(),
        });
        return errHttp(res, issued.error);
      }

      // 7) セッションCookieをセット
      const data: AuthSessionIssueResponse = { issued: true };
      const res = NextResponse.json(buildApiOkBody(data), {
        status: 200,
        // 認証系はキャッシュさせない
        headers: createNoStoreHeaders(),
      });
      const options: SessionCookieOptions = {
        maxAgeSeconds: issued.value.maxAgeSeconds,
      };
      setSessionCookie({
        cookies: res.cookies,
        sessionCookieValue: issued.value.sessionCookieValue,
        options,
      });

      return okHttp(res);
    },
  );
}

/**
 * DELETE /api/auth/session
 *
 * 目的:
 * - 通常サインアウト（この端末の cookie を削除する）
 *
 * 方針:
 * - 冪等にする
 *   - cookie が無くても 200 を返す
 * - セキュリティ上、unsafe method 防御は必ず通す
 * - 返却は削除 Set-Cookie（Max-Age=0）で統一する
 */
export async function DELETE(req: NextRequest) {
  return await runRouteHandlerWithRequestSummary(
    req,
    {
      routePattern: AUTH_PATHS.session,
      // この時点ではユーザー確定前なので anonymous 固定
      createUserHash: () => "anonymous",
    },
    async () => {
      // 1) unsafe method 防御（CSRFトークン配布は使わない）
      const guardFailure = guardUnsafeMethodByFetchMetadataAndOrigin(req);
      if (guardFailure) {
        // 失敗レスポンス
        const res = NextResponse.json(
          buildApiErrorBody(guardFailure.errorFields),
          {
            status: guardFailure.httpStatus,
            // 認証系はキャッシュさせない
            headers: createNoStoreHeaders(),
          },
        );
        return errHttp(res, guardFailure.errorFields);
      }

      // 2) 成功レスポンスを作る
      // - cookie が無い場合でも成功にする（冪等）
      const data: AuthSessionDeleteResponse = { cleared: true };
      const res = NextResponse.json(buildApiOkBody(data), {
        status: 200,
        // 認証系はキャッシュさせない
        headers: createNoStoreHeaders(),
      });

      // 3) 削除 Set-Cookie を付与する
      // - ブラウザに対して Max-Age=0 を指示する
      deleteSessionCookie(res);

      return okHttp(res);
    },
  );
}
