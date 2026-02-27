// apps/web/src/app/api/auth/session/revoke/route.ts
// ================================================================
// 概要:
// - セキュリティ用サインアウト Route（全端末サインアウト / 盗難疑い）
//
// 外部契約の正本:
// - contracts/src/auth/auth-session-revoke.http.md
// - HTTP status / errorCode / Set-Cookie 契約の完全な一覧は上記を参照する
//
// 責務:
// 1) HTTP 境界のガード（unsafe method / cookie長さ）を適用する
// 2) usecase の Result を HTTP status / body / headers に写像する
// 3) ガード通過時は必ず削除 Set-Cookie を返して端末側 cookie を掃除する
//
// 観測:
// - request.summary は wrapper が必ず 1 本出す
// ================================================================

/* eslint-disable import/no-default-export */

import {
  AUTH_PATHS,
  type AuthSessionRevokeResponse,
} from "@contracts/src/auth/auth-contract";
import { errorCode } from "@packages/observability/src/logging/telemetry-error-common";
import { mapErrorCodeToHttpStatusCode } from "@packages/observability/src/logging/telemetry-error-http-mapping";
import { errHttp, okHttp } from "@packages/shared/src/result";
import { type NextRequest, NextResponse } from "next/server";
import { createIdentityDeps } from "@/backend/composition/identity.composition.server";
import { revokeAuthSession } from "@/backend/identity/applications/revoke-auth-session.usecase.server";
import {
  buildApiErrorBody,
  buildApiOkBody,
} from "@/backend/shared/http/api-response";
import {
  deleteSessionCookie,
  SESSION_COOKIE_NAME,
} from "@/backend/shared/http/cookies";
import {
  createNoStoreHeaders,
  isStringTooLong,
  MAX_SESSION_COOKIE_CHARS,
  parseTrimmedString,
} from "@/backend/shared/http/request.guard.server";
import { guardUnsafeMethodByFetchMetadataAndOrigin } from "@/backend/shared/http/request-origin.guard";
import { runRouteHandlerWithRequestSummary } from "@/backend/shared/observability/request-summary";
import { hashUidToUserHash } from "@/backend/shared/observability/user-hash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildRevokedOkResponse() {
  const data: AuthSessionRevokeResponse = { revoked: true };
  const res = NextResponse.json(buildApiOkBody(data), {
    status: 200,
    // 認証系はキャッシュさせない
    headers: createNoStoreHeaders(),
  });
  // ガード通過後は常に端末側 cookie を掃除する
  deleteSessionCookie(res);
  return res;
}

/**
 * POST /api/auth/session/revoke
 *
 * 契約:
 * - Success: 200 + 削除 Set-Cookie（Max-Age=0）
 * - Failure: 4xx/5xx（ガード失敗や一時障害など）
 *
 * セキュリティ:
 * - unsafe method は Fetch Metadata（Sec-Fetch-Site）を優先し、Origin/Referer をフォールバックに cross-site を拒否する
 * - cookie/uid はログに出さない
 */
export async function POST(request: NextRequest) {
  // 1) セッション検証後に userHash を確定させるため保持する
  let computedUserHash: string | undefined;

  // 2) deps を合成する
  const { revokeAuthSessionDeps: revokeSessionDeps } = createIdentityDeps();

  return await runRouteHandlerWithRequestSummary(
    request,
    {
      routePattern: AUTH_PATHS.revoke,
      // この時点ではユーザー確定前なので anonymous 固定
      createUserHash: () => "anonymous",
      // 成功後に uid をsha化した userHash へ差し替える
      overrideUserHash: () => computedUserHash,
    },
    async () => {
      // 3) unsafe method 防御
      // - cross-site からの revoke を拒否する
      const guardFailure = guardUnsafeMethodByFetchMetadataAndOrigin(request);
      if (guardFailure) {
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

      // 4) session cookie を取得する
      // - 値はログに出さない
      const sessionCookie = parseTrimmedString(
        request.cookies.get(SESSION_COOKIE_NAME)?.value,
      );

      // 5) 異常に長い cookie は未認証相当として no-op 成功に寄せる
      // - API 契約を冪等に保つため、成功レスポンスを返して端末cookieを掃除する
      if (isStringTooLong(sessionCookie, MAX_SESSION_COOKIE_CHARS)) {
        return okHttp(buildRevokedOkResponse());
      }

      // 6) usecase を呼ぶ
      // - cookie無し判定は usecase 側に一本化する
      // - session 検証して uid を得て、revoke を実行する
      const result = await revokeAuthSession(revokeSessionDeps, {
        sessionCookieValue: sessionCookie,
      });

      // 7) 失敗時
      if (!result.ok) {
        // 7-1) 未認証系エラーは no-op 成功へ寄せる
        // - cookie 競合や多重実行でも API 契約を冪等に保つ
        if (
          result.error.errorCode === errorCode.AUTH_REQUIRED ||
          result.error.errorCode === errorCode.AUTH_INVALID
        ) {
          return okHttp(buildRevokedOkResponse());
        }

        // 7-2) 一時障害などは失敗を返す
        const res = NextResponse.json(buildApiErrorBody(result.error), {
          status: mapErrorCodeToHttpStatusCode(result.error.errorCode),
          // 認証系はキャッシュさせない
          headers: createNoStoreHeaders(),
        });

        // ガード通過後なので端末側の cookie は掃除する
        deleteSessionCookie(res);

        return errHttp(res, result.error);
      }

      // 8) 成功時は userHash を確定する
      // - uid はログに出さず、sha化して観測に使う
      computedUserHash = hashUidToUserHash(result.value.uid);

      // 9) 成功レスポンス
      return okHttp(buildRevokedOkResponse());
    },
  );
}
