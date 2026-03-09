// apps/web/src/csp-header.ts
// ========================================================
// 概要:
// - Content Security Policy ヘッダー値を組み立てる
//
// 責務:
// - NODE_ENV に応じて development だけ unsafe-eval を許可する
// - HTTP ヘッダーとして扱える1行文字列へ正規化する
// - report-uri / report-to を必要時に付与する
// - CSP3系のディレクティブを含むが、未対応ブラウザではCSP2相当でフォールバックする
//   https://www.w3.org/TR/CSP3/
// ========================================================

/**
 * CSP ヘッダー値生成関数に渡す入力。
 */
type CreateContentSecurityPolicyHeaderValueArgs = {
  nonce: string;
  nodeEnv?: string;
  profile?: "default" | "firebasePopupAuth";
  firebaseAuthDomain?: string;
  sentryDsn?: string;
  useFirebaseAuthEmulator?: string;
  reportUri?: string;
  reportToGroup?: string;
};

/**
 * 任意入力を trim 済み文字列へ正規化する。
 * - 文字列以外の入力は空文字に変換する
 */
function normalizeOptionalString(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.trim();
}

/**
 * Firebase Auth Domain を CSP source に正規化する
 * - https:// 付きURLなら origin を使う
 * - host 形式なら https を補って origin を作る
 */
function toOriginFromAuthDomain(input: unknown): string | null {
  // 1) 入力を正規化して、空文字なら null を返す
  const normalized = normalizeOptionalString(input);
  if (!normalized) return null;

  try {
    // 2) https/http 付きURLなら origin を返す
    if (normalized.startsWith("https://") || normalized.startsWith("http://")) {
      return new URL(normalized).origin;
    }
    // 3) host 形式なら https を補って origin を返す
    return new URL(`https://${normalized}`).origin;
  } catch {
    // URL として不正な値なら null を返す
    return null;
  }
}

/**
 * Sentry DSN から CSP source 用の origin を取り出す
 * - DSN に含まれる資格情報は origin に含まれない
 */
function toOriginFromSentryDsn(input: unknown): string | null {
  // 1) 入力を正規化して、空文字なら null を返す
  const normalized = normalizeOptionalString(input);
  if (!normalized) return null;

  try {
    // 2) URL として有効な場合は origin を返す
    return new URL(normalized).origin;
  } catch {
    // URL として不正な値なら null を返す
    return null;
  }
}

/**
 * report-uri 用の URL を正規化する
 * - 同一オリジン前提の相対パス（/...）を許可する
 * - http/https の絶対 URL を許可する
 * - スキーム相対URL（//...）は許可しない
 */
function toReportUri(input: unknown): string | null {
  // 1) 入力を正規化して、空文字なら null を返す
  const normalized = normalizeOptionalString(input);
  if (!normalized) return null;

  // 2) 同一オリジン前提の相対パス（/...）を許可する
  if (normalized.startsWith("/") && !normalized.startsWith("//")) {
    return normalized;
  }

  try {
    // 3) http/https の絶対 URL なら正規化して返す
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      // http/https 以外の URL スキームは許可しない
      return null;
    }
    return parsed.toString();
  } catch {
    // URL として不正な値なら null を返す
    return null;
  }
}

/**
 * 配列に存在しない場合のみ値を追加するユーティリティ
 */
function pushIfNotExists(values: string[], source: string | null): void {
  if (!source) return;
  if (values.includes(source)) return;
  values.push(source);
}

/**
 * CSP ヘッダー値を生成する。
 */
