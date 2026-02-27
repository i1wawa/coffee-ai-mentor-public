// apps/web/src/frontend/widgets/footer/ui/SiteFooter.tsx
// ========================================================
// 概要:
// - 全ページ共通で表示するフッター
//
// 責務:
// - 利用規約、プライバシーポリシー、お問い合わせへの導線を提供する
// ========================================================

import Link from "next/link";
import { envClient } from "@/env.client";

export function SiteFooter() {
  const currentYear = new Date().getFullYear();
  const contactFormUrl = envClient.NEXT_PUBLIC_CONTACT_FORM_URL ?? null;

  return (
    <footer className="border-t border-border/60 mt-auto">
      <div className="mx-auto w-full max-w-6xl space-y-3 px-4 py-4 text-xs text-muted-foreground md:px-6">
        <nav
          aria-label="フッター法務リンク"
          className="flex flex-wrap items-center justify-start gap-x-4 gap-y-2"
        >
          <Link
            href="/legal#terms"
            className="whitespace-nowrap underline underline-offset-4"
          >
            利用規約
          </Link>
          <Link
            href="/legal#privacy"
            className="whitespace-nowrap underline underline-offset-4"
          >
            プライバシーポリシー
          </Link>
          {contactFormUrl ? (
            <Link
              href={contactFormUrl}
              className="whitespace-nowrap underline underline-offset-4"
              target="_blank"
              rel="noopener noreferrer"
            >
              お問い合わせ
            </Link>
          ) : (
            <Link
              href="/legal#privacy"
              className="whitespace-nowrap underline underline-offset-4"
            >
              お問い合わせ
            </Link>
          )}
        </nav>

        <p className="whitespace-nowrap text-[11px] leading-6 text-muted-foreground/90">
          {`@ ${currentYear} Coffee AI Mentor`}
        </p>
      </div>
    </footer>
  );
}
