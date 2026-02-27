// apps/web/src/frontend/features/users/model/use-user-me.hook.ts
// ========================================================
// 概要:
// - TanStack Query で /api/users/me を取得し、UI向けに提供する hook
//
// 責務:
// - /api/users/me の結果をキャッシュし、複数箇所から参照できる形にする
// - 未サインイン（SIGN_IN）は null 扱いにして UI 分岐を単純化する
// ========================================================

import "client-only";

import { ok } from "@packages/shared/src/result";
import { useQuery } from "@tanstack/react-query";
import { USER_ME_QUERY_KEY } from "@/frontend/entities/user/model/user-me.query";
import {
  UI_ERROR_ACTION,
  type UiErrorFields,
} from "@/frontend/shared/errors/error-ui-action.mapper";
import type { UiResult } from "@/frontend/shared/errors/ui-result";
import { runModelOperationWithTelemetry } from "@/frontend/shared/observability/model-operation-telemetry";
import { TELEMETRY_OPERATION } from "@/frontend/shared/observability/telemetry-tags";
import { getUserMe, type UserMeDto } from "../api/get-user-me";

type UseUserMeResult = {
  userMe: UserMeDto | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: UiErrorFields | null;
  refetch: () => void;
};

export function useUserMe(): UseUserMeResult {
  const query = useQuery({
    queryKey: USER_ME_QUERY_KEY,
    queryFn: async (): Promise<UiResult<UserMeDto | null>> => {
      // 1) api を呼ぶ
      const res = await runModelOperationWithTelemetry({
        operation: TELEMETRY_OPERATION.GET_USER_ME,
        fn: () => getUserMe(),
      });

      // 2) 未サインインは null 扱い
      if (!res.ok) {
        if (res.error.uiErrorAction === UI_ERROR_ACTION.SIGN_IN) {
          return ok(null);
        }
        return res;
      }

      // 3) サインイン中
      return ok(res.value);
    },
    staleTime: 0,
    retry: false,
    refetchOnMount: "always",
  });

  const userMe = query.data?.ok ? query.data.value : null;
  const error = query.data?.ok ? null : (query.data?.error ?? null);

  return {
    userMe,
    isAuthenticated: Boolean(userMe),
    isLoading: query.isLoading,
    error,
    refetch: () => {
      void query.refetch();
    },
  };
}
