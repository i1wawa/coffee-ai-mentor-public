# apps/web/Dockerfile
# ========================================================
# 概要:
# - apps/web（Next.js）をモノレポ（pnpm workspace）でビルド/実行する Dockerfile
# - 本番は Cloud Run（PORT=8080 / non-root / standalone）を想定
#
# 責務:
# - workspace install（apps/web に必要な依存だけ）をキャッシュ効率よく行う
# - Prisma Client を生成し、Next.js を standalone 出力でビルドする
# - 本番 Runner と 開発（hot reload）環境を同一ファイルで提供する
#
# 前提:
# - pnpm は Corepack で有効化されている（corepack enable）
# - Prisma の generate がビルド前に必要（schema/設定は apps/web 側にある）
# - Cloud Run は PORT 環境変数に従って待ち受ける（ここでは 8080 をデフォルトに設定）
# - 秘密値は ARG/ENV に直書きせず、Secret Manager から実行時注入する（ログ/イメージに残さない）
# - Prod は non-root ユーザーで実行する
# ========================================================

# syntax=docker/dockerfile:1

############################
# Base
############################

FROM node:24-bookworm-slim AS base
WORKDIR /workspace

# pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Next.js telemetry off (任意)
ENV NEXT_TELEMETRY_DISABLED=1

############################
# Dependencies (workspace install)
############################

FROM base AS dependencies

# ルートのworkspace定義&lock
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
# webの依存解決に必要（モノレポなのでwebのpackage.jsonも先にコピー）
COPY apps/web/package.json apps/web/package.json

# webだけに絞ってインストール（BuildKitが有効な環境ではキャッシュが効いて速くなるように）
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter ./apps/web...

############################
# Builder (Next build)
############################

FROM base AS builder

# ----------------------------
# Client Variables
# - クライアントに公開される環境変数
# - 本番環境ではGitHubの環境変数で入れる想定
# ----------------------------

ARG NEXT_PUBLIC_APP_ENV
ARG NEXT_PUBLIC_CONTACT_FORM_URL

# --- Firebase Authentication ---
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID

# --- Sentry ---
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT
ARG NEXT_PUBLIC_SENTRY_RELEASE

# ----------------------------
# Server Variables
# - クライアントに公開されない環境変数（バックエンドでだけ利用）
# - 本番環境ではGitHubの環境変数で入れる想定
# ----------------------------

# - Next.js build 中に env.server.ts の base env が評価されるため、ここでも受け取れるようにする
ARG APP_ENV
ARG SERVICE_NAME
ARG GCP_PROJECT_ID
ARG SENTRY_DSN
ARG SENTRY_ENVIRONMENT
ARG SENTRY_RELEASE

# 依存をコピー
COPY --from=dependencies /workspace/node_modules ./node_modules
COPY --from=dependencies /workspace/apps/web/node_modules ./apps/web/node_modules
COPY --from=dependencies /workspace/package.json ./package.json
COPY --from=dependencies /workspace/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=dependencies /workspace/pnpm-workspace.yaml ./pnpm-workspace.yaml
# ソースをコピー（build contextはroot想定）
COPY . .

# Prisma Clientを生成
WORKDIR /workspace/apps/web
RUN pnpm prisma generate

# Next.js build（Docker BuildKitのビルドキャッシュを永続化、standalone出力を想定）
RUN --mount=type=cache,target=/workspace/apps/web/.next/cache \
    pnpm build

############################
# Runner Prod (Cloud Run)
############################

# Cloud Run での実行を想定した最小イメージ
FROM gcr.io/distroless/nodejs24-debian13:nonroot AS runner
WORKDIR /workspace

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=8080
# Next.js の利用状況を公式へ送信するのを無効化
ENV NEXT_TELEMETRY_DISABLED=1

# ----------------------------
# Server Variables
# - クライアントに公開されない環境変数（バックエンドでだけ利用）
# - 本番環境ではGitHubの環境変数で入れる想定
# ----------------------------

ARG APP_ENV
ENV APP_ENV=$APP_ENV

ARG GCP_PROJECT_ID
ENV GCP_PROJECT_ID=$GCP_PROJECT_ID

ARG SERVICE_NAME
ENV SERVICE_NAME=$SERVICE_NAME

# --- Sentry ---
# 公開側と同じ値を使ってよい
ARG SENTRY_DSN
ENV SENTRY_DSN=$SENTRY_DSN

ARG SENTRY_ENVIRONMENT
ENV SENTRY_ENVIRONMENT=$SENTRY_ENVIRONMENT

ARG SENTRY_RELEASE
ENV SENTRY_RELEASE=$SENTRY_RELEASE

# Next.js standalone成果物
# - monorepo の standalone は apps/web/server.js を起点に public / .next/static を参照する
COPY --from=builder --chown=65532:65532 /workspace/apps/web/public ./apps/web/public
COPY --from=builder --chown=65532:65532 /workspace/apps/web/.next/standalone ./
COPY --from=builder --chown=65532:65532 /workspace/apps/web/.next/static ./apps/web/.next/static

EXPOSE 8080

# standaloneのserver.jsを起動（distroless nodejs の entrypoint が Node を提供する）
CMD ["apps/web/server.js"]

############################
# Runner Dev (hot reload)
############################

FROM base AS dev
WORKDIR /workspace

# ルートのworkspace定義&lock
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
# /apps/webの依存解決に必要（モノレポなので/apps/webのpackage.jsonも先にコピー）
COPY apps/web/package.json apps/web/package.json

# /apps/web関連だけに絞ってインストール（BuildKitが有効な環境ではキャッシュが効いて速くなるように）
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter ./apps/web...

# ソースをコピー（build contextはroot想定）
COPY . .

WORKDIR /workspace/apps/web

ENV NODE_ENV=development
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
# Next.js の利用状況を公式へ送信するのを無効化
ENV NEXT_TELEMETRY_DISABLED=1

CMD ["pnpm","dev","--hostname","0.0.0.0","--port","3000"]
