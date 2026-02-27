// apps/web/src/frontend/features/auth/ui/HeaderAuthControls.test.tsx
// ================================================================
// 概要:
// - HeaderAuthControls のユニットテスト
//
// 契約:
// - marketing: /sign-in ではサインイン導線を出さない
// - marketing: /sign-in 以外では /sign-in への導線を出す
// - app: loading 中は disabled のプレースホルダを出す
// - app: 認証済みならユーザーメニューを表示する
// - app: 認証済みなら設定導線を表示し、サインアウト項目を実行できる
// - app: signOut 送信中はメニュー操作を無効化する
// - app: RETRY は再試行ボタンを出し、RETRY 以外の error は表示しない
// ================================================================

import {
  buildErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { usePathname } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toUiErrorFields } from "@/frontend/shared/errors/error-ui-action.mapper";
import { useSessionUser } from "../model/use-session-user.hook";
import { useSignOut } from "../model/use-sign-out.hook";
import { HeaderAuthControls } from "./HeaderAuthControls";

vi.mock("next/navigation", () => {
  return {
    usePathname: vi.fn(),
  };
});

vi.mock("../model/use-session-user.hook", () => {
  return {
    useSessionUser: vi.fn(),
  };
});

vi.mock("../model/use-sign-out.hook", () => {
  return {
    useSignOut: vi.fn(),
  };
});

