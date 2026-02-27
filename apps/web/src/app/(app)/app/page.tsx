// apps/web/src/app/(app)/app/page.tsx
// ========================================================
// アプリホームページ
// /app に対応
// ========================================================

import type { Metadata } from "next";
import { AppHomeView } from "@/frontend/screens/app/home/ui/AppHome.view";

export const metadata: Metadata = {
  title: "ホーム | Coffee AI Mentor",
  description:
    "最近の記録、次のステップ、AIメンターへの導線をまとめたホーム画面です。",
};

export default function AppPage() {
  // TODO テストで getByRole で拾えるようにする
  return <AppHomeView />;
}
