// apps/web/src/frontend/shared/errors/ui-error-alert.test.tsx
// ================================================================
// 概要:
// - UiErrorAlert のユニットテスト
// - エラー文言/表示ルールテストは代表的な表示分岐（非表示 / RETRY / SUPPORT）を検証する
//
// 契約:
// - shouldDisplay が false のエラーは表示しない
// - RETRY はエラー文言を表示し、サポートIDは表示しない
// - SUPPORT はサポートIDを表示し、コピー操作のフィードバックを表示する
// - action を指定したときは行動リンクを表示する
// ================================================================

import {
  buildErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  toUiErrorFields,
  UI_ERROR_ACTION,
  type UiErrorFields,
} from "./error-ui-action.mapper";
import { UiErrorAlert } from "./ui-error-alert";

describe("UiErrorAlert", () => {
  const supportError: UiErrorFields = {
    errorId: "support-error-id",
    errorCode: errorCode.INTERNAL_ERROR,
    uiErrorAction: UI_ERROR_ACTION.SUPPORT,
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shouldDisplay が false のエラーは表示しない", () => {
    const silentError = toUiErrorFields(buildErrorFields(errorCode.CANCELLED));

    render(<UiErrorAlert error={silentError} />);

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("error が null のときは表示しない", () => {
    render(<UiErrorAlert error={null} />);

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("clipboard API がない環境では失敗文言を表示し、その後に非表示へ戻る", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });

    render(<UiErrorAlert error={supportError} />);

    await user.click(
      screen.getByRole("button", { name: "サポートIDをコピー" }),
    );

    expect(
      screen.getAllByText("コピーできませんでした。手動でコピーしてください。")
        .length,
    ).toBeGreaterThan(0);

    await waitFor(
      () => {
        expect(
          screen.queryAllByText(
            "コピーできませんでした。手動でコピーしてください。",
          ),
        ).toHaveLength(0);
      },
      { timeout: 2500 },
    );
  });

  it("RETRY はエラー文言を表示し、サポートIDは表示しない", () => {
    const retryError = toUiErrorFields(buildErrorFields(errorCode.UNAVAILABLE));

    render(<UiErrorAlert error={retryError} />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("失敗しました")).toBeInTheDocument();
    expect(
      screen.getByText("時間をおいて再度お試しください。"),
    ).toBeInTheDocument();
    expect(screen.queryByText("サポートID")).toBeNull();
  });

  it("action を指定したときは行動リンクを表示する", () => {
    const retryError = toUiErrorFields(buildErrorFields(errorCode.UNAVAILABLE));

    render(
      <UiErrorAlert
        error={retryError}
        action={{ label: "再読み込み", href: "." }}
      />,
    );

    expect(screen.getByRole("link", { name: "再読み込み" })).toHaveAttribute(
      "href",
      ".",
    );
  });

  it("SUPPORT はサポートIDを表示し、コピー操作のフィードバックを表示する", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<UiErrorAlert error={supportError} />);

    expect(screen.getByText(supportError.errorId)).toBeInTheDocument();
    expect(
      screen.queryByText("サポートIDをコピーしました"),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "サポートIDをコピー" }),
    );

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(supportError.errorId);
    expect(screen.getByText("サポートIDをコピーしました")).toBeInTheDocument();

    await waitFor(
      () => {
        expect(screen.queryByText("サポートIDをコピーしました")).toBeNull();
      },
      { timeout: 2000 },
    );
  });

  it("コピー失敗時は失敗文言を表示し、その後に非表示へ戻る", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard failed"));
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<UiErrorAlert error={supportError} />);

    await user.click(
      screen.getByRole("button", { name: "サポートIDをコピー" }),
    );

    expect(
      screen.getAllByText("コピーできませんでした。手動でコピーしてください。")
        .length,
    ).toBeGreaterThan(0);

    await waitFor(
      () => {
        expect(
          screen.queryAllByText(
            "コピーできませんでした。手動でコピーしてください。",
          ),
        ).toHaveLength(0);
      },
      { timeout: 2500 },
    );
  });
});
