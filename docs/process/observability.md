# Coffee AI Mentor - Observability

## 1. 目的

- 監視・調査の入口を 1 つにまとめる
- Cloud Run リクエストログの正常ノイズを明確化し、誤検知を減らす

## 2. 対象

- Cloud Run リクエストログ
  - `logName = "projects/<PROJECT_ID>/logs/run.googleapis.com%2Frequests"`
- 主に見る項目
  - `httpRequest.status`
  - `httpRequest.requestUrl`
  - `httpRequest.userAgent`
  - `httpRequest.latency`

## 3. 既知ノイズ

### WARNING

- `favicon.ico` の `404`
  - 例: `GET /favicon.ico -> 404`
  - 理由: `public/favicon.ico` 未配置の場合にブラウザが自動リクエストするため

- `source map` の `404`
  - 例: `GET /_next/static/chunks/*.js.map -> 404`
  - 理由: ブラウザが sourcemap を参照する一方で、Sentry の sourcemap 削除設定により map が配信物に残らないため

## 4. 調査開始の目安

- `5xx` が継続して発生する
- 同一 URL の `4xx` が急増し、既知ノイズに該当しない
- `latency` が通常より継続的に悪化する

## 5. 最低限の調査手順

1. 期間を直近 15 分に絞る
2. `status >= 500` を優先して確認する
3. `requestUrl` と `userAgent` で同種イベントを束ねる
4. `favicon.ico` と `*.map` の既知ノイズを除外して再確認する
5. 必要に応じてアプリ側の構造化ログ（`event=request.summary`）と突き合わせる

## 6. 運用ルール

- 既知ノイズはこの文書の「3. 既知ノイズ（WARNING）」に追記する
- 監視方針やセキュリティ方針を変更する場合は ADR を作成する

## 7. 参考

- Cloud Run のログ: https://cloud.google.com/run/docs/logging
- Next.js `productionBrowserSourceMaps`: https://nextjs.org/docs/app/api-reference/config/next-config-js/productionBrowserSourceMaps
- Sentry Next.js sourcemaps: https://docs.sentry.io/platforms/javascript/guides/nextjs/sourcemaps/
