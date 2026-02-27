// apps/web/src/tests/utils/auth-emulator.test.ts
// ========================================================
// 概要:
// - auth-emulator ユーティリティのユニットテスト
//
// 契約:
// - signUp と signIn が同一のユニークメールを使う
// - signIn の idToken は trim 済みで返る
// - signUp が EMAIL_EXISTS のときは別メールでリトライして継続する
// ========================================================

import { afterEach, describe, expect, it, vi } from "vitest";
import { testAdminAuth } from "@/tests/utils/firebase-admin-emulator";
import {
  createTestUserAndFetchIdToken,
  createVerifiedTestUserAndFetchIdToken,
} from "./auth-emulator";

vi.mock("@/tests/utils/firebase-admin-emulator", () => {
  return {
    testAdminAuth: {
      updateUser: vi.fn(),
    },
  };
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function readEmailFromCall(callArgs: unknown[]): string {
  const requestInit = callArgs[1] as RequestInit | undefined;
  const rawBody = requestInit?.body;
  if (typeof rawBody !== "string") return "";
  const body = JSON.parse(rawBody) as { email?: string };
  return body.email ?? "";
}

function readEmailsForEndpoint(calls: unknown[][], endpoint: string): string[] {
  return calls.flatMap((callArgs) => {
    const url = callArgs[0];
    if (typeof url !== "string" || !url.includes(endpoint)) return [];
    return [readEmailFromCall(callArgs)];
  });
}

describe("tests/utils auth-emulator", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("成功: signUp と signIn で同一のユニークメールを使い、trim済みidTokenを返す", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(200, { localId: "u1" }))
      .mockResolvedValueOnce(jsonResponse(200, { idToken: " token-1 " }));
    vi.stubGlobal("fetch", fetchMock);

    const idToken = await createTestUserAndFetchIdToken();

    expect(idToken).toBe("token-1");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const signUpEmails = readEmailsForEndpoint(
      fetchMock.mock.calls,
      "accounts:signUp",
    );
    const signInEmails = readEmailsForEndpoint(
      fetchMock.mock.calls,
      "accounts:signInWithPassword",
    );
    expect(signUpEmails).toHaveLength(1);
    expect(signInEmails).toHaveLength(1);
    expect(signUpEmails[0]).toBe(signInEmails[0]);
  });

  it("成功: signUp が EMAIL_EXISTS のとき別メールでリトライして継続する", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(400, { error: { message: "EMAIL_EXISTS" } }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { localId: "u2" }))
      .mockResolvedValueOnce(jsonResponse(200, { idToken: "token-2" }));
    vi.stubGlobal("fetch", fetchMock);

    const idToken = await createTestUserAndFetchIdToken();

    expect(idToken).toBe("token-2");
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const signUpEmails = readEmailsForEndpoint(
      fetchMock.mock.calls,
      "accounts:signUp",
    );
    const signInEmails = readEmailsForEndpoint(
      fetchMock.mock.calls,
      "accounts:signInWithPassword",
    );
    expect(signUpEmails).toHaveLength(2);
    expect(signInEmails).toHaveLength(1);
    expect(signUpEmails[0]).not.toBe(signUpEmails[1]);
    expect(signInEmails[0]).toBe(signUpEmails[1]);
  });

  it("成功: createVerifiedTestUserAndFetchIdToken は emailVerified=true に更新後、trim済みidTokenを返す", async () => {
    const mockedUpdateUser = vi.mocked(testAdminAuth.updateUser);
    mockedUpdateUser.mockResolvedValueOnce(undefined as never);

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(200, { localId: "verified-u1" }))
      .mockResolvedValueOnce(
        jsonResponse(200, { idToken: " verified-token-1 " }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const idToken = await createVerifiedTestUserAndFetchIdToken();

    expect(idToken).toBe("verified-token-1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mockedUpdateUser).toHaveBeenCalledTimes(1);
    expect(mockedUpdateUser).toHaveBeenCalledWith("verified-u1", {
      emailVerified: true,
    });

    const signUpEmails = readEmailsForEndpoint(
      fetchMock.mock.calls,
      "accounts:signUp",
    );
    const signInEmails = readEmailsForEndpoint(
      fetchMock.mock.calls,
      "accounts:signInWithPassword",
    );
    expect(signUpEmails).toHaveLength(1);
    expect(signInEmails).toHaveLength(1);
    expect(signUpEmails[0]).toBe(signInEmails[0]);
  });
});
