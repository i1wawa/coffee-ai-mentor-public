// apps/web/src/backend/shared/observability/csp-report.ts
// ================================================================
// 概要:
// - csp.report の Route Handler 用ラッパ
//
// 責務:
// - NextRequest から telemetry context（core/trace）を生成する
// - csp.report の出力失敗でアプリ処理を妨げない
// ================================================================

import {
  type CspReportObservation,
  defaultClassifyCspReport,
  emitCspReport,
} from "@packages/observability/src/logging/csp-report";
import {
  type CloudLoggingTraceContext,
  type CoreTelemetryContext,
  LOG_EVENT,
} from "@packages/observability/src/logging/telemetry-common";
import { createTelemetryContextFromRequestForRouteHandler } from "./next-telemetry";

export type CspReportTelemetryContext = {
  core: CoreTelemetryContext;
  trace: CloudLoggingTraceContext;
};

/**
 * NextRequest から csp.report ログ出力に必要な telemetry context を生成する
 * - 失敗しても例外を投げず null を返す（csp.report のログ出力は補助的な機能であるため、これが失敗してもアプリの主処理は妨げないようにする）
 */
export function createCspReportTelemetryContextFromRequest(
  request: Request,
): CspReportTelemetryContext | null {
  try {
    return createTelemetryContextFromRequestForRouteHandler(request);
  } catch {
    return null;
  }
}

/**
 * csp.report を安全に出力する
 * - telemetry context が null の場合は何もしない
 * - 出力に失敗しても例外を投げず、エラーメッセージをコンソールに出力する
 */
export function emitCspReportSafely(args: {
  telemetryContext: CspReportTelemetryContext | null;
  fields: CspReportObservation;
}): void {
  if (!args.telemetryContext) return;

  try {
    emitCspReport({
      core: args.telemetryContext.core,
      trace: args.telemetryContext.trace,
      fields: args.fields,
      classification: defaultClassifyCspReport(args.fields),
    });
  } catch {
    console.error(
      JSON.stringify({
        event: LOG_EVENT.CSP_REPORT,
        request_id: args.telemetryContext.core.requestId,
        trace_id: args.telemetryContext.trace.traceId,
        message: "csp.report ログの出力に失敗しました",
      }),
    );
  }
}
