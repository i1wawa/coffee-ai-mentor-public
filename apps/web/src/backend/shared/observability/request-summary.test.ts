// apps/web/src/backend/shared/observability/request-summary.test.ts
// ================================================================
// 概要:
// - request.summary の共通ラッパ（Route Handler / Server Action）のユニットテスト
//
// 契約:
// - handler や action の中身（ビジネスロジック）ではなく、ラッパの契約を固定する
// - 成功/失敗/例外/制御フロー例外のときでも request.summary を 1 本出すことを確認する
// ================================================================

import { emitRequestSummary } from "@packages/observability/src/logging/request-summary";
import {
  buildErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { mapErrorCodeToHttpStatusCode } from "@packages/observability/src/logging/telemetry-error-http-mapping";
import { err, errHttp, ok, okHttp } from "@packages/shared/src/result";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectErrCode } from "@/tests/vitest-utils/utils/result-assertions";
import {
  createTelemetryContextFromRequestForRouteHandler,
  createTelemetryContextFromRequestForServerAction,
} from "./next-telemetry";
import {
  findNextJsControlFlowError,
  guessHttpStatusCodeFromNextJsControlFlowError,
} from "./nextjs-control-flow";
import {
  runRouteHandlerWithRequestSummary,
  runServerActionWithRequestSummary,
} from "./request-summary";
import {
  captureExceptionForRequest,
  runWithRequestSentryScope,
  setSentryUserHash,
} from "./sentry.server";

const sentryCaptured: Array<{
  httpStatusCode: number;
  errorId?: string;
  errorCode?: string;
}> = [];

vi.mock("./nextjs-control-flow", () => {
  return {
    findNextJsControlFlowError: vi.fn(),
    guessHttpStatusCodeFromNextJsControlFlowError: vi.fn(),
  };
});

vi.mock("./next-telemetry", () => {
  return {
    createTelemetryContextFromRequestForRouteHandler: vi.fn(),
    createTelemetryContextFromRequestForServerAction: vi.fn(),
  };
});

vi.mock("@packages/observability/src/logging/request-summary", async () => {
  // 実装は基本そのまま使い、emit だけ差し替える
  const actual = await vi.importActual<
    typeof import("@packages/observability/src/logging/request-summary")
  >("@packages/observability/src/logging/request-summary");

  return {
    ...actual,
    emitRequestSummary: vi.fn(),
  };
});

vi.mock("./sentry.server", () => {
  return {
    runWithRequestSentryScope: vi.fn(),
    captureExceptionForRequest: vi.fn(),
    setSentryUserHash: vi.fn(),
  };
});

const mockedFindNextJsControlFlowError = vi.mocked(findNextJsControlFlowError);
const mockedGuessHttpStatusCodeFromNextJsControlFlowError = vi.mocked(
  guessHttpStatusCodeFromNextJsControlFlowError,
);
const mockedCreateTelemetryContextFromRequestForRouteHandler = vi.mocked(
  createTelemetryContextFromRequestForRouteHandler,
);
const mockedCreateTelemetryContextFromRequestForServerAction = vi.mocked(
  createTelemetryContextFromRequestForServerAction,
);
const mockedRunWithRequestSentryScope = vi.mocked(runWithRequestSentryScope);
const mockedCaptureExceptionForRequest = vi.mocked(captureExceptionForRequest);
const mockedSetSentryUserHash = vi.mocked(setSentryUserHash);

function setDeterministicLatencyMs(args: { startMs: number; endMs: number }) {
  // Date.now は runRouteHandlerWithRequestSummary 内で start と finally の 2 回使われる
  vi.spyOn(Date, "now")
    .mockReturnValueOnce(args.startMs)
    .mockReturnValueOnce(args.endMs);
}

const TEST_ROUTE_URL = "http://127.0.0.1/api/test";

function createRouteRequest(): Request {
  return new Request(TEST_ROUTE_URL, { method: "GET" });
}

