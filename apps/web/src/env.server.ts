// apps/web/src/env.server.ts
// ========================================================
// 概要:
// - Next.js サーバ用の環境変数を定義する
//
// 責務:
// - サーバ専用の環境変数（backend / secrets）のスキーマを一箇所に集約する
// - process.env の参照口を envServer に一本化し、型安全とキー一貫性を保証する
// ========================================================

import "server-only";

import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

// ----------------------------
// Server Variables (non-secret)
// - build 時に参照される値
// - 本番環境ではGitHubの環境変数で入れる想定
// ----------------------------

const serverBaseSchema = {
  // 実行環境
  // - オブザーバビリティ・Auth Emulator・Vitest用
  APP_ENV: z.enum(["prod", "stg", "dev"]),

  // アプリ名（Cloud Runサービス名と同じ）
  SERVICE_NAME: z.string().min(1),

  // --- Firebase Auth Emulator ---
  // Firebase Admin SDK で Auth Emulator を使う時だけ設定する
  // ※本番では有効化しないこと
  FIREBASE_AUTH_EMULATOR_HOST: z.string().min(1).optional().or(z.literal("")),

  // --- Google Cloud ---
  // Auth Emulator用（Firebaseプロジェクト名として）
  // - オブザーバビリティ用（Cloud Loggingのtraceフィールド生成に使用）
  //   （TerraformでCloud Runに付与した環境変数と同じ）
  GCP_PROJECT_ID: z.string().min(1),

  // --- Sentry ---
  // 公開用と同値（運用で揃える想定）
  SENTRY_DSN: z.string().min(1),
  SENTRY_ENVIRONMENT: z.string().min(1),
  SENTRY_RELEASE: z.string().min(1),
} as const;

// ----------------------------
// Server Variables (secrets)
// - runtime で必要になる秘密情報
// - 本番環境ではGoogle Cloud Secret Managerで入れる想定
// ----------------------------

const serverSecretsSchema = {
  // ユーザーIDハッシュ生成用のソルト
  // - オブザーバビリティ用
  USER_HASH_SALT: z.string().min(1),

  // --- Prisma（DB） ---
  // Supabase CLIでローカルDBを立ち上げた場合の接続URL
  // 例: postgresql://postgres:postgres@localhost:54322/postgres?schema=public
  DATABASE_URL: z.string().min(1),

  // DIRECT_URL はコメントアウトされているので optional にしておく
  // DIRECT_URL: z.string().min(1).optional(),

  // --- Supabase ---
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // --- Gemini API（LLM） ---
  GEMINI_API_KEY: z.string().min(1),

  // --- Resend（メール） ---
  RESEND_API_KEY: z.string().min(1),
  // RESEND_FROM_EMAIL: z.string().email().optional(),
} as const;

function createServerBaseEnv() {
  return createEnv({
    server: serverBaseSchema,
    runtimeEnv: {
      APP_ENV: process.env.APP_ENV,
      SERVICE_NAME: process.env.SERVICE_NAME,
      SENTRY_RELEASE: process.env.SENTRY_RELEASE,
      FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST,
      GCP_PROJECT_ID: process.env.GCP_PROJECT_ID,
      SENTRY_DSN: process.env.SENTRY_DSN,
      SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT,
    },
  });
}

function createServerSecretsEnv() {
  return createEnv({
    server: serverSecretsSchema,
    runtimeEnv: {
      USER_HASH_SALT: process.env.USER_HASH_SALT,
      DATABASE_URL: process.env.DATABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      // RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    },
  });
}

/**
 * build 中に参照され得る非secretのサーバ環境変数だけを検証して返す。
 */
export function getServerBaseEnv() {
  return createServerBaseEnv();
}

/**
 * runtime secret を検証して返す。
 * - build 中は原則呼ばない
 */
export function getServerSecretsEnv() {
  return createServerSecretsEnv();
}
