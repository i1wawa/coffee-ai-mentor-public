// packages/errors/src/fail-fast.ts
// ================================================================
// 概要:
// - fail-fast（起動停止）ユーティリティ（共通）
// - 継続稼働すると危険 / 何も提供できない状態を検出したら、起動時に即停止する
//
// 責務:
// - 起動停止に至る理由（reason）を運用で分類できる形で統一する
// - 失敗メッセージを「分類＋要点」中心に短く組み立てる（期待/観測/対処は任意）
// - Secret をメッセージにもログにも含めない前提で使える形に寄せる
//
// 前提:
// - Node.js / Cloud Run など「起動時例外＝即停止」が期待される環境を想定する
// ================================================================

/**
 * fail-fast の原因区分
 * - 監視・運用で「なぜ落ちたか」を分類できるようにする
 */
export const FAIL_FAST_REASON = {
  // 必須設定が無い
  設定不足: "設定不足",
  // 設定はあるが形式/値が不正
  設定不正: "設定不正",
  // セキュリティ上、動かすべきでない設定
  セキュリティリスク: "セキュリティリスク",
  // 想定外の実行環境（互換性がない）
  非対応実行環境: "非対応実行環境",
  // コードの前提崩壊（契約違反、到達不能など）
  契約違反: "契約違反",
} as const;

export type FailFastReason =
  (typeof FAIL_FAST_REASON)[keyof typeof FAIL_FAST_REASON];

export type FailFastInput = {
  reason: FailFastReason;
  summary: string;
  expected?: string;
  observed?: string;
  nextActions?: string[];
};

/**
 * 実行停止の失敗メッセージを生成
 * - 4行構造（契約・期待・観測・対処）を基本形として固定
 * - 無い項目は省略し、冗長にならないようにする
 */
export function buildFailFastMessage(input: FailFastInput): string {
  const lines: string[] = [];

  // 1) 先頭行：分類＋断言
  lines.push(`[実行停止: ${input.reason}] ${input.summary}`);

  // 2) 期待
  if (input.expected) lines.push(`期待: ${input.expected}`);

  // 3) 観測
  if (input.observed) lines.push(`観測: ${input.observed}`);

  // 4) 対処（最大3つ）
  if (input.nextActions && input.nextActions.length > 0) {
    lines.push(`対処: ${input.nextActions.slice(0, 3).join(" / ")}`);
  }

  return lines.join("\n");
}

/**
 * 実行停止用の失敗メッセージを生成し、Errorオブジェクトを投げて終了する
 */
export function failFast(input: FailFastInput): never {
  throw new Error(buildFailFastMessage(input));
}
