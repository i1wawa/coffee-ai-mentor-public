// apps/web/src/app/(auth)/sign-in/page.tsx
// ========================================================
// サインインページ
// /sign-in に対応
// ========================================================

import type { Metadata } from "next";
import { SignInView } from "@/frontend/screens/sign-in/ui/SignIn.view";

export const metadata: Metadata = {
  title: "サインイン | Coffee AI Mentor",
  description:
    "Coffee AI Mentor にサインインして、コーヒー記録と振り返りを始めるページです。",
};

export default function SignInPage() {
  return (
    // TODO テストで getByRole で拾えるようにする
    <SignInView />
  );
}
