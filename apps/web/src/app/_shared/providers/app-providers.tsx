// apps/web/src/app/_shared/providers/app-providers.tsx
// ========================================================
// 概要:
// - アプリ全体で使う Provider を集約する（Client Component）
//
// 責務:
// - React Query の QueryClient を用意し、配下へ提供する
// - ThemeProvider で children をラップする
// ========================================================

"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import type * as React from "react";
import { getQueryClient } from "@/app/_shared/react-query/get-query-client";
import { AuthCrossTabSync } from "./AuthCrossTabSync";
import { ThemeProvider } from "./theme-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  // QueryClient を取得する
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthCrossTabSync />
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
