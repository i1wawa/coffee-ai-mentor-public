// apps/web/src/frontend/screens/landing/ui/components/ProblemSection.tsx
// ========================================================
// 概要:
// - ランディングの「課題提示」セクション（problem）
//
// 責務:
// - キャッチコピー + 補足文で「困りごと」を短く提示する
// - 次の「価値提案」セクションへ自然に繋げる導線にする
// ========================================================

import { Check, MessageCircle, NotebookPen, Timer } from "lucide-react";
import { Badge } from "@/frontend/shared/ui/shadcn/components/ui/badge";

export function ProblemSection() {
  return (
    <section
      id="problem"
      className="scroll-mt-24 py-16 md:pt-24"
      aria-label="problem"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid gap-14 md:grid-cols-2 md:gap-16">
          {/* 1) 左: 見出し + 補足 + バッジ */}
          <div className="space-y-5">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
              なんとなく、おいしい。
              <br />
              でも、理由がわからない。
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              同じ豆でも、日によって変わる。
              <br />
              よかった条件も、次の一杯までに忘れる。
            </p>

            <div className="flex flex-wrap gap-2 pt-2">
              <Badge variant="secondary" className="gap-2">
                <Timer className="size-4" />
                2〜5分で完了
              </Badge>
              <Badge variant="secondary" className="gap-2">
                <NotebookPen className="size-4" />
                メモから始める
              </Badge>
              <Badge variant="secondary" className="gap-2">
                <MessageCircle className="size-4" />
                質問で整理
              </Badge>
            </div>
          </div>

          {/* 2) 右: 具体的な困りごと（箇条書き風） */}
          <div className="space-y-3">
            <ProblemItem>記録が面倒で、だいたい頭の中で終わる</ProblemItem>
            <ProblemItem>おいしい以上の言葉が出てこない</ProblemItem>
            <ProblemItem>再現したいのに、勘に頼りがち</ProblemItem>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProblemItem({ children }: { children: string }) {
  return (
    <div className="rounded-2xl border bg-background p-5">
      <div className="flex items-center gap-3">
        <span className="mt-0.5 inline-flex size-8 items-center justify-center rounded-xl bg-muted">
          <Check className="size-4" />
        </span>
        <p className="leading-relaxed">{children}</p>
      </div>
    </div>
  );
}
