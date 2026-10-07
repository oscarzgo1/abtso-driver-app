import type { Metadata } from "next";
import { LegalPortalShell, LegalClause, type LegalPortalSection } from "@/components/LegalPortal";

export const metadata: Metadata = {
  title: "Delete Your Account",
  description: "How to ask Tachyo Driver to delete your account and personal data, and which records are kept by law.",
};

const sections: LegalPortalSection[] = [
  { id: "how-to-request", label: "1. How to request deletion" },
  { id: "what-happens", label: "2. What happens next" },
  { id: "deleted", label: "3. Data that is deleted" },
  { id: "retained", label: "4. Data that is kept, and for how long" },
  { id: "contact", label: "5. Help and contact" },
];

export default function DeleteAccountPage() {
  return (
    <LegalPortalShell
      activeSlug="delete-account"
      title="Delete Your Account"
      updated="7 October 2026"
      sections={sections}
      intro={
        <p>
          This page explains how drivers using the <strong>Tachyo Driver</strong> app (published by
          Tachyo LTD) can ask for their account and personal data to be deleted. Tachyo Driver
          accounts are created by your employer, who is the data controller for your driver
          records, so your employer&apos;s administrator confirms each request. See also our{" "}
          <a href="/legal/privacy" className="text-brand-red underline">Privacy Policy</a>.
        </p>
      }
    >
      <LegalClause id="how-to-request" heading="1. How to request deletion">
        <p><strong>1.1 From the app, signed in:</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Open Tachyo Driver and go to Settings;</li>
          <li>(b) Tap &quot;Request Account Deletion&quot;, optionally add a reason, and tap &quot;Send request&quot;.</li>
        </ul>
        <p><strong>1.2 From the app, signed out (for example, you forgot your PIN):</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) On the sign-in screen, enter your company code and your username or driver ID;</li>
          <li>(b) Tap &quot;Request Account Deletion&quot; and then &quot;Send request&quot;.</li>
        </ul>
        <p><strong>1.3 By email:</strong> if you can no longer use the app, email{" "}
          <a href="mailto:hello@tachyo.co.uk" className="text-brand-red underline">hello@tachyo.co.uk</a>{" "}
          from the address you use for work, with your name, your company name and your driver ID.
          We will pass the request to your employer&apos;s administrator.
        </p>
      </LegalClause>

      <LegalClause id="what-happens" heading="2. What happens next">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Your request goes to your employer&apos;s administrator in the Tachyo admin panel;</li>
          <li>(b) The administrator confirms the request and the deletion is carried out. Nothing is deleted until the administrator confirms;</li>
          <li>(c) We aim to complete requests within one (1) calendar month, in line with Article 12(3) UK GDPR;</li>
          <li>(d) You are told in the app, or by your employer, once the account has been deleted.</li>
        </ul>
      </LegalClause>

      <LegalClause id="deleted" heading="3. Data that is deleted">
        <p>When the request is completed, we delete your driver profile and sign-in, and the personal records linked to it, including:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Your name, driver ID, PIN and other profile details;</li>
          <li>(b) Location history and route traces recorded during shifts, where no legal retention duty applies;</li>
          <li>(c) Photos you uploaded (defect reports and fuel receipts), where no legal retention duty applies;</li>
          <li>(d) Your device and notification details.</li>
        </ul>
      </LegalClause>

      <LegalClause id="retained" heading="4. Data that is kept, and for how long">
        <p>
          Some records must be kept by law, or to deal with legal claims (Article 17(3)(b) and (e)
          UK GDPR). Where we keep them, we keep them only for the period shown and then delete them:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Vehicle safety inspection and defect records: fifteen (15) months;</li>
          <li>(b) Working-time and duty records: twenty-four (24) months;</li>
          <li>(c) Financial and billing records, including pay calculations: six (6) years plus the current year.</li>
        </ul>
        <p>
          Retained records are used only to meet those legal duties. Full details are in clause 6.3 and
          8.4 of our <a href="/legal/privacy" className="text-brand-red underline">Privacy Policy</a>.
        </p>
      </LegalClause>

      <LegalClause id="contact" heading="5. Help and contact">
        <p>
          Questions about a deletion request: <a href="mailto:hello@tachyo.co.uk" className="text-brand-red underline">hello@tachyo.co.uk</a>.
          Tachyo LTD, United Kingdom. You also have the right to complain to the Information
          Commissioner&apos;s Office (ico.org.uk).
        </p>
      </LegalClause>
    </LegalPortalShell>
  );
}
