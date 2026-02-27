// packages/errors/src/assert.ts
// ================================================================
// 概要:
// - 到達不能（契約違反）を実行時に検出して例外で停止するユーティリティ
//
// 責務:
// - exhaustive switch（網羅的な分岐）の抜けをコンパイル時に検出できる形にする
// - それでも実行時に到達した場合は「バグ」として即座に停止する
// ================================================================

/**
 * 到達不能（契約違反）を表すユーティリティ
 * - exhaustive switch を強制するために使う
 * - 実行時に到達したらバグなので例外で落とす
 */
export function assertUnreachable(value: never, context?: string): never {
  const ctx = context ? ` context=${context}` : "";
  throw new Error(`Unreachable${ctx}: ${String(value)}`);
}
