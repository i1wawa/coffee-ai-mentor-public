// apps/web/src/backend/composition/identity.composition.server.ts
// ================================================================
// 概要:
// - identity の Composition Root
//
// 責務:
// - identity usecase 向け deps を合成して返す
// - adapter（具体実装）の選択をここに集約する
//
// 注意:
// - 現状の port は stateless 想定だが、将来 request-scoped な情報を注入する場合は共有しない
// ================================================================

import "server-only";

import type { DeleteUserMeDeps } from "@/backend/identity/applications/delete-user-me.usecase.server";
import type { GetAuthSessionStatusDeps } from "@/backend/identity/applications/get-auth-session-status.usecase.server";
import type { GetSessionUserDeps } from "@/backend/identity/applications/get-session-user.usecase.server";
import type { IssueAuthSessionCookieDeps } from "@/backend/identity/applications/issue-auth-session-cookie.usecase.server";
import type { RevokeAuthSessionDeps } from "@/backend/identity/applications/revoke-auth-session.usecase.server";
import { createFirebaseIdentityAdminPort } from "@/backend/identity/infrastructure/firebase/firebase-identity-admin.adapter.server";
import { createFirebaseSessionAuthPort } from "@/backend/identity/infrastructure/firebase/firebase-session-auth.adapter.server";

// ---------------------------------------------------------------
// ライフサイクル方針
// - まずは毎リクエスト生成に寄せる
// - 理由: 事故りにくい、追跡しやすい、最適化は後からできる
//
// 注意
// - createFirebaseSessionAuthPort は現状 stateless に見えるので共有も可能
// - ただし将来 request-scoped な依存（requestId を含む logger など）を
//   port に注入する設計に拡張した場合、共有すると情報リークの事故が起きる
// ---------------------------------------------------------------

/**
 * identity の deps を合成する。
 *
 * 使い方
 * - Route Handler / Server Action の先頭で 1 回呼ぶ
 * - 返ってきた deps を usecase に渡す
 */
export function createIdentityDeps(): {
  deleteUserMeDeps: DeleteUserMeDeps;
  getAuthSessionStatusDeps: GetAuthSessionStatusDeps;
  getSessionUserDeps: GetSessionUserDeps;
  issueAuthSessionCookieDeps: IssueAuthSessionCookieDeps;
  revokeAuthSessionDeps: RevokeAuthSessionDeps;
} {
  // 1) SessionAuthPort の具体をここで選ぶ
  // - 本番は Firebase Admin SDK adapter
  const sessionAuth = createFirebaseSessionAuthPort();

  // 2) IdentityAdminPort の具体をここで選ぶ
  const identityAdmin = createFirebaseIdentityAdminPort();

  // 3) clock はユースケースのテスト容易性のため依存として注入する
  const clock = { nowMs: () => Date.now() };

  // 4) usecase ごとの deps を返す
  // - port は必要な範囲で共有する（stateless 想定）
  return {
    deleteUserMeDeps: { sessionAuth, identityAdmin, clock },
    getAuthSessionStatusDeps: { sessionAuth },
    getSessionUserDeps: { sessionAuth },
    issueAuthSessionCookieDeps: { sessionAuth },
    revokeAuthSessionDeps: { sessionAuth },
  };
}
