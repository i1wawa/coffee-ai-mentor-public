// apps/web/src/frontend/features/auth/model/use-sign-out.hook.ts
// ========================================================
// 概要:
// - サインアウト系操作を UI から呼ぶための hook
//
// 責務:
// - 通常サインアウト / 全端末サインアウト mutation を提供する
// - 成功時の UI 寄り副作用（キャッシュ更新、refresh、遷移）を集約する
// ========================================================

import "client-only";

import { ok } from "@packages/shared/src/result";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { publishAuthSignedOut } from "@/frontend/entities/session/lib/cross-tab-auth-events";
import { SESSION_USER_QUERY_KEY } from "@/frontend/entities/user/model/session-user.query";
import { USER_ME_QUERY_KEY } from "@/frontend/entities/user/model/user-me.query";
import { UI_ERROR_ACTION } from "@/frontend/shared/errors/error-ui-action.mapper";
import type { UiResult } from "@/frontend/shared/errors/ui-result";
import { runBoundaryCallbackWithTelemetry } from "@/frontend/shared/observability/boundary-callback-telemetry";
import {
  TELEMETRY_LAYER,
  TELEMETRY_OPERATION,
} from "@/frontend/shared/observability/telemetry-tags";
import {
  revokeSessionAndClearClientState,
  signOutAndClearClientState,
} from "./sign-out";

type UseSignOutArgs = {
  redirectTo?: string;
};

type SignOutAction = "signOut" | "revoke";

type UseSignOutResult = {
  isPending: boolean;
  signOut: () => Promise<UiResult<void>>;
  revokeSession: () => Promise<UiResult<void>>;
};

/**
 * サインアウト系操作を UI から呼ぶための hook
 */
export function useSignOut(args: UseSignOutArgs): UseSignOutResult {
  const router = useRouter();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    // 1) mutationFn は Expected error を throw しない
    // - error は Result.ok false で返す
    mutationFn: async (action: SignOutAction): Promise<UiResult<void>> => {
      // 1-1) 全端末サインアウト
      if (action === "revoke") {
        return await revokeSessionAndClearClientState();
      }

      // 1-2) 通常サインアウト
      return await signOutAndClearClientState();
    },

    // 2) onSuccess は Promise が resolve したときに呼ばれる
    // - Result.ok false もここに入るため、ここで分岐する
    onSuccess: async (result, action) => {
      await runBoundaryCallbackWithTelemetry({
        operation:
          action === "revoke"
            ? TELEMETRY_OPERATION.REVOKE_SESSION
            : TELEMETRY_OPERATION.SIGN_OUT,
        layer: TELEMETRY_LAYER.BOUNDARY,
        fn: async () => {
          // 3) SIGN_IN は すでに未サインイン と同義なので成功扱いに寄せる
          // - cookie が無い等で signOut が失敗しても、UI上はサインアウト済みで良い
          if (!result.ok) {
            if (result.error.uiErrorAction !== UI_ERROR_ACTION.SIGN_IN) {
              return;
            }
          }

          // 4) 成功系（ok または SIGN_IN 扱い）では全タブへ通知する
          // - 他タブの stale な認証UIを即時に未サインインへ寄せる
          publishAuthSignedOut();

          // 5) 遷移がある場合は先に画面遷移し、遷移前画面のチラつきを防ぐ
          if (args.redirectTo) {
            router.push(args.redirectTo);
            // 遷移後の画面でサインアウト状態を反映させるため、ここでは UI 更新しない
            return;
          }

          // 6) サインアウト直後は認証系情報を再取得しない
          await queryClient.cancelQueries({
            queryKey: USER_ME_QUERY_KEY,
          });
          await queryClient.cancelQueries({
            queryKey: SESSION_USER_QUERY_KEY,
          });

          // 7) userMe / sessionUser を未サインイン（null）にして即座にUI反映する
          // - useUserMe / useSessionUser の queryFn 返り値に合わせて Result 形を保つ
          queryClient.setQueryData(USER_ME_QUERY_KEY, ok(null));
          queryClient.setQueryData(SESSION_USER_QUERY_KEY, ok(null));

          // 8) Server Component 側の状態も更新されるよう refresh する
          router.refresh();
        },
      });
    },
  });

  return {
    isPending: mutation.isPending,
    signOut: async () => await mutation.mutateAsync("signOut"),
    revokeSession: async () => await mutation.mutateAsync("revoke"),
  };
}
