// apps/web/src/frontend/shared/firebase/firebase-auth-error.mapper.ts
// ================================================================
// 概要:
// - Firebase Auth (Authentication) Web SDK の例外を、アプリ共通の errorCode に変換する mapper
// - 主対象は OAuth の popup サインイン
//
// 責務:
// - auth/* コードを「復旧行動が変わる粒度」で分類する
// - 調査用に SDK のメタ情報（provider/code/name/operation）を付与して返す
//
// 契約:
// - 入力: unknown 例外 + operation（既定は SIGN_IN_WITH_POPUP）
// - 出力: ModelErrorFields（errorId/errorCode + cause + sdk）
// - 未知の auth/* は安全側（UNAVAILABLE）へ倒す
//
// 前提:
// - Firebase Auth のエラーコードは "auth/..." 形式
//   https://firebase.google.com/docs/reference/js/auth#autherrorcodes
// - operation は現状 SIGN_IN_WITH_POPUP を主に使う（将来拡張あり）
// ================================================================

import {
  buildErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import type {
  TelemetryErrorFields,
  TelemetrySdkMeta,
} from "@/frontend/shared/errors/telemetry-error-result";
import {
  TELEMETRY_OPERATION,
  type TelemetryOperation,
} from "@/frontend/shared/observability/telemetry-tags";
import { extractFirebaseAuthWebSdkErrorMeta } from "./extract-firebase-auth-code";

// ---------------------------------------------------------------
// 行動が変わる代表コード群
// - Set にして差分管理しやすくする
// ---------------------------------------------------------------

// 1) ユーザー操作や UI 競合で中断される系
// - 行動: 何もしない / もう一度押せる状態に戻す
const CANCELLED_BY_USER = new Set<string>([
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
  "auth/user-cancelled",
  "auth/redirect-cancelled-by-user",
]);

// signOut の冪等性を担保するための特例
// - 既にサインアウト済みでもユーザー視点では成功と同等なので CANCELLED に倒す
const SIGN_OUT_IDEMPOTENT_CANCELLED = new Set<string>(["auth/user-signed-out"]);

// 2) ブラウザや環境の前提条件が満たされない系
// - 行動: 設定変更や環境変更、運用側設定の見直しが必要になりやすい
const PRECONDITION_ENV_OR_CONFIG = new Set<string>([
  // popup 前提
  "auth/popup-blocked",
  // ドメインや URL 系
  "auth/unauthorized-domain",
  "auth/unauthorized-continue-uri",
  "auth/invalid-continue-uri",
  // 設定や環境
  "auth/operation-not-allowed",
  "auth/operation-not-supported-in-this-environment",
  "auth/web-storage-unsupported",
  "auth/cors-unsupported",
  "auth/auth-domain-config-required",
  "auth/app-not-authorized",
  "auth/invalid-api-key",
  "auth/invalid-app-id",
  "auth/invalid-oauth-client-id",
  "auth/app-deleted",
  // popup / redirect の内部ハンドシェイク系
  // - ブラウザ制限、拡張機能、サードパーティ cookie 制限などで起きやすい（推測）
  "auth/no-auth-event",
  "auth/invalid-auth-event",
  "auth/missing-iframe-start",
  // redirect と混在したときの競合などで起きる（推測）
  "auth/redirect-operation-pending",
]);

// 3) ネットワーク一時障害
// - 行動: リトライ
const RETRYABLE_NETWORK = new Set<string>([
  "auth/network-request-failed",
  "auth/internal-error",
]);

// 4) タイムアウト
// - 行動: リトライ
const RETRYABLE_TIMEOUT = new Set<string>(["auth/timeout"]);

// 5) レート制限
// - 行動: 待ってからリトライ
const RATE_LIMITED = new Set<string>(["auth/too-many-requests"]);

// 6) クォータ枯渇
// - 行動: 運用・プラン側の対応が必要
const QUOTA_EXCEEDED = new Set<string>(["auth/quota-exceeded"]);

// 7) アカウント統合や別手順が必要な競合系
// - 行動: 別プロバイダでログインしてから link する等の導線が必要
const SIGN_IN_CONFLICT = new Set<string>([
  "auth/account-exists-with-different-credential",
  "auth/credential-already-in-use",
]);

// 8) 認証情報が無効
// - 行動: 再サインイン、もしくはやり直し
const AUTH_INVALID = new Set<string>([
  "auth/invalid-credential",
  "auth/rejected-credential",
  "auth/invalid-user-token",
  "auth/user-token-expired",
]);

// 9) 利用不可または禁止
// - 行動: ユーザー側で解決できないことが多い
const ACCESS_DENIED = new Set<string>(["auth/user-disabled"]);

// 10) 実装ミスや入力不正
// - 行動: 実装修正
const VALIDATION_FAILED = new Set<string>([
  "auth/argument-error",
  "auth/invalid-argument",
]);

// ---------------------------------------------------------------
// メイン関数
// ---------------------------------------------------------------

export function mapFirebaseAuthErrorToModelError(
  e: unknown,
  operation: TelemetryOperation,
): TelemetryErrorFields {
  // 1) Firebase Auth Web SDK (Software Development Kit) の例外情報を安全に抽出する
  const firebaseMeta = extractFirebaseAuthWebSdkErrorMeta(e);

  // 2) 調査用に sdk メタを組み立てる
  // - provider は低カーディナリティで固定化する
  // - code / name は Firebase が付与する代表的な識別子のみ保持する
  // - operation は低カーディナリティなので保持してよい
  const provider: TelemetrySdkMeta["provider"] = firebaseMeta.code?.startsWith(
    "auth/",
  )
    ? "firebase_auth"
    : "unknown";
  const sdk = {
    provider,
    code: firebaseMeta.code,
    name: firebaseMeta.name,
    operation,
  };

  // 3) code が無い場合
  // - 非 Firebase 例外や、想定外の形の例外
  // - ここはアプリ内部の想定外として INTERNAL_ERROR に寄せる
  const code = sdk.code ?? "";
  if (!code) {
    return { ...buildErrorFields(errorCode.INTERNAL_ERROR), cause: e, sdk };
  }

  // 4) auth/ 以外の code
  // - Firebase Auth 以外の例外の可能性が高い
  // - ここも想定外として INTERNAL_ERROR に寄せる
  if (!code.startsWith("auth/")) {
    return { ...buildErrorFields(errorCode.INTERNAL_ERROR), cause: e, sdk };
  }

  // 5) operation 依存の特例
  // - signOut は冪等に扱いたい
  // - 既にサインアウト済みならユーザー視点では成功と同等なので CANCELLED に倒す
  if (
    operation === TELEMETRY_OPERATION.SIGN_OUT &&
    SIGN_OUT_IDEMPOTENT_CANCELLED.has(code)
  ) {
    return { ...buildErrorFields(errorCode.CANCELLED), cause: e, sdk };
  }

  // 6) CANCELLED 系
  // - ユーザーの中断や UI 競合
  if (CANCELLED_BY_USER.has(code)) {
    return { ...buildErrorFields(errorCode.CANCELLED), cause: e, sdk };
  }

  // 7) 前提条件
  // - ブラウザのポップアップ制限や、Firebase 設定不備の可能性
  if (PRECONDITION_ENV_OR_CONFIG.has(code)) {
    return {
      ...buildErrorFields(errorCode.PRECONDITION_FAILED),
      cause: e,
      sdk,
    };
  }

  // 8) 一時障害
  // - ネットワークや Firebase 側内部エラーなど
  if (RETRYABLE_NETWORK.has(code)) {
    return { ...buildErrorFields(errorCode.UNAVAILABLE), cause: e, sdk };
  }

  // 9) タイムアウト
  if (RETRYABLE_TIMEOUT.has(code)) {
    return { ...buildErrorFields(errorCode.DEADLINE_EXCEEDED), cause: e, sdk };
  }

  // 10) レート制限
  if (RATE_LIMITED.has(code)) {
    return { ...buildErrorFields(errorCode.RATE_LIMITED), cause: e, sdk };
  }

  // 11) クォータ枯渇
  if (QUOTA_EXCEEDED.has(code)) {
    return { ...buildErrorFields(errorCode.QUOTA_EXCEEDED), cause: e, sdk };
  }

  // 12) 競合
  // - 例: account-exists-with-different-credential
  // - signInWithPopup の公式ドキュメントでも、別プロバイダでログインしてから link する流れが示されている
  if (SIGN_IN_CONFLICT.has(code)) {
    return { ...buildErrorFields(errorCode.RESOURCE_CONFLICT), cause: e, sdk };
  }

  // 13) 認証無効
  // - 例: invalid-credential
  if (AUTH_INVALID.has(code)) {
    return { ...buildErrorFields(errorCode.AUTH_INVALID), cause: e, sdk };
  }

  // 14) アクセス拒否
  // - 例: user-disabled
  if (ACCESS_DENIED.has(code)) {
    return { ...buildErrorFields(errorCode.ACCESS_DENIED), cause: e, sdk };
  }

  // 15) 入力不正や実装ミス
  if (VALIDATION_FAILED.has(code)) {
    return { ...buildErrorFields(errorCode.VALIDATION_FAILED), cause: e, sdk };
  }

  // 16) 未知の auth/* は安全側へ
  // - 新しい SDK 追加コードや、想定外のコードでも UI を壊しにくくする
  // - 行動: 再試行や問い合わせ導線
  return { ...buildErrorFields(errorCode.UNAVAILABLE), cause: e, sdk };
}
