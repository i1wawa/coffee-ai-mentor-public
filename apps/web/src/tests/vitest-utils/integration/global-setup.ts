// apps/web/src/tests/vitest-utils/integration/global-setup.ts
// ===================================================================
// 概要:
// - 統合テスト用のグローバルセットアップ。
// - テスト実行に必要な Next.js サーバを起動し、利用可能になるまで待機し、終了時に確実に後始末する。
//
// 契約:
// - setup() は Next.js サーバを起動し、TEST_HEALTH_URL が 2xx を返すまで待つ。
// - setup() は teardown 関数を返し、テスト終了時に「自分が起動したサーバ」だけ停止する。
// - 起動待ちが timeout した場合はテストを失敗させる（前提不成立）。
//
// 前提:
// - integration は Node の fetch で HTTP 境界まで検証する（Playwright ではない）。
// - Next.js サーバは pnpm dev で起動される（子プロセスが多段になり得る）。
// - Linux 向けのプロセスグループ kill を前提に、detached 起動を利用する。
// - https（自己署名）を許可する場合は、TEST_BASE_URL が https かつ prod 以外に限定する。
// - TLS 検証無効化（NODE_TLS_REJECT_UNAUTHORIZED=0）は影響が強いため、このファイルに閉じ込める。
// ==================================================================

import process, { env } from "node:process";
import {
  createTestFailureError,
  TEST_FAILURE_REASON,
} from "@packages/tests/src/error-message";
import { execa, type ResultPromise } from "execa";
import { TEST_BASE_URL, TEST_HEALTH_URL } from "@/tests/utils/test-config";

// 0) 起動したサーバプロセスを保持（後で止めるため）
let serverProcess: ResultPromise | null = null;

// ------------------------------
// ヘルスチェック待ち（起動完了を待つ）
// ------------------------------

/**
 * 指定URLが 2xx を返すまで待つ（timeoutで失敗）
 *
 * - integration は「HTTP境界」まで含めて確認したいので、実際に fetch する
 * - ただし「起動待ち」は失敗理由の詳細が必須ではないため、例外は握りつぶしてリトライする
 */
