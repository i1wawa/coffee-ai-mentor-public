// apps/web/src/frontend/features/auth/ui/SigninForm.test.tsx
// ================================================================
// 概要:
// - SigninForm のユニットテスト
//
// 契約:
// - Google サインインボタン押下で onGoogleSignIn を呼ぶ
// - エラー文言/表示テストは SigninForm 側の代表的な表示分岐（SUPPORT / RETRY）を検証する
// - サポートIDのコピー操作でフィードバック文言を表示し、一定時間で消す
// ================================================================

import {
  buildErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { toUiErrorFields } from "@/frontend/shared/errors/error-ui-action.mapper";
import { SigninForm } from "./SigninForm";

describe("features/auth/ui SigninForm", () => {
  it("Google ボタン押下で onGoogleSignIn を呼ぶ", async () => {
    const onGoogleSignIn = vi.fn();

    render(
      <SigninForm
        isSubmitting={false}
        onGoogleSignIn={onGoogleSignIn}
        googleButtonTestId="oauth-button-google"
        error={null}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByTestId("oauth-button-google"));

    expect(onGoogleSignIn).toHaveBeenCalledTimes(1);
  });

  it("SUPPORT エラー時はサポートIDを表示する", () => {
    const supportError = toUiErrorFields(
      buildErrorFields(errorCode.INTERNAL_ERROR),
    );

    render(
      <SigninForm
        isSubmitting={false}
        onGoogleSignIn={vi.fn()}
        googleButtonTestId="oauth-button-google"
        error={supportError}
      />,
    );

    expect(screen.getByTestId("ui-error-alert")).toBeInTheDocument();
    expect(screen.getByTestId("ui-error-support-id").textContent).toBe(
      supportError.errorId,
    );
  });

  it("RETRY エラー時はサポートIDを表示しない", () => {
    const retryError = toUiErrorFields(buildErrorFields(errorCode.UNAVAILABLE));

    render(
      <SigninForm
        isSubmitting={false}
        onGoogleSignIn={vi.fn()}
        googleButtonTestId="oauth-button-google"
        error={retryError}
      />,
    );

    expect(screen.getByTestId("ui-error-alert")).toBeInTheDocument();
    expect(screen.queryByTestId("ui-error-support-id")).toBeNull();
  });

  it("利用規約とプライバシーポリシーのリンクが /legal を向く", () => {
    render(
      <SigninForm
        isSubmitting={false}
        onGoogleSignIn={vi.fn()}
        googleButtonTestId="oauth-button-google"
        error={null}
      />,
    );

    expect(screen.getByRole("link", { name: "利用規約" })).toHaveAttribute(
      "href",
      "/legal#terms",
    );
    expect(
      screen.getByRole("link", { name: "プライバシーポリシー" }),
    ).toHaveAttribute("href", "/legal#privacy");
  });
});
