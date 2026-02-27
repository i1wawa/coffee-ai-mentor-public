// apps/web/src/backend/identity/infrastructure/firebase/firebase-identity-admin.adapter.server.ts
// ========================================================
// 概要:
// - Firebase Admin SDK で IdentityAdminPort を実装する
//
// 責務:
// - idToken を検証し、退会などのセンシティブ操作で必要な最小情報を返す
// - uid を指定してユーザーを削除する
// - Firebase 例外（auth/*）を ErrorFields に変換し、shouldClearSessionCookie を付けて返す
// ========================================================

import "server-only";

import {
  buildErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { err, ok, type Result } from "@packages/shared/src/result";
import type { DecodedIdToken } from "firebase-admin/auth";
import type { IdentityAdminPort } from "@/backend/identity/applications/identity-admin.port";
import type { SessionAuthError } from "@/backend/identity/applications/session-auth.port";
import { adminAuth } from "@/backend/identity/infrastructure/firebase/admin.server";
import {
  FIREBASE_AUTH_OPERATION,
  mapFirebaseAuthError,
} from "@/backend/identity/infrastructure/firebase/firebase-auth-error.mapper.server";

/**
 * メール属性があるユーザーは、疎通確認済みであることを要求する
 */
function hasUnverifiedEmailClaim(decoded: DecodedIdToken): boolean {
  return typeof decoded.email === "string" && decoded.email_verified !== true;
}

/**
 * adapter の factory
 * - IdentityAdminPort を満たす関数群を返す
 * - 依存を差し替えたい場合は、この factory の引数に注入する形に拡張できる
 */
export function createFirebaseIdentityAdminPort(): IdentityAdminPort {
  return {
    verifyIdTokenForSensitiveAction: async (
      args,
    ): Promise<
      Result<{ uid: string; authTimeSeconds: number | null }, SessionAuthError>
    > => {
      // 1) 入力の前処理
      // - 外部入力をそのまま信用しない
      const idToken = args.idToken.trim();

      // 2) 空なら入力不正
      if (!idToken) {
        return err({
          ...buildErrorFields(errorCode.VALIDATION_FAILED),
          shouldClearSessionCookie: false,
        });
      }

      try {
        // 3) Firebase Admin SDK で検証
        // - 署名/期限/発行元などを検証し、成功時は decoded token を得る
        // - checkRevoked=true により、失効や無効化なども検知できる（公式推奨）
        const decoded = await adminAuth.verifyIdToken(idToken, true);

        // 4) メール属性がある場合は疎通確認済みを必須にする
        if (hasUnverifiedEmailClaim(decoded)) {
          return err({
            ...buildErrorFields(errorCode.ACCESS_DENIED),
            shouldClearSessionCookie: false,
          });
        }

        // 5) 退会ユースケースで必要な最小限だけ返す
        return ok({
          uid: decoded.uid,
          // authTime は verifyIdToken の戻り値で、epoch 秒（ミリ秒ではない）
          // - recent login 判定のために使う
          authTimeSeconds:
            typeof decoded.auth_time === "number" ? decoded.auth_time : null,
        });
      } catch (e: unknown) {
        // 6) Firebase 例外をアプリ共通のエラー形式へ変換する
        // - cookie削除の判断は mapper の shouldClearSessionCookie を使う
        const mapped = mapFirebaseAuthError(
          e,
          FIREBASE_AUTH_OPERATION.VERIFY_ID_TOKEN,
        );
        return err({
          ...mapped.error,
          shouldClearSessionCookie: mapped.shouldClearSessionCookie,
        });
      }
    },

    deleteUser: async (args): Promise<Result<null, SessionAuthError>> => {
      // 1) 入力の前処理
      const uid = args.uid.trim();

      // 2) 空なら入力不正
      if (!uid) {
        return err({
          ...buildErrorFields(errorCode.VALIDATION_FAILED),
          shouldClearSessionCookie: false,
        });
      }

      try {
        // 3) Firebase Admin SDK でユーザーを削除する
        // - ユーザー向け退会（ハード削除）の中核
        await adminAuth.deleteUser(uid);
        return ok(null);
      } catch (e: unknown) {
        // 4) Firebase 例外をアプリ共通のエラー形式へ変換する
        // - 例: user-not-found は AUTH_INVALID に分類し、cookie掃除を促す
        const mapped = mapFirebaseAuthError(
          e,
          FIREBASE_AUTH_OPERATION.DELETE_USER,
        );
        return err({
          ...mapped.error,
          shouldClearSessionCookie: mapped.shouldClearSessionCookie,
        });
      }
    },
  };
}
