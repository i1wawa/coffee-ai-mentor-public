// apps/web/src/tests/utils/auth-emulator.ts
// ========================================================
// 概要:
// - Firebase Auth Emulator（REST）から、テストユーザーの idToken を取得する共通ユーティリティ
//
// 契約:
// - 入力: なし（test-config の定数を使う）
// - 出力: idToken（trim済みの非空文字列）
// - 失敗: createTestFailureError を投げ、reason/expected/observed/nextActions を必ず含める
//
// 前提:
// - Firebase Auth Emulator が起動している
// - AUTH_EMULATOR_ORIGIN は Emulator の origin（例: http://127.0.0.1:9099）を指す
// - FIREBASE_WEB_API_KEY が Emulator の REST 呼び出しに利用可能である
// - 同時実行時も競合しにくいよう、テストユーザーは毎回ユニークに作成する
// ========================================================

import {
  createTestFailureError,
  TEST_FAILURE_REASON,
} from "@packages/tests/src/error-message";
import { testAdminAuth } from "@/tests/utils/firebase-admin-emulator";
import {
  AUTH_EMULATOR_ORIGIN,
  FIREBASE_WEB_API_KEY,
  TEST_USER_PASSWORD,
} from "@/tests/utils/test-config";

type AuthEmulatorErrorBody = {
  error?: {
    message?: string;
  };
};

type SignUpResponseBody = {
  localId?: string;
};

type SignInResponseBody = {
  idToken?: string;
};

function buildUniqueTestEmail(): string {
  return `test_${crypto.randomUUID()}@example.com`;
}

async function extractAuthErrorMessage(response: Response): Promise<string> {
  const responseText = await response.text().catch(() => "");
  try {
    const json = JSON.parse(responseText) as AuthEmulatorErrorBody;
    return json.error?.message?.trim() || responseText.slice(0, 200);
  } catch {
    return responseText.slice(0, 200);
  }
}

type CreateTestUserAndFetchIdTokenOptions = {
  shouldMarkEmailVerified: boolean;
};

/**
 * Auth Emulator RESTを使って「テストユーザーのID Token」を取得する。
 *
 * 1. ユニークな email/password でユーザーを作成(signUp)する
 * 2. 必要時のみ、Admin SDKで emailVerified=true に更新する（公式推奨）
 * 3. 作成したユーザーでサインイン(signInWithPassword)し、ID Tokenを取得する
 *
 * 失敗した場合は詳細なエラーメッセージ付きで例外を投げる。
 */
