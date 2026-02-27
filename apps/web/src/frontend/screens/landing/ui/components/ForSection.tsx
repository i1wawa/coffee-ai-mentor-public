// apps/web/src/frontend/screens/landing/ui/components/ForSection.tsx
// ========================================================
// 概要:
// - ランディングの「こんな人に」セクション（対象ユーザーの提示）
//
// 責務:
// - ペルソナ3種（毎日淹れる / 言葉が出ない / 再現したい）をカードで表示する
// - 見出し（eyebrow/title/description）とカード群の構成を固定する
// ========================================================

import { Coffee, Sparkles, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/frontend/shared/ui/shadcn/components/ui/card";

export function ForSection() {
  return (
    <section
      id="for"
      className="scroll-mt-24 border-b bg-muted/40 py-16 md:pb-24"
      aria-label="for"
    >
      <div className="mx-auto max-w-6xl px-6">
        <HeaderBlock
          eyebrow="こんな人に"
          title="コーヒーの時間を、ちゃんと自分のものに。"
          description="がんばりすぎない。でも、少しずつ上達はしたい。"
        />

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          <PersonaCard
            icon={<Coffee className="size-5" />}
            title="毎日淹れる"
            body="ルーティンになっていて、差が分かりにくい。"
          />
          <PersonaCard
            icon={<Sparkles className="size-5" />}
            title="言葉が出ない"
            body="味の表現がワンパターンで止まりがち。"
          />
          <PersonaCard
            icon={<TrendingUp className="size-5" />}
            title="再現したい"
            body="よかった一杯を、もう一度出せるようにしたい。"
          />
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

function PersonaCard({
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