function setDefaultInfraMocks() {
  mockedFindNextJsControlFlowError.mockReturnValue(null);
  mockedGuessHttpStatusCodeFromNextJsControlFlowError.mockReturnValue(303);

  mockedCreateTelemetryContextFromRequestForRouteHandler.mockReturnValue({
    core: {
      env: "dev",
      service: "test",
      release: "test",
      requestId: "req_1",
    },
    trace: { projectId: "p1", traceId: "t1" },
  });
  mockedCreateTelemetryContextFromRequestForServerAction.mockResolvedValue({
    core: {
      env: "dev",
      service: "test",
      release: "test",
      requestId: "req_2",
    },
    trace: { projectId: "p2", traceId: "t2" },
  });

  mockedRunWithRequestSentryScope.mockImplementation(
    async (_ctx, fn: () => Promise<unknown>) => await fn(),
  );
  mockedCaptureExceptionForRequest.mockImplementation((args) => {
    void args.error;
    if (!args.errorCode || args.errorCode === "INTERNAL_ERROR") {
      sentryCaptured.push({
        httpStatusCode: args.httpStatusCode,
        errorId: args.errorId,
        errorCode: args.errorCode,
      });
      return "evt_test_1";
    }
    return undefined;
  });
  mockedSetSentryUserHash.mockImplementation((_userHash: string) => {
    void _userHash;
  });
}

