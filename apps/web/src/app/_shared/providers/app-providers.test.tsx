// apps/web/src/app/_shared/providers/app-providers.test.tsx
// ========================================================
// 概要:
// - AppProviders のユニットテスト
//
// 契約:
// - nonce を受け取った場合、ThemeProvider へ nonce を中継する
// - nonce が未指定（境界値）でも描画できる
// ========================================================

import { render } from "@testing-library/react";
import type * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryClient } from "@/tests/vitest-utils/utils/react-query";
import { AppProviders } from "./app-providers";

const mockGetQueryClient = vi.fn();
const mockThemeProvider = vi.fn();
const mockAuthCrossTabSync = vi.fn();

vi.mock("@/app/_shared/react-query/get-query-client", () => {
  return {
    getQueryClient: () => mockGetQueryClient(),
  };
});

vi.mock("./theme-provider", () => {
  return {
    ThemeProvider: (props: {
      children: React.ReactNode;
      nonce?: string;
      attribute: string;
      defaultTheme: string;
      enableSystem: boolean;
      enableColorScheme: boolean;
      disableTransitionOnChange: boolean;
    }) => {
      mockThemeProvider(props);
      return <div data-testid="theme-provider">{props.children}</div>;
    },
  };
});

vi.mock("./AuthCrossTabSync", () => {
  return {
    AuthCrossTabSync: () => {
      mockAuthCrossTabSync();
      return null;
    },
  };
});

describe("AppProviders", () => {
  beforeEach(() => {
    mockGetQueryClient.mockReset();
    mockThemeProvider.mockReset();
    mockAuthCrossTabSync.mockReset();
    mockGetQueryClient.mockReturnValue(createTestQueryClient());
  });

  it("nonce を受け取ったとき ThemeProvider へ nonce を渡す", () => {
    // 1) nonce ありで描画する
    render(
      <AppProviders nonce="test-nonce">
        <div>child</div>
      </AppProviders>,
    );

    // 2) ThemeProvider へ nonce が中継されることを確認する
    expect(mockThemeProvider).toHaveBeenCalledTimes(1);
    expect(mockThemeProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        enableColorScheme: false,
        nonce: "test-nonce",
      }),
    );
  });

  it("nonce 未指定（境界値）でも描画できる", () => {
    // 1) nonce なしで描画する
    const { getByText } = render(
      <AppProviders>
        <div>child</div>
      </AppProviders>,
    );

    // 2) 子要素が描画されることを確認する
    expect(getByText("child")).toBeInTheDocument();
    // 3) AuthCrossTabSync も描画されることを確認する
    expect(mockAuthCrossTabSync).toHaveBeenCalledTimes(1);
  });
});
