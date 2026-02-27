// apps/web/src/env.server.test.ts
// ========================================================
// 概要:
// - env.server.ts の遅延バリデーションを検証する
//
// 契約:
// - build 時に参照される base env は secrets 未設定でも取得できる
// - secrets env は getter 呼び出し時にバリデーションを実行する
// ========================================================
// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("env.server", () => {
  const targetKey = "DATABASE_URL";
  let originalDatabaseUrl: string | undefined;

  beforeEach(() => {
    originalDatabaseUrl = process.env[targetKey];
    vi.resetModules();
  });

  it("base env取得時: runtime secret が欠けていても失敗しない", async () => {
    // 1) runtime secret を欠落させる（build-time を模擬）
    delete process.env[targetKey];

    // 2) base getter は secrets を検証しない
    const { getServerBaseEnv } = await import("./env.server");
    expect(getServerBaseEnv().APP_ENV).toBeDefined();
  });

  it("secrets env取得時: runtime secret が欠けていると失敗する", async () => {
    // 1) runtime secret を欠落させる（build-time を模擬）
    delete process.env[targetKey];

    // 2) 対象モジュールを import
    const { getServerSecretsEnv } = await import("./env.server");

    // 3) secrets getter 実行時に検証されて失敗する
    expect(() => getServerSecretsEnv()).toThrowError(
      "Invalid environment variables",
    );
  });

  it("secrets env取得時: runtime secret があると取得できる", async () => {
    // 1) 最低限このテストで使う key をセットする
    process.env[targetKey] =
      "postgresql://test:test@localhost:5432/test?schema=public";

    // 2) 対象モジュールを import
    const { getServerSecretsEnv } = await import("./env.server");

    // 3) getter 実行で値を読める
    expect(getServerSecretsEnv().DATABASE_URL).toBe(process.env[targetKey]);
  });

  afterEach(() => {
    // 各テストで process.env を直接変更するため必ず復元する
    // - vi.resetModules() でモジュールキャッシュも掃除する
    if (originalDatabaseUrl === undefined) {
      delete process.env[targetKey];
    } else {
      process.env[targetKey] = originalDatabaseUrl;
    }
    vi.resetModules();
  });
});
