// apps/web/src/frontend/entities/session/api/exchange-id-token-for-session-cookie.test.ts
// ================================================================================
// 概要:
// - exchangeIdTokenForSessionCookie のユニットテスト
//
// 契約:
// - 入力 idToken は trim して body にのみ入れる
// - 空文字（trim後）は VALIDATION_FAILED
// - POST /api/auth/session を呼ぶ（AUTH_PATHS.session）
// - 成功ボディ { issued:true } を最小検証し、呼び出し元へは void を返す
// ================================================================================

import { AUTH_PATHS } from "@contracts/src/auth/auth-contract";
import {
  buildErrorFields,
  type ErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { err, ok } from "@packages/shared/src/result";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { postJson } from "@/frontend/shared/api/http-client";
import {
  expectErrCode,
  expectOkValue,
} from "@/tests/vitest-utils/utils/result-assertions";
import { exchangeIdTokenForSessionCookie } from "./exchange-id-token-for-session-cookie";

vi.mock("@/frontend/shared/api/http-client", () => {
  return {
    postJson: vi.fn(),
  };
});

describe("@/frontend/entities/session/api exchangeIdTokenForSessionCookie", () => {
  const mockedPostJson = vi.mocked(postJson);
  const sessionUrl = AUTH_PATHS.session;
  const idToken = "t1";

  beforeEach(() => {
    // 1) テスト間の干渉を防ぐ
    mockedPostJson.mockReset();
  });

  it("trim: idToken は trim して body に入れて送る", async () => {
    // 1) サーバ成功を模擬する（data は issued:true 契約）
    mockedPostJson.mockResolvedValue(ok({ issued: true }));

    // 2) 実行（前後空白つき）
    await exchangeIdTokenForSessionCookie({
      idToken: ` ${idToken} `,
    });

    // 3) postJson が /api/auth/session を呼び、body は trim 済み
    expect(mockedPostJson).toHaveBeenCalledTimes(1);
    expect(mockedPostJson).toHaveBeenCalledWith({
      url: sessionUrl,
      body: { idToken },
    });
  });

  it("失敗: idToken が空なら VALIDATION_FAILED で、postJson は呼ばない", async () => {
    // 1) 空入力（trim後）で実行する
    const result = await exchangeIdTokenForSessionCookie({ idToken: "   " });

    // 2) 入力不正なので失敗に倒す
    expectErrCode(result, errorCode.VALIDATION_FAILED);

    // 3) 無駄な外部I/O をしない
    expect(mockedPostJson).toHaveBeenCalledTimes(0);
  });

  it("失敗: postJson が ErrorFields を返した場合は、そのまま返す", async () => {
    // 1) 代表エラーを作る
    const error: ErrorFields = buildErrorFields(errorCode.UNAVAILABLE);

    // 2) postJson が失敗したことにする
    mockedPostJson.mockResolvedValue(err(error));

    // 3) 実行
    const result = await exchangeIdTokenForSessionCookie({
      idToken,
    });

    // 4) 失敗のまま返る
    expectErrCode(result, error.errorCode);
    expect(result.error).toBe(error);

    // 5) postJson が /api/auth/session を呼んでいる
    expect(mockedPostJson).toHaveBeenCalledTimes(1);
    expect(mockedPostJson).toHaveBeenCalledWith({
      url: sessionUrl,
      body: { idToken },
    });
  });

  it("失敗: 成功ステータスでも data が契約外なら INTERNAL_ERROR", async () => {
    // 1) サーバ成功だが data が壊れているケース
    mockedPostJson.mockResolvedValue(ok({ issued: false }));

    // 2) 実行
    const result = await exchangeIdTokenForSessionCookie({
      idToken,
    });

    // 3) 成功扱いにしない
    expectErrCode(result, errorCode.INTERNAL_ERROR);
  });

  it("成功: POST が成功なら void の成功結果を返す", async () => {
    // 1) サーバ成功を模擬する（data は issued:true 契約）
    mockedPostJson.mockResolvedValue(ok({ issued: true }));

    // 2) 実行
    const result = await exchangeIdTokenForSessionCookie({
      idToken,
    });

    // 3) 成功（戻り値契約）
    expectOkValue(result, undefined);
  });

  it("成功: data に追加フィールドがあっても issued:true なら成功扱い", async () => {
    // 1) issued:true + 追加フィールドを返す
    mockedPostJson.mockResolvedValue(
      ok({ issued: true, version: 1, message: "ok" }),
    );

    // 2) 実行
    const result = await exchangeIdTokenForSessionCookie({
      idToken,
    });

    // 3) 必須契約を満たすので成功
    expectOkValue(result, undefined);
  });
});
