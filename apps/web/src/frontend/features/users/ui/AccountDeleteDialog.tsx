// apps/web/src/frontend/features/users/ui/AccountDeleteDialog.tsx
// ================================================================
// 概要:
// - アカウント削除の確認ダイアログ
//
// 責務:
// - 確認入力と押下状態を管理する
// - model hook を呼び、結果を表示する
// ================================================================

"use client";

import { errorCode } from "@packages/observability/src/logging/telemetry-error-common";
import type { AuthProvider } from "firebase/auth";
import { useRouter } from "next/navigation";
import * as React from "react";
import type { UiErrorFields } from "@/frontend/shared/errors/error-ui-action.mapper";
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
import { Input } from "@/frontend/shared/ui/shadcn/components/ui/input";
import { useDeleteUserMeFlow } from "../model/use-delete-user-me-flow.hook";

type AccountDeleteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  redirectTo: string;
  reauthProvider: AuthProvider;
};

const CONFIRM_TEXT = "DELETE";

export function AccountDeleteDialog({
  open,
  onOpenChange,
  redirectTo,
  reauthProvider,
}: AccountDeleteDialogProps) {
  const router = useRouter();
  const flow = useDeleteUserMeFlow({
    reauthProvider,
  });

  // ユーザーの入力状態
  // - CONFIRM_TEXT と等しいときに削除ボタンが有効になる
  const [confirmInput, setConfirmInput] = React.useState("");
  // API からのエラーを保持する状態
  // - これがあるときは失敗表示をする
  const [lastError, setLastError] = React.useState<UiErrorFields | null>(null);
  // 削除完了状態
  // - true のときは完了表示をする
  const [isCompleted, setIsCompleted] = React.useState(false);

  function closeCompletedDialogAndRedirect() {
    // サインイン画面へ寄せる（戻る履歴は積まない）
    router.replace(redirectTo);
  }

  const canSubmit =
    confirmInput.trim() === CONFIRM_TEXT && !flow.isPending && !isCompleted;
  const needsReauthentication =
    !isCompleted && lastError?.errorCode === errorCode.PRECONDITION_FAILED;

  async function handleDeleteOnce() {
    // 1) 二重送信防止
    if (!canSubmit) return;

    // 2) 表示をリセット
    setLastError(null);

    // 3) 実行
    const result = await flow.deleteOnce();
    if (!result.ok) {
      setLastError(result.error);
      return;
    }

    // 4) 成功: 同じダイアログ内で完了状態に切り替える
    setIsCompleted(true);
  }

  async function handleReauthenticateAndDelete() {
    // 1) 二重送信防止 + 確認入力の再チェック
    if (!canSubmit) return;

    // 2) 表示をリセット
    setLastError(null);

    // 3) 再認証して削除する
    const result = await flow.reauthenticateAndDelete();
    if (!result.ok) {
      setLastError(result.error);
      return;
    }

    // 4) 成功: 同じダイアログ内で完了状態に切り替える
    setIsCompleted(true);
  }

  React.useEffect(() => {
    // ダイアログが閉じたら状態を初期化する
    if (!open) {
      setConfirmInput("");
      setLastError(null);
      setIsCompleted(false);
    }
  }, [open]);

  if (isCompleted) {
    return (
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          // 完了状態はボタン操作のみで遷移させる
          if (next) onOpenChange(next);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>アカウントを削除しました</AlertDialogTitle>
            <AlertDialogDescription>
              このアカウントは削除済みです。続行するにはサインイン画面へ移動します。
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter className="mt-4">
            <Button
              type="button"
              onClick={() => {
                closeCompletedDialogAndRedirect();
              }}
            >
              サインイン画面へ
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // 送信中は閉じない
        if (flow.isPending) return;
        onOpenChange(next);
      }}
    >
      <AlertDialogContent
        onEscapeKeyDown={(e) => {
          if (flow.isPending) e.preventDefault();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>アカウントを削除します</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                この操作は取り消せません。削除すると、あなたのデータは利用できなくなります。
              </p>
              <p>続行する場合は、DELETE と入力してください。</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="mt-3 space-y-2">
          <Input
            value={confirmInput}
            onChange={(e) => setConfirmInput(e.target.value)}
            placeholder="DELETE"
            autoComplete="off"
            inputMode="text"
            disabled={flow.isPending}
          />

          {lastError ? (
            needsReauthentication ? (
              <p className="text-sm text-destructive">
                削除の前に再認証が必要です。再認証して続行してください。
              </p>
            ) : (
              <UiErrorAlert error={lastError} />
            )
          ) : (
            <p className="text-xs text-muted-foreground">
              入力が一致すると削除ボタンが有効になります
            </p>
          )}
        </div>

        <AlertDialogFooter className="mt-4">
          <AlertDialogCancel disabled={flow.isPending}>
            キャンセル
          </AlertDialogCancel>

          {needsReauthentication ? (
            <Button
              type="button"
              variant="outline"
              disabled={flow.isPending}
              onClick={handleReauthenticateAndDelete}
            >
              再認証して続行
            </Button>
          ) : (
            <Button
              type="button"
              variant="destructive"
              disabled={!canSubmit}
              onClick={handleDeleteOnce}
            >
              アカウントを削除
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
