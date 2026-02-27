// apps/web/src/frontend/entities/user/model/user-me.query.ts
// ========================================================
// 概要:
// - users/me クエリの共通 queryKey を定義する
//
// 責務:
// - queryKey を 1 箇所に集約し、複数 feature から参照可能にする
// ========================================================

export const USER_ME_QUERY_KEY = ["users", "me"] as const;
