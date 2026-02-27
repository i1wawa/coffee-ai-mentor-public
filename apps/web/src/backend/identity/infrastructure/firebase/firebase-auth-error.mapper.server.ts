// apps/web/src/backend/identity/infrastructure/firebase/firebase-auth-error.mapper.server.ts
// ================================================================
// 概要:
// - Firebase Admin SDK の例外を、アプリ共通の errorCode に変換する mapper
// - OAuth ポップアップサインイン関連のみを想定
//
// 責務:
// - Firebase の auth/* コードを「行動が変わる粒度」で分類する
//   https://firebase.google.com/docs/auth/admin/errors?hl=ja
// - 調査用に firebaseAuthCode を付与する（公開レスポンスには載せない）
//
// 契約:
// - 同じ auth/* でも operation により分類が変わる
// ================================================================

import "server-only";

import {
  buildErrorFields,
  type ErrorCode,
  type ErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { extractFirebaseAuthCode } from "./extract-firebase-auth-code";

// ---------------------------------------------------------------
// 内部ユーティリティ
// ---------------------------------------------------------------

/**
 * どの Admin SDK 操作で発生した例外か
 * - 同じ Firebase のコードでも、操作によって望ましい挙動が違う場合がある
 *   - 例: invalid-argument は verifyIdToken では 400 寄り
 *   - 例: verifySessionCookie では cookie 破損なので 401 寄り
 */
export const FIREBASE_AUTH_OPERATION = {
  VERIFY_SESSION_COOKIE: "VERIFY_SESSION_COOKIE",
  VERIFY_ID_TOKEN: "VERIFY_ID_TOKEN",
  CREATE_SESSION_COOKIE: "CREATE_SESSION_COOKIE",
  REVOKE_REFRESH_TOKENS: "REVOKE_REFRESH_TOKENS",
  DELETE_USER: "DELETE_USER",
} as const;
export type FirebaseAuthOperation =
  (typeof FIREBASE_AUTH_OPERATION)[keyof typeof FIREBASE_AUTH_OPERATION];

// revoke 対象が無効な代表コード
// - revoke は uid を対象にするため、user-not-found などが起き得る
const REVOKE_TARGET_INVALID = new Set<string>([
  "auth/user-not-found",
  "auth/user-disabled",
]);

// delete 対象が無効な代表コード
// - 退会の削除対象が既に存在しない、または無効化されている場合に起き得る
// - このケースは「そのセッションで操作を続けられない」寄りなので、cookie掃除を促す分類にする
const DELETE_TARGET_INVALID = new Set<string>([
  "auth/user-not-found",
  "auth/user-disabled",
]);

/**
 * Firebase Admin SDK の例外を、アプリ共通のエラー形式に変換
 */
export type FirebaseAuthErrorMapping = {
  error: ErrorFields;
  // セッション cookie を削除するべきか
  // - true のときのみ Set-Cookie で削除cookieを返す
  // - サインアウト誤爆を防ぐため、必要最小限にする
  shouldClearSessionCookie: boolean;
  // 内部ログ向け（公開レスポンスには入れない）
  firebaseAuthCode?: string;
};

/**
 * Firebase Admin SDK の例外を、アプリ共通のエラー形式に変換
 */
function buildFirebaseAuthErrorMapping(
  errorCode: ErrorCode,
  firebaseAuthCode: string | undefined,
  shouldClearSessionCookie: boolean,
): FirebaseAuthErrorMapping {
  const error = buildErrorFields(errorCode);
  return {
    error,
    // セッション cookie を削除するべきか
    shouldClearSessionCookie,
    // 内部ログ向け（公開レスポンスには入れない）
    firebaseAuthCode,
  };
}

// ---------------------------------------------------------------
// 行動が変わる代表コードだけを拾う Set 群
// - Set にしておくと、追加や削除が安全にできる
// - 文字列の OR 連結より読みやすく、差分も追いやすい
// ---------------------------------------------------------------

// レート制限
// - クライアント側は待ってリトライが筋
const RETRYABLE_RATE_LIMIT = new Set<string>(["auth/too-many-requests"]);

// 一時障害
// - クライアント側はリトライが筋
const RETRYABLE_TEMPORARY = new Set<string>(["auth/internal-error"]);

// サーバ設定/権限/プロジェクト系
// - ユーザー行動では直らない
// - 運用側の設定確認が必要
const SERVER_MISCONFIG = new Set<string>([
  "auth/invalid-credential",
  "auth/insufficient-permission",
  "auth/project-not-found",
]);

// ID token が無効
// - クライアントが token を取り直すか再サインインするのが筋
// - セッションcookie削除とは無関係
const ID_TOKEN_INVALID = new Set<string>([
  "auth/invalid-id-token",
  "auth/id-token-expired",
  "auth/id-token-revoked",
]);

// セッション cookie が無効
// - cookie を保持し続けても 401 がループするので削除が筋
// - expired / revoked / user-disabled / user-not-found は代表例
const SESSION_COOKIE_INVALID = new Set<string>([
  "auth/session-cookie-expired",
  "auth/session-cookie-revoked",
  "auth/user-disabled",
  "auth/user-not-found",

  // 実測: 壊れた cookie で出た
  "auth/argument-error",

  // 互換吸収
  // - 実運用で観測されたらここで吸収できるようにする
  "auth/invalid-session-cookie",
]);

// 引数不正
// - verifyIdToken / createSessionCookie では 400 寄りにしたい
// - ただし verifySessionCookie では cookie 破損の可能性が高いので別扱いする
const INVALID_ARGUMENT = new Set<string>(["auth/invalid-argument"]);

// session cookie の有効期限設定（expiresIn）の不正
// - createSessionCookie の設定ミス
const INVALID_SESSION_COOKIE_DURATION = new Set<string>([
  "auth/invalid-session-cookie-duration",
]);

// ---------------------------------------------------------------
// メイン関数
// - 行動が変わる分だけ分類する
// - 未知コードは安全側へ倒す
// ---------------------------------------------------------------

/**
 * Firebase Admin SDK の例外を、アプリ共通のエラー形式に変換
 * - OAuth ポップアップサインイン関連のみを想定
 * - cookie が空の場合は想定外なので、呼び出し元で弾くこと
 *
 * 目的:
 * - Firebase のエラーコード文字列を、行動が変わる粒度で分類する
 * - 誤ってユーザーをサインアウトさせないため、セッションCookie削除の要否は明示的に返す
 */
export function mapFirebaseAuthError(
  error: unknown,
  operation: FirebaseAuthOperation,
): FirebaseAuthErrorMapping {
  // 1) code を取り出す
  const firebaseAuthCode = extractFirebaseAuthCode(error);

  // 2) code が取れない場合
  // - 例外型が想定外、または SDK が code を付けない
  // - ここで AUTH_INVALID に倒すと、誤爆サインアウトになり得る
  // - まずは一時障害として扱い、運用で調査できるようにする
  if (!firebaseAuthCode) {
    return buildFirebaseAuthErrorMapping(
      errorCode.UNAVAILABLE,
      undefined,
      false,
    );
  }

  // 3) レート制限
  // - 行動: 待つ/リトライ
  if (RETRYABLE_RATE_LIMIT.has(firebaseAuthCode)) {
    return buildFirebaseAuthErrorMapping(
      errorCode.RATE_LIMITED,
      firebaseAuthCode,
      false,
    );
  }

  // 4) 一時障害
  // - 行動: リトライ
  if (RETRYABLE_TEMPORARY.has(firebaseAuthCode)) {
    return buildFirebaseAuthErrorMapping(
      errorCode.UNAVAILABLE,
      firebaseAuthCode,
      false,
    );
  }

  // 5) サーバ設定/権限/プロジェクト系
  // - 行動: 運用調査
  if (SERVER_MISCONFIG.has(firebaseAuthCode)) {
    return buildFirebaseAuthErrorMapping(
      errorCode.INTERNAL_ERROR,
      firebaseAuthCode,
      false,
    );
  }

  // 6) 操作別の分類
  // - 同じコードでも、操作によって 400/401 や cookie削除の判断が変わる

  // 6-1) セッション cookie 検証
  if (operation === FIREBASE_AUTH_OPERATION.VERIFY_SESSION_COOKIE) {
    // cookie 無効系
    // - 行動: cookie を削除して再サインインさせる
    if (SESSION_COOKIE_INVALID.has(firebaseAuthCode)) {
      return buildFirebaseAuthErrorMapping(
        errorCode.AUTH_INVALID,
        firebaseAuthCode,
        true,
      );
    }

    // 間違って idToken のエラーがここに来る場合
    // - 例: cookie として idToken を渡してしまっている等
    // - 行動としては認証できないので 401 に寄せる
    // - cookie は一度クリアしておく方が正常化しやすい
    if (ID_TOKEN_INVALID.has(firebaseAuthCode)) {
      return buildFirebaseAuthErrorMapping(
        errorCode.AUTH_INVALID,
        firebaseAuthCode,
        true,
      );
    }

    // auth/invalid-argument や auth/argument-error がここに来た場合
    // - cookie が壊れている可能性が高い
    // - ここでは 401 寄りに倒し、cookie削除も行う
    if (INVALID_ARGUMENT.has(firebaseAuthCode)) {
      return buildFirebaseAuthErrorMapping(
        errorCode.AUTH_INVALID,
        firebaseAuthCode,
        true,
      );
    }

    // フォールバック
    // - ここで安易に AUTH_INVALID にすると誤爆サインアウトが起きうる
    // - 一時障害として扱い、運用で firebaseAuthCode を見て判断する
    return buildFirebaseAuthErrorMapping(
      errorCode.UNAVAILABLE,
      firebaseAuthCode,
      false,
    );
  }

  // 6-2) ID token 検証
  if (operation === FIREBASE_AUTH_OPERATION.VERIFY_ID_TOKEN) {
    // token 無効系
    // - 行動: token 再取得 or 再サインイン
    if (ID_TOKEN_INVALID.has(firebaseAuthCode)) {
      return buildFirebaseAuthErrorMapping(
        errorCode.AUTH_INVALID,
        firebaseAuthCode,
        false,
      );
    }

    // 引数不正
    // - 行動: リクエスト修正（クライアント実装の問題になりがち）
    // - ここで 401 にすると、誤って再サインイン誘導になる
    if (INVALID_ARGUMENT.has(firebaseAuthCode)) {
      return buildFirebaseAuthErrorMapping(
        errorCode.VALIDATION_FAILED,
        firebaseAuthCode,
        false,
      );
    }

    // フォールバック
    // - auth/* を全部 AUTH_INVALID に倒すと誤誘導しやすい
    // - 一時障害寄りで返して、運用で調査できるようにする
    return buildFirebaseAuthErrorMapping(
      errorCode.UNAVAILABLE,
      firebaseAuthCode,
      false,
    );
  }

  // 6-3) session cookie 発行
  if (operation === FIREBASE_AUTH_OPERATION.CREATE_SESSION_COOKIE) {
    // token 無効系
    // - 行動: token 再取得 or 再サインイン
    if (ID_TOKEN_INVALID.has(firebaseAuthCode)) {
      return buildFirebaseAuthErrorMapping(
        errorCode.AUTH_INVALID,
        firebaseAuthCode,
        false,
      );
    }

    // expiresIn の範囲外
    // - 行動: サーバ設定修正
    if (INVALID_SESSION_COOKIE_DURATION.has(firebaseAuthCode)) {
      return buildFirebaseAuthErrorMapping(
        errorCode.INTERNAL_ERROR,
        firebaseAuthCode,
        false,
      );
    }

    // 引数不正
    // - 行動: リクエスト修正、またはサーバ実装のバグ修正
    if (INVALID_ARGUMENT.has(firebaseAuthCode)) {
      return buildFirebaseAuthErrorMapping(
        errorCode.VALIDATION_FAILED,
        firebaseAuthCode,
        false,
      );
    }

    // フォールバック
    // - createSessionCookie で未知の auth/* が出るなら上流側問題の可能性が高い
    // - 一時障害寄りで返して、運用で調査
    return buildFirebaseAuthErrorMapping(
      errorCode.UNAVAILABLE,
      firebaseAuthCode,
      false,
    );
  }

  // 6-4) refresh tokens revoke（全端末サインアウト）
  if (operation === FIREBASE_AUTH_OPERATION.REVOKE_REFRESH_TOKENS) {
    // 対象ユーザーが無効
    // - 行動: セッションは成立しないため 401 寄り
    // - cookie 削除は true に寄せる（正常化しやすい）
    if (REVOKE_TARGET_INVALID.has(firebaseAuthCode)) {
      return buildFirebaseAuthErrorMapping(
        errorCode.AUTH_INVALID,
        firebaseAuthCode,
        true,
      );
    }

    // 引数不正
    // - 行動: 実装バグや入力の問題
    if (INVALID_ARGUMENT.has(firebaseAuthCode)) {
      return buildFirebaseAuthErrorMapping(
        errorCode.VALIDATION_FAILED,
        firebaseAuthCode,
        false,
      );
    }

    // フォールバック
    // - 未知コードは一時障害寄りに倒し、運用で調査する
    return buildFirebaseAuthErrorMapping(
      errorCode.UNAVAILABLE,
      firebaseAuthCode,
      false,
    );
  }

  // 6-5) delete user（退会など）
  if (operation === FIREBASE_AUTH_OPERATION.DELETE_USER) {
    // 対象ユーザーが無効
    // - 行動: セッションは成立しないため 401 寄り
    // - cookie 削除は true に寄せる（正常化しやすい）
    if (DELETE_TARGET_INVALID.has(firebaseAuthCode)) {
      return buildFirebaseAuthErrorMapping(
        errorCode.AUTH_INVALID,
        firebaseAuthCode,
        true,
      );
    }

    // 引数不正
    // - 行動: 実装バグや入力の問題
    if (INVALID_ARGUMENT.has(firebaseAuthCode)) {
      return buildFirebaseAuthErrorMapping(
        errorCode.VALIDATION_FAILED,
        firebaseAuthCode,
        false,
      );
    }

    // フォールバック
    // - 未知コードは一時障害寄りに倒し、運用で調査する
    // - 退会の失敗で巻き添えサインアウトを起こさないため、cookie は維持する
    return buildFirebaseAuthErrorMapping(
      errorCode.UNAVAILABLE,
      firebaseAuthCode,
      false,
    );
  }

  // 7) 型的にここには来ない想定だが、安全のため
  return buildFirebaseAuthErrorMapping(
    errorCode.UNAVAILABLE,
    firebaseAuthCode,
    false,
  );
}
