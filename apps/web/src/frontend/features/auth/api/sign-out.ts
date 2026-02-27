// apps/web/src/frontend/features/auth/api/sign-out.ts
// ========================================================
// 概要:
// - サインアウト（この端末のセッション Cookie 削除）
//
// 責務:
// - DELETE /api/auth/session を呼び、レスポンスの shape を Zod で検証する
// ========================================================

import "client-only";

import {
  AUTH_PATHS,
  type AuthSessionDeleteResponse,
} from "@contracts/src/auth/auth-contract";
import {
  buildErrorFields,
  type ErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { err, ok, type Result } from "@packages/shared/src/result";
import * as z from "zod";
import { deleteJson } from "@/frontend/shared/api/http-client";

// 未知キーを許容しつつ必須キーを検証する
const signOutDataSchema = z.object({
  // サインアウト処理がサーバ側で実行されたかどうか
  // - true/false の意味はサーバ側に寄せる（冪等なので true/false で分岐しない）
  // - 今のところクライアント側で契約確認用にしか使わない
  cleared: z.literal(true),
}) satisfies z.ZodType<AuthSessionDeleteResponse>;

/**
 * サインアウトする
 *
 * 成功条件:
 * - サーバが削除 Set-Cookie を返す
 * - body の data.cleared が true
 */
export async function signOut(): Promise<Result<void, ErrorFields>> {
  // 1) DELETE を呼ぶ
  const res = await deleteJson<unknown>({ url: AUTH_PATHS.session });
  if (!res.ok) return err(res.error);

  // 2) data を Zod で最小検証する
  // - 返却が壊れていたら成功扱いにしない
  const parsed = signOutDataSchema.safeParse(res.value);
  if (!parsed.success) {
    return err(buildErrorFields(errorCode.INTERNAL_ERROR));
  }

  return ok(undefined);
}
