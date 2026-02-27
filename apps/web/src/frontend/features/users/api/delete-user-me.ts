// apps/web/src/frontend/features/users/api/delete-user-me.ts
// ========================================================
// 概要:
// - アカウント削除（自分）を実行する
//
// 責務:
// - DELETE /api/users/me を呼び、レスポンス shape を Zod で検証する
// ========================================================

import "client-only";

import {
  USER_PATHS,
  type UserMeDeleteResponse,
} from "@contracts/src/users/users-contract";
import {
  buildErrorFields,
  type ErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { err, ok, type Result } from "@packages/shared/src/result";
import * as z from "zod";
import { deleteJson } from "@/frontend/shared/api/http-client";

// 未知キーを許容しつつ必須キーを検証する
const userMeDeleteResponseSchema = z.object({
  deleted: z.literal(true),
}) satisfies z.ZodType<UserMeDeleteResponse>;

/**
 * アカウント削除（自分）を実行する
 */
export async function deleteUserMe(): Promise<Result<void, ErrorFields>> {
  // 1) API を呼ぶ
  // - body を送らない（cookie のみ）
  const res = await deleteJson<unknown>({ url: USER_PATHS.me });
  if (!res.ok) return err(res.error);

  // 2) data を Zod で最小検証
  const parsed = userMeDeleteResponseSchema.safeParse(res.value);
  if (!parsed.success) {
    return err(buildErrorFields(errorCode.INTERNAL_ERROR));
  }

  // 3) 成功
  return ok(undefined);
}
