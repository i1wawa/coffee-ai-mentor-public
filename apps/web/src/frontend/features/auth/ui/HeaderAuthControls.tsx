// apps/web/src/frontend/features/auth/ui/HeaderAuthControls.tsx
// ========================================================
// 概要:
// - ヘッダーの認証操作（サインイン/サインアウト）を状態に応じて切り替える
//
// 責務:
// - useSessionUser の isLoading / isAuthenticated に応じて表示を分岐する
// - variant に応じて「アプリを開く」導線とサインアウト後の遷移先を切り替える
// ========================================================

"use client";

import { ChevronDown, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UI_ERROR_ACTION } from "@/frontend/shared/errors/error-ui-action.mapper";
import { Button } from "@/frontend/shared/ui/shadcn/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/frontend/shared/ui/shadcn/components/ui/dropdown-menu";
import { useSessionUser } from "../model/use-session-user.hook";
import { useSignOut } from "../model/use-sign-out.hook";

type HeaderAuthControlsProps = {
  // ヘッダーの見た目要件が違うため variant で分ける
  variant: "app" | "marketing";
};

const SETTINGS_ACCOUNT_PATH = "/app/settings/account";

export function HeaderAuthControls({ variant }: HeaderAuthControlsProps) {
  // marketing / auth ルートはここで /api/auth/session を叩いて認証判定する必要がないので別扱い
  if (variant === "marketing") {
    return <MarketingHeaderAuthControls />;
  }

  return <AppHeaderAuthControls />;
}

function MarketingHeaderAuthControls() {
  const pathname = usePathname();

  // /sign-in 上ではサインインボタンを出さない
  if (pathname.startsWith("/sign-in")) {
    return null;
  }

  // マーケティング領域は固定導線で良い
  return (
    <Button asChild variant="default">
      <Link href="/sign-in">サインイン</Link>
    </Button>
  );
}

function AppHeaderAuthControls() {
  const {
    isAuthenticated,
    isLoading,
    isRefetching,
    error,
    refetch,
    sessionUser,
  } = useSessionUser();

  // 1) 読み込み中
  // - 誤クリックを防ぐため、最小のプレースホルダにする
  if (isLoading) {
    return (
      <Button type="button" variant="outline" size="sm" disabled>
        ...
      </Button>
    );
  }

  // 2) サインイン済み
  // - ヘッダーの入口を1つに畳む
  if (isAuthenticated) {
    return <SessionUserMenu uid={sessionUser?.uid ?? null} />;
  }

  // 3) 再試行が筋の失敗
  if (error?.uiErrorAction === UI_ERROR_ACTION.RETRY) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isRefetching}
        onClick={() => {
          // 1) 再取得中の連打を防止する
          if (isRefetching) return;
          refetch();
        }}
      >
        再試行
      </Button>
    );
  }

  // 4) 未サインイン
  // - 未サインインは error 扱いにしない（useSessionUser 側で ok(null) に寄せる）
  if (!error) {
    return (
      <Button asChild variant="default">
        <Link href="/sign-in">サインイン</Link>
      </Button>
    );
  }

  // 5) それ以外の失敗はヘッダーでは騒がない
  return null;
}

type SessionUserMenuProps = {
  uid: string | null;
};

function SessionUserMenu({ uid }: SessionUserMenuProps) {
  const signOut = useSignOut({
    // app ヘッダーではサインアウト後に "/sign-in/" に戻す
    // - app 領域に残ると 401 になりやすい
    redirectTo: "/sign-in/",
  });

  const userInitial = (uid?.trim().charAt(0) || "U").toUpperCase();
  const userSummary = uid ? `uid: ${compactUid(uid)}` : "uid: unknown";

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 gap-2 rounded-full px-2"
          data-testid="header-user-menu-trigger"
          disabled={signOut.isPending}
        >
          <span className="grid size-7 place-items-center rounded-full border border-border bg-accent text-xs font-semibold text-accent-foreground shadow-xs">
            {userInitial}
          </span>
          <ChevronDown className="size-4 opacity-70" aria-hidden="true" />
          <span className="sr-only">ユーザーメニュー</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-50">
        <DropdownMenuLabel>
          <div className="flex flex-col gap-0.5">
            <span className="text-sm">アカウント</span>
            <span className="text-xs text-muted-foreground">{userSummary}</span>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link
            href={SETTINGS_ACCOUNT_PATH}
            className="flex items-center gap-2"
          >
            <Settings className="size-4" aria-hidden="true" />
            <span>設定</span>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onSelect={() => {
            void signOut.signOut();
          }}
          disabled={signOut.isPending}
          className="flex items-center gap-2"
          data-testid="header-signout-item"
        >
          <LogOut className="size-4" aria-hidden="true" />
          <span>サインアウト</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function compactUid(uid: string): string {
  const normalizedUid = uid.trim();
  if (normalizedUid.length <= 12) {
    return normalizedUid;
  }
  return `${normalizedUid.slice(0, 8)}...${normalizedUid.slice(-4)}`;
}
