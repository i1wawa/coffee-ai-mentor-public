// apps/web/src/backend/shared/observability/sentry.server.test.ts
// ================================================================
// 概要:
// - sentry.server.ts のユニットテスト
//
// 契約:
// - request scope に service/route/httpMethod/userHash/requestId/trace を設定する
// - errorCode が INTERNAL_ERROR または不明のときだけ capture する
// - capture 時は httpStatusCode/errorCode/errorId を Sentry に渡す
// ================================================================

import { normalizeUnknownToError } from "@packages/observability/src/logging/request-summary";
import { buildCloudLoggingTraceValue } from "@packages/observability/src/logging/telemetry-common";
import { errorCode } from "@packages/observability/src/logging/telemetry-error-common";
import { captureException, setUser, withScope } from "@sentry/nextjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureExceptionForRequest,
  runWithRequestSentryScope,
} from "./sentry.server";

const sentryScopeMocks = {
  setTag: vi.fn(),
  setUser: vi.fn(),
  setContext: vi.fn(),
};

vi.mock("@sentry/nextjs", () => {
  return {
    withScope: vi.fn(),
    setUser: vi.fn(),
    captureException: vi.fn(),
  };
});

vi.mock("@packages/observability/src/logging/telemetry-common", async () => {
  const actual = await vi.importActual<
    typeof import("@packages/observability/src/logging/telemetry-common")
  >("@packages/observability/src/logging/telemetry-common");

  return {
    ...actual,
    buildCloudLoggingTraceValue: vi.fn(),
  };
});

vi.mock("@packages/observability/src/logging/request-summary", async () => {
  const actual = await vi.importActual<
    typeof import("@packages/observability/src/logging/request-summary")
  >("@packages/observability/src/logging/request-summary");

  return {
    ...actual,
    normalizeUnknownToError: vi.fn(),
  };
});

describe("runWithRequestSentryScope", () => {
  const mockedWithScope = vi.mocked(withScope);
  const mockedSetUser = vi.mocked(setUser);
  const mockedCaptureException = vi.mocked(captureException);
  const mockedBuildCloudLoggingTraceValue = vi.mocked(
    buildCloudLoggingTraceValue,
  );
  const mockedNormalizeUnknownToError = vi.mocked(normalizeUnknownToError);

  beforeEach(() => {
    mockedWithScope.mockReset();
    mockedSetUser.mockReset();
    mockedCaptureException.mockReset();
    sentryScopeMocks.setTag.mockReset();
    sentryScopeMocks.setUser.mockReset();
    sentryScopeMocks.setContext.mockReset();
    mockedBuildCloudLoggingTraceValue.mockReset();
    mockedNormalizeUnknownToError.mockReset();

    mockedBuildCloudLoggingTraceValue.mockReturnValue("projects/p1/traces/t1");

    mockedWithScope.mockImplementation(((
      scopeOrCallback: unknown,
      maybeCallback?: unknown,
    ) => {
      const callback =
        typeof scopeOrCallback === "function" ? scopeOrCallback : maybeCallback;
      if (typeof callback !== "function") {
        throw new Error("test setup error: withScope callback is missing");
      }
      return callback(sentryScopeMocks);
    }) as typeof withScope);
  });

  it("scope に request 文脈を設定し、結果をそのまま返す", async () => {
    const expectedCloudLoggingTrace = "projects/p1/traces/t1";
    mockedBuildCloudLoggingTraceValue.mockReturnValueOnce(
      expectedCloudLoggingTrace,
    );

    const context = {
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
      routePattern: "/api/test",
      httpMethod: "GET",
      userHash: "userHash_1",
    } as const;
    const handlerReturn = "ok";
    const handler = vi.fn(async () => {
      return handlerReturn;
    });

    const result = await runWithRequestSentryScope(context, handler);

    expect(result).toBe(handlerReturn);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(mockedWithScope).toHaveBeenCalledTimes(1);
    expect(sentryScopeMocks.setTag.mock.calls).toEqual(
      expect.arrayContaining([
        ["service", context.core.service],
        ["route_pattern", context.routePattern],
        ["http_method", context.httpMethod],
      ]),
    );
    expect(sentryScopeMocks.setUser).toHaveBeenCalledTimes(1);
    expect(sentryScopeMocks.setUser.mock.calls[0]?.[0]).toMatchObject({
      id: context.userHash,
    });
    expect(mockedBuildCloudLoggingTraceValue).toHaveBeenCalledWith(
      context.trace,
    );
    expect(sentryScopeMocks.setContext.mock.calls).toEqual(
      expect.arrayContaining([
        ["app_request", { request_id: context.core.requestId }],
        ["gcp", { cloud_logging_trace: expectedCloudLoggingTrace }],
      ]),
    );
  });
});

