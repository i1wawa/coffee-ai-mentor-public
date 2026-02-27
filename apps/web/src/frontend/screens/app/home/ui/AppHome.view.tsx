// apps/web/src/frontend/screens/app/home/ui/AppHome.view.tsx
// ========================================================
// 概要:
// - アプリホーム画面（Client Component）
// - 「状況を一望 → すぐ記録/振り返り/相談」に寄せる
//
// 責務:
// - 主アクション（記録開始/一覧/AIメンター）への導線を提供する
// - 最近の記録と空状態を表示する
// - 次の一手（実験）とショートカットを提示する
//
// 前提:
// - 現状はUI骨格のダミーデータで表示している
// ========================================================

"use client";

import {
  ArrowRight,
  Beaker,
  BookOpen,
  CalendarDays,
  ChevronRight,
  Coffee,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { Badge } from "@/frontend/shared/ui/shadcn/components/ui/badge";
import { Button } from "@/frontend/shared/ui/shadcn/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/frontend/shared/ui/shadcn/components/ui/card";
import { Separator } from "@/frontend/shared/ui/shadcn/components/ui/separator";

type RecentCup = {
  id: string;
  brewedAtIso: string;
  beanLabel: string;
  methodLabel: string;
  impression: string;
  scoreLabel: "良い" | "ふつう" | "微妙";
};

type NextExperiment = {
  title: string;
  detail: string;
  hint: string;
};

export function AppHomeView() {
  // 1) ルーティング先はここに集約しておく
  // - 後でルートが変わっても差し替えが楽
  const hrefStartRecord = "#";
  const hrefBrowseRecords = "#";
  const hrefMentor = "#";

  // 2) 表示用の日付（軽量に）
  const todayLabel = useMemo(() => {
    const formatter = new Intl.DateTimeFormat("ja-JP", {
      month: "long",
      day: "numeric",
      weekday: "short",
    });
    return formatter.format(new Date());
  }, []);

  // 3) ここは将来、API / React Query で差し替える想定
  // - 現状はUIの骨格を見せるためのダミーデータ
  const recentCups: RecentCup[] = [
    {
      id: "1",
      brewedAtIso: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
      beanLabel: "エチオピア / ナチュラル",
      methodLabel: "ハンドドリップ",
      impression: "明るい酸。後味が軽い",
      scoreLabel: "良い",
    },
    {
      id: "2",
      brewedAtIso: new Date(Date.now() - 1000 * 60 * 60 * 44).toISOString(),
      beanLabel: "グアテマラ / ウォッシュド",
      methodLabel: "ハンドドリップ",
      impression: "甘みが出た。温度が下がると伸びる",
      scoreLabel: "良い",
    },
    {
      id: "3",
      brewedAtIso: new Date(Date.now() - 1000 * 60 * 60 * 70).toISOString(),
      beanLabel: "コロンビア / ハニー",
      methodLabel: "ハンドドリップ",
      impression: "少し渋い。挽き目が細かいかも",
      scoreLabel: "ふつう",
    },
  ];

  const nextExperiment: NextExperiment = {
    title: "挽き目を 1段階だけ粗く",
    detail: "渋さが出たら、まずここ。",
    hint: "同じ豆で2回だけ試して、違いが出るか確認すると楽です。",
  };

  const hasAnyRecord = recentCups.length > 0;

  return (
    <div
      className="mx-auto w-full max-w-7xl px-4 py-4 md:py-10"
      data-testid="app-page"
    >
      {/* 上段: 画面の意味と主アクション */}
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center pb-4 gap-4 text-sm text-muted-foreground">
            <CalendarDays className="size-4" aria-hidden="true" />
            <span>{todayLabel}</span>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            今日の一杯を、学びに変える
          </h1>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href={hrefStartRecord}>
              記録をはじめる
              <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>

          <Button asChild size="lg" variant="outline">
            <Link href={hrefBrowseRecords}>記録を見返す</Link>
          </Button>
        </div>
      </div>

      <Separator className="my-8 md:my-10" />

      {/* メイン: 左に最近 / 右に次の一手（2カラム） */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* 左: 最近の記録 */}
        <section className="lg:col-span-2 space-y-6">
          <Card className="rounded-2xl">
            <CardHeader className="space-y-1">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">最近の記録</CardTitle>
                <Button asChild variant="ghost" size="sm" className="-mr-2">
                  <Link href={hrefBrowseRecords}>
                    一覧へ
                    <ChevronRight className="ml-1 size-4" />
                  </Link>
                </Button>
              </div>
            </CardHeader>

            <CardContent>
              {!hasAnyRecord ? (
                <EmptyState
                  title="まだ記録がありません"
                  description="まずは1杯。豆と第一印象だけ軽く書けばOKです。"
                  primaryHref={hrefStartRecord}
                  primaryLabel="最初の1杯を記録"
                  icon={<Coffee className="size-5" aria-hidden="true" />}
                />
              ) : (
                <div className="space-y-3">
                  {recentCups.map((cup) => (
                    <RecentCupRow key={cup.id} cup={cup} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 学びのハブ: すぐにAIへ */}
          <Card className="rounded-2xl border-border/60 bg-muted/30">
            <CardHeader className="space-y-1">
              <CardTitle className="text-base">言葉を整える</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex size-10 items-center justify-center rounded-xl bg-background">
                  <Sparkles className="size-5" aria-hidden="true" />
                </span>
                <div className="space-y-1">
                  <div className="text-sm font-medium">AIメンターに相談</div>
                  <div className="text-sm text-muted-foreground leading-relaxed">
                    酸・甘み・ボディなど、要素ごとに言葉を整理できます。
                  </div>
                </div>
              </div>

              <Button asChild variant="outline">
                <Link href={hrefMentor}>
                  AIメンターを開く
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </section>

        {/* 右: 次のステップ / ショートカット */}
        <aside className="space-y-6">
          <Card className="rounded-2xl">
            <CardHeader className="space-y-1">
              <CardTitle className="text-base">次のステップ</CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="rounded-2xl border bg-background p-4">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex size-10 items-center justify-center rounded-xl bg-muted">
                    <Beaker className="size-5" aria-hidden="true" />
                  </span>

                  <div className="space-y-1">
                    <div className="text-sm font-medium">
                      {nextExperiment.title}
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {nextExperiment.detail}
                    </p>
                  </div>
                </div>

                <div className="mt-3 rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground leading-relaxed">
                  {nextExperiment.hint}
                </div>
              </div>

              <Button asChild className="w-full">
                <Link href={hrefStartRecord}>
                  この方針で記録する
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/60">
            <CardHeader className="space-y-1">
              <CardTitle className="text-base">ショートカット</CardTitle>
            </CardHeader>

            <CardContent className="space-y-2">
              <Shortcut
                href={hrefStartRecord}
                icon={<Coffee className="size-4" aria-hidden="true" />}
                title="記録をはじめる"
                desc="豆と第一印象だけでOK"
              />
              <Shortcut
                href={hrefBrowseRecords}
                icon={<BookOpen className="size-4" aria-hidden="true" />}
                title="記録を見返す"
                desc="美味しかった記憶をもう一度"
              />
              <Shortcut
                href={hrefMentor}
                icon={<Sparkles className="size-4" aria-hidden="true" />}
                title="AIメンター"
                desc="言葉とヒラメキを整理"
              />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function RecentCupRow({ cup }: { cup: RecentCup }) {
  const brewedLabel = useMemo(() => {
    const formatter = new Intl.DateTimeFormat("ja-JP", {
      month: "numeric",
      day: "numeric",
    });
    return formatter.format(new Date(cup.brewedAtIso));
  }, [cup.brewedAtIso]);

  const scoreVariant =
    cup.scoreLabel === "良い"
      ? "default"
      : cup.scoreLabel === "ふつう"
        ? "secondary"
        : "outline";

  return (
    <div className="group flex items-start justify-between gap-4 rounded-2xl border p-4 transition-colors hover:bg-muted/30">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="rounded-xl">
            {brewedLabel}
          </Badge>
          <Badge variant={scoreVariant} className="rounded-xl">
            {cup.scoreLabel}
          </Badge>
        </div>

        <div className="text-sm font-medium truncate">{cup.beanLabel}</div>
        <div className="text-xs text-muted-foreground">{cup.methodLabel}</div>
        <div className="text-sm text-muted-foreground leading-relaxed">
          {cup.impression}
        </div>
      </div>

      <div className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
        <Button variant="ghost" size="icon" aria-label="詳細を見る">
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

function Shortcut({
  href,
  icon,
  title,
  desc,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <Button
      asChild
      variant="ghost"
      className="h-auto w-full justify-start rounded-2xl p-4"
    >
      <Link href={href}>
        <span className="mr-3 inline-flex size-9 items-center justify-center rounded-xl bg-muted">
          {icon}
        </span>

        <span className="flex min-w-0 flex-col items-start gap-0.5">
          <span className="text-sm font-medium">{title}</span>
          <span className="text-xs text-muted-foreground">{desc}</span>
        </span>

        <ChevronRight
          className="ml-auto size-4 text-muted-foreground"
          aria-hidden="true"
        />
      </Link>
    </Button>
  );
}

function EmptyState({
  title,
  description,
  primaryHref,
  primaryLabel,
  icon,
}: {
  title: string;
  description: string;
  primaryHref: string;
  primaryLabel: string;
  icon: React.ReactNode;
}) {
  // 空状態は説明を増やしすぎず、次の行動を1つに絞る
  return (
    <div className="rounded-2xl border bg-muted/20 p-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex size-10 items-center justify-center rounded-xl bg-background">
          {icon}
        </span>

        <div className="space-y-1">
          <div className="text-sm font-medium">{title}</div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {description}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <Button asChild>
          <Link href={primaryHref}>
            {primaryLabel}
            <ArrowRight className="ml-2 size-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
