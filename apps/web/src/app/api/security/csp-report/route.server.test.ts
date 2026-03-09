// apps/web/src/app/api/security/csp-report/route.server.test.ts
// ========================================================
// 概要:
// - POST /api/security/csp-report の Route Handler ユニットテスト
//
// 契約:
// - report-uri 形式（application/csp-report）を受理できること
// - report-to 形式（application/reports+json）を受理できること
// - 不正JSON（境界値）でも 204（No Content） で安全に終わること
// ========================================================

/* @vitest-environment node */

import {
  CSP_REPORT_CONTENT_TYPES,
  SECURITY_PATHS,
} from "@contracts/src/security/security-contract";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_JSON_BODY_BYTES } from "@/backend/shared/http/request.guard.server";
import { emitCspReportSafely } from "@/backend/shared/observability/csp-report";
import { POST } from "./route";

const telemetryContext = {
  core: {
    env: "dev",
    service: "coffee-ai-mentor-web",
    release: "r1",
    requestId: "req_1",
  },
  trace: {
    projectId: "p1",
    traceId: "t1",
  },
} as const;

vi.mock("@/backend/shared/observability/csp-report", () => ({
  createCspReportTelemetryContextFromRequest: vi.fn(() => telemetryContext),
  emitCspReportSafely: vi.fn(),
}));

function createCspReportUrl(origin: string): string {
  return `${origin}${SECURITY_PATHS.cspReport}`;
}

