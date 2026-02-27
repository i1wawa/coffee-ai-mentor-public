// apps/web/src/app/(legal)/legal/layout.tsx
// ========================================================
// 概要:
// - 利用規約・プライバシーポリシー領域の共通レイアウト
//
// 責務:
// - 軽量なヘッダー（LegalHeader）を提供する
// - children（利用規約・プライバシーポリシーの内容）を描画する
// ========================================================

import type { ReactNode } from "react";
import { LegalHeader } from "@/frontend/widgets/header/ui/LegalHeader";

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <LegalHeader />
      <main className="flex flex-1 flex-col">{children}</main>
    </>
  );
}
