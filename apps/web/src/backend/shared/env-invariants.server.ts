// apps/web/src/backend/shared/env-invariants.server.ts
// ============================================================================
// 概要:
// - サーバ環境変数の「組み合わせ不変条件」を起動時に検証する
// - 運用ミス/セキュリティリスクを fail fast で起動停止する
//
// 責務:
// - 本番で emulator 接続設定がある場合は危険なので停止する
// - USER_HASH_SALT の未設定は匿名相関の安全性を落とすため停止する
// ============================================================================

import "server-only";

import { FAIL_FAST_REASON, failFast } from "@packages/errors/src/fail-fast";
import { z } from "zod";

const startupEnvSchema = z.object({
  APP_ENV: z.enum(["prod", "stg", "dev"]),
  FIREBASE_AUTH_EMULATOR_HOST: z.string().min(1).optional(),
  USER_HASH_SALT: z.string().min(1).optional(),
});

// 同一 Node.js プロセス内での多重実行を防ぐフラグ
let hasRun = false;

function getStartupEnv() {
  return startupEnvSchema.parse({
    APP_ENV: process.env.APP_ENV,
    FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST,
    USER_HASH_SALT: process.env.USER_HASH_SALT,
  });
}

/**
 * サーバー環境変数の不変条件を検証する。
 *
 * 注意:
 * - env.ts の zod は「単変数の型/必須/形式」には強いが、
 *   「prod の時だけ必須」「prod の時だけ未設定禁止」などの条件はここに置くと管理しやすい。
 * - 例外を投げると Cloud Run 等で起動失敗として記録され、設定ミスに早く気づける。
 */
export function assertServerEnvInvariants(): void {
  // 1) 多重実行防止（同プロセス内）
  if (hasRun) return;

  // 2) 起動時に必要な最小 env だけを読み込む
  // - 変更点: env.server.ts の一括検証を避けるため、専用モジュールから取得する
  const startupEnv = getStartupEnv();

  // 3) 環境判定（APP_ENV は起動時最小 env で必須）
  const isProduction = startupEnv.APP_ENV === "prod";

  // 4) prod では USER_HASH_SALT を必須にする
  // - ログ相関の匿名IDは salt が弱いと推測・照合されやすい
  // - 本番で未設定は「設定ミス」なので即停止（fail fast）
  if (isProduction && !startupEnv.USER_HASH_SALT?.trim()) {
    failFast({
      reason: FAIL_FAST_REASON.設定不足,
      summary: "USER_HASH_SALT が未設定です（prod）。",
      expected: "USER_HASH_SALT が設定されている（prod）",
      observed: "USER_HASH_SALT が空",
      nextActions: [
        "Cloud Run の環境変数または Secret Manager で USER_HASH_SALT を設定する",
      ],
    });
  }

  // 5) prod で Auth Emulator への接続設定が入っていたら危険なので停止
  // - 本番サーバが emulator に接続しに行くと、認証が成立しない/意図しない挙動になる
  // - 何よりセキュリティ事故の温床なので「設定されていたら即停止」にする
  if (isProduction && startupEnv.FIREBASE_AUTH_EMULATOR_HOST?.trim()) {
    failFast({
      reason: FAIL_FAST_REASON.セキュリティリスク,
      summary: "本番で FIREBASE_AUTH_EMULATOR_HOST が設定されています。",
      expected: "本番環境で FIREBASE_AUTH_EMULATOR_HOST が未設定である",
      observed: "FIREBASE_AUTH_EMULATOR_HOST が設定されている",
      nextActions: ["本番環境の環境変数から削除する"],
    });
  }

  // 6) すべての検証を通過したら実行済みにする
  hasRun = true;
}
