// apps/web/src/frontend/screens/landing/ui/components/FinalCtaSection.tsx
// ========================================================
// 概要:
// - ランディング下部の最終CTAセクション
//
// 責務:
// - 短いメッセージで「始める理由」を再提示する
// - 主CTA（/sign-in）と副CTA（#how）を並べて次の行動を選びやすくする
// ========================================================

import { ArrowRight, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/frontend/shared/ui/shadcn/components/ui/button";

export function FinalCtaSection() {
  return (
    <section className="scroll-mt-24 py-16 md:pb-24" aria-label="final-cta">
      <div className="mx-auto max-w-6xl px-6">
        <div className="relative overflow-hidden rounded-2xl border bg-background p-8 md:p-12">
          {/* 1) 背景: ほんのり光が差すような丸いブラー */}
          <div
            className="pointer-events-none absolute -top-20 right-0 h-64 w-64 rounded-full bg-muted/60 blur-3xl"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -bottom-24 left-0 h-64 w-64 rounded-full bg-muted/50 blur-3xl"
            aria-hidden="true"
          />

          <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Coffee AI Mentor</p>
              <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
                今日の一杯から、始めよう。
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                もやもやが、少しずつ言葉になる。
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/sign-in">
                  Googleでサインイン
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="#how">
                  使い方を見る
                  <ChevronRight className="ml-1 size-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
