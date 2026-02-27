// src/app/api/(health)/health/live/route.ts
// ----------------------------------------------------------------
// 概要:
// - Liveness Probe 用ヘルスチェック（生存確認のみ）
//
// 契約:
// - Method: GET
// - Path: /api/health/live
// - Success: 200 + { ok: true, data: { status: "ok" } }
//
// セキュリティ/機微情報:
// - 機微情報は扱わない
//
// 観測:
// - 追加ログは出さない
// ----------------------------------------------------------------

import { NextResponse } from "next/server";
import { buildApiOkBody } from "@/backend/shared/http/api-response";

// Next.jsのランタイムをNode.jsに指定
export const runtime = "nodejs";
// Next.jsのキャッシュ設定を動的にする
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(buildApiOkBody({ status: "ok" }), {
    status: 200,
    headers: {
      // ブラウザ・中間キャッシュに残って正常に見え続けるのを防ぐ
      "cache-control": "no-store",
    },
  });
}
