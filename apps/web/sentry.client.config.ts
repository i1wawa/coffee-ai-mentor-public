// apps/web/sentry.client.config.ts
// ========================================================
// 概要:
// - Sentry（@sentry/nextjs）クライアント初期化
// - ブラウザ実行時に Sentry.init を実行し、エラー収集とパフォーマンス監視を有効化する
//
// 責務:
// - dsn / environment を envClient（NEXT_PUBLIC_*）から渡して初期化する
// - tracesSampleRate を dev=1.0、その他=0.1 に切り替えて監視コストを制御する
// ========================================================

import * as Sentry from "@sentry/nextjs";
import { envClient } from "@/env.client";

Sentry.init({
  // Sentryの初期化設定
  dsn: envClient.NEXT_PUBLIC_SENTRY_DSN,
  environment: envClient.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
  // デプロイ識別子（Sentry の release）
  // - Git SHA の公開は避けたいので、公開しても問題ない識別子を使う
  release: envClient.NEXT_PUBLIC_SENTRY_RELEASE,
  // 既定PIIは送らない
  // - IP や request headers などの自動収集を有効化しない
  // - 意図を明示するため false を固定する（公式推奨）
  sendDefaultPii: false,

  // パフォーマンス監視のサンプリング率（コストに注意）
  tracesSampleRate: envClient.NEXT_PUBLIC_APP_ENV === "dev" ? 1.0 : 0.1,
});
