// apps/web/src/frontend/screens/sign-in/ui/SignIn.view.test.tsx
// ================================================================
// 概要:
// - SignIn Screen（Client View）のユニットテスト
//
// 契約:
// - OAuthボタン押下で model が { providerId } を受けて呼ばれる
// - 実行中はボタンが disabled になり、連打しても1回しか呼ばれない
// - 失敗時は共通表示ルールでエラーを表示し、遷移しない
// ================================================================

import {
  buildErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { err, ok } from "@packages/shared/src/result";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { publishAuthSignedIn } from "@/frontend/entities/session/lib/cross-tab-auth-events";
import { signInWithPopupAndIssueSessionCookie } from "@/frontend/features/auth/model/sign-in-with-popup";
import { toUiErrorFields } from "@/frontend/shared/errors/error-ui-action.mapper";
import { SignInView } from "./SignIn.view";

const oauthProviderUiItemByProviderId = vi.hoisted(() => {
  return {
    providerId: "google",
    buttonLabel: "Googleで続行",
    buttonTestId: "oauth-button-google",
  } as const;
});

// config をモックする
vi.mock("@/frontend/features/auth/config/oauth-provider-ui.config", () => {
  const byProviderId = {
    google: oauthProviderUiItemByProviderId,
  } as const;

  return {
    OAUTH_PROVIDER_UI_ITEM_BY_PROVIDER_ID: byProviderId,
    OAUTH_PROVIDER_UI_ITEMS: Object.values(byProviderId),
  };
});

// model をモックする
vi.mock("@/frontend/features/auth/model/sign-in-with-popup", () => {
  return {
    signInWithPopupAndIssueSessionCookie: vi.fn(),
  };
});

vi.mock("@/frontend/entities/session/lib/cross-tab-auth-events", () => {
  return {
    publishAuthSignedIn: vi.fn(),
  };
});

// router をモックする
const replaceMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("next/navigation", () => {
  return {
    useRouter: vi.fn(() => {
      return {
        replace: replaceMock,
        refresh: refreshMock,
      };
    }),
  };
});

describe("SignInViewClient", () => {
  const mockedSignIn = vi.mocked(signInWithPopupAndIssueSessionCookie);
  const mockedPublishAuthSignedIn = vi.mocked(publishAuthSignedIn);

  beforeEach(() => {
    mockedSignIn.mockReset();
    mockedPublishAuthSignedIn.mockReset();
    replaceMock.mockReset();
    refreshMock.mockReset();
  });

  it("二重送信防止: 実行中はボタンがdisabledになり、連打しても1回しか呼ばれない", async () => {
    // 1) resolveを遅延させて「実行中」を作る
    let resolveFn: (value?: void | PromiseLike<void>) => void = () => {};
    const pending = new Promise<void>((resolve) => {
      resolveFn = resolve;
    });

    mockedSignIn.mockImplementation(async () => {
      await pending;
      return ok(undefined);
    });

    // 2) 描画
    render(<SignInView />);

    const user = userEvent.setup();
    const button = screen.getByTestId("oauth-button-google");

    // 3) 連打（同一tickで複数回押す）
    const click1 = user.click(button);
    const click2 = user.click(button);
    await Promise.all([click1, click2]);

    // 4) 1回しか呼ばれない（二重送信防止）
    expect(mockedSignIn).toHaveBeenCalledTimes(1);

    // 5) 実行中はdisabled
    expect((button as HTMLButtonElement).disabled).toBe(true);

    // 6) 後始末：resolveして落ち着かせる
    resolveFn();
  });

  it("失敗: CANCELLED はエラーを表示しない", async () => {
    // 1) model失敗を返す
    const errorFields = buildErrorFields(errorCode.CANCELLED);
    mockedSignIn.mockResolvedValue(err(toUiErrorFields(errorFields)));

    // 2) 描画
    render(<SignInView />);

    // 3) 押下
    const user = userEvent.setup();
    await user.click(screen.getByTestId("oauth-button-google"));

    // 4) エラー表示は出ない
    expect(screen.queryByTestId("ui-error-alert")).toBeNull();

    // 5) 失敗時は遷移しない
    expect(replaceMock).toHaveBeenCalledTimes(0);
    expect(mockedPublishAuthSignedIn).toHaveBeenCalledTimes(0);
  });

  it("失敗: SUPPORT は errorId を表示する（原因追跡）", async () => {
    // 1) model失敗（SUPPORT）を返す
    const errorFields = buildErrorFields(errorCode.INTERNAL_ERROR);
    mockedSignIn.mockResolvedValue(err(toUiErrorFields(errorFields)));

    // 2) 描画
    render(<SignInView />);

    // 3) 押下
    const user = userEvent.setup();
    await user.click(screen.getByTestId("oauth-button-google"));

    // 4) エラー表示が出る（何も起きない事故を防ぐ）
    expect(screen.getByTestId("ui-error-alert")).toBeTruthy();

    // 5) errorId が表示される（問い合わせ/追跡用）
    const errorIdNode = await screen.findByTestId("ui-error-support-id");
    expect(errorIdNode.textContent).toBe(errorFields.errorId);

    // 6) 失敗時は遷移しない
    expect(replaceMock).toHaveBeenCalledTimes(0);
    expect(mockedPublishAuthSignedIn).toHaveBeenCalledTimes(0);
  });

  it("失敗: RETRY は errorId を表示しない", async () => {
    // 1) model失敗（RETRY）を返す
    const errorFields = buildErrorFields(errorCode.UNAVAILABLE);
    mockedSignIn.mockResolvedValue(err(toUiErrorFields(errorFields)));

    // 2) 描画
    render(<SignInView />);

    // 3) 押下
    const user = userEvent.setup();
    await user.click(screen.getByTestId("oauth-button-google"));

    // 4) エラー表示は出る
    expect(screen.getByTestId("ui-error-alert")).toBeTruthy();

    // 5) SUPPORT 以外は errorId を表示しない
    expect(screen.queryByTestId("ui-error-support-id")).toBeNull();
  });

  it("再試行: 失敗後の成功でエラー表示が消える", async () => {
    // 1) 失敗後に成功する結果を返す
    const errorFields = buildErrorFields(errorCode.INTERNAL_ERROR);
    mockedSignIn
      .mockResolvedValueOnce(err(toUiErrorFields(errorFields)))
      .mockResolvedValueOnce(ok(undefined));

    // 2) 描画
    render(<SignInView />);

    // 3) 失敗させてエラーを出す
    const user = userEvent.setup();
    await user.click(screen.getByTestId("oauth-button-google"));
    expect(screen.getByTestId("ui-error-alert")).toBeTruthy();

    // 4) 再試行して成功させる
    await user.click(screen.getByTestId("oauth-button-google"));

    // 5) エラー表示は消える
    await waitFor(() => {
      expect(screen.queryByTestId("ui-error-alert")).toBeNull();
    });

    // 6) 成功時は遷移する
    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(mockedPublishAuthSignedIn).toHaveBeenCalledTimes(1);
  });

  it("成功: Googleボタン押下でmodelが呼ばれ、/appへ遷移する", async () => {
    // 1) model成功を返す
    mockedSignIn.mockResolvedValue(ok(undefined));

    // 2) 描画
    render(<SignInView />);

    // 3) 契約点：sign-in-page がある
    expect(screen.getByTestId("sign-in-page")).toBeTruthy();

    // 4) Googleボタン押下
    const user = userEvent.setup();
    await user.click(screen.getByTestId("oauth-button-google"));

    // 5) model が正しい引数で呼ばれる
    expect(mockedSignIn).toHaveBeenCalledTimes(1);
    expect(mockedSignIn).toHaveBeenCalledWith({ providerId: "google" });

    // 6) 遷移が行われる
    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith("/app");
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(mockedPublishAuthSignedIn).toHaveBeenCalledTimes(1);
  });
});
