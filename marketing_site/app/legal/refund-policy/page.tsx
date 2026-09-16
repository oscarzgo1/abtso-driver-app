import type { Metadata } from "next";
import { LegalPortalShell, LegalClause, UnreviewedDraftNotice, type LegalPortalSection } from "@/components/LegalPortal";

export const metadata: Metadata = {
  title: "Refund & Data Purge Policy",
  description: "The money-back guarantee on paid plans, and what happens to your data after cancellation or termination.",
};

const sections: LegalPortalSection[] = [
  { id: "trial-vs-refund", label: "1. Free trial vs. this policy" },
  { id: "money-back", label: "2. 14-day money-back guarantee" },
  { id: "refund-processing", label: "3. Refund processing" },
  { id: "cessation", label: "4. Cessation of processing" },
  { id: "export-window", label: "5. 14-day export window" },
  { id: "purge", label: "6. Automated cryptographic purge" },
  { id: "certificate", label: "7. Certificate of destruction" },
];

export default function RefundPolicyPage() {
  return (
    <LegalPortalShell
      activeSlug="refund-policy"
      title="Refund & Data Purge Policy"
      updated="16 September 2026"
      sections={sections}
      intro={
        <p>
          This policy covers two things specific to a <strong>paid</strong> Tachyo subscription:
          the money-back guarantee available shortly after converting to a paid plan, and exactly
          what happens to the Customer&apos;s data after a paid account is cancelled or
          terminated. It forms part of the{" "}
          <a href="/legal/terms" className="text-brand-red underline">B2B Master SaaS Agreement &amp; Terms of Service</a>{" "}
          (Clause 7) and the{" "}
          <a href="/legal/dpa" className="text-brand-red underline">Data Processing Addendum</a>{" "}
          (Clause 7), which this page restates together in one place for convenience — those two
          documents are the governing text if anything here ever reads as inconsistent with them.
        </p>
      }
    >
      <LegalClause id="trial-vs-refund" heading="1. This is separate from the free trial">
        <p>
          <strong>1.1</strong> New Customers get a free trial (currently 180 days from
          registration, see Terms of Service Clause 7.1) before any payment is taken. Nothing in
          this policy shortens that trial. This policy applies only once a Customer has actually
          converted to, and paid for, a paid plan.
        </p>
      </LegalClause>

      <LegalClause id="money-back" heading="2. 14-day money-back guarantee">
        <p>
          <strong>2.1</strong> New enterprise subscribers may terminate their subscription within
          fourteen (14) calendar days of the initial subscription payment date, for any reason.
        </p>
        <p>
          <strong>2.2</strong> To request this, the Customer sends written termination to{" "}
          support@tachyo.co.uk within the 14-day window. The guarantee applies to the
          Customer&apos;s first payment on converting from trial to paid; it is not intended to
          apply repeatedly to every subsequent renewal payment.
        </p>
      </LegalClause>

      <LegalClause id="refund-processing" heading="3. Refund processing">
        <p>
          <strong>3.1</strong> Upon receipt of a valid termination request within the 14-day
          window, Tachyo LTD shall process a 100% refund of the initial subscription fee to the
          original payment method within five (5) business days.
        </p>
      </LegalClause>

      <LegalClause id="cessation" heading="4. Cessation of processing on termination">
        <p>
          <strong>4.1</strong> Upon termination or expiration of the Customer&apos;s subscription
          (whether via the 14-day guarantee above, or any other cancellation or termination),
          Tachyo LTD shall immediately halt all active telematics processing, driver check-in
          ingestions, and OCR parsing.
        </p>
      </LegalClause>

      <LegalClause id="export-window" heading="5. 14-day data export window after cancellation or termination">
        <p>
          <strong>5.1</strong> Following cancellation or termination — other than trial expiry,
          which follows the separate process in Terms of Service Clause 7.1 — the Customer has a
          strict window of fourteen (14) calendar days from the effective date of termination to
          access the web panel and export its historical fleet compliance logs, inspection
          dockets, and settlement records as structured CSV and PDF compliance files.
        </p>
        <p>
          <strong>5.2</strong> During this 14-day window, telematics ingestion and mobile app
          check-ins remain suspended (per Clause 4); the admin panel operates in read-only export
          mode only.
        </p>
        <p>
          <strong>5.3</strong> It is the Customer&apos;s responsibility to complete this export
          within the 14-day window. Tachyo will provide reasonable notice of the approaching
          deadline to the Customer&apos;s admin account holders where practicable, but the purge
          deadline in Clause 6 applies regardless of whether that notice is received or acted on.
        </p>
      </LegalClause>

      <LegalClause id="purge" heading="6. Automated cryptographic purge">
        <UnreviewedDraftNotice>
          The 14-day export deadline, the 23:59 BST purge time, and the 30-day backup rotation
          ceiling are all now fixed, consistent figures across this page, the Terms of Service,
          and the DPA. What&apos;s still unconfirmed is purely technical: whether Tachyo&apos;s
          actual infrastructure performs a true cryptographic key-destruction erasure (as opposed
          to a standard row/object delete) — worth confirming against the real Supabase/AWS setup
          before this exact phrase is relied upon.
        </UnreviewedDraftNotice>
        <p>
          <strong>6.1</strong> Exactly at 23:59 BST on the fourteenth (14th) calendar day
          following termination, Tachyo&apos;s automated database routines execute an
          irreversible, cryptographic hard deletion of all Customer personal data across active
          database tables, object storage buckets (defect photos and fuel receipt dockets), and
          temporary session logs, within AWS London (eu-west-2).
        </p>
        <p>
          <strong>6.2</strong> Backup archives are overwritten and eradicated in accordance with
          standard disaster recovery rotation cycles, not to exceed thirty (30) days after the
          purge event.
        </p>
        <p>
          <strong>6.3</strong> This deletion is irreversible. Tachyo cannot recover a
          Customer&apos;s data after this point, even at the Customer&apos;s request. The
          Customer is strongly advised to complete the export described in Clause 5 well before
          the 14-day deadline, including before any statutory DVSA audit that may rely on those
          records.
        </p>
      </LegalClause>

      <LegalClause id="certificate" heading="7. Certificate of destruction">
        <p>
          <strong>7.1</strong> Upon written request received prior to the expiration of the
          14-day window, Tachyo LTD shall issue an electronic Certificate of Data Destruction
          confirming compliance with Clause 6.
        </p>
      </LegalClause>
    </LegalPortalShell>
  );
}
