// apps/web/src/frontend/shared/firebase/extract-firebase-auth-code.client.ts
// ================================================================
// 概要:
// - Firebase Auth Web SDK の例外から、エラー識別に使えるメタ情報を安全に抽出する
// - apps/web/scripts/dev/firebase-auth-web-sdk-error-extract.mjs で検証済み
//
// 責務:
// - unknown な例外から code / name / message を防御的に読み取る
// - Firebase 固有の型に依存しない形で情報を返す
//
// 前提:
// - Firebase の例外は code / name / message を持つことが多いが、常に保証されるわけではない
// - client 側で使用されるため、型・実体ともに最小限に扱う
// ================================================================

export type FirebaseAuthWebSdkErrorMeta = {
  code?: string;
  name?: string;
  message?: string;
};

export function extractFirebaseAuthWebSdkErrorMeta(
  err: unknown,
): FirebaseAuthWebSdkErrorMeta {
  // 1) object 以外はプロパティを読めない
  if (!err || typeof err !== "object") {
    return {};
  }

  // 2) code
  const rawCode = (err as { code?: unknown }).code;
  const code = typeof rawCode === "string" ? rawCode : undefined;

  // 3) name
  const rawName = (err as { name?: unknown }).name;
  const name = typeof rawName === "string" ? rawName : undefined;

  // 4) message
  const rawMessage = (err as { message?: unknown }).message;
  const message = typeof rawMessage === "string" ? rawMessage : undefined;

  return { code, name, message };
}
