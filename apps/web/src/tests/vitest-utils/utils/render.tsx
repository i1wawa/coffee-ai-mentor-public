// apps/web/src/tests/vitest-utils/utils/render.tsx
// ========================================================
// 概要:
// - React Testing Library の render を、アプリ共通の Provider 付きで提供するテスト用ヘルパー
//
// 契約:
// - QueryClientProvider を必ず差し込む（必要なら他 Provider も AppTestProviders に追加する）
// - QueryClient は引数で注入でき、未指定ならテストごとに新規作成する
// - 返り値に queryClient を含め、テスト側でキャッシュ操作できる
// ========================================================

import type { QueryClient } from "@tanstack/react-query";
import { type RenderResult, render } from "@testing-library/react";
import type * as React from "react";
import { AppTestProviders, createTestQueryClient } from "./react-query";

type RenderWithProvidersArgs = {
  queryClient?: QueryClient;
};

type RenderWithProvidersResult = RenderResult & {
  queryClient: QueryClient;
};

/**
 * React Testing Library の render を、アプリ共通の Provider 付きで提供する
 */
export function renderWithProviders(
  ui: React.ReactElement,
  // テスト独自の Providers を追加できるように
  args: RenderWithProvidersArgs = {},
): RenderWithProvidersResult {
  // QueryClient はテストごとに新規作成する
  const queryClient = args.queryClient ?? createTestQueryClient();

  // Provider でラップして描画する
  const renderResult = render(
    <AppTestProviders queryClient={queryClient}>{ui}</AppTestProviders>,
  );

  // QueryClient を返して、setQueryData などをテストから触れるようにする
  return {
    ...renderResult,
    queryClient,
  };
}
