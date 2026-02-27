// apps/web/src/frontend/shared/ui/InPageAnchorLink.tsx
// ========================================================
// 概要:
// - ページ内アンカー遷移を統一する共通 Link
//
// 責務:
// - 同じ hash を連続クリックしてもスクロールを再実行する
// - 別ページでは通常遷移を妨げない
// - 修飾キー付きクリック時は既定挙動を維持する
// ========================================================

"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import { scrollToInPageAnchor } from "@/frontend/shared/lib/in-page-anchor-scroll";

type InPageAnchorLinkProps = {
  anchorId: string;
  basePath: string;
  children: ReactNode;
  className?: string;
};

/**
 * 正規化されたパスを返す
 * - trim で空白を削除
 * - 空文字や "/" の場合は "/" を返す
 * - 末尾のスラッシュを削除する
 */
function normalizePath(path: string): string {
  const trimmedPath = path.trim();
  if (!trimmedPath || trimmedPath === "/") {
    return "/";
  }
  return trimmedPath.replace(/\/+$/, "");
}

export function InPageAnchorLink({
  anchorId,
  basePath,
  children,
  className,
}: InPageAnchorLinkProps) {
  // 1) anchorId の前後空白と先頭の # を削除して正規化する
  const normalizedAnchorId = anchorId.trim().replace(/^#+/, "");
  const hasAnchorId = normalizedAnchorId.length > 0;

  // 2) basePath を正規化して href を生成する
  const normalizedBasePath = normalizePath(basePath);
  const href = hasAnchorId
    ? `${normalizedBasePath}#${normalizedAnchorId}`
    : normalizedBasePath;

  return (
    <Link
      href={href}
      className={className}
      // 3) クリック時、アンカー要素(<a>)のマウスイベントとして、スクロール処理を実行する
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        // 3-1) 修飾キー付きクリック（Cmd/Ctrl/Shift/Altなど）はブラウザ既定の操作を優先する
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }

        // 3-2) 無効な anchorId は強制スクロールを行わず通常遷移に任せる
        if (!hasAnchorId) {
          return;
        }

        // 3-3) 別ページからの遷移では Next.js の通常遷移を使う
        if (normalizePath(window.location.pathname) !== normalizedBasePath) {
          return;
        }

        // 3-4) 同一ページでは強制スクロールで再クリックにも対応する
        const didScroll = scrollToInPageAnchor(normalizedAnchorId);
        if (didScroll) {
          // スクロール処理を実行した場合は、ブラウザのデフォルトのアンカー遷移を防止する
          event.preventDefault();
        }
      }}
    >
      {children}
    </Link>
  );
}
