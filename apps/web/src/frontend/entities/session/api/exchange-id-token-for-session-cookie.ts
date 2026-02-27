// apps/web/src/frontend/entities/session/api/exchange-id-token-for-session-cookie.ts
// ========================================================
// 概要:
// - idToken を /api/auth/session に送って、サーバ側で HttpOnly セッションCookieを発行させる
//
// 責務:
// - 契約どおり body に { idToken } を組み立てて POST する
// - レスポンスの shape を Zod で最小検証する
// ========================================================

import "client-only";

import {
  AUTH_PATHS,
  type AuthSessionIssueRequest,
  type AuthSessionIssueResponse,
} from "@contracts/src/auth/auth-contract";
import type { ErrorFields } from "@packages/observability/src/logging/telemetry-error-common";
import {
  buildErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { err, ok, type Result } from "@packages/shared/src/result";
import * as z from "zod";
import { postJson } from "@/frontend/shared/api/http-client";

// 未知キーを許容しつつ必須キーを検証する
const sessionIssuedDataSchema = z.object({
  issued: z.literal(true),
}) satisfies z.ZodType<AuthSessionIssueResponse>;

/**
 * ID Token を /api/auth/session に渡して session cookie を発行する
 */
export async function exchangeIdTokenForSessionCookie(args: {
  idToken: string;
}): Promise<Result<void, ErrorFields>> {
  // 1) 入力を最低限正規化する
  const idToken = args.idToken.trim();

  // 2) 空なら入力不正
  // - ここで止めることで無駄な外部I/Oをしない
  if (!idToken) {
    return err(buildErrorFields(errorCode.VALIDATION_FAILED));
  }

  // 3) 交換APIを呼ぶ
  // - 成功契約: { ok:true, data:{ issued:true } }
  // - 失敗契約: { ok:false, error:{errorId,errorCode} }
  const res = await postJson<unknown>({
    url: AUTH_PATHS.session,
    body: { idToken } satisfies AuthSessionIssueRequest,
  });
  if (!res.ok) return err(res.error);

  // 4) data を Zod で最小検証する
  // - 返却が壊れていたら成功扱いにしない
  const parsed = sessionIssuedDataSchema.safeParse(res.value);
  if (!parsed.success) {
    return err(buildErrorFields(errorCode.INTERNAL_ERROR));
  }

  return ok(undefined);
}
