// apps/web/src/frontend/features/users/model/use-delete-user-me-flow.hook.ts
// ================================================================
// 概要:
// - アカウント削除フローを UI から呼び出すための hook
//
// 責務:
// - model のフロー呼び出しを mutation に包む
// - 成功時の共通副作用（Firebase signOut / 他タブ通知 / 観測）を集約する
// ================================================================

import "client-only";

import { useMutation } from "@tanstack/react-query";
import type { AuthProvider } from "firebase/auth";
import { publishAuthAccountDeleted } from "@/frontend/entities/session/lib/cross-tab-auth-events";
import type { UiResult } from "@/frontend/shared/errors/ui-result";
import { signOutFirebase } from "@/frontend/shared/firebase/firebase-auth";
import { runBoundaryCallbackWithTelemetry } from "@/frontend/shared/observability/boundary-callback-telemetry";
import { captureErrorToSentry } from "@/frontend/shared/observability/sentry.client";
import {
  TELEMETRY_LAYER,
  TELEMETRY_OPERATION,
} from "@/frontend/shared/observability/telemetry-tags";
import {
  deleteUserMeOnce,
  reauthenticateAndDeleteUserMe,
} from "./delete-user-me-flow";

type DeleteUserMeFlowArgs = {
  reauthProvider: AuthProvider;
};

type DeleteUserMeAction = "delete" | "reauthenticateAndDelete";

type UseDeleteUserMeFlowResult = {
  isPending: boolean;
  deleteOnce: () => Promise<UiResult<void>>;
  reauthenticateAndDelete: () => Promise<UiResult<void>>;
};

/**
 * アカウント削除フローを UI から呼び出すための hook
 * - 再認証してからアカウント削除も扱う
 */
export function useDeleteUserMeFlow(
  args: DeleteUserMeFlowArgs,
): UseDeleteUserMeFlowResult {
  const mutation = useMutation({
    mutationFn: async (action: DeleteUserMeAction): Promise<UiResult<void>> => {
      if (action === "reauthenticateAndDelete") {
        return await reauthenticateAndDeleteUserMe({
          provider: args.reauthProvider,
        });
      }
      return await deleteUserMeOnce();
    },

    onSuccess: async (result) => {
      await runBoundaryCallbackWithTelemetry({
        operation: TELEMETRY_OPERATION.DELETE_USER_ME,
        layer: TELEMETRY_LAYER.BOUNDARY,
        fn: async () => {
          // 1) 失敗は UI 側で表示する
          if (!result.ok) return;

          // 2) Firebase Auth の in-memory 状態もベストエフォートでクリアする
          // - 失敗しても cookie が消えていれば UI は未認証で良い
          const firebase = await signOutFirebase();
          if (!firebase.ok) {
            // Firebase の失敗は成功扱いのまま観測へ送る
            captureErrorToSentry({
              operation: TELEMETRY_OPERATION.DELETE_USER_ME,
              layer: TELEMETRY_LAYER.SDK,
              error: firebase.error,
            });
          }

          // 3) 成功時は他タブへ「アカウント削除完了」を通知する
          // - 送信タブの UI 遷移/同期タイミングは呼び出し側で制御する
          publishAuthAccountDeleted();
        },
      });
    },
  });

  return {
    isPending: mutation.isPending,
    deleteOnce: async () => await mutation.mutateAsync("delete"),
    reauthenticateAndDelete: async () =>
      await mutation.mutateAsync("reauthenticateAndDelete"),
  };
}
