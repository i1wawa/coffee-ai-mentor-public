// apps/web/src/frontend/features/users/ui/AccountDeleteDialog.test.tsx
// ================================================================
// 概要:
// - AccountDeleteDialog のユニットテスト
//
// 契約:
// - 入力が DELETE のときだけ削除実行できる
// - PRECONDITION_FAILED は再認証導線に切り替える
// - 成功時は完了表示を経由して redirectTo へ遷移する
// - close -> reopen で入力/エラー/完了状態をリセットする
// - 送信中は操作を無効化し、再実行しない
// ================================================================

"use client";

import {
  buildErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { err, ok } from "@packages/shared/src/result";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AuthProvider } from "firebase/auth";
import { useRouter } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toUiErrorFields } from "@/frontend/shared/errors/error-ui-action.mapper";
import type { UiResult } from "@/frontend/shared/errors/ui-result";
import { useDeleteUserMeFlow } from "../model/use-delete-user-me-flow.hook";
import { AccountDeleteDialog } from "./AccountDeleteDialog";

vi.mock("next/navigation", () => {
  return {
    useRouter: vi.fn(),
  };
});

vi.mock("../model/use-delete-user-me-flow.hook", () => {
  return {
    useDeleteUserMeFlow: vi.fn(),
  };
});

const noop = () => {};

function renderDialog(args: {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  redirectTo?: string;
  reauthProvider?: AuthProvider;
}) {
  return render(
    <AccountDeleteDialog
      open={args.open}
      onOpenChange={args.onOpenChange ?? noop}
      redirectTo={args.redirectTo ?? "/sign-in/"}
      reauthProvider={args.reauthProvider ?? ({} as AuthProvider)}
    />,
  );
}

