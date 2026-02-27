// apps/web/src/backend/identity/applications/identity-admin.port.ts
// ========================================================
// 概要:
// - identity の管理系操作を抽象化する Port
//
// 責務:
// - Firebase Admin SDK などの外部依存を Port の背後に閉じる
// ========================================================

import type { Result } from "@packages/shared/src/result";
import type { SessionAuthError } from "@/backend/identity/applications/session-auth.port";

export type IdentityAdminPort = {
  /**
   * idToken を検証し、必要なクレームだけ返す。
   * - authTime は秒で入る（UNIX epoch 秒）
   * - authTime が取得できない場合は null を返す
   *   - 呼び出し側は recent login 判定を失敗扱いにできる
   */
  verifyIdTokenForSensitiveAction: (args: {
    // Firebase Auth の ID Token
    // - 値そのものはログに出さない
    idToken: string;
  }) => Promise<
    Result<
      {
        uid: string;
        authTimeSeconds: number | null;
      },
      SessionAuthError
    >
  >;

  /**
   * ユーザーを削除する。
   * - この操作はセンシティブ。呼び出し側で recent login 判定を満たしてから呼ぶ。
   */
  deleteUser: (args: {
    uid: string;
  }) => Promise<Result<null, SessionAuthError>>;
};
