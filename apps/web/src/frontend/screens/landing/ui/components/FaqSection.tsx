// apps/web/src/frontend/screens/landing/ui/components/FaqSection.tsx
// ========================================================
// 概要:
// - ランディングのFAQセクション（拾い読みできる開閉リスト）
//
// 責務:
// - FAQの文言と表示順を定義する
// - details/summary を使ってシンプルに表示する
//
// 前提:
// - shadcn/radix の Accordion は CSP エラーになるため、自前で実装する
// ========================================================

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
          <div className="space-y-4">
            <FaqItem
              q="どれくらい時間がかかりますか？"
              a="目安は、記録が数分 + 必要なときだけAI会話です。忙しい日は短く、余裕がある日は深く、でOKです。"
            />
            <FaqItem
              q="専門用語が分からなくても使えますか？"
              a="大丈夫です。まずは自分の言葉でOKです。AIと話しながら、少しずつ言葉が増えるイメージです。"
            />
            <FaqItem
              q="ドリップ以外でも使えますか？"
              a="最初はドリップを想定していますが、記録の考え方自体は他の抽出方法にも応用できます。"
            />
            <FaqItem
              q="サインインは必要ですか？"
              a="あとから振り返れるように、記録の保存のためにサインインをお願いしています。"
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

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="group rounded-2xl border border-border open:border-border/80 open:bg-muted/10">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-4 py-4 text-left text-sm font-medium marker:hidden">
        <span>{q}</span>
        <span
          aria-hidden="true"
          className="text-muted-foreground group-open:rotate-180"
        >
          ▾
        </span>
      </summary>
      <div className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed">
        {a}
      </div>
    </details>
  );
}
