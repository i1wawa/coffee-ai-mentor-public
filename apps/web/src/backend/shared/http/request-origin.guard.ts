// apps/web/src/backend/shared/http/request-origin.guard.ts
// ================================================================
// 概要:
// - unsafe method（POST/PUT/PATCH/DELETE）のクロスサイト書き込みを拒否するHTTP境界ガード
//
// 責務:
// - Sec-Fetch-Site を優先して判定する
// - same-origin は許可、cross-site は拒否、その他は Origin/Referer で判定する
// - 拒否時に 403 + ACCESS_DENIED を返すための情報を作る
//
// 契約:
// - 入力: Request
// - 出力: null（許可）/ OriginGuardFailure（拒否: errorCode=ACCESS_DENIED, 403）
// - X-Forwarded-Host がある場合は Host より優先して照合する
// ================================================================

import {
  buildErrorFields,
  type ErrorFields,
  errorCode,
} from "@packages/observability/src/logging/telemetry-error-common";
import { mapErrorCodeToHttpStatusCode } from "@packages/observability/src/logging/telemetry-error-http-mapping";

type OriginGuardFailure = {
  httpStatus: number;
  errorFields: ErrorFields;
};

type SecFetchSiteClassificationResult =
  | { kind: "allow" }
  | { kind: "fallback" }
  | { kind: "deny"; failure: OriginGuardFailure };

/**
 * ガード失敗時の共通オブジェクト
 * - HTTPステータス403 + errorCode=ACCESS_DENIED
 */
function buildAccessDeniedFailure(): OriginGuardFailure {
  return {
    httpStatus: mapErrorCodeToHttpStatusCode(errorCode.ACCESS_DENIED),
    errorFields: buildErrorFields(errorCode.ACCESS_DENIED),
  };
}

/**
 * Fetch Metadata（Sec-Fetch-Site）によるクロスサイト判定。
 * - モダンブラウザが付けるヘッダを利用する。
 * - CSRFトークン方式より実装と運用が軽い（クライアント改修も不要）
 */
function classifySecFetchSite(req: Request): SecFetchSiteClassificationResult {
  // 1) Sec-Fetch-Site を読む（仕様上小文字/大文字の揺れがあるので小文字化）
  const site = (req.headers.get("sec-fetch-site") ?? "").toLowerCase().trim();

  // 2) ヘッダが無い場合は legacy の可能性があるため、ここでは不合格にせずフォールバックへ回す。
  if (!site) return { kind: "fallback" };

  // 3) same-origin は即許可
  // - ブラウザ前提運用では、この時点で同一オリジン判定が取れているため
  // - Origin/Referer が欠落するケースでの過剰拒否を避ける
  if (site === "same-origin") {
    return { kind: "allow" };
  }

  // 4) cross-site は拒否
  // - Cookie自動送信 + 書き込み につながるため
  if (site === "cross-site") {
    return { kind: "deny", failure: buildAccessDeniedFailure() };
  }

  // 5) same-site / none / unknown は判断を決め打ちせずフォールバックへ
  return { kind: "fallback" };
}

/**
 * Origin/Referer のホスト一致検証（フォールバック）。
 * - Fetch Metadata が無い/落ちるケースを補う（legacy対策）
 *
 * 判定基準:
 * - Origin があるなら Origin.host が X-Forwarded-Host（または Host）と一致すること
 * - Origin が無い場合、Referer.host が一致すること
 *
 * 注意:
 * - Cloud Run / リバースプロキシ環境では Host と X-Forwarded-Host が変わり得るため、
 *   まず X-Forwarded-Host を優先し、無ければ Host を使う。
 */
function validateOriginOrRefererHost(req: Request): OriginGuardFailure | null {
  // 1) 期待ホスト（= 自分）を決める
  // - X-Forwarded-Host: 代理の手前ホストを運んでくる（プロキシ配下で重要）
  // - Host: 最終到達先ホスト
  const expectedHost = (
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    ""
  ).trim();

  // 2) 期待ホストが取れないのは通常あり得ないが、取れない場合は比較ができないので安全側に倒して拒否する。
  if (!expectedHost) {
    return buildAccessDeniedFailure();
  }

  // 3) Origin があるなら最優先で検証する
  // - Origin は “送信元オリジン” を直接表すため、Referer より信頼しやすい。
  const origin = (req.headers.get("origin") ?? "").trim();
  if (origin) {
    // "null" Origin は unsafe method では拒否する
    if (origin === "null") return buildAccessDeniedFailure();
    try {
      // 3-1) 調べやすいようURLオブジェクト化する
      const u = new URL(origin);
      // 3-2) host（host:port）単位で一致を確認
      if (u.host === expectedHost) return null;
      // 3-3) 不一致は “クロスサイト/誤設定” の可能性があるので拒否
      return buildAccessDeniedFailure();
    } catch {
      // 3-4) Origin が壊れている場合も拒否（安全側）
      return buildAccessDeniedFailure();
    }
  }

  // 4) Origin が無い場合は Referer を検証する
  // - Referer は “参照元URL” なので情報量は多いが、無いケースもある。
  const referer = (req.headers.get("referer") ?? "").trim();
  if (referer) {
    try {
      const u = new URL(referer);
      if (u.host === expectedHost) return null;
      return buildAccessDeniedFailure();
    } catch {
      return buildAccessDeniedFailure();
    }
  }

  // 3) 両方無いのは legacy でも稀。安全側で拒否。
  // - ブラウザ/ネットワーク/拡張機能/プライバシー設定などで落ちうるが
  // - “書き込み系” では安全側に倒して拒否する方が事故が少ない
  return buildAccessDeniedFailure();
}

/**
 * unsafe method を “CSRFトークン無し” で守るためのガード。
 *
 * 使い方:
 * - Route Handler 側で、unsafe method のときだけ呼ぶ
 * - 失敗したら 403 を返す（errorCode は ACCESS_DENIED）
 */
export function guardUnsafeMethodByFetchMetadataAndOrigin(
  req: Request,
): OriginGuardFailure | null {
  // 1) Fetch Metadata（あれば強力）を判定する
  // - cross-site: 拒否
  // - same-origin: 許可
  // - それ以外: フォールバックへ
  const secFetchSiteValidation = classifySecFetchSite(req);
  if (secFetchSiteValidation.kind === "deny") {
    return secFetchSiteValidation.failure;
  }
  if (secFetchSiteValidation.kind === "allow") return null;

  // 2) フォールバック（Origin/Referer）
  // - Sec-Fetch-Site が無いケースを補う（legacy対策）
  // - same-site / none / unknown のように判断が曖昧な値もここで検証する
  return validateOriginOrRefererHost(req);
}
