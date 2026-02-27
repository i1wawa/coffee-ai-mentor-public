// apps/web/src/env.client.ts
// ========================================================
// 概要:
// - Next.js のクライアント用環境変数を「仕様（キー / 型 / 必須・任意）」として定義する
// - .env.* の値そのものは扱わず、ブラウザに公開してよい設定だけを集約する
//
// 責務:
// - NEXT_PUBLIC_ 環境変数のスキーマ（型・必須/任意）をこのファイルで固定する
// - クライアント側が参照する環境変数の入口を envClient に一本化する
//
// 前提:
// - クライアントで参照する公開変数は NEXT_PUBLIC_ 接頭辞が必須
// - 必須のキーが欠けている場合は起動/実行時に失敗として扱う
// ========================================================

import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * envClient
 * - client: ブラウザに公開される環境変数（NEXT_PUBLIC_ 必須）
 * - runtimeEnv: 実際に process.env から受け取る値のマッピング
 */
export const envClient = createEnv({
  // ----------------------------
  // Client Variables
  // - クライアントに公開される環境変数
  // - 本番環境ではGitHubの環境変数で入れる想定
  // ----------------------------

  client: {
    // 実行環境
    // - オブザーバビリティ用
    NEXT_PUBLIC_APP_ENV: z.enum(["prod", "stg", "dev"]),
    // 法務ページのお問い合わせフォームURL（任意）
    NEXT_PUBLIC_CONTACT_FORM_URL: z.url().optional().or(z.literal("")),

    // --- Firebase Authentication ---

    // Firebase Client SDK が呼ぶ Firebase の Web API キー
    NEXT_PUBLIC_FIREBASE_API_KEY: z.string().min(1),
    // Firebase 上で Web アプリを登録したときに割り当てられるアプリ識別子
    NEXT_PUBLIC_FIREBASE_APP_ID: z.string().min(1),
    // Firebase Authentication が利用する認証用ドメイン
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().min(1),
    // Firebase プロジェクトID
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().min(1),

    // --- Sentry ---

    // Sentry DSN（Data Source Name）
    NEXT_PUBLIC_SENTRY_DSN: z.string().min(1),
    // Sentry 環境名（environment）
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: z.string().min(1),
    // Sentry リリース名（release）
    // - Git SHA の公開は避けたいので、公開しても問題ない識別子を使う
    NEXT_PUBLIC_SENTRY_RELEASE: z.string().min(1),

    // --- Firebase Emulator ---

    // Firebase Client SDK （ブラウザ）で Auth Emulator を使うかどうか（使うなら1をセット）
    // ※本番では有効化しないこと
    NEXT_PUBLIC_USE_FIREBASE_AUTH_EMULATOR: z
      .string()
      .min(1)
      .optional()
      .or(z.literal("")),

    // --- Supabase ---

    // （任意）
    NEXT_PUBLIC_SUPABASE_URL: z.url().optional().or(z.literal("")),
    // （任意）
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z
      .string()
      .min(1)
      .optional()
      .or(z.literal("")),
  },

  /**
   * runtimeEnv
   * - 実際に process.env から値を受け取る入口
   * - ここに書かれていないと、型はあっても値が流れない
   */
  runtimeEnv: {
    // ----------------------------
    // Public
    // ----------------------------

    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
    NEXT_PUBLIC_CONTACT_FORM_URL: process.env.NEXT_PUBLIC_CONTACT_FORM_URL,
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID:
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    NEXT_PUBLIC_SENTRY_RELEASE: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    NEXT_PUBLIC_USE_FIREBASE_AUTH_EMULATOR:
      process.env.NEXT_PUBLIC_USE_FIREBASE_AUTH_EMULATOR,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
});