describe("features/users/ui AccountDeleteDialog", () => {
  const mockedUseDeleteUserMeFlow = vi.mocked(useDeleteUserMeFlow);
  const mockedUseRouter = vi.mocked(useRouter);
  const deleteOnceMock = vi.fn<() => Promise<UiResult<void>>>();
  const reauthenticateAndDeleteMock = vi.fn<() => Promise<UiResult<void>>>();
  const routerReplaceMock = vi.fn();
  const reauthProviderStub = {} as AuthProvider;

  beforeEach(() => {
    deleteOnceMock.mockReset();
    reauthenticateAndDeleteMock.mockReset();
    routerReplaceMock.mockReset();
    mockedUseDeleteUserMeFlow.mockReset();
    mockedUseRouter.mockReset();

    deleteOnceMock.mockResolvedValue(ok(undefined));
    reauthenticateAndDeleteMock.mockResolvedValue(ok(undefined));

    mockedUseDeleteUserMeFlow.mockReturnValue({
      isPending: false,
      deleteOnce: deleteOnceMock,
      reauthenticateAndDelete: reauthenticateAndDeleteMock,
    });

    mockedUseRouter.mockReturnValue({
      replace: routerReplaceMock,
    } as unknown as ReturnType<typeof useRouter>);
  });

  it("初期状態: 入力不一致では削除ボタンが無効", () => {
    renderDialog({
      open: true,
      reauthProvider: reauthProviderStub,
    });

    expect(mockedUseDeleteUserMeFlow).toHaveBeenCalledWith({
      reauthProvider: reauthProviderStub,
    });
    expect(
      screen.getByRole("button", { name: "アカウントを削除" }),
    ).toBeDisabled();
    expect(
      screen.getByText("入力が一致すると削除ボタンが有効になります"),
    ).toBeInTheDocument();
  });

  it("入力一致: DELETE 入力で deleteOnce を呼び出す", async () => {
    renderDialog({ open: true });

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("DELETE"), "DELETE");
    await user.click(screen.getByRole("button", { name: "アカウントを削除" }));

    expect(deleteOnceMock).toHaveBeenCalledTimes(1);
  });

  it("削除失敗: PRECONDITION_FAILED なら再認証導線に切り替わる", async () => {
    const preconditionError = toUiErrorFields(
      buildErrorFields(errorCode.PRECONDITION_FAILED),
    );
    deleteOnceMock.mockResolvedValue(err(preconditionError));

    renderDialog({ open: true });

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("DELETE"), "DELETE");
    await user.click(screen.getByRole("button", { name: "アカウントを削除" }));

    expect(
      await screen.findByText(
        "削除の前に再認証が必要です。再認証して続行してください。",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "再認証して続行" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "アカウントを削除" }),
    ).toBeNull();
  });

  it("再認証導線: 再認証して続行を押すと reauthenticateAndDelete を呼ぶ", async () => {
    const preconditionError = toUiErrorFields(
      buildErrorFields(errorCode.PRECONDITION_FAILED),
    );
    deleteOnceMock.mockResolvedValue(err(preconditionError));
    reauthenticateAndDeleteMock.mockResolvedValue(ok(undefined));

    renderDialog({ open: true });

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("DELETE"), "DELETE");
    await user.click(screen.getByRole("button", { name: "アカウントを削除" }));
    await user.click(
      await screen.findByRole("button", { name: "再認証して続行" }),
    );

    expect(reauthenticateAndDeleteMock).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole("heading", { name: "アカウントを削除しました" }),
    ).toBeInTheDocument();
  });

  it("削除失敗: PRECONDITION_FAILED 以外は共通エラーアラートを表示する", async () => {
    const unavailableError = toUiErrorFields(
      buildErrorFields(errorCode.UNAVAILABLE),
    );
    deleteOnceMock.mockResolvedValue(err(unavailableError));

    renderDialog({ open: true });

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("DELETE"), "DELETE");
    await user.click(screen.getByRole("button", { name: "アカウントを削除" }));

    expect(await screen.findByTestId("ui-error-alert")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByTestId("ui-error-support-id")).toBeNull();
    expect(screen.queryByRole("button", { name: "再認証して続行" })).toBeNull();
  });

  it("削除成功: 完了表示からサインイン画面へを押すと redirectTo へ遷移する", async () => {
    renderDialog({
      open: true,
      redirectTo: "/sign-in/",
    });

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("DELETE"), "DELETE");
    await user.click(screen.getByRole("button", { name: "アカウントを削除" }));
    await user.click(
      await screen.findByRole("button", { name: "サインイン画面へ" }),
    );

    expect(routerReplaceMock).toHaveBeenCalledTimes(1);
    expect(routerReplaceMock).toHaveBeenCalledWith("/sign-in/");
  });

  it("状態リセット: close -> reopen で入力とエラーと完了状態を初期化する", async () => {
    const unavailableError = toUiErrorFields(
      buildErrorFields(errorCode.UNAVAILABLE),
    );
    deleteOnceMock.mockResolvedValue(err(unavailableError));

    const view = renderDialog({ open: true });

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("DELETE"), "DELETE");
    await user.click(screen.getByRole("button", { name: "アカウントを削除" }));
    expect(await screen.findByTestId("ui-error-alert")).toBeInTheDocument();

    view.rerender(
      <AccountDeleteDialog
        open={false}
        onOpenChange={noop}
        redirectTo="/sign-in/"
        reauthProvider={reauthProviderStub}
      />,
    );
    view.rerender(
      <AccountDeleteDialog
        open={true}
        onOpenChange={noop}
        redirectTo="/sign-in/"
        reauthProvider={reauthProviderStub}
      />,
    );

    expect(screen.queryByTestId("ui-error-alert")).toBeNull();
    expect(screen.getByPlaceholderText("DELETE")).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "アカウントを削除" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("heading", { name: "アカウントを削除しました" }),
    ).toBeNull();
  });

  it("送信中: 入力と操作を無効化し、削除処理を再実行しない", async () => {
    mockedUseDeleteUserMeFlow.mockReturnValue({
      isPending: true,
      deleteOnce: deleteOnceMock,
      reauthenticateAndDelete: reauthenticateAndDeleteMock,
    });

    renderDialog({ open: true });

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText("DELETE");
    const cancelButton = screen.getByRole("button", { name: "キャンセル" });
    const deleteButton = screen.getByRole("button", {
      name: "アカウントを削除",
    });

    expect(input).toBeDisabled();
    expect(cancelButton).toBeDisabled();
    expect(deleteButton).toBeDisabled();

    await user.click(deleteButton);
    expect(deleteOnceMock).toHaveBeenCalledTimes(0);
    expect(reauthenticateAndDeleteMock).toHaveBeenCalledTimes(0);
  });
});
