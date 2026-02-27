// apps/web/src/frontend/features/auth/model/sign-out.ts
// ========================================================
// 概要:
// - サインアウト処理の「実行ロジック」だけをまとめたモデル層の関数
//
// 責務:
// - signOut API でサーバセッション cookie を削除する
// - Firebase Auth の in-memory 状態はベストエフォートでクリアする
// ========================================================

import "client-only";

import { err, ok } from "@packages/shared/src/result";
import type { ModelResult } from "@/frontend/shared/errors/telemetry-error-result";
import type { UiResult } from "@/frontend/shared/errors/ui-result";
import { signOutFirebase } from "@/frontend/shared/firebase/firebase-auth";
import { runModelOperationWithTelemetry } from "@/frontend/shared/observability/model-operation-telemetry";
import { captureErrorToSentry } from "@/frontend/shared/observability/sentry.client";
import { TELEMETRY_OPERATION } from "@/frontend/shared/observability/telemetry-tags";
import { revokeSession } from "../api/revoke-session";
import { signOut } from "../api/sign-out";

/**
 * サインアウト処理（API + Firebase）を実行する。
 */
export async function signOutAndClearClientState(): Promise<UiResult<void>> {
  return runModelOperationWithTelemetry({
    operation: TELEMETRY_OPERATION.SIGN_OUT,
    fn: async (): Promise<ModelResult<void>> => {
      // 1) サーバセッション cookie を削除する
      const res = await signOut();
      if (!res.ok) return err(res.error);

      // 2) Firebase Auth も in-memory 状態をクリアする
      // - 失敗してもサーバ cookie は消えているため、ここでは失敗にしない
      const firebase = await signOutFirebase();
      if (!firebase.ok) {
        // Firebase の失敗は成功扱いのまま観測へ送る
        captureErrorToSentry({
          operation: TELEMETRY_OPERATION.SIGN_OUT,
          layer: "sdk",
          error: firebase.error,
        });
      }

      return ok(undefined);
    },
  });
}

/**
 * セキュリティ用サインアウト（全端末）を実行する
 */
export async function revokeSessionAndClearClientState(): Promise<
  UiResult<void>
> {
  return runModelOperationWithTelemetry({
    operation: TELEMETRY_OPERATION.REVOKE_SESSION,
    fn: async (): Promise<ModelResult<void>> => {
      // 1) 全端末サインアウトを実行する
      const res = await revokeSession();
      if (!res.ok) return err(res.error);

      // 2) Firebase Auth をベストエフォートでクリアする
      const firebase = await signOutFirebase();
      if (!firebase.ok) {
        // Firebase の失敗は成功扱いのまま観測へ送る
        captureErrorToSentry({
          operation: TELEMETRY_OPERATION.REVOKE_SESSION,
          layer: "sdk",
          error: firebase.error,
        });
      }

      return ok(undefined);
    },
  });
}
