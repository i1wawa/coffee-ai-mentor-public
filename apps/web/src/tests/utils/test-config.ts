// apps/web/src/tests/utils/test-config.ts
// ========================================================
// 概要:
// - テスト全体（integration/e2e）で共有する設定を集約する
//
// 責務:
// - env の読み取りとデフォルト適用をこのファイルに閉じ込める
// - どのテストでも同じ値になるように一貫させる
//
// 前提:
// - envファイルから読み取らない（Playwright と Vitest で読み方が異なるため）
// - テスト対象サーバは 127.0.0.1:3000 で起動する
// - ヘルスチェックは /api/health/live を既定とする
// - Firebase Emulator Suite は demo project を使用する
// ========================================================

/**
 * テスト対象サーバのベースURL
 * - CI環境では環境変数 TEST_BASE_URL を優先（TLS終端後のHTTPS URLに置き換えるため）
 */
export const TEST_BASE_URL =
  process.env.TEST_BASE_URL ?? "https://127.0.0.1:3000";

/**
 * ヘルスチェックURL
 * - HEALTH_PATH が未指定なら /api/health/live を使う
 */
export const TEST_HEALTH_URL = `${TEST_BASE_URL}/api/health/live`;

// ------------------------------
// Firebase Auth Emulator（integration/e2e 共通）
// ------------------------------

/**
 * Auth Emulator のOrigin
 * - 例: https://127.0.0.1:9099
 */
export const AUTH_EMULATOR_ORIGIN = "http://127.0.0.1:9099";

/**
 * Firebase Emulator Suite は demo project を推奨（誤爆防止）
 */
export const FIREBASE_PROJECT_ID = "demo-coffee-ai-mentor";

/**
 * Firebase Admin SDK 用のアプリ名（テスト用）
 */
export const TEST_FIREBASE_ADMIN_APP_NAME = "tests-firebase-admin-emulator";

/**
 * Auth REST API key
 * - Emulator では fake key で動く前提
 */
export const FIREBASE_WEB_API_KEY = "fake-api-key";

export const TEST_USER_PASSWORD = "Passw0rd!Passw0rd!";
