// apps/web/src/frontend/features/users/model/use-delete-user-me-flow.hook.test.ts
// ================================================================
// 概要:
// - useDeleteUserMeFlow hook のユニットテスト
//
// 契約:
// - 成功時は Firebase signOut と accountDeleted 通知を行う
// - 失敗時は副作用を実行しない（UI が結果表示を担う）
// - Firebase signOut 失敗は成功扱いを維持し、観測へ送る
// ================================================================

import {
  buildErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { err, ok } from "@packages/shared/src/result";
import { act, renderHook } from "@testing-library/react";
import type { AuthProvider } from "firebase/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { publishAuthAccountDeleted } from "@/frontend/entities/session/lib/cross-tab-auth-events";
import { toUiErrorFields } from "@/frontend/shared/errors/error-ui-action.mapper";
import type { UiResult } from "@/frontend/shared/errors/ui-result";
import { signOutFirebase } from "@/frontend/shared/firebase/firebase-auth";
import { captureErrorToSentry } from "@/frontend/shared/observability/sentry.client";
import { TELEMETRY_OPERATION } from "@/frontend/shared/observability/telemetry-tags";
import { createTestQueryWrapper } from "@/tests/vitest-utils/utils/react-query";
import {
  deleteUserMeOnce,
  reauthenticateAndDeleteUserMe,
} from "./delete-user-me-flow";
import { useDeleteUserMeFlow } from "./use-delete-user-me-flow.hook";

vi.mock("./delete-user-me-flow", () => {
  return {
    deleteUserMeOnce: vi.fn(),
    reauthenticateAndDeleteUserMe: vi.fn(),
  };
});

vi.mock("@/frontend/shared/firebase/firebase-auth", () => {
  return {
    signOutFirebase: vi.fn(),
  };
});

vi.mock("@/frontend/shared/observability/sentry.client", () => {
  return {
    captureErrorToSentry: vi.fn(),
  };
});

vi.mock("@/frontend/entities/session/lib/cross-tab-auth-events", () => {
  return {
    publishAuthAccountDeleted: vi.fn(),
  };
});

describe("features/users/model useDeleteUserMeFlow", () => {
  const mockedDeleteUserMeOnce = vi.mocked(deleteUserMeOnce);
  const mockedReauthenticateAndDeleteUserMe = vi.mocked(
    reauthenticateAndDeleteUserMe,
  );
  const mockedSignOutFirebase = vi.mocked(signOutFirebase);
  const mockedCaptureErrorToSentry = vi.mocked(captureErrorToSentry);
  const mockedPublishAuthAccountDeleted = vi.mocked(publishAuthAccountDeleted);
  const providerStub = {} as AuthProvider;

  beforeEach(() => {
    mockedDeleteUserMeOnce.mockReset();
    mockedReauthenticateAndDeleteUserMe.mockReset();
    mockedSignOutFirebase.mockReset();
    mockedCaptureErrorToSentry.mockReset();
    mockedPublishAuthAccountDeleted.mockReset();
  });

  it("deleteOnce 失敗: 副作用を実行しない", async () => {
    mockedDeleteUserMeOnce.mockResolvedValue(
      err(toUiErrorFields(buildErrorFields(errorCode.UNAVAILABLE))),
    );
    mockedSignOutFirebase.mockResolvedValue(ok(undefined));

    const { wrapper } = createTestQueryWrapper();

    const { result } = renderHook(
      () =>
        useDeleteUserMeFlow({
          reauthProvider: providerStub,
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.deleteOnce();
    });

    expect(mockedSignOutFirebase).toHaveBeenCalledTimes(0);
    expect(mockedCaptureErrorToSentry).toHaveBeenCalledTimes(0);
    expect(mockedPublishAuthAccountDeleted).toHaveBeenCalledTimes(0);
  });

  it("deleteOnce 成功: signOut と accountDeleted 通知を実行する", async () => {
    mockedDeleteUserMeOnce.mockResolvedValue(ok(undefined));
    mockedSignOutFirebase.mockResolvedValue(ok(undefined));

    const { wrapper } = createTestQueryWrapper();

    const { result } = renderHook(
      () =>
        useDeleteUserMeFlow({
          reauthProvider: providerStub,
        }),
      { wrapper },
    );

    let actionResult: UiResult<void> | null = null;
    await act(async () => {
      actionResult = await result.current.deleteOnce();
    });

    expect(actionResult).toEqual(ok(undefined));
    expect(mockedDeleteUserMeOnce).toHaveBeenCalledTimes(1);
    expect(mockedReauthenticateAndDeleteUserMe).toHaveBeenCalledTimes(0);
    expect(mockedSignOutFirebase).toHaveBeenCalledTimes(1);
    expect(mockedPublishAuthAccountDeleted).toHaveBeenCalledTimes(1);
    expect(mockedCaptureErrorToSentry).toHaveBeenCalledTimes(0);
  });

  it("reauthenticateAndDelete 失敗: 副作用を実行しない", async () => {
    const flowError = toUiErrorFields(buildErrorFields(errorCode.UNAVAILABLE));
    mockedReauthenticateAndDeleteUserMe.mockResolvedValue(err(flowError));
    mockedSignOutFirebase.mockResolvedValue(ok(undefined));

    const { wrapper } = createTestQueryWrapper();

    const { result } = renderHook(
      () =>
        useDeleteUserMeFlow({
          reauthProvider: providerStub,
        }),
      { wrapper },
    );

    let actionResult: UiResult<void> | null = null;
    await act(async () => {
      actionResult = await result.current.reauthenticateAndDelete();
    });

    expect(actionResult).toEqual(err(flowError));
    expect(mockedDeleteUserMeOnce).toHaveBeenCalledTimes(0);
    expect(mockedReauthenticateAndDeleteUserMe).toHaveBeenCalledTimes(1);
    expect(mockedSignOutFirebase).toHaveBeenCalledTimes(0);
    expect(mockedCaptureErrorToSentry).toHaveBeenCalledTimes(0);
    expect(mockedPublishAuthAccountDeleted).toHaveBeenCalledTimes(0);
  });

  it("reauthenticateAndDelete 成功: provider 付きで flow を呼び、signOut と通知を実行する", async () => {
    mockedReauthenticateAndDeleteUserMe.mockResolvedValue(ok(undefined));
    mockedSignOutFirebase.mockResolvedValue(ok(undefined));

    const { wrapper } = createTestQueryWrapper();

    const { result } = renderHook(
      () =>
        useDeleteUserMeFlow({
          reauthProvider: providerStub,
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.reauthenticateAndDelete();
    });

    expect(mockedDeleteUserMeOnce).toHaveBeenCalledTimes(0);
    expect(mockedReauthenticateAndDeleteUserMe).toHaveBeenCalledTimes(1);
    expect(mockedReauthenticateAndDeleteUserMe).toHaveBeenCalledWith({
      provider: providerStub,
    });
    expect(mockedSignOutFirebase).toHaveBeenCalledTimes(1);
    expect(mockedPublishAuthAccountDeleted).toHaveBeenCalledTimes(1);
    expect(mockedCaptureErrorToSentry).toHaveBeenCalledTimes(0);
  });

  it("成功 + signOutFirebase 失敗: 成功扱いで観測へ送って通知する", async () => {
    mockedDeleteUserMeOnce.mockResolvedValue(ok(undefined));
    const firebaseError = buildErrorFields(errorCode.INTERNAL_ERROR);
    mockedSignOutFirebase.mockResolvedValue(err(firebaseError));

    const { wrapper } = createTestQueryWrapper();

    const { result } = renderHook(
      () =>
        useDeleteUserMeFlow({
          reauthProvider: providerStub,
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.deleteOnce();
    });

    expect(mockedCaptureErrorToSentry).toHaveBeenCalledTimes(1);
    expect(mockedCaptureErrorToSentry).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: TELEMETRY_OPERATION.DELETE_USER_ME,
        layer: "sdk",
        error: firebaseError,
      }),
    );
    expect(mockedPublishAuthAccountDeleted).toHaveBeenCalledTimes(1);
  });
});
