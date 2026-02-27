// apps/web/src/frontend/features/auth/model/use-sign-out.hook.test.ts
// ================================================================
// 概要:
// - useSignOut hook のユニットテスト
//
// 契約:
// - signOut/revokeSession 成功時は sessionUser キャッシュを null に更新する
// - SIGN_IN は失敗でも未サインイン扱いとして副作用を継続する
// - SIGN_IN 以外の失敗は副作用を実行しない
// ================================================================

import {
  buildErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { err, ok } from "@packages/shared/src/result";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useRouter } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { publishAuthSignedOut } from "@/frontend/entities/session/lib/cross-tab-auth-events";
import { SESSION_USER_QUERY_KEY } from "@/frontend/entities/user/model/session-user.query";
import { USER_ME_QUERY_KEY } from "@/frontend/entities/user/model/user-me.query";
import { toUiErrorFields } from "@/frontend/shared/errors/error-ui-action.mapper";
import { createTestQueryWrapper } from "@/tests/vitest-utils/utils/react-query";
import {
  revokeSessionAndClearClientState,
  signOutAndClearClientState,
} from "./sign-out";
import { useSignOut } from "./use-sign-out.hook";

vi.mock("next/navigation", () => {
  return {
    useRouter: vi.fn(),
  };
});

vi.mock("./sign-out", () => {
  return {
    signOutAndClearClientState: vi.fn(),
    revokeSessionAndClearClientState: vi.fn(),
  };
});

vi.mock("@/frontend/entities/session/lib/cross-tab-auth-events", () => {
  return {
    publishAuthSignedOut: vi.fn(),
  };
});

