// apps/web/src/app/layout.tsx
// ========================================================
// 概要:
// - ルートレイアウト（全ページ共通の HTML/Body と Provider を定義）
//
// 契約:
// - metadata により全ページ共通の title/description を提供する
// - children を AppProviders 配下で描画する
// ========================================================

import type { Metadata } from "next";
import { SiteFooter } from "@/frontend/widgets/footer/ui/SiteFooter";
import "./globals.css";
import { AppProviders } from "./_shared/providers/app-providers";

export const metadata: Metadata = {
  title: "Coffee AI Mentor",
  description: "自宅コーヒー愛好家のための抽出記録とAIメンターサービスです。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body className="min-h-svh flex flex-col bg-muted text-foreground antialiased">
        <AppProviders>
          {children}
          <SiteFooter />
        </AppProviders>
      </body>
    </html>
  );
}
