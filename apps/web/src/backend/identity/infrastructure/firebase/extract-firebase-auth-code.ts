// apps/web/src/backend/identity/infrastructure/firebase/extract-firebase-auth-code.ts
// ================================================================
// 概要:
// - Firebase Admin SDK の例外から "auth/..." エラーコードを抽出する
//
// 契約:
// - 入力: unknown（例外オブジェクト想定）
// - 出力: "auth/..." を返す。見つからなければ undefined
//
// 前提:
// - エラーコードは err.code に入る（probe で確認済み）
// ================================================================

/**
 * Firebase Admin SDK の例外からエラーコードを取り出す。
 *
 * 返り値:
 * - "auth/..." が取れたらその文字列
 * - 取れなければ undefined
 */
export function extractFirebaseAuthCode(err: unknown): string | undefined {
  // 1) object 以外はプロパティを読めない
  if (!err || typeof err !== "object") return undefined;

  // 2) err.code
  // - 実測で err.code が取れている
  const directCode = (err as { code?: unknown }).code;
  if (typeof directCode === "string" && directCode.startsWith("auth/")) {
    return directCode;
  }

  // 3) 取れなかった
  return undefined;
}
