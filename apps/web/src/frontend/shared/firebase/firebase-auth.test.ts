// apps/web/src/frontend/shared/firebase/firebase-auth.test.ts
// ================================================================
// 概要:
// - firebase-auth のユニットテスト
//
// 契約（固定する仕様）:
// - setPersistence(inMemoryPersistence) を必ず呼ぶ（セッション永続化事故防止）
// - idToken は trim して返す
// - trim 後に空なら失敗（誤成功防止）
// ================================================================

import { errorCode } from "@packages/observability/src/logging/telemetry-error-common";
import type { Auth, AuthProvider } from "firebase/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TELEMETRY_OPERATION } from "@/frontend/shared/observability/telemetry-tags";
import {
  expectErrCode,
  expectOk,
  expectOkValue,
} from "@/tests/vitest-utils/utils/result-assertions";

// firebase/auth をモックする
// - vi.mock は hoist されるため、factory から参照するモック変数は vi.hoisted で宣言する
const firebaseAuthMocks = vi.hoisted(() => {
  return {
    authStub: {} as Auth,
    setPersistenceMock: vi.fn(),
    signInWithPopupMock: vi.fn(),
    inMemoryPersistenceMock: { name: "inMemory" },
    firebaseSignOutMock: vi.fn(),
  };
});

vi.mock("firebase/auth", () => {
  return {
    setPersistence: firebaseAuthMocks.setPersistenceMock,
    signInWithPopup: firebaseAuthMocks.signInWithPopupMock,
    signOut: firebaseAuthMocks.firebaseSignOutMock,
    inMemoryPersistence: firebaseAuthMocks.inMemoryPersistenceMock,
  };
});

// firebase-app をモックして、auth 初期化（getAuth）を通らないようにする
vi.mock("@/frontend/shared/firebase/firebase-app", () => {
  return {
    auth: firebaseAuthMocks.authStub,
  };
});

