// apps/web/src/backend/shared/http/request.guard.server.test.ts
// ================================================================
// 概要:
// - request.guard.server.ts のユニットテスト
//
// 契約:
// - HTTP 境界の共通ガードは例外を投げず、boolean / number / string / null で返す
// - エンドポイント固有の返し方（status や errorCode 選択）は扱わない
// ================================================================

import { describe, expect, it } from "vitest";
import {
  createNoStoreHeaders,
  isBodyTooLargeByContentLength,
  isJsonContentType,
  isStringTooLong,
  MAX_JSON_BODY_BYTES,
  parseTrimmedString,
  safeReadJson,
} from "./request.guard.server";

// Request の組み立てを簡潔にする
// - headers と body を渡して書きやすくする
function buildRequest(params: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}): Request {
  return new Request("http://example.test", {
    method: params.method ?? "POST",
    headers: params.headers ?? {},
    body: params.body,
  });
}

describe("createNoStoreHeaders", () => {
  it("cache-control を no-store にする", () => {
    // 1) extra なし
    const headers = createNoStoreHeaders();

    // 2) no-store が必ず付く
    expect(headers.get("cache-control")).toBe("no-store");
  });

  it("追加ヘッダを保持しつつ no-store を付ける", () => {
    // 1) extra を渡す
    const headers = createNoStoreHeaders({ "x-test": "1" });

    // 2) extra は維持される
    expect(headers.get("x-test")).toBe("1");

    // 3) no-store は強制される
    expect(headers.get("cache-control")).toBe("no-store");
  });

  it("既存の cache-control は no-store で上書きする", () => {
    // 1) extra に cache-control があっても
    const headers = createNoStoreHeaders({ "cache-control": "public" });

    // 2) no-store に上書きされる
    expect(headers.get("cache-control")).toBe("no-store");
  });
});

describe("isJsonContentType", () => {
  it("application/json を含めば true", () => {
    // 1) 最小ケース
    const req = buildRequest({
      headers: { "content-type": "application/json" },
    });
    expect(isJsonContentType(req)).toBe(true);
  });

  it("charset などのパラメータが付いても true", () => {
    const req = buildRequest({
      headers: { "content-type": "application/json; charset=utf-8" },
    });
    expect(isJsonContentType(req)).toBe(true);
  });

  it("大文字混在でも true", () => {
    const req = buildRequest({
      headers: { "content-type": "APPLICATION/JSON" },
    });
    expect(isJsonContentType(req)).toBe(true);
  });

  it("前後に空白があっても true", () => {
    const req = buildRequest({
      headers: { "content-type": " Application/JSON; Charset=UTF-8 " },
    });
    expect(isJsonContentType(req)).toBe(true);
  });

  it("JSON 以外は false", () => {
    const req = buildRequest({ headers: { "content-type": "text/plain" } });
    expect(isJsonContentType(req)).toBe(false);
  });

  it("Content-Type が無ければ false", () => {
    const req = buildRequest({ headers: {} });
    expect(isJsonContentType(req)).toBe(false);
  });
});

describe("isBodyTooLargeByContentLength", () => {
  it("maxBytes 指定時: maxBytes が不正なら守れないので false を返す", () => {
    const req = buildRequest({ headers: { "content-length": "999" } });

    // 1) 0 以下
    expect(isBodyTooLargeByContentLength(req, 0)).toBe(false);
    expect(isBodyTooLargeByContentLength(req, -1)).toBe(false);

    // 2) NaN
    expect(isBodyTooLargeByContentLength(req, Number.NaN)).toBe(false);

    // 3) Infinity
    expect(isBodyTooLargeByContentLength(req, Number.POSITIVE_INFINITY)).toBe(
      false,
    );
  });

  it("Content-Length が無い場合は判定不能なので false", () => {
    const req = buildRequest({ headers: {} });
    expect(isBodyTooLargeByContentLength(req, 100)).toBe(false);
  });

  it("Content-Length が不正なら判定不能なので false", () => {
    // 1) 数値化できない
    {
      const req = buildRequest({ headers: { "content-length": "abc" } });
      expect(isBodyTooLargeByContentLength(req, 100)).toBe(false);
    }

    // 2) 負の値
    {
      const req = buildRequest({ headers: { "content-length": "-1" } });
      expect(isBodyTooLargeByContentLength(req, 100)).toBe(false);
    }

    // 3) 有限数でない値
    {
      const req = buildRequest({ headers: { "content-length": "Infinity" } });
      expect(isBodyTooLargeByContentLength(req, 100)).toBe(false);
    }
  });

  it("maxBytes 未指定時: MAX_JSON_BODY_BYTES を使って判定する", () => {
    // 1) デフォルト上限ちょうどは許容
    {
      const req = buildRequest({
        headers: { "content-length": String(MAX_JSON_BODY_BYTES) },
      });
      expect(isBodyTooLargeByContentLength(req)).toBe(false);
    }

    // 2) デフォルト上限を超えると拒否
    {
      const req = buildRequest({
        headers: { "content-length": String(MAX_JSON_BODY_BYTES + 1) },
      });
      expect(isBodyTooLargeByContentLength(req)).toBe(true);
    }
  });

  it("maxBytes 指定時: 上限と同じなら false、上限を超えたら true", () => {
    // 1) ちょうど
    {
      const req = buildRequest({ headers: { "content-length": "100" } });
      expect(isBodyTooLargeByContentLength(req, 100)).toBe(false);
    }

    // 2) 超過
    {
      const req = buildRequest({ headers: { "content-length": "101" } });
      expect(isBodyTooLargeByContentLength(req, 100)).toBe(true);
    }
  });
});

