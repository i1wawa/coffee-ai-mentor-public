// apps/web/src/app/layout.tsx
// ========================================================
// 概要:
// - ルートレイアウト（全ページ共通の HTML/Body と Provider を定義）
//
// 責務:
// - metadata により全ページ共通の title/description を提供する
// - children を AppProviders 配下で描画する
// - nonce を AppProviders に渡し、next-themes に反映する
// - SiteFooter を全ページ共通で描画する
// ========================================================

import type { Metadata } from "next";
import { headers } from "next/headers";
import { SiteFooter } from "@/frontend/widgets/footer/ui/SiteFooter";
import "./globals.css";
import { AppProviders } from "./_shared/providers/app-providers";

export const metadata: Metadata = {
  title: "Coffee AI Mentor",
  description: "自宅コーヒー愛好家のための抽出記録とAIメンターサービスです。",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 1) Proxy で付与した nonce を取得する
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  // 2) nonce を Provider に渡し、next-themes の inline script に反映する
  return (
    <html lang="ja" suppressHydrationWarning>
      <body className="min-h-svh flex flex-col bg-muted text-foreground antialiased">
        <AppProviders nonce={nonce}>
          {children}
          <SiteFooter />
        </AppProviders>
      </body>
    </html>
  );
}