describe("runRouteHandlerWithRequestSummary", () => {
  const mockedEmitRequestSummary = vi.mocked(emitRequestSummary);

  beforeEach(() => {
    // 1) 各テストのモック状態をリセットする
    vi.restoreAllMocks();
    mockedEmitRequestSummary.mockReset();
    mockedFindNextJsControlFlowError.mockReset();
    mockedGuessHttpStatusCodeFromNextJsControlFlowError.mockReset();
    mockedCreateTelemetryContextFromRequestForRouteHandler.mockReset();
    mockedCreateTelemetryContextFromRequestForServerAction.mockReset();
    mockedRunWithRequestSentryScope.mockReset();
    mockedCaptureExceptionForRequest.mockReset();
    mockedSetSentryUserHash.mockReset();
    sentryCaptured.length = 0;

    // 2) 制御フロー/telemetry の既定モックを戻す
    setDefaultInfraMocks();
  });

  it("成功: handler が 200 を返すと Response を返し、request.summary を 1 本出す", async () => {
    // 1) 所要時間を固定する
    setDeterministicLatencyMs({ startMs: 1000, endMs: 1100 });

    // 2) Route Handler の入力を用意する
    const request = createRouteRequest();
    const expectedUserHash = "userHash_1";

    // 3) runRouteHandlerWithRequestSummary のオプションを用意する
    // - createUserHash は Route Handler の生リクエストを見て匿名IDを作る想定
    const options = {
      routePattern: "/api/test",
      createUserHash: () => expectedUserHash,
      // override は未指定（createUserHash の値がそのまま使われる）
    } as const;

    // 4) 呼び出し元の本来の処理を模擬する
    // - HttpResult の ok=true は 2xx/3xx を意味する
    const handlerHttpStatus = 200;
    const handlerResponse = new Response("ok", { status: handlerHttpStatus });
    const handler = vi.fn(async () => {
      return okHttp(handlerResponse);
    });

    // 5) 実行
    const response = await runRouteHandlerWithRequestSummary(
      request,
      options,
      handler,
    );

    // 6) runRouteHandlerWithRequestSummary は handler の Response を返す
    expect(response).toBe(handlerResponse);
    expect(response.status).toBe(handlerHttpStatus);

    // 6-1) 相関ヘッダが付与される
    expect(response.headers.get("x-request-id")).toBe("req_1");
    expect(response.headers.get("x-trace-id")).toBe("t1");

    // 7) request.summary は 1 本だけ出る
    expect(mockedEmitRequestSummary).toHaveBeenCalledTimes(1);

    // 8) ログに必要な最小フィールドを確認する
    const callArgs = mockedEmitRequestSummary.mock.calls[0]?.[0];
    expect(callArgs).toMatchObject({
      fields: {
        routePattern: options.routePattern,
        httpMethod: request.method,
        httpStatusCode: handlerHttpStatus,
        userHash: expectedUserHash,
      },
    });

    // 9) 成功では Sentry へは送らない
    expect(sentryCaptured).toHaveLength(0);
  });

  it("失敗: handler が失敗すると Response を返し、error を含む request.summary を 1 本出す", async () => {
    // 1) 所要時間を固定する
    setDeterministicLatencyMs({ startMs: 2000, endMs: 2050 });

    // 2) Route Handler の入力を用意する
    const request = createRouteRequest();
    const expectedUserHash = "userHash_2";

    // 3) runRouteHandlerWithRequestSummary のオプションを用意する
    const options = {
      routePattern: "/api/test",
      createUserHash: () => expectedUserHash,
    } as const;

    // 4) 失敗用の ErrorFields を用意する
    // - errorId は毎回生成されるため値一致ではなく存在確認に寄せる
    const error = buildErrorFields(errorCode.AUTH_REQUIRED);

    // 5) 呼び出し元の本来の処理を模擬する
    // - HttpResult の ok=false は 4xx/5xx を意味する
    const handlerHttpStatusCode = 401;
    const handlerResponse = new Response("unauthorized", {
      status: handlerHttpStatusCode,
    });
    const handler = vi.fn(async () => {
      return errHttp(handlerResponse, error);
    });

    // 6) 実行
    const response = await runRouteHandlerWithRequestSummary(
      request,
      options,
      handler,
    );

    // 7) runRouteHandlerWithRequestSummary は handler の Response を返す
    expect(response).toBe(handlerResponse);
    expect(response.status).toBe(handlerHttpStatusCode);

    // 7-1) 相関ヘッダが付与される
    expect(response.headers.get("x-request-id")).toBe("req_1");
    expect(response.headers.get("x-trace-id")).toBe("t1");

    // 8) request.summary は 1 本だけ出る
    expect(mockedEmitRequestSummary).toHaveBeenCalledTimes(1);

    // 9) 失敗なので errorCode がログに入る
    const callArgs = mockedEmitRequestSummary.mock.calls[0]?.[0];
    expect(callArgs).toMatchObject({
      fields: {
        routePattern: options.routePattern,
        httpMethod: request.method,
        httpStatusCode: handlerHttpStatusCode,
        userHash: expectedUserHash,
        errorCode: error.errorCode,
      },
    });
    expect(callArgs?.fields?.errorId).toEqual(expect.stringMatching(/.+/));

    // 10) 想定内（401）の戻り値では Sentry へは送らない
    expect(sentryCaptured).toHaveLength(0);
  });

  it("例外: 制御フロー例外は rethrow しつつ、request.summary は 1 本出す", async () => {
    // 1) 制御フロー扱いを有効にする
    const controlFlowError = new Error("control flow");
    mockedFindNextJsControlFlowError.mockReturnValue(controlFlowError);
    const nextJsHttpStatusCode = 404;
    mockedGuessHttpStatusCodeFromNextJsControlFlowError.mockReturnValue(
      nextJsHttpStatusCode,
    );

    // 2) 所要時間を固定する
    setDeterministicLatencyMs({ startMs: 3000, endMs: 3100 });

    // 3) Route Handler の入力を用意する
    const request = createRouteRequest();
    const expectedUserHash = "userHash_3";

    // 4) runRouteHandlerWithRequestSummary のオプションを用意する
    const options = {
      routePattern: "/api/test",
      createUserHash: () => expectedUserHash,
    } as const;

    // 5) 呼び出し元の本来の処理を模擬する
    // - ここでは何を throw しても、findNextJsControlFlowError が controlFlowError を返す
    const handler = vi.fn(async () => {
      throw new Error("original error");
    });

    // 6) 実行し、制御フロー例外として投げ直されることを確認する
    await expect(
      runRouteHandlerWithRequestSummary(request, options, handler),
    ).rejects.toBe(controlFlowError);

    // 7) request.summary は 1 本だけ出る
    expect(mockedEmitRequestSummary).toHaveBeenCalledTimes(1);

    // 8) 制御フローはアプリ失敗ではないため errorCode は載せない
    // - ただし request.summary の status は推定値になる
    const callArgs = mockedEmitRequestSummary.mock.calls[0]?.[0];
    expect(callArgs).toMatchObject({
      fields: {
        routePattern: options.routePattern,
        httpMethod: request.method,
        httpStatusCode: nextJsHttpStatusCode,
        userHash: expectedUserHash,
      },
    });
    expect(callArgs?.fields?.errorId).toBeUndefined();
    expect(callArgs?.fields?.errorCode).toBeUndefined();

    // 9) 制御フローは Sentry へ送らない
    expect(sentryCaptured).toHaveLength(0);
  });

  it("例外: 通常例外は runRouteHandlerWithRequestSummary が 5xx 相当の Response を返し、request.summary を 1 本出す", async () => {
    // 1) 所要時間を固定する
    setDeterministicLatencyMs({ startMs: 4000, endMs: 4123 });

    // 2) Route Handler の入力を用意する
    const request = createRouteRequest();
    const beforeOverrideUserHash = "userHash_before_override";
    const afterOverrideUserHash = "userHash_after_override";

    // 3) runRouteHandlerWithRequestSummary のオプションを用意する
    // - overrideUserHash が最終的に優先されることも確認したい
    const options = {
      routePattern: "/api/test",
      createUserHash: () => beforeOverrideUserHash,
      overrideUserHash: () => afterOverrideUserHash,
    } as const;

    // 4) 呼び出し元の本来の処理を模擬する
    // - errorId/errorCode を例外に載せる設計のとき、runRouteHandlerWithRequestSummary が拾ってログに入れる契約
    const thrownError = {
      errorId: "e1",
      errorCode: errorCode.UNAVAILABLE,
    };
    const expectedHttpStatusCode = mapErrorCodeToHttpStatusCode(
      thrownError.errorCode,
    );
    const handler = vi.fn(async () => {
      throw thrownError;
    });

    // 5) 実行
    const response = await runRouteHandlerWithRequestSummary(
      request,
      options,
      handler,
    );

    // 6) runRouteHandlerWithRequestSummary は例外を握り、HTTP境界として Response を返す
    // - status は errorCode から導出される
    expect(response.status).toBe(expectedHttpStatusCode);

    // 7) body は contracts どおり ok=false, error を含む
    const bodyJson = (await response.json()) as unknown;
    expect(bodyJson).toMatchObject({
      ok: false,
      error: {
        errorId: thrownError.errorId,
        errorCode: thrownError.errorCode,
      },
    });

    // 7-1) 相関ヘッダが付与される
    expect(response.headers.get("x-request-id")).toBe("req_1");
    expect(response.headers.get("x-trace-id")).toBe("t1");

    // 8) request.summary は 1 本だけ出る
    expect(mockedEmitRequestSummary).toHaveBeenCalledTimes(1);

    // 9) overrideUserHash が適用される
    const callArgs = mockedEmitRequestSummary.mock.calls[0]?.[0];
    expect(callArgs).toMatchObject({
      fields: {
        routePattern: options.routePattern,
        httpMethod: request.method,
        httpStatusCode: expectedHttpStatusCode,
        userHash: afterOverrideUserHash,
        errorId: thrownError.errorId,
        errorCode: thrownError.errorCode,
      },
    });

    // 10) UNAVAILABLE は想定内扱いとして Sentry へは送らない
    expect(sentryCaptured).toHaveLength(0);
  });

  it("例外: errorCode を持たない例外は INTERNAL_ERROR に寄せ、Sentry に送る", async () => {
    // 1) 所要時間を固定する
    setDeterministicLatencyMs({ startMs: 9000, endMs: 9100 });

    // 2) Route Handler の入力を用意する
    const request = createRouteRequest();
    const expectedUserHash = "userHash_5";

    // 3) runRouteHandlerWithRequestSummary のオプションを用意する
    const options = {
      routePattern: "/api/test",
      createUserHash: () => expectedUserHash,
    } as const;

    // 4) 呼び出し元の本来の処理を模擬する（errorCode を持たない例外）
    const handler = vi.fn(async () => {
      throw new Error("boom");
    });

    // 5) 実行
    const response = await runRouteHandlerWithRequestSummary(
      request,
      options,
      handler,
    );

    // 6) INTERNAL_ERROR 相当（500）
    const expectedErrorCode = errorCode.INTERNAL_ERROR;
    expect(response.status).toBe(
      mapErrorCodeToHttpStatusCode(expectedErrorCode),
    );

    // 7) request.summary は 1 本だけ出る
    expect(mockedEmitRequestSummary).toHaveBeenCalledTimes(1);

    // 7-1) Sentry event id が fields に含まれる（文字列であることだけ確認）
    const callArgs = mockedEmitRequestSummary.mock.calls[0]?.[0];
    expect(callArgs?.fields?.sentryEventId).toEqual(expect.any(String));

    // 8) Sentry に 1 回送る
    const expectedInternalErrorStatusCode =
      mapErrorCodeToHttpStatusCode(expectedErrorCode);
    expect(sentryCaptured).toHaveLength(1);
    expect(sentryCaptured[0]).toStrictEqual({
      httpStatusCode: expectedInternalErrorStatusCode,
      errorId: expect.any(String),
      errorCode: expectedErrorCode,
    });
  });
});

