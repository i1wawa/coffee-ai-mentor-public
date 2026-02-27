// apps/web/src/backend/shared/http/request-origin.guard.test.ts
// ================================================================
// 概要:
// - request-origin.guard.ts のユニットテスト
//
// 契約:
// - Sec-Fetch-Site=same-origin は即許可する
// - Sec-Fetch-Site=cross-site は優先して拒否する
// - Sec-Fetch-Site が無い/不確実な場合は Origin/Referer でフォールバック判定する
// - フォールバック時は x-forwarded-host を host より優先する
// - 拒否時は 403 + ACCESS_DENIED の errorFields を返す
//
// 前提:
// - テストは Node の標準 Request を使う
// ================================================================

import { errorCode } from "@packages/observability/src/logging/telemetry-error-common";
import { describe, expect, it } from "vitest";
import { guardUnsafeMethodByFetchMetadataAndOrigin } from "./request-origin.guard";

function buildRequest(headers: Record<string, string | undefined>): Request {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );

  return new Request("https://app.example.test/api/example", {
    method: "POST",
    headers: normalizedHeaders,
  });
}

function expectAccessDeniedFailure(
  result: ReturnType<typeof guardUnsafeMethodByFetchMetadataAndOrigin>,
) {
  expect(result).toMatchObject({
    httpStatus: 403,
    errorFields: expect.objectContaining({
      errorCode: errorCode.ACCESS_DENIED,
      errorId: expect.stringMatching(/\S/),
    }),
  });
}

function expectGuardResult(
  result: ReturnType<typeof guardUnsafeMethodByFetchMetadataAndOrigin>,
  expected: "allow" | "deny",
) {
  if (expected === "allow") {
    expect(result).toBeNull();
    return;
  }
  expectAccessDeniedFailure(result);
}

describe("guardUnsafeMethodByFetchMetadataAndOrigin", () => {
  it("Sec-Fetch-Site=cross-site は Origin が一致していても拒否する", () => {
    const result = guardUnsafeMethodByFetchMetadataAndOrigin(
      buildRequest({
        "sec-fetch-site": "cross-site",
        host: "app.example.test",
        origin: "https://app.example.test",
      }),
    );
    expectAccessDeniedFailure(result);
  });

  it("Sec-Fetch-Site=same-origin は Origin/Referer が無くても許可する", () => {
    const result = guardUnsafeMethodByFetchMetadataAndOrigin(
      buildRequest({
        "sec-fetch-site": "same-origin",
      }),
    );
    expect(result).toBeNull();
  });

  it.each([
    { caseName: "Sec-Fetch-Site 無し", secFetchSite: undefined },
    { caseName: "Sec-Fetch-Site=same-site", secFetchSite: "same-site" },
    { caseName: "Sec-Fetch-Site=none", secFetchSite: "none" },
    { caseName: "Sec-Fetch-Site=unknown", secFetchSite: "unknown" },
  ])("$caseName で Origin/Referer が無い場合は拒否する", (input) => {
    const headers: Record<string, string> = {
      host: "app.example.test",
    };
    if (input.secFetchSite) {
      headers["sec-fetch-site"] = input.secFetchSite;
    }

    const result = guardUnsafeMethodByFetchMetadataAndOrigin(
      buildRequest(headers),
    );
    expectAccessDeniedFailure(result);
  });

  it("Sec-Fetch-Site 無し:  x-forwarded-host と host が両方無い場合は拒否する", () => {
    const result = guardUnsafeMethodByFetchMetadataAndOrigin(buildRequest({}));
    expectAccessDeniedFailure(result);
  });

  // Origin 系（一致/null/不正URL）
  it.each([
    {
      caseName: "Origin.host と Host が一致すれば許可する",
      headers: {
        host: "app.example.test",
        origin: "https://app.example.test",
      },
      expected: "allow" as const,
    },
    {
      caseName: "Origin が null の場合は拒否する",
      headers: {
        host: "app.example.test",
        origin: "null",
      },
      expected: "deny" as const,
    },
    {
      caseName: "Origin が不正 URL の場合は拒否する",
      headers: {
        host: "app.example.test",
        origin: "%%%bad-origin%%%",
      },
      expected: "deny" as const,
    },
  ])("Sec-Fetch-Site 無し: $caseName", (input) => {
    const result = guardUnsafeMethodByFetchMetadataAndOrigin(
      buildRequest(input.headers),
    );
    expectGuardResult(result, input.expected);
  });

  // Referer 系（一致/不正/不一致）
  it.each([
    {
      caseName: "Origin が無い場合、Referer.host と Host が一致すれば許可する",
      headers: {
        host: "app.example.test",
        referer: "https://app.example.test/path?x=1",
      },
      expected: "allow" as const,
    },
    {
      caseName: "Referer が不正 URL の場合は拒否する",
      headers: {
        host: "app.example.test",
        referer: "%%%bad-referer%%%",
      },
      expected: "deny" as const,
    },
    {
      caseName: "Referer.host が不一致なら拒否する",
      headers: {
        host: "app.example.test",
        referer: "https://evil.example.test/path",
      },
      expected: "deny" as const,
    },
  ])("Sec-Fetch-Site 無し: $caseName", (input) => {
    const result = guardUnsafeMethodByFetchMetadataAndOrigin(
      buildRequest(input.headers),
    );
    expectGuardResult(result, input.expected);
  });

  // x-forwarded-host 優先系（許可/拒否 + Origin不在時Referer）
  it.each([
    {
      caseName: "x-forwarded-host がある場合は host より優先して比較する",
      headers: {
        host: "internal.local",
        "x-forwarded-host": "public.example.test",
        origin: "https://public.example.test",
      },
      expected: "allow" as const,
    },
    {
      caseName: "origin が host 側しか一致しないと拒否する",
      headers: {
        host: "public.example.test",
        "x-forwarded-host": "edge.example.test",
        origin: "https://public.example.test",
      },
      expected: "deny" as const,
    },
    {
      caseName:
        "Origin 不在でも Referer.host が x-forwarded-host に一致すれば許可する",
      headers: {
        host: "internal.local",
        "x-forwarded-host": "public.example.test",
        referer: "https://public.example.test/path",
      },
      expected: "allow" as const,
    },
    {
      caseName:
        "Origin 不在で Referer.host が host 側しか一致しない場合は拒否する",
      headers: {
        host: "public.example.test",
        "x-forwarded-host": "edge.example.test",
        referer: "https://public.example.test/path",
      },
      expected: "deny" as const,
    },
  ])("Sec-Fetch-Site 無し: $caseName", (input) => {
    const result = guardUnsafeMethodByFetchMetadataAndOrigin(
      buildRequest(input.headers),
    );
    expectGuardResult(result, input.expected);
  });
});
