// apps/web/src/app/(legal)/legal/page.tsx
// ========================================================
// 利用規約・プライバシーポリシーページ
// /legal に対応
// ========================================================

import type { Metadata } from "next";
import { LegalView } from "@/frontend/screens/legal/ui/LegalPage.view";

export const metadata: Metadata = {
  title: "利用規約・プライバシーポリシー | Coffee AI Mentor",
  description: "Coffee AI Mentorの利用規約およびプライバシーポリシーです。",
};

export default function LegalPage() {
  return <LegalView />;
}
