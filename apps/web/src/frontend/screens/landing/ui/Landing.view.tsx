// apps/web/src/frontend/screens/landing/ui/Landing.view.tsx
// ========================================================
// 概要:
// - マーケティング用ランディング画面（画面構成のみ）
//
// 責務:
// - セクションを上から順に並べ、読み順のストーリーを作る
// ========================================================

import { FaqSection } from "./components/FaqSection";
import { FeaturesSection } from "./components/FeaturesSection";
import { FinalCtaSection } from "./components/FinalCtaSection";
import { ForSection } from "./components/ForSection";
import { HeroRich } from "./components/HeroRich";
import { ProblemSection } from "./components/ProblemSection";

export function LandingView() {
  return (
    <div className="flex flex-1 flex-col">
      {/* 1) Hero: 価値とCTA（最初の一画面） */}
      <HeroRich />

      {/* 2) Problem: あるある課題（共感） */}
      <ProblemSection />

      {/* 3) For: 対象ユーザー（誰のためのプロダクトか） */}
      <ForSection />

      {/* 4) Features: できること（どう役に立つか） */}
      <FeaturesSection />

      {/* 5) FAQ: よくある質問（不安の解消） */}
      <FaqSection />

      {/* 6) Final CTA: 最後のひと押し */}
      <FinalCtaSection />
    </div>
  );
}
