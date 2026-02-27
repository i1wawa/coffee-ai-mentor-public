// apps/web/src/backend/identity/applications/session-auth.port.ts
// ================================================================
// 概要:
// - セッション検証とセッションCookie発行を、認証基盤に依存しない形で提供する Outbound Port
//
// 契約:
// - verifySessionUser: sessionCookieValue を検証し、SessionUser または SessionAuthError を返す
// - issueSessionCookie: idToken を検証し、sessionCookieValue を発行して返す
// - revokeRefreshTokens: uid の refresh tokens を revoke し、以後の検証で revoked を検知可能にする
// ================================================================

import type { ErrorFields } from "@packages/observability/src/logging/telemetry-error-common";
import type { Result } from "@packages/shared/src/result";

/**
 * セッションから確定できるユーザー情報
 */
export type SessionUser = {
  uid: string;
  // recent login 判定などに使う
  // - Firebase の authTime（UNIX epoch 秒）
  // - セッション cookie から取得できない場合は undefined
  authTimeSeconds?: number;
};

/**
 * セッション検証の失敗
 * - shouldClearSessionCookie は HTTP 境界で Set-Cookie 削除を判断するために使う
 */
export type SessionAuthError = ErrorFields & {
  // true のときのみ session cookie を削除する Set-Cookie を返すのが望ましい
  // - 無効 cookie を保持し続けると 401 がループするため
  // - 一方で一時障害やレート制限で消すと誤爆サインアウトになるため
  shouldClearSessionCookie: boolean;
};

/**
 * outbound port 本体
 *
 * verifySessionUser
 * - セッション cookie を検証し、ユーザー情報を返す
 *
 * issueSessionCookie
 * - idToken を検証し、セッション cookie の値を発行して返す
 * - Set-Cookie は HTTP 境界（Route Handler）でやる
 * - ここは値を返すだけ
 */
export type SessionAuthPort = {
  /**
   * セッション cookie を検証し、ユーザー情報を返す。
   */
  verifySessionUser: (args: {
    // HttpOnly セッションCookieの値
    // - 値そのものはログに出さない
    sessionCookieValue: string;
  }) => Promise<Result<SessionUser, SessionAuthError>>;

  /**
   * idToken を検証し、セッション cookie の値を発行して返す。
   */
  issueSessionCookie: (args: {
    // Firebase Auth の ID Token
    // - 値そのものはログに出さない
    idToken: string;
    // セッション有効期限（ミリ秒）
    // - createSessionCookie の expiresIn に渡す
    expiresInMs: number;
  }) => Promise<
    Result<
      {
        // セッションCookieの値（Set-Cookie の value に使う）
        sessionCookieValue: string;
      },
      SessionAuthError
    >
  >;

  /**
   * 全端末サインアウト向けに refresh tokens を revoke する。
   *
   * 期待する効果:
   * - verifySessionCookie(checkRevoked=true) で revoked を検知できるようになる
   *
   * 注意:
   * - revoke はユーザー単位で効くため、通常サインアウトでは呼ばない
   */
  revokeRefreshTokens: (args: {
    uid: string;
  }) => Promise<Result<null, SessionAuthError>>;
};
