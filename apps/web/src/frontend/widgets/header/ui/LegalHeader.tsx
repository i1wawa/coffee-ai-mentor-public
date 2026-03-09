// apps/web/src/frontend/widgets/header/ui/LegalHeader.tsx
// ========================================================
// 概要:
// - 法務ページ（/legal）専用の軽量ヘッダー
//
// 責務:
// - ブランド導線（/）と、ページ内アンカー導線を提供する
// ========================================================

import { InPageAnchorLink } from "@/frontend/shared/ui/InPageAnchorLink";
import { ModeToggle } from "@/frontend/widgets/theme-toggle/ui/ModeToggle";
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
          <InPageAnchorLink
            anchorId="terms"
            basePath="/legal"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            利用規約
          </InPageAnchorLink>
          <InPageAnchorLink
            anchorId="privacy"
            basePath="/legal"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            プライバシーポリシー
          </InPageAnchorLink>
        </nav>
      </div>

      <div className="flex items-center gap-3">
        <ModeToggle />
      </div>
    </HeaderShell>
  );
}
