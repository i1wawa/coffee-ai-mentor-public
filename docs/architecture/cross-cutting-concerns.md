# Coffee AI Mentor - Cross Cutting Concerns

- [1. セキュリティ方針](#1-セキュリティ方針)
  - [1.1 OWASP ASVS Level 1目安](#11-owasp-asvs-level-1目安)
  - [1.2 OWASP ASVS Level 2目安](#12-owasp-asvs-level-2目安)
- [2. シークレット管理](#2-シークレット管理)
- [3. オブザーバビリティ](#3-オブザーバビリティ)
  - [3.1 エラー（Sentry）](#31-エラーsentry)
  - [3.2 トレース（Sentry）](#32-トレースsentry)
  - [3.3 ログ（Cloud Logging）](#33-ログcloud-logging)
  - [3.4 メトリクス（Sentry・Cloud Monitoring）](#34-メトリクスsentrycloud-monitoring)
  - [3.5 アラート（Sentry）](#35-アラートsentry)

## 1. セキュリティ方針

- [OWASP ASVS](https://owasp-aasvs.readthedocs.io/en/latest/index.html)のLevel 1を参考
  （将来的にLevel 2相当に）

### 1.1 [OWASP ASVS Level 1](https://owasp-aasvs.readthedocs.io/en/latest/level1.html)目安

- 認証：サーバ側検証／TLS必須／パスワードは承認されたKDF（Key Derivation Function）・ハッシュ（bcrypt/Argon2等）
- セッション：CookieはSecure・HttpOnly・SameSiteを付与／認証後のID再発行／サインアウトで無効化
- アクセス制御：サーバ側で強制制御／MFA（Multi Factor Authentication）
- 入出力：サーバ側入力検証（型・長さ・許容リスト）／文脈別エスケープでXSS等を防止
- 暗号・通信：TLS設定＋HSTS／資格情報の平文保存・送信禁止
- ログ：認証・認可イベントを監査ログ化／機密は記録禁止／例外の安全な失敗
- 設定・依存：デフォルトPW禁止／秘密情報を安全管理／依存脆弱を定期更新

Level 1検証

- CI：依存チェック（SCA）・基本的な静的解析（SAST）
- 手動：主要フローの未認証遮断・典型XSS/SQLi
- 監査ログの出力確認

### 1.2 [OWASP ASVS Level 2](https://owasp-aasvs.readthedocs.io/en/latest/level2.html)目安

- 認証：高リスク操作にMFA／資格情報の登録・変更・回復を安全実装・可監査
- セッション：十分なランダム性／短寿命／CSRF対策（トークン＋SameSite）
- アクセス制御：ロール・権限モデルを文書明記／オブジェクトレベル権限確認（IDOR対策）
- 入出力：重要入力は正規化→検証／ファイル・リッチ入力はサーバ側サニタイズ
- 暗号：最新TLS設定＋HSTS／個人情報・機密情報を保存時暗号化（鍵管理を分離・鍵の定期再発行など）
- ログ・監査：認証・認可・設定変更・例外・管理操作を監査対象化／改ざん耐性（専用ストレージ保存など）／定期レビュー
- 設定・依存：重大な依存脆弱は期限内更新／機能フラグ・管理操作は認可・監査を必須化

Level 2検証

- CI：静的解析（SAST）・依存解析（SCA）・動的解析（DAST）
- 設計：脅威モデリング（攻撃想定）
- 重要リリース前：セキュリティレビュー or 侵入テスト

## 2. シークレット管理

- 管理場所
  - Google Cloud Secret Manager：Cloud Runから参照
    - Secretのアクセス権限はCloud Runのサービスアカウントに最小限付与
  - GitHubリポジトリ：Environmentsごとに分けて保存／取得
- `.env`ファイルを使う場合はローカル開発専用とする

## 3. オブザーバビリティ

### 3.1 エラー（Sentry）

- 想定内・想定外を分ける
- ユーザーには一般的なエラー文言だけ返す

- フロントエンド：Sentry SDKでキャプチャ
  - Breadcrumb（操作歴）：手動で仕込む
    - ユースケース単位（実行ボタン、再試行ボタン）
    - TanStack Queryのmutation/queryの共通ラッパ

- バックエンド：Server Actions/Route Handlersで、リクエストごとに例外を捕捉し、INTERNAL_ERRORのみSentryに送信
  - 調査用タグ：`http_status_code`, `error_code``
  - `error_id` は高カーディナリティになりやすいため contexts/extra に載せる

### 3.2 トレース（Sentry）

- 紐付け：Sentryからevent_idを受け取り、ログに含める
- 区切り
  - フロントエンド：ユーザー操作＝1トランザクションとする  
    （ページ読み込み・画面遷移は自動で区切られる）
  - バックエンド：1リクエスト＝1トランザクションとする
    - 重要なユースケース単位、外部依存単位でスパンを区切る

### 3.3 ログ（Cloud Logging）

- フロントエンド：現段階ではログはとらない

- バックエンド：JSONで構造化ログにして標準出力
  - 共通フィールドを持たせてグルーピングする
    - 紐付け：リクエストごとに、Cloud RunからW3C traceparentのtraceIdを取得し、`logging.googleapis.com/trace`を付与
      （W3C traceparentのtraceIdが取得できなかった場合の保険として、リクエスト時にアプリ側でrequest_idを生成して付与）
  - 重要なリクエストごとに成功／失敗、所要時間も持たせる  
   （HTTPリクエストはCloud Runのログも見る）
  <!-- （規模が大きくなったら）
  - 重要なユースケース単位でイベントログを残す
    - LLM呼び出しは内部IDをキーとしたトレースに限定し、promptやresponse全文はログに入れない
  - 重要な外部依存の境界ログを残す
    -->
  - ログにはSecretやフルのメールアドレス等の個人情報を含めない
  - ログの保持期間を用途ごとに決める
    - ひとまず30日（デフォルト）。将来トラフィックが増えたら、ログ削減か別サービスへの移行を検討

#### 3.3.1 ログレベル規則

- [Cloud LoggingのLogSeverity](https://docs.cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry#LogSeverity)に合わせる

  <!-- prettier-ignore -->
  | 分類     | 本番環境| 該当内容                                       | 例                                          |
  | ------- | ------ | --------------------------------------------- | ------------------------------------------- |
  | ERROR   | Yes    | 機能の一部が動作しないが、アプリケーションは継続可能。 | ユースケース失敗、外部依存失敗など                |
  | WARNING | Yes    | 想定外だが自己回復・継続可能。                     | リトライで成功、外部依存の一時遅延、予兆           |
  | NOTICE  | Yes    | 正常系の重要なイベント                            | ユースケース完了、起動／停止など                 |
  | INFO    | Yes    | 正常系のイベント                                 | セキュリティ上の成功、重要な状態遷移、連携完了など  |
  | DEBUG   | No     | 開発者が問題特定のために使う詳細情報                |                                             |

#### 3.3.2 構造化ログ規則

- 基本事項
  - 形式
    - JSON形式で出力する
    - 1行1イベント（改行を含む巨大ログを出さない）

  - 機密情報・個人情報
    - Secretをログに出さない
    - メールアドレス全文をログに出さない
    - LLMのprompt/response全文をログに出さない（必要なら内部IDやtoken数などのメタ情報に限定する）
    - ユーザー入力の生データは原則ログに出さない（出す場合は要約・分類など安全な形に限定する）

  - 共通フィールド：すべてのログに以下のフィールドを付与する
    1. `env`: `enum`
    - 実行環境
      - `prod`
      - `stg`
      - `dev`
    2. `service`: `string`
    - サービス名（例："coffee-ai-mentor"）
    3. `release`: `string`
    - デプロイ識別子（例: "web-123456789"）
    4. `request_id`: `string`
    - アプリ側で生成する相関ID。1リクエストのログを束ねる（UUIDv7等の衝突しにくい形式）

  - Google Cloud Logging用共通フィールド
    1. `severity`: `enum`
    - Cloud LoggingのLogSeverity（ログレベル規則のもののみ使用）
      - `ERROR`
      - `WARNING`
      - `NOTICE`
      - `INFO`
      - `DEBUG`
    2. `event`：`enum`
    - ログイベント種別
      - `request.summary`
      - `usecase.end`
      - `dependency.call`
      - `auth.audit`
    3. `logging.googleapis.com/trace`：`string`
    - Cloud Trace連携用の特殊フィールド（`projects/[PROJECT-ID]/traces/[TRACE-ID]`形式）
    4. `message`：`string`
    - 人間が読める短い説明

- イベント種別：以下のeventのみを公式イベントとして扱う（増殖は原則しない）
  - `request.summary`：1リクエストの成功/失敗、ステータス、所要時間を必ず1本に集約し、基礎的な調査の起点にする
    - 出力回数：1リクエストにつき必ず1本（成功でも失敗でも出す）
    - フィールド
      1. `route_pattern`: `string`
      - パターンで固定化した相対パス（例: "api/items/:id"）
      2. `http_method`: `enum`
      - HTTPメソッド
        - `GET`
        - `POST`
        - `PUT`
        - `PATCH`
        - `DELETE`
        - `OPTIONS`
        - `HEAD`
      3. `http_status_code`: `number`
      - HTTPステータスコード
      4. `ok`: `boolean`
      - 成功/失敗フラグ
      5. `latency_ms`: `number`
      - 所要時間（ms）
      6. `user_hash：`string`
      - 匿名ID（sha256等、復元不能な形で保持）
      7. `error_id`: `string`
      - アプリ側で生成するエラー用相関ID。（UUIDv7等の衝突しにくい形式、かつコピーできる短さ）
      - 問い合わせ用IDに使う
      8. `error_code`: `enum`
      - エラーコード（`request.summary`、`dependency.call`で共通。HTTPステータス対応表は下に記載）
      - UIの挙動分岐に使う
      9. `sentry_event_id`: `string`
      - Sentryから受け取るイベントID

  - `usecase.end`
    - 目的：重要ユースケースの完了率・所要時間など、成功指標の材料を残す
    - フィールド
      1. `usecase`: `enum`
      - ユースケース識別子
        - `usecase.tasting_note.create`
        - `usecase.mentoring_session.generate`
        - `usecase.mentoring_session.save`
      2. `ok`: `boolean`
      - 成功/失敗フラグ
      3. `latency_ms`: `number`
      - 所要時間（ms）

  - `dependency.call`：外部依存の総数/エラー/レイテンシ分布のメトリクス材料を提供する（Terraformで抽出する前提）
    - 出力回数：外部依存呼び出し1回につき必ず1本（成功でも失敗でも出す）
      - try/finally等で計測し、例外発生時やタイムアウト時でも必ず出力する
    - フィールド
      1. `dependency`: `enum`
      - 外部依存識別子
        - `llm.gemini`
        - `db.supabase`
        - `auth.supabase`
        - `mail.resend`
        - `obs.sentry`
      2. `ok`: `boolean`
      - 成功/失敗フラグ
      3. `operation`: `enum`
      - 依存先で実行した操作種別
        - `generate`
        - `select`
        - `insert`
        - `update`
        - `upsert`
        - `delete`
        - `send_email`
        - `verify_token`
      4. `latency_ms`: `number`
      - 所要時間（ms）
      5. `dependency_error_code`: `string`
      - 外部依存が返したエラーコード
      6. `dependency_error_type`: `string`
      - 外部依存が返したエラーコードの分類（外部依存横断で揃える）
      7. `error_id`: `string`
      - アプリ側で生成するエラー用相関ID。（UUIDv7等の衝突しにくい形式、かつコピーできる短さ）
      - 問い合わせ用IDに使う
      8. `error_code``: `enum`
      - エラーコード（`request.summary`、`dependency.call`で共通。HTTPステータス対応表は下に記載）
      - UIの挙動分岐に使う

  - `auth.audit`：認証の重要イベントを追跡し、調査可能にする
    - フィールド
      1. `action`: `enum`
      - 認証イベント識別子
        - `signin`
        - `signout`
        - `token_refresh`
        - `auth_callback`
      2. `ok`: `boolean`
      - 成功/失敗フラグ
      3. `user_hash：`string`
      - 匿名ID（sha256等、復元不能な形で保持）

#### 3.3.3 エラーコード - HTTPステータス対応表

<!-- prettier-ignore -->
  | error_code`          | status | 理由（要点）                            |
  | ------------------- | -----: | ------------------------------------- |
  | VALIDATION_FAILED   |    400 | 入力不正                               |
  | AUTH_REQUIRED       |    401 | 認証が必要                             |
  | AUTH_INVALID        |    401 | 認証情報が無効。期限切れ・改ざん等         |
  | ACCESS_DENIED       |    403 | 権限不足                               |
  | RESOURCE_NOT_FOUND  |    404 | 対象リソースが存在しない                  |
  | RESOURCE_CONFLICT   |    409 | 競合                                  |
  | PRECONDITION_FAILED |    412 | 前提条件NG                             |
  | RATE_LIMITED        |    429 | レート制限                             |
  | QUOTA_EXCEEDED      |    429 | クォータ枯渇                           |
  | CANCELLED           |    499 | クライアント都合の中断（statusは非標準）   |
  | DEADLINE_EXCEEDED   |    504 | タイムアウト（上流/期限超過）             |
  | UNAVAILABLE         |    503 | 一時障害                               |
  | UNIMPLEMENTED       |    501 | 未実装                                 |
  | INTERNAL_ERROR      |    500 | 想定外                                 |

### 3.4 メトリクス（Sentry・Cloud Monitoring）

- フロントエンド：Sentryで測定
  - レイテンシ
    - 外部依存を含む重要なユーザー操作（認証・DB保存・LLM呼び出し）のp95レイテンシ
  - JavaScriptのエラー率（Uncaught・Unhandled rejection）
  - クラッシュフリー率

- バックエンド：Cloud Monitoringで測定  
  （[Google SREのThe Four Golden Signals](https://sre.google/sre-book/monitoring-distributed-systems/#xref_monitoring_golden-signals)を参考）
  - レイテンシ：外部依存はアプリログから`latency_ms`を抽出
    - 外部依存（認証・DB・LLM・メール）のp95レイテンシ
  - トラフィック
    - 外部依存（DB保存・LLM呼び出し）の実行数/分
  - エラー率：アプリログから成功／失敗を抽出
    - 外部依存（認証・DB保存・LLM・メール）のHTTP 5xx率
  - リソース飽和度
    - CPU使用率、メモリ使用率、インスタンス数、同時リクエスト数、再起動数
  - 成功指標
    - テイスティングノート～メンタリングセッション記録時間
    - テイスティングノート～メンタリングセッション記録完了率

### 3.5 アラート（Sentry）

- 死活監視：`/api/health/live`が3回連続失敗した場合
- 受け付け準備監視（※未実装）：`/api/health/ready`が3回連続失敗した場合
- エラー監視：本番環境でSentryのイベントレベルがerror以上の新規エラー