export function createContentSecurityPolicyHeaderValue(
  args: CreateContentSecurityPolicyHeaderValueArgs,
): string {
  // 1) 実行環境フラグを正規化する
  const nodeEnv = args.nodeEnv;
  const profile = args.profile ?? "default";
  const isFirebasePopupAuthProfile = profile === "firebasePopupAuth";
  const nonce = normalizeOptionalString(args.nonce);
  if (!nonce) {
    throw new Error("CSP nonce is required");
  }
  const isDevelopment = nodeEnv === "development";
  const isFirebaseAuthEmulatorEnabled = args.useFirebaseAuthEmulator === "1";
  const firebaseAuthOrigin = toOriginFromAuthDomain(args.firebaseAuthDomain);
  const sentryOrigin = toOriginFromSentryDsn(args.sentryDsn);
  const reportUri = toReportUri(args.reportUri);
  const reportToGroup = normalizeOptionalString(args.reportToGroup);

  // 2) script-src を構築する
  // - 既定では self + nonce のみに絞り、認証専用 origin は popup 用プロファイルに限定する
  const scriptSrcSources = ["'self'", `'nonce-${nonce}'`];
  if (isFirebasePopupAuthProfile) {
    // 2-1) Firebase Auth（Google Popup）で利用されるスクリプト配信元を許可する
    scriptSrcSources.push(
      "https://accounts.google.com",
      "https://apis.google.com",
      "https://www.gstatic.com",
    );
  }
  if (isDevelopment) {
    // development は React/Next のデバッグ要件で unsafe-eval を許可する
    scriptSrcSources.push("'unsafe-eval'");
  }

  // 2-2) style-src を構築する
  // - development は Dev Overlay/HMR の互換のため unsafe-inline を許可する（公式推奨）
  const styleSrcSources = ["'self'"];
  if (isDevelopment) {
    styleSrcSources.push("'unsafe-inline'");
  } else {
    styleSrcSources.push(`'nonce-${nonce}'`);
  }

  // 3) connect-src を構築する
  // - 既定では self と Sentry だけを許可し、認証専用通信先は popup 用プロファイルに限定する
  const connectSrcSources = ["'self'"];
  if (isFirebasePopupAuthProfile) {
    // 3-1) Firebase Auth / Google OAuth のブラウザ通信先を許可する
    connectSrcSources.push(
      "https://identitytoolkit.googleapis.com",
      "https://securetoken.googleapis.com",
      "https://www.googleapis.com",
    );
    if (isFirebaseAuthEmulatorEnabled) {
      // 3-2) ローカル開発の Auth Emulator（公式推奨の既定ポート）を許可する
      pushIfNotExists(connectSrcSources, "http://127.0.0.1:9099");
    }
  }
  pushIfNotExists(connectSrcSources, sentryOrigin);

  // 4) frame-src を構築する
  // - 既定では self のみに絞り、OAuth Popup / Auth iframe は popup 用プロファイルに限定する
  const frameSrcSources = ["'self'"];
  if (isFirebasePopupAuthProfile) {
    // 4-1) OAuth Popup / Auth iframe で利用される配信元を許可する
    frameSrcSources.push("https://accounts.google.com");
    if (isFirebaseAuthEmulatorEnabled) {
      // 4-2) ローカル開発の Auth Emulator iframe relay を許可する
      pushIfNotExists(frameSrcSources, "http://127.0.0.1:9099");
    }
    pushIfNotExists(frameSrcSources, firebaseAuthOrigin);
  }

  // 5) ディレクティブを構築する
  const cspDirectives = [
    // 5-1) default-src:
    // - 他の個別ディレクティブが未指定のときに適用される既定の許可元
    // - self のみに絞ることで、意図しない外部読み込みを防ぐ
    "default-src 'self';",
    // 5-2) script-src:
    // - JavaScript の読み込み元・実行条件を制御する
    // - 認証専用 origin は firebasePopupAuth プロファイルだけで許可する
    `script-src ${scriptSrcSources.join(" ")};`,
    // 5-3) style-src:
    // - CSS の読み込み元・インライン style の可否を制御する
    // - development は Dev Overlay/HMR 互換のため unsafe-inline を許可する（公式推奨）
    // - production 系は nonce を持つ style のみ許可する
    `style-src ${styleSrcSources.join(" ")};`,
    // 5-4) connect-src:
    // - fetch / XHR / WebSocket などの接続先を制御する
    // - 既定では self / Sentry に絞り、Firebase Auth の通信先は popup 用プロファイルだけで許可する
    `connect-src ${connectSrcSources.join(" ")};`,
    // 5-5) img-src:
    // - 画像の読み込み元を制御する
    // - data/blob を許可して、生成画像や一時URLを使うケースに対応する
    "img-src 'self' blob: data:;",
    // 5-6) font-src:
    // - Webフォントの読み込み元を制御する
    "font-src 'self';",
    // 5-7) frame-src:
    // - iframe / popup で参照される配信元を制御する
    // - Firebase Auth / Google OAuth の画面表示は popup 用プロファイルだけで許可する
    `frame-src ${frameSrcSources.join(" ")};`,
    // 5-8) object-src:
    // - <object>/<embed>/<applet> の読み込みを禁止する
    // - 旧来のプラグイン経由の攻撃面を減らす
    "object-src 'none';",
    // 5-9) base-uri:
    // - <base> タグによる相対URLの基準書き換えを制限する
    // - self のみ許可して、リンク先改ざんの余地を減らす
    "base-uri 'self';",
    // 5-10) form-action:
    // - form 送信先を制御する
    // - self のみにして外部サイトへの送信を防ぐ
    "form-action 'self';",
    // 5-13) frame-ancestors:
    // - 自サイトが他サイトの frame/iframe 内で表示されることを制御する
    // - none でクリックジャッキング対策を強化する
    "frame-ancestors 'none';",
  ];

  // 6) 通常ページの production 系では Trusted Types を有効化する
  // - 開発時は Turbopack/HMR の script URL 代入と衝突するため除外する
  // - Firebase popup を起動するページは SDK 互換のため強制しない
  if (!isDevelopment && profile === "default") {
    cspDirectives.push("require-trusted-types-for 'script';");
    cspDirectives.push("trusted-types nextjs goog#html;");
  }

  // 7) report-uri / report-to は有効値があるときだけ追加する
  if (reportUri) {
    cspDirectives.push(`report-uri ${reportUri};`);
  }
  if (reportToGroup) {
    cspDirectives.push(`report-to ${reportToGroup};`);
  }

  // 8) development 以外では http->https 自動昇格を有効化する
  // - 開発時は Auth Emulator（http://127.0.0.1:9099）を使うため除外する
  if (!isDevelopment) {
    cspDirectives.push("upgrade-insecure-requests;");
  }

  // 9) ヘッダー値として安全に扱えるよう1行へ正規化する
  return (
    cspDirectives
      .join(" ")
      // 複数スペースを単一スペースに置換して、余分な空白を削除する
      .replace(/\s{2,}/g, " ")
      .trim()
  );
}
