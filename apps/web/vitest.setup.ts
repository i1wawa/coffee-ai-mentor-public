// apps/web/vitest.setup.ts
// ================================================================
// 概要:
// - Vitest のグローバルセットアップ
//
// 目的:
// - server-only のモック化
// - Testing Library の DOM クリーンアップ
// ================================================================

import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// server-only は Next.js のサーバー専用ガード用の import。
// テスト環境では Next.js のバンドル最適化が効かないことがあるため、
// ここで空モジュールに差し替えて読み込みを成立させる。
vi.mock("server-only", () => ({}));

afterEach(() => {
  // 前のテストで render したDOMを片付ける
  // - Vitest はデフォルトで globals を提供しない（Jestと違い、明示importが基本）
  // - Testing Library は自動 cleanup を "globalのafterEachが存在する" 前提で登録するため、
  //   設定次第では cleanup が走らず、前のテストのDOMが残ることがある
  cleanup();
});
