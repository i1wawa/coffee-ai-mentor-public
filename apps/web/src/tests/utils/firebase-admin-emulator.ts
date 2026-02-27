// apps/web/src/tests/utils/firebase-admin-emulator.ts
// ========================================================
// 概要:
// - テスト（Vitest / Playwright）専用の Firebase Admin SDK 初期化
//
// 前提:
// - server-only を使う Next.js サーバ専用モジュールには依存しない
// - Auth Emulator 接続設定（FIREBASE_AUTH_EMULATOR_HOST）は実行環境側で与える
// ========================================================

import { type App, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import {
  FIREBASE_PROJECT_ID,
  TEST_FIREBASE_ADMIN_APP_NAME,
} from "@/tests/utils/test-config";

/**
 * テスト専用の Firebase Admin App を取得する。
 *
 * 1. 同名の App が既にあれば再利用する
 * 2. なければ test-config の projectId で初期化する
 */
function getTestFirebaseAdminApp(): App {
  const existingApp = getApps().find(
    (app) => app.name === TEST_FIREBASE_ADMIN_APP_NAME,
  );
  if (existingApp) return existingApp;

  return initializeApp(
    { projectId: FIREBASE_PROJECT_ID },
    TEST_FIREBASE_ADMIN_APP_NAME,
  );
}

export const testAdminAuth = getAuth(getTestFirebaseAdminApp());
