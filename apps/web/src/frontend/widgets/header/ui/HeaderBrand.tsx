// apps/web/src/frontend/widgets/header/ui/HeaderBrand.tsx
// ========================================================
// 概要:
// - ヘッダーのブランド表示（ロゴ + サービス名）の共通 UI
//
// 責務:
// - リンク版と現在地表示版の見た目を共通化する
// - 画面幅の影響でブランド名が縮んだり折り返したりしにくくする
//
// 非目的:
// - ナビゲーション項目や操作ボタンは扱わない
// ========================================================

import Link from "next/link";
import { cn } from "@/frontend/shared/ui/shadcn/lib/utils";

type HeaderBrandProps = {
  // 遷移先
  href?: string;
  // 現在地として表示するか
  current?: boolean;
  // 追加クラス
  className?: string;
};

export function HeaderBrand({
  href,
  current = false,
  className,
}: HeaderBrandProps) {
  // 1) ブランド表示の見た目を共通化する
  // 2) shrink-0 / whitespace-nowrap でナビ追加時の幅圧縮の影響を減らす
  const brandClassName = cn(
    "flex shrink-0 items-center gap-3 font-medium",
    className,
  );

  const brandChildren = (
    <>
      <span className="inline-block size-6 rounded bg-muted" />
      <span className="whitespace-nowrap">Coffee AI Mentor</span>
    </>
  );

  // 3) 現在地ではクリック可能にしない（既存方針を維持）
  if (current) {
    return (
      <div className={brandClassName} aria-current="page">
        {brandChildren}
      </div>
    );
  }

  // 4) 通常はホームやアプリホームへの導線として表示する
  return (
    <Link href={href ?? "/"} className={brandClassName}>
      {brandChildren}
    </Link>
  );
}
