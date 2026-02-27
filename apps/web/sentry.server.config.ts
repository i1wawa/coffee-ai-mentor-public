// apps/web/sentry.server.config.ts
// ========================================================
// 概要:
// - Sentry（@sentry/nextjs）サーバ初期化
// - モジュール評価時に Sentry.init を実行し、エラー収集とパフォーマンス監視を有効化する
//
// 責務:
// - dsn / environment / release を server base env から渡して初期化する
// - tracesSampleRate を dev=1.0、その他=0.1 に切り替えて監視コストを制御する
// ========================================================

import * as Sentry from "@sentry/nextjs";
import { getServerBaseEnv } from "@/env.server";

const envServer = getServerBaseEnv();

Sentry.init({
  // Sentryの初期化設定
  dsn: envServer.SENTRY_DSN,
  environment: envServer.SENTRY_ENVIRONMENT,
  // デプロイ識別子（Sentry の release）
  // - request 単位の相関タグとは別に、Sentry 標準の release としても持たせる
  release: envServer.SENTRY_RELEASE,
  // 既定PIIは送らない
  // - IP や request headers などの自動収集を有効化しない
  // - 意図を明示するため false を固定する（公式推奨）
  sendDefaultPii: false,

  // パフォーマンス監視のサンプリング率（コストに注意）
  tracesSampleRate: envServer.APP_ENV === "dev" ? 1.0 : 0.1,
});
