// apps/web/src/frontend/features/auth/config/oauth-providers.config.ts
// ========================================================
// 概要:
// - OAuth Provider の生成設定（フロントエンド向け）
// - 現状は Google のみ対応する
//
// 責務:
// - providerId から firebase/auth の AuthProvider を生成して返す
// - Provider 生成ロジックを 1 箇所に集約し、呼び出し側の分岐をなくす
//
// 前提:
// - Firebase SDK v9 Modular（firebase/auth）を使用する
// ========================================================

import { assertUnreachable } from "@packages/errors/src/assert";
import { type AuthProvider, GoogleAuthProvider } from "firebase/auth";

export type OAuthProviderId = "google";

/**
 * OAuth Provider を生成する
 */
export function createOAuthProvider(providerId: OAuthProviderId): AuthProvider {
  switch (providerId) {
    case "google": {
      // Google Provider
      const provider = new GoogleAuthProvider();
      return provider;
    }
  }
  // 到達不能
  return assertUnreachable(providerId, "createOAuthProvider");
}
