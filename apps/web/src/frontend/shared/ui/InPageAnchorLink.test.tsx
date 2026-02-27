// apps/web/src/frontend/shared/ui/InPageAnchorLink.test.tsx
// ========================================================
// 概要:
// - InPageAnchorLink のユニットテスト
//
// 契約:
// - basePath を含む href を生成する
// - 同一ページでは強制スクロールを実行する
// - 別ページでは通常遷移を妨げない
// ========================================================

import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { scrollToInPageAnchor } from "../lib/in-page-anchor-scroll";
import { InPageAnchorLink } from "./InPageAnchorLink";

vi.mock("../lib/in-page-anchor-scroll", () => {
  return {
    scrollToInPageAnchor: vi.fn(),
  };
});

describe("InPageAnchorLink", () => {
  const mockedScrollToInPageAnchor = vi.mocked(scrollToInPageAnchor);

  beforeEach(() => {
    mockedScrollToInPageAnchor.mockReset();
    mockedScrollToInPageAnchor.mockReturnValue(true);
    window.history.replaceState(null, "", "/");
  });

  it("basePath を含む href を生成する", () => {
    // 1) act: リンクを描画する
    render(
      <InPageAnchorLink anchorId="features" basePath="/">
        特徴を見る
      </InPageAnchorLink>,
    );

    // 2) assert: /#features を向く
    expect(screen.getByRole("link", { name: "特徴を見る" })).toHaveAttribute(
      "href",
      "/#features",
    );
  });

  it.each([
    { name: "空文字", anchorId: "" },
    { name: "空白のみ", anchorId: "   " },
    { name: "シャープ1文字", anchorId: "#" },
    { name: "シャープ複数", anchorId: "##" },
    { name: "空白 + シャープ + 空白", anchorId: "  #  " },
  ])("anchorId が$nameのとき href は basePath のみを生成する", ({
    anchorId,
  }) => {
    // 1) act: 空相当の anchorId で描画する
    render(
      <InPageAnchorLink anchorId={anchorId} basePath="/legal">
        利用規約
      </InPageAnchorLink>,
    );

    // 2) assert: 末尾の # を付けず /legal のみを向く
    expect(screen.getByRole("link", { name: "利用規約" })).toHaveAttribute(
      "href",
      "/legal",
    );
  });

  it("同一ページでは強制スクロールを実行する", async () => {
    // 1) arrange: ルートページ上で描画する
    window.history.replaceState(null, "", "/");
    render(
      <InPageAnchorLink anchorId="features" basePath="/">
        特徴を見る
      </InPageAnchorLink>,
    );

    // 2) act: クリックする
    const user = userEvent.setup();
    await user.click(screen.getByRole("link", { name: "特徴を見る" }));

    // 3) assert: 共通スクロール処理を使う
    expect(mockedScrollToInPageAnchor).toHaveBeenCalledTimes(1);
    expect(mockedScrollToInPageAnchor).toHaveBeenCalledWith("features");
  });

  it("同一ページかつ、anchorId が空白 + 有効IDのときは、有効IDへ正規化して強制スクロールを実行する", () => {
    // 1) arrange: /legal ページ上で描画する
    window.history.replaceState(null, "", "/legal");
    render(
      <InPageAnchorLink anchorId="  ##terms  " basePath="/legal">
        利用規約
      </InPageAnchorLink>,
    );
    const link = screen.getByRole("link", { name: "利用規約" });

    // 2) act: cancelable な click イベントを送る
    const clickEvent = createEvent.click(link, { button: 0 });
    fireEvent(link, clickEvent);

    // 3) assert: href と scroll 引数の両方で "terms" を使う
    expect(link).toHaveAttribute("href", "/legal#terms");
    expect(mockedScrollToInPageAnchor).toHaveBeenCalledTimes(1);
    expect(mockedScrollToInPageAnchor).toHaveBeenCalledWith("terms");
    expect(clickEvent.defaultPrevented).toBe(true);
  });

  it("/legal でも同一ページなら強制スクロールを実行する", async () => {
    // 1) arrange: /legal ページ上で描画する
    window.history.replaceState(null, "", "/legal");
    render(
      <InPageAnchorLink anchorId="terms" basePath="/legal">
        利用規約
      </InPageAnchorLink>,
    );

    // 2) act: クリックする
    const user = userEvent.setup();
    await user.click(screen.getByRole("link", { name: "利用規約" }));

    // 3) assert: /legal 上でも強制スクロールを使う
    expect(mockedScrollToInPageAnchor).toHaveBeenCalledTimes(1);
    expect(mockedScrollToInPageAnchor).toHaveBeenCalledWith("terms");
  });

  it("同一ページでスクロール実行時は通常遷移を抑止する", () => {
    // 1) arrange: ルートページ上で描画する
    window.history.replaceState(null, "", "/");
    render(
      <InPageAnchorLink anchorId="features" basePath="/">
        特徴を見る
      </InPageAnchorLink>,
    );
    const link = screen.getByRole("link", { name: "特徴を見る" });

    // 2) act: cancelable な click イベントを送る
    const clickEvent = createEvent.click(link, { button: 0 });
    fireEvent(link, clickEvent);

    // 3) assert: 同一ページ時は preventDefault で通常遷移を抑止する
    expect(mockedScrollToInPageAnchor).toHaveBeenCalledTimes(1);
    expect(clickEvent.defaultPrevented).toBe(true);
  });

  it("同一ページでも修飾キー付きクリックは既定挙動を優先する", () => {
    // 1) arrange: ルートページ上で描画する
    window.history.replaceState(null, "", "/");
    render(
      <InPageAnchorLink anchorId="features" basePath="/">
        特徴を見る
      </InPageAnchorLink>,
    );
    const link = screen.getByRole("link", { name: "特徴を見る" });

    // 2) act: ctrlKey 付きの click を送る
    const clickEvent = createEvent.click(link, { button: 0, ctrlKey: true });
    fireEvent(link, clickEvent);

    // 3) assert: 強制スクロールせず、通常遷移を妨げない
    expect(mockedScrollToInPageAnchor).toHaveBeenCalledTimes(0);
    expect(clickEvent.defaultPrevented).toBe(false);
  });

  it("リンクが別ページでは通常遷移を妨げない", async () => {
    // 1) arrange: /legal 上で描画する
    window.history.replaceState(null, "", "/legal");
    render(
      <InPageAnchorLink anchorId="features" basePath="/">
        特徴を見る
      </InPageAnchorLink>,
    );

    // 2) act: クリックする
    const user = userEvent.setup();
    await user.click(screen.getByRole("link", { name: "特徴を見る" }));

    // 3) assert: 強制スクロールは走らない
    expect(mockedScrollToInPageAnchor).toHaveBeenCalledTimes(0);
  });

  it("anchorId が空: 同一ページでも強制スクロールしない", () => {
    // 1) arrange: /legal ページ上で描画する
    window.history.replaceState(null, "", "/legal");
    render(
      <InPageAnchorLink anchorId="   " basePath="/legal">
        利用規約
      </InPageAnchorLink>,
    );
    const link = screen.getByRole("link", { name: "利用規約" });

    // 2) act: cancelable な click イベントを送る
    const clickEvent = createEvent.click(link, { button: 0 });
    fireEvent(link, clickEvent);

    // 3) assert: 強制スクロールはせず、通常遷移を妨げない
    expect(mockedScrollToInPageAnchor).toHaveBeenCalledTimes(0);
    expect(clickEvent.defaultPrevented).toBe(false);
  });
});
