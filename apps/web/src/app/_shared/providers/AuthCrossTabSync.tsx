// apps/web/src/app/_shared/providers/AuthCrossTabSync.tsx
// ========================================================
// 概要:
// - auth event の全タブ通知を受信し、認証状態を同期する
//
// 責務:
// - 受信時に認証系クエリを安全順で更新する
// - サインイン画面へ遷移する
// ========================================================

"use client";

import { ok } from "@packages/shared/src/result";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import * as React from "react";
import {
  AUTH_EVENT_TYPE,
  type AuthEventPayload,
  subscribeAuthEvents,
} from "@/frontend/entities/session/lib/cross-tab-auth-events";
import { SESSION_USER_QUERY_KEY } from "@/frontend/entities/user/model/session-user.query";
import { USER_ME_QUERY_KEY } from "@/frontend/entities/user/model/user-me.query";

function resolveRedirectPathForUnauthenticatedEvent(
  _event: AuthEventPayload,
): string {
  // 将来、account_deleted を専用画面に振り分ける場合はここだけ変更すればよい
  return "/sign-in";
}

export function AuthCrossTabSync() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isHandlingRef = React.useRef(false);

  React.useEffect(() => {
    return subscribeAuthEvents({
      onAuthEvent: async (event) => {
        // 1) 多重受信を抑止する
        if (isHandlingRef.current) return;
        isHandlingRef.current = true;

        try {
          // 2) signed_in は認証系 query を stale 化して、必要な画面だけ更新させる
          if (event.type === AUTH_EVENT_TYPE.SIGNED_IN) {
            await queryClient.invalidateQueries({
              queryKey: USER_ME_QUERY_KEY,
              exact: true,
            });
            await queryClient.invalidateQueries({
              queryKey: SESSION_USER_QUERY_KEY,
              exact: true,
            });
            return;
          }

          // 2) 競合回避のため、先に in-flight query を停止する
          // - TanStack Query の cancelQueries 推奨パターンに沿う（公式推奨）
          await queryClient.cancelQueries({
            queryKey: USER_ME_QUERY_KEY,
            exact: true,
          });
          await queryClient.cancelQueries({
            queryKey: SESSION_USER_QUERY_KEY,
            exact: true,
          });

          // 3) UI に即時反映するため null をセットする
          queryClient.setQueryData(USER_ME_QUERY_KEY, ok(null));
          queryClient.setQueryData(SESSION_USER_QUERY_KEY, ok(null));

          // 4) サインイン画面へ寄せる
          router.replace(resolveRedirectPathForUnauthenticatedEvent(event));
        } finally {
          // 5) 次回イベントを処理できるようロックを解除する
          isHandlingRef.current = false;
        }
      },
    });
  }, [queryClient, router]);

  return null;
}
