# /api/security/csp-report — HTTP契約

前提:

- 目的は CSP 違反レポートの受信と構造化ログ出力
- レスポンス本文は返さない
- 全レスポンスは `Cache-Control: no-store` を含む

## POST /api/security/csp-report

Request body:

- `Content-Type: application/csp-report`（legacy / report-uri 形式）
- `Content-Type: application/reports+json`（modern / report-to 形式）

Response:

- HTTP Status: `204 No Content`
- Body: なし

備考:

- 不正JSONや未知形式、未対応 Content-Type の場合でも、情報露出を避けるため 204 を返す
- parser は Content-Type で決定し、legacy/modern に適切に対応（相互フォールバックはなし）
- 受信値はサニタイズ後に `csp.report` としてログ出力する
