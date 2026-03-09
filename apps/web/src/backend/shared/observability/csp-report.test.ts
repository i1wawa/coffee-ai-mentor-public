// apps/web/src/backend/shared/observability/csp-report.test.ts
// ================================================================
// 概要:
// - csp.report ログ出力ユーティリティのユニットテスト
//
// 契約:
// - Cloud Logging 共通フィールドを含むJSONを1本出力する
// - csp.report のイベントフィールドを snake_case で出力する
// - disposition に応じたデフォルト分類を適用する
// ================================================================

import {
  defaultClassifyCspReport,
  emitCspReport,
} from "@packages/observability/src/logging/csp-report";
import { LOG_SEVERITY } from "@packages/observability/src/logging/telemetry-common";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("csp.report logging", () => {
  afterEach(() => {
    // 1) テスト間で spy の状態が残らないように毎回復元する
    vi.restoreAllMocks();
  });

  it("defaultClassifyCspReport は report のとき NOTICE を返す", () => {
    // 1) report（観測のみ）モードを入力する
    // 2) NOTICE へ分類されることを確認する
    expect(
      defaultClassifyCspReport({
        format: "report-uri",
        disposition: "report",
      }),
    ).toEqual({ severity: LOG_SEVERITY.NOTICE });
  });

  it("emitCspReport は csp.report を構造化JSONで出力する", () => {
    // 1) 出力先（console.log）を監視し、実際の標準出力は抑止する
    const mockedConsoleLog = vi
      .spyOn(console, "log")
      .mockImplementation(() => {});

    // 2) csp.report を1件出力する
    emitCspReport({
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
        format: "report-to",
        effectiveDirective: "script-src-elem",
        documentUri: "https://example.test/app",
        blockedUri: "inline",
        disposition: "enforce",
        httpStatusCode: 200,
      },
    });

    // 3) 1回だけ出力されることを確認する
    expect(mockedConsoleLog).toHaveBeenCalledTimes(1);

    // 4) 出力文字列を取り出し、JSON化できることを確認する
    const payloadRaw = mockedConsoleLog.mock.calls[0]?.[0];
    expect(typeof payloadRaw).toBe("string");
    if (typeof payloadRaw !== "string") {
      throw new Error("Cloud Logging payload must be stringified JSON");
    }

    // 5) 主要フィールド（共通 + csp.report 固有）が入っていることを確認する
    const payload = JSON.parse(payloadRaw) as Record<string, unknown>;
    expect(payload).toMatchObject({
      severity: LOG_SEVERITY.WARNING,
      event: "csp.report",
      format: "report-to",
      effective_directive: "script-src-elem",
      document_uri: "https://example.test/app",
      blocked_uri: "inline",
      disposition: "enforce",
      http_status_code: 200,
      env: "dev",
      service: "web",
      release: "r1",
      request_id: "req_1",
      "logging.googleapis.com/trace": "projects/p1/traces/t1",
    });

    // 6) camelCase キーが混ざらず、snake_case に正規化されていることを確認する
    expect(payload.effectiveDirective).toBeUndefined();
    expect(payload.documentUri).toBeUndefined();
    expect(payload.blockedUri).toBeUndefined();
    expect(payload.httpStatusCode).toBeUndefined();

    // 7) message が人間可読の文字列として出力されることを確認する
    expect(typeof payload.message).toBe("string");
  });

  it("emitCspReport は分類 override を優先する", () => {
    // 1) 出力先（console.log）を監視し、実際の標準出力は抑止する
    const mockedConsoleLog = vi
      .spyOn(console, "log")
      .mockImplementation(() => {});

    // 2) デフォルト分類ではなく、明示 override（ERROR）を渡して出力する
    emitCspReport({
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
        format: "report-uri",
        disposition: "enforce",
      },
      classification: {
        severity: LOG_SEVERITY.ERROR,
      },
    });

    // 3) 出力JSONの severity が override 値を優先することを確認する
    const payloadRaw = mockedConsoleLog.mock.calls[0]?.[0];
    if (typeof payloadRaw !== "string") {
      throw new Error("Cloud Logging payload must be stringified JSON");
    }
    const payload = JSON.parse(payloadRaw) as Record<string, unknown>;
    expect(payload.severity).toBe(LOG_SEVERITY.ERROR);
  });
});
