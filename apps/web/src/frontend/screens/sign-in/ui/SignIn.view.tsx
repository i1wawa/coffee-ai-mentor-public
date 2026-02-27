// apps/web/src/frontend/screens/sign-in/ui/SignIn.view.tsx
// ========================================================
// 概要:
// - サインイン画面（Next.js Client Component）
//
// 責務:
// - プロバイダ選択（現状は Google のみ）と送信状態管理
// - OAuth (Open Authorization) popup でサインインし、成功で /app へ遷移
// - 失敗時は共通表示ルールに従ってエラーを表示する
// ========================================================

"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { publishAuthSignedIn } from "@/frontend/entities/session/lib/cross-tab-auth-events";
import { OAUTH_PROVIDER_UI_ITEM_BY_PROVIDER_ID } from "@/frontend/features/auth/config/oauth-provider-ui.config";
import { signInWithPopupAndIssueSessionCookie } from "@/frontend/features/auth/model/sign-in-with-popup";
import { SigninForm } from "@/frontend/features/auth/ui/SigninForm";
import {
  UI_ERROR_ACTION,
  type UiErrorFields,
} from "@/frontend/shared/errors/error-ui-action.mapper";
import { runBoundaryCallbackWithTelemetry } from "@/frontend/shared/observability/boundary-callback-telemetry";
import {
  TELEMETRY_LAYER,
  TELEMETRY_OPERATION,
} from "@/frontend/shared/observability/telemetry-tags";
import { Button } from "@/frontend/shared/ui/shadcn/components/ui/button";

export function SignInView() {
  const router = useRouter();

  // 1) UI状態：二重送信防止のため loading を持つ
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 2) UI状態：失敗時の表示制御のためエラーを保持する
  const [lastError, setLastError] = useState<UiErrorFields | null>(null);

  // 3) Google OAuth の UI 設定を取得する
  const googleProviderItem = OAUTH_PROVIDER_UI_ITEM_BY_PROVIDER_ID.google;

  // 4) ボタン押下時の処理
  // - event handler の例外は Error Boundary が拾わないため telemetry wrapper で包む
  const handleSignIn = () => {
    void runBoundaryCallbackWithTelemetry({
      operation: TELEMETRY_OPERATION.SIGN_IN_WITH_POPUP,
      layer: TELEMETRY_LAYER.UI,
      fn: async () => {
        // 5) 二重送信防止：既に実行中なら何もしない
        if (isSubmitting) return;

        // 6) エラー表示をリセット
        setLastError(null);

        // 7) ローディング開始
        setIsSubmitting(true);

        try {
          // 8) feature/model を呼ぶ（UIは詳細を知らない）
          const result = await signInWithPopupAndIssueSessionCookie({
            providerId: googleProviderItem.providerId,
          });

          // 9) 失敗ならエラー表示
          // - CANCELLED はユーザー操作中断として扱い、表示しない
          if (!result.ok) {
            if (result.error.uiErrorAction !== UI_ERROR_ACTION.SILENT) {
              setLastError(result.error);
            }
            return;
          }

          // 10) 成功: 他タブへ認証状態の更新を通知する
          // - 送信タブ自身はこの後の遷移/refreshで更新される
          publishAuthSignedIn();

          // 11) 成功：/app に遷移
          router.replace("/app");
          router.refresh();
        } finally {
          // 12) ローディング終了
          setIsSubmitting(false);
        }
      },
    });
  };

  return (
    <div data-testid="sign-in-page" className="relative flex flex-1">
      {/* 背景は控えめに。主役はサインインカード */}
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-background via-background to-muted/40" />

      <div className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-3 md:py-14">
        {/* 上部：最小の導線だけ */}
        <div className="flex items-center justify-between pb-5">
          <Button asChild variant="ghost" className="-ml-3">
            <Link href="/" aria-label="トップに戻る">
              <ArrowLeft className="mr-2 size-4" />
              トップに戻る
            </Link>
          </Button>
        </div>

        {/* 中央：サインインに集中 */}
        <div className="flex flex-1 justify-center md:pt-25">
          <div className="w-full max-w-md">
            <SigninForm
              isSubmitting={isSubmitting}
              onGoogleSignIn={handleSignIn}
              googleButtonTestId={googleProviderItem.buttonTestId}
              error={lastError}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
