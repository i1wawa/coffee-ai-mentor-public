// apps/web/src/frontend/widgets/header/ui/LegalHeader.tsx
// ========================================================
// 概要:
// - 法務ページ（/legal）専用の軽量ヘッダー
//
// 責務:
// - ブランド導線（/）と、ページ内アンカー導線を提供する
// ========================================================

import Link from "next/link";
import { HeaderBrand } from "./HeaderBrand";
import { HeaderShell } from "./HeaderShell";

type LegalHeaderProps = {
  className?: string;
};

export function LegalHeader({ className }: LegalHeaderProps) {
  return (
    <HeaderShell className={className}>
      <div className="flex font-medium items-center gap-6">
        <HeaderBrand href="/" />

        <nav
          className="hidden items-center gap-6 md:flex"
          aria-label="法務ページ内リンク"
        >
          <Link
            href="/legal#terms"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            利用規約
          </Link>
          <Link
            href="/legal#privacy"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            プライバシーポリシー
          </Link>
        </nav>
      </div>
    </HeaderShell>
  );
}
