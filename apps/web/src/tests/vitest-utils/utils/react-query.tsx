// apps/web/src/tests/vitest-utils/utils/react-query.tsx
// ========================================================
// 概要:
// - Vitest 向けに React Query（TanStack Query）のテスト用セットアップを提供する
//
// 責務:
// - テストごとに新しい QueryClient を作る
// - テスト用 Provider と wrapper（render / renderHook 用）を作る
//
// 契約:
// - createTestQueryClient は毎回新規 QueryClient を返し、状態を共有しない
// - retry と自動 refetch を無効化する（不安定化を防ぐ）
// - staleTime / gcTime は Infinity に固定し、時間経過で挙動が変わらないようにする
// - defaultOptions は呼び出し側で上書きできる
// ========================================================

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type * as React from "react";

// 個別テストで必要なら上書きできるようにする
// 何も指定しなければ安定寄りのデフォルトを使う
type CreateTestQueryClientArgs = {
  defaultOptions?: {
    queries?: {
      retry?: boolean | number;
    };
    mutations?: {
      retry?: boolean | number;
    };
  };
};

/**
 * Vitest 用の QueryClient を生成する
 */
export function createTestQueryClient(args: CreateTestQueryClientArgs = {}) {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // テストは失敗時に無駄な再試行をしない
        retry: false,
        // 自動再取得でテストが不安定になるのを避ける
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false,
        // テスト中はデータを古く扱わない
        staleTime: Infinity,
        // テスト中はキャッシュを GC しない
        gcTime: Infinity,
        // 個別指定があれば上書き
        ...args.defaultOptions?.queries,
      },
      mutations: {
        // テストは失敗時に無駄な再試行をしない
        retry: false,
        // 個別指定があれば上書き
        ...args.defaultOptions?.mutations,
      },
    },
  });
}

type AppTestProvidersProps = {
  // テスト対象の UI を受け取る
  children: React.ReactNode;
  // テストごとに用意した QueryClient を受け取る
  queryClient: QueryClient;
};

/**
 * Vitest 用の Provider 群でラップするコンポーネント
 */
export function AppTestProviders(props: AppTestProvidersProps) {
  // 将来 ThemeProvider や Router 系の Provider が増えたらここに追加する
  return (
    <QueryClientProvider client={props.queryClient}>
      {props.children}
    </QueryClientProvider>
  );
}

/**
 * Vitest 用の QueryClient を使う wrapper コンポーネントを作る
 */
export function createQueryClientWrapper(queryClient?: QueryClient) {
  // QueryClient が渡されなければ新規作成する
  queryClient = queryClient ?? createTestQueryClient();

  // React Testing Library の render や renderHook が要求する形式
  return function Wrapper(props: { children: React.ReactNode }) {
    return (
      <AppTestProviders queryClient={queryClient}>
        {props.children}
      </AppTestProviders>
    );
  };
}

type CreateTestQueryWrapperArgs = CreateTestQueryClientArgs;

/**
 * Vitest 用の QueryClient とそれを使う wrapper を作る
 */
export function createTestQueryWrapper(args: CreateTestQueryWrapperArgs = {}) {
  // 1) テストごとに新しい QueryClient を作る
  const queryClient = createTestQueryClient(args);

  // 2) その QueryClient を使う wrapper を作る
  const wrapper = createQueryClientWrapper(queryClient);

  // 3) queryClient は setQueryData などに使うため返す
  return { queryClient, wrapper };
}
