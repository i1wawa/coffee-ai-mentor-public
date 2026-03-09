// apps/web/src/proxy.test.ts
// ========================================================
// 概要:
// - proxy（入口ガード + CSP 付与）のユニットテスト
//
// 契約:
// - /app または /app/* へのアクセス時
//   - セッションCookieが未設定（無し/空/空白）なら /sign-in へリダイレクトする
//   - セッションCookieが上限超過なら /sign-in へリダイレクトする
//   - それ以外は通過し、CSP は nonce ベースになる
// - /app 以外のパス（例: /app-foo）は通過する
// - matcher は画面系ルートに一致し、API と prefetch は除外する
// ========================================================

/* @vitest-environment node */

import { SECURITY_PATHS } from "@contracts/src/security/security-contract";
import {
  getRedirectUrl,
  unstable_doesMiddlewareMatch,
} from "next/experimental/testing/server";
import type { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE_NAME } from "@/backend/shared/http/cookies";
import { MAX_SESSION_COOKIE_CHARS } from "@/backend/shared/http/request.guard.server";
import { buildCspReportEndpointUrl, config, proxy } from "./proxy";

const contentSecurityPolicyHeaderName = "Content-Security-Policy";
const reportingEndpointsHeaderName = "Reporting-Endpoints";
const reportToHeaderName = "Report-To";
const cspScriptSrcDirectiveName = "script-src";
const cspConnectSrcDirectiveName = "connect-src";
const cspFrameSrcDirectiveName = "frame-src";
const cspRequireTrustedTypesForDirectiveName = "require-trusted-types-for";
const cspReportUriDirectiveName = "report-uri";
const cspReportToDirectiveName = "report-to";
const cspReportGroupName = "csp-endpoint";
const devReportEndpointAbsoluteUrl =
  "https://127.0.0.1:3000/api/security/csp-report";
const googleAccountsOrigin = "https://accounts.google.com";
const googleApisOrigin = "https://apis.google.com";
const gstaticOrigin = "https://www.gstatic.com";
const identityToolkitOrigin = "https://identitytoolkit.googleapis.com";
const secureTokenOrigin = "https://securetoken.googleapis.com";
const googleApisConnectOrigin = "https://www.googleapis.com";

/**
 * 指定したディレクティブの値を取得するユーティリティ
 */
function getDirectiveValue(
  cspHeaderValue: string,
  directiveName: string,
): string {
  const foundDirective = cspHeaderValue
    .split(";")
    .map((directive) => directive.trim())
    .find((directive) => directive.startsWith(`${directiveName} `));

  return foundDirective ?? "";
}

/**
 * report-uri / report-to / Reporting-Endpoints / Report-To の契約を検証する
 */
function expectCspReportingHeaders(response: NextResponse) {
  const cspHeaderValue =
    response.headers.get(contentSecurityPolicyHeaderName) ?? "";
  const reportUriDirective = getDirectiveValue(
    cspHeaderValue,
    cspReportUriDirectiveName,
  );
  const reportToDirective = getDirectiveValue(
    cspHeaderValue,
    cspReportToDirectiveName,
  );
  const reportingEndpointsHeader =
    response.headers.get(reportingEndpointsHeaderName) ?? "";
  const reportToHeader = response.headers.get(reportToHeaderName) ?? "";

  expect(reportUriDirective).toBe(`report-uri ${SECURITY_PATHS.cspReport}`);
  expect(reportToDirective).toBe(`report-to ${cspReportGroupName}`);
  expect(reportingEndpointsHeader).toContain(`${cspReportGroupName}="https://`);
  expect(reportingEndpointsHeader).toContain(SECURITY_PATHS.cspReport);
  expect(reportToHeader).toContain(`"group":"${cspReportGroupName}"`);
  expect(reportToHeader).toContain(`"url":"https://`);
  expect(reportToHeader).toContain(SECURITY_PATHS.cspReport);
}
/**
 * テスト用の NextRequest を作成するユーティリティ
 */
function createRequest(params: {
  url: string;
  cookieValue?: string;
  extraHeaders?: Record<string, string>;
}): NextRequest {
  const url = new URL(params.url);
  const headers = new Headers();
  headers.set("host", url.host);
  for (const [key, value] of Object.entries(params.extraHeaders ?? {})) {
    headers.set(key, value);
  }
  if (typeof params.cookieValue === "string") {
    headers.set("cookie", `${SESSION_COOKIE_NAME}=${params.cookieValue}`);
  }
  return new NextRequest(url.toString(), {
    method: "GET",
    headers,
  });
}

/**
 * テスト用のリダイレクト検証ユーティリティ
 */
