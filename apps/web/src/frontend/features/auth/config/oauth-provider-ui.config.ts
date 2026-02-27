// apps/web/src/frontend/features/auth/config/oauth-provider-ui.config.ts
// ================================================================
// 概要:
// - OAuth Provider のUI表示設定（フロントエンド）
//
// 責務:
// - サインイン画面に表示する Provider 一覧と表示文言を提供する
// - Provider 追加時の変更点をこの config に集約する
// ================================================================

import type { OAuthProviderId } from "./oauth-providers.config";

export type OAuthProviderUiItem = {
  providerId: OAuthProviderId;
  buttonLabel: string;
  // テスト契約点（E2E/ユニット双方で使える）
  buttonTestId: string;
};

/**
 * ProviderId から UI 設定を引く辞書
 * - provider 追加時にキー欠落を型で検知する
 */
export const OAUTH_PROVIDER_UI_ITEM_BY_PROVIDER_ID = {
  google: {
    providerId: "google",
    buttonLabel: "Googleで続行",
    buttonTestId: "oauth-button-google",
  },
} as const satisfies Record<OAuthProviderId, OAuthProviderUiItem>;

/**
 * サインイン画面に表示するProvider一覧
 * - 現状はGoogleのみ
 */
export const OAUTH_PROVIDER_UI_ITEMS = Object.values(
  OAUTH_PROVIDER_UI_ITEM_BY_PROVIDER_ID,
);
