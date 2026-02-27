// apps/web/src/backend/identity/infrastructure/firebase/firebase-identity-admin.adapter.server.integration.test.ts
// ================================================================
// 概要:
// - FirebaseIdentityAdminAdapter の統合テスト（Firebase Auth Emulator 経由）
//
// 責務:
// - Firebase Auth Emulator を使って、実際の Firebase Admin SDK の動作を確認する
// - extractFirebaseAuthCoder を通じて、Firebase 例外が正しくマッピングされることを確認する
//
// 契約（代表ケースのみ）
// - verifyIdTokenForSensitiveAction: 有効 idToken なら ok({ uid, authTimeSeconds }) を返す
// - deleteUser: 既存 uid の削除は ok(null) を返す
// - deleteUser: 削除済み uid を再削除すると AUTH_INVALID を返す
// ================================================================

/* @vitest-environment node */

import { errorCode } from "@packages/observability/src/logging/telemetry-error-common";
import { describe, expect, it } from "vitest";
import { createFirebaseIdentityAdminPort } from "@/backend/identity/infrastructure/firebase/firebase-identity-admin.adapter.server";
import {
  createTestUserAndFetchIdToken,
  createVerifiedTestUserAndFetchIdToken,
} from "@/tests/utils/auth-emulator";
import {
  expectErrCode,
  expectOkValue,
} from "@/tests/vitest-utils/utils/result-assertions";

describe("firebase identity admin adapter（統合）", () => {
  it("verifyIdTokenForSensitiveAction: 有効 idToken なら ok({ uid, authTimeSeconds })", async () => {
    // 1) 有効 idToken を取得する
    const idToken = await createVerifiedTestUserAndFetchIdToken();
    const identityAdminPort = createFirebaseIdentityAdminPort();

    // 2) adapter を実行する
    const result = await identityAdminPort.verifyIdTokenForSensitiveAction({
      idToken,
    });

    // 3) 成功結果の代表契約を確認する
    expectOkValue(
      result,
      expect.objectContaining({
        uid: expect.stringMatching(/\S/),
      }),
    );
    // authTime が取れる環境では number、取れない場合は null
    expect(
      result.value.authTimeSeconds === null ||
        typeof result.value.authTimeSeconds === "number",
    ).toBe(true);
  });

  it("verifyIdTokenForSensitiveAction: 未確認メールの idToken は ACCESS_DENIED で拒否する", async () => {
    // 1) 未確認メールの idToken を取得する
    const idToken = await createTestUserAndFetchIdToken();
    const identityAdminPort = createFirebaseIdentityAdminPort();

    // 2) adapter を実行する
    const result = await identityAdminPort.verifyIdTokenForSensitiveAction({
      idToken,
    });

    // 3) 新ポリシーどおり拒否されることを確認する
    expectErrCode(result, errorCode.ACCESS_DENIED, {
      shouldClearSessionCookie: false,
    });
  });

  it("deleteUser: 既存 uid の削除は ok(null)", async () => {
    // 1) 有効ユーザーを作って uid を取る
    const idToken = await createVerifiedTestUserAndFetchIdToken();
    const identityAdminPort = createFirebaseIdentityAdminPort();

    const verifyResult =
      await identityAdminPort.verifyIdTokenForSensitiveAction({ idToken });
    expectOkValue(
      verifyResult,
      expect.objectContaining({
        uid: expect.stringMatching(/\S/),
      }),
    );

    // 2) uid を削除する
    const deleteResult = await identityAdminPort.deleteUser({
      uid: verifyResult.value.uid,
    });

    // 3) 成功契約を確認する
    expectOkValue(deleteResult, null);
  });

  it("deleteUser: 削除済み uid を再削除すると AUTH_INVALID", async () => {
    // 1) 有効ユーザーを作って uid を取る
    const idToken = await createVerifiedTestUserAndFetchIdToken();
    const identityAdminPort = createFirebaseIdentityAdminPort();

    const verifyResult =
      await identityAdminPort.verifyIdTokenForSensitiveAction({ idToken });
    expectOkValue(
      verifyResult,
      expect.objectContaining({
        uid: expect.stringMatching(/\S/),
      }),
    );

    // 2) 1回目の削除は成功させる
    const firstDeleteResult = await identityAdminPort.deleteUser({
      uid: verifyResult.value.uid,
    });
    expectOkValue(firstDeleteResult, null);

    // 3) 同じ uid を再削除すると対象が無効扱いになる
    const secondDeleteResult = await identityAdminPort.deleteUser({
      uid: verifyResult.value.uid,
    });

    // 4) 代表契約として AUTH_INVALID を確認する
    expectErrCode(secondDeleteResult, errorCode.AUTH_INVALID, {
      shouldClearSessionCookie: true,
    });
  });
});
