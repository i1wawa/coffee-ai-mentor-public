// apps/web/src/backend/identity/infrastructure/firebase/firebase-session-auth.adapter.server.ts
// ========================================================
// 概要:
// - Firebase Admin SDK で SessionAuthPort を実装する
//
// 責務:
// - session cookie を検証して SessionUser を返す（verifySessionCookie, checkRevoked=true）
// - idToken を検証し、session cookie を発行して値を返す（verifyIdToken -> createSessionCookie）
// - refresh token を revoke して全端末サインアウトする（revokeRefreshTokens）
// - Firebase 例外（auth/*）を ErrorFields に変換し、shouldClearSessionCookie を付けて返す
//
// 契約:
// - 返り値は Result で統一し、例外は投げない
// - 失敗時は { errorId, errorCode, shouldClearSessionCookie } を返す
// - shouldClearSessionCookie は「呼び出し側が session cookie を削除すべきか」を示す
// ========================================================

import "server-only";

import {
  buildErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { err, ok, type Result } from "@packages/shared/src/result";
import type { DecodedIdToken } from "firebase-admin/auth";
import type {
  SessionAuthError,
  SessionAuthPort,
  SessionUser,
} from "@/backend/identity/applications/session-auth.port";
import { adminAuth } from "@/backend/identity/infrastructure/firebase/admin.server";
import {
  FIREBASE_AUTH_OPERATION,
  mapFirebaseAuthError,
} from "@/backend/identity/infrastructure/firebase/firebase-auth-error.mapper.server";

/**
 * ErrorFields に shouldClearSessionCookie を付けて返す
 * - buildErrorFields は errorId を必ず生成してくれる
 * - ここでは行動情報だけ足す
 */
function buildSessionAuthError(args: {
  errorCode: (typeof errorCode)[keyof typeof errorCode];
  shouldClearSessionCookie: boolean;
}): SessionAuthError {
  // 1) errorId を生成する
  const base = buildErrorFields(args.errorCode);

  // 2) 行動情報を付与する
  return {
    ...base,
    shouldClearSessionCookie: args.shouldClearSessionCookie,
  };
}

/**
 * メール属性があるユーザーは、疎通確認済みであることを要求する
 * - email を使わない認証方式（匿名/電話など）はここでは拒否しない
 */
function hasUnverifiedEmailClaim(decoded: DecodedIdToken): boolean {
  return typeof decoded.email === "string" && decoded.email_verified !== true;
}

/**
 * adapter の factory
 * - SessionAuthPort を満たす関数群を返す
 * - 依存を差し替えたい場合は、この factory の引数に注入する形に拡張できる
 */
export function createFirebaseSessionAuthPort(): SessionAuthPort {
  return {
    /**
     * セッション cookie を検証してユーザー情報を返す
     */
    verifySessionUser: async (
      args,
    ): Promise<Result<SessionUser, SessionAuthError>> => {
      // 1) 念のため trim
      // - cookie が空白だけのケースを弾く
      const sessionCookieValue = args.sessionCookieValue.trim();

      // 2) 空なら「認証が必要」
      // - HTTP 境界が先に弾く設計でも、usecase/adapter は防御的にしておく
      if (!sessionCookieValue) {
        return err(
          buildSessionAuthError({
            errorCode: errorCode.AUTH_REQUIRED,
            shouldClearSessionCookie: false,
          }),
        );
      }

      // 3) Firebase Admin SDK で検証
      // - checkRevoked=true により revoked や user-disabled も検知できる
      // - リクエスト回数が増える点に注意（Cloud Run の実行時間 /Firebase の Identity Toolkit API の回数に影響）
      try {
        const decoded = await adminAuth.verifySessionCookie(
          sessionCookieValue,
          true,
        );

        // 4) メール属性がある場合は疎通確認済みを必須にする
        // - 未確認メールでの API 利用を防ぐ
        if (hasUnverifiedEmailClaim(decoded)) {
          return err(
            buildSessionAuthError({
              errorCode: errorCode.ACCESS_DENIED,
              // ポリシー違反のセッションは掃除して再発行を促す
              shouldClearSessionCookie: true,
            }),
          );
        }

        // 5) 必要最小限の情報だけ返す
        // - uid は必須
        // - email は null 許容
        return ok({
          uid: decoded.uid,
          email: (decoded.email ?? null) as string | null,
          authTimeSeconds:
            typeof decoded.auth_time === "number"
              ? decoded.auth_time
              : undefined,
        });
      } catch (e: unknown) {
        // 5) Firebase 例外をあなたの errorCode に変換する
        // - 行動が変わる分だけ分類する
        const mapped = mapFirebaseAuthError(
          e,
          FIREBASE_AUTH_OPERATION.VERIFY_SESSION_COOKIE,
        );

        // 6) port のエラー型に合わせる
        // - mapped.error は ErrorFields（errorId, errorCode）
        // - mapped.shouldClearSessionCookie は行動情報
        return err({
          ...mapped.error,
          shouldClearSessionCookie: mapped.shouldClearSessionCookie,
        });
      }
    },

    /**
     * ID token から session cookie を発行して値を返す
     * - Set-Cookie は HTTP 境界で行う
     */
    issueSessionCookie: async (
      args,
    ): Promise<Result<{ sessionCookieValue: string }, SessionAuthError>> => {
      // 1) 入力を軽く正規化
      const idToken = args.idToken.trim();

      // 2) expiresIn は 0 以下を弾く
      // - createSessionCookie は範囲外で例外になるので、ここで早めに 400 寄りにできる
      const expiresInMs = args.expiresInMs;

      // 3) token が空なら入力不正
      if (!idToken) {
        return err(
          buildSessionAuthError({
            errorCode: errorCode.VALIDATION_FAILED,
            shouldClearSessionCookie: false,
          }),
        );
      }

      // 4) expiresIn の基本検証
      if (!Number.isFinite(expiresInMs) || expiresInMs <= 0) {
        return err(
          buildSessionAuthError({
            errorCode: errorCode.VALIDATION_FAILED,
            shouldClearSessionCookie: false,
          }),
        );
      }

      // 5) まず verifyIdToken
      // - 壊れ token だと実測で auth/argument-error が出る
      // - mapper が operation に応じて 400/401 を分ける
      try {
        const decoded = await adminAuth.verifyIdToken(idToken);

        // 5-1) メール属性がある場合は疎通確認済みのみ session を発行する
        if (hasUnverifiedEmailClaim(decoded)) {
          return err(
            buildSessionAuthError({
              errorCode: errorCode.ACCESS_DENIED,
              shouldClearSessionCookie: false,
            }),
          );
        }
      } catch (e: unknown) {
        const mapped = mapFirebaseAuthError(
          e,
          FIREBASE_AUTH_OPERATION.VERIFY_ID_TOKEN,
        );

        // verifyIdToken は cookie削除の概念がないので false 固定
        return err({
          ...mapped.error,
          shouldClearSessionCookie: false,
        });
      }

      // 6) 次に createSessionCookie
      // - ここで expiresIn の範囲外や一時障害が起き得る
      try {
        const sessionCookieValue = await adminAuth.createSessionCookie(
          idToken,
          {
            expiresIn: expiresInMs,
          },
        );

        // 7) cookie 値だけ返す
        // - Set-Cookie は HTTP 境界が担当
        return ok({ sessionCookieValue });
      } catch (e: unknown) {
        const mapped = mapFirebaseAuthError(
          e,
          FIREBASE_AUTH_OPERATION.CREATE_SESSION_COOKIE,
        );

        // 発行処理でも cookie削除の概念はないので false 固定
        return err({
          ...mapped.error,
          shouldClearSessionCookie: false,
        });
      }
    },

    /**
     * refresh tokens を revoke する（全端末サインアウト）
     * - 盗難疑いのセキュリティ操作として、既存セッションを無効化する
     */
    revokeRefreshTokens: async (
      args,
    ): Promise<Result<null, SessionAuthError>> => {
      // 1) 入力の前処理
      // - 空白だけの uid を弾く
      const uid = args.uid.trim();

      // 2) uid が空なら入力不正
      // - ここで Firebase を呼ぶ前に落とす
      if (!uid) {
        return err(
          buildSessionAuthError({
            errorCode: errorCode.VALIDATION_FAILED,
            shouldClearSessionCookie: false,
          }),
        );
      }

      // 3) Firebase Admin SDK を呼ぶ
      // - revokeRefreshTokens はユーザー単位で効く
      // - 成功時の返り値は無いので null を返す
      try {
        await adminAuth.revokeRefreshTokens(uid);
        return ok(null);
      } catch (e: unknown) {
        // 4) Firebase 例外をアプリ共通の形式へ変換する
        const mapped = mapFirebaseAuthError(
          e,
          FIREBASE_AUTH_OPERATION.REVOKE_REFRESH_TOKENS,
        );

        // 5) port のエラー型に合わせて返す
        return err({
          ...mapped.error,
          shouldClearSessionCookie: mapped.shouldClearSessionCookie,
        });
      }
    },
  };
}
