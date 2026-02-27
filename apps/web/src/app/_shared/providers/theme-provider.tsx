// apps/web/src/app/_shared/providers/theme-provider.tsx
// ========================================================
// 概要:
// - next-themes の ThemeProvider をアプリ向けに包むクライアントコンポーネント
//
// 責務:
// - children と props をそのまま NextThemesProvider に中継する
// ========================================================

"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type * as React from "react";

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