async function waitForHealthy(
  url: string,
  timeoutMs = 10_000,
  intervalMs = 500,
) {
  // 1) 開始時刻を記録して、全体の待機時間（timeoutMs）を管理する
  const start = Date.now();
  // 2) timeoutMs を超えるまで、intervalMs 間隔でリトライする
  while (Date.now() - start < timeoutMs) {
    try {
      // 3) 対象URLにリクエストを投げる（HTTP境界で「サーバが応答できるか」を確認）
      const res = await fetch(url);
      // 4) 2xx（Response.ok=true）なら「起動完了」とみなして終了する
      if (res.ok) return;
    } catch {
      // 接続エラーは、ここでは握りつぶしてリトライする
      // - 目的は「起動を待つ」ことなので、失敗理由の詳細ログは必須ではない
    }

    // 6) すぐ再試行すると負荷が高いので、intervalMs だけ待ってから次のループへ
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  // 7) timeoutMs を超えても成功しなければ、テスト実行を止める（統合テストの前提が崩れている）
  throw createTestFailureError({
    reason: TEST_FAILURE_REASON.PRECONDITION_FAILED,
    summary: "サーバのヘルスチェックがタイムアウトしました。",
    expected: "起動したNext.jsサーバが指定URLで2xxを返す",
    observed: `url=${url} timeoutMs=${timeoutMs}`,
    nextActions: [
      "pnpm dev が起動しているか確認する",
      "TEST_HEALTH_URL が正しいか確認する",
      "ポート競合や起動ログのエラーを確認する",
    ],
  });
}

// ------------------------------
// 後始末（自分が起動したサーバだけ kill）
// ------------------------------

/**
 * 自分が起動した Next.js サーバ（およびその子プロセス）だけを止める。
 *
 * - detached: true で起動したプロセスは「プロセスグループ」を作りやすい
 * - process.kill(-pid, ...) の「負のpid」は「プロセスグループ指定」
 * - これにより pnpm/next の多段起動でも取りこぼしにくい（Linux向け）
 */
async function cleanupServer() {
  // 1) 起動していない（pidが無い）なら何もしない
  const pid = serverProcess?.pid;
  if (!pid) return;

  // 二重実行で同じpidを何度も kill しないように、先に参照を外す
  // - SIGINT/SIGTERM と teardown が同時に走るケースでも誤動作しにくい
  serverProcess = null;

  // 2) 「プロセスグループ」をまとめて止める（Linux向け）
  // - detached: true で起動すると、その子プロセス群が 1 グループになりやすい
  // - process.kill(-pid, ...) の「マイナス pid」が「プロセスグループ指定」
  // - これで pnpm/next などの多段起動でも取りこぼしにくい
  try {
    // まず SIGINT（Ctrl+C 相当）
    process.kill(-pid, "SIGINT");
    return;
  } catch {
    console.log("Failed to kill process group with SIGINT, trying SIGTERM");
    // 環境によってはグループkillが失敗することがあるのでフォールバック
  }
  try {
    // ダメなら SIGTERM: 普通の終了シグナル
    process.kill(-pid, "SIGTERM");
    return;
  } catch {
    // 環境によってはグループkillが失敗することがあるのでフォールバック
  }

  // 4) フォールバック：単体 pid を止める
  try {
    process.kill(pid, "SIGINT");
  } catch {
    // 5) すでに死んでる場合などは無視
  }
}

// ------------------------------
// HTTPS（自己署名）対策（integration 用）
// ------------------------------

/**
 * Node fetchが自己署名証明書で落ちるのを防ぐ。
 *
 * 前提:
 * - next dev --experimental-https は自己署名証明書を使う
 * - integration は Node の fetch を使うため、Playwright の ignoreHTTPSErrors では救えない
 *
 * 方針:
 * - TEST_BASE_URL が https のときだけ緩める（範囲を最小化）
 */
function allowLocalSelfSignedHttps(): void {
  // https のときだけ適用する（http のテストに不要な副作用を出さない）
  if (!TEST_BASE_URL.startsWith("https://")) return;

  // 本番環境では絶対に緩めない（事故防止）
  if (env.APP_ENV === "prod" || env.NODE_ENV === "production") return;

  // fetch-cookie 等が Undici 以外を使っていても確実に通すためのフォールバック
  // - Node全体のTLS検証を無効化する（このプロセス限定）
  // - 影響が強いので integration の global-setup 以外には置かない
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

// ------------------------------
// 統合テスト用 グローバルセットアップ
// ------------------------------

/**
 * 統合テスト用 グローバルセットアップ
 * 1. Next.js サーバを起動する
 * 2. ヘルスチェックが通るまで待つ
 *
 * 戻り値として、グローバルテアダウン関数を返す。
 */
export async function setup() {
  // 1) teardown が呼ばれないケースにも備える
  process.once("exit", async () => {
    await cleanupServer();
  });
  process.once("beforeExit", async () => {
    await cleanupServer();
  });
  process.once("uncaughtException", async () => {
    await cleanupServer();
  });
  process.once("unhandledRejection", async () => {
    await cleanupServer();
  });
  process.once("SIGINT", async () => {
    await cleanupServer();
  });
  process.once("SIGTERM", async () => {
    await cleanupServer();
  });

  // 2)  HTTPS 接続で自己署名証明書を許可する
  allowLocalSelfSignedHttps();

  // 3) Ctrl + C（SIGINT）などで止めたときも cleanup を必ず走らせる
  // - process.once: 1回だけ反応（複数回登録で重複停止しない）
  process.once("SIGINT", async () => {
    await cleanupServer();
  });
  process.once("SIGTERM", async () => {
    await cleanupServer();
  });

  // 4) Next.js をテスト用に起動（PORT固定）
  // - pnpm を挟むとプロセスが多段になり、killが取りこぼしやすい
  // - node process.execPath は「いま動いてるNodeの実行ファイル」
  // - next の CLI は node_modules 配下にある
  serverProcess = execa("pnpm", ["dev"], {
    // ログをそのまま表示（起動失敗の原因が見える）
    stdio: "inherit",
    // 子プロセス終了の後始末を明示
    cleanup: true,
    // ※このオプションは execa のバージョン差が出る可能性があるので、
    //   型/実行でコケたら削除して teardown 側の kill を厚くする。
    forceKillAfterDelay: 5_000,
    // 新しいプロセスグループにする
    // - 子プロセスを独立した「プロセスグループ」にしやすい
    // - cleanupServer の process.kill(-pid, ...) が効きやすくなる
    detached: true,
    // execa で環境変数を明示的に渡す（process.env をそのまま継承）
    env: {
      ...process.env,
      // PORT: "3000",
    },
  });

  // 5) setup の途中で失敗したら teardown は呼ばれないことがある
  // → ここで try/catch して必ず cleanup を呼ぶのが重要
  try {
    // ヘルスチェックが通るまで待つ
    await waitForHealthy(TEST_HEALTH_URL);
  } catch (e) {
    // setup失敗でも必ず teardown を返す
    await cleanupServer();
    console.error("[global-setup] serverProcess failed:", e);
    throw e;
  }

  // 6) Vitest がテスト終了時に呼ぶ teardown を返す
  return async () => {
    await cleanupServer();
  };
}
