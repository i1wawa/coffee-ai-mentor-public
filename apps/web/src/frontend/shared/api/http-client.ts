// apps/web/src/frontend/shared/api/http-client.ts
// ================================================================
// 概要:
// - フロントエンド共通の HTTP Client（fetch ラッパ）
//
// 責務:
// - fetch 呼び出しを集約し、共通オプションを固定する
// - 認証Cookie前提として credentials="include" を統一する
// - APIレスポンス契約（ok/error）だけを解釈して Result に変換する
//
// 契約:
// - 成功: { ok: true, data: T }
// - 失敗: { ok: false, error: { errorId, errorCode } }
// ================================================================

import "client-only";

import {
  buildErrorFields,
  type ErrorFields,
  errorCode,
  isErrorFields,
} from "@packages/observability/src/logging/telemetry-error-common";
import { mapHttpStatusCodeToErrorCode } from "@packages/observability/src/logging/telemetry-error-http-mapping";
import { err, ok, type Result } from "@packages/shared/src/result";

// ---------------------------------------------------------------
// API Body 型
// - フロントはこれだけを信じる
// ---------------------------------------------------------------

export type ApiOkBody<T> = {
  ok: true;
  data: T;
};

export type ApiErrorBody = {
  ok: false;
  error: ErrorFields;
};

// ---------------------------------------------------------------
// 小さな型ガード
// - JSONの形を検査するだけ
// ---------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function parseApiErrorBody(json: unknown): ErrorFields | null {
  // 1) 形を検査する
  if (!isRecord(json)) return null;

  // 2) ok=false を期待
  if (json.ok !== false) return null;

  // 3) error を期待
  const error = json.error;
  if (!isErrorFields(error)) return null;

  return error;
}

function parseApiOkBody<T>(json: unknown): ApiOkBody<T> | null {
  // 1) 形を検査する
  if (!isRecord(json)) return null;

  // 2) ok=true を期待
  if (json.ok !== true) return null;

  // 3) data は必須（形は任意）
  if (!("data" in json)) return null;

  // 4) data は任意の形を許容する
  return json as ApiOkBody<T>;
}

// ---------------------------------------------------------------
// 共通ユーティリティ
// ---------------------------------------------------------------

async function safeReadJson(res: Response): Promise<unknown | null> {
  // 1) JSONパース失敗は null 扱いにする
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * 同一オリジンに限定するための URL ガード
 * - credentials include を固定するなら誤爆を絶対に避けたい
 * - 絶対URLや別オリジンをここで拒否する
 */
function assertSameOriginPath(url: string): Result<string, ErrorFields> {
  // / 始まりだけ許可する
  // - /api/... の相対パス前提に固定する
  // - https://... のような絶対URLを禁止する
  const trimmed = url.trim();
  if (!trimmed.startsWith("/")) {
    return err(buildErrorFields(errorCode.INTERNAL_ERROR));
  }
  return ok(trimmed);
}

/**
 * body を安全に JSON 文字列化する
 * - body が undefined のときは undefined を返す（fetch に body を渡さないため）
 */
function serializeRequestBody(
  body: unknown,
): Result<string | undefined, ErrorFields> {
  // 1) body が無いときは undefined を返す
  // - fetch に body を渡さない
  if (body === undefined) {
    return ok(undefined);
  }

  // 2) body があるときは JSON 文字列へ変換する
  // - JSON.stringify 失敗時は throw させず INTERNAL_ERROR を返す
  try {
    return ok(JSON.stringify(body));
  } catch {
    return err(buildErrorFields(errorCode.INTERNAL_ERROR));
  }
}

// ---------------------------------------------------------------
// 共通 fetch
// ---------------------------------------------------------------

/**
 * 共通リクエスト
 *
 * 目的
 * - GET と POST の重複を減らす
 * - 誤爆防止の共通設定を 1箇所に集約する
 */
async function requestJson<T>(args: {
  url: string;
  method: "GET" | "POST" | "DELETE";
  body?: unknown;
  headers?: HeadersInit;
}): Promise<Result<T, ErrorFields>> {
  // 1) URL を同一オリジンパスに限定する
  const guardedUrl = assertSameOriginPath(args.url);
  if (!guardedUrl.ok) return guardedUrl;

  // 2) body を安全に JSON 文字列化する
  const jsonBodyResult = serializeRequestBody(args.body);
  if (!jsonBodyResult.ok) return jsonBodyResult;
  const jsonBody = jsonBodyResult.value;

  try {
    // 3) fetch オプションを統一する
    const res = await fetch(guardedUrl.value, {
      method: args.method,
      headers: {
        ...args.headers,
        accept: "application/json",
        // body があるときだけ content-type を付与する
        ...(jsonBody === undefined
          ? {}
          : { "content-type": "application/json" }),
      },
      // same-origin に固定する
      // - ブラウザ側で別オリジン通信を拒否する
      mode: "same-origin",
      // Cookie前提のため include 固定
      credentials: "include",
      // cache は no-store に固定する
      // - 認証系はキャッシュで事故りやすい
      // - ブラウザ側で完全保証ではないが 意図を明示できる
      cache: "no-store",
      // body があるときだけ付ける
      body: jsonBody,
    });

    // 4) 2xx は成功ボディを期待する
    if (res.ok) {
      const json = await safeReadJson(res);
      const okBody = parseApiOkBody<T>(json);

      // 成功なのに形が違うのは契約違反
      if (!okBody) {
        return err(buildErrorFields(errorCode.INTERNAL_ERROR));
      }

      return ok(okBody.data);
    }

    // 5) 2xx 以外は失敗ボディを期待する
    const json = await safeReadJson(res);
    const errorFields = parseApiErrorBody(json);

    // 失敗なのに形が違うのも契約違反
    if (!errorFields) {
      // 契約外レスポンスは HTTP ステータスで最小分類する
      const code = mapHttpStatusCodeToErrorCode(res.status);
      return err(buildErrorFields(code));
    }

    return err(errorFields);
  } catch {
    // 6) fetch 例外は通信異常として扱う
    return err(buildErrorFields(errorCode.UNAVAILABLE));
  }
}

/**
 * GET JSON
 */
export async function getJson<T>(args: {
  url: string;
  headers?: HeadersInit;
}): Promise<Result<T, ErrorFields>> {
  return await requestJson<T>({
    url: args.url,
    method: "GET",
    headers: args.headers,
  });
}

/**
 * POST JSON
 */
export async function postJson<T>(args: {
  url: string;
  body?: unknown;
  headers?: HeadersInit;
}): Promise<Result<T, ErrorFields>> {
  return await requestJson<T>({
    url: args.url,
    method: "POST",
    body: args.body,
    headers: args.headers,
  });
}

/**
 * DELETE JSON
 */
export async function deleteJson<T>(args: {
  url: string;
  body?: unknown;
  headers?: HeadersInit;
}): Promise<Result<T, ErrorFields>> {
  return await requestJson<T>({
    url: args.url,
    method: "DELETE",
    body: args.body,
    headers: args.headers,
  });
}
