// apps/web/src/frontend/screens/landing/ui/components/FeaturesSection.tsx
// ========================================================
// 概要:
// - ランディングの機能紹介セクション（3ステップ + 価値の柱）
//
// 責務:
// - 使い方の流れ（軽く残す / 質問で整う / 振り返る）を提示する
// - 継続価値（続く前提 / 自分の言葉 / 次に繋がる）を補足する
// ========================================================

import { Check, MessageCircle, NotebookPen, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/frontend/shared/ui/shadcn/components/ui/card";

export function FeaturesSection() {
  return (
    <section
      id="features"
      className="scroll-mt-24 border-b py-16 md:py-24"
      aria-label="features"
    >
      <div className="mx-auto max-w-6xl px-6">
        <HeaderBlock
          eyebrow="できること"
          title="1杯を、3ステップで。"
          description="思いつきが、学びに変わって残ります。"
        />

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          <FeatureCard
            icon={<NotebookPen className="size-5" />}
            title="軽く残す"
            body="豆・淹れ方・第一印象だけ。まずは短く。"
          />
          <FeatureCard
            icon={<MessageCircle className="size-5" />}
            title="質問で整う"
            body="答えていくだけで、味の輪郭がまとまる。"
          />
          <FeatureCard
            icon={<TrendingUp className="size-5" />}
            title="振り返る"
            body="あとから読むと、好みと傾向が見えてくる。"
          />
        </div>

        <div className="mt-12 rounded-2xl border bg-muted/20 p-6 md:p-8">
          <div className="grid gap-10 md:grid-cols-3">
            <MiniValue
              title="続く前提"
              body="忙しい日は短く。余裕がある日は深く。"
            />
            <MiniValue
              title="自分の言葉"
              body="専門用語が分からなくてもOK。少しずつ増える。"
            />
            <MiniValue
              title="次に繋がる"
              body="思いついたアイデアが残るから、試しやすい。"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function HeaderBlock({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="max-w-2xl space-y-3">
      <p className="text-sm text-muted-foreground">{eyebrow}</p>
      <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
        {title}
      </h2>
      <p className="text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Card className="rounded-2xl">
      <CardHeader className="space-y-3">
        <div className="inline-flex size-10 items-center justify-center rounded-xl bg-muted">
          {icon}
        </div>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
      </CardContent>
    </Card>
  );
}

function MiniValue({ title, body }: { title: string; body: string }) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2 text-sm font-medium">
        <Check className="mt-0.5 size-4" />
        {title}
      </div>
      <div className="text-sm text-muted-foreground leading-relaxed">
        {body}
      </div>
    </div>
  );
}
