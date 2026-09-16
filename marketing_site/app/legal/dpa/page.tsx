import type { Metadata } from "next";
import { LegalPortalShell, LegalClause, UnreviewedDraftNotice, type LegalPortalSection } from "@/components/LegalPortal";

export const metadata: Metadata = {
  title: "Data Processing Addendum",
  description: "Tachyo LTD's Data Processing Addendum (DPA) pursuant to Article 28 of the UK GDPR.",
};

const sections: LegalPortalSection[] = [
  { id: "scope", label: "1. Scope & statutory roles" },
  { id: "obligations", label: "2. Processor obligations" },
  { id: "sub-processors", label: "3. Sub-processors" },
  { id: "indemnity", label: "4. Employment tribunal shield" },
  { id: "dsr", label: "5. Data subject rights" },
  { id: "audit", label: "6. Audit rights" },
  { id: "termination", label: "7. Termination & data purge" },
];

export default function DpaPage() {
  return (
    <LegalPortalShell
      activeSlug="dpa"
      title="Data Processing Addendum"
      updated="16 September 2026"
      sections={sections}
      intro={
        <div className="flex flex-col gap-1">
          <p className="font-mono text-xs font-bold uppercase tracking-wide text-charcoal-light">
            Document Reference: TCH-UK-DPA-2026-V1
          </p>
          <p>Pursuant to Article 28 of the UK General Data Protection Regulation (UK GDPR).</p>
          <p>
            Parties: Tachyo LTD (&quot;Data Processor&quot;) and the Contracting Fleet Operator
            (&quot;Data Controller&quot;).
          </p>
        </div>
      }
    >
      <LegalClause id="scope" heading="1. Scope, subject matter & statutory roles">
        <p>
          <strong>1.1 Regulatory Scope:</strong> This Addendum governs the processing of personal
          data by Tachyo LTD on behalf of the Customer in connection with the provision of the
          Tachyo fleet telematics, compliance, and yield platform pursuant to Article 28(3) of the
          UK GDPR.
        </p>
        <p><strong>1.2 Designation of Roles:</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) The Customer is and shall remain the Data Controller in respect of all fleet operational data, including driver location data, shifts, tachograph advisory calculations, walkaround defect images, and fuel receipts.</li>
          <li>(b) Tachyo LTD is and shall act strictly as the Data Processor acting solely under the documented instructions of the Customer.</li>
        </ul>
        <p><strong>1.3 Details of Processing Activities:</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Subject Matter: Automated ingestion, calculation, display, and storage of commercial vehicle fleet telematics, driver duty timestamps, vehicle roadworthiness logs, and delivery remittance reconciliation.</li>
          <li>(b) Duration: The duration of the Customer&apos;s commercial subscription plus the mandatory 14-day data export and retention window.</li>
          <li>(c) Categories of Data Subjects: Commercial HGV drivers (employed under PAYE, engaged as self-employed subcontractors, or supplied via third-party driver recruitment agencies), Transport Managers, and logistics dispatchers.</li>
          <li>(d) Types of Personal Data: Driver full names, internal identification numbers, mobile GPS coordinates, vehicle registration mark (VRM) linkage, shift hours, photographs of defect walkaround inspections, and fuel pump receipt images.</li>
        </ul>
      </LegalClause>

      <LegalClause id="obligations" heading="2. Processor obligations & documented instructions">
        <p>
          <strong>2.1 Processing Instructions:</strong> Tachyo LTD shall process personal data
          only on documented instructions from the Customer (including via the configuration
          settings and user interactions within the SaaS dashboard), unless required to do so by
          the laws of England and Wales or statutory UK public authority orders.
        </p>
        <p>
          <strong>2.2 Staff Confidentiality:</strong> Tachyo LTD guarantees that all software
          engineers, support specialists, and personnel authorized to access production databases
          have committed themselves to strict statutory obligations of confidentiality.
        </p>
        <p><strong>2.3 Technical & Organizational Measures (Security):</strong> Tachyo LTD shall maintain appropriate technical and organizational measures to ensure a level of security appropriate to the risk, including:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Storage of database records strictly within AWS London (eu-west-2);</li>
          <li>(b) Cryptographic encryption of database storage volumes and backups using Advanced Encryption Standard (AES-256);</li>
          <li>(c) Enforced end-to-end transport layer encryption (TLS 1.3) across all API communications;</li>
          <li>(d) Automated daily database snapshot backups retained in an encrypted state.</li>
        </ul>
      </LegalClause>

      <LegalClause id="sub-processors" heading="3. Sub-processors & infrastructure authorisation">
        <p>
          <strong>3.1 General Written Authorisation:</strong> The Customer hereby grants Tachyo
          LTD general written authorisation to engage the third-party sub-processors specified
          below:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Supabase Inc. — Managed PostgreSQL Database Engine & Authentication (hosted in AWS London, UK);</li>
          <li>(b) Amazon Web Services EMEA SARL — S3 Object Storage for defect images and fuel dockets (AWS London eu-west-2, UK);</li>
          <li>(c) Stripe Payments UK, Ltd. — Subscription payment processing and billing infrastructure (London, UK);</li>
          <li>(d) Twilio Ireland Limited / SendGrid UK — SMS VOR safety alerts and critical two-factor notifications.</li>
        </ul>
        <p>
          <strong>3.2 Sub-Processor Flow-Down:</strong> Tachyo LTD warrants that it imposes
          statutory data protection obligations no less onerous than those set out in this DPA
          upon every sub-processor via formal contract.
        </p>
        <p>
          <strong>3.3 Notification of Sub-Processor Alterations:</strong> Tachyo LTD shall provide
          the Customer with at least thirty (30) calendar days&apos; electronic notice prior to
          appointing any new sub-processor, providing the Customer with the commercial opportunity
          to object on reasonable data protection grounds.
        </p>
      </LegalClause>

      <LegalClause id="indemnity" heading="4. The driver employment tribunal & surveillance shield (total indemnity)">
        <UnreviewedDraftNotice>
          This is the highest-risk clause in the whole portal and needs a solicitor&apos;s eyes
          before it&apos;s relied on. A contractual indemnity between Tachyo and the Customer
          cannot stop a driver bringing their own claim directly against Tachyo, and &quot;full
          indemnity solicitor-and-own-client basis&quot; costs recovery is a specific, technical
          costs-law term that needs to be drafted correctly to actually work.
        </UnreviewedDraftNotice>
        <p><strong>4.1 Customer Warranty on Driver Transparency:</strong> The Customer expressly warrants and covenants that:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Prior to requiring or requesting any driver (whether direct employee, agency driver, or self-employed sub-contractor) to download, log into, or use the Tachyo mobile endpoint, the Customer has provided said driver with a statutory Article 13/14 UK GDPR Employee Privacy Notice;</li>
          <li>(b) The Customer possesses an audited lawful basis under Article 6 of the UK GDPR (such as Legitimate Interests supported by an LIA, or statutory compliance with the Goods Vehicles Act 1995) to conduct GPS tracking and duty-time verification;</li>
          <li>(c) The Customer maintains sole responsibility for complying with the Information Commissioner&apos;s Employment Practices Code regarding electronic monitoring at work.</li>
        </ul>
        <p><strong>4.2 Full Indemnification by Customer:</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            (a) The Customer shall indemnify, defend, and hold harmless Tachyo LTD, its directors, and officers against all liabilities, losses, damages, legal costs (calculated on a full indemnity solicitor-and-own-client basis), fines, and settlements arising from:
            <ul className="list-disc space-y-1.5 pl-5 mt-1.5">
              <li>(i) Any claim, grievance, or Employment Tribunal action brought by a driver alleging unlawful workplace surveillance, constructive dismissal, or infringement of privacy rights under Article 8 of the European Convention on Human Rights (ECHR);</li>
              <li>(ii) Any enforcement action or administrative monetary penalty issued by the Information Commissioner&apos;s Office (ICO) resulting from the Customer&apos;s failure to establish a lawful basis for monitoring its transport workforce.</li>
            </ul>
          </li>
        </ul>
      </LegalClause>

      <LegalClause id="dsr" heading="5. Data subject rights & regulatory assistance">
        <p>
          <strong>5.1 Assistance via In-Product Utilities:</strong> Taking into account the nature
          of the processing, Tachyo LTD shall assist the Customer by appropriate technical
          measures, insofar as this is commercially possible, to respond to drivers exercising
          statutory rights under Chapter III of the UK GDPR (including Subject Access Requests and
          Rectification).
        </p>
        <p>
          <strong>5.2 Driver Request Routing:</strong> Where a driver submits a Subject Access
          Request (SAR) directly to Tachyo LTD, Tachyo shall not disclose any Customer records
          directly, but shall notify the Customer&apos;s designated Transport Manager within three
          (3) business days.
        </p>
        <p>
          <strong>5.3 Exclusion of Unilateral Erasure:</strong> Tachyo LTD shall not alter, redact,
          or erase any historical defect inspections, maintenance confirmations, or duty hours
          records upon direct driver request, recognizing that such records represent statutory
          property of the Customer mandated for retention under the Goods Vehicles (Licensing of
          Operators) Act 1995.
        </p>
      </LegalClause>

      <LegalClause id="audit" heading="6. Audit rights & regulatory inspections">
        <p>
          <strong>6.1 Provision of Compliance Proof:</strong> Tachyo LTD shall make available to
          the Customer all information reasonably necessary to demonstrate compliance with the
          statutory obligations laid down in Article 28 UK GDPR.
        </p>
        <p><strong>6.2 Audit Parameters:</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Any physical or electronic audit by the Customer or its appointed independent auditor shall occur no more than once in any twelve-month period;</li>
          <li>(b) Audits mandate at least thirty (30) business days&apos; prior written notice;</li>
          <li>(c) Audits shall be conducted during normal UK business hours without disrupting operational SaaS infrastructure;</li>
          <li>(d) Audits shall not grant access to proprietary source code, underlying intellectual property, or data belonging to other multi-tenant fleet subscribers.</li>
        </ul>
      </LegalClause>

      <LegalClause id="termination" heading="7. Termination, 14-day export window & irreversible hard purge">
        <p>
          <strong>7.1 Cessation of Processing:</strong> Upon termination or expiration of the
          Customer&apos;s SaaS subscription, Tachyo LTD shall immediately halt all active
          telematics processing, driver check-in ingestions, and OCR parsing.
        </p>
        <p>
          <strong>7.2 Mandatory 14-Day Self-Service Export:</strong> The Customer shall maintain
          self-service access to the read-only reporting portal for exactly fourteen (14) calendar
          days post-termination to export all historical fleet compliance logs, inspection
          dockets, and settlement records in structured .csv format.
        </p>
        <p><strong>7.3 Automated Cryptographic Purge:</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) At 23:59 BST on the fourteenth (14th) calendar day following subscription termination, Tachyo LTD&apos;s automated database routines shall execute an irreversible, cryptographic hard deletion of all Customer personal data across active database tables, object storage buckets (receipts and defect photos), and temporary session logs within AWS London (eu-west-2).</li>
          <li>(b) Backup archives shall be overwritten and eradicated in accordance with standard disaster recovery rotation cycles (not to exceed thirty (30) days).</li>
        </ul>
        <p>
          <strong>7.4 Certification of Destruction:</strong> Upon written request received prior
          to the expiration of the 14-day window, Tachyo LTD shall issue an electronic Certificate
          of Data Destruction confirming compliance with this Clause.
        </p>
      </LegalClause>
    </LegalPortalShell>
  );
}
