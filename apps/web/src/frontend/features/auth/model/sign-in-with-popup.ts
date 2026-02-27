// apps/web/src/frontend/features/auth/model/sign-in-with-popup.ts
// ========================================================
// 概要:
// - OAuth Popup でサインインし、サーバへ渡すための idToken を取得して
//   session cookie に交換する最小サービス
//
// 責務:
// - Popupサインインして idToken を得る（SDK呼び出しは shared に隔離）
// - idToken を /api/auth/session（相当）へ渡して session cookie を発行する
// ========================================================

import "client-only";

import { err, ok } from "@packages/shared/src/result";
import { exchangeIdTokenForSessionCookie } from "@/frontend/entities/session/api/exchange-id-token-for-session-cookie";
import type { ModelResult } from "@/frontend/shared/errors/telemetry-error-result";
import type { UiResult } from "@/frontend/shared/errors/ui-result";
import { signInWithPopupAndGetIdToken } from "@/frontend/shared/firebase/firebase-auth";
import { runModelOperationWithTelemetry } from "@/frontend/shared/observability/model-operation-telemetry";
import { TELEMETRY_OPERATION } from "@/frontend/shared/observability/telemetry-tags";
import {
  createOAuthProvider,
  type OAuthProviderId,
} from "../config/oauth-providers.config";

/**
 * OAuth Popup サインインし、ID Token を session cookie に交換する
 */
export async function signInWithPopupAndIssueSessionCookie(args: {
  providerId: OAuthProviderId;
}): Promise<UiResult<void>> {
  // 1) 例外が出ても UI へは UiErrorFields で返すため、共通ラッパで包む
  return runModelOperationWithTelemetry({
    operation: TELEMETRY_OPERATION.SIGN_IN_WITH_POPUP,
    fn: async (): Promise<ModelResult<void>> => {
      // 2) providerId から provider を生成する
      // - 分岐は config に閉じ込める
      const provider = createOAuthProvider(args.providerId);

      // 3) Popup サインインして idToken を取得する
      // - Firebase 直呼びは shared に閉じ込める
      const signedIn = await signInWithPopupAndGetIdToken({ provider });
      if (!signedIn.ok) {
        // 4) Popup失敗は Expected error として返す
        return err(signedIn.error);
      }

      // 5) session cookie に交換する
      // - サーバが Set-Cookie を返し、以降は cookie を正にする
      const exchanged = await exchangeIdTokenForSessionCookie({
        idToken: signedIn.value.idToken,
      });
      if (!exchanged.ok) {
        // 6) 交換失敗も Expected error として返す
        return err(exchanged.error);
      }

      // 7) 成功
      return ok(undefined);
    },
  });
}
