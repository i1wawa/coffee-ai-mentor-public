// apps/web/src/csp-header.test.ts
// ================================================================
// 概要:
// - csp-header.ts のユニットテスト
//
// 契約:
// - development では script-src に unsafe-eval を付与する
// - production と未指定では unsafe-eval を付与しない
// - 返却値は HTTP ヘッダーとして扱える1行文字列に正規化される
// ================================================================

import { describe, expect, it } from "vitest";
import { createContentSecurityPolicyHeaderValue } from "./csp-header";

describe("createContentSecurityPolicyHeaderValue", () => {
  const nonce = "test-nonce";
  const firebaseAuthDomain = "demo-project.firebaseapp.com";
  const sentryDsnWithCredentials =
    "https://test-public-key@o0.ingest.us.sentry.io/0";
  const googleAccountsOrigin = "https://accounts.google.com";
  const googleApisOrigin = "https://apis.google.com";
  const gstaticOrigin = "https://www.gstatic.com";
  const identityToolkitOrigin = "https://identitytoolkit.googleapis.com";
  const secureTokenOrigin = "https://securetoken.googleapis.com";
  const googleApisConnectOrigin = "https://www.googleapis.com";
  const firebaseEmulatorOrigin = "http://127.0.0.1:9099";
  const scriptSrcDirectiveName = "script-src";
  const styleSrcDirectiveName = "style-src";
  const connectSrcDirectiveName = "connect-src";
  const frameSrcDirectiveName = "frame-src";
  const requireTrustedTypesForDirectiveName = "require-trusted-types-for";
  const trustedTypesDirectiveName = "trusted-types";
  const reportUriDirectiveName = "report-uri";
  const reportToDirectiveName = "report-to";

  /**
   * 指定したディレクティブの値を取得するユーティリティ
   */
  function getDirectiveValue(
    cspHeaderValue: string,
    directiveName: string,
  ): string {
    // 1) ディレクティブ名で始まる部分をセミコロン区切りで分割して探す
    const foundDirective = cspHeaderValue
      .split(";")
      .map((directive) => directive.trim())
      .find((directive) => directive.startsWith(`${directiveName} `));

    // 2) 見つからなかった場合は空文字を返す
    return foundDirective ?? "";
  }

  it("正規化: Sentry DSN が不正値（境界値）のときは Sentry オリジンを追加しない", () => {
    // 1) URL として不正な DSN を渡して生成する
    const actual = createContentSecurityPolicyHeaderValue({
      nonce,
      sentryDsn: "not-a-valid-dsn",
    });

    // 2) Sentry のドメインが誤って追加されないこと
    expect(actual).not.toContain("ingest.us.sentry.io");
    // 3) 不正入力そのものをヘッダーへ混入させないこと
    expect(actual).not.toContain("not-a-valid-dsn");
  });

  it("正規化: Firebase Auth Domain が不正値（境界値）のときは firebasePopupAuth の frame-src に追加しない", () => {
    // 1) URL として不正な Firebase Auth Domain を popup 認証プロファイルに渡して生成する
    const actual = createContentSecurityPolicyHeaderValue({
      nonce,
      profile: "firebasePopupAuth",
      firebaseAuthDomain: "not-a-valid-auth-domain@@@",
    });

    // 2) frame-src に不正入力が混入しないことを確認する
    const frameSrcDirective = getDirectiveValue(actual, frameSrcDirectiveName);
    expect(frameSrcDirective).not.toContain("not-a-valid-auth-domain@@@");
    // 3) popup 認証に必要な OAuth 許可元は維持されることを確認する
    expect(frameSrcDirective).toContain(googleAccountsOrigin);
  });

  it("正規化: Firebase Auth Domain が URL 形式（path付き）でも firebasePopupAuth の frame-src には origin のみを追加する", () => {
    // 1) path/query/fragment を含む URL 形式を popup 認証プロファイルに渡して生成する
    const actual = createContentSecurityPolicyHeaderValue({
      nonce,
      profile: "firebasePopupAuth",
      firebaseAuthDomain:
        "https://demo-project.firebaseapp.com/path?query=1#fragment",
    });

    // 2) frame-src には origin のみが入ることを確認する
    const frameSrcDirective = getDirectiveValue(actual, frameSrcDirectiveName);
    expect(frameSrcDirective).toContain("https://demo-project.firebaseapp.com");
    // 3) path/query/fragment は混入しないことを確認する
    expect(frameSrcDirective).not.toContain("/path");
    expect(frameSrcDirective).not.toContain("?query=1");
    expect(frameSrcDirective).not.toContain("#fragment");
  });

  it("script-src: default に nonce を渡したとき script-src は nonce を使い、auth 専用 origin を含めず、unsafe-inline を使わない", () => {
    // 1) nonce 付きで CSP を生成する
    const actual = createContentSecurityPolicyHeaderValue({
      nonce,
    });

    // 2) script-src ディレクティブを取り出す
    const scriptSrcDirective = getDirectiveValue(
      actual,
      scriptSrcDirectiveName,
    );

    // 3) nonce が追加され、unsafe-inline は除外されること
    expect(scriptSrcDirective).toContain("'nonce-test-nonce'");
    expect(scriptSrcDirective).not.toContain("'unsafe-inline'");
    expect(scriptSrcDirective).not.toContain(googleAccountsOrigin);
    expect(scriptSrcDirective).not.toContain(googleApisOrigin);
    expect(scriptSrcDirective).not.toContain(gstaticOrigin);
  });

  it("style-src: nonce を渡したとき style-src は nonce を使い、unsafe-inline を使わない", () => {
    // 1) nonce 付きで CSP を生成する
    const actual = createContentSecurityPolicyHeaderValue({
      nonce,
    });

    // 2) style-src ディレクティブを取り出す
    const styleSrcDirective = getDirectiveValue(actual, styleSrcDirectiveName);

    // 3) nonce が追加され、unsafe-inline は除外されること
    expect(styleSrcDirective).toContain("'nonce-test-nonce'");
    expect(styleSrcDirective).not.toContain("'unsafe-inline'");
  });

  it("script-src: default の development では unsafe-eval を含めるが、auth 専用 origin は含めない", () => {
    // 1) development 環境として CSP を生成する
    const actual = createContentSecurityPolicyHeaderValue({
      nonce,
      nodeEnv: "development",
    });

    // 2) script-src ディレクティブを取り出す
    const scriptSrcDirective = getDirectiveValue(
      actual,
      scriptSrcDirectiveName,
    );
    const styleSrcDirective = getDirectiveValue(actual, styleSrcDirectiveName);

    // 3) 開発時だけ unsafe-eval が含まれることを確認する
    // - React/Next の開発時デバッグ互換を維持する契約
    expect(scriptSrcDirective).toContain("'unsafe-eval'");
    // 4) 開発時は Dev Overlay 等の互換のため style-src に unsafe-inline を含める
    expect(styleSrcDirective).toContain("'unsafe-inline'");
    expect(styleSrcDirective).not.toContain("'nonce-test-nonce'");
    expect(scriptSrcDirective).not.toContain(googleAccountsOrigin);
    expect(scriptSrcDirective).not.toContain(googleApisOrigin);
    expect(scriptSrcDirective).not.toContain(gstaticOrigin);
  });

  it("script-src: default の production では unsafe-eval を含めず、Sentry の connect-src は維持しつつ auth 専用 origin は含めない", () => {
    // 1) production 環境で、Sentry/Firebase の値を渡して default CSP を生成する
    const actual = createContentSecurityPolicyHeaderValue({
      nonce,
      nodeEnv: "production",
      sentryDsn: sentryDsnWithCredentials,
      firebaseAuthDomain,
    });

    // 2) script-src / connect-src / frame-src を取り出す
    const scriptSrcDirective = getDirectiveValue(
      actual,
      scriptSrcDirectiveName,
    );
    const styleSrcDirective = getDirectiveValue(actual, styleSrcDirectiveName);
    const connectSrcDirective = getDirectiveValue(
      actual,
      connectSrcDirectiveName,
    );
    const frameSrcDirective = getDirectiveValue(actual, frameSrcDirectiveName);

    // 3) production では script-src に unsafe-eval を含めないこと
    expect(scriptSrcDirective).not.toContain("'unsafe-eval'");
    expect(scriptSrcDirective).not.toContain(googleAccountsOrigin);
    expect(scriptSrcDirective).not.toContain(googleApisOrigin);
    expect(scriptSrcDirective).not.toContain(gstaticOrigin);
    expect(styleSrcDirective).toContain("'nonce-test-nonce'");
    expect(styleSrcDirective).not.toContain("'unsafe-inline'");
    // 4) connect-src は auth 専用通信先を含めず、Sentry は維持されること
    expect(connectSrcDirective).not.toContain(identityToolkitOrigin);
    expect(connectSrcDirective).not.toContain(secureTokenOrigin);
    expect(connectSrcDirective).not.toContain(googleApisConnectOrigin);
    expect(connectSrcDirective).toContain("https://o0.ingest.us.sentry.io");
    // 5) frame-src は auth 専用 frame origin を含めないこと
    expect(frameSrcDirective).not.toContain(googleAccountsOrigin);
    expect(frameSrcDirective).not.toContain(
      "https://demo-project.firebaseapp.com",
    );
    // 6) DSN の資格情報部分が最終ヘッダーに出ないこと
    expect(actual).not.toContain("test-public-key@");
  });

  it("script-src: default で nodeEnv が未指定（境界値）でも unsafe-eval も auth 専用 origin も含めない", () => {
    // 1) nodeEnv を渡さない境界ケースで生成する
    const actual = createContentSecurityPolicyHeaderValue({
      nonce,
    });

    // 2) script-src は self/nonce ベースのままであること
    const scriptSrcDirective = getDirectiveValue(
      actual,
      scriptSrcDirectiveName,
    );
    const styleSrcDirective = getDirectiveValue(actual, styleSrcDirectiveName);
    expect(scriptSrcDirective).not.toContain(googleAccountsOrigin);
    expect(scriptSrcDirective).not.toContain(googleApisOrigin);
    expect(scriptSrcDirective).not.toContain(gstaticOrigin);
    // 3) unsafe-eval は既定で有効化されないこと
    expect(scriptSrcDirective).not.toContain("'unsafe-eval'");
    expect(styleSrcDirective).toContain("'nonce-test-nonce'");
    expect(styleSrcDirective).not.toContain("'unsafe-inline'");
  });

  it("connect-src / frame-src: default では Firebase Auth Emulator フラグが 1 でも http://127.0.0.1:9099 を含めない", () => {
    // 1) Emulator 利用フラグを有効化して default CSP を生成する
    const actual = createContentSecurityPolicyHeaderValue({
      nonce,
      useFirebaseAuthEmulator: "1",
    });

    // 2) connect-src / frame-src ディレクティブを取り出す
    const connectSrcDirective = getDirectiveValue(
      actual,
      connectSrcDirectiveName,
    );
    const frameSrcDirective = getDirectiveValue(actual, frameSrcDirectiveName);

    // 3) default では emulator 用 origin は含めないこと
    expect(connectSrcDirective).not.toContain(firebaseEmulatorOrigin);
    expect(frameSrcDirective).not.toContain(firebaseEmulatorOrigin);
  });

  it("Trusted Types: production では require-trusted-types-for と nextjs/goog#html 許可の trusted-types を含める", () => {
    // 1) production で CSP を生成する
    const actual = createContentSecurityPolicyHeaderValue({
      nonce,
      nodeEnv: "production",
    });

    // 2) Trusted Types 関連ディレクティブを取り出す
    const requireTrustedTypesForDirective = getDirectiveValue(
      actual,
      requireTrustedTypesForDirectiveName,
    );
    const trustedTypesDirective = getDirectiveValue(
      actual,
      trustedTypesDirectiveName,
    );

    // 3) script sink への文字列代入を Trusted Types で制御する
    expect(requireTrustedTypesForDirective).toBe(
      "require-trusted-types-for 'script'",
    );
    // 4) Next.js と GIS クライアントが使うポリシー名を許可する
    expect(trustedTypesDirective).toBe("trusted-types nextjs goog#html");
  });

  it("Trusted Types: firebasePopupAuth では production でも強制しない", () => {
    // 1) popup 認証ページ向け CSP を生成する
    const actual = createContentSecurityPolicyHeaderValue({
      nonce,
      nodeEnv: "production",
      profile: "firebasePopupAuth",
    });

    // 2) popup 互換のため Trusted Types 関連ディレクティブを含めない
    expect(actual).not.toContain("require-trusted-types-for");
    expect(actual).not.toContain("trusted-types");
  });

  it("firebasePopupAuth: production でも popup に必要な script-src / frame-src / connect-src は維持する", () => {
    // 1) popup 認証ページ向け CSP を生成する
    const actual = createContentSecurityPolicyHeaderValue({
      nonce,
      nodeEnv: "production",
      profile: "firebasePopupAuth",
      firebaseAuthDomain,
      sentryDsn: sentryDsnWithCredentials,
    });

    // 2) popup 認証で使う主要ディレクティブを取り出す
    const scriptSrcDirective = getDirectiveValue(
      actual,
      scriptSrcDirectiveName,
    );
    const styleSrcDirective = getDirectiveValue(actual, styleSrcDirectiveName);
    const connectSrcDirective = getDirectiveValue(
      actual,
      connectSrcDirectiveName,
    );
    const frameSrcDirective = getDirectiveValue(actual, frameSrcDirectiveName);

    // 3) Google popup/Firebase SDK に必要な通信先は維持する
    expect(scriptSrcDirective).toContain(googleAccountsOrigin);
    expect(scriptSrcDirective).toContain(googleApisOrigin);
    expect(scriptSrcDirective).toContain(gstaticOrigin);
    expect(frameSrcDirective).toContain(googleAccountsOrigin);
    expect(frameSrcDirective).toContain("https://demo-project.firebaseapp.com");
    expect(connectSrcDirective).toContain(identityToolkitOrigin);
    expect(connectSrcDirective).toContain(secureTokenOrigin);
    expect(connectSrcDirective).toContain(googleApisConnectOrigin);
    expect(styleSrcDirective).toContain("'nonce-test-nonce'");
  });

  it("firebasePopupAuth: Firebase Auth Emulator フラグが 1 のときだけ connect-src と frame-src に http://127.0.0.1:9099 を含める", () => {
    // 1) Emulator 利用フラグを有効化して popup 認証プロファイルを生成する
    const actual = createContentSecurityPolicyHeaderValue({
      nonce,
      profile: "firebasePopupAuth",
      useFirebaseAuthEmulator: "1",
    });

    // 2) connect-src / frame-src ディレクティブを取り出す
    const connectSrcDirective = getDirectiveValue(
      actual,
      connectSrcDirectiveName,
    );
    const frameSrcDirective = getDirectiveValue(actual, frameSrcDirectiveName);

    // 3) popup 認証プロファイルでは emulator relay 用 origin を許可する
    expect(connectSrcDirective).toContain(firebaseEmulatorOrigin);
    expect(frameSrcDirective).toContain(firebaseEmulatorOrigin);
  });

  it("Trusted Types: development では Next.js 開発ランタイム互換のため含めない", () => {
    // 1) development で CSP を生成する
    const actual = createContentSecurityPolicyHeaderValue({
      nonce,
      nodeEnv: "development",
    });

    // 2) 開発時は Trusted Types ディレクティブを含めない
    expect(actual).not.toContain("require-trusted-types-for");
    expect(actual).not.toContain("trusted-types");
  });

  it("Reporting: reportUri と reportToGroup を渡したとき report-uri と report-to を含める", () => {
    // 1) reporting 情報付きで CSP を生成する
    const actual = createContentSecurityPolicyHeaderValue({
      nonce,
      reportUri: "https://example.test/api/security/csp-report",
      reportToGroup: "csp-endpoint",
    });

    // 2) report-uri / report-to ディレクティブを取り出す
    const reportUriDirective = getDirectiveValue(
      actual,
      reportUriDirectiveName,
    );
    const reportToDirective = getDirectiveValue(actual, reportToDirectiveName);

    // 3) 値が正しく入ることを確認する
    expect(reportUriDirective).toBe(
      "report-uri https://example.test/api/security/csp-report",
    );
    expect(reportToDirective).toBe("report-to csp-endpoint");
  });

  it("Reporting: reportUri に相対パス（同一オリジン前提）を渡したとき report-uri にそのまま入れる", () => {
    // 1) 相対パスの reportUri を渡して CSP を生成する
    const actual = createContentSecurityPolicyHeaderValue({
      nonce,
      reportUri: "/api/security/csp-report",
      reportToGroup: "csp-endpoint",
    });

    // 2) report-uri ディレクティブを取り出す
    const reportUriDirective = getDirectiveValue(
      actual,
      reportUriDirectiveName,
    );

    // 3) 相対パスがそのまま入ることを確認する
    expect(reportUriDirective).toBe("report-uri /api/security/csp-report");
  });

  it("Reporting: reportUri がスキーム相対URL（//...）のときは追加しない", () => {
    // 1) スキーム相対URLを渡して CSP を生成する
    const actual = createContentSecurityPolicyHeaderValue({
      nonce,
      reportUri: "//example.test/api/security/csp-report",
      reportToGroup: "csp-endpoint",
    });

    // 2) report-uri は追加されないことを確認する
    expect(actual).not.toContain("report-uri");
    // 3) report-to は従来どおり追加されることを確認する
    expect(actual).toContain("report-to csp-endpoint");
  });

  it("Reporting: reportUri と reportToGroup が空白のみ（境界値）のときは追加しない", () => {
    // 1) 空白のみの入力で CSP を生成する
    const actual = createContentSecurityPolicyHeaderValue({
      nonce,
      reportUri: "   ",
      reportToGroup: "   ",
    });

    // 2) reporting 関連ディレクティブが含まれないことを確認する
    expect(actual).not.toContain("report-uri");
    expect(actual).not.toContain("report-to");
  });

  it("正規化: 改行と連続空白を除去して1行のヘッダー値にする", () => {
    // 1) production でヘッダー文字列を生成する
    const actual = createContentSecurityPolicyHeaderValue({
      nonce,
      nodeEnv: "production",
    });

    // 2) 改行を含まないこと（HTTP ヘッダーとして安全）
    expect(actual.includes("\n")).toBe(false);
    // 3) 連続空白が無いこと（比較とログの可読性を保つ）
    expect(actual).not.toMatch(/\s{2,}/);
  });

  it("入力境界値: nonce が空白のみのときは例外を投げる", () => {
    expect(() =>
      createContentSecurityPolicyHeaderValue({
        nonce: "   ",
      }),
    ).toThrow("CSP nonce is required");
  });
});
