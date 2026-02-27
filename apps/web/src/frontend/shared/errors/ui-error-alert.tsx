// apps/web/src/frontend/shared/errors/ui-error-alert.tsx
// ================================================================
// 概要:
// - 共通のエラー Alert UI コンポーネント
//
// 責務:
// - UiErrorFields を受け取り、表示可否と文言を共通ルールで描画する
// - SUPPORT のときのみサポートID表示とコピー操作を提供する
// ================================================================

"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/frontend/shared/ui/shadcn/components/ui/alert";
import { Button } from "@/frontend/shared/ui/shadcn/components/ui/button";
import type { UiErrorFields } from "./error-ui-action.mapper";
import { getUiErrorPresentation } from "./ui-error-presentation";

// コピー操作後のフィードバック状態
// - idle: フィードバック非表示
// - success: コピー成功メッセージ表示
// - error: コピー失敗メッセージ表示
type CopyFeedbackState = "idle" | "success" | "error";

type UiErrorAlertAction = {
  label: string;
  href: string;
};

type UiErrorAlertProps = {
  error: UiErrorFields | null;
  action?: UiErrorAlertAction;
};

export function UiErrorAlert({ error, action }: UiErrorAlertProps) {
  const [copyFeedbackState, setCopyFeedbackState] =
    useState<CopyFeedbackState>("idle");
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presentation = error ? getUiErrorPresentation(error) : null;
  const supportId = presentation?.supportId ?? null;
  const isCopied = copyFeedbackState === "success";
  const feedbackText =
    copyFeedbackState === "success"
      ? "サポートIDをコピーしました"
      : copyFeedbackState === "error"
        ? "コピーできませんでした。手動でコピーしてください。"
        : "";

  useEffect(() => {
    return () => {
      // タイマーの後始末をしないとメモリリーク/意図しない更新になる
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  // shouldDisplay が false のときはエラーを表示しない
  if (!presentation?.shouldDisplay) {
    return null;
  }

  const handleCopySupportId = async () => {
    // サポートIDがない場合は、そもそもボタンが表示されない
    if (!supportId) return;

    // Clipboard API が利用できない環境の場合は、コピー失敗のフィードバックを表示する
    if (!navigator.clipboard?.writeText) {
      setCopyFeedbackState("error");
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(() => {
        setCopyFeedbackState("idle");
      }, 1800);
      return;
    }

    try {
      await navigator.clipboard.writeText(supportId);
      setCopyFeedbackState("success");

      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(() => {
        setCopyFeedbackState("idle");
      }, 900);
    } catch {
      setCopyFeedbackState("error");
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(() => {
        setCopyFeedbackState("idle");
      }, 1800);
    }
  };

  return (
    <Alert
      data-testid="ui-error-alert"
      role="alert"
      aria-live="polite"
      aria-atomic="true"
      variant="destructive"
      className="mt-2"
    >
      <AlertTitle>{presentation.title ?? "失敗しました"}</AlertTitle>

      <AlertDescription className="mt-1 space-y-2">
        {presentation.description ? <p>{presentation.description}</p> : null}
        {action ? (
          <div className="pt-1">
            <Button asChild variant="secondary" size="sm">
              <a href={action.href}>{action.label}</a>
            </Button>
          </div>
        ) : null}

        {supportId ? (
          <div className="pt-2">
            <p className="text-xs text-muted-foreground">サポートID</p>
            <div className="mt-1 flex items-center gap-2">
              <code
                data-testid="ui-error-support-id"
                className="block flex-1 select-all break-all rounded bg-muted px-2 py-1 text-xs text-foreground"
              >
                {supportId}
              </code>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleCopySupportId}
                aria-label={
                  isCopied ? "サポートIDをコピーしました" : "サポートIDをコピー"
                }
              >
                {isCopied ? (
                  <Check
                    className="h-4 w-4 text-foreground"
                    aria-hidden="true"
                  />
                ) : (
                  <Copy
                    className="h-4 w-4 text-foreground"
                    aria-hidden="true"
                  />
                )}
              </Button>
            </div>
            {copyFeedbackState === "error" ? (
              <p className="mt-1 text-xs leading-4 text-muted-foreground">
                コピーできませんでした。手動でコピーしてください。
              </p>
            ) : null}
            <span
              data-testid="ui-error-copy-feedback"
              className="sr-only"
              aria-live={copyFeedbackState === "idle" ? "off" : "polite"}
              aria-atomic="true"
            >
              {feedbackText}
            </span>
          </div>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
