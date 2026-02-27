// apps/web/src/backend/shared/observability/nextjs-control-flow.ts
// ================================================================
// 概要:
// - Next.js の制御フロー例外（redirect/notFound 等）を識別する
// - request.summary の status 推定に使うための補助関数を提供する
//
// 責務:
// - wrapper が catch しても再スローすべき例外を判定する
// - cause チェーンから制御フロー例外を探索する
// - 観測用に HTTP ステータスを推定する（レスポンス生成には使わない）
//
// 契約:
// - Next.js の挙動を置き換えない（判定のみ）
// - 制御フロー例外を握りつぶさない（検知したら呼び出し側で再スロー）
// ================================================================

type NextJsDigestError = { digest: string };

/** unknown を { digest: string } として扱えるかのガード */
function hasDigest(e: unknown): e is NextJsDigestError {
  return (
    typeof e === "object" &&
    e !== null &&
    "digest" in e &&
    typeof (e as { digest?: unknown }).digest === "string"
  );
}

/**
 * Next.js が内部で throw して制御している例外か判定する
 * - 再スロー対象をここに集約し、抜け漏れを防ぐ
 */
function isNextJsControlFlowError(e: unknown): boolean {
  // 1) digest で判定できる系（最優先）
  if (hasDigest(e)) {
    const digest = e.digest;

    // redirect()/permanentRedirect()
    if (digest.startsWith("NEXT_REDIRECT")) return true;

    // notFound()/forbidden()/unauthorized() など（HTTP access fallback）
    if (digest.startsWith("NEXT_HTTP_ERROR_FALLBACK")) return true;

    // notFound() の一部ケース（保険）
    if (digest === "NEXT_NOT_FOUND") return true;

    // 静的生成中に動的APIが使われた時の制御例外（DynamicServerError）
    if (digest === "DYNAMIC_SERVER_USAGE") return true;
  }

  return false;
}

/**
 * Next.js制御フロー例外の有無を cause から探索する
 * - 数段だけ辿って検知する（無限ループ防止の上限つき）
 */
export function findNextJsControlFlowError(e: unknown): unknown | undefined {
  // 1) 現在の例外から探索を開始
  let currentErrorCandidate: unknown = e;

  // 2) 深追いしすぎると無限ループや重くなるので、上限を設ける
  //    - 実務上は 2〜5 程度で十分（深い cause チェーンは稀）
  for (let depth = 0; depth < 5; depth += 1) {
    // 3) この段で制御フロー例外なら、それを返す
    if (isNextJsControlFlowError(currentErrorCandidate))
      return currentErrorCandidate;

    // 4) Error の cause を辿る（無いなら終了）
    if (currentErrorCandidate instanceof Error) {
      const cause = (currentErrorCandidate as Error & { cause?: unknown })
        .cause;
      if (!cause) break;

      currentErrorCandidate = cause;
      continue;
    }

    // 5) Error でなければ cause は辿れないので終了
    break;
  }

  return undefined;
}

/**
 * Next.js制御フロー例外から ログ用のステータス を推定する
 * - request.summary の観測精度を上げる（レスポンス生成には使わない）
 */
export function guessHttpStatusCodeFromNextJsControlFlowError(
  e: unknown,
): number {
  // 1) notFound() の一部ケース（message直判定）
  if (e instanceof Error && e.message === "NEXT_NOT_FOUND") return 404;

  // 2) digestベースで推定
  if (!hasDigest(e)) return 500;

  const digest = e.digest;

  // 3) HTTP fallback（401/403/404 など）
  if (digest.startsWith("NEXT_HTTP_ERROR_FALLBACK")) {
    // 3-1) セミコロン区切りを想定して、末尾から数値を拾う
    const digestSegments = digest.split(";");

    // 3-2) 末尾から「4xx」を探す（見つからなければ 500）
    for (let i = digestSegments.length - 1; i >= 0; i -= 1) {
      const n = Number(digestSegments[i]);
      if (Number.isFinite(n) && n >= 400 && n < 500) return n;
    }

    return 500;
  }

  // 4) redirect（307/308 など）
  if (digest.startsWith("NEXT_REDIRECT")) {
    // digest から 3xx を拾える場合は拾う（観測の質UP）
    const digestSegments = digest.split(";");

    // 4-1) 末尾から「3xx」を探す（見つからなければ 307）
    for (let i = digestSegments.length - 1; i >= 0; i -= 1) {
      const n = Number(digestSegments[i]);
      if (Number.isFinite(n) && n >= 300 && n < 400) return n;
    }

    return 307;
  }

  // 5) DYNAMIC_SERVER_USAGE（制御だが、結果的にはエラー扱い）
  if (digest === "DYNAMIC_SERVER_USAGE") return 500;

  return 500;
}