describe("POST /api/security/csp-report", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("未対応 Content-Type は本文を読まず 204 を返し、ログ送信しない", async () => {
    // 1) 未対応 content-type で、見た目は有効な payload を作る
    const request = new NextRequest(
      createCspReportUrl("https://example.test"),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          "csp-report": {
            "document-uri": "https://example.test/app",
            "violated-directive": "script-src-elem",
            "blocked-uri": "inline",
          },
        }),
      },
    );

    // 2) Route Handler を実行する
    const response = await POST(request);

    // 3) 204 + no-store を返し、ログ送信されないことを確認する
    expect(response.status).toBe(204);
    expect(
      (response.headers.get("cache-control") ?? "").toLowerCase(),
    ).toContain("no-store");
    expect(vi.mocked(emitCspReportSafely)).not.toHaveBeenCalled();
  });

  it("対応 Content-Type であれば、 charset 付きでも受理して 204 を返し、ログ送信する", async () => {
    // 1) charset 付き content-type で report-uri 形式の payload を作る
    const request = new NextRequest(
      createCspReportUrl("https://example.test"),
      {
        method: "POST",
        headers: {
          "content-type": `${CSP_REPORT_CONTENT_TYPES.legacy}; charset=utf-8`,
        },
        body: JSON.stringify({
          "csp-report": {
            "document-uri": "https://example.test/app",
            "violated-directive": "script-src-elem",
            "blocked-uri": "inline",
          },
        }),
      },
    );

    // 2) Route Handler を実行する
    const response = await POST(request);

    // 3) 204 + no-store を確認し、ログ送信されることを確認する
    expect(response.status).toBe(204);
    expect(
      (response.headers.get("cache-control") ?? "").toLowerCase(),
    ).toContain("no-store");
    expect(vi.mocked(emitCspReportSafely)).toHaveBeenCalledTimes(1);
  });

  it("境界値: 不正JSONでも 204 を返す", async () => {
    // 1) 不正JSONの body を作る
    const request = new NextRequest(
      createCspReportUrl("https://example.test"),
      {
        method: "POST",
        headers: {
          "content-type": CSP_REPORT_CONTENT_TYPES.legacy,
        },
        body: "{",
      },
    );

    // 2) Route Handler を実行する
    const response = await POST(request);

    // 3) 例外を外へ漏らさず 204 + no-store を返す
    expect(response.status).toBe(204);
    expect(
      (response.headers.get("cache-control") ?? "").toLowerCase(),
    ).toContain("no-store");
    expect(vi.mocked(emitCspReportSafely)).not.toHaveBeenCalled();
  });

  it("境界値: Content-Length が上限超過でも 204 を返し、ログ送信しない", async () => {
    // 1) 上限超過の Content-Length を付けた request を作る
    const request = new NextRequest(
      createCspReportUrl("https://example.test"),
      {
        method: "POST",
        headers: {
          "content-type": CSP_REPORT_CONTENT_TYPES.legacy,
          "content-length": String(MAX_JSON_BODY_BYTES + 1),
        },
        body: JSON.stringify({
          "csp-report": {
            "document-uri": "https://example.test/app",
            "violated-directive": "script-src-elem",
            "blocked-uri": "inline",
          },
        }),
      },
    );

    // 2) Route Handler を実行する
    const response = await POST(request);

    // 3) 早期に 204 + no-store を返し、ログ送信はしない
    expect(response.status).toBe(204);
    expect(
      (response.headers.get("cache-control") ?? "").toLowerCase(),
    ).toContain("no-store");
    expect(vi.mocked(emitCspReportSafely)).not.toHaveBeenCalled();
  });

  it("report-uri 形式（application/csp-report）を受理して 204 を返し、ログ送信する", async () => {
    // 1) report-uri 形式の payload を作る
    const request = new NextRequest(
      createCspReportUrl("https://example.test"),
      {
        method: "POST",
        headers: {
          "content-type": CSP_REPORT_CONTENT_TYPES.legacy,
        },
        body: JSON.stringify({
          "csp-report": {
            "document-uri": "https://example.test/app",
            "violated-directive": "script-src-elem",
            "blocked-uri": "inline",
          },
        }),
      },
    );

    // 2) Route Handler を実行する
    const response = await POST(request);

    // 3) 204 + no-store を確認する
    expect(response.status).toBe(204);
    expect(
      (response.headers.get("cache-control") ?? "").toLowerCase(),
    ).toContain("no-store");
    expect(vi.mocked(emitCspReportSafely)).toHaveBeenCalledTimes(1);
  });

  it("report-uri 形式で受理した payload は 204 を返し、1件ログ送信する", async () => {
    // 2) report-uri 形式の payload を作る
    const request = new NextRequest(
      createCspReportUrl("https://example.test"),
      {
        method: "POST",
        headers: {
          "content-type": CSP_REPORT_CONTENT_TYPES.legacy,
        },
        body: JSON.stringify({
          "csp-report": {
            "document-uri": "https://example.test/app",
            "effective-directive": "script-src-elem",
            "violated-directive": "script-src",
            "blocked-uri": "inline",
            disposition: "enforce",
            "status-code": 200,
          },
          // 形式外キーが混在しても legacy parser は csp-report を正規化する
          type: "csp-violation",
        }),
      },
    );

    // 3) Route Handler を実行する
    const response = await POST(request);

    // 4) 204 + no-store を確認する
    expect(response.status).toBe(204);
    expect(
      (response.headers.get("cache-control") ?? "").toLowerCase(),
    ).toContain("no-store");

    expect(vi.mocked(emitCspReportSafely)).toHaveBeenCalledTimes(1);
  });

  it("content-type が report-uri 形式のとき、modern payload は 204 を返し、ログ送信しない", async () => {
    // 1) legacy content-type で modern payload を作る
    const request = new NextRequest(
      createCspReportUrl("https://example.test"),
      {
        method: "POST",
        headers: {
          "content-type": CSP_REPORT_CONTENT_TYPES.legacy,
        },
        body: JSON.stringify([
          {
            type: "csp-violation",
            url: "https://example.test/app",
            body: {
              "effective-directive": "style-src-elem",
              "blocked-uri": "inline",
            },
          },
        ]),
      },
    );

    // 2) Route Handler を実行する
    const response = await POST(request);

    // 3) 204 + no-store を返し、parser 不一致なのでログ送信しない
    expect(response.status).toBe(204);
    expect(
      (response.headers.get("cache-control") ?? "").toLowerCase(),
    ).toContain("no-store");
    expect(vi.mocked(emitCspReportSafely)).not.toHaveBeenCalled();
  });

  it("content-type が report-to 形式のとき、legacy payload は 204 を返し、ログ送信しない", async () => {
    // 1) modern content-type で legacy payload を作る
    const request = new NextRequest(
      createCspReportUrl("https://example.test"),
      {
        method: "POST",
        headers: {
          "content-type": CSP_REPORT_CONTENT_TYPES.modern,
        },
        body: JSON.stringify({
          "csp-report": {
            "document-uri": "https://example.test/app",
            "violated-directive": "script-src-elem",
            "blocked-uri": "inline",
          },
        }),
      },
    );

    // 2) Route Handler を実行する
    const response = await POST(request);

    // 3) 204 + no-store を返し、parser 不一致なのでログ送信しない
    expect(response.status).toBe(204);
    expect(
      (response.headers.get("cache-control") ?? "").toLowerCase(),
    ).toContain("no-store");
    expect(vi.mocked(emitCspReportSafely)).not.toHaveBeenCalled();
  });

  it("report-to 形式（application/reports+json）を受理して 204 を返す", async () => {
    // 1) report-to 形式の payload を作る
    const request = new NextRequest(
      createCspReportUrl("https://example.test"),
      {
        method: "POST",
        headers: {
          "content-type": CSP_REPORT_CONTENT_TYPES.modern,
        },
        body: JSON.stringify([
          {
            type: "csp-violation",
            url: "https://example.test/app",
            body: {
              "effective-directive": "style-src-elem",
              "blocked-uri": "inline",
            },
          },
        ]),
      },
    );

    // 2) Route Handler を実行する
    const response = await POST(request);

    // 3) 204 + no-store を確認する
    expect(response.status).toBe(204);
    expect(
      (response.headers.get("cache-control") ?? "").toLowerCase(),
    ).toContain("no-store");
    expect(vi.mocked(emitCspReportSafely)).toHaveBeenCalledTimes(1);
  });

  it("report-to 形式は 204 を返し、レポート件数分だけログ送信する", async () => {
    // 2) report-to 形式の payload を作る（csp-violation を2件）
    const request = new NextRequest(
      createCspReportUrl("https://example.test"),
      {
        method: "POST",
        headers: {
          "content-type": CSP_REPORT_CONTENT_TYPES.modern,
        },
        body: JSON.stringify([
          {
            type: "csp-violation",
            url: "https://example.test/app",
            body: {
              effectiveDirective: "style-src-elem",
              blockedURL: "inline",
              disposition: "report",
              statusCode: 200,
            },
          },
          {
            type: "csp-violation",
            url: "https://example.test/app/settings",
            body: {
              effectiveDirective: "script-src-elem",
              blockedURL: "https://cdn.example.test/a.js",
              disposition: "enforce",
              statusCode: 200,
            },
          },
        ]),
      },
    );

    // 3) Route Handler を実行する
    const response = await POST(request);

    // 4) 204 + no-store を確認する
    expect(response.status).toBe(204);
    expect(
      (response.headers.get("cache-control") ?? "").toLowerCase(),
    ).toContain("no-store");

    expect(vi.mocked(emitCspReportSafely)).toHaveBeenCalledTimes(2);
  });
});
