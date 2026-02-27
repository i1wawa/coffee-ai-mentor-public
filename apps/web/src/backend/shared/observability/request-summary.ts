// apps/web/src/backend/shared/observability/request-summary.ts
// ================================================================
// 概要:
// - request.summary の共通ラッパ（Next.js Route Handler / Server Action）
//
// 責務:
// - 成功/失敗/例外でも request.summary を必ず 1 本出す
// - 観測値（事実）を組み立て、出力までを共通化する
// - Next.js 制御フロー例外（redirect/notFound 等）は再スローする
//
// 非目的:
// - severity の意味付けはしない（分類は呼び出し側に委ねる）
// - token/cookie/uid など機微情報をログに載せない
//
// 契約:
// - ok は httpStatusCode から決める
// - ok=false のときのみ error（errorId/errorCode）を載せる
// - Route Handler: throw 時は INTERNAL_ERROR 相当の JSON を返す（制御フロー例外は除く）
// - Server Action: throw 時は Result<*, ErrorFields> で返す（制御フロー例外は除く）
// ================================================================

import {
  coerceHttpMethod,
  defaultClassifyRequestSummary,
  emitRequestSummary,
  type HttpMethod,
  type RequestSummaryClassification,
  type RequestSummaryClassifier,
  type RequestSummaryObservation,
  tryExtractErrorFieldsFromUnknown,
} from "@packages/observability/src/logging/request-summary";
import {
  type CloudLoggingTraceContext,
  type CoreTelemetryContext,
  LOG_EVENT,
} from "@packages/observability/src/logging/telemetry-common";
import {
  buildErrorFields,
  type ErrorCode,
  type ErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { mapErrorCodeToHttpStatusCode } from "@packages/observability/src/logging/telemetry-error-http-mapping";
import type { HttpResult, Result } from "@packages/shared/src/result";
import { buildApiErrorBody } from "@/backend/shared/http/api-response";
import {
  createTelemetryContextFromRequestForRouteHandler,
  createTelemetryContextFromRequestForServerAction,
} from "./next-telemetry";
import {
  findNextJsControlFlowError,
  guessHttpStatusCodeFromNextJsControlFlowError,
} from "./nextjs-control-flow";
import {
  captureExceptionForRequest,
  runWithRequestSentryScope,
  setSentryUserHash,
} from "./sentry.server";

// ----------------------------------------------------------------
// 内部ヘルパ
// - 「アプリ処理を妨げずにログを出す」ための共通処理を集約する
// ----------------------------------------------------------------

/**
 * request.summaryログを安全に出力する
 * - 失敗してもアプリ処理を妨げない
 */
function emitRequestSummarySafely(args: {
  core: CoreTelemetryContext;
  trace: CloudLoggingTraceContext;
  obs: RequestSummaryObservation;
  classification: RequestSummaryClassification;
  failure_message: string;
}): void {
  try {
    emitRequestSummary({
      core: args.core,
      trace: args.trace,
      fields: {
        routePattern: args.obs.routePattern,
        httpMethod: args.obs.httpMethod,
        httpStatusCode: args.obs.httpStatusCode,
        latencyMs: args.obs.latencyMs,
        userHash: args.obs.userHash,
        errorId: args.obs.errorId,
        errorCode: args.obs.errorCode,
        sentryEventId: args.obs.sentryEventId,
      },
      classification: args.classification,
    });
  } catch {
    // emit失敗時は諦める（ログ出力失敗でアプリ処理を妨げない）
    console.error(
      JSON.stringify({
        event: LOG_EVENT.REQUEST_SUMMARY,
        request_id: args.core.requestId,
        trace_id: args.trace.traceId,
        message: args.failure_message,
        route_pattern: args.obs.routePattern,
        http_method: args.obs.httpMethod,
        http_status_code: args.obs.httpStatusCode,
        user_hash: args.obs.userHash,
        error_id: args.obs.errorId,
        error_code: args.obs.errorCode,
        sentry_event_id: args.obs.sentryEventId,
      }),
    );
  }
}

/**
 * 観測値から分類（severity）を安全に決める
 * - 失敗してもアプリ処理を妨げない
 */
function classifyRequestSummarySafely(args: {
  obs: RequestSummaryObservation;
  classify?: RequestSummaryClassifier;
}): RequestSummaryClassification {
  let classification = defaultClassifyRequestSummary(args.obs);

  // 安全策: classify 内で例外が起きても request.summary は出したい
  try {
    const classify = args.classify ?? defaultClassifyRequestSummary;
    classification = classify(args.obs);
  } catch {
    // 分類失敗時はデフォルト分類を使う
  }

  return classification;
}

/**
 * 相関ヘッダを安全に付与する
 * - 失敗してもアプリ処理を妨げない
 */
function attachCorrelationHeadersSafely(
  res: Response,
  args: { core: CoreTelemetryContext; trace: CloudLoggingTraceContext },
): void {
  // - NextResponse/Response を問わず headers.set は可能な想定
  try {
    res.headers.set("x-request-id", args.core.requestId);
    res.headers.set("x-trace-id", args.trace.traceId);
  } catch {
    // ヘッダ付与失敗はアプリ処理を妨げない
  }
}

/**
 * Next.js制御フロー例外なら情報を返す
 * - request.summary 用に status を推定する（レスポンス生成には使わない）
 */
function getNextJsControlFlowInfo(error: unknown): {
  controlFlowError: unknown;
  guessed_status: number;
} | null {
  const controlFlowError = findNextJsControlFlowError(error);
  if (!controlFlowError) return null;

  return {
    controlFlowError: controlFlowError,
    guessed_status:
      guessHttpStatusCodeFromNextJsControlFlowError(controlFlowError),
  };
}

/**
 * 例外から errorフィールドと httpStatusCode を導出する
 */
function applyExceptionToState(error: unknown): {
  errorId: string;
  errorCode: ErrorCode;
  httpStatusCode: number;
} {
  const extracted = tryExtractErrorFieldsFromUnknown(error);

  // 例外時: throwを拾えなかったらエラーフィールドを自作（想定外の例外対策）
  const resolvedErrorCode = extracted.errorCode ?? errorCode.INTERNAL_ERROR;
  const resolvedErrorId =
    extracted.errorId ?? buildErrorFields(resolvedErrorCode).errorId;
  const httpStatusCode = mapErrorCodeToHttpStatusCode(resolvedErrorCode);

  return {
    errorId: resolvedErrorId,
    errorCode: resolvedErrorCode,
    httpStatusCode,
  };
}

/**
 * overrideUserHash があれば userHash を上書きし、Sentry scope にも反映する
 * - 失敗してもアプリ処理を妨げない
 */
function syncOverriddenUserHashToSentry(args: {
  overrideUserHash: (() => string | undefined) | undefined;
  userHash: string;
}): string {
  let userHash = args.userHash;

  try {
    userHash = (args.overrideUserHash?.() ?? userHash) || "anonymous";
  } catch {
    // 生成失敗時はフォールバックを使う
  }

  try {
    setSentryUserHash(userHash);
  } catch {
    // Sentry scope 更新失敗でアプリ処理を妨げない
  }

  return userHash;
}

/**
 * 想定外例外を安全に Sentry に送る（送るべきものだけ）
 * - 失敗してもアプリ処理を妨げない
 */
function captureUnexpectedExceptionSafely(args: {
  error: unknown;
  httpStatusCode: number;
  errorId?: string | undefined;
  errorCode?: ErrorCode | undefined;
}): string | undefined {
  try {
    return captureExceptionForRequest({
      error: args.error,
      httpStatusCode: args.httpStatusCode,
      errorId: args.errorId,
      errorCode: args.errorCode,
    });
  } catch {
    // Sentry送信失敗でアプリ処理を妨げない
    return undefined;
  }
}

/**
 * Route Handler の userHash を最終化する
 * - overrideUserHash を適用し、Sentry scope にも反映する
 */
function finalizeRouteHandlerUserHash(args: {
  options: RequestSummaryRouteHandlerOptions;
  userHash: string;
}): string {
  return syncOverriddenUserHashToSentry({
    overrideUserHash: args.options.overrideUserHash,
    userHash: args.userHash,
  });
}

/**
 * Route Handler の例外時 Response を作る
 */
function buildRouteHandlerErrorResponse(args: {
  httpStatusCode: number;
  errorId?: string;
  errorCode?: ErrorCode;
  core: CoreTelemetryContext;
  trace: CloudLoggingTraceContext;
}): Response {
  // - 内部情報は出さず、問い合わせ用に errorId/errorCode だけ返す
  const resolvedErrorCode = args.errorCode ?? errorCode.INTERNAL_ERROR;
  const resolvedErrorId =
    args.errorId ?? buildErrorFields(resolvedErrorCode).errorId;

  const body = JSON.stringify(
    buildApiErrorBody({
      errorId: resolvedErrorId,
      errorCode: resolvedErrorCode,
    }),
  );
  const res = new Response(body, {
    status: args.httpStatusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

  // 相関ヘッダ（調査用）
  attachCorrelationHeadersSafely(res, { core: args.core, trace: args.trace });
  return res;
}

/**
 * Server Action の想定外例外結果を作る
 */
function buildUnexpectedResultForServerAction<TResult>(args: {
  errorId?: string;
  errorCode?: ErrorCode;
}): Result<TResult, ErrorFields> {
  const resolvedErrorCode = args.errorCode ?? errorCode.INTERNAL_ERROR;
  const resolvedErrorId =
    args.errorId ?? buildErrorFields(resolvedErrorCode).errorId;

  return {
    ok: false,
    error: { errorId: resolvedErrorId, errorCode: resolvedErrorCode },
  };
}

/**
 * Route Handlerの request context を初期化する
 * - telemetry / userHash を安全に生成し、フォールバックも内包する
 */
function initRouteHandlerRequestContext(args: {
  request: Request;
  options: RequestSummaryRouteHandlerOptions;
}): {
  routePattern: string;
  httpMethod: HttpMethod;
  core: CoreTelemetryContext;
  trace: CloudLoggingTraceContext;
  userHash: string;
} {
  const httpMethod = coerceHttpMethod(args.request.method);
  const routePattern = args.options.routePattern;

  // telemetry context / userHash は生成がthrowするとrequest.summaryが出ないため、フォールバックを先に用意し、try内で生成を試みる
  let core: CoreTelemetryContext = {
    env: "unknown",
    service: "unknown",
    release: "unknown",
    requestId: "unknown",
  };
  let trace: CloudLoggingTraceContext = {
    projectId: "unknown",
    traceId: "unknown",
  };
  let userHash = "anonymous";

  try {
    ({ core, trace } = createTelemetryContextFromRequestForRouteHandler(
      args.request,
    ));
  } catch {
    // 生成失敗時はフォールバックを使う
  }
  try {
    userHash =
      (args.options.createUserHash?.(args.request) ?? "anonymous") ||
      "anonymous";
  } catch {
    // 生成失敗時はフォールバックを使う
  }

  return { routePattern, httpMethod, core, trace, userHash };
}

/**
 * Server Actionの request context を初期化する
 * - telemetry / userHash を安全に生成し、フォールバックも内包する
 */
async function initServerActionRequestContext(args: {
  options: RequestSummaryServerActionOptions;
}): Promise<{
  routePattern: string;
  httpMethod: HttpMethod;
  core: CoreTelemetryContext;
  trace: CloudLoggingTraceContext;
  userHash: string;
}> {
  const routePattern = args.options.routePattern;
  const httpMethod = args.options.httpMethod;

  // telemetry context / userHash は生成がthrowするとrequest.summaryが出ないため、フォールバックを先に用意し、try内で生成を試みる
  let core: CoreTelemetryContext = {
    env: "unknown",
    service: "unknown",
    release: "unknown",
    requestId: "unknown",
  };
  let trace: CloudLoggingTraceContext = {
    projectId: "unknown",
    traceId: "unknown",
  };
  let userHash = "anonymous";

  try {
    ({ core, trace } =
      await createTelemetryContextFromRequestForServerAction());
  } catch {
    // 生成失敗時はフォールバックを使う
  }
  try {
    userHash = (args.options.createUserHash?.() ?? "anonymous") || "anonymous";
  } catch {
    // 生成失敗時はフォールバックを使う
  }

  return { routePattern, httpMethod, core, trace, userHash };
}

// ----------------------------------------------------------------
// request.summaryログ出力のNext.js Route Handler用ラッパ
// - 成功/例外どちらでもrequest.summaryログを必ず1本出す
// - Route HandlerはResponse / NextResponse（Next.js拡張版）を返す前提（statusを持つ）
// ----------------------------------------------------------------

/**
 * Route Handler実行時、RequestSummaryLogFields（request.summaryの必須ログフィールド）をつくるのに必要な設定
 */
export type RequestSummaryRouteHandlerOptions = {
  routePattern: string;
  // 匿名IDをつくる（未指定/失敗はanonymousにする）
  createUserHash?: (request: Request) => string;
  // 匿名IDを上書きする（/api/users/me が セッション検証後に uid が分かるため）
  overrideUserHash?: () => string | undefined;
  // 観測値から severity を決める（未指定ならデフォルト分類）
  classify?: RequestSummaryClassifier;
};

/**
 * request.summaryログ出力のNext.js Route Handler用ラッパ
 * - Route HandlerはResponse / NextResponse（Next.js拡張版）を返す前提（statusを持つ）
 *
 * 契約:
 * - handler が Response を返す場合
 *   - 成功(2xx/3xx): ok=true（error不要）
 *   - 失敗(4xx/5xx): ok=false（error必須）
 * - handler が throw した場合
 *   - wrapper が INTERNAL_ERROR を補完して request.summary に error を必ず載せる
 *   - 例外時Response（500相当など）を返す（Next.js制御フロー例外は除く）
 *
 * 目的:
 * - request.summary を 1リクエストにつき必ず1本出す（成功/失敗/例外でも）
 * - severity の意味付け（分類）は呼び出し側に寄せる（骨格/分類 分離）
 */
export async function runRouteHandlerWithRequestSummary(
  // 呼び出し元の本来の処理の引数（外部リクエスト）
  request: Request,
  // RequestSummaryLogFields（request.summaryの必須ログフィールド）をつくるのに必要な設定
  options: RequestSummaryRouteHandlerOptions,
  // 呼び出し元の本来の処理（これに関するログを出す）
  handler: (request: Request) => Promise<HttpResult<Response, ErrorFields>>,
): Promise<Response> {
  // 1) 計測開始
  const start = Date.now();

  // 2) ログに必要な情報を先に決める（finallyで使用するため）
  const initial = initRouteHandlerRequestContext({ request, options });
  const routePattern = initial.routePattern;
  const httpMethod = initial.httpMethod;
  const core = initial.core;
  const trace = initial.trace;
  let userHash = initial.userHash;

  // 3) statusは成功ならres.statusから取れるが、例外時は取れないので変数で持つ
  let httpStatusCode = mapErrorCodeToHttpStatusCode(errorCode.INTERNAL_ERROR);

  // 4) errorフィールド準備
  let errorId: string | undefined;
  let observedErrorCode: ErrorCode | undefined;
  // 変更点:
  // - 想定外例外をSentryに送った場合は sentryEventId をログに載せる
  let sentryEventId: string | undefined;

  return await runWithRequestSentryScope(
    {
      core,
      trace,
      routePattern,
      httpMethod,
      userHash,
    },
    async () => {
      try {
        // 5) 呼び出し元の本来の処理を実行
        const result = await handler(request);

        // 6) 成功時：Responseのstatusを読む
        httpStatusCode = result.value.status;

        // 7) 失敗は必ず error_fields を付与
        if (!result.ok) {
          errorId = result.error.errorId;
          observedErrorCode = result.error.errorCode;
        }

        // 8) 相関ヘッダを付与する（クライアント側の調査用）
        attachCorrelationHeadersSafely(result.value, { core, trace });

        // 9) Response を返す
        return result.value;
      } catch (e: unknown) {
        // 例外時 1) Next.js制御フロー例外は必ず再スロー（Next.jsの挙動を壊さない）
        // - cause に隠れている場合があるため、数段だけ辿って検知する
        const controlFlow = getNextJsControlFlowInfo(e);
        if (controlFlow) {
          // request.summary 用に status を推定して記録する（レスポンス生成には使わない）
          httpStatusCode = controlFlow.guessed_status;

          // 制御フローはアプリ失敗ではないため errorId/errorCode は載せない
          errorId = undefined;
          observedErrorCode = undefined;

          // wrapper（外側）ではなく “制御フロー例外そのもの” を投げ直す
          // - Next.js が期待している例外オブジェクトを渡すため
          throw controlFlow.controlFlowError;
        }

        const applied = applyExceptionToState(e);
        errorId = applied.errorId;
        observedErrorCode = applied.errorCode;
        httpStatusCode = applied.httpStatusCode;

        // 例外時 2) overrideUserHash があれば userHash を上書きし、Sentryのscopeにも反映する
        // - 例: /api/users/me は セッション検証後に uid が分かるため
        userHash = syncOverriddenUserHashToSentry({
          overrideUserHash: options.overrideUserHash,
          userHash,
        });

        // 例外時 3) 想定外だけを Sentry へ送る
        sentryEventId = captureUnexpectedExceptionSafely({
          error: e,
          httpStatusCode,
          errorId,
          errorCode: observedErrorCode,
        });

        // 例外時 4) Route Handler はHTTP境界なので、ここで例外時Responseを返す（再throwしない）
        return buildRouteHandlerErrorResponse({
          httpStatusCode,
          errorId,
          errorCode: observedErrorCode,
          core,
          trace,
        });
      } finally {
        // 9) request.summary は 1リクエストにつき必ず1本出す
        const latencyMs = Date.now() - start;

        // 11) overrideUserHash があれば userHash を上書きする
        // - 例: /api/users/me は セッション検証後に uid が分かるため
        userHash = finalizeRouteHandlerUserHash({ options, userHash });

        // 12) 観測値（事実）を組み立てる
        const obs: RequestSummaryObservation = {
          routePattern,
          httpMethod,
          httpStatusCode,
          latencyMs,
          // 匿名IDを上書きする（/api/users/me が セッション検証後に uid が分かるため）
          userHash,
          sentryEventId,
          errorId: errorId,
          errorCode: observedErrorCode,
        };

        // 13) 分類（severity）を決める（未指定ならデフォルト分類）
        const classification = classifyRequestSummarySafely({
          obs,
          classify: options.classify,
        });

        // 14) request.summaryログを出力
        emitRequestSummarySafely({
          core,
          trace,
          obs,
          classification,
          failure_message:
            "Route Handler での request.summary ログの出力に失敗しました",
        });
      }
    },
  );
}

// ----------------------------------------------------------------
// request.summaryログ出力のServer Action用ラッパ
// - Server ActionはHTTPレスポンスを返さないことが多い
// - 成功=200/例外=500の擬似ステータスでrequest.summaryログを必ず1本出す
// ----------------------------------------------------------------

/**
 * Server Action実行時、RequestSummaryLogFields（request.summaryの必須ログフィールド）をつくるのに必要な設定
 */
export type RequestSummaryServerActionOptions = {
  routePattern: string;
  // Server Actionは運用上POST扱いに寄せることが多い
  httpMethod: HttpMethod;
  // 匿名IDをつくる（未指定/失敗はanonymousにする）
  // （Server ActionはRequestオブジェクトを返さないため、引数なし）
  createUserHash?: () => string;
  // 成功時の擬似ステータス（未指定は200）
  successStatusCode?: number;
  // 観測値から severity を決める（未指定ならデフォルト分類）
  classify?: RequestSummaryClassifier;
};

/**
 * request.summaryログ出力のNext.js Server Action用ラッパ
 * - Server ActionはHTTPレスポンスを返さないことが多い
 * - statusは成功=200の擬似ステータスを持つ
 *
 * 目的:
 * - request.summary を 1リクエストにつき必ず1本出す（成功/失敗/例外でも）
 * - severity の意味付け（分類）は呼び出し側に寄せる（骨格/分類 分離）
 */
export async function runServerActionWithRequestSummary<
  // 引数actionの引数・戻り値の型パラメータ
  TArgs extends unknown[],
  TResult,
>(
  // RequestSummaryLogFields（request.summaryの必須ログフィールド）をつくるのに必要な設定
  options: RequestSummaryServerActionOptions,
  // 呼び出し元の本来の処理（Server Action）（これに関するログを出す）
  action: (...args: TArgs) => Promise<Result<TResult, ErrorFields>>,
  // 呼び出し元の本来の処理（Server Action）への引数
  ...args: TArgs
): Promise<Result<TResult, ErrorFields>> {
  // 1) 計測開始
  const start = Date.now();

  // 2) ログに必要な情報を先に決める（finallyで使用するため）
  const initial = await initServerActionRequestContext({ options });
  const routePattern = initial.routePattern;
  const httpMethod = initial.httpMethod;
  const core = initial.core;
  const trace = initial.trace;
  const userHash = initial.userHash;

  // 3) statusは成功/失敗で擬似的に持つ
  let pseudoHttpStatusCode = options.successStatusCode ?? 200;

  // 4) errorフィールド準備
  let errorId: string | undefined;
  let observedErrorCode: ErrorCode | undefined;
  // 変更点:
  // - 想定外例外をSentryに送った場合は sentryEventId をログに載せる
  let sentryEventId: string | undefined;

  return await runWithRequestSentryScope(
    {
      core,
      trace,
      routePattern,
      httpMethod,
      userHash,
    },
    async () => {
      try {
        // 5) 呼び出し元の本来の処理（Server Action）を実行
        const result = await action(...args);

        // 6) 成功時: successStatusCode（通常200）
        if (result.ok) return result;

        // 7) 失敗時: error_status_code をエラーコードと対応して決める
        errorId = result.error.errorId;
        observedErrorCode = result.error.errorCode;
        pseudoHttpStatusCode = mapErrorCodeToHttpStatusCode(observedErrorCode);

        // 8) 失敗時: Result を返して呼び出し側に委ねる
        // - 例外throwにすると、UIイベント起点で catch 漏れが事故りやすい
        return result;
      } catch (e) {
        // 例外時 1) Next.js制御フロー例外は必ず再スロー（Next.jsの挙動を壊さない）
        // - cause に隠れている場合があるため、数段だけ辿って検知する
        const controlFlow = getNextJsControlFlowInfo(e);
        if (controlFlow) {
          // request.summary 用に status を推定して記録する（レスポンス生成には使わない）
          pseudoHttpStatusCode = controlFlow.guessed_status;

          // 制御フローはアプリ失敗ではないため errorId/errorCode は載せない
          errorId = undefined;
          observedErrorCode = undefined;

          // wrapper（外側）ではなく “制御フロー例外そのもの” を投げ直す
          // - Next.js が期待している例外オブジェクトを渡すため
          throw controlFlow.controlFlowError;
        }

        const applied = applyExceptionToState(e);
        errorId = applied.errorId;
        observedErrorCode = applied.errorCode;
        pseudoHttpStatusCode = applied.httpStatusCode;

        // 例外時 2) 想定外だけを Sentry へ送る
        sentryEventId = captureUnexpectedExceptionSafely({
          error: e,
          httpStatusCode: pseudoHttpStatusCode,
          errorId,
          errorCode: observedErrorCode,
        });

        // 例外時 3) Result で返す（unexpected は INTERNAL_ERROR に寄せ、UI は errorId のみ表示できる）
        return buildUnexpectedResultForServerAction({
          errorId,
          errorCode: observedErrorCode,
        });
      } finally {
        // 9) request.summary は 1リクエストにつき必ず1本出す
        const latencyMs = Date.now() - start;

        // 10) 観測値（事実）を組み立てる
        const obs: RequestSummaryObservation = {
          routePattern,
          httpMethod,
          httpStatusCode: pseudoHttpStatusCode,
          latencyMs,
          userHash,
          sentryEventId,
          errorId: errorId,
          errorCode: observedErrorCode,
        };

        // 11) 分類（severity）を決める（未指定ならデフォルト分類）
        const classification = classifyRequestSummarySafely({
          obs,
          classify: options.classify,
        });

        // 12) request.summaryログを出力
        emitRequestSummarySafely({
          core,
          trace,
          obs,
          classification,
          failure_message:
            "Server Action での request.summary ログの出力に失敗しました",
        });
      }
    },
  );
}
