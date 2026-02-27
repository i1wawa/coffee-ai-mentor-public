// apps/web/src/proxy.test.ts
// ========================================================
// 概要:
// - proxy（入口ガード）のユニットテスト
//
// 契約:
// - /app または /app/* へのアクセス時
//   - セッションCookieが未設定（無し/空/空白）なら /sign-in へ redirect（origin保持）
//   - セッションCookieが上限超過なら /sign-in へ redirect（origin保持）
//   - それ以外は next で通す
// - /app 以外のパス（例: /app-foo）は通す
//
// 前提:
// - proxy は nextUrl.pathname/nextUrl.clone()/cookies.get() のみ参照する
// ========================================================

import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE_NAME } from "@/backend/shared/http/cookies";
import { MAX_SESSION_COOKIE_CHARS } from "@/backend/shared/http/request.guard.server";
import { proxy } from "./proxy";

type ProxyResult = { kind: "next" } | { kind: "redirect"; location: string };

vi.mock("next/server", async () => {
  const actual =
    await vi.importActual<typeof import("next/server")>("next/server");

  return {
    ...actual,
    NextResponse: {
      redirect: vi.fn((url: URL) => {
        return {
          kind: "redirect",
          location: url.toString(),
        } satisfies ProxyResult;
      }),
      next: vi.fn(() => {
        return { kind: "next" } satisfies ProxyResult;
      }),
    },
  };
});

const sessionCookieName = SESSION_COOKIE_NAME;
const maxSessionCookieChars = MAX_SESSION_COOKIE_CHARS;
const proxyFn = proxy as unknown as (request: unknown) => ProxyResult;

function createRequest(params: { url: string; cookieValue?: string }) {
  // 1) URL は nextUrl.pathname と clone() にだけ使う
  const url = new URL(params.url);

  // 2) cookies.get は必要最小の shape を返す
  const cookies = {
    get: (name: string) => {
      if (name !== sessionCookieName) return undefined;
      if (typeof params.cookieValue !== "string") return undefined;
      return { value: params.cookieValue };
    },
  };

  // 3) NextRequest 互換の最小形
  // - 型はテストでは厳密に合わせず、必要なプロパティだけを持たせる
  return {
    cookies,
    nextUrl: {
      pathname: url.pathname,
      clone: () => new URL(url.toString()),
    },
  };
}

describe("proxy", () => {
  const mockedRedirect = vi.mocked(NextResponse.redirect);
  const mockedNext = vi.mocked(NextResponse.next);

  beforeEach(() => {
    mockedRedirect.mockClear();
    mockedNext.mockClear();
  });

  it("未サインイン: /app に cookie 無しでアクセスすると /sign-in にリダイレクトする", () => {
    // 1) arrange: /app に cookie 無しでアクセスする
    const request = createRequest({
      url: "https://127.0.0.1:3000/app",
    });

    // 2) act: Proxy を通す
    const res = proxyFn(request);

    // 3) assert: /sign-in にリダイレクトされる（origin は保持）
    expect(res.kind).toBe("redirect");
    expect((res as { kind: "redirect"; location: string }).location).toBe(
      "https://127.0.0.1:3000/sign-in",
    );
  });

  it("未サインイン: /app/* に空文字/空白cookieでアクセスすると /sign-in にリダイレクトする", () => {
    // 1) arrange: cookie はあるが空白のみ（未設定扱い）
    const request = createRequest({
      url: "https://127.0.0.1:3000/app/home",
      cookieValue: "   ",
    });

    // 2) act
    const res = proxyFn(request);

    // 3) assert
    expect(res.kind).toBe("redirect");
    expect((res as { kind: "redirect"; location: string }).location).toBe(
      "https://127.0.0.1:3000/sign-in",
    );
  });

  it("安全対策: cookie が上限超過なら /sign-in にリダイレクトする", () => {
    // 1) arrange: DoS/例外抑制のため、異常に長い cookie を与える
    const tooLongCookieValue = "a".repeat(maxSessionCookieChars + 1);
    const request = createRequest({
      url: "https://127.0.0.1:3000/app",
      cookieValue: tooLongCookieValue,
    });

    // 2) act
    const res = proxyFn(request);

    // 3) assert
    expect(res.kind).toBe("redirect");
    expect((res as { kind: "redirect"; location: string }).location).toBe(
      "https://127.0.0.1:3000/sign-in",
    );
  });

  it("誤検知防止: /app-foo は /app とみなさず next で通過する", () => {
    // 1) arrange: /app-foo は誤検知してはいけない
    const request = createRequest({
      url: "https://127.0.0.1:3000/app-foo",
    });

    // 2) act
    const res = proxyFn(request);

    // 3) assert
    expect(res).toEqual({ kind: "next" });
  });
});

it("/app :  cookie があれば next で通過する", () => {
  // 1) arrange: 正常っぽい cookie
  const request = createRequest({
    url: "https://127.0.0.1:3000/app",
    cookieValue: "session-token",
  });

  // 2) act
  const res = proxyFn(request);

  // 3) assert
  expect(res).toEqual({ kind: "next" });
});
