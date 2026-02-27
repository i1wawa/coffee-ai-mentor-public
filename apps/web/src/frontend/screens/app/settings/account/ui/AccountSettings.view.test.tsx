// apps/web/src/frontend/screens/app/settings/account/ui/AccountSettings.view.test.tsx
// ================================================================
// 概要:
// - AccountSettingsView のユニットテスト
//
// 契約:
// - useUserMe の状態に応じて表示を切り替える
// - 危険操作ボタンの有効/無効を正しく制御する
// - ボタン押下で各ダイアログの open 状態を切り替える
// - アカウント削除ダイアログへ再認証 provider を渡す
// ================================================================

import {
  buildErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AuthProvider } from "firebase/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOAuthProvider } from "@/frontend/features/auth/config/oauth-providers.config";
import { RevokeSessionDialog } from "@/frontend/features/auth/ui/RevokeSessionDialog";
import { useUserMe } from "@/frontend/features/users/model/use-user-me.hook";
import { AccountDeleteDialog } from "@/frontend/features/users/ui/AccountDeleteDialog";
import { toUiErrorFields } from "@/frontend/shared/errors/error-ui-action.mapper";
import { AccountSettingsView } from "./AccountSettings.view";

vi.mock("@/frontend/features/users/model/use-user-me.hook", () => {
  return {
    useUserMe: vi.fn(),
  };
});

vi.mock("@/frontend/features/auth/config/oauth-providers.config", () => {
  return {
    createOAuthProvider: vi.fn(),
  };
});

vi.mock("@/frontend/features/users/ui/AccountDeleteDialog", () => {
  return {
    AccountDeleteDialog: vi.fn(() => (
      <div data-testid="account-delete-dialog" />
    )),
  };
});

vi.mock("@/frontend/features/auth/ui/RevokeSessionDialog", () => {
  return {
    RevokeSessionDialog: vi.fn(() => (
      <div data-testid="revoke-session-dialog" />
    )),
  };
});

const replaceMock = vi.fn();

vi.mock("next/navigation", () => {
  return {
    useRouter: vi.fn(() => {
      return { replace: replaceMock };
    }),
  };
});

