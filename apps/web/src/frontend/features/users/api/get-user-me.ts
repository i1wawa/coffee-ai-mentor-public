// apps/web/src/frontend/features/users/api/get-user-me.ts
// ========================================================
// 概要:
// - 自分の情報（最低限 uid）を取得する
//
// 責務:
// - GET /api/users/me を呼び、レスポンス shape を Zod で検証する
// ========================================================

import "client-only";

import {
  USER_PATHS,
  type UserMeResponse,
} from "@contracts/src/users/users-contract";
import {
  buildErrorFields,
  type ErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { err, ok, type Result } from "@packages/shared/src/result";
import * as z from "zod";
import { getJson } from "@/frontend/shared/api/http-client";

export type UserMeDto = {
  uid: string;
};

// 未知キーを許容しつつ必須キーを検証する
const userMeResponseSchema = z.object({
  uid: z.string().trim().min(1),
}) satisfies z.ZodType<UserMeResponse>;

/**
 * 自分の情報を取得する
 *
 * 返り値:
 * - ok({ uid }): サインイン中
 * - err(ErrorFields): 未サインイン（401）や通信異常など
 *
 * 補足:
 * - 未サインインを null 扱いにするかどうかは hook 側で決める
 */
export async function getUserMe(): Promise<Result<UserMeDto, ErrorFields>> {
  // 1) API を呼ぶ
  const res = await getJson<unknown>({ url: USER_PATHS.me });
  if (!res.ok) return err(res.error);

  // 2) data を Zod で最小検証
  const parsed = userMeResponseSchema.safeParse(res.value);
  if (!parsed.success) {
    return err(buildErrorFields(errorCode.INTERNAL_ERROR));
  }

  // 3) 成功
  return ok({ uid: parsed.data.uid });
}
