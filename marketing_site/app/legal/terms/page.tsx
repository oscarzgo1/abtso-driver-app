import type { Metadata } from "next";
import { LegalPortalShell, LegalClause, type LegalPortalSection } from "@/components/LegalPortal";

export const metadata: Metadata = {
  title: "B2B Terms of Service",
  description: "Tachyo LTD's B2B Master SaaS Agreement & Terms of Service governing use of the Tachyo platform by customer businesses.",
};

const sections: LegalPortalSection[] = [
  { id: "definitions", label: "1. Definitions & B2B status" },
  { id: "licence", label: "2. Licence & access restrictions" },
  { id: "indicators", label: "3. Heuristic UI & roadworthiness" },
  { id: "o-licence", label: "4. Operator Licence compliance" },
  { id: "financial-analytics", label: "5. Financial analytics & OCR" },
  { id: "liability", label: "6. Limitation of liability" },
  { id: "guarantee-purge", label: "7. Guarantee, cancellation & purge" },
  { id: "governing-law", label: "8. Governing law & jurisdiction" },
];

export default function TermsPage() {
  return (
    <LegalPortalShell
      activeSlug="terms"
      title="B2B Master SaaS Agreement & Terms of Service"
      updated="16 September 2026"
      sections={sections}
    >
      <LegalClause id="definitions" heading="1. Definitions & commercial B2B status">
        <p>
          <strong>1.1 Parties:</strong> This Master Services Agreement (&quot;Agreement&quot;) is
          entered into between Tachyo LTD registered at 20 South Street, Doncaster, England, DN4
          5FH (&quot;Tachyo&quot;, &quot;Provider&quot;), and the commercial entity subscribing to
          the Service (&quot;Customer&quot;, &quot;Operator&quot;).
        </p>
        <p>
          <strong>1.2 Strict Exclusion of Consumer Law:</strong> The Service is supplied solely on
          a business-to-business (B2B) basis for commercial transport fleet operations. To the
          fullest extent permitted by law, the provisions of the Consumer Rights Act 2015 and the
          Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013
          are expressly excluded.
        </p>
        <p>
          <strong>1.3 Authority to Bind:</strong> The individual accepting these terms warrants
          that they possess legal authority to enter into binding commercial contracts on behalf
          of the Customer entity.
        </p>
      </LegalClause>

      <LegalClause id="licence" heading="2. SaaS licence grant & access restrictions">
        <p>
          <strong>2.1 Scope of Licence:</strong> Tachyo grants the Customer a non-exclusive,
          non-transferable, revocable licence to access the web dispatch platform and deploy the
          mobile PWA endpoint to authorized drivers solely for internal fleet telematics and
          compliance management.
        </p>
        <p><strong>2.2 Prohibited Conduct:</strong> The Customer shall not, and shall not permit any employee, agency worker, or third party to:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Reverse engineer, decompile, or extract source code from the Tachyo platform;</li>
          <li>(b) Resell, sub-license, white-label, or provide commercial bureau dispatch services to external hauliers without prior written consent;</li>
          <li>(c) Inject synthetic telemetry, manipulate GPS time-series records, or simulate vehicle inspections through programmatic scripting.</li>
        </ul>
      </LegalClause>

      <LegalClause id="indicators" heading="3. Heuristic UI, algorithmic indicators & statutory roadworthiness disclaimer">
        <p><strong>3.1 Non-Certification Status of Visual Signals:</strong> The Customer acknowledges that all visual status indicators, color-coded badges, and operational banners displayed across the Service:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Emerald Green (#10B981 / &quot;Compliant&quot;): Signifies solely that recorded database entries have not triggered a mathematical threshold alert based on user-entered parameters;</li>
          <li>(b) Amber (#F59E0B / &quot;Due Soon&quot;): Signifies solely that an upcoming statutory date falls within the Customer-configured warning lead time;</li>
          <li>(c) Brand Red (#CC0000 / &quot;Critical VOR&quot;): Reflects an active recorded safety defect or expired inspection date (≤ 0 days);</li>
          <li>(d) Do NOT constitute a statutory Certificate of Roadworthiness, mechanical sign-off, or verification under the Road Traffic Act 1988.</li>
        </ul>
        <p>
          <strong>3.2 Mandatory Human Verification:</strong> The visual representation of an asset
          as &quot;Compliant&quot; or &quot;Green&quot; within the UI shall never replace,
          diminish, or alter the driver&apos;s statutory duty to conduct a physical pre-use
          walkaround inspection, nor the Transport Manager&apos;s duty to independently inspect
          workshop documentation.
        </p>
        <p><strong>3.3 Zero Liability for Roadside Enforcement & DVSA Sanctions:</strong> Tachyo LTD disclaims all liability for:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Prohibition notices (including immediate or delayed PG9 notices) issued by DVSA examiners or Police constables;</li>
          <li>(b) Roadside vehicle impoundments, fixed penalty notices, or immobilization fees;</li>
          <li>(c) Overdue Periodic Maintenance Inspections (PMIs) or missed Roller Brake Tests resulting from inaccurate date entries by the Customer.</li>
        </ul>
      </LegalClause>

      <LegalClause id="o-licence" heading="4. Operator Licence (O-Licence) statutory compliance">
        <p>
          <strong>4.1 Primacy of Statutory Undertakings:</strong> The Customer, as the statutory
          Operator Licence holder under the Goods Vehicles (Licensing of Operators) Act 1995,
          retains exclusive, non-delegable legal accountability for fulfilling all license
          undertakings before the Traffic Commissioners for Great Britain.
        </p>
        <p>
          <strong>4.2 Transport Manager Professional Responsibility:</strong> Tachyo functions
          strictly as passive operational software. It does not act as, nor replace the statutory
          functions of, a professionally competent Transport Manager (CPC holder).
        </p>
        <p>
          <strong>4.3 Audit & Public Inquiry Disclaimers:</strong> In the event that the Customer
          is summoned to a formal Public Inquiry (PI) or Preliminary Hearing before a Traffic
          Commissioner, Tachyo LTD accepts zero responsibility for regulatory curtailments,
          licence suspensions, or revocations resulting from poor maintenance regimes or driver
          hours breaches.
        </p>
      </LegalClause>

      <LegalClause id="financial-analytics" heading="5. Financial yield analytics, smart CSV ingestion & fuel OCR disclaimers">
        <p><strong>5.1 Advisory Nature of Financial Computations:</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) All figures generated across the Profitability and Settlement dashboards (including Gross Billed Revenue, Shift Payroll Yield, Fuel Running Costs, and Gross Profit Margins) represent computational estimates derived from Customer-provided inputs.</li>
          <li>(b) The Service is an operational management aid and does not constitute professional accounting, taxation, or payroll processing software under the purview of HM Revenue & Customs (HMRC).</li>
        </ul>
        <p><strong>5.2 Carrier Remittance & Manifest Parsing (Fuzzy Ingestion):</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) While the platform employs heuristic algorithms to auto-detect and map columns from carrier remittance documents (including Amazon Relay, DHL, Eddie Stobart, and third-party freight brokers), the Customer maintains sole responsibility for confirming the accuracy of rate mappings prior to reconciliation.</li>
          <li>(b) Tachyo LTD accepts zero liability for discrepancies, missing rate items, disputed demurrage charges, or carrier chargebacks resulting from malformed CSV/XLSX imports.</li>
        </ul>
        <p><strong>5.3 Fuel Docket Machine-Vision OCR Parsing:</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Optical Character Recognition (OCR) applied to driver fuel receipts is subject to physical image degradation (e.g., thermal ink fade, poor lighting, or camera distortion).</li>
          <li>(b) Extracted totals, volumes in litres, and VAT registrations must be manually audited and approved by the Customer&apos;s dispatch or accounts team before export. Tachyo disclaims all liability for incorrect input VAT reclaim submissions made to HMRC.</li>
        </ul>
        <p><strong>5.4 Payroll Exclusion & Wage Dispute Indemnity:</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Calculations of driver earnings based on hourly rates, day rates, or per-mile allocations serve purely for internal job-costing analysis.</li>
          <li>(b) The Customer warrants that formal driver payroll, minimum wage compliance (National Minimum Wage Act 1998), and working time pay (Working Time Regulations 1998) are managed through an independent payroll system. The Customer shall indemnify Tachyo against any driver unlawful deduction of wages claims before an Employment Tribunal.</li>
        </ul>
      </LegalClause>

      <LegalClause id="liability" heading="6. Absolute limitation of financial liability (the liability cap)">
        <p><strong>6.1 Uncapped Liabilities (Statutory Protections):</strong> Nothing in this Agreement shall limit or exclude either party&apos;s liability for:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Death or personal injury caused by its negligence;</li>
          <li>(b) Fraud or fraudulent misrepresentation;</li>
          <li>(c) Any other liability that cannot be excluded under the laws of England and Wales.</li>
        </ul>
        <p><strong>6.2 Consequential & Indirect Loss Exclusion:</strong> To the maximum extent permitted by the Unfair Contract Terms Act 1977 (UCTA), Tachyo LTD shall have no liability to the Customer, whether in contract, tort (including negligence), breach of statutory duty, or otherwise, for:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Loss of profits, commercial contracts, or revenue (including cancellation of haulier contracts by Amazon, DHL, or prime contractors);</li>
          <li>(b) Loss of business opportunity, goodwill, or commercial reputation;</li>
          <li>(c) Fines, fixed penalties, or regulatory levies imposed by the DVSA, Traffic Commissioners, or Police constables;</li>
          <li>(d) Loss, corruption, or temporary inaccessibility of data or telematics breadcrumbs.</li>
        </ul>
        <p><strong>6.3 Total Aggregate Financial Ceiling:</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Subject to Clause 6.1, Tachyo LTD&apos;s total aggregate liability arising out of or related to the Service, whether in contract, tort, or otherwise, shall be strictly limited to the total subscription fees actually paid by the Customer to Tachyo LTD in the three (3) months immediately preceding the event giving rise to the claim.</li>
          <li>(b) Both parties explicitly agree that this financial cap satisfies the requirement of reasonableness under Section 11 of the Unfair Contract Terms Act 1977, taking into account the subscription pricing model.</li>
        </ul>
      </LegalClause>

      <LegalClause id="guarantee-purge" heading="7. 14-day commercial guarantee, cancellation & cryptographic data purge">
        <p><strong>7.1 14-Day Money-Back Commercial Guarantee:</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) New enterprise subscribers may terminate their subscription within fourteen (14) calendar days of the initial subscription payment date.</li>
          <li>(b) Upon receipt of written termination to support@tachyo.co.uk within this 14-day window, Tachyo LTD shall process a 100% refund of the initial subscription fee to the original payment method within five (5) business days.</li>
        </ul>
        <p><strong>7.2 Post-Termination 14-Day Data Export Window:</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Following account cancellation or termination, the Customer is granted a strict window of fourteen (14) calendar days to access the web panel and execute self-service data exports (CSV and PDF compliance logs).</li>
          <li>(b) During this 14-day window, telematics ingestion and mobile app check-ins are suspended; the portal operates in read-only export mode.</li>
        </ul>
        <p><strong>7.3 Irreversible Cryptographic Hard Purge:</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Exactly at 23:59 BST on the fourteenth (14th) calendar day following termination, the system automatically executes a script executing a permanent hard delete across all Customer databases, database backups, uploaded walkaround defect photos, and fuel receipt dockets stored within AWS London (eu-west-2).</li>
          <li>(b) Following this automated event, data recovery is mathematically impossible. Tachyo LTD disclaims all responsibility for Customer records lost due to failure to export compliance logs within the 14-day window prior to statutory DVSA audits.</li>
        </ul>
      </LegalClause>

      <LegalClause id="governing-law" heading="8. Governing law, dispute resolution & jurisdiction">
        <p>
          <strong>8.1 Governing Law:</strong> This Agreement and any dispute or claim arising out
          of or in connection with it or its subject matter or formation (including
          non-contractual disputes or claims) shall be governed by and construed in accordance
          with the laws of England and Wales.
        </p>
        <p>
          <strong>8.2 Mandatory Pre-Litigation Executive Negotiation:</strong> Prior to initiating
          formal court proceedings, senior commercial executives of both parties must engage in
          good-faith negotiations for a period of not less than thirty (30) calendar days
          following electronic delivery of a formal Dispute Notice.
        </p>
        <p>
          <strong>8.3 Exclusive Jurisdiction:</strong> Each party irrevocably agrees that the
          Courts of England and Wales (specifically sitting in Doncaster, Sheffield, or London)
          shall have exclusive jurisdiction to settle any dispute or claim arising out of or in
          connection with this Agreement.
        </p>
      </LegalClause>
    </LegalPortalShell>
  );
}