async function createTestUserAndFetchIdTokenInternal(
  options: CreateTestUserAndFetchIdTokenOptions,
): Promise<string> {
  // 1) 並列実行時の衝突を避けるため、数回リトライしながらユニークユーザーを作る
  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const uniqueEmail = buildUniqueTestEmail();

    // 2) email/passwordで ユーザーを作成（signUp）
    // - URLはエミュレータが提供する管理用エンドポイントを使う
    const signUpResponse = await fetch(
      `${AUTH_EMULATOR_ORIGIN}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(FIREBASE_WEB_API_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: uniqueEmail,
          password: TEST_USER_PASSWORD,
          returnSecureToken: true,
        }),
      },
    );

    if (!signUpResponse.ok) {
      const errorMessage = await extractAuthErrorMessage(signUpResponse);
      // ごく稀に重複した場合はリトライする
      if (errorMessage.includes("EMAIL_EXISTS")) {
        continue;
      }
      throw createTestFailureError({
        reason: TEST_FAILURE_REASON.PRECONDITION_FAILED,
        summary: "Auth Emulatorでテストユーザー作成（signUp）に失敗しました。",
        expected: "Auth Emulatorが起動しており、signUpが200系で成功する",
        observed: `status=${signUpResponse.status} message=${errorMessage}`,
        nextActions: [
          "Auth Emulatorの起動ログを確認する（ポート/起動失敗など）",
          "メール/パスワード認証が無効化されていないか確認する",
        ],
      });
    }

    // 3) 必要なときだけ、作成直後のユーザーを確認済みメールへ更新する
    if (options.shouldMarkEmailVerified) {
      const signUpJson = (await signUpResponse
        .json()
        .catch(() => null)) as SignUpResponseBody | null;
      const createdUid = signUpJson?.localId?.trim() ?? "";

      if (!createdUid) {
        throw createTestFailureError({
          reason: TEST_FAILURE_REASON.CONTRACT_VIOLATION,
          summary:
            "Auth EmulatorのsignUp応答にlocalIdが含まれておらず、emailVerifiedを更新できません。",
          expected: "signUpレスポンスにlocalIdが含まれる",
          observed: `response=${JSON.stringify(signUpJson)}`,
          nextActions: [
            "Auth EmulatorのREST仕様（signUp応答）を確認する",
            "テスト用ユーザー作成レスポンスのモック/実レスポンスを確認する",
          ],
        });
      }

      try {
        await testAdminAuth.updateUser(createdUid, {
          emailVerified: true,
        });
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        throw createTestFailureError({
          reason: TEST_FAILURE_REASON.PRECONDITION_FAILED,
          summary:
            "Auth Emulator上のテストユーザーをemailVerified=trueに更新できませんでした。",
          expected:
            "Firebase Admin SDK が Auth Emulator に接続し、updateUser(uid, { emailVerified: true }) が成功する",
          observed: `uid=${createdUid} error=${errorMessage}`,
          nextActions: [
            "Next.js/Vitest側に FIREBASE_AUTH_EMULATOR_HOST が渡っているか確認する",
            "Auth Emulator が起動しているか確認する",
          ],
        });
      }
    }

    // 4) 作成したユーザーでサインインし、ID Token を取得（signInWithPassword）
    // - URLはエミュレータが提供する管理用エンドポイントを使う
    const signInResponse = await fetch(
      `${AUTH_EMULATOR_ORIGIN}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(FIREBASE_WEB_API_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: uniqueEmail,
          password: TEST_USER_PASSWORD,
          returnSecureToken: true,
        }),
      },
    );

    if (!signInResponse.ok) {
      const errorMessage = await extractAuthErrorMessage(signInResponse);
      throw createTestFailureError({
        reason: TEST_FAILURE_REASON.PRECONDITION_FAILED,
        summary:
          "Auth Emulatorでサインイン（signInWithPassword）に失敗しました。",
        expected: "作成したユーザーでサインインでき、idTokenが返る",
        observed: `status=${signInResponse.status} message=${errorMessage}`,
        nextActions: [
          "userEmail / userPassword が一致しているか確認する",
          "Auth Emulatorが起動しているか確認する",
        ],
      });
    }

    // 5) レスポンスから ID Token を抽出して返す
    const signInJson = (await signInResponse
      .json()
      .catch(() => null)) as SignInResponseBody | null;

    const idToken = signInJson?.idToken?.trim() ?? "";
    if (!idToken) {
      throw createTestFailureError({
        reason: TEST_FAILURE_REASON.CONTRACT_VIOLATION,
        summary: "Auth Emulatorのサインイン応答にidTokenが含まれていません。",
        expected: "signInWithPasswordのレスポンスにidTokenが含まれる",
        observed: `response=${JSON.stringify(signInJson)}`,
        nextActions: ["Auth EmulatorのREST仕様（URL/ポート）を確認する"],
      });
    }

    return idToken;
  }

  throw createTestFailureError({
    reason: TEST_FAILURE_REASON.PRECONDITION_FAILED,
    summary: "ユニークテストユーザーの作成リトライ上限に到達しました。",
    expected: "signUp が重複なしで成功する",
    observed: `attempts=${maxAttempts}`,
    nextActions: [
      "同時実行数を下げて再試行する",
      "メール生成ロジックの衝突率が高くないか確認する",
    ],
  });
}

/**
 * 未確認メールのままテストユーザーを作成し、ID Tokenを取得する。
 */
export async function createTestUserAndFetchIdToken(): Promise<string> {
  return await createTestUserAndFetchIdTokenInternal({
    shouldMarkEmailVerified: false,
  });
}

/**
 * 確認済みメールのテストユーザーを作成し、ID Tokenを取得する。
 */
export async function createVerifiedTestUserAndFetchIdToken(): Promise<string> {
  return await createTestUserAndFetchIdTokenInternal({
    shouldMarkEmailVerified: true,
  });
}