describe("HeaderAuthControls", () => {
  const mockedUsePathname = vi.mocked(usePathname);
  const mockedUseSessionUser = vi.mocked(useSessionUser);
  const mockedUseSignOut = vi.mocked(useSignOut);
  const signOutMock = vi.fn();
  const revokeSessionMock = vi.fn();

  beforeEach(() => {
    mockedUsePathname.mockReset();
    mockedUsePathname.mockReturnValue("/");
    mockedUseSessionUser.mockReset();
    signOutMock.mockReset();
    revokeSessionMock.mockReset();
    mockedUseSignOut.mockReset();
    mockedUseSignOut.mockReturnValue({
      isPending: false,
      signOut: signOutMock,
      revokeSession: revokeSessionMock,
    });
  });

  it("marketing: /sign-in ではサインイン導線を表示しない", () => {
    // 1) arrange: pathname を /sign-in にする
    mockedUsePathname.mockReturnValue("/sign-in");

    // 2) act: 描画
    render(<HeaderAuthControls variant="marketing" />);

    // 3) assert: サインイン link が存在しない
    // - sign-in 画面で同じ導線を出すと、ユーザーが混乱しやすい
    expect(screen.queryByRole("link", { name: /サインイン/i })).toBeNull();
  });

  it("marketing: /sign-in 配下でもサインイン導線を表示しない", () => {
    // 1) arrange: pathname を /sign-in 配下にする
    mockedUsePathname.mockReturnValue("/sign-in/reset");

    // 2) act: 描画
    render(<HeaderAuthControls variant="marketing" />);

    // 3) assert: サインイン link が存在しない
    expect(screen.queryByRole("link", { name: /サインイン/i })).toBeNull();
  });

  it("marketing: /sign-in 以外では /sign-in への導線を表示する", () => {
    // 1) arrange: pathname を / にする
    mockedUsePathname.mockReturnValue("/");

    // 2) act: 描画
    render(<HeaderAuthControls variant="marketing" />);

    // 3) assert: サインイン link が存在し、遷移先が /sign-in である
    const link = screen.getByRole("link", { name: /サインイン/i });
    expect(link).toHaveAttribute("href", "/sign-in");
  });

  it("app: 読み込み中は disabled のプレースホルダを表示する", () => {
    // 1) arrange: 読み込み中を再現する
    mockedUseSessionUser.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
      isRefetching: false,
      sessionUser: null,
      error: null,
      refetch: vi.fn(),
    });

    // 2) act: 描画
    render(<HeaderAuthControls variant="app" />);

    // 3) assert: クリックできないプレースホルダが出る
    // - 読み込み中に誤クリックが起きないようにする
    const button = screen.getByRole("button", { name: "..." });
    expect(button).toBeDisabled();
  });

  it("app: サインイン済みならユーザーメニューを表示する", () => {
    // 1) arrange: サインイン済みを再現する
    mockedUseSessionUser.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      isRefetching: false,
      sessionUser: { uid: "uid-1" },
      error: null,
      refetch: vi.fn(),
    });

    // 2) act: 描画
    render(<HeaderAuthControls variant="app" />);

    // 3) assert: ユーザーメニューのトリガーが描画される
    const trigger = screen.getByTestId("header-user-menu-trigger");
    expect(trigger).toBeEnabled();
  });

  it("app: サインイン済みなら設定導線を表示する", async () => {
    // 1) arrange: サインイン済みを再現する
    mockedUseSessionUser.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      isRefetching: false,
      sessionUser: { uid: "uid-1" },
      error: null,
      refetch: vi.fn(),
    });

    // 2) act: 描画
    render(<HeaderAuthControls variant="app" />);

    // 3) act: メニューを開く
    const user = userEvent.setup();
    const trigger = screen.getByTestId("header-user-menu-trigger");
    await user.click(trigger);

    // 4) assert: 設定導線が /app/settings/account を向く
    const settingsLink = screen.getByRole("menuitem", { name: "設定" });
    expect(settingsLink).toHaveAttribute("href", "/app/settings/account");
  });

  it("app: サインイン済みならサインアウトを実行できる", async () => {
    // 1) arrange: サインイン済みを再現する
    mockedUseSessionUser.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      isRefetching: false,
      sessionUser: { uid: "uid-1" },
      error: null,
      refetch: vi.fn(),
    });

    // 2) act: 描画
    render(<HeaderAuthControls variant="app" />);

    // 3) act: メニューを開いてサインアウト項目を押す
    const user = userEvent.setup();
    const trigger = screen.getByTestId("header-user-menu-trigger");
    await user.click(trigger);
    await user.click(screen.getByTestId("header-signout-item"));

    // 4) assert: hook が呼ばれる
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(revokeSessionMock).toHaveBeenCalledTimes(0);
    expect(mockedUseSignOut).toHaveBeenCalledWith({
      redirectTo: "/sign-in/",
    });
  });

  it("app: signOut 送信中はメニュートリガーを無効化して操作できない", async () => {
    // 1) arrange: サインイン済み + signOut 送信中を再現する
    mockedUseSessionUser.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      isRefetching: false,
      sessionUser: { uid: "uid-1" },
      error: null,
      refetch: vi.fn(),
    });
    mockedUseSignOut.mockReturnValue({
      isPending: true,
      signOut: signOutMock,
      revokeSession: revokeSessionMock,
    });

    // 2) act: 描画
    render(<HeaderAuthControls variant="app" />);

    // 3) assert: トリガーが無効化される
    const trigger = screen.getByTestId("header-user-menu-trigger");
    expect(trigger).toBeDisabled();

    // 4) act: 無効状態でクリックしてもメニューは開かない
    const user = userEvent.setup();
    await user.click(trigger);

    // 5) assert: サインアウト項目は disabled で、signOut は呼ばれない
    const signOutItem = screen.getByTestId("header-signout-item");
    expect(signOutItem).toHaveAttribute("aria-disabled", "true");
    expect(signOutItem).toHaveAttribute("data-disabled");
    expect(signOutMock).toHaveBeenCalledTimes(0);
  });

  it("app: RETRY のときは再試行ボタンを表示して refetch を呼ぶ", async () => {
    // 1) arrange: 再試行が必要なエラーを作る
    const refetchMock = vi.fn();
    const retryError = toUiErrorFields(buildErrorFields(errorCode.UNAVAILABLE));

    // 2) arrange: RETRY 状態を再現する
    mockedUseSessionUser.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      isRefetching: false,
      sessionUser: null,
      error: retryError,
      refetch: refetchMock,
    });

    // 3) act: 描画
    render(<HeaderAuthControls variant="app" />);

    // 4) act: 再試行ボタンを押す
    // - 実ユーザー操作に近い userEvent を使う（公式推奨）
    const user = userEvent.setup();
    const button = screen.getByRole("button", { name: /再試行/i });
    expect(button).toBeEnabled();
    await user.click(button);

    // 5) assert: refetch が呼ばれる
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });

  it("app: RETRY の再取得中は再試行ボタンを無効化して refetch を呼ばない", async () => {
    // 1) arrange: 再試行が必要なエラー + 再取得中を再現する
    const refetchMock = vi.fn();
    const retryError = toUiErrorFields(buildErrorFields(errorCode.UNAVAILABLE));
    mockedUseSessionUser.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      isRefetching: true,
      sessionUser: null,
      error: retryError,
      refetch: refetchMock,
    });

    // 2) act: 描画
    render(<HeaderAuthControls variant="app" />);

    // 3) assert: 再試行ボタンは disabled
    const button = screen.getByRole("button", { name: /再試行/i });
    expect(button).toBeDisabled();

    // 4) act: 無効状態でクリックしても refetch は呼ばれない
    const user = userEvent.setup();
    await user.click(button);

    // 5) assert: refetch は未実行
    expect(refetchMock).toHaveBeenCalledTimes(0);
  });

  it("app: 未サインインならサインイン導線を表示する", () => {
    // 1) arrange: 未サインイン状態を再現する
    mockedUseSessionUser.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      isRefetching: false,
      sessionUser: null,
      error: null,
      refetch: vi.fn(),
    });

    // 2) act: 描画
    render(<HeaderAuthControls variant="app" />);

    // 3) assert: サインイン導線が出る
    const link = screen.getByRole("link", { name: /サインイン/i });
    expect(link).toHaveAttribute("href", "/sign-in");
  });

  it("app: RETRY 以外の error なら認証導線を表示しない", () => {
    // 1) arrange: fallback 分岐に入る error を作る
    const supportError = toUiErrorFields(
      buildErrorFields(errorCode.INTERNAL_ERROR),
    );
    mockedUseSessionUser.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      isRefetching: false,
      sessionUser: null,
      error: supportError,
      refetch: vi.fn(),
    });

    // 2) act: 描画
    render(<HeaderAuthControls variant="app" />);

    // 3) assert: ヘッダー認証UIは表示しない
    expect(screen.queryByRole("link", { name: /サインイン/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /再試行/i })).toBeNull();
    expect(screen.queryByTestId("header-user-menu-trigger")).toBeNull();
  });
});
