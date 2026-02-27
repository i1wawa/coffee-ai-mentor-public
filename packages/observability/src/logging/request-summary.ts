// packages/observability/src/logging/request-summary.ts
// ================================================================
// 概要:
// - Cloud Logging 向け request.summary ログの共通実装
//
// 責務:
// - request.summary の観測値（事実）と分類（severity）を分離して扱う
// - status から ok と基礎 severity を導出し、ログ1本分を出力する
//
// 契約:
// - 「この401は正常」などの仕様判断はここに入れない（呼び出し側で分類する）
// - token/cookie/uid などの機微情報を扱わない（入力として受けない）
// - 失敗（ok=false）のときだけ error_id / error_code をログに載せる
// - 想定外例外をSentryに送った場合のみ sentry_event_id をログに載せる
// - ok は httpStatusCode から決める（2xx/3xx=true、4xx/5xx=false）
// - severity は classification があればそれを優先し、無ければ status 帯域で決める
//
// 前提:
// - 観測値（RequestSummaryObservation）: 事実のみ
// - 分類（RequestSummaryClassification）: 運用判断（呼び出し側で上書き可能）
//
// 観測:
// - 1リクエスト1本の担保はラッパ側の責務（この関数は1回分だけ出す）
// ================================================================

import {
  type CloudLoggingTraceContext,
  type CoreTelemetryContext,
  emitCloudLoggingLog,
  LOG_EVENT,
  type LogSeverity,
} from "./telemetry-common";
import { type ErrorFields, isErrorCode } from "./telemetry-error-common";

// ----------------------------------------------------------------
// 型定義
// ----------------------------------------------------------------

/**
 * HTTPメソッド
 */
export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "OPTIONS"
  | "HEAD";

// ----------------------------------------------------------------
// 内部関数
// ----------------------------------------------------------------

// HTTPメソッドの検証用
const isHttpMethod = (v: unknown): v is HttpMethod =>
  v === "GET" ||
  v === "POST" ||
  v === "PUT" ||
  v === "PATCH" ||
  v === "DELETE" ||
  v === "OPTIONS" ||
  v === "HEAD";

// 型補正（不正値はGETにフォールバック）
export const coerceHttpMethod = (v: unknown): HttpMethod =>
  isHttpMethod(v) ? v : "GET";

// okの基本方針
// - 2xx/3xx: 成功（成功/リダイレクト）
// - 4xx/5xx: 失敗（クライアントエラー/サーバーエラー）
const deriveOkFromStatus = (httpStatusCode: number): boolean =>
  httpStatusCode >= 200 && httpStatusCode < 400;

/**
 * HTTPステータスから severity を基本方針どおりに導出
 *
 * 方針:
 * - 5xx: ERROR（サーバーエラー）
 * - 4xx: WARNING（クライアントエラー）
 * - 2xx/3xx: INFO
 */
export const deriveSeverityBase = (httpStatusCode: number): LogSeverity => {
  if (httpStatusCode >= 500) return "ERROR";
  if (httpStatusCode >= 400) return "WARNING";
  return "INFO";
};

// ----------------------------------------------------------------
// 骨格/分類 分離（分類は呼び出し側へ）
// ----------------------------------------------------------------

/**
 * request.summary に関する観測値（事実）を表す型
 * - ここには「この401は正常」などの仕様判断を入れない
 * - severity の意味付けは呼び出し側（route.ts等）に寄せる
 */
export type RequestSummaryObservation = {
  // パターンで固定化した相対パス（例: "api/items/:id"）
  routePattern: string;
  // HTTPメソッド
  httpMethod: HttpMethod;
  // HTTPステータスコード
  httpStatusCode: number;
  // 所要時間（ms）
  latencyMs: number;
  // 匿名ID（sha256等、復元不能な形で保持）
  userHash: string;
  // 想定外例外をSentryに送った場合のみ付与する
  // - eventId は Sentry 側のイベントを一意に指す
  sentryEventId?: string;
  // 失敗/例外で拾えた場合のみ付与する（拾えないケースもある）
} & Partial<ErrorFields>;

/**
 * request.summary に関する分類の結果を表す型
 * - severity も監視/運用方針で変えたいことがあるため、呼び出し側に寄せる
 */
export type RequestSummaryClassification = {
  severity: LogSeverity;
};

/**
 * request.summary の分類関数（呼び出し側で実装する）
 * - 観測値（事実）を受け取り、severity を決める
 */
export type RequestSummaryClassifier = (
  obs: RequestSummaryObservation,
) => RequestSummaryClassification;

/**
 * デフォルト分類（特例を持たない）
 * - severity は status の帯域で決める
 *
 * ※ 499 などの特別扱いは呼び出し側の classify で severity を上書きする。
 */
export function defaultClassifyRequestSummary(
  obs: RequestSummaryObservation,
): RequestSummaryClassification {
  // severity は基本方針（5xx=ERROR, 4xx=WARNING, else INFO）
  const severity = deriveSeverityBase(obs.httpStatusCode);

  return { severity };
}

