// apps/web/scripts/dev/firebase-admin-sdk-error-probe.mjs
// ========================================================
// 概要:
// - Firebase Admin SDK の例外オブジェクトの shape を調べる（error.code 等）
//
// 責務:
// - verifySessionCookie / verifyIdToken の例外から主要フィールドを抽出して表示する
// - 出力結果を firebase-auth-error.mapper 側の分類（マッピング）に反映できるようにする
//
// 契約:
// - 実行場所: apps/web
// - 実行方法: node scripts/dev/firebase-admin-sdk-error-probe.mjs
// - 出力: { name, code, message, keys } を console に出す
//
// 前提:
// - NODE_ENV=production では実行しない（調査用スクリプト）
// ========================================================
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

// Application Default Credentials で初期化（ローカル/CI で共通）
initializeApp({ credential: applicationDefault() });

function printShape(err) {
  // error.code / error.name / message / keys を安全に抽出して可視化する
  const code = err && typeof err === "object" ? err.code : undefined;
  const name = err && typeof err === "object" ? err.name : undefined;
  const message = err && typeof err === "object" ? err.message : undefined;
  const keys = err && typeof err === "object" ? Object.keys(err) : [];
  console.log({ name, code, message, keys });
}

async function main() {
  // 本番環境での誤実行を避けるガード
  if (process.env.NODE_ENV === "production") {
    console.error("本番環境での実行は禁止されています");
    process.exit(1);
  }

  const auth = getAuth();

  try {
    // 破損 cookie を投げて verifySessionCookie の例外形を確認
    await auth.verifySessionCookie("broken_cookie_value", true);
  } catch (e) {
    console.log("verifySessionCookie error shape:");
    printShape(e);
  }

  try {
    // 破損 ID token を投げて verifyIdToken の例外形を確認
    await auth.verifyIdToken("broken_id_token_value", true);
  } catch (e) {
    console.log("verifyIdToken error shape:");
    printShape(e);
  }
}

main().catch((e) => {
  // 初期化失敗や権限不足など、想定外の失敗を可視化
  console.log("probe failed:");
  printShape(e);
  process.exit(1);
});
