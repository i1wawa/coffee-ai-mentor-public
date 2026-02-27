// apps/web/src/app/_shared/lib/react-query/get-query-client.ts
// ========================================================
// 概要:
// - React Query の QueryClient を環境別に生成/取得する共通ユーティリティ
//
// 責務:
// - Server: リクエスト間で状態を共有しないため都度生成する
// - Browser: キャッシュを維持するため 1 インスタンスを使い回す
//
// 契約:
// - getQueryClient() は QueryClient を返す
// - isServer=true は常に新規、isServer=false は同一インスタンス
//
// 前提:
// - 実行環境判定は @tanstack/react-query の isServer に従う
// - Browser 側の保持はモジュールスコープ変数で行う
// ========================================================

import { isServer, QueryClient } from "@tanstack/react-query";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // 1) SSR 後に即 refetch しないための設定
        // 2) データ鮮度の許容時間を 60 秒にする（公式ガイドの意図に沿う）
        staleTime: 60 * 1000,

        // 3) キャッシュの破棄までの時間（5分）
        gcTime: 5 * 60 * 1000,

        // 4) UX を荒らしやすい自動再取得を抑える
        refetchOnWindowFocus: false,

        // 5) 失敗時の過剰リトライを抑える
        retry: 1,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/**
 * React Query の QueryClient を取得する
 *
 * - Server: 常に新規インスタンスを返す
 * - Browser: 初回生成後は同一インスタンスを返す
 */
export function getQueryClient() {
  // 1) Server は常に新規
  if (isServer) {
    return makeQueryClient();
  }

  // 2) Browser は初回だけ生成して保持
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }

  return browserQueryClient;
}
