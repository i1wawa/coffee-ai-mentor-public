// apps/web/src/backend/identity/infrastructure/firebase/firebase-auth-error.mapper.server.test.ts
// ================================================================
// 概要:
// - firebase-auth-error-mapper のユニットテスト（mapFirebaseAuthError）
//
// 契約:
// - Firebase の auth/* を errorCode に分類し、httpStatus は errorCode から算出される
// - operation により分類と shouldClearSessionCookie が変わる
// - shouldClearSessionCookie=trueは必要最小限（401 ループ回避や正常化のため）
// - 未知/取得不能コードは安全側（UNAVAILABLE + shouldClearSessionCookie=false）に倒す
// ================================================================

import {
  type ErrorCode,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractFirebaseAuthCode } from "./extract-firebase-auth-code";
import {
  FIREBASE_AUTH_OPERATION,
  mapFirebaseAuthError,
} from "./firebase-auth-error.mapper.server";

// 依存モジュールを先にモックする
// - ESM (ECMAScript Modules) ではテスト対象が import される前にモック宣言を置く必要がある
vi.mock("./extract-firebase-auth-code", () => {
  return {
    // vi.fn() はモック関数を作る
    // - デフォルトは undefined を返す
    // - テスト側で mockReturnValue(...) により戻り値を固定できる
    // - 呼び出し回数や引数などの記録も自動で保持できる
    extractFirebaseAuthCode: vi.fn(),
  };
});

/**
 * モック関数 extractFirebaseAuthCode の引数が何であれ、戻り値を固定できるようにする
 * - mockReturnValue(code) を呼ぶと、以降の呼び出しで必ず code を返すようになる
 */
function setExtractedCode(code: string | undefined) {
  vi.mocked(extractFirebaseAuthCode).mockReturnValue(code);
}

/**
 * mapFirebaseAuthError の返り値が期待通りであることを確認する
 */
function expectMapping(
  result: ReturnType<typeof mapFirebaseAuthError>,
  input: {
    expectedErrorCode: ErrorCode;
    expectedShouldClearCookie: boolean;
    expectedFirebaseAuthCode: string | undefined;
  },
) {
  // errorId は生成されるだけで、値の一致は求めない
  expect(result.error.errorId).toEqual(expect.stringMatching(/.+/));
  // errorCode は行動分類の本体なので一致を必ず確認する
  expect(result.error.errorCode).toBe(errorCode[input.expectedErrorCode]);
  // shouldClearSessionCookie=trueはサインアウト誤爆防止の要なので明示的に確認する
  expect(result.shouldClearSessionCookie).toBe(input.expectedShouldClearCookie);
  // firebaseAuthCode は内部ログ向けなので、入力のコードがそのまま載ることを確認する
  expect(result.firebaseAuthCode).toBe(input.expectedFirebaseAuthCode);
}

beforeEach(() => {
  // 各テスト間でモックの状態をリセットする
  vi.mocked(extractFirebaseAuthCode).mockReset();
});

describe("mapFirebaseAuthError: 共通分類", () => {
  it("code を取り出せない場合は UNAVAILABLE に倒し、shouldClearSessionCookie=false", () => {
    // code が取れない想定
    setExtractedCode(undefined);

    const result = mapFirebaseAuthError(
      {},
      FIREBASE_AUTH_OPERATION.VERIFY_SESSION_COOKIE,
    );

    // 未知の例外で誤爆サインアウトしないため UNAVAILABLE に寄せる
    expectMapping(result, {
      expectedErrorCode: "UNAVAILABLE",
      expectedShouldClearCookie: false,
      expectedFirebaseAuthCode: undefined,
    });
  });

  // 変更点
  // - 代表ケースの一覧をテーブル駆動で固定する
  it.each([
    {
      caseName:
        "レート制限は RATE_LIMITED で返し、shouldClearSessionCookie=false",
      extractedCode: "auth/too-many-requests",
      operation: FIREBASE_AUTH_OPERATION.VERIFY_ID_TOKEN,
      expectedErrorCode: "RATE_LIMITED" as const,
      expectedShouldClearCookie: false,
    },
    {
      caseName: "一時障害は UNAVAILABLE で返し、shouldClearSessionCookie=false",
      extractedCode: "auth/internal-error",
      operation: FIREBASE_AUTH_OPERATION.CREATE_SESSION_COOKIE,
      expectedErrorCode: "UNAVAILABLE" as const,
      expectedShouldClearCookie: false,
    },
    {
      caseName:
        "サーバ設定/権限系は INTERNAL_ERROR で返し、shouldClearSessionCookie=false",
      extractedCode: "auth/insufficient-permission",
      operation: FIREBASE_AUTH_OPERATION.VERIFY_ID_TOKEN,
      expectedErrorCode: "INTERNAL_ERROR" as const,
      expectedShouldClearCookie: false,
    },
  ])("$caseName", (input) => {
    setExtractedCode(input.extractedCode);

    const result = mapFirebaseAuthError({}, input.operation);

    expectMapping(result, {
      expectedErrorCode: input.expectedErrorCode,
      expectedShouldClearCookie: input.expectedShouldClearCookie,
      expectedFirebaseAuthCode: input.extractedCode,
    });
  });
});

