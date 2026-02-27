// apps/web/src/frontend/features/auth/model/use-session-user.hook.ts
// ========================================================
// 概要:
// - TanStack Query で /api/auth/session を取得し、UI向けにサインイン状態を提供する hook
//
// 責務:
// - /api/auth/session の結果をキャッシュし、複数箇所から軽量に参照できる形にする
// - SIGN_IN（未ログイン導線）のエラーは未サインイン（null）として扱い、UI分岐を単純化する
// - それ以外の失敗は UI を止めずに未サインイン相当で継続する（上位の方針に合わせる）
// ========================================================

import "client-only";

import { ok } from "@packages/shared/src/result";
import { useQuery } from "@tanstack/react-query";
import {
  getSessionUser,
  type SessionUserDto,
} from "@/frontend/entities/user/api/get-session-user";
import { sessionUserQueryOptions } from "@/frontend/entities/user/model/session-user.query";
import {
  UI_ERROR_ACTION,
  type UiErrorFields,
} from "@/frontend/shared/errors/error-ui-action.mapper";
import type { UiResult } from "@/frontend/shared/errors/ui-result";
import { runModelOperationWithTelemetry } from "@/frontend/shared/observability/model-operation-telemetry";
import { TELEMETRY_OPERATION } from "@/frontend/shared/observability/telemetry-tags";

type UseSessionUserResult = {
  // 未サインインなら null
  sessionUser: SessionUserDto | null;
  // UI で使いやすい boolean
  isAuthenticated: boolean;
  // 初回取得中など
  isLoading: boolean;
  // 再取得中
  // - 再試行ボタンの連打防止に使う
  isRefetching: boolean;
  // 通信異常など（未サインインは error にしない）
  error: UiErrorFields | null;
  // 再取得
  // - Header の再試行ボタン等で使う
  refetch: () => void;
};

/**
 * 現在のユーザー（セッション）を取得する hook
 */
export function useSessionUser(): UseSessionUserResult {
  const query = useQuery(
    sessionUserQueryOptions({
      queryFn: async (): Promise<UiResult<SessionUserDto | null>> => {
        // 1) api を呼ぶ
        // - 例外が出ても UiResult に畳み込む
        const res = await runModelOperationWithTelemetry({
          operation: TELEMETRY_OPERATION.GET_SESSION_USER,
          fn: () => getSessionUser(),
        });

        // 2) 未サインインは null 扱いにして UI を簡潔にする
        if (!res.ok) {
          if (res.error.uiErrorAction === UI_ERROR_ACTION.SIGN_IN) {
            return ok(null);
          }

          // 3) それ以外のエラーは、ヘッダー上は未サインイン相当で継続する
          // - UI を止めるかどうかは上位で決める
          return res;
        }

        // 4) サインイン中
        return ok(res.value);
      },
    }),
  );

  // 5) query.data は UiResult をキャッシュしている前提
  const sessionUser = query.data?.ok ? query.data.value : null;
  const error = query.data?.ok ? null : (query.data?.error ?? null);

  return {
    sessionUser: sessionUser,
    isAuthenticated: Boolean(sessionUser),
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    error,
    refetch: () => {
      // 1) Promise は呼び出し側で待たない
      // - UI が固まらないようにする
      void query.refetch();
    },
  };
}
