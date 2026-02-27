// apps/web/src/frontend/screens/app/settings/account/ui/AccountSettings.view.tsx
// ================================================================
// 概要:
// - アカウント設定画面（Danger Zone を含む）
//
// 責務:
// - 自分の情報（uid）を表示する
// - 退会（アカウント削除）ダイアログを開く
//
// 非目的:
// - 退会フローの実装（features 側の責務）
// ================================================================

"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { createOAuthProvider } from "@/frontend/features/auth/config/oauth-providers.config";
import { RevokeSessionDialog } from "@/frontend/features/auth/ui/RevokeSessionDialog";
import { useUserMe } from "@/frontend/features/users/model/use-user-me.hook";
import { AccountDeleteDialog } from "@/frontend/features/users/ui/AccountDeleteDialog";
import { UiErrorAlert } from "@/frontend/shared/errors/ui-error-alert";
import { Button } from "@/frontend/shared/ui/shadcn/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/frontend/shared/ui/shadcn/components/ui/card";
import { Separator } from "@/frontend/shared/ui/shadcn/components/ui/separator";

/**
 * uid を画面表示向けに整形する
 *
 * 方針:
 * 1. 入力の前後空白を除去する
 * 2. 先頭1文字をアバター用の initial にする
 * 3. 長い uid は 先頭8文字 + 末尾4文字 に短縮する
 */
function formatUidForDisplay(uid: string): { short: string; initial: string } {
  // 1) まず外部入力を正規化する
  const trimmed = uid.trim();
  // 2) アバター表示のため先頭1文字を作る
  const initial = trimmed.slice(0, 1).toUpperCase() || "?";

  // 3) 短い uid はそのまま表示する
  if (trimmed.length <= 14) {
    return { short: trimmed, initial };
  }

  // 4) 長い uid は可読性のため短縮表示にする
  const head = trimmed.slice(0, 8);
  const tail = trimmed.slice(-4);
  return { short: `${head}…${tail}`, initial };
}

export function AccountSettingsView() {
  const router = useRouter();

  // 1) 自分の情報を取得する
  // - userMe: サインイン中なら uid を持つ
  // - isLoading: 取得中の状態
  // - error: 通信失敗などの状態
  const { userMe, isLoading, error } = useUserMe();

  // 2) 再認証プロバイダを作る
  // TODO 将来的に、userMe の provider 情報をもとに動的に切り替える
  const reauthProvider = createOAuthProvider("google");

  // 3) ダイアログ開閉状態をローカルで管理する
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [revokeDialogOpen, setRevokeDialogOpen] = React.useState(false);

  // 4) 画面表示向けの派生値を作る
  // - userMe が無い場合は空文字に寄せる
  const uid = userMe?.uid ?? "";
  // - uid があるときだけ表示モデルへ変換する
  const uidDisplay = uid ? formatUidForDisplay(uid) : null;

  // 5) 認証ガード配下で userMe が null なら、セッション不整合として sign-in に寄せる
  React.useEffect(() => {
    // 1) ローディング中は判定しない
    if (isLoading) return;
    // 2) 取得エラーはこの画面でエラー表示に委ねる
    if (error) return;
    // 3) userMe があるなら遷移不要
    if (userMe) return;
    // 4) 想定外の null は履歴を汚さない replace で戻す（公式推奨）
    router.replace("/sign-in");
  }, [error, isLoading, router, userMe]);

  return (
    <div
      data-testid="account-settings-page"
      className="w-full max-w-7xl px-4 py-4 md:py-10 gap-6 flex flex-col"
    >
      {/* 画面ヘッダ: 戻る導線とページタイトル */}
      {/* 上部：最小の導線だけ */}
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" className="-ml-3">
          <Link href="/app" aria-label="トップに戻る">
            <ArrowLeft className="mr-2 size-4" />
            トップに戻る
          </Link>
        </Button>
      </div>
      <div>
        <h1 className="text-xl font-semibold">アカウント設定</h1>
      </div>

      {/* あなたの情報カード: 取得状態ごとに表示を分岐する */}
      <Card>
        <CardHeader>
          <CardTitle>あなたの情報</CardTitle>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            // 1) 取得中
            <div className="text-sm text-muted-foreground">
              読み込み中です...
            </div>
          ) : error ? (
            // 2) 取得失敗
            <UiErrorAlert error={error} />
          ) : uidDisplay ? (
            // 3) 取得成功
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-full border border-border bg-accent text-sm font-semibold text-accent-foreground shadow-xs">
                {uidDisplay.initial}
              </div>
              <div className="flex flex-col">
                <div className="text-sm font-medium">User</div>
                <div className="text-xs text-muted-foreground">
                  uid: {uidDisplay.short}
                </div>
              </div>
            </div>
          ) : (
            // 4) userMe が null の場合
            <div className="text-sm text-muted-foreground">
              サインイン状態を確認しています...
            </div>
          )}
        </CardContent>
      </Card>

      {/* セキュリティカード: 全端末サインアウト */}
      <Card id="security">
        <CardHeader>
          <CardTitle>セキュリティ</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <Separator />

          <div className="flex flex-col gap-2">
            <div className="text-sm font-medium">全端末サインアウト</div>
            <div className="text-sm text-muted-foreground">
              この端末を含むすべての端末でログアウトします
            </div>
          </div>
        </CardContent>

        <CardFooter className="justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            // 1) クリックで確認ダイアログを開く
            onClick={() => setRevokeDialogOpen(true)}
            // 2) 取得中 or userMe なし の間は誤操作防止で無効化する
            disabled={isLoading || !userMe}
          >
            全端末サインアウト
          </Button>
        </CardFooter>
      </Card>

      {/* Danger Zone: アカウント削除 */}
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>Danger Zone</CardTitle>
          <CardDescription>
            ここからの操作は取り消せないことがあります
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <Separator />

          <div className="flex flex-col gap-2">
            <div className="text-sm font-medium">アカウント削除</div>
            <div className="text-sm text-muted-foreground">
              アカウントと関連データが利用できなくなります
            </div>
          </div>
        </CardContent>

        <CardFooter className="justify-end gap-2">
          <Button
            type="button"
            variant="destructive"
            // 1) クリックで削除確認ダイアログを開く
            onClick={() => setDeleteDialogOpen(true)}
            // 2) 取得中 or userMe なし の間は誤操作防止で無効化する
            disabled={isLoading || !userMe}
          >
            アカウントを削除
          </Button>
        </CardFooter>
      </Card>

      {/* ダイアログ本体: open と onOpenChange で状態を双方向同期する */}
      <AccountDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        redirectTo="/sign-in"
        reauthProvider={reauthProvider}
      />

      {/* 全端末サインアウト確認ダイアログ */}
      <RevokeSessionDialog
        open={revokeDialogOpen}
        onOpenChange={setRevokeDialogOpen}
        redirectTo="/sign-in"
      />
    </div>
  );
}
