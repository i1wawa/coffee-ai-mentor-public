// apps/web/next.config.mjs
// ========================================================
// 概要:
// - Next.js アプリケーション（apps/web）のビルド/出力に関する設定を集約する
//
// 責務:
// - ビルド最適化（React Compiler）を有効化する
// - デプロイ形態（standalone出力）を固定する
// - 出力ファイルトレースのルートを apps/web の実行形態に合わせて調整する
// ========================================================

import path from "node:path";
import { fileURLToPath } from "node:url";
import { withSentryConfig } from "@sentry/nextjs";

// 現在のファイルパスとディレクトリパスを取得
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nextConfig = {
  // Reactアプリのレンダリングを自動的に最適化
  reactCompiler: true,
  // Next.jsのstandalone出力を有効化（デプロイメントのサイズを大幅に削減）
  output: "standalone",
  // apps/webから見てrootが2階層上
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

// Sentry のビルド時設定（ソースマップアップロード等）を有効化する
export default withSentryConfig(nextConfig, {
  org: "i1wawa-org",
  project: "coffee-ai-mentor-prod",
  // Sentry CLIが必要とする認証トークンを環境変数から取得
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // クライアントファイルのアップロード範囲を広げる
  widenClientFileUpload: true,
  // CI 以外ではログを抑制する
  silent: !process.env.CI,
});
