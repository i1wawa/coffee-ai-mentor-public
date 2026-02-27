# Contributing

- [1. このドキュメントの位置づけ](#1-このドキュメントの位置づけ)
- [2. 開発フロー](#2-開発フロー)
- [3. DoR (着手可能の定義)](#3-dor-着手可能の定義)
- [4. コードレビュー基準](#4-コードレビュー基準)
- [5. DoD (完了の定義)](#5-dod-完了の定義)
- [6. 命名規則](#6-命名規則)
  - [6.1 ファイル名](#61-ファイル名)
  - [6.2 関数名](#62-関数名)
  - [6.3 変数名](#63-変数名)
  - [6.4 リレーショナルデータベース](#64-リレーショナルデータベース)
  - [6.5 サーバーデータキャッシュのクエリキー](#65-サーバーデータキャッシュのクエリキー)
  - [6.6 クライアントストレージキー](#66-クライアントストレージキー)

## 1. このドキュメントの位置づけ

以下のように、役割が重複しにくいように責務を分けています。

- [`README.md`](README.md): リポジトリ全体像・目的・関連ドキュメントの入口
- [`apps/web/README.md`](apps/web/README.md): Webアプリのセットアップ・起動・テスト手順
- [`CONTRIBUTING.md`](CONTRIBUTING.md): 開発ルール・PR運用・レビュー基準・命名規則

## 2. 開発フロー

1. Issueを作成  
   (テンプレート準拠)
2. `main`からブランチを切る  
   (ブランチ名は[docs/process/ci-cd-and-test-strategy.md](docs/process/ci-cd-and-test-strategy.md)を参照)
3. コミットする  
   (メッセージの書き方は[docs/process/ci-cd-and-test-strategy.md](docs/process/ci-cd-and-test-strategy.md)を参照)
4. PRを作成  
   (テンプレート準拠)
5. (任意)`staging`にデプロイ・検証
6. `main`へマージ  
   (マージ方針は[docs/process/ci-cd-and-test-strategy.md](docs/process/ci-cd-and-test-strategy.md)を参照)
7. リリース作業  
   ([docs/process/ci-cd-and-test-strategy.md](docs/process/ci-cd-and-test-strategy.md)を参照)

## 3. DoR (着手可能の定義)

- 背景・目的が簡潔に言える
- 受け入れ条件が明確
- 依存タスクが解消済み
- 作業内容が明確
- 成果の形式が決まっている

## 4. コードレビュー基準

- 変更は小さく (1PR: 400行以内が目安)
- 「意図」を冒頭3行で説明 (何を、なぜ、どう検証したか)
- テスト・セキュリティ・パフォーマンス・可読性・保守性・再利用性の観点でチェック
- コメントは提案形式で

## 5. DoD (完了の定義)

- 受け入れ条件をすべて満たしている
- レビュー・自動テストを全て通過
- 対象環境で動作確認済み
- 内容を設計書・PRなどへ反映済み
- リリース作業を完了済み ([docs/process/ci-cd-and-test-strategy.md](docs/process/ci-cd-and-test-strategy.md)を参照)
- (該当時)ロールバック手順を明記
- (該当時)監視・アラートを更新

## 6. 命名規則

- 略語は基本回避  
  ※使用する場合、単語扱い・キャメルケース (userId, requestUrl)
- 長文化するなら`of`は避ける (冗長・曖昧になりやすい)

### 6.1 ファイル名

- フレームワークやライブラリの予約名があれば、それを優先する
  - 構文: `<スコープ>.<役割>.[<実行環境>].<拡張子>`  
     (例: event-target.bus.ts, event-bus.port.ts)
    - 実行環境: .server / .client (server-only / client-only の分離)
  - ユースケース: 動詞句
  - ドメイン: 名詞句 (単数形)

  <!-- prettier-ignore -->
  | ファイル                  | 命名規則               |
  | ----------------------- | --------------------- |
  | 通常ファイル (tsx)        | kebab-case            |
  | Reactコンポーネント (tsx) | PascalCase            |
  | 通常ファイル (ts)         | kebab-case           |
  | フック (ts)              | use-xxx (kebab-case) |
  | Terraform (tf)          | snake_case           |
  | ドキュメント (md)         | kebab-case           |

  <!-- prettier-ignore -->
  | 分類 | 役割                       | 命名規則             |
  | --- | -------------------------- | ------------------ |
  |     | スタイル定義                 | .styles            |
  |     | 画面                        | .view              |
  |     | Reactコンポーネント          | .ui                |
  |     | フック                      |.hook               |
  |     | 生成                       | .factory            |
  |     | メッセージング               | .bus               |
  |     | 正規化                      | .normalize          |
  |     | スキーマ (検証・変換)         | .schema            |
  |     | スキーマ適用                 | .guard             |
  |     | 汎用関数                    | .util              |
  |     | 環境設定                    | .config            |
  |     | 単体テスト                  | .test              |
  |     | サービステスト               | .service.test      |
  |     | 統合テスト                  | .integration.test  |
  |     | E2Eテスト                   | .spec              |
  |     | Page Object Model          | .pom               |
  |     | ユースケース                 | .usecase           |
  |     | 外部I/O境界 (具体)           | .adapter           |
  |     | 外部I/O境界 (抽象)           | .port              |
  |     | コンポジションルート          | .composition       |
  |     | 型                         | .types             |
  |     | 型変換                     | .mapper             |

### 6.2 関数名

- 基本は動詞句構文 (Reactコンポーネントのみ名詞句構文)
  - 構文 (動詞句): `<動詞><目的語>[By<キー>][For<目標>][With<ツール>][In<スコープ>][At<時間>]`  
     (例: fetchUserById, updateProfileWithForm, readFromFile, renderInModal, runAtStartup)
  - 構文 (名詞句): `<名詞>[By<キー>][For<目標>][With<ツール>][In<コンテキスト>][At<時間>][<単位>]`  
     (例: UserCard)
  - Sync, Asyncは不使用 (Promise型で判別可能なため)  
     (※同期版と非同期版を併存させる場合のみ、識別のため`parseSync/parseAsync`のように明示)

  <!-- prettier-ignore -->
  | 関数              | 命名規則             |
  | ----------------- | ------------------ |
  | 通常関数           | camelCase          |
  | カスタムフック      | useXxx (camelCase) |
  | Reactコンポーネント | PascalCase ※名詞句  |

  <!-- prettier-ignore -->
  | 分類    | 処理内容                  |先頭語彙                |
  | ------- | ----------------------- | --------------------- |
  | イベント | イベント (内部処理)        | handle               |
  |        | イベント (購読開始)        | on                    |
  |        | イベント (発火・公開)       | emit                  |
  | 取得    | 通常単一取得               | get                   |
  |        | 通常複数取得               | list                  |
  |        | ネットワーク取得 (外部I/O)  | fetch                 |
  |        | DB取得                    | read                 |
  | 生成    | 新規作成 (永続化)          | create ※makeは不使用  |
  | 保存    | 抽象保存／更新              | save                 |
  |        | 部分更新                   | update               |
  |        | 全置換 (PUT相当)           | replace              |
  | 削除    | 削除 (永続化)             | delete                |
  |        | 削除 (解除)               | remove                |
  | 外部出力 | 外部出力                  | send                  |

### 6.3 変数名

- 構文 (名詞句): `<名詞>[By<キー>][For<目標>][With<ツール>][In<スコープ>][At<時間>][<単位>]`  
   (例: totalPrice, timeoutMs, isPublic)
  - 名詞は基本的に単数形  
     (配列・集合は複数形)
  - 否定名は避ける

    <!-- prettier-ignore -->

  | 変数     | 命名規則                              |
  | -------- | ------------------------------------- |
  | 基本変数 | camelCase (インターフェースは不使用)  |
  | 型       | PascalCase (インターフェースは不使用) |
  | 定数     | UPPER_SNAKE_CASE                      |
  | 環境変数 | UPPER_SNAKE_CASE                      |

    <!-- prettier-ignore -->

  | 役割         | 命名規則                                          |
  | ------------ | ------------------------------------------------- |
  | URL          | 最後尾に`url`                                     |
  | ブール       | 先頭に`is/has/should/can/did/will` (例: isPublic) |
  | ジェネリクス | 先頭に`T` (例: TItem, TResult)                    |
  | マップ       | 最後尾に`By<キー>` ※map/indexは不使用             |

### 6.4 リレーショナルデータベース

- データベース名: snake_case＋複数形、サービス or バウンデッドコンテキストを表す  
   (例: `coffee_notes`, `coffee_tasting_app`)

- テーブル名: snake_case＋エンティティ名複数形  
   (例: `users`, `tasting_notes`, `mentoring_sessions`, `chat_messages`)
  - 中間テーブル: `<エンティティ名単数形>_<エンティティ名複数形>`  
     (例: `mentoring_session_tasting_notes`, `tasting_note_flavors`)

- 主キー名: `id`

- 外部キー名: 参照先の`<エンティティ名単数形>_id`  
   (例: `tasting_notes.user_id`, `tasting_notes.user_coffee_profile_id`)

- カラム順序規則
  1. ID
  2. 外部キー
  3. 時間・状態系 (recorded_at, started_at, status)
  4. ドメイン系を種類ごとに
  5. 制御系 (is_default, is_active)
  6. 監査系 (created_at, updated_at, deleted_at)

### 6.5 サーバーデータキャッシュのクエリキー

- `['<リソース名・テーブル名>', ['<対象・スコープ>'], { <params> }]`  
   (例: `['todos']`, `['todo', 5]`, `['todos', { status: 'done' }]`)

### 6.6 クライアントストレージキー

- `<アプリ名>[-<環境>]:<目的>:<データ種別>:<ドメイン>:<具体名>[:<識別子>...]:v<スキーマバージョン>`  
   (例: `cam-prod:cache:query:tanstack:offline:r-42:v1`, `cam-prod:draft:form:tastingnote:create:u-42:v1`)
