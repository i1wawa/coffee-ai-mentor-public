// apps/web/src/backend/identity/infrastructure/firebase/admin.server.ts
// ========================================================
// 概要:
// - Firebase Admin SDK 初期化
//
// 前提:
// - エミュレータ接続は環境変数で切り替える(FIREBASE_AUTH_EMULATOR_HOST)
// ========================================================

import "server-only";

import { type App, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getServerBaseEnv } from "@/env.server";

/**
 * Firebase Admin SDK 初期化（Cloud Run / Emulator 両対応）
 *
 * 1. 多重初期化を防ぐ
 * 2. projectId を環境変数から明示的に設定する
 */
function getAdminApp(): App {
  // 1) 既に初期化済みならそれを使う
  const existingApp = getApps()[0];
  if (existingApp) return existingApp;

  // 2) 初期化
  // - projectId は本番時に環境変数から取得
  const envServer = getServerBaseEnv();
  const projectId = envServer.GCP_PROJECT_ID?.trim() || "demo-coffee-ai-mentor";
  return initializeApp({ projectId });
}

export const adminApp = getAdminApp();
export const adminAuth = getAuth(adminApp);
