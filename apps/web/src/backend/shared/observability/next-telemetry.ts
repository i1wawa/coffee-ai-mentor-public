// apps/web/src/backend/shared/observability/next-telemetry.ts
// ================================================================
// 概要:
// - Next.js 用: telemetry context 生成（Route Handler / Server Action）
//
// 責務:
// - request.summary 用の core（env/service/release/requestId）を組み立てる
// - Cloud Logging の trace 表示用に trace（projectId/traceId）を組み立てる
//
// 前提:
// - Cloud Run では x-cloud-trace-context が付与されることがある
// - traceId は x-cloud-trace-context を優先し、無ければ fallback を生成する
//
// セキュリティ/機微情報:
// - token / cookie / uid / email は扱わない
// ================================================================

import crypto from "node:crypto";
import type {
  CloudLoggingTraceContext,
  CoreTelemetryContext,
} from "@packages/observability/src/logging/telemetry-common";
import { headers } from "next/headers";
import { getServerBaseEnv } from "@/env.server";

// ---------------------------------------------------------------------
// 内部ユーティリティ
// ---------------------------------------------------------------------

/**
 * requestId を生成する（衝突しにくい形式）
 * - 目的: 1リクエスト内のログ相関（request.summary以外を出す場合にも備える）
 */
function generateRequestId(): string {
  // UUID互換に近い形式を作る（依存追加を避けるため標準cryptoで生成）
  // - ここではログ量を増やす行為をしない（生成のみ）
  return crypto.randomUUID();
}

/**
 * traceId を作る
 * - Cloud Run では `X-Cloud-Trace-Context` が付与されることが多い
 * - 例: "TRACE_ID/SPAN_ID;o=TRACE_TRUE"
 */
function extractTraceIdFromXCloudTraceContext(
  headerValue: string | null,
): string | null {
  if (!headerValue) return null;

  // 1) "traceId/spanId;o=..." の先頭 traceId を抽出する
  const traceId = headerValue.split("/")[0]?.trim();
  if (!traceId) return null;

  // 2) 形式は厳密に検証しない（運用で弾くとログが欠けるため）
  return traceId;
}

/**
 * fallback 用 traceId（32 hex）
 */
function generateFallbackTraceId(): string {
  return crypto.randomBytes(16).toString("hex");
}

// ---------------------------------------------------------------------
// 公開関数
// ---------------------------------------------------------------------

/**
 * Next.js Route Handler 用 telemetry context を作る
 * - request.summary で必須の core / trace を返す
 */
export function createTelemetryContextFromRequestForRouteHandler(
  request: Request,
): {
  core: CoreTelemetryContext;
  trace: CloudLoggingTraceContext;
} {
  // 1) 環境・サービス情報
  const envServer = getServerBaseEnv();
  const env = envServer.APP_ENV;
  const service = envServer.SERVICE_NAME?.trim() || "coffee-ai-mentor-web";
  const release = envServer.SENTRY_RELEASE?.trim() || "unknown";

  // 2) requestId（相関ID）
  const requestId = generateRequestId();

  // 3) trace（Cloud LoggingのUIでトレース紐付け）
  // - Cloud Run が付ける X-Cloud-Trace-Context を最優先
  const xCloudTraceContext = request.headers.get("x-cloud-trace-context");
  const traceId =
    extractTraceIdFromXCloudTraceContext(xCloudTraceContext) ??
    generateFallbackTraceId();

  // 4) projectId（Cloud Loggingのtrace組み立てに必要）
  const projectId = envServer.GCP_PROJECT_ID?.trim() || "unknown";

  return {
    core: { env, service, release, requestId },
    trace: { projectId, traceId },
  };
}

/**
 * Next.js Server Action 用 telemetry context を作る
 * - request.summary で必須の core / trace を返す
 * - Server Action は Request を受け取れないため headers() から trace を拾う
 */
export async function createTelemetryContextFromRequestForServerAction(): Promise<{
  core: CoreTelemetryContext;
  trace: CloudLoggingTraceContext;
}> {
  const envServer = getServerBaseEnv();

  // 1) 環境・サービス情報
  const env = envServer.APP_ENV;
  const service = envServer.SERVICE_NAME?.trim() || "coffee-ai-mentor-web";
  const release = envServer.SENTRY_RELEASE?.trim() || "unknown";

  // 2) requestId（相関ID）
  const requestId = generateRequestId();

  // 3) trace（Cloud LoggingのUIでトレース紐付け）
  // - Server Action では headers() から取得する
  const h = await headers();
  const traceId =
    extractTraceIdFromXCloudTraceContext(h.get("x-cloud-trace-context")) ??
    generateFallbackTraceId();

  // 4) projectId（Cloud Loggingのtrace組み立てに必要）
  const projectId = envServer.GCP_PROJECT_ID?.trim() || "unknown";

  return {
    core: { env, service, release, requestId },
    trace: { projectId, traceId },
  };
}
