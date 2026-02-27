// apps/web/src/frontend/features/auth/ui/SigninForm.tsx
// =============================================================================
// 概要:
// - Google OAuth サインイン用 UI（Client Component）
//
// 責務:
// - Google サインインの開始操作と、エラー表示を担う
// - エラー表示は UiErrorAlert に委譲する
// =============================================================================

"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { UiErrorFields } from "@/frontend/shared/errors/error-ui-action.mapper";
import { UiErrorAlert } from "@/frontend/shared/errors/ui-error-alert";
import { Button } from "@/frontend/shared/ui/shadcn/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/frontend/shared/ui/shadcn/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
} from "@/frontend/shared/ui/shadcn/components/ui/field";
import { cn } from "@/frontend/shared/ui/shadcn/lib/utils";

type SigninFormProps = React.ComponentProps<"div"> & {
  isSubmitting: boolean;
  onGoogleSignIn: () => void;
  googleButtonTestId?: string;
  error: UiErrorFields | null;
};

export function SigninForm({
  className,
  isSubmitting,
  onGoogleSignIn,
  googleButtonTestId,
  error,
  ...props
}: SigninFormProps) {
  return (
    <div className={cn("flex flex-col gap-4", className)} {...props}>
      <Card className="rounded-2xl">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto inline-flex size-11 items-center justify-center rounded-2xl bg-muted">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </div>
          <CardTitle className="text-xl">サインイン</CardTitle>
          <CardDescription>Google アカウントで続行します</CardDescription>
        </CardHeader>

        <CardContent>
          <FieldGroup>
            <Field>
              <Button
                className="w-full justify-center gap-3"
                variant="outline"
                type="button"
                onClick={onGoogleSignIn}
                disabled={isSubmitting}
                aria-disabled={isSubmitting}
                aria-busy={isSubmitting}
                data-testid={googleButtonTestId}
              >
                {isSubmitting ? (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <GoogleGIcon className="h-4 w-4" />
                )}

                <span className="text-center">
                  {isSubmitting ? "処理中..." : "Googleでサインイン"}
                </span>
              </Button>

              <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
                ポップアップが開かない場合は、ブラウザの設定をご確認ください。
              </p>
            </Field>

            <UiErrorAlert error={error} />
          </FieldGroup>
        </CardContent>
      </Card>

      <FieldDescription className="text-xs text-muted-foreground leading-relaxed">
        * 続行すると、
        <Link
          href="/legal#terms"
          className="underline underline-offset-4 hover:text-foreground"
        >
          利用規約
        </Link>
        と
        <Link
          href="/legal#privacy"
          className="underline underline-offset-4 hover:text-foreground"
        >
          プライバシーポリシー
        </Link>
        に同意したものとみなされます。
      </FieldDescription>
    </div>
  );
}

function GoogleGIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 48 48"
      className={className}
      focusable="false"
    >
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.32 1.53 7.77 2.8l5.66-5.66C34.57 4.02 29.74 2 24 2 14.92 2 7.1 7.2 3.46 14.76l6.79 5.27C12.02 13.62 17.55 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46 24.5c0-1.57-.14-3.08-.4-4.5H24v8.51h12.4c-.54 2.9-2.16 5.36-4.6 7.03l7.05 5.46C42.91 37.36 46 31.55 46 24.5z"
      />
      <path
        fill="#FBBC05"
        d="M10.25 28.03A14.5 14.5 0 0 1 9.5 24c0-1.4.25-2.75.75-4.03l-6.79-5.27A22 22 0 0 0 2 24c0 3.55.85 6.9 2.46 9.96l7.79-5.93z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.74 0 10.57-1.9 14.09-5.17l-7.05-5.46c-1.96 1.32-4.48 2.1-7.04 2.1-6.45 0-11.98-4.12-13.75-10.2l-7.79 5.93C7.1 40.8 14.92 46 24 46z"
      />
    </svg>
  );
}
