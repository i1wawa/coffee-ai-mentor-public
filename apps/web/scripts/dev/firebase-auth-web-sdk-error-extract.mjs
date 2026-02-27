// apps/web/scripts/dev/firebase-auth-web-sdk-error-extract.mjs
// ========================================================
// 概要:
// - Firebase Auth Web SDK を使って実際の例外を発生させ、shape を確認する
//
// 責務:
// - Auth SDK を初期化して、失敗が確定する入力で例外を発生させる
// - 例外の主要フィールドを抽出して表示する
//
// 契約:
// - 実行場所: apps/web
// - 実行方法: pnpm exec firebase --debug emulators:exec --only auth "node scripts/dev/firebase-auth-web-sdk-error-extract.mjs"
// - 出力: { name, code, message, keys, customData } を console に出す
//
// 前提:
// - NODE_ENV=production では実行しない（調査用スクリプト）
// ========================================================

import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { getApps, initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  initializeAuth,
  inMemoryPersistence,
  signInWithEmailAndPassword,
} from "firebase/auth";

const envPath = fileURLToPath(new URL("../../.env.local", import.meta.url));
const dotenvResult = dotenv.config({ path: envPath });
if (dotenvResult.error) {
  console.warn("dotenv load failed", dotenvResult.error.message);
}

function readEnv(key, fallback) {
  const value = process.env[key];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

const firebaseConfig = {
  // Firebase Client SDK が呼ぶ Firebase の Web API キー
  apiKey: readEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "demo-api-key"),
  // Firebase Authentication が利用する認証用ドメイン
  authDomain: readEnv(
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "demo.firebaseapp.com",
  ),
  // Firebase プロジェクトID
  projectId: readEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "demo-project"),
  // Firebase 上で Web アプリを登録したときに割り当てられるアプリ識別子
  appId: readEnv("NEXT_PUBLIC_FIREBASE_APP_ID", "1:000000000000:web:demo"),
};

// Firebase App のシングルトン初期化
const existingApp = getApps()[0];
const app = existingApp ?? initializeApp(firebaseConfig);

// Node 環境では inMemoryPersistence を使って Auth を初期化する
const auth = initializeAuth(app, { persistence: inMemoryPersistence });

// Firebase Client SDK で Auth Emulator を使うかどうか
// ※本番では有効化しないこと
if (readEnv("NEXT_PUBLIC_USE_FIREBASE_AUTH_EMULATOR", "0") === "1") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099");
}

function safeString(value) {
  return typeof value === "string" ? value : undefined;
}

function safeObject(value) {
  return value && typeof value === "object" ? value : undefined;
}

function extractCustomData(err) {
  const customData = safeObject(err?.customData);
  if (!customData) {
    return undefined;
  }

  return {
    appName: safeString(customData.appName),
    email: safeString(customData.email),
    phoneNumber: safeString(customData.phoneNumber),
    tenantId: safeString(customData.tenantId),
  };
}

function printShape(label, err) {
  // 1) 基本フィールドを安全に抽出する
  const code = safeString(err?.code);
  const name = safeString(err?.name);
  const message = safeString(err?.message);
  const keys = safeObject(err) ? Object.keys(err) : [];

  // 2) AuthError の customData を抽出する
  const customData = extractCustomData(err);

  // 3) ラベル付きで表示する
  console.log(label);
  console.log({ name, code, message, keys, customData });
}

async function main() {
  // 本番環境での誤実行を避けるガード
  if (process.env.NODE_ENV === "production") {
    console.error("本番環境での実行は禁止されています");
    process.exit(1);
  }

  // 2) email 形式不正で確実に失敗させる
  try {
    await signInWithEmailAndPassword(auth, "not-an-email", "dummy-password");
  } catch (err) {
    printShape("signInWithEmailAndPassword invalid email", err);
  }

  // 3) password なしで確実に失敗させる
  try {
    await signInWithEmailAndPassword(auth, "user@example.com", "");
  } catch (err) {
    printShape("signInWithEmailAndPassword missing password", err);
  }

  // 4) 弱すぎる password で確実に失敗させる
  try {
    await createUserWithEmailAndPassword(auth, "user@example.com", "1");
  } catch (err) {
    printShape("createUserWithEmailAndPassword weak password", err);
  }
}

main().catch((err) => {
  // 初期化失敗や権限不足など、想定外の失敗を可視化
  printShape("script failed", err);
  process.exit(1);
});
