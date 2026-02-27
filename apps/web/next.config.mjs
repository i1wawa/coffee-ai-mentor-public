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

export default nextConfig;
