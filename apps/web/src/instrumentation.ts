// apps/web/src/instrumentation.ts
// ============================================================================
// 概要:
// - サーバー起動時に「1回だけ」実行したい初期化処理（監視/環境検証）を集約する。
//
// 責務:
// - Node.js runtime（server）でのみ、サーバ環境の不変条件検証を起動時に実行する。
//
// 前提:
// - register() は Next.js により複数ランタイム（nodejs/edge）で呼ばれ得る。
// - NEXT_RUNTIME は Next.js が設定する（nodejs / edge）。
// ============================================================================

export async function register() {
  // Next.js が現在どのランタイムで動いているかを示す値（Next.js が自動でセットする）
  // - nodejs: Node.js サーバ（Cloud Run 等）
  // - edge: Edge Runtime（制限が多く Node.js API が使えない）
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // server-only モジュールを nodejs の時だけ読み込む
    // - これにより edge / client への混入を避けられる
    const { assertServerEnvInvariants } = await import(
      "./backend/shared/env-invariants.server"
    );

    // サーバー環境の不変条件を起動時に検証する
    assertServerEnvInvariants();
  }
}
