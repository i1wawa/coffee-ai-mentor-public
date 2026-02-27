// apps/web/src/app/(app)/app/settings/account/page.tsx
// ========================================================
// アカウント設定ページ
// /app/settings/account に対応
// ========================================================

import type { Metadata } from "next";
import { AccountSettingsView } from "@/frontend/screens/app/settings/account/ui/AccountSettings.view";

export const metadata: Metadata = {
  title: "アカウント設定 | Coffee AI Mentor",
  description:
    "Coffee AI Mentor のアカウント設定、セッション管理、アカウント削除を行うページです。",
};

export default function AccountSettingsPage() {
  return <AccountSettingsView />;
}
