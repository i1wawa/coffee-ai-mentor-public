// apps/web/src/frontend/shared/api/http-client.test.ts
// ================================================================
// 概要:
// - フロント共通 HTTP Client の契約テスト
//
// 契約:
// - リクエスト組み立ての最小要件を検証する
// - API レスポンスを Result に変換する
// - URL ガードと通信失敗時のエラー分類を検証する
// ================================================================

import {
  type ErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  expectErrCode,
  expectOkValue,
} from "@/tests/vitest-utils/utils/result-assertions";
import { deleteJson, getJson, postJson } from "./http-client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function getSingleFetchCall(fetchMock: ReturnType<typeof vi.fn>): {
  url: RequestInfo | URL;
  init: RequestInit;
} {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const firstCall = fetchMock.mock.calls[0];
  if (!firstCall) throw new Error("fetch call is required.");
  const [url, init] = firstCall;
  return { url, init: init as RequestInit };
}

describe("frontend/shared/api http-client の契約", () => {
  const fetchMock =
    vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("getJson", () => {
    it("失敗: 相対パス以外のURLは拒否し fetch を呼ばない", async () => {
      const result = await getJson<{ ok: true }>({
        url: "https://evil.com/api",
      });

      expect(fetchMock).toHaveBeenCalledTimes(0);
      expectErrCode(result, errorCode.INTERNAL_ERROR);
    });

    it("成功: URL前後空白は trim して fetch する", async () => {
      const responseData = { uid: "u1" };

      fetchMock.mockResolvedValue(
        jsonResponse({ ok: true, data: responseData }, 200),
      );

      const result = await getJson<{ uid: string }>({
        url: "   /api/users/me   ",
      });

      expectOkValue(result, responseData);
      const { url } = getSingleFetchCall(fetchMock);
      expect(url).toBe("/api/users/me");
    });

    it("失敗: 2xx でも契約外ボディは INTERNAL_ERROR", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ ok: true, wrong: 1 }, 200));

      const result = await getJson<{ uid: string }>({ url: "/api/users/me" });

      expectErrCode(result, errorCode.INTERNAL_ERROR);
    });

    it("失敗: 非2xxで契約どおりの error はそのまま返す", async () => {
      const errorId = "e_test_001";

      const responseError: ErrorFields = {
        errorId,
        errorCode: errorCode.AUTH_REQUIRED,
      };
      fetchMock.mockResolvedValue(
        jsonResponse({ ok: false, error: responseError }, 401),
      );

      const result = await getJson<{ uid: string }>({ url: "/api/users/me" });

      expectErrCode(result, errorCode.AUTH_REQUIRED, { errorId });
    });

    it("失敗: 非2xxで契約外ボディは status から分類する", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ not_ok: true }, 403));

      const result = await getJson<{ uid: string }>({ url: "/api/users/me" });

      expectErrCode(result, errorCode.ACCESS_DENIED);
    });

    it("失敗: fetch 例外は UNAVAILABLE", async () => {
      fetchMock.mockRejectedValue(new Error("network down"));

      const result = await getJson<{ uid: string }>({ url: "/api/users/me" });

      expectErrCode(result, errorCode.UNAVAILABLE);
    });

    it("失敗: 2xx + non-json は INTERNAL_ERROR", async () => {
      fetchMock.mockResolvedValue(
        new Response("not-json", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
      );

      const result = await getJson<{ uid: string }>({ url: "/api/users/me" });

      expectErrCode(result, errorCode.INTERNAL_ERROR);
    });

    it("失敗: 非2xx + non-json は status から分類する", async () => {
      fetchMock.mockResolvedValue(
        new Response("not-json", {
          status: 403,
          headers: { "content-type": "text/plain" },
        }),
      );

      const result = await getJson<{ uid: string }>({ url: "/api/users/me" });

      expectErrCode(result, errorCode.ACCESS_DENIED);
    });

    it("成功: GET は共通設定を付け、body を送らない", async () => {
      const responseData = { uid: "u1" };

      fetchMock.mockResolvedValue(
        jsonResponse({ ok: true, data: responseData }, 200),
      );

      const result = await getJson<{ uid: string }>({ url: "/api/users/me" });

      expectOkValue(result, responseData);
      const { init } = getSingleFetchCall(fetchMock);
      const headers = new Headers(init.headers);

      expect(init.method).toBe("GET");
      expect(init.credentials).toBe("include");
      expect(init.mode).toBe("same-origin");
      expect(init.cache).toBe("no-store");
      expect((headers.get("accept") ?? "").toLowerCase()).toContain(
        "application/json",
      );
      expect(headers.get("content-type") ?? "").toBe("");
      expect(init.body).toBeUndefined();
    });
  });

  describe("postJson", () => {
    it("成功: POST は JSON body と content-type を送る", async () => {
      const idToken = "t1";
      const responseData = { issued: true };

      fetchMock.mockResolvedValue(
        jsonResponse({ ok: true, data: responseData }, 200),
      );

      const result = await postJson<{ issued: boolean }>({
        url: "/api/auth/session",
        body: { idToken },
      });

      expectOkValue(result, responseData);
      const { init } = getSingleFetchCall(fetchMock);
      const headers = new Headers(init.headers);

      expect(init.method).toBe("POST");
      expect(init.credentials).toBe("include");
      expect(init.mode).toBe("same-origin");
      expect(init.cache).toBe("no-store");
      expect((headers.get("content-type") ?? "").toLowerCase()).toContain(
        "application/json",
      );
      expect(typeof init.body).toBe("string");
      if (typeof init.body === "string") {
        expect(JSON.parse(init.body)).toEqual({ idToken });
      }
    });

    it("失敗: body の JSON 変換に失敗した場合は INTERNAL_ERROR を返し fetch を呼ばない", async () => {
      const circularBody: { self?: unknown } = {};
      circularBody.self = circularBody;

      const result = await postJson<{ issued: boolean }>({
        url: "/api/auth/session",
        body: circularBody,
      });

      expectErrCode(result, errorCode.INTERNAL_ERROR);
      expect(fetchMock).toHaveBeenCalledTimes(0);
    });
  });

  describe("deleteJson", () => {
    it("成功: DELETE body なしは content-type を送らない", async () => {
      const responseData = { cleared: true };

      fetchMock.mockResolvedValue(
        jsonResponse({ ok: true, data: responseData }, 200),
      );

      const result = await deleteJson<{ cleared: boolean }>({
        url: "/api/auth/session",
      });

      expectOkValue(result, responseData);
      const { init } = getSingleFetchCall(fetchMock);
      const headers = new Headers(init.headers);

      expect(init.method).toBe("DELETE");
      expect(init.credentials).toBe("include");
      expect(init.mode).toBe("same-origin");
      expect(init.cache).toBe("no-store");
      expect(init.body).toBeUndefined();
      expect(headers.get("content-type") ?? "").toBe("");
    });

    it("成功: DELETE body ありは JSON body と content-type を送る", async () => {
      const reason = "user_request";
      const responseData = { cleared: true };

      fetchMock.mockResolvedValue(
        jsonResponse({ ok: true, data: responseData }, 200),
      );

      const result = await deleteJson<{ cleared: boolean }>({
        url: "/api/auth/session",
        body: { reason },
      });

      expectOkValue(result, responseData);
      const { init } = getSingleFetchCall(fetchMock);
      const headers = new Headers(init.headers);

      expect(init.method).toBe("DELETE");
      expect((headers.get("content-type") ?? "").toLowerCase()).toContain(
        "application/json",
      );
      expect(typeof init.body).toBe("string");
      if (typeof init.body === "string") {
        expect(JSON.parse(init.body)).toEqual({ reason });
      }
    });

    it("失敗: body の JSON 変換に失敗した場合は INTERNAL_ERROR を返し fetch を呼ばない", async () => {
      const circularBody: { self?: unknown } = {};
      circularBody.self = circularBody;

      const result = await deleteJson<{ cleared: boolean }>({
        url: "/api/auth/session",
        body: circularBody,
      });

      expectErrCode(result, errorCode.INTERNAL_ERROR);
      expect(fetchMock).toHaveBeenCalledTimes(0);
    });
  });
});
