// apps/web/src/tests/utils/error-message.ts
// ========================================================
// 概要:
// - テスト失敗メッセージ生成ユーティリティ（共通）
//
// 契約:
// - 先頭行は `[reason] summary`
// - expected / observed / nextActions は存在するものだけ出力
// - nextActions は最大3件を " / " で連結
// ========================================================

// テスト失敗メッセージの分類
export const TEST_FAILURE_REASON = {
  CONTRACT_VIOLATION: "契約違反",
  ABORTED: "実行停止",
  PRECONDITION_FAILED: "前提不成立",
  EXTERNAL_CAUSE: "外部要因",
} as const;

export type TestFailureReason =
  (typeof TEST_FAILURE_REASON)[keyof typeof TEST_FAILURE_REASON];

// テスト失敗メッセージの入力。
export type TestFailureMessageInput = {
  reason: TestFailureReason;
  // 例：未サインインで/appに直アクセスすると/sign-inに誘導されるべきです。
  summary: string;
  // 期待/観測/対処は短く
  expected?: string;
  observed?: string;
  nextActions?: string[];
};

/**
 * テスト用の失敗メッセージを生成
 * - 4行構造（契約・期待・観測・対処）を基本形として固定
 * - 無い項目は省略し、冗長にならないようにする
 */
export function buildTestFailureMessage(
  input: TestFailureMessageInput,
): string {
  const lines: string[] = [];

  // 1) 先頭行：タグ＋契約の断言
  lines.push(`[${input.reason}] ${input.summary}`);

  // 2) 期待：あれば出す
  if (input.expected) {
    lines.push(`期待: ${input.expected}`);
  }

  // 3) 観測：あれば出す
  if (input.observed) {
    lines.push(`観測: ${input.observed}`);
  }

  // 4) 対処：最大3つまで（長文化すると読まれない）
  if (input.nextActions && input.nextActions.length > 0) {
    const actions = input.nextActions.slice(0, 3).join(" / ");
    lines.push(`対処: ${actions}`);
  }

  return lines.join("\n");
}

/**
 * テスト用の失敗メッセージを生成し、Errorオブジェクトとして返す
 * - 実行を止めるべき状況（安全ゲート等）用のErrorをつくる
 */
export function createTestFailureError(input: TestFailureMessageInput): Error {
  return new Error(buildTestFailureMessage(input));
}
