// apps/web/src/frontend/shared/lib/in-page-anchor-scroll.test.ts
// ========================================================
// 概要:
// - ページ内アンカースクロールのユーティリティテスト
//
// 契約:
// - 要素が存在するときは scrollIntoView を実行し、URL hash を更新する
// - 要素が存在しないときは false を返し、例外を出さない
// - reduced motion のときは behavior: auto を使う
// ========================================================

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { scrollToInPageAnchor } from "./in-page-anchor-scroll";

type MockMediaQueryList = {
  matches: boolean;
  media: string;
};

describe("scrollToInPageAnchor", () => {
  const originalMatchMedia = window.matchMedia;
  const replaceStateMock = vi.spyOn(window.history, "replaceState");

  beforeEach(() => {
    replaceStateMock.mockClear();
    window.matchMedia = vi.fn().mockImplementation((query: string) => {
      return {
        matches: false,
        media: query,
      } satisfies MockMediaQueryList as MediaQueryList;
    });
    document.body.innerHTML = "";
  });

  afterAll(() => {
    window.matchMedia = originalMatchMedia;
  });

  it("要素が存在するときは scrollIntoView を実行し hash を更新する", () => {
    // 1) arrange: アンカー要素を用意する
    document.body.innerHTML = '<section id="features"></section>';
    const anchorElement = document.getElementById("features");
    const scrollIntoViewMock = vi.fn();
    if (!anchorElement) {
      throw new Error("anchor element not found");
    }
    anchorElement.scrollIntoView = scrollIntoViewMock;

    // 2) act: スクロールを実行する
    const result = scrollToInPageAnchor("features");

    // 3) assert: スクロール成功 + hash 更新
    expect(result).toBe(true);
    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
    expect(replaceStateMock).toHaveBeenCalledWith(null, "", "#features");
  });

  it("要素が存在しないときは false を返して終了する", () => {
    // 1) act: 存在しない id を指定して実行する
    const result = scrollToInPageAnchor("missing");

    // 2) assert: 失敗を返し、history は更新しない
    expect(result).toBe(false);
    expect(replaceStateMock).toHaveBeenCalledTimes(0);
  });

  it("reduced motion 有効時は behavior: auto を使う", () => {
    // 1) arrange: reduced motion を有効にする
    window.matchMedia = vi.fn().mockImplementation((query: string) => {
      return {
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
      } satisfies MockMediaQueryList as MediaQueryList;
    });
    document.body.innerHTML = '<section id="features"></section>';
    const anchorElement = document.getElementById("features");
    const scrollIntoViewMock = vi.fn();
    if (!anchorElement) {
      throw new Error("anchor element not found");
    }
    anchorElement.scrollIntoView = scrollIntoViewMock;

    // 2) act: スクロールを実行する
    const result = scrollToInPageAnchor("features");

    // 3) assert: auto scroll を使う
    expect(result).toBe(true);
    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: "auto",
      block: "start",
    });
  });
});
