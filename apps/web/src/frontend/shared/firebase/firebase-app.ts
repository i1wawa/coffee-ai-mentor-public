// apps/web/src/frontend/shared/firebase/firebase-app.ts
// ========================================================
// 概要:
// - Firebase App と Firebase Auth を初期化して共有する（ブラウザ用）
//
// 責務:
// - envClient から Firebase 設定（公開キー群）を読み取り、Firebase App を初期化する
// - 多重初期化を避け、同一プロセス内で単一の App/Auth インスタンスを共有する
// - 開発時のみ、環境フラグで Firebase Auth Emulator へ接続する
//
// 契約:
// - Emulator 接続は envClient.NEXT_PUBLIC_USE_FIREBASE_AUTH_EMULATOR が 1 のときのみ行う
// ========================================================

import { getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { envClient } from "@/env.client";

const firebaseConfig = {
  // Firebase Client SDK が呼ぶ Firebase の Web API キー
  apiKey: envClient.NEXT_PUBLIC_FIREBASE_API_KEY,
  // Firebase Authentication が利用する認証用ドメイン
  authDomain: envClient.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  // Firebase プロジェクトID
  projectId: envClient.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  // Firebase 上で Web アプリを登録したときに割り当てられるアプリ識別子
  appId: envClient.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Firebase App のシングルトン初期化
const existingApp = getApps()[0];
const app = existingApp ?? initializeApp(firebaseConfig);

export const auth = getAuth(app);

// Firebase Cliend SDK （ブラウザ）で Auth Emulator を使うかどうか
// ※本番では有効化しないこと
if (envClient.NEXT_PUBLIC_USE_FIREBASE_AUTH_EMULATOR === "1") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099");
}
