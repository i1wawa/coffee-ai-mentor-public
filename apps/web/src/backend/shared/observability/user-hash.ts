// apps/web/src/backend/shared/observability/user-hash.ts
// ============================================================================
// 概要:
// - userHash（匿名ID）を生成するユーティリティ
//
// 責務:
// - uid から userHash を生成し、ログ上の同一ユーザー相関だけ可能にする
//
// 非目的:
// - uid/email などの識別子をログに出すこと（この値で代替する）
// - salt なしハッシュ（sha256(uid) 等）での匿名化
//
// 前提:
// - USER_HASH_SALT を設定できる（未設定時は環境により扱いが変わる）
//
// 位置づけ（アーキテクチャ）:
// - backend/shared/observability 配下の共通ユーティリティ
// - ログ設計（PII削減）を支える下位部品
//
// セキュリティ/機微情報:
// - 単純な sha256(uid + salt) は伸長攻撃（Length Extension Attack）で偽造リスクがあるため使わない
// - HMAC（Hash-based Message Authentication Code）で生成し、伸長攻撃に強くする
// - salt は秘密扱い（ログに出さない）
// ============================================================================

import crypto from "node:crypto";

/**
 * uid を匿名化した userHash（sha256）を HMAC で生成する。
 * - 単なる crypto.createHash("sha256").update(uid + salt).digest("hex") のような書き方をすると、
 *   伸長攻撃（Length Extension Attack）という手法で、秘密鍵を知らなくてもハッシュ値を偽造されるリスクがある
 * - HMAC は内部で二重にハッシュ化を行うため、伸長攻撃に強い
 */
export function hashUidToUserHash(uid: string): string {
  // 変更点:
  // - env.server.ts の一括検証に巻き込まれないよう、ここでは必要な env だけ直接読む
  const configuredSalt = process.env.USER_HASH_SALT?.trim();
  const salt =
    configuredSalt && configuredSalt.length > 0 ? configuredSalt : "dev-salt";
  return crypto.createHmac("sha256", salt).update(uid).digest("hex");
}
