// apps/web/src/frontend/screens/legal/ui/components/TermsSection.tsx
// ========================================================
// 概要:
// - 利用規約セクション
//
// 責務:
// - 利用規約の内容を表示する
// ========================================================

export function TermsSection() {
  return (
    <section id="terms" className="mt-10 space-y-5 scroll-mt-24">
      <h2 className="text-xl font-semibold">利用規約</h2>

      <section className="space-y-2">
        <h3 className="font-medium">第1条（適用）</h3>
        <p className="text-sm leading-7 text-muted-foreground">
          本規約は、Coffee AI
          Mentor（以下「本サービス」）の利用条件を定めるものです。利用者は、本規約に同意のうえ本サービスを利用するものとします。
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">第2条（アカウント）</h3>
        <p className="text-sm leading-7 text-muted-foreground">
          利用者は、Google
          アカウントを利用して認証を行います。認証情報の管理は利用者自身の責任で行うものとします。
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">第3条（生成AIに関する注意）</h3>
        <p className="text-sm leading-7 text-muted-foreground">
          本サービスは、生成AIを利用した回答または助言を表示する場合があります。これらの内容について、運営者は正確性・完全性・最新性・有用性を保証しません。最終的な判断および行動は、利用者自身の責任で行うものとします。
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">第4条（禁止事項）</h3>
        <ul className="list-disc pl-5 text-sm leading-7 text-muted-foreground">
          <li>法令または公序良俗に反する行為</li>
          <li>不正アクセス、リバースエンジニアリング、運営妨害行為</li>
          <li>第三者の権利を侵害する行為</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">第5条（サービス変更・停止）</h3>
        <p className="text-sm leading-7 text-muted-foreground">
          運営者は、保守・障害対応・法令対応その他の理由により、本サービスの全部または一部を変更・停止・終了することがあります。
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">第6条（免責）</h3>
        <p className="text-sm leading-7 text-muted-foreground">
          運営者は、本サービスの完全性・正確性・有用性・継続性を保証しません。運営者の故意または重過失による場合を除き、本サービスに関連して生じた損害について責任を負いません。
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">
          第7条（アカウント停止・退会・データ削除）
        </h3>
        <ul className="list-disc pl-5 text-sm leading-7 text-muted-foreground">
          <li>
            運営者は、利用者が本規約に違反した場合または不正利用のおそれがあると判断した場合、事前通知なく当該利用者のアカウント利用を停止できるものとします。
          </li>
          <li>
            利用者は、ヘッダーの設定メニューから退会（アカウント削除）手続きを行うことができます。
          </li>
          <li>
            退会後はアカウントおよび関連データは利用できなくなります。法令対応または不正利用防止のため、必要最小限のログ等を一定期間保持する場合があります。
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">第8条（規約変更）</h3>
        <p className="text-sm leading-7 text-muted-foreground">
          運営者は、必要に応じて本規約を改定できます。改定後の規約は、本ページに掲載した時点で効力を生じます。
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">第9条（準拠法・裁判管轄）</h3>
        <p className="text-sm leading-7 text-muted-foreground">
          本規約は日本法に準拠します。本サービスに関して紛争が生じた場合は、運営者所在地を管轄する裁判所を第一審の専属的合意管轄とします。
        </p>
      </section>
    </section>
  );
}
