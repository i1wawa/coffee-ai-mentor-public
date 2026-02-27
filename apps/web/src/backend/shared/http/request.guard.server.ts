// apps/web/src/backend/shared/http/request.guard.server.ts
// ================================================================
// 概要:
// - HTTP 境界で使う共通ガード関数と上限値をまとめる
//
// 責務:
// - 認証セッションポリシー定義（セッション有効期限）
// - キャッシュ制御ヘッダ作成
// - Content-Type ガード
// - サイズガード（Content-Length チェック、ボディ読み取り）
// - 文字列ガード（トリム済み文字列化、上限長チェック）
// ================================================================

import "server-only";

import * as z from "zod";

// ----------------------------------------------------------------
// HTTP 境界の “防御目的” の上限値
// - 外部入力を読む前に落とす（DoS対策 / 無駄な例外ログ抑制）
// ----------------------------------------------------------------

/**
 * JSON ボディ最大サイズ（Content-Length で読む前に弾く）
 * - idToken は通常 数KB 程度なので余裕を持たせる
 */
export const MAX_JSON_BODY_BYTES = 32 * 1024; // 32KB

/**
 * セッション cookie の最大長（異常入力を早期 reject）
 * - Firebase のセッション cookie（JWT相当）は通常 数KB 程度
 */
export const MAX_SESSION_COOKIE_CHARS = 10_000;

// ----------------------------------------------------------------
//  認証セッションのポリシー
// ----------------------------------------------------------------

/**
 * セッション有効期限（5日）
 */
export const SESSION_EXPIRES_IN_MS = 1000 * 60 * 60 * 24 * 5; // 5日

// ----------------------------------------------------------------
// キャッシュ制御
// ----------------------------------------------------------------

/**
 * no-store を強制した Headers を作る
 */
export function createNoStoreHeaders(extra?: HeadersInit): Headers {
  // 1) まず extra を反映する
  const headers = new Headers(extra);

  // 2) no-store を必ず付ける
  headers.set("cache-control", "no-store");

  return headers;
}

// ----------------------------------------------------------------
// Content-Type ガード
// ----------------------------------------------------------------

// ヘッダ値を正規化した文字列として取得する
function getNormalizedHeaderValue(req: Request, headerName: string): string {
  const v = req.headers.get(headerName);
  if (!v) return "";
  return v.trim().toLowerCase();
}

/**
 * Content-Type が JSON かどうかを判定する
 */
export function isJsonContentType(req: Request): boolean {
  const contentType = getNormalizedHeaderValue(req, "content-type");
  return contentType.includes("application/json");
}

// ----------------------------------------------------------------
// サイズガード
// ----------------------------------------------------------------

// Content-Length をバイト数として読む
function getContentLengthBytes(req: Request): number | null {
  const raw = req.headers.get("content-length");
  if (!raw) return null;

  // 1) 数値化できないなら null
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;

  // 2) 負の値は不正なので null
  if (n < 0) return null;

  return n;
}

/**
 * Content-Length から、ボディが上限を超えているか判定する
 */
export function isBodyTooLargeByContentLength(
  req: Request,
  maxBytes?: number,
): boolean {
  // 1) 上限値を決める
  maxBytes = maxBytes ?? MAX_JSON_BODY_BYTES;

  // 2) maxBytes が不正なら守れないので、ここでは超過扱いにしない
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) return false;

  // 3) Content-Length が取れないなら判定不能なので false
  const lengthBytes = getContentLengthBytes(req);
  if (lengthBytes === null) return false;

  // 4) 上限超過なら true
  return lengthBytes > maxBytes;
}

// ----------------------------------------------------------------
// ボディ読み取り
// ----------------------------------------------------------------

/**
 * Uint8Array の配列を 1 つに結合する。
 *
 * 目的
 * - チャンクごとに文字列連結すると O(n^2) になりやすい
 * - 先に 1 回だけコピーしてから decode すると、挙動と性能が安定する
 */
function concatUint8Arrays(
  bodyByteChunks: Uint8Array[],
  totalBytes: number,
): Uint8Array {
  // 1) 最終サイズのバッファを確保する
  const merged = new Uint8Array(totalBytes);

  // 2) offset は次に書き込む位置
  let offset = 0;

  // 3) 各チャンクを順にコピーする
  for (const chunk of bodyByteChunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  // 4) 結合済みのバイト列を返す
  return merged;
}

/**
 * JSON を安全に読む。
 *
 * 目的
 * - JSON parse 失敗を例外にせず、呼び出し側で分岐できるようにする
 *
 * DoS対策
 * - Content-Length が無いケース（chunked 等）でも防御できるように、
 *   読み取り中に maxBytes を超えたら null を返す
 * - maxBytes を渡し忘れても防御が抜けないよう、デフォルトは MAX_JSON_BODY_BYTES を使う
 */
export async function safeReadJson<T>(
  req: Request,
  options?: { maxBytes?: number },
): Promise<T | null> {
  // 1) 上限値を決める
  const maxBytes = options?.maxBytes ?? MAX_JSON_BODY_BYTES;

  // 2) 上限が壊れている場合は守れないので null
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) return null;

  // 3) body が無い場合は読めない
  if (!req.body) return null;

  // 4) ReadableStream を自前で読み取る
  // - 読み取り途中で maxBytes を超えたら null を返す
  const reader = req.body.getReader();
  // ストリームの生データを正しく受け取れるように
  const bodyByteChunks: Uint8Array[] = [];
  let bufferedBytes = 0;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;

      bufferedBytes += value.byteLength;
      if (bufferedBytes > maxBytes) return null;
      bodyByteChunks.push(value);
    }

    // 5) 受け取ったチャンクを文字列化して JSON としてパースする
    const mergedBytes =
      bodyByteChunks.length === 1
        ? bodyByteChunks[0]
        : concatUint8Arrays(bodyByteChunks, bufferedBytes);
    const text = new TextDecoder().decode(mergedBytes);
    return JSON.parse(text) as T;
  } catch {
    return null;
  } finally {
    // 6) 念のため reader を閉じる
    try {
      await reader.cancel();
    } catch {
      // 何もしない
    }
  }
}

// ----------------------------------------------------------------
// 文字列ガード
// ----------------------------------------------------------------

// 外部入力をトリム済み文字列へ正規化する Zod スキーマ
// - string 以外は空文字に寄せる
// - string は前後空白を除去する
const trimmedStringSchema = z.preprocess((input) => {
  if (typeof input !== "string") return "";
  return input.trim();
}, z.string());

/**
 * 外部入力をトリム済み文字列に正規化する
 */
export function parseTrimmedString(input: unknown): string {
  return trimmedStringSchema.parse(input);
}

/**
 * 文字列が上限長を超えるか判定する
 */
export function isStringTooLong(value: string, maxChars: number): boolean {
  // 1) 上限が不正なら守れないので、ここでは超過扱いにしない
  if (!Number.isFinite(maxChars) || maxChars <= 0) return false;

  // 2) length は UTF-16 コードユニット数
  // - cookie や token の用途では十分
  return value.length > maxChars;
}
