// apps/web/src/app/(marketing)/page.tsx
// ========================================================
// ランディングページ
// ========================================================

import type { Metadata } from "next";
import { LandingView } from "@/frontend/screens/landing/ui/Landing.view";

export const metadata: Metadata = {
  title: "Coffee AI Mentor | 毎日のコーヒーが、上達につながる。",
  description:
    "コーヒーの抽出記録を蓄積し、振り返りとAIメンターで次の一杯を改善するためのサービスです。",
};

export default function LandingPage() {
  return <LandingView />;
}
