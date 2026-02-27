// apps/web/src/frontend/widgets/theme-toggle/ui/ModeToggle.test.tsx
// ================================================================
// 概要:
// - ModeToggle のユニットテスト
//
// 契約:
// - トリガー操作でメニューが開く
// - 選択操作で next-themes の setTheme が呼ばれる
// - next-themes の内部挙動や見た目の細部（className 等）は検証しない
// ================================================================

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useTheme } from "next-themes";
import type { SetStateAction } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ModeToggle } from "./ModeToggle";

// ---------------------------------------------------------------
// モック: next-themes
// - setTheme が呼ばれることだけ確認する
// ---------------------------------------------------------------

vi.mock("next-themes", () => {
  return {
    useTheme: vi.fn(),
  };
});

// ---------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------

describe("ModeToggle", () => {
  const mockedUseTheme = vi.mocked(useTheme);
  const setThemeMock = vi.fn<(value: SetStateAction<string>) => void>();

  beforeEach(() => {
    mockedUseTheme.mockReset();
    setThemeMock.mockReset();
    mockedUseTheme.mockReturnValue({
      theme: "light",
      resolvedTheme: "light",
      setTheme: setThemeMock,
      themes: ["light", "dark", "system"],
      systemTheme: "light",
    });
  });

  it("メニューを開いて選択すると setTheme を呼ぶ", async () => {
    // 1) arrange: ユーザー操作用の driver を作る
    const user = userEvent.setup();

    // 2) act: 描画する
    render(<ModeToggle />);

    // 3) assert: トリガーボタンが存在する
    // - sr-only の文言をアクセシブルネームとして使う
    const trigger = screen.getByRole("button", { name: /toggle theme/i });

    // 4) act: メニューを開く
    await user.click(trigger);

    // 5) assert: 選択肢が見える
    // - 表示は変わりやすいので、最低限の文言の存在だけ見る
    expect(screen.getByText("Light")).toBeInTheDocument();
    expect(screen.getByText("Dark")).toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();

    // 6) act: Dark を選ぶ
    await user.click(screen.getByText("Dark"));

    // 7) assert: setTheme が呼ばれる
    expect(setThemeMock).toHaveBeenCalledTimes(1);
    expect(setThemeMock).toHaveBeenCalledWith("dark");
  });
});