describe("safeReadJson", () => {
  it("options.maxBytes 指定時: maxBytes が不正なら null を返す", async () => {
    // 1) 正常な JSON ボディ
    const req = buildRequest({
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ a: 1 }),
    });

    // 2) maxBytes が不正なら null
    expect(await safeReadJson(req, { maxBytes: 0 })).toBeNull();
    expect(await safeReadJson(req, { maxBytes: -1 })).toBeNull();
    expect(await safeReadJson(req, { maxBytes: Number.NaN })).toBeNull();
    expect(
      await safeReadJson(req, { maxBytes: Number.POSITIVE_INFINITY }),
    ).toBeNull();
  });

  it("options.maxBytes 指定時: maxBytes と同じバイト数の JSON は許容する", async () => {
    // 1) UTF-8 でバイト数を計算し、ちょうど同じ上限を渡す
    const body = JSON.stringify({ a: "ok" });
    const exactMaxBytes = new TextEncoder().encode(body).byteLength;
    const req = buildRequest({
      headers: { "content-type": "application/json" },
      body,
    });

    // 2) 上限ちょうどは通る
    const parsed = await safeReadJson<{ a: string }>(req, {
      maxBytes: exactMaxBytes,
    });
    expect(parsed).toEqual({ a: "ok" });
  });

  it("body が無い場合は null を返す", async () => {
    // 1) body を持たない Request
    const req = buildRequest({
      method: "GET",
      headers: { "content-type": "application/json" },
    });

    // 2) 読み取れないので null
    const parsed = await safeReadJson(req);
    expect(parsed).toBeNull();
  });

  it("options.maxBytes 指定時: 指定上限を優先し、超過なら null を返す", async () => {
    // 1) 本文より 1 バイト小さい上限を渡す
    const body = JSON.stringify({ a: "ok" });
    const tooSmallMaxBytes = new TextEncoder().encode(body).byteLength - 1;
    const req = buildRequest({
      headers: { "content-type": "application/json" },
      body,
    });

    // 2) options の上限が優先され、超過として null
    const parsed = await safeReadJson(req, { maxBytes: tooSmallMaxBytes });
    expect(parsed).toBeNull();
  });

  it("options.maxBytes 未指定時: デフォルト上限超過で null を返す（DoS対策）", async () => {
    // 1) MAX_JSON_BODY_BYTES を超えるサイズの JSON を作る
    // - 中身は JSON として正しいが、サイズだけで弾けることを確認したい
    const tooLargeText = "x".repeat(MAX_JSON_BODY_BYTES + 1);
    const body = JSON.stringify({ a: tooLargeText });

    // 2) Request を作る
    // - Content-Length を付けない（chunked 相当の抜け道を再現）
    const req = buildRequest({
      headers: { "content-type": "application/json" },
      body,
    });

    // 3) safeReadJson は null を返す
    const parsed = await safeReadJson(req);
    expect(parsed).toBeNull();
  });

  it("正しい JSON は 値 を返す", async () => {
    // 1) JSON ボディを持つ Request
    const req = buildRequest({
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ a: 1 }),
    });

    // 2) parse できるなら値が返る
    const parsed = await safeReadJson<{ a: number }>(req);
    expect(parsed).toEqual({ a: 1 });
  });

  it("壊れた JSON は null を返す", async () => {
    // 1) JSON として壊れているボディ
    const req = buildRequest({
      headers: { "content-type": "application/json" },
      body: "{bad json",
    });

    // 2) 例外ではなく null に寄せる
    const parsed = await safeReadJson<unknown>(req);
    expect(parsed).toBeNull();
  });
});

describe("parseTrimmedString", () => {
  it("string 以外は空文字に寄せる", () => {
    // 1) undefined
    expect(parseTrimmedString(undefined)).toBe("");

    // 2) null
    expect(parseTrimmedString(null)).toBe("");

    // 3) number
    expect(parseTrimmedString(123)).toBe("");

    // 4) object
    expect(parseTrimmedString({})).toBe("");
  });

  it("string は trim して返す", () => {
    const trimmedValue = "a";

    // 1) 前後空白が落ちる
    expect(parseTrimmedString(` ${trimmedValue} `)).toBe(trimmedValue);

    // 2) 空白だけは空文字になる
    expect(parseTrimmedString("   ")).toBe("");
  });
});

describe("isStringTooLong", () => {
  it("上限が不正なら守れないので false を返す", () => {
    // 1) 0 以下
    expect(isStringTooLong("abcd", 0)).toBe(false);
    expect(isStringTooLong("abcd", -1)).toBe(false);

    // 2) NaN
    expect(isStringTooLong("abcd", Number.NaN)).toBe(false);

    // 3) Infinity
    expect(isStringTooLong("abcd", Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("境界値を正しく判定する", () => {
    // 1) 上限と同じ長さは超過ではない
    expect(isStringTooLong("abc", 3)).toBe(false);

    // 2) 上限より 1 文字長いと超過
    expect(isStringTooLong("abcd", 3)).toBe(true);
  });
});