describe("mapFirebaseAuthError: VERIFY_SESSION_COOKIE", () => {
  // 変更点
  // - operation ごとの代表ケースをテーブルで固定する
  it.each([
    {
      caseName:
        "セッションcookie無効は AUTH_INVALID + shouldClearSessionCookie=true",
      extractedCode: "auth/session-cookie-expired",
      expectedErrorCode: "AUTH_INVALID" as const,
      expectedShouldClearCookie: true,
    },
    {
      caseName:
        "実測の argument-error は AUTH_INVALID + shouldClearSessionCookie=true",
      extractedCode: "auth/argument-error",
      expectedErrorCode: "AUTH_INVALID" as const,
      expectedShouldClearCookie: true,
    },
    {
      caseName:
        "ID token 系の無効コードが紛れた場合も AUTH_INVALID + shouldClearSessionCookie=true",
      extractedCode: "auth/id-token-expired",
      expectedErrorCode: "AUTH_INVALID" as const,
      expectedShouldClearCookie: true,
    },
    {
      caseName:
        "未知の auth code は誤爆サインアウトを避けて UNAVAILABLE に倒し、shouldClearSessionCookie=false",
      extractedCode: "auth/some-new-code",
      expectedErrorCode: "UNAVAILABLE" as const,
      expectedShouldClearCookie: false,
    },
  ])("$caseName", (input) => {
    setExtractedCode(input.extractedCode);

    const result = mapFirebaseAuthError(
      {},
      FIREBASE_AUTH_OPERATION.VERIFY_SESSION_COOKIE,
    );

    expectMapping(result, {
      expectedErrorCode: input.expectedErrorCode,
      expectedShouldClearCookie: input.expectedShouldClearCookie,
      expectedFirebaseAuthCode: input.extractedCode,
    });
  });
});

describe("mapFirebaseAuthError: DELETE_USER", () => {
  // 変更点
  // - operation ごとの代表ケースをテーブルで固定する
  it.each([
    {
      caseName:
        "対象ユーザー無効は AUTH_INVALID + shouldClearSessionCookie=true",
      extractedCode: "auth/user-not-found",
      expectedErrorCode: "AUTH_INVALID" as const,
      expectedShouldClearCookie: true,
    },
    {
      caseName:
        "引数不正は VALIDATION_FAILED で返し、shouldClearSessionCookie=false",
      extractedCode: "auth/invalid-argument",
      expectedErrorCode: "VALIDATION_FAILED" as const,
      expectedShouldClearCookie: false,
    },
    {
      caseName:
        "未知コードは UNAVAILABLE に倒し、shouldClearSessionCookie=false",
      extractedCode: "auth/some-new-code",
      expectedErrorCode: "UNAVAILABLE" as const,
      expectedShouldClearCookie: false,
    },
  ])("$caseName", (input) => {
    setExtractedCode(input.extractedCode);

    const result = mapFirebaseAuthError(
      {},
      FIREBASE_AUTH_OPERATION.DELETE_USER,
    );

    expectMapping(result, {
      expectedErrorCode: input.expectedErrorCode,
      expectedShouldClearCookie: input.expectedShouldClearCookie,
      expectedFirebaseAuthCode: input.extractedCode,
    });
  });
});

