// apps/web/src/frontend/features/auth/api/revoke-session.ts
// ========================================================
// 概要:
// - セキュリティ用サインアウト（全端末サインアウト / 盗難疑い）
//
// 責務:
// - POST /api/auth/session/revoke を呼び、レスポンスの shape を Zod で検証する
// ========================================================

import "client-only";

import {
  AUTH_PATHS,
  type AuthSessionRevokeResponse,
} from "@contracts/src/auth/auth-contract";
import {
  buildErrorFields,
  type ErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { err, ok, type Result } from "@packages/shared/src/result";
import * as z from "zod";
import { postJson } from "@/frontend/shared/api/http-client";

// 未知キーを許容しつつ必須キーを検証する
const revokeSessionDataSchema = z.object({
  // revoke がサーバ側で実行されたかどうか
  revoked: z.literal(true),
}) satisfies z.ZodType<AuthSessionRevokeResponse>;

/**
 * セキュリティ用サインアウトを実行する
 *
 * 成功条件:
 * - サーバが削除 Set-Cookie を返す
 * - body の data.revoked が true
 */
export async function revokeSession(): Promise<Result<void, ErrorFields>> {
  // 1) POST を呼ぶ
  const res = await postJson<unknown>({
    url: AUTH_PATHS.revoke,
  });
  if (!res.ok) return err(res.error);

  // 2) data を Zod で最小検証する
  // - 返却が壊れていたら成功扱いにしない
  const parsed = revokeSessionDataSchema.safeParse(res.value);
  if (!parsed.success) {
    return err(buildErrorFields(errorCode.INTERNAL_ERROR));
  }

  return ok(undefined);
}
