// apps/web/src/frontend/widgets/header/ui/AuthHeader.tsx
// ========================================================
// 概要:
// - 認証領域用の軽いヘッダー
// - ランディングの情報量を持ち込まず、現在地を明確にする
// ========================================================

"use client";

import { HeaderBrand } from "@/frontend/widgets/header/ui/HeaderBrand";
import { HeaderShell } from "@/frontend/widgets/header/ui/HeaderShell";
import { ModeToggle } from "@/frontend/widgets/theme-toggle/ui/ModeToggle";

type AuthHeaderProps = {
  className?: string;
};

export function AuthHeader({ className }: AuthHeaderProps) {
  return (
    <HeaderShell className={className}>
      <div className="flex items-center gap-3">
        <HeaderBrand href="/" />
      </div>

      <div className="flex items-center gap-3">
        <ModeToggle />
      </div>
    </HeaderShell>
  );
}
