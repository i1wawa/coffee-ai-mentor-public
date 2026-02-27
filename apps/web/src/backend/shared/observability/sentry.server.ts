// apps/web/src/backend/shared/observability/sentry.server.ts
// ================================================================
// 概要:
// - Next.js サーバ側の Sentry 連携
//
// 責務:
// - Sentry scope に requestId / trace / route などを付与する
//
// 契約:
// - 送信判定は errorCode ベース（INTERNAL_ERROR / 不明のみ送信）
// - Cloud Logging と相互に辿れるよう、trace と requestId の両方を付ける
//   - Cloud Logging: logging.googleapis.com/trace
//   - アプリ側: requestId（uuid）
// - userHash は匿名化済み（HMAC）前提の文字列のみ受け取る
// ================================================================

import "server-only";

import {
  type HttpMethod,
  normalizeUnknownToError,
} from "@packages/observability/src/logging/request-summary";
import {
  buildCloudLoggingTraceValue,
  type CloudLoggingTraceContext,
  type CoreTelemetryContext,
} from "@packages/observability/src/logging/telemetry-common";
import {
  type ErrorCode,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import * as Sentry from "@sentry/nextjs";

type RequestSentryContext = {
  // env/service/release/requestId
  core: CoreTelemetryContext;
  // projectId/traceId（Cloud Logging の trace 組み立て用）
  trace: CloudLoggingTraceContext;
  // docs で固定化するルートパターン（例: "/api/users/me"）
  routePattern: string;
  // HTTPメソッド（Server Action は擬似的に POST 扱いなど）
  httpMethod: HttpMethod;
  // 匿名ユーザー相関（PIIではない / 復元不能）
  userHash: string;
};

/**
 * 調査用の Sentry scope に request 単位の文脈を適用する。
 */
function applyRequestScope(scope: Sentry.Scope, ctx: RequestSentryContext) {
  // 1) 低カーディナリティ tags
  // - environment / release は Sentry.init() 側で設定する
  scope.setTag("service", ctx.core.service);
  scope.setTag("route_pattern", ctx.routePattern);
  scope.setTag("http_method", ctx.httpMethod);

  // 2) 高カーディナリティ user/contexts
  // - userHash は匿名化済み前提で扱う
  scope.setUser({ id: ctx.userHash });
  // - request_id は Cloud Logging 側で確実に出るため、検索はログ側の request_id で行う
  scope.setContext("app_request", { request_id: ctx.core.requestId });
  // Cloud Logging の trace と Sentry event を相互に辿れるように contexts に入れる
  scope.setContext("gcp", {
    cloud_logging_trace: buildCloudLoggingTraceValue(ctx.trace),
  });
}

/**
 * 現在の request scope の userHash を更新する。
 * - /api/users/me のように、処理途中で uid を検証してから userHash を確定させるケース向け
 */
export function setSentryUserHash(userHash: string): void {
  // runWithRequestSentryScope() の内側で呼ぶ前提
  // - 現在の scope に対して user を上書きする
  Sentry.setUser({ id: userHash });
}

/**
 * 例外を Sentry に送るかどうか（想定内/想定外の分離）
 * - errorCode が INTERNAL_ERROR（または undefined ）を「想定外」とみなし送信する
 * - それ以外の errorCode は「想定内」とみなし原則送信しない
 */
function shouldCaptureExceptionToSentry(args: {
  errorCode?: ErrorCode | undefined;
}): boolean {
  return (
    args.errorCode === undefined || args.errorCode === errorCode.INTERNAL_ERROR
  );
}

/**
 * request 単位の scope を作り、その中で処理を実行する。
 */
export async function runWithRequestSentryScope<T>(
  ctx: RequestSentryContext,
  fn: () => Promise<T>,
): Promise<T> {
  // Sentry.withScope は “一時的な scope” を作り、コールバックの間だけ有効にする
  // - リクエスト間でタグが漏れる事故を防ぐ
  return await Sentry.withScope(async (scope) => {
    applyRequestScope(scope, ctx);
    return await fn();
  });
}

/**
 * request 単位の例外を Sentry に送信する（必要なら）。
 *
 * 注意:
 * - この関数は「現在の scope」に追加情報を付与して captureException する。
 * - 呼び出し側は runWithRequestSentryScope() の中で呼ぶこと。
 */
export function captureExceptionForRequest(args: {
  error: unknown;
  httpStatusCode: number;
  errorId?: string | undefined;
  errorCode?: ErrorCode | undefined;
}): string | undefined {
  // 1) errorCode が INTERNAL_ERROR なら送信
  if (!shouldCaptureExceptionToSentry({ errorCode: args.errorCode }))
    return undefined;

  // 2) unknown を Error に正規化して、stack/message を扱いやすくする
  const error = normalizeUnknownToError(args.error);

  // 3) errorId / errorCode は “Sentry event の検索キー” なので、
  // タグにも載せつつ、Error オブジェクト側にも持たせる（将来の加工余地）
  if (args.errorId) {
    (error as Error & { errorId?: string }).errorId = args.errorId;
  }
  if (args.errorCode) {
    (error as Error & { errorCode?: ErrorCode }).errorCode = args.errorCode;
  }

  // 4) このイベントにだけ付与したい情報は CaptureContext で渡す（公式推奨）
  // - tags は低カーディナリティに限定する
  // - 高カーディナリティは contexts/extra に回す
  const event_id = Sentry.captureException(error, {
    // 4-1) 低カーディナリティ tags
    tags: {
      http_status_code: String(args.httpStatusCode),
      ...(args.errorCode ? { error_code: args.errorCode } : {}),
    },
    // 4-2) 高カーディナリティ contexts/extra
    contexts: args.errorId ? { app_error: { error_id: args.errorId } } : {},
  });

  // 5) ログ側と相互に辿るため、event_id を呼び出し元に返す
  return event_id;
}
