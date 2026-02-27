// packages/observability/src/logging/telemetry-common.ts
// ================================================================
// 概要:
// - observability の共通型とログ出力ユーティリティを集約する
//
// 責務:
// - 共通ログフィールド（CoreTelemetryContext）を定義する
// - Cloud Logging 向けのログ形式と出力関数を提供する
// - Sentry に渡す共通コンテキストを生成する
//
// 契約:
// - すべてのログに env/service/release/request_id を付与する
// - Cloud Logging の trace は "logging.googleapis.com/trace" に入れる
//
// 前提:
// - 出力先は console.log（Cloud Logging 側で収集）
// - requestId はアプリ側で生成済みで、1リクエストの相関に使える
//
// 観測:
// - event 名は LOG_EVENT に固定し、集計・検索可能性を維持する
// ================================================================

// Cloud Loggingのseverityに合わせる
export const LOG_SEVERITY = {
  ERROR: "ERROR",
  WARNING: "WARNING",
  NOTICE: "NOTICE",
  INFO: "INFO",
  DEBUG: "DEBUG",
} as const;
export type LogSeverity = (typeof LOG_SEVERITY)[keyof typeof LOG_SEVERITY];

// ドキュメントで定義済みのログイベント
export const LOG_EVENT = {
  // 1リクエストの成功/失敗、ステータス、所要時間を必ず1本に集約し、基礎的な調査の起点にする
  REQUEST_SUMMARY: "request.summary",
  // 重要ユースケースの完了率・所要時間など、成功指標の材料を残す
  USECASE_END: "usecase.end",
  // 外部依存の総数/エラー/レイテンシ分布のメトリクス材料を提供する（Terraformで抽出する前提）
  DEPENDENCY_CALL: "dependency.call",
  // 認証の重要イベントを追跡し、調査可能にする
  AUTH_AUDIT: "auth.audit",
} as const;
export type LogEvent = (typeof LOG_EVENT)[keyof typeof LOG_EVENT];

// 実行環境
export const ENV = {
  PROD: "prod",
  STG: "stg",
  DEV: "dev",
  UNKNOWN: "unknown",
} as const;
export type Env = (typeof ENV)[keyof typeof ENV];

// ----------------------------------------------------------------
// 共通ログフィールド
// ----------------------------------------------------------------

export type CoreTelemetryContext = {
  // 実行環境
  env: Env;
  // サービス識別子（例: "coffee-ai-mentor"）
  service: string;
  // デプロイ識別子（例: "web-123456789"）
  // - Git SHA の公開は避けたいので、公開しても問題ない識別子を使う
  release: string;
  // アプリ側で生成する相関ID。1リクエストのログを束ねる（uuid等の衝突しにくい形式）
  requestId: string;
};

// ----------------------------------------------------------------
// Cloud Logging固有の型と関数
// ----------------------------------------------------------------

// Cloud Loggingのtraceフィールドに必要な情報
export type CloudLoggingTraceContext = {
  // GCPプロジェクトID
  projectId: string;
  // W3C Trace Contextのtrace-id
  traceId: string;
};

type CloudLoggingLogEntry<T extends object = object> = {
  // Cloud Loggingのseverityに合わせる
  severity: LogSeverity;
  // ドキュメントで定義済みのログイベント
  event: LogEvent;
  message: string;
  // 任意の追加フィールド
} & T;

/**
 * Cloud Logging の trace フィールドの値を組み立てる
 */
export function buildCloudLoggingTraceValue(
  trace: CloudLoggingTraceContext,
): string {
  return `projects/${trace.projectId}/traces/${trace.traceId}`;
}

/**
 * Cloud Logging用のログ出力関数
 */
export const emitCloudLoggingLog = <T extends object>(
  core: CoreTelemetryContext,
  trace: CloudLoggingTraceContext,
  entry: CloudLoggingLogEntry<T>,
) => {
  const out = {
    ...entry,
    env: core.env,
    service: core.service,
    release: core.release,
    request_id: core.requestId,
    "logging.googleapis.com/trace": buildCloudLoggingTraceValue(trace),
  };

  console.log(JSON.stringify(out));
};
