// apps/web/src/app/(marketing)/layout.tsx
// ========================================================
// 概要:
// - マーケティング領域（/）の共通レイアウト
//
// 責務:
// - 認証状態を判定し、認証済みなら /app へリダイレクトする
// - 未認証の場合のみ children を描画する
// ========================================================

import { redirectToAppIfAuthenticated } from "@/app/_shared/auth/layout.guard.server";
import {
  toUiErrorFields,
  UI_ERROR_ACTION,
} from "@/frontend/shared/errors/error-ui-action.mapper";
import { UiErrorAlert } from "@/frontend/shared/errors/ui-error-alert";
import { MarketingHeader } from "@/frontend/widgets/header/ui/MarketingHeader";

// Next.jsのランタイムをNode.jsに指定
export const runtime = "nodejs";
// Next.jsのキャッシュ設定を動的にする
export const dynamic = "force-dynamic";

export default async function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 1) 認証ゲートを通す
  // 認証済みなら redirect されて戻らない
  // 未認証なら ok で抜ける
  // 想定外エラーなら err で返る
  const gate = await redirectToAppIfAuthenticated();

  // 2) 想定外エラーなら共通エラーUIを表示する
  if (!gate.ok) {
    const uiError = toUiErrorFields(gate.error);
    const action =
      uiError.uiErrorAction === UI_ERROR_ACTION.RETRY
        ? { label: "再読み込み", href: "" }
        : undefined;

    return (
      <>
        <MarketingHeader />
        <main className="flex flex-1 flex-col gap-4 p-4">
          {/* 3) 通知は出すが、認証UIは必ず表示する */}
          <div className="w-full max-w-xl mx-auto">
            <UiErrorAlert error={uiError} action={action} />
          </div>

          {/* 4) 認証UIは必ず表示する */}
          {children}
        </main>
      </>
    );
  }

  // 3) 未認証なら表示する
  return (
    <>
      <MarketingHeader />
      <main className="flex flex-1 flex-col">{children}</main>
    </>
  );
}
