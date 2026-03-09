// apps/web/src/instrumentation-client.ts
// ============================================================================
// 概要:
// - クライアント起動前に実行したい初期化処理を集約する
//
// 責務:
// - Sentry のクライアント初期化モジュールを読み込む
//
// 前提:
// - instrumentation-client.ts は Next.js のファイル規約で自動読み込みされる
// ============================================================================

import * as Sentry from "@sentry/nextjs";
import "../sentry.client.config";

// Next.js の画面遷移トレースを有効化するフックをエクスポートする（公式推奨）
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
