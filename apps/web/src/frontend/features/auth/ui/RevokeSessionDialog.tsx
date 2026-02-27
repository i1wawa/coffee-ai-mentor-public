// apps/web/src/frontend/features/auth/ui/RevokeSessionDialog.tsx
// ================================================================
// 概要:
// - 全端末サインアウト（セキュリティ操作）の確認ダイアログ
//
// 責務:
// - 送信中の二重操作を防ぎつつ、useSignOut で全端末ログアウトを実行する
// - SIGN_IN 系の失敗は完了扱いにして閉じる
// - RETRY は汎用エラー、SUPPORT は問い合わせID（errorId）を表示する
// - 失敗表示は close 時にリセットする
// ================================================================

"use client";

import * as React from "react";
import type { UiErrorFields } from "@/frontend/shared/errors/error-ui-action.mapper";
import { UI_ERROR_ACTION } from "@/frontend/shared/errors/error-ui-action.mapper";
import { UiErrorAlert } from "@/frontend/shared/errors/ui-error-alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/frontend/shared/ui/shadcn/components/ui/alert-dialog";
import { Button } from "@/frontend/shared/ui/shadcn/components/ui/button";
import { useSignOut } from "../model/use-sign-out.hook";

type RevokeSessionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  redirectTo: string;
};

export function RevokeSessionDialog({
  open,
  onOpenChange,
  redirectTo,
}: RevokeSessionDialogProps) {
  const signOut = useSignOut({ redirectTo });
  // 直近の失敗内容を保持して、ダイアログ内に表示する
  // - SIGN_IN 以外の失敗だけを保持対象にする
  // - SUPPORT は問い合わせID（errorId）表示に使う
  // 再送信開始時と close 時に null に戻して、前回エラーの残留表示を防ぐ
  const [lastError, setLastError] = React.useState<UiErrorFields | null>(null);

  async function handleRevoke() {
    if (signOut.isPending) return;

    // 再実行前に前回エラー表示をクリアする
    setLastError(null);

    const result = await signOut.revokeSession();
    if (result.ok) {
      onOpenChange(false);
      return;
    }

    // 未サインイン相当なら UX 的には完了扱いで良い
    // - cookie が無い等で revoke が失敗しても、目的は達成済み
    if (result.error.uiErrorAction === UI_ERROR_ACTION.SIGN_IN) {
      onOpenChange(false);
      return;
    }

    setLastError(result.error);
  }

  React.useEffect(() => {
    if (!open) {
      // ダイアログを閉じたらエラー表示を初期化する
      setLastError(null);
    }
  }, [open]);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // 送信中は閉じない
        if (signOut.isPending) return;
        onOpenChange(next);
      }}
    >
      <AlertDialogContent
        onEscapeKeyDown={(e) => {
          if (signOut.isPending) e.preventDefault();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>全端末サインアウト</AlertDialogTitle>
          <AlertDialogDescription>
            この端末を含むすべての端末でサインアウトします。続行しますか？
          </AlertDialogDescription>
        </AlertDialogHeader>

        <UiErrorAlert error={lastError} />

        <AlertDialogFooter className="mt-4">
          <AlertDialogCancel disabled={signOut.isPending}>
            キャンセル
          </AlertDialogCancel>

          <Button
            type="button"
            variant="destructive"
            disabled={signOut.isPending}
            onClick={() => {
              void handleRevoke();
            }}
          >
            全端末サインアウト
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
