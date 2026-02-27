// apps/web/src/app/api/users/me/route.ts
// ================================================================
// 概要:
// - 自分の情報取得 Route（Web向け）
//
// 外部契約の正本:
// - contracts/src/users/users-me.http.md
// - HTTP status / errorCode / Set-Cookie 契約の完全な一覧は上記を参照する
//
// 責務:
// 1) HTTP 境界のガード（unsafe method / cookie長さ）を適用する
// 2) usecase の Result を HTTP status / body / headers に写像する
// 3) shouldClearSessionCookie と成功時に応じて削除 Set-Cookie を返す
//
// 観測:
// - request.summary は wrapper が必ず 1 本出す
// - 401（未サインイン）は仕様上頻出のため、classify でノイズ制御する
// ================================================================

import {
  USER_PATHS,
  type UserMeDeleteResponse,
  type UserMeResponse,
} from "@contracts/src/users/users-contract";
import {
  deriveSeverityBase,
  type RequestSummaryClassification,
  type RequestSummaryObservation,
} from "@packages/observability/src/logging/request-summary";
import { LOG_SEVERITY } from "@packages/observability/src/logging/telemetry-common";
import {
  buildErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { mapErrorCodeToHttpStatusCode } from "@packages/observability/src/logging/telemetry-error-http-mapping";
import { errHttp, okHttp } from "@packages/shared/src/result";
import { type NextRequest, NextResponse } from "next/server";
import { createIdentityDeps } from "@/backend/composition/identity.composition.server";
import { deleteUserMe } from "@/backend/identity/applications/delete-user-me.usecase.server";
import { getSessionUser } from "@/backend/identity/applications/get-session-user.usecase.server";
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

// Next.jsのランタイムをNode.jsに指定
export const runtime = "nodejs";
// Next.jsのキャッシュ設定を動的にする
export const dynamic = "force-dynamic";

// recent login の許容幅（5分）
// - 削除はセンシティブ操作のため、直近サインインした本人に限定したい
// - authTime は秒なので、比較はミリ秒へ変換して行う（usecase側）
const RECENT_AUTH_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * /api/users/me 用の分類（severity）上書き。
 *
 * 方針:
 * - cookie無しの 401（AUTH_REQUIRED）は仕様通り扱いに寄せて INFO
 * - 無効cookieの 401（AUTH_INVALID）は調査対象になり得るため WARNING
 */
function classifyUserMe(
  obs: RequestSummaryObservation,
): RequestSummaryClassification {
  // cookie無しの 401（AUTH_REQUIRED）は仕様通り扱いに寄せて INFO
  if (
    obs.httpStatusCode ===
      mapErrorCodeToHttpStatusCode(errorCode.AUTH_REQUIRED) &&
    obs.errorCode === errorCode.AUTH_REQUIRED
  ) {
    return { severity: LOG_SEVERITY.INFO };
  }
  // 無効cookieの 401（AUTH_INVALID）は調査対象になり得るため WARNING
  if (
    obs.httpStatusCode ===
      mapErrorCodeToHttpStatusCode(errorCode.AUTH_INVALID) &&
    obs.errorCode === errorCode.AUTH_INVALID
  ) {
    return { severity: LOG_SEVERITY.WARNING };
  }

  // それ以外は基本方針に従う
  return { severity: deriveSeverityBase(obs.httpStatusCode) };
}

/**
 * GET /api/users/me
 * - session cookie を検証し、ユーザー情報を返す
 */
export async function GET(request: NextRequest) {
  // セッション検証後に userHash を確定させるため、外側変数で保持する
  let computedUserHash: string | undefined;

  // 0) Composition Root で依存を合成する
  const { getSessionUserDeps } = createIdentityDeps();

  return await runRouteHandlerWithRequestSummary(
    request,
    {
      routePattern: USER_PATHS.me,
      // この時点ではユーザー確定前なので anonymous 固定
      createUserHash: () => "anonymous",
      // 検証後に uid をsha化した userHash へ差し替える
      overrideUserHash: () => computedUserHash,
      // 401ノイズを制御
      classify: classifyUserMe,
    },
    async () => {
      // 1) session cookie 取得
      const sessionCookie = parseTrimmedString(
        request.cookies.get(SESSION_COOKIE_NAME)?.value,
      );

      // 2) 異常に長い cookie は早期に無効cookieとして扱う
      // - 理由: SDK に渡す前に落とす（DoS/無駄な例外ログを減らす）
      // - 契約: 無効cookieは 401（条件付きで削除 Set-Cookie）
      if (isStringTooLong(sessionCookie, MAX_SESSION_COOKIE_CHARS)) {
        const error = buildErrorFields(errorCode.AUTH_INVALID);
        const res = NextResponse.json(buildApiErrorBody(error), {
          status: mapErrorCodeToHttpStatusCode(error.errorCode),
          // 認証系はキャッシュさせない
          headers: createNoStoreHeaders(),
        });

        // cookieが付いてきたのに無効扱い → 削除cookieを返す
        deleteSessionCookie(res);

        return errHttp(res, error);
      }

      // 3) cookie検証（無効なら条件付きで削除cookie）
      const result = await getSessionUser(getSessionUserDeps, {
        sessionCookieValue: sessionCookie,
      });
      if (!result.ok) {
        const res = NextResponse.json(buildApiErrorBody(result.error), {
          status: mapErrorCodeToHttpStatusCode(result.error.errorCode),
          // 認証系はキャッシュさせない
          headers: createNoStoreHeaders(),
        });

        // cookie削除は port の行動フラグに従う
        // - 無効cookieなら削除
        // - 一時障害やレート制限では削除しない
        if (result.error.shouldClearSessionCookie) {
          deleteSessionCookie(res);
        }

        return errHttp(res, result.error);
      }

      // 4) 検証成功後に userHash を確定（uidはログに出さない）
      computedUserHash = hashUidToUserHash(result.value.uid);

      // 5) 成功レスポンス
      const resBody: UserMeResponse = { uid: result.value.uid };
      const res = NextResponse.json(buildApiOkBody(resBody), {
        status: 200,
        // 認証系はキャッシュさせない
        headers: createNoStoreHeaders(),
      });

      return okHttp(res);
    },
  );
}

/**
 * DELETE /api/users/me
 * - 自分のアカウントを削除する
 */
export async function DELETE(request: NextRequest) {
  // セッション検証後に userHash を確定させるため、外側変数で保持する
  let computedUserHash: string | undefined;

  // 0) Composition Root で依存を合成する
  const { deleteUserMeDeps } = createIdentityDeps();

  return await runRouteHandlerWithRequestSummary(
    request,
    {
      routePattern: USER_PATHS.me,
      createUserHash: () => "anonymous",
      overrideUserHash: () => computedUserHash,
    },
    async () => {
      // 1) unsafe method 防御
      // - 削除は unsafe method なので cross-site を拒否する
      const guardFailure = guardUnsafeMethodByFetchMetadataAndOrigin(request);
      if (guardFailure) {
        const res = NextResponse.json(
          buildApiErrorBody(guardFailure.errorFields),
          {
            status: guardFailure.httpStatus,
            headers: createNoStoreHeaders(),
          },
        );
        return errHttp(res, guardFailure.errorFields);
      }

      // 2) session cookie 取得
      const sessionCookie = parseTrimmedString(
        request.cookies.get(SESSION_COOKIE_NAME)?.value,
      );

      // 3) 異常に長い cookie は早期に無効cookieとして扱う
      if (isStringTooLong(sessionCookie, MAX_SESSION_COOKIE_CHARS)) {
        const error = buildErrorFields(errorCode.AUTH_INVALID);
        const res = NextResponse.json(buildApiErrorBody(error), {
          status: mapErrorCodeToHttpStatusCode(error.errorCode),
          headers: createNoStoreHeaders(),
        });
        deleteSessionCookie(res);
        return errHttp(res, error);
      }

      // 4) usecase を呼ぶ
      // - cookie無し判定は usecase 側に一本化する
      const result = await deleteUserMe(deleteUserMeDeps, {
        sessionCookieValue: sessionCookie,
        recentAuthMaxAgeMs: RECENT_AUTH_MAX_AGE_MS,
      });

      // 5) 失敗時
      if (!result.ok) {
        const res = NextResponse.json(buildApiErrorBody(result.error), {
          status: mapErrorCodeToHttpStatusCode(result.error.errorCode),
          headers: createNoStoreHeaders(),
        });

        // 失敗原因に応じて cookie を掃除する
        // - shouldClearSessionCookie=true は、cookie を保持すると 401 ループしやすいケース
        // - recent login 不足は、ユーザーがログイン中のまま再認証に進めるよう cookie は残す
        if (result.error.shouldClearSessionCookie) {
          deleteSessionCookie(res);
        }

        return errHttp(res, result.error);
      }

      // 6) 成功時は userHash を確定する
      computedUserHash = hashUidToUserHash(result.value.uid);

      // 7) 成功レスポンス
      const data: UserMeDeleteResponse = { deleted: true };
      const res = NextResponse.json(buildApiOkBody(data), {
        status: 200,
        headers: createNoStoreHeaders(),
      });

      // 8) 端末側 cookie を削除する
      // - 削除後はこの端末も確実にサインアウトさせる
      deleteSessionCookie(res);

      return okHttp(res);
    },
  );
}
