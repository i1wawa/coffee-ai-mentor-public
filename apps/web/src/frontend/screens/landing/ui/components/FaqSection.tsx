// apps/web/src/frontend/screens/landing/ui/components/FaqSection.tsx
// ========================================================
// 概要:
// - ランディングのFAQセクション（拾い読みできるアコーディオン）
//
// 責務:
// - FAQの文言と表示順を定義する
// - shadcn/radix の Accordion を使って表示する
//
// 非目的:
// - Accordion の開閉仕様・アクセシビリティ挙動の実装（shadcn/radix に委譲）
// ========================================================

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/frontend/shared/ui/shadcn/components/ui/accordion";

export function FaqSection() {
  return (
    <section id="faq" className="scroll-mt-24 py-16 md:py-24" aria-label="faq">
      <div className="mx-auto max-w-6xl px-6">
        <HeaderBlock
          eyebrow="FAQ"
          title="よくある質問"
          description="気になるところを拾い読み。"
        />

        <div className="mt-10">
          <Accordion type="multiple" className="w-full">
            <FaqItem
              value="q1"
              q="どれくらい時間がかかりますか？"
              a="目安は、記録が数分 + 必要なときだけAI会話です。忙しい日は短く、余裕がある日は深く、でOKです。"
            />
            <FaqItem
              value="q2"
              q="専門用語が分からなくても使えますか？"
              a="大丈夫です。まずは自分の言葉でOKです。AIと話しながら、少しずつ言葉が増えるイメージです。"
            />
            <FaqItem
              value="q3"
              q="ドリップ以外でも使えますか？"
              a="最初はドリップを想定していますが、記録の考え方自体は他の抽出方法にも応用できます。"
            />
            <FaqItem
              value="q4"
              q="サインインは必要ですか？"
              a="あとから振り返れるように、記録の保存のためにサインインをお願いしています。"
            />
          </Accordion>
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

function FaqItem({ value, q, a }: { value: string; q: string; a: string }) {
  return (
    <AccordionItem value={value} className="rounded-2xl border px-4">
      <AccordionTrigger className="text-left">{q}</AccordionTrigger>
      <AccordionContent className="text-muted-foreground leading-relaxed">
        {a}
      </AccordionContent>
    </AccordionItem>
  );
}
