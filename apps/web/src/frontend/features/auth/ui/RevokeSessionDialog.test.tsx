// apps/web/src/frontend/features/auth/ui/RevokeSessionDialog.test.tsx
// ================================================================
// 概要:
// - RevokeSessionDialog のユニットテスト
//
// 契約:
// - 確認ボタンで revokeSession を呼ぶ
// - エラー文言/表示ルールの網羅は ui-error-presentation.test.ts に委譲する
// - このテストは RevokeSessionDialog 側の代表的なエラー分岐（SIGN_IN / RETRY / SUPPORT）を検証する
// - SIGN_IN は完了扱いで閉じる
// - RETRY は閉じずに共通エラー表示を出す（問い合わせIDは表示しない）
// - SUPPORT は共通エラー表示に問い合わせID（errorId）を表示する
// - 送信中は操作を無効化し、revokeSession を再実行しない
// - 失敗表示は close -> reopen でクリアされる
// ================================================================

"use client";

import {
  buildErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { err, ok } from "@packages/shared/src/result";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toUiErrorFields } from "@/frontend/shared/errors/error-ui-action.mapper";
import { useSignOut } from "../model/use-sign-out.hook";
import { RevokeSessionDialog } from "./RevokeSessionDialog";

vi.mock("../model/use-sign-out.hook", () => {
  return {
    useSignOut: vi.fn(),
  };
});

function renderDialog(args: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return render(
    <RevokeSessionDialog
      open={args.open}
      onOpenChange={args.onOpenChange}
      redirectTo="/sign-in/"
    />,
  );
}

describe("features/auth/ui RevokeSessionDialog", () => {
  const mockedUseSignOut = vi.mocked(useSignOut);
  const revokeSessionMock = vi.fn();

  beforeEach(() => {
    mockedUseSignOut.mockReset();
    revokeSessionMock.mockReset();
  });

  it("SIGN_IN: 失敗でも完了扱いで閉じる", async () => {
    const onOpenChange = vi.fn();
    revokeSessionMock.mockResolvedValue(
      err(toUiErrorFields(buildErrorFields(errorCode.AUTH_REQUIRED))),
    );
    mockedUseSignOut.mockReturnValue({
      isPending: false,
      signOut: vi.fn(),
      revokeSession: revokeSessionMock,
    });

    renderDialog({ open: true, onOpenChange });

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "全端末サインアウト" }),
    );

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("失敗: RETRY は閉じずに汎用エラーを表示し、問い合わせIDを表示しない", async () => {
    const onOpenChange = vi.fn();
    revokeSessionMock.mockResolvedValue(
      err(toUiErrorFields(buildErrorFields(errorCode.UNAVAILABLE))),
    );
    mockedUseSignOut.mockReturnValue({
      isPending: false,
      signOut: vi.fn(),
      revokeSession: revokeSessionMock,
    });

    renderDialog({ open: true, onOpenChange });

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "全端末サインアウト" }),
    );

    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(await screen.findByTestId("ui-error-alert")).toBeInTheDocument();
    expect(screen.queryByTestId("ui-error-support-id")).toBeNull();
  });

  it("失敗: SUPPORT は問い合わせID（errorId）を表示する", async () => {
    const onOpenChange = vi.fn();
    const supportError = toUiErrorFields(
      buildErrorFields(errorCode.INTERNAL_ERROR),
    );
    revokeSessionMock.mockResolvedValue(err(supportError));
    mockedUseSignOut.mockReturnValue({
      isPending: false,
      signOut: vi.fn(),
      revokeSession: revokeSessionMock,
    });

    renderDialog({ open: true, onOpenChange });

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "全端末サインアウト" }),
    );

    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(await screen.findByTestId("ui-error-alert")).toBeInTheDocument();
    expect(screen.getByTestId("ui-error-support-id").textContent).toBe(
      supportError.errorId,
    );
  });

  it("失敗表示: 閉じるとクリアされ、再オープン時に残らない", async () => {
    const onOpenChange = vi.fn();
    revokeSessionMock.mockResolvedValue(
      err(toUiErrorFields(buildErrorFields(errorCode.UNAVAILABLE))),
    );
    mockedUseSignOut.mockReturnValue({
      isPending: false,
      signOut: vi.fn(),
      revokeSession: revokeSessionMock,
    });

    const view = renderDialog({ open: true, onOpenChange });

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "全端末サインアウト" }),
    );
    expect(await screen.findByTestId("ui-error-alert")).toBeInTheDocument();

    view.rerender(
      <RevokeSessionDialog
        open={false}
        onOpenChange={onOpenChange}
        redirectTo="/sign-in/"
      />,
    );
    view.rerender(
      <RevokeSessionDialog
        open={true}
        onOpenChange={onOpenChange}
        redirectTo="/sign-in/"
      />,
    );

    expect(screen.queryByTestId("ui-error-alert")).toBeNull();
    expect(
      screen.getByText(
        "この端末を含むすべての端末でサインアウトします。続行しますか？",
      ),
    ).toBeInTheDocument();
  });

  it("送信中: ボタンを無効化し、revokeSession を再実行しない", async () => {
    const onOpenChange = vi.fn();
    revokeSessionMock.mockResolvedValue(ok(undefined));
    mockedUseSignOut.mockReturnValue({
      isPending: true,
      signOut: vi.fn(),
      revokeSession: revokeSessionMock,
    });

    renderDialog({ open: true, onOpenChange });

    const revokeButton = screen.getByRole("button", {
      name: "全端末サインアウト",
    });
    const cancelButton = screen.getByRole("button", { name: "キャンセル" });
    expect(revokeButton).toBeDisabled();
    expect(cancelButton).toBeDisabled();

    const user = userEvent.setup();
    await user.click(revokeButton);

    expect(revokeSessionMock).toHaveBeenCalledTimes(0);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("成功: revokeSession を呼び、閉じる", async () => {
    const onOpenChange = vi.fn();
    revokeSessionMock.mockResolvedValue(ok(undefined));
    mockedUseSignOut.mockReturnValue({
      isPending: false,
      signOut: vi.fn(),
      revokeSession: revokeSessionMock,
    });

    renderDialog({ open: true, onOpenChange });

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "全端末サインアウト" }),
    );

    expect(revokeSessionMock).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