describe("signInWithPopupAndGetIdToken", () => {
  let signInWithPopupAndGetIdToken: typeof import("./firebase-auth")["signInWithPopupAndGetIdToken"];

  beforeEach(async () => {
    // 1) モジュール内シングルトン状態（persistenceReadyPromise）をテストごとにリセットする
    vi.resetModules();

    // 2) 各モックの状態をリセットする
    firebaseAuthMocks.setPersistenceMock.mockReset();
    firebaseAuthMocks.signInWithPopupMock.mockReset();
    firebaseAuthMocks.firebaseSignOutMock.mockReset();

    // 3) 対象モジュールを再 import する
    ({ signInWithPopupAndGetIdToken } = await import("./firebase-auth"));
  });

  it("失敗: idToken が空なら INTERNAL_ERROR", async () => {
    // 1) 入力
    const provider = {} as AuthProvider;

    // 2) Popup成功だが token が空
    firebaseAuthMocks.setPersistenceMock.mockResolvedValue(undefined);
    firebaseAuthMocks.signInWithPopupMock.mockResolvedValue({
      user: {
        getIdToken: vi.fn().mockResolvedValue("   "),
      },
    });

    // 3) 実行
    const result = await signInWithPopupAndGetIdToken({ provider });

    // 4) 検証
    expectErrCode(result, errorCode.INTERNAL_ERROR);
  });

  it("失敗: setPersistence で例外なら INTERNAL_ERROR", async () => {
    // 1) 入力
    const provider = {} as AuthProvider;

    // 2) setPersistence で例外
    firebaseAuthMocks.setPersistenceMock.mockRejectedValue(new Error("boom"));

    // 3) 実行
    const result = await signInWithPopupAndGetIdToken({ provider });

    // 4) 検証
    expect(firebaseAuthMocks.signInWithPopupMock).not.toHaveBeenCalled();
    expectErrCode(result, errorCode.INTERNAL_ERROR);
  });

  it("失敗: signInWithPopup の SDK例外は分類して err を返す", async () => {
    // 1) 入力
    const provider = {} as AuthProvider;
    const cause = {
      code: "auth/popup-blocked",
      name: "FirebaseError",
      message: "popup blocked",
    };

    // 2) 永続化は成功、Popup で SDK 例外を発生させる
    firebaseAuthMocks.setPersistenceMock.mockResolvedValue(undefined);
    firebaseAuthMocks.signInWithPopupMock.mockRejectedValue(cause);

    // 3) 実行
    const result = await signInWithPopupAndGetIdToken({ provider });

    // 4) 検証
    expectErrCode(result, errorCode.PRECONDITION_FAILED, {
      sdk: {
        provider: "firebase_auth",
        code: "auth/popup-blocked",
        operation: TELEMETRY_OPERATION.SIGN_IN_WITH_POPUP,
      },
      cause,
    });
  });

  it("失敗: getIdToken の SDK例外は分類して err を返す", async () => {
    // 1) 入力
    const provider = {} as AuthProvider;
    const cause = {
      code: "auth/too-many-requests",
      name: "FirebaseError",
      message: "rate limited",
    };

    // 2) 永続化は成功、Popup は成功、token 取得で SDK 例外を発生させる
    firebaseAuthMocks.setPersistenceMock.mockResolvedValue(undefined);
    firebaseAuthMocks.signInWithPopupMock.mockResolvedValue({
      user: {
        getIdToken: vi.fn().mockRejectedValue(cause),
      },
    });

    // 3) 実行
    const result = await signInWithPopupAndGetIdToken({ provider });

    // 4) 検証
    expectErrCode(result, errorCode.RATE_LIMITED, {
      sdk: {
        provider: "firebase_auth",
        code: "auth/too-many-requests",
        operation: TELEMETRY_OPERATION.SIGN_IN_WITH_POPUP,
      },
      cause,
    });
  });

  it("setPersistence が一度失敗しても、次回呼び出しで再試行して回復できる", async () => {
    // 1) 入力
    const provider = {} as AuthProvider;

    // 2) 1回目は setPersistence を失敗、2回目は成功させる
    firebaseAuthMocks.setPersistenceMock
      .mockRejectedValueOnce(new Error("transient failure"))
      .mockResolvedValueOnce(undefined);

    // 3) 2回目の呼び出しで Popup 成功させる
    firebaseAuthMocks.signInWithPopupMock.mockResolvedValueOnce({
      user: {
        getIdToken: vi.fn().mockResolvedValue(" token_after_retry "),
      },
    });

    // 4) 実行（1回目は失敗、2回目は回復する想定）
    const firstResult = await signInWithPopupAndGetIdToken({ provider });
    const secondResult = await signInWithPopupAndGetIdToken({ provider });

    // 5) 検証
    expectErrCode(firstResult, errorCode.INTERNAL_ERROR);
    expectOkValue(secondResult, { idToken: "token_after_retry" });
    expect(firebaseAuthMocks.setPersistenceMock).toHaveBeenCalledTimes(2);
    expect(firebaseAuthMocks.signInWithPopupMock).toHaveBeenCalledTimes(1);
  });

  it("複数回呼んでも setPersistence(inMemory) は 1 回だけ", async () => {
    // 1) 入力
    const provider = {} as AuthProvider;

    // 2) setPersistence 成功（1回）
    firebaseAuthMocks.setPersistenceMock.mockResolvedValue(undefined);

    // 3) Popup成功（2回）
    firebaseAuthMocks.signInWithPopupMock
      .mockResolvedValueOnce({
        user: {
          getIdToken: vi.fn().mockResolvedValue("token1"),
        },
      })
      .mockResolvedValueOnce({
        user: {
          getIdToken: vi.fn().mockResolvedValue("token2"),
        },
      });

    // 4) 実行（2回）
    const r1 = await signInWithPopupAndGetIdToken({ provider });
    const r2 = await signInWithPopupAndGetIdToken({ provider });

    // 5) 検証
    expect(firebaseAuthMocks.setPersistenceMock).toHaveBeenCalledTimes(1);
    expect(firebaseAuthMocks.signInWithPopupMock).toHaveBeenCalledTimes(2);
    expectOkValue(r1, { idToken: "token1" });
    expectOkValue(r2, { idToken: "token2" });
  });

  it("成功: setPersistence(inMemory)→Popup→getIdToken→trimして返す", async () => {
    // 1) 入力
    const provider = {} as AuthProvider;
    const idToken = "token";

    // 2) setPersistence 成功
    firebaseAuthMocks.setPersistenceMock.mockResolvedValue(undefined);

    // 3) Popup成功（user.getIdToken が呼べる形だけ用意する）
    firebaseAuthMocks.signInWithPopupMock.mockResolvedValue({
      user: {
        getIdToken: vi.fn().mockResolvedValue(` ${idToken} `),
      },
    });

    // 4) 実行
    const result = await signInWithPopupAndGetIdToken({ provider });

    // 5) 検証
    expect(firebaseAuthMocks.setPersistenceMock).toHaveBeenCalledTimes(1);
    expect(firebaseAuthMocks.setPersistenceMock).toHaveBeenCalledWith(
      firebaseAuthMocks.authStub,
      firebaseAuthMocks.inMemoryPersistenceMock,
    );

    expect(firebaseAuthMocks.signInWithPopupMock).toHaveBeenCalledTimes(1);
    expect(firebaseAuthMocks.signInWithPopupMock).toHaveBeenCalledWith(
      firebaseAuthMocks.authStub,
      provider,
    );

    expectOkValue(result, { idToken });
  });
});

describe("signOutFirebase", () => {
  beforeEach(() => {
    // signOut テストでは Firebase Auth の signOut モックだけを初期化すれば十分
    firebaseAuthMocks.firebaseSignOutMock.mockReset();
  });

  it("失敗: SDK例外は分類して err を返す（operation を同梱）", async () => {
    // 1) signOut で Firebase 例外相当
    const cause = {
      code: "auth/user-disabled",
      name: "FirebaseError",
      message: "boom",
    };
    firebaseAuthMocks.firebaseSignOutMock.mockRejectedValue(cause);

    // 2) 実行
    const { signOutFirebase } = await import("./firebase-auth");
    const result = await signOutFirebase();

    // 3) 検証
    expectErrCode(result, errorCode.ACCESS_DENIED, {
      sdk: {
        provider: "firebase_auth",
        operation: TELEMETRY_OPERATION.SIGN_OUT,
      },
      cause,
    });
  });

  it("成功: signOut(auth) を呼んで ok を返す", async () => {
    // 1) signOut 成功
    firebaseAuthMocks.firebaseSignOutMock.mockResolvedValue(undefined);

    // 2) 実行
    const { signOutFirebase } = await import("./firebase-auth");
    const result = await signOutFirebase();

    // 3) 検証
    expect(firebaseAuthMocks.firebaseSignOutMock).toHaveBeenCalledTimes(1);
    expect(firebaseAuthMocks.firebaseSignOutMock).toHaveBeenCalledWith(
      firebaseAuthMocks.authStub,
    );
    expectOk(result);
  });
});
