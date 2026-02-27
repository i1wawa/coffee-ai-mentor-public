// apps/web/src/frontend/screens/landing/ui/components/HeroRich.tsx
// ========================================================
// 概要:
// - ランディングのHero（メッセージ + CTA + 疑似UI）
//
// 責務:
// - 価値提案を短く提示する（見出し/説明）
// - 主CTA（サインイン）と副CTA（特徴）を配置する
// - 右側に疑似UI（ShowcaseStack）を出して具体像を補う
// ========================================================

import { ArrowRight, Check, Sparkles } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/frontend/shared/ui/shadcn/components/ui/badge";
import { Button } from "@/frontend/shared/ui/shadcn/components/ui/button";
import { ShowcaseStack } from "./ShowcaseStack";

export function HeroRich() {
  return (
    <section className="relative overflow-hidden border-b">
      {/* 1) 背景: うっすらしたグラデーションで温かい雰囲気を出す */}
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-background to-muted/40" />
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, rgba(0,0,0,0.06), transparent 45%), radial-gradient(circle at 80% 30%, rgba(0,0,0,0.05), transparent 40%), radial-gradient(circle at 40% 90%, rgba(0,0,0,0.05), transparent 45%)",
        }}
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-6xl px-6 py-12 md:py-30">
        <div className="grid items-center gap-14 md:grid-cols-2 md:gap-16">
          {/* 2) 左: メッセージ + CTA */}
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="gap-2">
                <Sparkles className="size-4" />
                AIメンター支援つきコーヒーノート
              </Badge>
            </div>

            <div className="space-y-8">
              <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
                毎日のコーヒーが、
                <br />
                上達につながる。
              </h1>
              <p className="text-muted-foreground leading-relaxed md:text-lg">
                1杯ぶんのメモに、心地よい質問。
                <br />
                振り返るたびに、好みと淹れ方が整っていきます。
              </p>
            </div>

            <div className="flex flex-col items-start gap-3 py-2 sm:flex-row sm:items-center">
              <Button asChild size="lg">
                <Link href="/sign-in">
                  Googleでサインイン
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="#features">特徴を見る</Link>
              </Button>
            </div>

            <ul className="space-y-2 text-sm text-muted-foreground">
              {/* 3) 補足: 具体的な安心材料を短く添える */}
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4" />
                <span>短くても、あとから振り返れる形に。</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 size-4" />
                <span>質問に答えるだけで、味の表現が増える。</span>
              </li>
            </ul>
          </div>

          {/* 4) 右: 疑似UIで想像しやすくする */}
          <div className="md:justify-self-end">
            <ShowcaseStack />
          </div>
        </div>
      </div>
    </section>
  );
}
