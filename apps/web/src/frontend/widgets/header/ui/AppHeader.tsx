// apps/web/src/frontend/widgets/header/ui/AppHeader.tsx
// ========================================================
// 概要:
// - アプリ領域（/app 配下）で使うヘッダーコンポーネント
//
// 責務:
// - アプリの主要ナビゲーションを提供する
// - ユーザー操作（設定、モード切替など）を提供する
//
// 非目的:
// - マーケティング領域での利用を想定しない
// - 認証状態やルーティングロジックを持たない
//
// 位置づけ（アーキテクチャ）:
// - frontend/widgets/header の UI 部品として、ページから利用される Client Component
// ========================================================

"use client";

import { usePathname } from "next/navigation";
import { HeaderAuthControls } from "@/frontend/features/auth/ui/HeaderAuthControls";
import { HeaderBrand } from "@/frontend/widgets/header/ui/HeaderBrand";
import { HeaderShell } from "@/frontend/widgets/header/ui/HeaderShell";
import { ModeToggle } from "@/frontend/widgets/theme-toggle/ui/ModeToggle";

type AppHeaderProps = {
  // 現状ページに応じた見た目を変えたくなったとき用
  className?: string;
};

export function AppHeader({ className }: AppHeaderProps) {
  // 1) Next の usePathname で現在のルートを取得する（公式推奨）
  const pathname = usePathname();
  // 2) ルートのままならロゴのクリックを無効化して混乱を防ぐ
  const isHomePath = pathname === "/app";

  return (
    <HeaderShell className={className}>
      {isHomePath ? <HeaderBrand current /> : <HeaderBrand href="/app" />}

      <div className="flex items-center gap-3">
        {/* <Button type="button" size="sm" className="hidden md:inline-flex">
          記録する
        </Button> */}

        <ModeToggle />

        {/* サインイン状態に応じて サインイン / サインアウト を切り替える */}
        <HeaderAuthControls variant="app" />
      </div>
    </HeaderShell>
  );
}