/**
 * 例外から errorフィールド を拾う（拾えないなら undefined）
 * - “throw する例外に errorフィールド を載せる” 設計にも対応
 */
export function tryExtractErrorFieldsFromUnknown(
  e: unknown,
): Partial<ErrorFields> {
  if (typeof e !== "object" || e === null) return {};

  const errorRecord = e as Record<string, unknown>;
  const errorFields: Partial<ErrorFields> = {};

  if (typeof errorRecord.errorId === "string")
    errorFields.errorId = errorRecord.errorId;
  if (isErrorCode(errorRecord.errorCode))
    errorFields.errorCode = errorRecord.errorCode;
  return errorFields;
}

/**
 * 例外を Error に正規化するユーティリティ
 * - 目的: catch した unknown を「情報付与して再throw」できる形にする
 * - これにより Route Handler / Server Action の例外経路でも errorフィールド を伝播できる
 */
export function normalizeUnknownToError(e: unknown): Error {
  // 1) すでに Error ならそのまま返す（stack を保持）
  if (e instanceof Error) return e;
  // 2) 文字列/その他は Error に包む
  const message = typeof e === "string" ? e : "Unknown error";
  return new Error(message);
}

// ----------------------------------------------------------------
// request.summaryログ出力
// - 出す場所（成功/失敗を含む制御）はラッパ側で担保する
// ----------------------------------------------------------------

/**
 * request.summaryの必須ログフィールド
 */
type RequestSummaryLogFields = {
  // パターンで固定化した相対パス（例: "api/items/:id"）
  routePattern: string;
  // HTTPメソッド
  httpMethod: HttpMethod;
  // HTTPステータスコード
  httpStatusCode: number;
  // 成功/失敗フラグ
  ok: boolean;
  // 所要時間（ms）
  latencyMs: number;
  // 匿名ID（sha256等、復元不能な形で保持）
  userHash: string;
  // 想定外例外をSentryに送った場合のみ付与する
  // - eventId は Sentry 側のイベントを一意に指す
  sentryEventId?: string;
  // 失敗/例外で拾えた場合のみ付与する（拾えないケースもある）
} & Partial<ErrorFields>;

/**
 * 呼び出し元はokを渡せないので除く
 */
export type RequestSummaryInputFields = Omit<RequestSummaryLogFields, "ok">;

/**
 * request.summaryログ出力
 * - 出力回数（必ず1本）はラッパ側で担保する
 * - severity は classification で上書き可能
 *
 * 1) okとseverityを導出
 *    - classification が渡された場合は severity を優先する
 * 2) latencyMs を補正
 * 3) errorフィールドは失敗時だけ付与
 * 4) ログ出力
 */
export const emitRequestSummary = (args: {
  core: CoreTelemetryContext;
  trace: CloudLoggingTraceContext;
  // 呼び出し元はokを渡せないので除く
  fields: RequestSummaryInputFields;
  // 分類（severity）を呼び出し側から渡せるようにする（未指定なら従来どおりstatusから導出）
  classification?: RequestSummaryClassification;
}) => {
  // 1) okとseverityを導出
  const ok = deriveOkFromStatus(args.fields.httpStatusCode);
  const severity =
    args.classification?.severity ??
    deriveSeverityBase(args.fields.httpStatusCode);

  // 2) latencyMs を補正
  // - NaNなどはCloud Monitoringで弾かれるので、0以上の整数に補正
  const latencyMs = Math.max(0, Math.round(args.fields.latencyMs));

  // 3) errorフィールドは失敗時だけ付与
  const failurePayload: {
    error_id?: ErrorFields["errorId"];
    error_code?: ErrorFields["errorCode"];
    sentry_event_id?: string;
  } = {};
  // エラーIDが存在する場合のみ追加
  if (!ok && args.fields.errorId) failurePayload.error_id = args.fields.errorId;
  // エラーコードが存在する場合のみ追加
  if (!ok && args.fields.errorCode)
    failurePayload.error_code = args.fields.errorCode;
  // SentryのeventIdが存在する場合のみ追加
  if (!ok && args.fields.sentryEventId)
    failurePayload.sentry_event_id = args.fields.sentryEventId;

  // 4) ログ出力
  emitCloudLoggingLog(args.core, args.trace, {
    severity,
    event: LOG_EVENT.REQUEST_SUMMARY,
    message: `${args.fields.httpMethod} ${args.fields.routePattern} -> ${args.fields.httpStatusCode} (${latencyMs}ms)${
      // errorCodeは存在するときだけメッセージに含める
      !ok && args.fields.errorCode ? ` [${args.fields.errorCode}]` : ""
    }`,
    route_pattern: args.fields.routePattern,
    http_method: args.fields.httpMethod,
    http_status_code: args.fields.httpStatusCode,
    ok,
    latency_ms: latencyMs,
    user_hash: args.fields.userHash,
    // errorフィールドは失敗時だけ載せる
    ...failurePayload,
  });
};
