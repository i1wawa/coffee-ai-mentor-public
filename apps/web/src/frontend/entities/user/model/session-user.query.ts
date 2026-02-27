// apps/web/src/frontend/entities/user/model/session-user.query.ts
// ===================================================================
// 概要:
// - セッションユーザー取得クエリの共通定義
//
// 責務:
// - queryKey を一箇所に集約する
// - useQuery で再利用する共通オプションを提供する
// ===================================================================

import { queryOptions } from "@tanstack/react-query";
import type { UiResult } from "@/frontend/shared/errors/ui-result";
import type { SessionUserDto } from "../api/get-session-user";

export const SESSION_USER_QUERY_KEY = ["auth", "sessionUser"] as const;

type SessionUserQueryFn = () => Promise<UiResult<SessionUserDto | null>>;

type SessionUserQueryOptionsArgs = {
  queryFn: SessionUserQueryFn;
};

export function sessionUserQueryOptions(args: SessionUserQueryOptionsArgs) {
  return queryOptions({
    queryKey: SESSION_USER_QUERY_KEY,
    queryFn: args.queryFn,
    staleTime: 0,
    retry: false,
    refetchOnMount: "always",
  });
}
