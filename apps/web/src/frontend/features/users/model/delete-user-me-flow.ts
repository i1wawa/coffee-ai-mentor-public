// apps/web/src/frontend/features/users/model/delete-user-me-flow.ts
// ================================================================
// 概要:
// - アカウント削除の実行フロー
//
// 責務:
// - deleteUserMe を安全実行して UiResult に畳み込む
// - recent login 不足時の再認証（Popup + session再発行）を提供する
//
// 非目的:
// - 画面遷移やキャッシュ更新（hook の責務）
// - 確認入力や表示（ui の責務）
// ================================================================

import "client-only";

import type { AuthProvider } from "firebase/auth";
import { reauthenticateWithPopupAndIssueSessionCookie } from "@/frontend/features/auth/model/reauthenticate-with-popup-and-issue-session-cookie";
import type { ModelResult } from "@/frontend/shared/errors/telemetry-error-result";
import type { UiResult } from "@/frontend/shared/errors/ui-result";
import { runModelOperationWithTelemetry } from "@/frontend/shared/observability/model-operation-telemetry";
import { TELEMETRY_OPERATION } from "@/frontend/shared/observability/telemetry-tags";
import { deleteUserMe } from "../api/delete-user-me";

/**
 * アカウント削除（再認証なし）
 */
export async function deleteUserMeOnce(): Promise<UiResult<void>> {
  return await runModelOperationWithTelemetry({
    operation: TELEMETRY_OPERATION.DELETE_USER_ME,
    fn: async (): Promise<ModelResult<void>> => {
      return await deleteUserMe();
    },
  });
}

/**
 * 再認証してからアカウント削除を実行する
 */
export async function reauthenticateAndDeleteUserMe(args: {
  provider: AuthProvider;
}): Promise<UiResult<void>> {
  // 1) 再認証して session cookie を再発行する
  const reauthed = await runModelOperationWithTelemetry({
    operation: TELEMETRY_OPERATION.REAUTHENTICATE_WITH_POPUP,
    fn: async (): Promise<ModelResult<void>> => {
      return await reauthenticateWithPopupAndIssueSessionCookie({
        provider: args.provider,
      });
    },
  });
  if (!reauthed.ok) return reauthed;

  // 2) 再認証後に削除を再試行する
  return await deleteUserMeOnce();
}
