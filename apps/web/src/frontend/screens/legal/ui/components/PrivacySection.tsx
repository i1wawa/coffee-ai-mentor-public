// apps/web/src/frontend/screens/legal/ui/components/PrivacySection.tsx
// ========================================================
// 概要:
// - プライバシーポリシーセクション
//
// 責務:
// - プライバシーポリシーの内容を表示する
// ========================================================

import Link from "next/link";

type PrivacySectionProps = {
  contactFormUrl: string | null;
};

type ContactFormLinkProps = {
  contactFormUrl: string | null;
  pendingText?: string;
};

function ContactFormLink({
  contactFormUrl,
  pendingText = "お問い合わせフォーム（準備中）",
}: ContactFormLinkProps) {
  if (!contactFormUrl) {
    return <>{pendingText}</>;
  }

  return (
    <Link
      href={contactFormUrl}
      className="underline underline-offset-4 hover:text-foreground"
      target="_blank"
      rel="noopener noreferrer"
    >
      お問い合わせフォーム（Google Forms）
    </Link>
  );
}

export function PrivacySection({ contactFormUrl }: PrivacySectionProps) {
  return (
    <section id="privacy" className="mt-12 space-y-5 scroll-mt-24">
      <h2 className="text-xl font-semibold">プライバシーポリシー</h2>

      <section className="space-y-2">
        <h3 className="font-medium">1. 個人情報取扱事業者</h3>
        <p className="text-sm leading-7 text-muted-foreground">
          運営者名：Coffee AI Mentor（屋号）
          <br />
          連絡先： <ContactFormLink contactFormUrl={contactFormUrl} />
          <br />
          事業者の氏名又は名称・住所は、本人からの求めに応じ、法令に基づき遅滞なく回答します。
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">2. 取得する情報</h3>
        <ul className="list-disc pl-5 text-sm leading-7 text-muted-foreground">
          <li>
            認証情報:
            Googleアカウントの識別子（UID）、メールアドレス、表示名、プロフィール画像URL
          </li>
          <li>セッション情報: 認証維持のためのCookie</li>
          <li>
            ログ情報: IPアドレス、ブラウザ情報、アクセス時刻、エラー情報等
          </li>
        </ul>
        <p className="text-sm leading-7 text-muted-foreground">
          Cookieは認証維持のため、ログ情報は障害対応および不正利用防止のために利用し、必要な範囲で一定期間保持します。
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">3. 利用目的</h3>
        <ul className="list-disc pl-5 text-sm leading-7 text-muted-foreground">
          <li>本人認証およびセッション管理のため</li>
          <li>不正利用防止およびセキュリティ確保のため</li>
          <li>障害対応、監視、品質改善のため</li>
          <li>問い合わせ対応のため</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">4. 第三者提供</h3>
        <p className="text-sm leading-7 text-muted-foreground">
          法令に基づく場合を除き、本人の同意なく個人データを第三者へ提供しません。
          ただし、運用に必要な範囲で外部サービス提供者に取扱いを委託することがあります。
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">5. 利用する外部サービス</h3>
        <ul className="list-disc pl-5 text-sm leading-7 text-muted-foreground">
          <li>Firebase Authentication（Google LLC）: 認証基盤として利用</li>
          <li>
            Google Cloud（Google LLC）: アプリ実行・ログ管理基盤として利用
          </li>
          <li>Sentry（Functional Software, Inc.）: 障害監視として利用</li>
          <li>Google Forms（Google LLC）: お問い合わせ受付として利用</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">6. 安全管理措置</h3>
        <ul className="list-disc pl-5 text-sm leading-7 text-muted-foreground">
          <li>アクセス制御、認証情報管理、通信の暗号化（HTTPS）</li>
          <li>必要最小限の権限設計とログ監視</li>
          <li>漏えい等のインシデント発生時の調査・再発防止</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">7. 保有個人データの開示等の請求</h3>
        <p className="text-sm leading-7 text-muted-foreground">
          本人は、法令に基づき、保有個人データの利用目的の通知、開示、訂正・追加・削除、利用停止・消去、第三者提供停止を請求できます。
          請求方法および本人確認手続は、下記窓口までご連絡ください。
          本人確認は、登録メールアドレスからの連絡その他合理的な方法で行います。
          開示等請求の手数料は原則無料ですが、実費が発生する場合は事前に通知のうえ請求することがあります。
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">8. お問い合わせ窓口</h3>
        <p className="text-sm leading-7 text-muted-foreground">
          <ContactFormLink
            contactFormUrl={contactFormUrl}
            pendingText="お問い合わせフォームは準備中です。公開後、本ページに掲載します。"
          />
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">9. 改定</h3>
        <p className="text-sm leading-7 text-muted-foreground">
          本ポリシーは、法令改正や運用変更に応じて改定することがあります。改定後の内容は本ページに掲載した時点で効力を生じます。
        </p>
      </section>
    </section>
  );
}
