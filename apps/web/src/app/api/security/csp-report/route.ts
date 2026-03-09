// apps/web/src/app/api/security/csp-report/route.ts
// ================================================================
// 概要:
// - CSP 違反レポート受信用エンドポイント
//
// 外部契約の正本:
// - contracts/src/security/csp-report.http.md
//
// 責務:
// - report-uri 形式（application/csp-report）を受理する
// - report-to 形式（application/reports+json）を受理する
// - 受信値を最小限サニタイズしてログへ出す
// - 応答は常に 204 + no-store を返し、本文は返さない
// ================================================================

import {
  CSP_REPORT_CONTENT_TYPES,
  CSP_REPORT_NO_CONTENT_STATUS,
} from "@contracts/src/security/security-contract";
import type { CspReportObservation } from "@packages/observability/src/logging/csp-report";
import { type NextRequest, NextResponse } from "next/server";
import {
  createNoStoreHeaders,
  isBodyTooLargeByContentLength,
  MAX_JSON_BODY_BYTES,
  safeReadJson,
} from "@/backend/shared/http/request.guard.server";
import {
  createCspReportTelemetryContextFromRequest,
  emitCspReportSafely,
} from "@/backend/shared/observability/csp-report";

// Next.jsのランタイムをNode.jsに指定
export const runtime = "nodejs";
// Next.jsのキャッシュ設定を動的にする
export const dynamic = "force-dynamic";

const MAX_CSP_REPORT_BODY_BYTES = MAX_JSON_BODY_BYTES;

type CspReportFormat = "legacy" | "modern";

/**
 * Content-Type から CSPレポート形式を判定する
 * - application/csp-report / application/reports+json を許可する
 * - ; charset=utf-8 などのパラメータ付きも許可する
 */
function parseCspReportFormatFromContentType(
  request: Request,
): CspReportFormat | null {
  const rawContentType = request.headers.get("content-type");
  if (!rawContentType) return null;

  const mediaType = rawContentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (mediaType === CSP_REPORT_CONTENT_TYPES.legacy) return "legacy";
  if (mediaType === CSP_REPORT_CONTENT_TYPES.modern) return "modern";
  return null;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}

/**
 * 文字列を正規化する
 * - 空白をトリムする
 * - 最大文字数で切り詰める
 */
function normalizeReportString(
  input: unknown,
  maxChars = 1_000,
): string | undefined {
  if (typeof input !== "string") return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxChars);
}

function normalizeReportNumber(input: unknown): number | undefined {
  if (typeof input !== "number") return undefined;
  if (!Number.isFinite(input)) return undefined;
  return input;
}

/**
 * 文字列を正規化して CSP レポートの disposition を取得する
 * - "enforce" または "report" のみを有効とする
 */
function normalizeReportDisposition(
  input: unknown,
): CspReportObservation["disposition"] {
  const value = normalizeReportString(input)?.toLowerCase();
  if (value === "enforce") return "enforce";
  if (value === "report") return "report";
  return undefined;
}

/**
 * record から複数の候補キーを試して文字列フィールドを正規化して取得する
 * - 最初に見つかった有効な値を返す
 * - 見つからない場合は undefined を返す
 */
function normalizeFieldFromRecord(
  record: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const normalized = normalizeReportString(record[key]);
    if (normalized) return normalized;
  }
  return undefined;
}

/**
 * record から複数の候補キーを試して数値フィールドを正規化して取得する
 * - 最初に見つかった有効な値を返す
 * - 見つからない場合は undefined を返す
 */
function normalizeNumberFieldFromRecord(
  record: Record<string, unknown>,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const normalized = normalizeReportNumber(record[key]);
    if (typeof normalized === "number") return normalized;
  }
  return undefined;
}

/**
 * 受信payloadから legacy（report-uri）形式の csp.report 用観測値を取り出す
 * - payload はオブジェクトで、"csp-report" キーを持つ想定
 */
function toLegacyCspViolationLogFields(
  payload: unknown,
): CspReportObservation | null {
  if (!isRecord(payload)) return null;
  const cspReport = payload["csp-report"];
  if (!isRecord(cspReport)) return null;

  return {
    format: "report-uri",
    documentUri: normalizeFieldFromRecord(cspReport, [
      "document-uri",
      "documentURL",
    ]),
    blockedUri: normalizeFieldFromRecord(cspReport, [
      "blocked-uri",
      "blockedURL",
    ]),
    effectiveDirective: normalizeFieldFromRecord(cspReport, [
      "effective-directive",
      "effectiveDirective",
      "violated-directive",
      "violatedDirective",
    ]),
    disposition: normalizeReportDisposition(cspReport.disposition),
    httpStatusCode: normalizeNumberFieldFromRecord(cspReport, [
      "status-code",
      "statusCode",
    ]),
  };
}