describe("screens/app/settings/account/ui AccountSettingsView", () => {
  type AccountDeleteDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    redirectTo: string;
    reauthProvider: AuthProvider;
  };

  type RevokeSessionDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    redirectTo: string;
  };

  const mockedUseUserMe = vi.mocked(useUserMe);
  const mockedCreateOAuthProvider = vi.mocked(createOAuthProvider);
  const mockedAccountDeleteDialog = vi.mocked(AccountDeleteDialog);
  const mockedRevokeSessionDialog = vi.mocked(RevokeSessionDialog);
  const refetchMock = vi.fn();
  const reauthProviderStub = {} as AuthProvider;

  function getLastRevokeSessionDialogProps():
    | RevokeSessionDialogProps
    | undefined {
    return mockedRevokeSessionDialog.mock.lastCall?.[0] as
      | RevokeSessionDialogProps
      | undefined;
  }

  function getLastAccountDeleteDialogProps():
    | AccountDeleteDialogProps
    | undefined {
    return mockedAccountDeleteDialog.mock.lastCall?.[0] as
      | AccountDeleteDialogProps
      | undefined;
  }

  beforeEach(() => {
    mockedUseUserMe.mockReset();
    mockedCreateOAuthProvider.mockReset();
    mockedAccountDeleteDialog.mockClear();
    mockedRevokeSessionDialog.mockClear();
    refetchMock.mockReset();
    replaceMock.mockReset();
  });

  it("読み込み中: ローディング表示を出し、危険操作ボタンを無効化する", () => {
    mockedCreateOAuthProvider.mockReturnValue(reauthProviderStub);
    mockedUseUserMe.mockReturnValue({
      userMe: null,
      isAuthenticated: false,
      isLoading: true,
      error: null,
      refetch: refetchMock,
    });

    render(<AccountSettingsView />);

    expect(screen.getByText("読み込み中です...")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "全端末サインアウト" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "アカウントを削除" }),
    ).toBeDisabled();
  });

  it("取得失敗: 共通エラーアラートを表示し、危険操作ボタンを無効化する", () => {
    mockedCreateOAuthProvider.mockReturnValue(reauthProviderStub);
    const retryError = toUiErrorFields(buildErrorFields(errorCode.UNAVAILABLE));
    mockedUseUserMe.mockReturnValue({
      userMe: null,
      isAuthenticated: false,
      isLoading: false,
      error: retryError,
      refetch: refetchMock,
    });

    render(<AccountSettingsView />);

    expect(screen.getByTestId("ui-error-alert")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByTestId("ui-error-support-id")).toBeNull();
    expect(
      screen.getByRole("button", { name: "全端末サインアウト" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "アカウントを削除" }),
    ).toBeDisabled();
  });

  it("未サインイン相当: sign-in へリダイレクトし、危険操作ボタンを無効化する", async () => {
    mockedCreateOAuthProvider.mockReturnValue(reauthProviderStub);
    mockedUseUserMe.mockReturnValue({
      userMe: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      refetch: refetchMock,
    });

    render(<AccountSettingsView />);

    expect(
      screen.getByText("サインイン状態を確認しています..."),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/sign-in");
    });
    expect(
      screen.getByRole("button", { name: "全端末サインアウト" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "アカウントを削除" }),
    ).toBeDisabled();
  });

  it("取得成功: uid を整形表示し、危険操作ボタンを有効化する", () => {
    mockedCreateOAuthProvider.mockReturnValue(reauthProviderStub);
    mockedUseUserMe.mockReturnValue({
      userMe: { uid: "  abcdefghijklmnop1234  " },
      isAuthenticated: true,
      isLoading: false,
      error: null,
      refetch: refetchMock,
    });

    render(<AccountSettingsView />);

    expect(screen.getByText("uid: abcdefgh…1234")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "全端末サインアウト" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "アカウントを削除" }),
    ).toBeEnabled();
  });

  it("全端末サインアウト: ボタン押下でダイアログを開き、close で閉じる", async () => {
    mockedCreateOAuthProvider.mockReturnValue(reauthProviderStub);
    mockedUseUserMe.mockReturnValue({
      userMe: { uid: "u1" },
      isAuthenticated: true,
      isLoading: false,
      error: null,
      refetch: refetchMock,
    });

    render(<AccountSettingsView />);

    const user = userEvent.setup();
    expect(getLastRevokeSessionDialogProps()).toMatchObject({
      open: false,
      redirectTo: "/sign-in",
    });
    await user.click(
      screen.getByRole("button", { name: "全端末サインアウト" }),
    );
    expect(getLastRevokeSessionDialogProps()).toMatchObject({
      open: true,
      redirectTo: "/sign-in",
    });

    const openedDialogProps = getLastRevokeSessionDialogProps();
    expect(openedDialogProps).toBeDefined();
    act(() => {
      openedDialogProps?.onOpenChange(false);
    });
    expect(getLastRevokeSessionDialogProps()).toMatchObject({ open: false });
  });

  it("アカウント削除: ボタン押下でダイアログを開き、provider を渡す", async () => {
    mockedCreateOAuthProvider.mockReturnValue(reauthProviderStub);
    mockedUseUserMe.mockReturnValue({
      userMe: { uid: "u1" },
      isAuthenticated: true,
      isLoading: false,
      error: null,
      refetch: refetchMock,
    });

    render(<AccountSettingsView />);

    const user = userEvent.setup();
    expect(getLastAccountDeleteDialogProps()).toMatchObject({
      open: false,
      redirectTo: "/sign-in",
    });
    await user.click(screen.getByRole("button", { name: "アカウントを削除" }));

    expect(mockedCreateOAuthProvider).toHaveBeenCalledWith("google");
    expect(getLastAccountDeleteDialogProps()).toMatchObject({
      open: true,
      reauthProvider: reauthProviderStub,
    });

    const openedDialogProps = getLastAccountDeleteDialogProps();
    expect(openedDialogProps).toBeDefined();
    expect(openedDialogProps?.redirectTo).toBe("/sign-in");
  });
});