// ---------------------------------------------------------------
// Server Action のユニットテスト
// ---------------------------------------------------------------

describe("runServerActionWithRequestSummary", () => {
  const mockedEmitRequestSummary = vi.mocked(emitRequestSummary);

  beforeEach(() => {
    // 1) 各テストのモック状態をリセットする
    vi.restoreAllMocks();
    mockedEmitRequestSummary.mockReset();
    mockedFindNextJsControlFlowError.mockReset();
    mockedGuessHttpStatusCodeFromNextJsControlFlowError.mockReset();
    mockedCreateTelemetryContextFromRequestForRouteHandler.mockReset();
    mockedCreateTelemetryContextFromRequestForServerAction.mockReset();
    mockedRunWithRequestSentryScope.mockReset();
    mockedCaptureExceptionForRequest.mockReset();
    mockedSetSentryUserHash.mockReset();
    sentryCaptured.length = 0;

    // 2) 制御フロー/telemetry の既定モックを戻す
    setDefaultInfraMocks();
  });

  it("成功: action が ok を返すと、そのまま返し、request.summary を 1 本出す", async () => {
    // 1) 所要時間を固定する
    setDeterministicLatencyMs({ startMs: 5000, endMs: 5100 });

    // 2) runServerActionWithRequestSummary のオプションを用意する
    const expectedUserHash = "userHash_sa_1";
    const options = {
      routePattern: "action/test",
      httpMethod: "POST",
      createUserHash: () => expectedUserHash,
    } as const;

    // 3) Server Action の本来の処理を模擬する
    const actionResult = ok({ value: 1 });
    const action = vi.fn(async () => {
      return actionResult;
    });

    // 4) 実行
    const result = await runServerActionWithRequestSummary(options, action);

    // 5) 成功結果はそのまま返る
    expect(result).toBe(actionResult);

    // 6) request.summary は 1 本だけ出る
    expect(mockedEmitRequestSummary).toHaveBeenCalledTimes(1);

    // 7) 成功なので errorCode は載らない
    const callArgs = mockedEmitRequestSummary.mock.calls[0]?.[0];
    expect(callArgs).toMatchObject({
      fields: {
        routePattern: options.routePattern,
        httpMethod: options.httpMethod,
        httpStatusCode: 200,
        userHash: expectedUserHash,
      },
    });
    expect(callArgs?.fields?.errorId).toBeUndefined();
    expect(callArgs?.fields?.errorCode).toBeUndefined();

    // 8) 成功では Sentry へは送らない
    expect(sentryCaptured).toHaveLength(0);
  });

  it("失敗: action が err を返すと、そのまま返し、error を含む request.summary を 1 本出す", async () => {
    // 1) 所要時間を固定する
    setDeterministicLatencyMs({ startMs: 6000, endMs: 6050 });

    // 2) runServerActionWithRequestSummary のオプションを用意する
    const expectedUserHash = "userHash_sa_2";
    const options = {
      routePattern: "action/test",
      httpMethod: "POST",
      createUserHash: () => expectedUserHash,
    } as const;

    // 3) 失敗用の ErrorFields を用意する
    // - errorId は毎回生成されるため値一致ではなく存在確認に寄せる
    const error = buildErrorFields(errorCode.UNAVAILABLE);
    const actionResult = err(error);

    // 4) Server Action の本来の処理を模擬する
    const action = vi.fn(async () => {
      return actionResult;
    });

    // 5) 実行
    const result = await runServerActionWithRequestSummary(options, action);

    // 6) 失敗結果はそのまま返る
    expect(result).toBe(actionResult);

    // 7) request.summary は 1 本だけ出る
    expect(mockedEmitRequestSummary).toHaveBeenCalledTimes(1);

    // 8) 失敗なので status は errorCode に応じた値になる
    const callArgs = mockedEmitRequestSummary.mock.calls[0]?.[0];
    expect(callArgs).toMatchObject({
      fields: {
        routePattern: options.routePattern,
        httpMethod: options.httpMethod,
        httpStatusCode: mapErrorCodeToHttpStatusCode(error.errorCode),
        userHash: expectedUserHash,
        errorCode: error.errorCode,
      },
    });
    expect(callArgs?.fields?.errorId).toBe(error.errorId);

    // 9) err 戻り値（想定内）では Sentry へは送らない
    expect(sentryCaptured).toHaveLength(0);
  });

  it("例外: 制御フロー例外は rethrow しつつ、request.summary は 1 本出す", async () => {
    // 1) 制御フロー扱いを有効にする
    const controlFlowError = new Error("control flow");
    mockedFindNextJsControlFlowError.mockReturnValue(controlFlowError);
    const nextJsHttpStatusCode = 307;
    mockedGuessHttpStatusCodeFromNextJsControlFlowError.mockReturnValue(
      nextJsHttpStatusCode,
    );

    // 2) 所要時間を固定する
    setDeterministicLatencyMs({ startMs: 7000, endMs: 7100 });

    // 3) runServerActionWithRequestSummary のオプションを用意する
    const expectedUserHash = "userHash_sa_3";
    const options = {
      routePattern: "action/test",
      httpMethod: "POST",
      createUserHash: () => expectedUserHash,
    } as const;

    // 4) Server Action の本来の処理を模擬する
    const action = vi.fn(async () => {
      throw new Error("original error");
    });

    // 5) 実行し、制御フロー例外として投げ直されることを確認する
    await expect(
      runServerActionWithRequestSummary(options, action),
    ).rejects.toBe(controlFlowError);

    // 6) request.summary は 1 本だけ出る
    expect(mockedEmitRequestSummary).toHaveBeenCalledTimes(1);

    // 7) 制御フローはアプリ失敗ではないため errorCode は載せない
    const callArgs = mockedEmitRequestSummary.mock.calls[0]?.[0];
    expect(callArgs).toMatchObject({
      fields: {
        routePattern: options.routePattern,
        httpMethod: options.httpMethod,
        httpStatusCode: nextJsHttpStatusCode,
        userHash: expectedUserHash,
      },
    });
    expect(callArgs?.fields?.errorId).toBeUndefined();
    expect(callArgs?.fields?.errorCode).toBeUndefined();

    // 8) 制御フローは Sentry へ送らない
    expect(sentryCaptured).toHaveLength(0);
  });

  it("例外: 通常例外は runServerActionWithRequestSummary が err に寄せて返し、request.summary を 1 本出す", async () => {
    // 1) 所要時間を固定する
    setDeterministicLatencyMs({ startMs: 8000, endMs: 8123 });

    // 2) runServerActionWithRequestSummary のオプションを用意する
    const expectedUserHash = "userHash_sa_4";
    const options = {
      routePattern: "action/test",
      httpMethod: "POST",
      createUserHash: () => expectedUserHash,
    } as const;

    // 3) Server Action の本来の処理を模擬する
    // - errorId/errorCode を例外に載せる設計のとき、runServerActionWithRequestSummary が拾って err に寄せる契約
    const thrownError = {
      errorId: "e_sa_1",
      errorCode: errorCode.UNAVAILABLE,
    };
    const action = vi.fn(async () => {
      throw thrownError;
    });

    // 4) 実行
    const result = await runServerActionWithRequestSummary(options, action);

    // 5) 例外でも throw ではなく Result で返す
    // - 呼び出し側が UI イベント起点で扱いやすい
    expect(result).toStrictEqual(err(thrownError));

    // 6) request.summary は 1 本だけ出る
    expect(mockedEmitRequestSummary).toHaveBeenCalledTimes(1);

    // 7) errorCode に応じた status が入る
    const callArgs = mockedEmitRequestSummary.mock.calls[0]?.[0];
    expect(callArgs).toMatchObject({
      fields: {
        routePattern: options.routePattern,
        httpMethod: options.httpMethod,
        httpStatusCode: mapErrorCodeToHttpStatusCode(thrownError.errorCode),
        userHash: expectedUserHash,
        errorId: thrownError.errorId,
        errorCode: thrownError.errorCode,
      },
    });

    // 8) UNAVAILABLE は想定内扱いとして Sentry へは送らない
    expect(sentryCaptured).toHaveLength(0);
  });

  it("例外: errorCode を持たない例外は INTERNAL_ERROR に寄せ、Sentry に送る", async () => {
    // 1) 所要時間を固定する
    setDeterministicLatencyMs({ startMs: 9000, endMs: 9050 });

    // 2) runServerActionWithRequestSummary のオプションを用意する
    const expectedUserHash = "userHash_sa_5";
    const options = {
      routePattern: "action/test",
      httpMethod: "POST",
      createUserHash: () => expectedUserHash,
    } as const;

    // 3) Server Action の本来の処理を模擬する（errorCode を持たない例外）
    const action = vi.fn(async () => {
      throw new Error("boom");
    });

    // 4) 実行（例外でも Result で返る契約）
    const result = await runServerActionWithRequestSummary(options, action);

    // 5) 例外でも throw ではなく Result で返す
    expectErrCode(result, errorCode.INTERNAL_ERROR);

    // 6) request.summary は 1 本だけ出る
    expect(mockedEmitRequestSummary).toHaveBeenCalledTimes(1);

    // 6-1) Sentry event id が fields に含まれる（文字列であることだけ確認）
    const callArgs = mockedEmitRequestSummary.mock.calls[0]?.[0];
    expect(callArgs?.fields?.sentryEventId).toEqual(expect.any(String));
    expect(callArgs?.fields?.userHash).toBe(expectedUserHash);

    // 7) Sentry に 1 回送る
    const expectedErrorCode = errorCode.INTERNAL_ERROR;
    const expectedInternalErrorStatusCode =
      mapErrorCodeToHttpStatusCode(expectedErrorCode);
    expect(sentryCaptured).toHaveLength(1);
    expect(sentryCaptured[0]).toStrictEqual({
      httpStatusCode: expectedInternalErrorStatusCode,
      errorId: expect.any(String),
      errorCode: expectedErrorCode,
    });
  });
});

