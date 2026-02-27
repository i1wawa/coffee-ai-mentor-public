// apps/web/src/app/(app)/app/layout.tsx
// ========================================================
// 概要:
// - /app 配下の共通レイアウト
// - 未認証ユーザーをアプリ領域に入れないための最前段ゲート
//
// 責務:
// - レイアウト描画前に認証状態を判定する
// - 未認証の場合は /sign-in へリダイレクトする
// - 認証済みの場合のみ children を描画する
// ========================================================

import { requireAuthenticatedOrRedirectToSignIn } from "@/app/_shared/auth/layout.guard.server";
import {
  toUiErrorFields,
  UI_ERROR_ACTION,
} from "@/frontend/shared/errors/error-ui-action.mapper";
import { UiErrorAlert } from "@/frontend/shared/errors/ui-error-alert";
import { AppHeader } from "@/frontend/widgets/header/ui/AppHeader";

// Next.jsのランタイムをNode.jsに指定
export const runtime = "nodejs";
// Next.jsのキャッシュ設定を動的にする
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 1) 認証ゲートを通す
  // 未認証なら redirect
  // 認証OKなら uid が取れる
  // 想定外エラーなら err
  const gate = await requireAuthenticatedOrRedirectToSignIn();

  // 2) 想定外エラーなら共通エラーUIを表示する
  if (!gate.ok) {
    const uiError = toUiErrorFields(gate.error);
    const action =
      uiError.uiErrorAction === UI_ERROR_ACTION.RETRY
        ? { label: "再読み込み", href: "" }
        : undefined;

    return (
      <main className="mx-auto w-full max-w-3xl p-6">
        <UiErrorAlert error={uiError} action={action} />
      </main>
    );
  }

  // 3) 認証OKなら表示する
  // - uid が必要なら result.value.uid をここで使える
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl p-4 md:p-6">{children}</main>
    </>
  );
}
