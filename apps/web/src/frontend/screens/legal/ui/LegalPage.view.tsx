// apps/web/src/frontend/screens/legal/ui/LegalPage.view.tsx
// ========================================================
// 概要:
// - 利用規約・プライバシーポリシー画面
//
// 責務:
// - TermsSection / PrivacySection を組み合わせて表示する
// ========================================================

import { envClient } from "@/env.client";
import { PrivacySection } from "./components/PrivacySection";
import { TermsSection } from "./components/TermsSection";

const LAST_UPDATED = "2026-02-27";
const CONTACT_FORM_URL = envClient.NEXT_PUBLIC_CONTACT_FORM_URL ?? null;

export function LegalView() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 md:px-6 md:py-14">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          利用規約・プライバシーポリシー
        </h1>
        <p className="text-sm text-muted-foreground">
          最終更新日: {LAST_UPDATED}
        </p>
      </header>

      <TermsSection />
      <PrivacySection contactFormUrl={CONTACT_FORM_URL} />
    </div>
  );
}
