// packages/observability/src/logging/csp-report.ts
// ================================================================
// 概要:
// - Cloud Logging 向け csp.report ログの共通実装
//
// 責務:
// - csp.report の観測値（事実）と分類（severity）を分離して扱う
// - docs/architecture/cross-cutting-concerns.md のイベント定義に沿って1件分を出力する
//
// 契約:
// - 入力はサニタイズ済み値のみを受ける（生データは受けない）
// - event は LOG_EVENT.CSP_REPORT を固定で出す
// - 出力キーは snake_case に統一する
// ================================================================

import {
  type CloudLoggingTraceContext,
  type CoreTelemetryContext,
  emitCloudLoggingLog,
  LOG_EVENT,
  LOG_SEVERITY,
  type LogSeverity,
} from "./telemetry-common";

type CspReportFormat = "report-uri" | "report-to";
type CspReportDisposition = "enforce" | "report";

/**
 * csp.report の観測値（事実）を表す型
 */
export type CspReportObservation = {
  format: CspReportFormat;
  effectiveDirective?: string;
  documentUri?: string;
  blockedUri?: string;
  disposition?: CspReportDisposition;
  httpStatusCode?: number;
};

/**
 * csp.report の分類結果
 */
type CspReportClassification = {
  severity: LogSeverity;
};

/**
 * disposition から csp.report の severity を決めるデフォルト分類
 * - enforce: WARNING（実際に遮断された違反）
 * - report: NOTICE（観測のみ）
 * - 不明: WARNING（保守的）
 */
export function defaultClassifyCspReport(
  obs: CspReportObservation,
): CspReportClassification {
  if (obs.disposition === "report") {
    return { severity: LOG_SEVERITY.NOTICE };
  }
  return { severity: LOG_SEVERITY.WARNING };
}

/**
 * csp.reportログを出力する
 */
export const emitCspReport = (args: {
  core: CoreTelemetryContext;
  trace: CloudLoggingTraceContext;
  fields: CspReportObservation;
  classification?: CspReportClassification;
}) => {
  // 1) severity は引数の classification から取る。なければ disposition に応じたデフォルト分類を適用する
  const severity =
    args.classification?.severity ?? defaultClassifyCspReport(args.fields).severity;

  // 2) ログの message 部分に人が読める形で重要なフィールドを入れる（Cloud Logging の UI で一目でわかるようにするため）
  //    - 例） "CSP violation (report-uri) directive=script-src-elem mode=enforce status=200" のような形
  const messageParts = [
    `CSP violation (${args.fields.format})`,
    args.fields.effectiveDirective
      ? `directive=${args.fields.effectiveDirective}`
      : undefined,
    args.fields.disposition ? `mode=${args.fields.disposition}` : undefined,
    typeof args.fields.httpStatusCode === "number"
      ? `status=${args.fields.httpStatusCode}`
      : undefined,
  ].filter((part): part is string => typeof part === "string");

  // 3) Cloud Logging に出力するフィールドは snake_case にする（Cloud Logging の慣習に合わせるため）
  const payload: {
    format: CspReportFormat;
    effective_directive?: string;
    document_uri?: string;
    blocked_uri?: string;
    disposition?: CspReportDisposition;
    http_status_code?: number;
  } = {
    format: args.fields.format,
  };
  if (args.fields.effectiveDirective) {
    payload.effective_directive = args.fields.effectiveDirective;
  }
  if (args.fields.documentUri) {
    payload.document_uri = args.fields.documentUri;
  }
  if (args.fields.blockedUri) {
    payload.blocked_uri = args.fields.blockedUri;
  }
  if (args.fields.disposition) {
    payload.disposition = args.fields.disposition;
  }
  if (typeof args.fields.httpStatusCode === "number") {
    payload.http_status_code = args.fields.httpStatusCode;
  }

  // 4) Cloud Logging に出力する
  emitCloudLoggingLog(args.core, args.trace, {
    severity,
    event: LOG_EVENT.CSP_REPORT,
    message: messageParts.join(" "),
    ...payload,
  });
};
