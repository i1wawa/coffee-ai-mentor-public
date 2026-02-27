// apps/web/src/frontend/screens/landing/ui/Landing.view.test.tsx
// ========================================================
// 概要:
// - LandingView の最小スモークテスト
//
// 契約:
// - Hero 見出しが描画される
// - 主CTA（Googleでサインイン）が存在し、/sign-in にリンクする
// ========================================================

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LandingView } from "./Landing.view";

describe("LandingView", () => {
  it("renders hero headline", () => {
    // 1) arrange: ランディングを描画する
    // - ここが落ちる場合、import崩れや循環依存が起きている可能性が高い
    render(<LandingView />);

    // 2) assert: Heroの見出しが存在する
    // - Heroはページの最重要領域なので、存在確認だけは最低限残す
    expect(screen.getByText(/毎日のコーヒーが、/i)).toBeInTheDocument();

    // 3) assert: 主CTAが存在し、遷移先がサインインである
    // - marketingの導線が壊れていないことを確認する
    const signInLinks = screen.getAllByRole("link", {
      name: /Googleでサインイン/i,
    });
    expect(signInLinks[0]).toHaveAttribute("href", "/sign-in");
  });
});