function expectRedirectToSignIn(response: NextResponse): void {
  const redirectUrl = getRedirectUrl(response);
  expect(redirectUrl).toBeTruthy();

  const parsedRedirectUrl = new URL(redirectUrl as string);
  expect(parsedRedirectUrl.pathname).toBe("/sign-in");
  expect(parsedRedirectUrl.search).toBe("");
}

describe("proxy", () => {
  it("未サインイン: /app に cookie 無しでアクセスすると /sign-in へリダイレクトし、CSP ヘッダーを返す", () => {
    // 1) arrange: 入力条件（未サインインの /app リクエスト）を用意する
    const request = createRequest({
      url: "https://127.0.0.1:3000/app",
    });

    // 2) act: テスト対象の proxy を実行する
    const response = proxy(request);

    // 3) assert: /sign-in へ誘導され、CSP ヘッダーも付いていることを確認する
    expectRedirectToSignIn(response);
    expect(response.headers.get(contentSecurityPolicyHeaderName)).toContain(
      "default-src 'self';",
    );
    expectCspReportingHeaders(response);
  });

  it("未サインイン: /app/* に空白 cookie でアクセスすると /sign-in へリダイレクトする", () => {
    // 1) arrange: 空白 cookie（未設定扱い）で /app/* リクエストを用意する
    const request = createRequest({
      url: "https://127.0.0.1:3000/app/home",
      cookieValue: "   ",
    });

    // 2) act: テスト対象の proxy を実行する
    const response = proxy(request);

    // 3) assert: 未設定扱いのため /sign-in へリダイレクトされることを確認する
    expectRedirectToSignIn(response);
  });

  it("安全対策: cookie が上限超過なら /sign-in へリダイレクトする", () => {
    // 1) arrange: 上限超過 cookie を持つ /app リクエストを用意する
    const tooLongCookieValue = "a".repeat(MAX_SESSION_COOKIE_CHARS + 1);
    const request = createRequest({
      url: "https://127.0.0.1:3000/app",
      cookieValue: tooLongCookieValue,
    });

    // 2) act: テスト対象の proxy を実行する
    const response = proxy(request);

    // 3) assert: 安全対策として /sign-in へリダイレクトされることを確認する
    expectRedirectToSignIn(response);
    expect(response.headers.get(contentSecurityPolicyHeaderName)).toContain(
      "default-src 'self';",
    );
    expectCspReportingHeaders(response);
  });

  it("誤検知防止: /app-foo は /app とみなさず通過し、CSP ヘッダーを返す", () => {
    // 1) arrange: /app に似ているが対象外のパスを用意する
    const request = createRequest({
      url: "https://127.0.0.1:3000/app-foo",
    });

    // 2) act: テスト対象の proxy を実行する
    const response = proxy(request);

    // 3) assert: 誤検知せず通過し、CSP は付与されることを確認する
    expect(getRedirectUrl(response)).toBeNull();
    expect(response.headers.get(contentSecurityPolicyHeaderName)).toContain(
      "default-src 'self';",
    );
    expectCspReportingHeaders(response);
  });

  it("reporting: localhost で受けても development は 127.0.0.1 固定の report-to/Reporting-Endpoints を返す", () => {
    // 1) arrange: localhost でアクセスしたリクエストを用意する
    const request = createRequest({
      url: "https://localhost:3000/app",
      cookieValue: "session-token",
    });

    // 2) act: proxy を実行する
    const response = proxy(request);

    // 3) assert: report-uri は相対、report-to/Reporting-Endpoints は 127.0.0.1 固定
    const cspHeaderValue =
      response.headers.get(contentSecurityPolicyHeaderName) ?? "";
    const reportUriDirective = getDirectiveValue(
      cspHeaderValue,
      cspReportUriDirectiveName,
    );
    const reportingEndpointsHeader =
      response.headers.get(reportingEndpointsHeaderName) ?? "";
    const reportToHeader = response.headers.get(reportToHeaderName) ?? "";

    expect(reportUriDirective).toBe(`report-uri ${SECURITY_PATHS.cspReport}`);
    expect(reportingEndpointsHeader).toBe(
      `${cspReportGroupName}="${devReportEndpointAbsoluteUrl}"`,
    );
    expect(reportToHeader).toContain(`"url":"${devReportEndpointAbsoluteUrl}"`);
  });

  it("/app: cookie があれば通過し、popup 用 origin を含まない default CSP ヘッダーを返す", () => {
    // 1) arrange: 正常な session cookie を持つ /app リクエストを用意する
    const request = createRequest({
      url: "https://127.0.0.1:3000/app",
      cookieValue: "session-token",
    });

    // 2) act: テスト対象の proxy を実行する
    const response = proxy(request);

    // 3) assert: 通過することと script-src が nonce ベースであることを確認する
    expect(getRedirectUrl(response)).toBeNull();

    const cspHeaderValue =
      response.headers.get(contentSecurityPolicyHeaderName) ?? "";
    const scriptSrcDirective = getDirectiveValue(
      cspHeaderValue,
      cspScriptSrcDirectiveName,
    );
    const connectSrcDirective = getDirectiveValue(
      cspHeaderValue,
      cspConnectSrcDirectiveName,
    );
    const frameSrcDirective = getDirectiveValue(
      cspHeaderValue,
      cspFrameSrcDirectiveName,
    );
    const requireTrustedTypesForDirective = getDirectiveValue(
      cspHeaderValue,
      cspRequireTrustedTypesForDirectiveName,
    );

    expect(scriptSrcDirective).toContain("'nonce-");
    expect(scriptSrcDirective).not.toContain("'unsafe-inline'");
    expect(scriptSrcDirective).not.toContain(googleAccountsOrigin);
    expect(scriptSrcDirective).not.toContain(googleApisOrigin);
    expect(scriptSrcDirective).not.toContain(gstaticOrigin);
    expect(connectSrcDirective).not.toContain(identityToolkitOrigin);
    expect(connectSrcDirective).not.toContain(secureTokenOrigin);
    expect(connectSrcDirective).not.toContain(googleApisConnectOrigin);
    expect(frameSrcDirective).not.toContain(googleAccountsOrigin);
    expect(requireTrustedTypesForDirective).toBe(
      "require-trusted-types-for 'script'",
    );
    expectCspReportingHeaders(response);
  });

  it("/sign-in: popup 認証ページは Google/Firebase popup 向け CSP を返し、Trusted Types 強制を外す", () => {
    // 1) arrange: サインインページのリクエストを用意する
    const request = createRequest({
      url: "https://127.0.0.1:3000/sign-in",
    });

    // 2) act: proxy を実行する
    const response = proxy(request);

    // 3) assert: popup 認証に必要な許可は残しつつ、TT 強制は外す
    const cspHeaderValue =
      response.headers.get(contentSecurityPolicyHeaderName) ?? "";
    const scriptSrcDirective = getDirectiveValue(
      cspHeaderValue,
      cspScriptSrcDirectiveName,
    );
    const connectSrcDirective = getDirectiveValue(
      cspHeaderValue,
      cspConnectSrcDirectiveName,
    );
    const frameSrcDirective = getDirectiveValue(
      cspHeaderValue,
      cspFrameSrcDirectiveName,
    );
    const requireTrustedTypesForDirective = getDirectiveValue(
      cspHeaderValue,
      cspRequireTrustedTypesForDirectiveName,
    );

    expect(scriptSrcDirective).toContain(googleAccountsOrigin);
    expect(scriptSrcDirective).toContain(googleApisOrigin);
    expect(scriptSrcDirective).toContain(gstaticOrigin);
    expect(connectSrcDirective).toContain(identityToolkitOrigin);
    expect(connectSrcDirective).toContain(secureTokenOrigin);
    expect(connectSrcDirective).toContain(googleApisConnectOrigin);
    expect(frameSrcDirective).toContain(googleAccountsOrigin);
    expect(requireTrustedTypesForDirective).toBe("");
    expect(cspHeaderValue).not.toContain("trusted-types");
    expectCspReportingHeaders(response);
  });

  it("/app/settings/account: 再認証ページは popup 認証向け CSP を返し、Trusted Types 強制を外す", () => {
    // 1) arrange: 認証済みの設定ページリクエストを用意する
    const request = createRequest({
      url: "https://127.0.0.1:3000/app/settings/account",
      cookieValue: "session-token",
    });

    // 2) act: proxy を実行する
    const response = proxy(request);

    // 3) assert: popup 認証向け CSP が返る
    const cspHeaderValue =
      response.headers.get(contentSecurityPolicyHeaderName) ?? "";
    const scriptSrcDirective = getDirectiveValue(
      cspHeaderValue,
      cspScriptSrcDirectiveName,
    );
    const connectSrcDirective = getDirectiveValue(
      cspHeaderValue,
      cspConnectSrcDirectiveName,
    );
    const frameSrcDirective = getDirectiveValue(
      cspHeaderValue,
      cspFrameSrcDirectiveName,
    );
    const requireTrustedTypesForDirective = getDirectiveValue(
      cspHeaderValue,
      cspRequireTrustedTypesForDirectiveName,
    );

    expect(scriptSrcDirective).toContain(googleAccountsOrigin);
    expect(scriptSrcDirective).toContain(googleApisOrigin);
    expect(scriptSrcDirective).toContain(gstaticOrigin);
    expect(connectSrcDirective).toContain(identityToolkitOrigin);
    expect(connectSrcDirective).toContain(secureTokenOrigin);
    expect(connectSrcDirective).toContain(googleApisConnectOrigin);
    expect(frameSrcDirective).toContain(googleAccountsOrigin);
    expect(requireTrustedTypesForDirective).toBe("");
    expect(cspHeaderValue).not.toContain("trusted-types");
    expectCspReportingHeaders(response);
  });

  it("reporting: APP_ORIGIN があればそれを優先して絶対URLを組み立てる", () => {
    const request = createRequest({
      url: "https://0.0.0.0:8080/app",
      cookieValue: "session-token",
      extraHeaders: {
        host: "0.0.0.0:8080",
        "x-forwarded-host": "proxy.example.test",
        "x-forwarded-proto": "https",
      },
    });

    const actual = buildCspReportEndpointUrl(
      request,
      "https://coffee-ai-mentor-web-jvncegdyqq-an.a.run.app",
    );

    expect(actual).toBe(
      "https://coffee-ai-mentor-web-jvncegdyqq-an.a.run.app/api/security/csp-report",
    );
  });

  it("reporting: APP_ORIGIN が無いときは x-forwarded-host/x-forwarded-proto から絶対URLを組み立てる", () => {
    const request = createRequest({
      url: "https://0.0.0.0:8080/app",
      cookieValue: "session-token",
      extraHeaders: {
        host: "0.0.0.0:8080",
        "x-forwarded-host": "coffee-ai-mentor-web-jvncegdyqq-an.a.run.app",
        "x-forwarded-proto": "https",
      },
    });

    const actual = buildCspReportEndpointUrl(request, "");

    expect(actual).toBe(
      "https://coffee-ai-mentor-web-jvncegdyqq-an.a.run.app/api/security/csp-report",
    );
  });

  it("reporting: 公開originを決められないときは report-to 用の絶対URLを組み立てない", () => {
    const request = createRequest({
      url: "https://0.0.0.0:8080/app",
      cookieValue: "session-token",
      extraHeaders: {
        host: "0.0.0.0:8080",
      },
    });

    const actual = buildCspReportEndpointUrl(request, "");

    expect(actual).toBeNull();
  });

  it("reporting: reportEndpointUrl が null のとき proxy は report-to ヘッダーとディレクティブを返さない", async () => {
    vi.resetModules();
    vi.doMock("./env.server", () => ({
      getServerBaseEnv: () => ({
        APP_ENV: "dev",
        APP_ORIGIN: "",
        SERVICE_NAME: "coffee-ai-mentor-web",
        FIREBASE_AUTH_EMULATOR_HOST: "",
        GCP_PROJECT_ID: "demo-coffee-ai-mentor",
        SENTRY_DSN: "https://test-public-key@o0.ingest.us.sentry.io/0",
        SENTRY_ENVIRONMENT: "dev",
        SENTRY_RELEASE: "local-dummy-release",
      }),
    }));

    try {
      const { proxy: proxyWithEmptyAppOrigin } = await import("./proxy");
      const request = createRequest({
        url: "https://0.0.0.0:8080/app",
        cookieValue: "session-token",
        extraHeaders: {
          host: "0.0.0.0:8080",
        },
      });

      const response = proxyWithEmptyAppOrigin(request);
      const cspHeaderValue =
        response.headers.get(contentSecurityPolicyHeaderName) ?? "";
      const reportUriDirective = getDirectiveValue(
        cspHeaderValue,
        cspReportUriDirectiveName,
      );
      const reportToDirective = getDirectiveValue(
        cspHeaderValue,
        cspReportToDirectiveName,
      );

      expect(reportUriDirective).toBe(`report-uri ${SECURITY_PATHS.cspReport}`);
      expect(reportToDirective).toBe("");
      expect(response.headers.get(reportToHeaderName)).toBeNull();
      expect(response.headers.get(reportingEndpointsHeaderName)).toBeNull();
    } finally {
      vi.doUnmock("./env.server");
      vi.resetModules();
    }
  });
});

describe("proxy config (matcher)", () => {
  it("画面系ルートは matcher に一致する", () => {
    expect(
      unstable_doesMiddlewareMatch({
        config,
        url: "https://127.0.0.1:3000/app",
      }),
    ).toBe(true);
  });

  it("API ルートは matcher から除外される", () => {
    expect(
      unstable_doesMiddlewareMatch({
        config,
        url: "https://127.0.0.1:3000/api/users/me",
      }),
    ).toBe(false);
  });

  it("プリフェッチリクエストは matcher から除外される", () => {
    expect(
      unstable_doesMiddlewareMatch({
        config,
        url: "https://127.0.0.1:3000/app",
        headers: {
          "next-router-prefetch": "1",
        },
      }),
    ).toBe(false);
  });
});