describe("captureExceptionForRequest", () => {
  const event_id = "evt_1";
  const mockedWithScope = vi.mocked(withScope);
  const mockedSetUser = vi.mocked(setUser);
  const mockedCaptureException = vi.mocked(captureException);
  const mockedBuildCloudLoggingTraceValue = vi.mocked(
    buildCloudLoggingTraceValue,
  );
  const mockedNormalizeUnknownToError = vi.mocked(normalizeUnknownToError);

  beforeEach(() => {
    mockedWithScope.mockReset();
    mockedSetUser.mockReset();
    mockedCaptureException.mockReset();
    sentryScopeMocks.setTag.mockReset();
    sentryScopeMocks.setUser.mockReset();
    sentryScopeMocks.setContext.mockReset();
    mockedBuildCloudLoggingTraceValue.mockReset();
    mockedNormalizeUnknownToError.mockReset();

    mockedNormalizeUnknownToError.mockImplementation((error) => {
      if (error instanceof Error) return error;
      return new Error(String(error));
    });
    mockedCaptureException.mockReturnValue(event_id);
  });

  it("想定内 errorCode なら capture しない", () => {
    const result = captureExceptionForRequest({
      error: new Error("expected"),
      httpStatusCode: 401,
      errorCode: errorCode.AUTH_REQUIRED,
      errorId: "e_auth_1",
    });

    expect(result).toBeUndefined();
    expect(mockedNormalizeUnknownToError).toHaveBeenCalledTimes(0);
    expect(mockedCaptureException).toHaveBeenCalledTimes(0);
  });

  it("errorCode が undefined なら capture し、 event_id を返す", () => {
    const normalizedError = new Error("normalized");
    mockedNormalizeUnknownToError.mockReturnValueOnce(normalizedError);

    const expectedHTTPStatusCode = 500;
    const result = captureExceptionForRequest({
      error: "boom",
      httpStatusCode: expectedHTTPStatusCode,
    });

    expect(result).toBe(event_id);
    expect(mockedNormalizeUnknownToError).toHaveBeenCalledWith("boom");
    expect(mockedCaptureException).toHaveBeenCalledWith(normalizedError, {
      tags: {
        http_status_code: String(expectedHTTPStatusCode),
      },
      contexts: {},
    });
  });

  it("INTERNAL_ERROR は errorId/errorCode を反映して capture する", () => {
    type ErrorWithMeta = Error & { errorId?: string; errorCode?: string };
    const normalizedError: ErrorWithMeta = new Error("normalized");
    mockedNormalizeUnknownToError.mockReturnValueOnce(normalizedError);

    const args = {
      error: { name: "unknown" },
      httpStatusCode: 503,
      errorId: "e_internal_1",
      errorCode: errorCode.INTERNAL_ERROR,
    };
    const result = captureExceptionForRequest(args);

    expect(result).toBe(event_id);
    expect(normalizedError.errorId).toBe(args.errorId);
    expect(normalizedError.errorCode).toBe(args.errorCode);
    expect(mockedCaptureException).toHaveBeenCalledWith(normalizedError, {
      tags: {
        http_status_code: String(args.httpStatusCode),
        error_code: args.errorCode,
      },
      contexts: {
        app_error: {
          error_id: args.errorId,
        },
      },
    });
  });
});
