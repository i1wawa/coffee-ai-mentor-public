// apps/web/src/tests/vitest-utils/integration/utils/cookie-jar.ts
// ========================================================
// 概要:
// - 統合（HTTP境界）テスト用の CookieJar ユーティリティ（共通）
//
// 責務:
// - CookieJar の初期化（removeAll）を共通化する
// - Cookie の注入・取得を Promise で扱える形にする
//
// 前提:
// - 呼び出し元がテスト単位の CookieJar を渡す
// - 暗黙のデフォルト CookieJar は使わない
// ========================================================

import type { CookieJar } from "tough-cookie";

/**
 * CookieJar を空にする
 * - 他テストの影響を受けないように毎回初期化する
 */
export function removeAllCookies(targetCookieJar: CookieJar): Promise<void> {
  return new Promise((resolve, reject) => {
    // cookie削除に失敗したら err を返す
    targetCookieJar.removeAllCookies((err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

/**
 * CookieJar に cookie をセットする
 * - 実サーバへ送る cookie を明示的に注入する用途
 */
export function setCookieForJar(
  params: {
    url: string;
    cookie: string;
  },
  targetCookieJar: CookieJar,
): Promise<void> {
  // callback API を Promise 化して await で使えるようにする
  return new Promise((resolve, reject) => {
    // 指定URLに送る Cookie をセット
    targetCookieJar.setCookie(params.cookie, params.url, (err) => {
      // セットエラーはそのまま reject
      if (err) return reject(err);
      // 成功したら resolve
      resolve();
    });
  });
}

/**
 * CookieJar から Cookie一覧を非同期で取得する
 * - 注入できたかの事前検証に使う
 */
export async function getCookiesForJar(
  url: string,
  // []: 複数の cookie（key/value の組）を返す
  targetCookieJar: CookieJar,
): Promise<{ key: string; value: string }[]> {
  // callback API を Promise 化して await で使えるようにする
  return new Promise((resolve, reject) => {
    // 指定URLに送られる Cookie 一覧を取得
    targetCookieJar.getCookies(url, (err, cookies) => {
      // 取得エラーはそのまま reject
      if (err) return reject(err);
      // cookie が無ければ空配列で返す
      if (!cookies) return resolve([]);
      // テストで扱いやすい key/value だけに絞る
      resolve(cookies.map((c) => ({ key: c.key, value: c.value })));
    });
  });
}

/**
 * CookieJar から指定cookieの値を取得する
 * - 見つからない場合は null を返す
 */
export async function getCookieValueFromJar(
  params: {
    url: string;
    cookieName: string;
  },
  targetCookieJar: CookieJar,
): Promise<string | null> {
  // 1) 指定URLに送られる Cookie 一覧を取る
  const cookies = await getCookiesForJar(params.url, targetCookieJar);

  // 2) 指定名の cookie 値を返す（無ければ null）
  const matchedCookie = cookies.find(
    (cookie) => cookie.key === params.cookieName,
  );
  return matchedCookie?.value ?? null;
}