// ---------------------------------------------------------------
// Cloud Logging payload のユニットテスト
// ---------------------------------------------------------------

describe("Cloud Logging payload format", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emitCloudLoggingLog は request_id を出力する", async () => {
    const telemetryCommon = await vi.importActual<
      typeof import("@packages/observability/src/logging/telemetry-common")
    >("@packages/observability/src/logging/telemetry-common");
    const mockedConsoleLog = vi
      .spyOn(console, "log")
      .mockImplementation(() => {});

    telemetryCommon.emitCloudLoggingLog(
      {
        env: "dev",
        service: "web",
        release: "r1",
        requestId: "req_1",
      },
      {
        projectId: "p1",
        traceId: "t1",
      },
      {
        severity: telemetryCommon.LOG_SEVERITY.INFO,
        event: telemetryCommon.LOG_EVENT.REQUEST_SUMMARY,
        message: "ok",
      },
    );

    expect(mockedConsoleLog).toHaveBeenCalledTimes(1);
    const payloadRaw = mockedConsoleLog.mock.calls[0]?.[0];
    expect(typeof payloadRaw).toBe("string");
    if (typeof payloadRaw !== "string") {
      throw new Error("Cloud Logging payload must be stringified JSON");
    }
    const payload = JSON.parse(payloadRaw) as Record<string, unknown>;
    expect(payload.request_id).toBe("req_1");
    expect(payload.requestId).toBeUndefined();
  });

  it("emitRequestSummary は snake_case キーで最終payloadを出力する", async () => {
    const requestSummary = await vi.importActual<
      typeof import("@packages/observability/src/logging/request-summary")
    >("@packages/observability/src/logging/request-summary");
    const mockedConsoleLog = vi
      .spyOn(console, "log")
      .mockImplementation(() => {});

    requestSummary.emitRequestSummary({
      core: {
        env: "dev",
        service: "web",
        release: "r1",
        requestId: "req_1",
      },
      trace: {
        projectId: "p1",
        traceId: "t1",
      },
      fields: {
        routePattern: "/api/test",
        httpMethod: "GET",
        httpStatusCode: 500,
        latencyMs: 12.7,
        userHash: "u_1",
        errorId: "e_1",
        errorCode: errorCode.INTERNAL_ERROR,
        sentryEventId: "evt_1",
      },
    });

    expect(mockedConsoleLog).toHaveBeenCalledTimes(1);
    const payloadRaw = mockedConsoleLog.mock.calls[0]?.[0];
    expect(typeof payloadRaw).toBe("string");
    if (typeof payloadRaw !== "string") {
      throw new Error("Cloud Logging payload must be stringified JSON");
    }
    const payload = JSON.parse(payloadRaw) as Record<string, unknown>;
    expect(payload).toMatchObject({
      route_pattern: "/api/test",
      http_method: "GET",
      http_status_code: 500,
      latency_ms: 13,
      user_hash: "u_1",
      error_id: "e_1",
      error_code: errorCode.INTERNAL_ERROR,
      sentry_event_id: "evt_1",
      request_id: "req_1",
      "logging.googleapis.com/trace": "projects/p1/traces/t1",
    });
    expect(payload.routePattern).toBeUndefined();
    expect(payload.httpMethod).toBeUndefined();
    expect(payload.httpStatusCode).toBeUndefined();
    expect(payload.latencyMs).toBeUndefined();
    expect(payload.userHash).toBeUndefined();
    expect(payload.errorId).toBeUndefined();
    expect(payload.errorCode).toBeUndefined();
    expect(payload.sentryEventId).toBeUndefined();
  });
});