describe("features/auth/model useSignOut", () => {
  type SetupUseSignOutTestArgs = {
    redirectTo?: string;
  };

  const mockedSignOutAndClearClientState = vi.mocked(
    signOutAndClearClientState,
  );
  const mockedRevokeSessionAndClearClientState = vi.mocked(
    revokeSessionAndClearClientState,
  );
  const mockedPublishAuthSignedOut = vi.mocked(publishAuthSignedOut);
  const mockedUseRouter = vi.mocked(useRouter);
  const routerPushMock = vi.fn();
  const routerRefreshMock = vi.fn();

  beforeEach(() => {
    mockedSignOutAndClearClientState.mockReset();
    mockedRevokeSessionAndClearClientState.mockReset();
    mockedPublishAuthSignedOut.mockReset();
    mockedUseRouter.mockReset();
    routerPushMock.mockReset();
    routerRefreshMock.mockReset();
    mockedUseRouter.mockReturnValue({
      push: routerPushMock,
      refresh: routerRefreshMock,
    } as unknown as ReturnType<typeof useRouter>);
  });

  function setupUseSignOutTest(args: SetupUseSignOutTestArgs = {}) {
    const { queryClient, wrapper } = createTestQueryWrapper();
    const initialSessionUser = ok({ uid: "u1" });
    const initialUserMe = ok({ uid: "u1" });
    queryClient.setQueryData(SESSION_USER_QUERY_KEY, initialSessionUser);
    queryClient.setQueryData(USER_ME_QUERY_KEY, initialUserMe);

    const { result } = renderHook(
      () =>
        useSignOut(
          args.redirectTo
            ? {
                redirectTo: args.redirectTo,
              }
            : {},
        ),
      { wrapper },
    );

    return { queryClient, result, initialSessionUser, initialUserMe };
  }

  it("signOut 失敗でも SIGN_IN なら未サインイン扱いへ寄せる", async () => {
    mockedSignOutAndClearClientState.mockResolvedValue(
      err(toUiErrorFields(buildErrorFields(errorCode.AUTH_REQUIRED))),
    );

    const { queryClient, result, initialSessionUser } = setupUseSignOutTest({
      redirectTo: "/sign-in/",
    });

    await act(async () => {
      await result.current.signOut();
    });

    await waitFor(() => {
      expect(routerRefreshMock).toHaveBeenCalledTimes(0);
      expect(routerPushMock).toHaveBeenCalledWith("/sign-in/");
    });
    expect(mockedPublishAuthSignedOut).toHaveBeenCalledTimes(1);

    expect(queryClient.getQueryData(SESSION_USER_QUERY_KEY)).toEqual(
      initialSessionUser,
    );
  });

  it("signOut 失敗で SIGN_IN 以外なら副作用を実行しない", async () => {
    mockedSignOutAndClearClientState.mockResolvedValue(
      err(toUiErrorFields(buildErrorFields(errorCode.UNAVAILABLE))),
    );

    const { queryClient, result, initialSessionUser } = setupUseSignOutTest({
      redirectTo: "/sign-in/",
    });

    await act(async () => {
      await result.current.signOut();
    });

    expect(routerRefreshMock).toHaveBeenCalledTimes(0);
    expect(routerPushMock).toHaveBeenCalledTimes(0);
    expect(mockedPublishAuthSignedOut).toHaveBeenCalledTimes(0);
    expect(queryClient.getQueryData(SESSION_USER_QUERY_KEY)).toEqual(
      initialSessionUser,
    );
  });

  it("signOut 成功: redirectTo がある場合は push を優先する", async () => {
    mockedSignOutAndClearClientState.mockResolvedValue(ok(undefined));

    const { queryClient, result, initialSessionUser } = setupUseSignOutTest({
      redirectTo: "/sign-in/",
    });

    let actionResult: Awaited<
      ReturnType<typeof result.current.signOut>
    > | null = null;
    await act(async () => {
      actionResult = await result.current.signOut();
    });

    expect(actionResult).toEqual(ok(undefined));
    expect(mockedSignOutAndClearClientState).toHaveBeenCalledTimes(1);
    expect(mockedPublishAuthSignedOut).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(routerRefreshMock).toHaveBeenCalledTimes(0);
      expect(routerPushMock).toHaveBeenCalledWith("/sign-in/");
    });
    expect(mockedPublishAuthSignedOut).toHaveBeenCalledTimes(1);

    expect(queryClient.getQueryData(SESSION_USER_QUERY_KEY)).toEqual(
      initialSessionUser,
    );
  });

  it("signOut 成功: redirectTo が無い場合はキャッシュ更新して refresh する", async () => {
    mockedSignOutAndClearClientState.mockResolvedValue(ok(undefined));

    const { queryClient, result } = setupUseSignOutTest();

    await act(async () => {
      await result.current.signOut();
    });

    await waitFor(() => {
      expect(routerRefreshMock).toHaveBeenCalledTimes(1);
    });
    expect(mockedPublishAuthSignedOut).toHaveBeenCalledTimes(1);
    expect(routerPushMock).toHaveBeenCalledTimes(0);
    expect(queryClient.getQueryData(SESSION_USER_QUERY_KEY)).toEqual(ok(null));
    expect(queryClient.getQueryData(USER_ME_QUERY_KEY)).toEqual(ok(null));
  });

  it("revokeSession 失敗でも SIGN_IN なら未サインイン扱いへ寄せる", async () => {
    mockedRevokeSessionAndClearClientState.mockResolvedValue(
      err(toUiErrorFields(buildErrorFields(errorCode.AUTH_REQUIRED))),
    );

    const { queryClient, result, initialSessionUser } = setupUseSignOutTest({
      redirectTo: "/sign-in/",
    });

    await act(async () => {
      await result.current.revokeSession();
    });

    await waitFor(() => {
      expect(routerRefreshMock).toHaveBeenCalledTimes(0);
      expect(routerPushMock).toHaveBeenCalledWith("/sign-in/");
    });
    expect(mockedPublishAuthSignedOut).toHaveBeenCalledTimes(1);

    expect(queryClient.getQueryData(SESSION_USER_QUERY_KEY)).toEqual(
      initialSessionUser,
    );
  });

  it("revokeSession 失敗で SIGN_IN 以外なら副作用を実行しない", async () => {
    mockedRevokeSessionAndClearClientState.mockResolvedValue(
      err(toUiErrorFields(buildErrorFields(errorCode.UNAVAILABLE))),
    );

    const { queryClient, result, initialSessionUser } = setupUseSignOutTest({
      redirectTo: "/sign-in/",
    });

    await act(async () => {
      await result.current.revokeSession();
    });

    expect(routerRefreshMock).toHaveBeenCalledTimes(0);
    expect(routerPushMock).toHaveBeenCalledTimes(0);
    expect(mockedPublishAuthSignedOut).toHaveBeenCalledTimes(0);
    expect(queryClient.getQueryData(SESSION_USER_QUERY_KEY)).toEqual(
      initialSessionUser,
    );
  });

  it("revokeSession 成功: redirectTo がある場合は push を優先する", async () => {
    mockedRevokeSessionAndClearClientState.mockResolvedValue(ok(undefined));

    const { queryClient, result, initialSessionUser } = setupUseSignOutTest({
      redirectTo: "/sign-in/",
    });

    await act(async () => {
      await result.current.revokeSession();
    });

    expect(mockedRevokeSessionAndClearClientState).toHaveBeenCalledTimes(1);
    expect(mockedPublishAuthSignedOut).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(routerRefreshMock).toHaveBeenCalledTimes(0);
      expect(routerPushMock).toHaveBeenCalledWith("/sign-in/");
    });

    expect(queryClient.getQueryData(SESSION_USER_QUERY_KEY)).toEqual(
      initialSessionUser,
    );
  });

  it("revokeSession 成功: redirectTo が無い場合はキャッシュ更新して refresh する", async () => {
    mockedRevokeSessionAndClearClientState.mockResolvedValue(ok(undefined));

    const { queryClient, result } = setupUseSignOutTest();

    await act(async () => {
      await result.current.revokeSession();
    });

    await waitFor(() => {
      expect(routerRefreshMock).toHaveBeenCalledTimes(1);
    });
    expect(mockedPublishAuthSignedOut).toHaveBeenCalledTimes(1);
    expect(routerPushMock).toHaveBeenCalledTimes(0);
    expect(queryClient.getQueryData(SESSION_USER_QUERY_KEY)).toEqual(ok(null));
    expect(queryClient.getQueryData(USER_ME_QUERY_KEY)).toEqual(ok(null));
  });
});