/**
 * 受信payloadから modern（report-to）形式の csp.report 用観測値リストを取り出す
 * - payload は配列で、各要素が report-to 形式のレコードである想定
 */
function toModernCspViolationLogFieldsList(
  payload: unknown,
): CspReportObservation[] {
  if (!Array.isArray(payload)) return [];

  const result: CspReportObservation[] = [];
  for (const entry of payload) {
    if (!isRecord(entry)) continue;
    // report-to 形式は type が "csp-violation" である必要があるため、type を見てフィルタリングする
    if (normalizeReportString(entry.type) !== "csp-violation") continue;

    const body = entry.body;
    if (!isRecord(body)) continue;

    result.push({
      format: "report-to",
      documentUri:
        normalizeFieldFromRecord(body, ["document-uri", "documentURL"]) ??
        normalizeReportString(entry.url),
      blockedUri: normalizeFieldFromRecord(body, ["blocked-uri", "blockedURL"]),
      effectiveDirective: normalizeFieldFromRecord(body, [
        "effective-directive",
        "effectiveDirective",
        "violated-directive",
        "violatedDirective",
      ]),
      disposition: normalizeReportDisposition(body.disposition),
      httpStatusCode: normalizeNumberFieldFromRecord(body, [
        "status-code",
        "statusCode",
      ]),
    });
  }

  return result;
}

/**
 * 204 No Content レスポンスを作成
 * - CSP違反レポートは攻撃者が任意に送れるため、例外を外へ漏らさず安全に終わることが重要
 * - 応答は常に 204 + no-store を返し、本文は返さない
 */
function createNoContentResponse(): NextResponse {
  return new NextResponse(null, {
    status: CSP_REPORT_NO_CONTENT_STATUS,
    headers: createNoStoreHeaders(),
  });
}

/**
 * Content-Type で確定した形式に応じて csp.report 用観測値を抽出する
 */
function extractCspViolationLogFieldsListByFormat(
  format: CspReportFormat,
  payload: unknown,
): CspReportObservation[] {
  if (format === "legacy") {
    const logFields = toLegacyCspViolationLogFields(payload);
    return logFields ? [logFields] : [];
  }
  return toModernCspViolationLogFieldsList(payload);
}

/**
 * POST /api/security/csp-report
 *
 * 契約:
 * - report-uri 形式（application/csp-report）を受理する
 * - report-to 形式（application/reports+json）を受理する
 * - 不正JSON（境界値）でも 204（No Content） で安全に終わること
 *
 * セキュリティ:
 * - CSP違反レポートは攻撃者が任意に送れるため、受信値は全てサニタイズしてログへ出す
 * - 応答は常に 204 + no-store を返し、本文は返さない
 */
export async function POST(request: NextRequest) {
  // 0) Content-Type から形式を判定し、未対応なら本文を読まず 204 を返す
  const format = parseCspReportFormatFromContentType(request);
  if (!format) {
    return createNoContentResponse();
  }

  // 1) Content-Length で巨大入力を読む前に防ぐ
  if (isBodyTooLargeByContentLength(request, MAX_CSP_REPORT_BODY_BYTES)) {
    return createNoContentResponse();
  }

  // 2) 本文を最大サイズ付きで読み取る（不正JSONは null）
  const payload = await safeReadJson<unknown>(request, {
    maxBytes: MAX_CSP_REPORT_BODY_BYTES,
  });
  if (payload === null) {
    return createNoContentResponse();
  }

  // 3) Content-Type で決めた parser で形式を抽出し、csp.report を構造化ログで出す
  const telemetryContext = createCspReportTelemetryContextFromRequest(request);
  const cspViolationLogFieldsList = extractCspViolationLogFieldsListByFormat(
    format,
    payload,
  );
  for (const fields of cspViolationLogFieldsList) {
    emitCspReportSafely({
      telemetryContext,
      fields,
    });
  }

  // 4) 既知形式でなくても 204 を返し、余計な情報は返さない
  return createNoContentResponse();
}
