// apps/web/src/frontend/shared/lib/in-page-anchor-scroll.ts
// ========================================================
// 概要:
// - ページ内アンカー移動を共通化する
//
// 責務:
// - 指定 id の要素へスクロールする
// - URL hash を更新する
// - reduced motion 設定時はアニメーションを抑える
// ========================================================

const REDUCED_MOTION_MEDIA_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * ページ内アンカーへスクロールして URL hash を同期する。
 * - 動きを減らす設定時は auto スクロールに切り替える（公式推奨）
 * - 画面位置とURL表示のズレを防ぐため hash を更新する
 *
 * @returns スクロールを実行できたら true、対象要素が無ければ false
 */
export function scrollToInPageAnchor(rawAnchorId: string): boolean {
  // 1) 先頭の # を除去し、前後空白を落として ID を比較しやすくする
  const normalizedAnchorId = rawAnchorId.replace(/^#/, "").trim();

  // 2) 空文字は有効な ID にならないため、何もせず終了する
  if (!normalizedAnchorId) {
    return false;
  }

  // 3) 対象要素を取得する
  const targetElement = document.getElementById(normalizedAnchorId);

  // 4) 要素が存在しない場合はスクロールできないので終了する
  if (!targetElement) {
    return false;
  }

  // 5) ユーザーが動きを減らす設定なら、即時スクロールへ切り替える（公式推奨）
  const useAutoScrollBehavior =
    typeof window.matchMedia === "function" &&
    window.matchMedia(REDUCED_MOTION_MEDIA_QUERY).matches;

  // 6) 同じ hash の再クリックでも毎回スクロールさせる
  targetElement.scrollIntoView({
    behavior: useAutoScrollBehavior ? "auto" : "smooth",
    block: "start",
  });

  // 7) URL 側の hash も現在の移動先に合わせて同期する
  window.history.replaceState(null, "", `#${normalizedAnchorId}`);
  return true;
}
