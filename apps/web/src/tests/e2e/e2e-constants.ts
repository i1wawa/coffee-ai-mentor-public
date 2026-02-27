// apps/web/src/tests/e2e/e2e-constants.ts
// =================================================================
// 概要:
// - E2E テスト全体で共通利用する定数を集約する
//
// 契約:
// - このファイルは「定数のみ」を export する（関数・副作用・環境読み取りは置かない）
//
// 前提:
// - E2E 実行対象ホストは常に配列で扱う（許可リスト方式）
// - デフォルト許可は 127.0.0.1 のみ（誤爆防止）
// =================================================================

import path from "node:path";

// E2E実行対象ホストの許可リスト（常に配列化する）
export const E2E_ALLOWED_HOSTS = [
  // デフォルトは 127.0.0.1 のみ許可
  "127.0.0.1",
];

// ------------------------------------------------------------------
// パス
// ------------------------------------------------------------------

// Playwright成果物の出力先
export const PLAYWRIGHT_ARTIFACTS_DIR = path.join(".playwright");

// 認証済みstorageStateの保存先（= プロジェクト chromium:user が読む）
const defaultAuthStatePath = path.join(
  PLAYWRIGHT_ARTIFACTS_DIR,
  ".auth",
  "user.json",
);
export const AUTH_STATE_PATH = defaultAuthStatePath;

// アカウント削除E2E専用の認証済みstorageState保存先
// - 破壊的操作を通常の認証済みテストと分離する
const defaultDeleteAuthStatePath = path.join(
  PLAYWRIGHT_ARTIFACTS_DIR,
  ".auth",
  "user-delete.json",
);
export const AUTH_DELETE_STATE_PATH = defaultDeleteAuthStatePath;
