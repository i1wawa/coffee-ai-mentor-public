// apps/web/src/backend/shared/observability/nextjs-control-flow.test.ts
// ================================================================
// 概要:
// - Next.js の制御フロー例外（redirect/notFound 等）を識別するユーティリティのユニットテスト
//
// 責務:
// - request.summary ラッパが「再スローすべき例外」を取りこぼさないために、
//   判定ロジックの代表ケースだけを小さく固定する
//
// 前提:
// - Next.js の実物例外は環境差が大きいので、ここでは "digest" を持つプレーンオブジェクトで再現する
// - 全パターンを網羅しない（重要な分岐だけを最小本数で固定する）
// ================================================================

import { describe, expect, it } from "vitest";
import {
  findNextJsControlFlowError,
  guessHttpStatusCodeFromNextJsControlFlowError,
} from "./nextjs-control-flow";

type DigestErrorLike = { digest: string };

function makeDigestError(digest: string): DigestErrorLike {
  return { digest };
}

describe("findNextJsControlFlowError", () => {
  it.each([
    "NEXT_REDIRECT;replace;/;307;",
    "NEXT_HTTP_ERROR_FALLBACK;404;",
    "NEXT_NOT_FOUND",
    "DYNAMIC_SERVER_USAGE",
  ])("制御フロー digest（%s）を直接渡すとその値を返す", (digest) => {
    const controlFlow = makeDigestError(digest);

    expect(findNextJsControlFlowError(controlFlow)).toBe(controlFlow);
  });

  it("cause チェーンを数段辿って制御フロー例外があればそれを返す", () => {
    const controlFlow = makeDigestError("NEXT_NOT_FOUND");

    // Error の cause に数段ネストして埋め込む
    const level3 = new Error("wrapper-3", { cause: controlFlow });
    const level2 = new Error("wrapper-2", { cause: level3 });
    const level1 = new Error("wrapper-1", { cause: level2 });

    expect(findNextJsControlFlowError(level1)).toBe(controlFlow);
  });

  it("cause チェーンを数段辿っても無ければ undefined", () => {
    // cause はあるが、制御フローではないものを数段で用意する
    const notControlFlow = makeDigestError("SOME_OTHER_ERROR");
    const level3 = new Error("wrapper-3", { cause: notControlFlow });
    const level2 = new Error("wrapper-2", { cause: level3 });
    const level1 = new Error("wrapper-1", { cause: level2 });

    expect(findNextJsControlFlowError(level1)).toBeUndefined();
  });
});

describe("guessHttpStatusCodeFromNextJsControlFlowError", () => {
  it("message が NEXT_NOT_FOUND の Error は 404", () => {
    const e = new Error("NEXT_NOT_FOUND");

    expect(guessHttpStatusCodeFromNextJsControlFlowError(e)).toBe(404);
  });

  it("HTTP fallback の digest は末尾の 4xx を拾う", () => {
    const e = makeDigestError("NEXT_HTTP_ERROR_FALLBACK;404;");

    expect(guessHttpStatusCodeFromNextJsControlFlowError(e)).toBe(404);
  });

  it("HTTP fallback の digest に 4xx が無い場合は 500", () => {
    const e = makeDigestError("NEXT_HTTP_ERROR_FALLBACK;foo;200;");

    expect(guessHttpStatusCodeFromNextJsControlFlowError(e)).toBe(500);
  });

  it("redirect の digest は末尾の 3xx を拾う", () => {
    // 1) 308 を含む digest を用意する
    const e = makeDigestError("NEXT_REDIRECT;push;/;308;");

    // 2) 308 を推定できる
    expect(guessHttpStatusCodeFromNextJsControlFlowError(e)).toBe(308);
  });

  it("redirect の digest に 3xx が無い場合は 307 にフォールバック", () => {
    // 1) 3xx が入っていない digest を用意する
    const e = makeDigestError("NEXT_REDIRECT;push;/;");

    // 2) フォールバック値は 307
    expect(guessHttpStatusCodeFromNextJsControlFlowError(e)).toBe(307);
  });

  it("digest を持たない場合は 500", () => {
    // 1) digest を持たない例外を用意する
    const e = new Error("no digest");

    // 2) 500 扱いに寄せる
    expect(guessHttpStatusCodeFromNextJsControlFlowError(e)).toBe(500);
  });

  it("DYNAMIC_SERVER_USAGE の digest は 500", () => {
    const e = makeDigestError("DYNAMIC_SERVER_USAGE");

    expect(guessHttpStatusCodeFromNextJsControlFlowError(e)).toBe(500);
  });

  it("未知の digest は 500", () => {
    const e = makeDigestError("SOME_UNKNOWN_DIGEST");

    expect(guessHttpStatusCodeFromNextJsControlFlowError(e)).toBe(500);
  });
});
