// apps/web/src/frontend/shared/errors/error-fields.normalize.test.ts
// ================================================================
// 概要:
// - normalizeUnknownToErrorFields のユニットテスト
//
// 契約:
// - ErrorFields らしき形はそのまま返す
// - AbortError は CANCELLED へ寄せる
// - それ以外は INTERNAL_ERROR へ寄せる
// ================================================================

import {
  buildErrorFields,
  type ErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { describe, expect, it } from "vitest";
import { normalizeUnknownToErrorFields } from "./error-fields.normalize";

describe("normalizeUnknownToErrorFields", () => {
  it("ErrorFields らしき形はそのまま返す", () => {
    // 1) arrange: ErrorFields を用意する
    const original: ErrorFields = buildErrorFields(errorCode.INTERNAL_ERROR);

    // 2) act: 正規化する
    const normalized = normalizeUnknownToErrorFields(original);

    // 3) assert: 同じ参照で返る
    expect(normalized).toBe(original);
  });

  it("AbortError は CANCELLED に寄せる", () => {
    // 1) arrange: AbortError を作る
    const abortError = new DOMException("aborted", "AbortError");

    // 2) act: 正規化する
    const normalized = normalizeUnknownToErrorFields(abortError);

    // 3) assert: CANCELLED になる
    expect(normalized.errorCode).toBe(errorCode.CANCELLED);
  });

  it("それ以外の unknown は INTERNAL_ERROR に寄せる", () => {
    // 1) arrange: 代表的な unknown を作る
    const boom = new Error("boom");

    // 2) act: 正規化する
    const normalized = normalizeUnknownToErrorFields(boom);

    // 3) assert: INTERNAL_ERROR になる
    expect(normalized.errorCode).toBe(errorCode.INTERNAL_ERROR);
  });
});
