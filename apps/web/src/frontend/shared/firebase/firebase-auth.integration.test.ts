// apps/web/src/frontend/shared/firebase/firebase-auth.integration.test.ts
// ================================================================
// 概要:
// - firebase-auth の統合テスト（実 Firebase Web SDK）
//
// 責務:
// - signOutFirebase を入口に、firebase-app 初期化と Auth SDK 呼び出しを統合で確認する
// - 失敗時に extract-firebase-auth-code / firebase-auth-error.mapper が連動することを確認する
//
// 契約（代表ケースのみ）:
// - signOutFirebase 成功時は ok(undefined) を返す
// - signInWithPopupAndGetIdToken 失敗時は mapper で分類された err を返す
// ================================================================

/* @vitest-environment jsdom */

import { errorCode } from "@packages/observability/src/logging/telemetry-error-common";
import { deleteApp, getApps } from "firebase/app";
import type { AuthProvider } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TELEMETRY_OPERATION } from "@/frontend/shared/observability/telemetry-tags";
import {
  expectErrCode,
  expectOkValue,
} from "@/tests/vitest-utils/utils/result-assertions";

async function cleanupFirebaseApps(): Promise<void> {
  const existingApps = getApps();
  await Promise.all(
    existingApps.map(async (existingApp) => deleteApp(existingApp)),
  );
}

describe("frontend/shared/firebase firebase-auth（統合）", () => {
  beforeEach(async () => {
    // 1) 前テストの副作用を掃除する
    await cleanupFirebaseApps();
    vi.resetModules();
  });

  afterEach(async () => {
    // 1) 後続テストへ初期化状態を持ち越さない
    await cleanupFirebaseApps();
    vi.resetModules();
  });

  it("signOutFirebase: SDK成功時は ok(undefined) を返す", async () => {
    // 1) 対象モジュールを import する
    const { signOutFirebase } = await import("./firebase-auth");

    // 2) 実行する
    const result = await signOutFirebase();

    // 3) 成功契約を確認する
    expectOkValue(result, undefined);
  });

  it("signInWithPopupAndGetIdToken: 不正 provider の SDK例外を mapper で分類する", async () => {
    // 1) 対象モジュールを import する
    const { signInWithPopupAndGetIdToken } = await import("./firebase-auth");

    // 2) 不正 provider を渡して SDK 例外を発生させる
    const invalidProvider = {} as AuthProvider;
    const result = await signInWithPopupAndGetIdToken({
      provider: invalidProvider,
    });

    // 3) mapper の分類結果と sdk メタを確認する
    expectErrCode(result, errorCode.PRECONDITION_FAILED, {
      sdk: {
        provider: "firebase_auth",
        operation: TELEMETRY_OPERATION.SIGN_IN_WITH_POPUP,
      },
    });
    expect(result.error.cause).toBeTruthy();
    expect(result.error.sdk?.code).toEqual(expect.stringMatching(/^auth\//));
    expect((result.error.cause as { code?: string }).code).toBe(
      result.error.sdk?.code,
    );
  });
});
