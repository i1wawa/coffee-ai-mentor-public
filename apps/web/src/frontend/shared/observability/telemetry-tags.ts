// apps/web/src/frontend/shared/observability/telemetry-tags.ts
// ============================================================================
// 概要:
// - Sentry の tag に入れる低カーディナリティなタグを定義する
//
// 責務:
// - 送信タグを 1 箇所で固定し、自由入力を防ぐ
//
// 非目的:
// - 画面表示用の文言や UI 操作名の管理
//
// 契約:
// - 値は低カーディナリティな定数のみ
// - 新規タグはここへ追加して拡張する
// ============================================================================

export const TELEMETRY_OPERATION = {
  // 1) 認証系
  // 1-1) Firebase Auth SDK 操作
  SIGN_IN_WITH_POPUP: "sign_in_with_popup",
  SIGN_OUT: "sign_out",
  AUTH_CROSS_TAB_EVENT: "auth_cross_tab_event",
  // 1-2) サーバ API 操作
  LINK_WITH_POPUP: "link_with_popup",
  REAUTHENTICATE_WITH_POPUP: "reauthenticate_with_popup",
  GET_SESSION_USER: "get_session_user",
  REVOKE_SESSION: "revoke_session",
  // 2) ユーザー系
  // 2-1) Firebase Auth SDK 操作
  // 2-2) サーバ API 操作
  GET_USER_ME: "get_user_me",
  DELETE_USER_ME: "delete_user_me",
} as const;

export type TelemetryOperation =
  (typeof TELEMETRY_OPERATION)[keyof typeof TELEMETRY_OPERATION];

export const TELEMETRY_LAYER = {
  MODEL: "model",
  UI: "ui",
  SHARED: "shared",
  API: "api",
  SDK: "sdk",
  BOUNDARY: "boundary",
} as const;

export type TelemetryLayer =
  (typeof TELEMETRY_LAYER)[keyof typeof TELEMETRY_LAYER];
