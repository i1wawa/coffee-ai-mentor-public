// apps/web/src/frontend/widgets/header/ui/MarketingHeader.tsx
// ========================================================
// 概要:
// - マーケティングページ用のヘッダー（導線・ナビ）
//
// 責務:
// - ロゴ、ページ内アンカーへのナビ、テーマ切り替え、サインイン導線を表示する
//
// 非目的:
// - 認証状態の判定、現在地ハイライト、ルーティング制御は扱わない
//
// 位置づけ（アーキテクチャ）:
// - frontend/widgets/header の UI 部品。マーケティングページから利用する Client Component
// ========================================================

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HeaderAuthControls } from "@/frontend/features/auth/ui/HeaderAuthControls";
import { cn } from "@/frontend/shared/ui/shadcn/lib/utils";
import { HeaderBrand } from "@/frontend/widgets/header/ui/HeaderBrand";
import { HeaderShell } from "@/frontend/widgets/header/ui/HeaderShell";
import { ModeToggle } from "@/frontend/widgets/theme-toggle/ui/ModeToggle";

type MarketingHeaderProps = {
  // 現状ページに応じた見た目を変えたくなったとき用
  className?: string;
};

function NavLink({
  href,
  children,
}: {
  // 遷移先
  href: string;
  // 表示名
  children: React.ReactNode;
}) {
  // 1) marketing は現在地ハイライトを厳密にしなくてOKにしておく
  return (
    <Link
      href={href}
      className={cn(
        "text-sm text-muted-foreground transition-colors hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

export function MarketingHeader({ className }: MarketingHeaderProps) {
  // 1) Next の usePathname で現在のルートを取得する（公式推奨）
  const pathname = usePathname();
  // 2) ルートのままならロゴのクリックを無効化して混乱を防ぐ
  const isHomePath = pathname === "/";

  return (
    <HeaderShell className={className}>
      <div className="flex font-medium items-center gap-6">
        {isHomePath ? (
          <>
            <HeaderBrand current />

            <nav className="hidden items-center gap-6 md:flex">
              <NavLink href="/#features">特徴</NavLink>
            </nav>
          </>
        ) : (
          <HeaderBrand href="/" />
        )}
      </div>

      <div className="flex items-center gap-5">
        {/* サインイン状態に応じて サインイン / サインアウト を切り替える */}
        <HeaderAuthControls variant="marketing" />

        <ModeToggle />
      </div>
    </HeaderShell>
  );
}
