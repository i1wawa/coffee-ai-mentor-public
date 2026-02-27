// apps/web/src/frontend/entities/user/api/get-session-user.ts
// ========================================================
// 概要:
// - 現在サインインしているユーザー（セッション）を取得する
//
// 責務:
// - GET /api/auth/session を呼び、レスポンスの shape を Zod で検証する
// ========================================================

import "client-only";

import { AUTH_PATHS } from "@contracts/src/auth/auth-contract";
import {
  buildErrorFields,
  type ErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { err, ok, type Result } from "@packages/shared/src/result";
import * as z from "zod";
import { getJson } from "@/frontend/shared/api/http-client";

export type SessionUserDto = {
  uid: string;
};

// 未知キーを許容しつつ必須キーを検証する
const authSessionResponseSchema = z.union([
  z.object({
    authenticated: z.literal(true),
    user: z.object({
      uid: z.string().trim().min(1),
    }),
  }),
  z.object({
    authenticated: z.literal(false),
    user: z.null(),
  }),
]);

/**
 * 現在のユーザー（セッション）を取得する
 *
 * 返り値:
 * - ok({ uid }): サインイン中
 * - ok(null): 未サインイン
 * - err(ErrorFields): それ以外の失敗（通信障害など）
 */
export async function getSessionUser(): Promise<
  Result<SessionUserDto | null, ErrorFields>
> {
  // 1) API を呼ぶ
  // - cookie が無い場合でも 200 で未サインインを返す契約
  const res = await getJson<unknown>({ url: AUTH_PATHS.session });
  if (!res.ok) return err(res.error);

  // 2) data を Zod で最小検証する
  // - ここで落とすことで、UI に不正な形が伝搬するのを防ぐ
  const parsed = authSessionResponseSchema.safeParse(res.value);
  if (!parsed.success) {
    return err(buildErrorFields(errorCode.INTERNAL_ERROR));
  }

  // 3) 未サインインは null
  if (!parsed.data.authenticated) return ok(null);

  // 4) サインイン中は uid を返す
  return ok({ uid: parsed.data.user.uid });
}
