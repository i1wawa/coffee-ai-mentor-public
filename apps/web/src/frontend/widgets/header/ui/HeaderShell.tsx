// apps/web/src/frontend/widgets/header/ui/HeaderShell.tsx
// ========================================================
// 概要:
// - ヘッダーの共通シェル（sticky / 背景 / 余白）を提供する
//
// 責務:
// - ヘッダーの配置と基本スタイルを統一する
// - 内部コンテンツの描画枠を提供する
//
// 非目的:
// - ナビゲーションやボタンなど、具体的な中身は定義しない
// - 認証状態やルーティングなどのロジックは持たない
//
// 位置づけ（アーキテクチャ）:
// - frontend/widgets/header の UI 部品として、ページから利用される Client Component
// ========================================================

import type { ReactNode } from "react";
import { cn } from "@/frontend/shared/ui/shadcn/lib/utils";

type HeaderShellProps = {
  // ヘッダー内のコンテンツ
  children: ReactNode;

  // 追加クラス
  className?: string;
};

export function HeaderShell({ children, className }: HeaderShellProps) {
  return (
    <header
      className={cn(
        "sticky top-0 shrink-0 z-50 w-full border-b border-border/60 bg-background",
        className,
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4">
        {children}
      </div>
    </header>
  );
}
