// apps/web/src/frontend/shared/firebase/firebase-auth.ts
// ================================================================
// 概要:
// - Firebase Auth（フロント共通, client-only）
// - Popup サインインで idToken を取得して返す
//
// 責務:
// - 永続化を inMemoryPersistence に統一（起動中 1 回だけ設定）
// - signInWithPopup を実行し、idToken を取得して trim する
// - idToken が空なら失敗にする
// - signOut で Firebase Auth の in-memory 状態を破棄する
//
// 前提:
// - 認証状態の正はサーバ発行の session cookie。ブラウザ永続化は使わない
// ================================================================

import "client-only";

import {
  buildErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { err, ok, type Result } from "@packages/shared/src/result";
import {
  type AuthProvider,
  signOut as firebaseSignOut,
  inMemoryPersistence,
  setPersistence,
  signInWithPopup,
} from "firebase/auth";
import type { TelemetryErrorFields } from "@/frontend/shared/errors/telemetry-error-result";
import { TELEMETRY_OPERATION } from "@/frontend/shared/observability/telemetry-tags";
import { auth } from "./firebase-app";
import { mapFirebaseAuthErrorToModelError } from "./firebase-auth-error.mapper";

// 永続化設定の完了を待つための Promise
let persistenceReadyPromise: Promise<void> | null = null;

// 永続化設定はアプリ起動中に1回だけ行う
async function ensureInMemoryPersistence(): Promise<void> {
  if (!persistenceReadyPromise) {
    persistenceReadyPromise = setPersistence(auth, inMemoryPersistence).catch(
      (error: unknown) => {
        // setPersistence が失敗した場合、次回呼び出しで再試行できるようにする
        persistenceReadyPromise = null;
        throw error;
      },
    );
  }
  await persistenceReadyPromise;
}

/**
 * Popupサインインして idToken を取得する。
 *
 * 返り値
 * - 成功: { idToken }（trim済み）
 * - 失敗: ErrorFields
 */
export async function signInWithPopupAndGetIdToken(args: {
  provider: AuthProvider;
}): Promise<Result<{ idToken: string }, TelemetryErrorFields>> {
  try {
    // 1) 永続化をメモリのみへ固定するシングルトン初期化
    // - cookieセッションを正とし、ブラウザ永続化を避ける
    // - setPersistence の利用は Firebase Auth の推奨設定の一つ（公式推奨）
    await ensureInMemoryPersistence();

    // 2) Popupサインインを実行する
    const cred = await signInWithPopup(auth, args.provider);

    // 3) ID Token を取得する
    const rawIdToken = await cred.user.getIdToken();

    // 4) 外部入力として扱い trim する
    const idToken = rawIdToken.trim();

    // 5) 空は契約違反なので失敗にする
    // - 空のままサーバへ送ると障害解析が難しくなる
    if (!idToken) {
      return err(buildErrorFields(errorCode.INTERNAL_ERROR));
    }

    return ok({ idToken });
  } catch (e) {
    // 6) unknown を ModelErrorFields に正規化する
    // SDK 例外は分類して Result で返す
    // cause を同梱して上位で stack を失わないようにする
    return err(
      mapFirebaseAuthErrorToModelError(
        e,
        TELEMETRY_OPERATION.SIGN_IN_WITH_POPUP,
      ),
    );
  }
}

/**
 * Firebase Auth のサインアウトを実行する
 * - Firebase の in-memory 状態クリア
 */
export async function signOutFirebase(): Promise<
  Result<void, TelemetryErrorFields>
> {
  try {
    // 1) サインアウトを実行する
    await firebaseSignOut(auth);

    return ok(undefined);
  } catch (e) {
    // 2) unknown を ModelErrorFields に正規化する
    // SDK 例外は分類して Result で返す
    // cause を同梱して上位で stack を失わないようにする
    return err(
      mapFirebaseAuthErrorToModelError(e, TELEMETRY_OPERATION.SIGN_OUT),
    );
  }
}
