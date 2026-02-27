// apps/web/src/frontend/screens/landing/ui/components/ShowcaseStack.tsx
// ========================================================
// 概要:
// - ランディング右カラムに置く疑似UI（プロダクトショット）
//
// 責務:
// - 「今日の1杯」カードの見た目を描画する
// - 例示用のダミー文言・ダミー項目を並べる（Row含む）
// ========================================================

import { Coffee, Timer } from "lucide-react";
import { Badge } from "@/frontend/shared/ui/shadcn/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/frontend/shared/ui/shadcn/components/ui/card";

export function ShowcaseStack() {
  return (
    <div className="relative w-full max-w-xl">
      <div
        className="pointer-events-none absolute -inset-6 rounded-3xl bg-muted/40 blur-2xl"
        aria-hidden="true"
      />

      <div className="relative space-y-4">
        {/* 1) 上: 今日の1杯カード（主役） */}
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex size-9 items-center justify-center rounded-xl bg-muted">
                  <Coffee className="size-5" />
                </span>
                <div className="space-y-0.5">
                  <CardTitle className="text-base">今日の1杯</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    あとで編集できます。
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="gap-2">
                <Timer className="size-4" />
                2〜5分
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="space-y-3">
              <Row label="豆" value="エチオピア / ナチュラル" />
              <Row label="抽出" value="ハンドドリップ" />
              <Row label="第一印象" value="明るい酸味、後味すっきり" />
            </div>

            <div className="rounded-xl border bg-muted/25 p-4">
              <p className="text-sm leading-relaxed">
                AI:
                <br />
                その酸味、柑橘っぽい？ベリー寄り？
                <br />
                近い方を選んで、ひとこと足してみましょう。
              </p>
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>次の一歩</span>
              <span>挽き目を少し細かく</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-12 items-start gap-3">
      <div className="col-span-3 text-xs text-muted-foreground">{label}</div>
      <div className="col-span-9 text-sm">{value}</div>
    </div>
  );
}
