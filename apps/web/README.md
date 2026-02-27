# apps/web

- [概要](#概要)
- [現在の実装範囲（要約）](#現在の実装範囲要約)
- [セットアップ](#セットアップ)
  - [0. 前提環境](#0-前提環境)
  - [1. リポジトリをクローンして移動する](#1-リポジトリをクローンして移動する)
  - [2. 依存関係をインストール（ホスト実行/テストする場合）](#2-依存関係をインストールホスト実行テストする場合)
  - [3. `.env.local` を作成する](#3-envlocal-を作成する)
  - [4. Firebase プロジェクトを作成して Web アプリ設定値を取得する](#4-firebase-プロジェクトを作成して-web-アプリ設定値を取得する)
  - [5. `.env.local` に Firebase 設定値を反映する](#5-envlocal-に-firebase-設定値を反映する)
  - [6. ローカル HTTPS 証明書を用意する](#6-ローカル-https-証明書を用意する)
- [開発サーバー起動](#開発サーバー起動)
  - [起動前の共通確認](#起動前の共通確認)
  - [パターンA: Docker Compose で起動](#パターンa-docker-compose-で起動)
  - [パターンB: ホストで起動（Firebase Auth Emulator 併用）](#パターンb-ホストで起動firebase-auth-emulator-併用)
- [テスト](#テスト)

## 概要

`Coffee AI Mentor` の Web アプリケーション本体です。  
Next.js App Router を使い、フロントエンド UI とバックエンド API（Route Handler）を同一デプロイユニットで運用します。

## 現在の実装範囲（要約）

- 認証機能（Firebase Authentication + session cookie）
- サインイン / サインアウト（単端末・全端末）
- セッション確認 / 自分情報取得
- アカウント削除（recent login 条件あり）
- Sentry / Cloud Logging による観測基盤

補足:

- DB・LLMなどのアプリ本体は未実装（段階的に追加予定）

## セットアップ

### 0. 前提環境

- 共通
  - `mkcert`（ローカル HTTPS 証明書の作成とホストOSへの信頼登録に使用）

- Docker Compose で起動する場合
  - Docker（`docker compose` が使えること）

- ホストで `pnpm dev:emu` / テストを実行する場合
  - Node.js `24.x`
  - pnpm `10.x`

### 1. リポジトリをクローンして移動する

```bash
git clone https://github.com/i1wawa/coffee-ai-mentor.git
cd coffee-ai-mentor
```

### 2. 依存関係をインストール（ホスト実行/テストする場合）

リポジトリ root で実行:

```bash
pnpm install
```

### 3. `.env.local` を作成する

リポジトリ root で実行:

```bash
cp apps/web/.env.example apps/web/.env.local
```

### 4. Firebase プロジェクトを作成して Web アプリ設定値を取得する

認証フローをローカル再現するには、Firebase の Web SDK 設定値が必要です（値自体は公開値ですが、Firebase プロジェクトの作成・取得は必要です）。

参考（公式）:

- Firebase Web アプリ追加（プロジェクト作成 / アプリ登録）: https://firebase.google.com/docs/web/setup
- Firebase Authentication（Web）: https://firebase.google.com/docs/auth/web/start

1. Firebase Console を開く
2. プロジェクトを作成（既存プロジェクトでも可）
3. `Authentication` を開いて有効化する
4. 認証方式に `Google` を追加
5. `プロジェクトの設定` を開く
6. `全般` タブで Web アプリを追加（`</>` アイコン）
7. 表示される Firebase 構成値を控える（API key / authDomain / projectId / appId）

`apps/web/.env.local` に最低限入れる値（`apps/web/.env.example` の対応キー）:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`

### 5. `.env.local` に Firebase 設定値を反映する

`apps/web/.env.local` をエディタで開き、以下のプレースホルダを Firebase Console の値に置き換えます。

- `your_firebase_api_key`
- `your_firebase_app_id`
- `your_firebase_auth_domain`
- `your_firebase_project_id`

補足:

- 未実装機能向けの env も起動時バリデーション対象のため、`apps/web/.env.example` のダミー値を残してください

### 6. ローカル HTTPS 証明書を用意する

Secure Cookie を使うため、ローカルでも HTTPS 前提です。

リポジトリ root で実行:

```bash
# ローカル CA をホストOSに信頼登録する
mkcert -install

# `certificates/` 配下に `localhost` / `127.0.0.1` 用の証明書を作る
mkdir -p certificates
mkcert -key-file certificates/dev-key.pem -cert-file certificates/dev-cert.pem localhost 127.0.0.1

# 証明書ファイルが作成されたことを確認する
ls -l certificates/dev-cert.pem certificates/dev-key.pem
```

## 開発サーバー起動

### 起動前の共通確認

- `3000` / `9099` ポートが空いていること
- ブラウザ側 Firebase SDK は `127.0.0.1:9099` に接続するため、ホストの `9099` ポートが空いている必要があります

確認コマンド:

```bash
lsof -iTCP:3000 -sTCP:LISTEN || true
lsof -iTCP:9099 -sTCP:LISTEN || true
```

起動後に利用する構成要素:

- Next.js 開発サーバ（HTTPS, `https://localhost:3000`）
- Firebase Auth Emulator（`127.0.0.1:9099`）

### パターンA: Docker Compose で起動

リポジトリ root から実行:

```bash

pnpm docker:build

# ビルド後に確認する場合
pnpm docker
```

### パターンB: ホストで起動（Firebase Auth Emulator 併用）

リポジトリ root から実行:

```bash
pnpm web dev:emu
```

## テスト

リポジトリ root から実行:

```bash
# ユニットテスト（Vitest）
pnpm web test:unit

# 統合テスト（Vitest + Firebase Auth Emulator）
pnpm web test:integration

# ユニットテスト + 統合テスト（Vitest + Firebase Auth Emulator）
pnpm web test

# E2E テスト（Playwright + Firebase Auth Emulator）
pnpm web test:e2e
```