describe("mapFirebaseAuthError: VERIFY_ID_TOKEN", () => {
  // 変更点
  // - operation ごとの代表ケースをテーブルで固定する
  it.each([
    {
      caseName:
        "ID token 無効は AUTH_INVALID で返し、shouldClearSessionCookie=false",
      extractedCode: "auth/invalid-id-token",
      expectedErrorCode: "AUTH_INVALID" as const,
      expectedShouldClearCookie: false,
    },
    {
      caseName:
        "引数不正は VALIDATION_FAILED で返し、shouldClearSessionCookie=false",
      extractedCode: "auth/invalid-argument",
      expectedErrorCode: "VALIDATION_FAILED" as const,
      expectedShouldClearCookie: false,
    },
    {
      caseName:
        "未知の auth code は UNAVAILABLE に倒し、shouldClearSessionCookie=false",
      extractedCode: "auth/unknown-token-code",
      expectedErrorCode: "UNAVAILABLE" as const,
      expectedShouldClearCookie: false,
    },
  ])("$caseName", (input) => {
    setExtractedCode(input.extractedCode);

    const result = mapFirebaseAuthError(
      {},
      FIREBASE_AUTH_OPERATION.VERIFY_ID_TOKEN,
    );

    expectMapping(result, {
      expectedErrorCode: input.expectedErrorCode,
      expectedShouldClearCookie: input.expectedShouldClearCookie,
      expectedFirebaseAuthCode: input.extractedCode,
    });
  });
});

describe("mapFirebaseAuthError: CREATE_SESSION_COOKIE", () => {
  // 変更点
  // - operation ごとの代表ケースをテーブルで固定する
  it.each([
    {
      caseName:
        "ID token 無効は AUTH_INVALID で返し、shouldClearSessionCookie=false",
      extractedCode: "auth/id-token-revoked",
      expectedErrorCode: "AUTH_INVALID" as const,
      expectedShouldClearCookie: false,
    },
    {
      caseName:
        "expiresIn の設定ミスは INTERNAL_ERROR で返し、shouldClearSessionCookie=false",
      extractedCode: "auth/invalid-session-cookie-duration",
      expectedErrorCode: "INTERNAL_ERROR" as const,
      expectedShouldClearCookie: false,
    },
    {
      caseName:
        "引数不正は VALIDATION_FAILED で返し、shouldClearSessionCookie=false",
      extractedCode: "auth/invalid-argument",
      expectedErrorCode: "VALIDATION_FAILED" as const,
      expectedShouldClearCookie: false,
    },
    {
      caseName:
        "未知の auth code は UNAVAILABLE に倒し、shouldClearSessionCookie=false",
      extractedCode: "auth/unknown-create-cookie-code",
      expectedErrorCode: "UNAVAILABLE" as const,
      expectedShouldClearCookie: false,
    },
  ])("$caseName", (input) => {
    setExtractedCode(input.extractedCode);

    const result = mapFirebaseAuthError(
      {},
      FIREBASE_AUTH_OPERATION.CREATE_SESSION_COOKIE,
    );

    expectMapping(result, {
      expectedErrorCode: input.expectedErrorCode,
      expectedShouldClearCookie: input.expectedShouldClearCookie,
      expectedFirebaseAuthCode: input.extractedCode,
    });
  });
});

describe("mapFirebaseAuthError: REVOKE_REFRESH_TOKENS", () => {
  // 変更点
  // - operation ごとの代表ケースをテーブルで固定する
  it.each([
    {
      caseName:
        "対象ユーザー無効は AUTH_INVALID + shouldClearSessionCookie=true",
      extractedCode: "auth/user-not-found",
      expectedErrorCode: "AUTH_INVALID" as const,
      expectedShouldClearCookie: true,
    },
    {
      caseName:
        "対象ユーザー無効（無効化済み）も AUTH_INVALID + shouldClearSessionCookie=true",
      extractedCode: "auth/user-disabled",
      expectedErrorCode: "AUTH_INVALID" as const,
      expectedShouldClearCookie: true,
    },
    {
      caseName:
        "引数不正は VALIDATION_FAILED で返し、shouldClearSessionCookie=false",
      extractedCode: "auth/invalid-argument",
      expectedErrorCode: "VALIDATION_FAILED" as const,
      expectedShouldClearCookie: false,
    },
    {
      caseName:
        "未知コードは UNAVAILABLE に倒し、shouldClearSessionCookie=false",
      extractedCode: "auth/unknown-revoke-code",
      expectedErrorCode: "UNAVAILABLE" as const,
      expectedShouldClearCookie: false,
    },
  ])("$caseName", (input) => {
    setExtractedCode(input.extractedCode);

    const result = mapFirebaseAuthError(
      {},
      FIREBASE_AUTH_OPERATION.REVOKE_REFRESH_TOKENS,
    );

    expectMapping(result, {
      expectedErrorCode: input.expectedErrorCode,
      expectedShouldClearCookie: input.expectedShouldClearCookie,
      expectedFirebaseAuthCode: input.extractedCode,
    });
  });
});
