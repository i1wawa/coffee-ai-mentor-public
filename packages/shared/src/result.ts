// packages/shared/src/result.ts
// ============================================================================
// 概要:
// - 成功/失敗を型で表す Result / HttpResult を提供する
//
// 責務:
// - Result: 失敗時に value を持たない（嘘の value を作らない）
// - HttpResult: HTTP境界で「常に value を返す」ため、失敗時も value を持てる
//
// 契約:
// - Result: ok=true なら value、ok=false なら error（value は存在しない）
// - HttpResult: ok=true/false とも value を持つ。error は ok=false のときのみ
// ============================================================================

/**
 * 汎用Result
 * - 成功: ok=true, value を持つ
 * - 失敗: ok=false, error を持つ（valueは持たない）
 *
 * 使いどころ:
 * - Server Action
 * - ドメインロジック
 * - 値が作れない失敗が自然に起きる箇所
 */
export type Result<T, E> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      error: E;
    };

/**
 * HTTP境界向けResult
 * - 成功/失敗どちらでも value を持つ
 *
 * 使いどころ:
 * - Route Handler のように「必ず Response を返す」契約を作りたい箇所
 *
 * 注意:
 * - ok=false のときだけ error が存在する
 */
export type HttpResult<T, E> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      value: T;
      error: E;
    };

/**
 * 成功Resultを作る
 * - ok: true の書き忘れ防止
 */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/**
 * 失敗Resultを作る
 * - ok: false の書き忘れ防止
 */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/**
 * HTTP境界向けの成功Resultを作る
 * - Route Handler の戻り値を簡潔に書きたい場合に使う
 */
export function okHttp<T>(value: T): HttpResult<T, never> {
  return { ok: true, value };
}

/**
 * HTTP境界向けの失敗Resultを作る
 * - 失敗でも value（例: エラーレスポンスResponse）を持てる
 */
export function errHttp<T, E>(value: T, error: E): HttpResult<T, E> {
  return { ok: false, value, error };
}
