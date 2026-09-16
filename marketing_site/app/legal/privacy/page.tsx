import type { Metadata } from "next";
import { LegalPortalShell, LegalClause, type LegalPortalSection } from "@/components/LegalPortal";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Tachyo LTD's statutory privacy notice and data protection declaration under UK GDPR, DPA 2018, and PECR.",
};

const sections: LegalPortalSection[] = [
  { id: "identification", label: "1. Statutory identification" },
  { id: "dual-capacity", label: "2. Controller vs. processor" },
  { id: "taxonomy", label: "3. Data we process" },
  { id: "lawful-bases", label: "4. Lawful bases" },
  { id: "os-boundary", label: "5. Device & GPS boundary" },
  { id: "security", label: "6. Residency & security" },
  { id: "sub-processors", label: "7. Sub-processors" },
  { id: "sar", label: "8. Subject access requests" },
  { id: "automated-processing", label: "9. Automated processing" },
  { id: "breach-management", label: "10. Breach management" },
  { id: "law-enforcement", label: "11. Statutory disclosures" },
];

export default function PrivacyPage() {
  return (
    <LegalPortalShell
      activeSlug="privacy"
      title="Privacy Policy"
      updated="16 September 2026"
      sections={sections}
      intro={
        <div className="flex flex-col gap-1">
          <p className="font-mono text-xs font-bold uppercase tracking-wide text-charcoal-light">
            Document Reference: TCH-UK-PRIV-2026-V1
          </p>
          <p>
            Statutory Framework: UK General Data Protection Regulation (UK GDPR), Data Protection
            Act 2018 (DPA 2018), Privacy and Electronic Communications Regulations (PECR).
          </p>
        </div>
      }
    >
      <LegalClause id="identification" heading="1. Statutory identification & regulatory status">
        <p>
          <strong>1.1 Data Controller & Operator Identity:</strong> This Privacy Policy governs
          the processing of personal data by Tachyo LTD, a private limited company incorporated
          under the laws of England and Wales, registered under Company Number 12356231, with its
          registered office situated at 20 South Street, Doncaster, England, DN4 5FH
          (&quot;Tachyo&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;).
        </p>
        <p>
          <strong>1.2 Supervisory Authority Registration:</strong> Tachyo LTD maintains formal
          notification and registration with the Information Commissioner&apos;s Office (ICO) in
          the United Kingdom as a fee-paying controller and processor under the Data Protection
          (Charges and Information) Regulations 2018.
        </p>
        <p>
          <strong>1.3 Data Protection Officer & Point of Contact:</strong> Inquiries regarding
          statutory data rights, exercise of Articles 15–22 UK GDPR privileges, or regulatory
          requests must be directed to:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Direct Email: privacy@tachyo.co.uk</li>
          <li>Postal Address: Data Protection Officer, Tachyo LTD, 20 South Street, Doncaster, DN4 5FH.</li>
        </ul>
      </LegalClause>

      <LegalClause id="dual-capacity" heading="2. Dual-capacity operating framework (controller vs. processor)">
        <p>
          The legal status of Tachyo LTD fundamentally bifurcates depending on the specific
          category of personal data and the commercial context of collection:
        </p>
        <p>
          <strong>2.1 Tachyo as an Independent Data Controller (Account & Billing Data):</strong>{" "}
          Tachyo LTD acts as an independent Data Controller pursuant to Article 4(7) of the UK
          GDPR with respect to:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Direct customer registration, administrative credentials, corporate contact identities, and Transport Manager authorization records;</li>
          <li>(b) Commercial payment processing tokens, invoicing records, VAT registrations, and transaction audit trails;</li>
          <li>(c) Direct customer support transcripts, platform usage diagnostics, telemetry crash reports, and system telemetry logs;</li>
          <li>(d) Marketing communications governed strictly by PECR and opted-in commercial correspondence.</li>
        </ul>
        <p>
          <strong>2.2 Tachyo as a Data Processor (Customer Fleet & Telematics Operations):</strong>{" "}
          Tachyo LTD acts strictly as a Data Processor pursuant to Article 4(8) of the UK GDPR on
          behalf of the commercial Customer (the Haulier, Logistics Operator, or Carrier) who acts
          as the primary Data Controller with respect to:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Driver mobile application telematics, including real-time GPS coordinates, route histories, and speed pings;</li>
          <li>(b) Driver shift timestamps, continuous driving counters, tachograph advisory calculations, and Working Time Directive (WTD) intervals;</li>
          <li>(c) Driver photographic defect submissions (walkaround checks), uploaded fuel receipts, pump receipts, and vehicle registration linkage;</li>
          <li>(d) Subcontractor, agency worker, or PAYE driver payroll rate attributions and route yields.</li>
        </ul>
        <p>
          <strong>2.3 Absence of Direct Driver Employment Nexus:</strong> Tachyo LTD maintains no
          direct contractual, employment, or agency nexus with individual drivers operating mobile
          telematics endpoints. The commercial Customer warrants that it maintains lawful basis
          under Article 6 of the UK GDPR to instruct Tachyo LTD to process driver personal data.
        </p>
      </LegalClause>

      <LegalClause id="taxonomy" heading="3. Exhaustive taxonomy of processed data">
        <p>
          Tachyo LTD collects and processes distinct categories of electronic, visual, and spatial
          information across the web platform and native driver mobile interfaces:
        </p>
        <p><strong>3.1 Account & Identity Records:</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Full legal name, corporate trade name, job title, and transport role (e.g., Operator Licence Holder, Transport Manager, Traffic Dispatcher, Driver);</li>
          <li>(b) Business contact details, including corporate physical address, dispatch depot postcodes, business email address, and mobile dispatch telephone numbers;</li>
          <li>(c) Encrypted password hashes, session cookies, multi-factor authentication (MFA) tokens, and IP audit trails.</li>
        </ul>
        <p><strong>3.2 Real-Time Spatial & Device Telematics (GPS & Hardware Data):</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) High-frequency Global Navigation Satellite System (GNSS/GPS) coordinates, including latitude, longitude, altitude, horizontal accuracy tolerances, and bearing;</li>
          <li>(b) Telematics vector calculations, including calculated road speeds (mph), acceleration curves, idling stationary states, and depot geofence entry/exit pings;</li>
          <li>(c) Mobile hardware diagnostics: hardware model (e.g., iPhone 15, Samsung Galaxy), operating system version, mobile network operator, battery level percentage, and location permission state (Always, While Using, Denied).</li>
        </ul>
        <p><strong>3.3 Compliance & Working Hours Telemetry:</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Shift start, pause, rest, and termination timestamps recorded via manual driver touch-event or telemetry shift triggers;</li>
          <li>(b) Segmented calculation arrays: continuous driving duration (EC 561/2006 4.5-hour counter), cumulative rest periods, 6.0-hour WTD continuous duty counters, and daily shift span (13h/15h spreadover tracking);</li>
          <li>(c) Assigned tractor unit registrations (VRM), trailer identification plates, and digital coupling events.</li>
        </ul>
        <p><strong>3.4 Visual Evidence, Image Metadata & OCR Extraction:</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Photographic walkaround defect captures submitted via device camera (e.g., cracked lenses, tyre bulges, bodywork damage);</li>
          <li>(b) Exchangeable Image File Format (EXIF) metadata embedded within uploaded images, including hardware camera specs, timestamps, and embedded GPS location stamps at the moment of photo capture;</li>
          <li>(c) Commercial fuel and lubricant purchase receipts uploaded for expense tracking;</li>
          <li>(d) Optical Character Recognition (OCR) raw text vectors extracted from fuel pump dockets, including date, fuel volume (litres), total financial value (£ GBP), and vendor VAT registration numbers.</li>
        </ul>
      </LegalClause>

      <LegalClause id="lawful-bases" heading="4. Statutory lawful bases for data processing (Article 6 UK GDPR)">
        <p>
          Under Section 8 of the Data Protection Act 2018 and Article 6(1) of the UK GDPR, Tachyo
          LTD relies on distinct legal bases to justify the capture and retention of data across
          its services:
        </p>
        <p><strong>4.1 Performance of Commercial Contract (Article 6(1)(b) UK GDPR):</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Provision of the Tachyo Software-as-a-Service (SaaS) web panel, maintenance of active enterprise tenants, and administrative user identity management;</li>
          <li>(b) Real-time routing of mobile check-in telemetry from driver field units to authorized operator dispatch cockpits;</li>
          <li>(c) Calculation of delivery yields, load matching against carrier CSV/XLSX manifests, and generation of driver gross margin tables.</li>
        </ul>
        <p><strong>4.2 Compliance with Statutory & Regulatory Obligations (Article 6(1)(c) UK GDPR):</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Processing transaction ledgers, VAT documentation, and billing manifests pursuant to the Value Added Tax Act 1994 and UK corporate taxation accounting mandates;</li>
          <li>(b) Providing auditable roadworthiness logs, roller brake test records, and defect rectifications necessary for the Customer to discharge duties under the Goods Vehicles (Licensing of Operators) Act 1995 and Driver and Vehicle Standards Agency (DVSA) statutory maintenance guidelines;</li>
          <li>(c) Facilitating compliance with tachograph and driving hours verification pursuant to Retained Regulation (EC) 561/2006 and the Road Transport (Working Time) Regulations 2005.</li>
        </ul>
        <p><strong>4.3 Legitimate Commercial Interests (Article 6(1)(f) UK GDPR):</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Algorithmic heuristics applied to raw defect inputs to prioritize workshop triage (e.g., immediate Vehicle Off Road [VOR] grounding notices);</li>
          <li>(b) Security monitoring, network penetration prevention, denial-of-service mitigation, and IP abuse prevention;</li>
          <li>(c) Aggregated, fully anonymized statistical analysis of component failure rates across HGV classes to improve predictive maintenance algorithms (with all vehicle registrations and corporate identifiers scrubbed).</li>
        </ul>
        <p><strong>4.4 Operator&apos;s Lawful Basis for Employee / Subcontractor Telematics:</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Tachyo LTD does not rely on individual worker &quot;Consent&quot; (Article 6(1)(a)) due to the systemic imbalance of power inherent in employment and agency relationships, as recognized by the Information Commissioner&apos;s Office (ICO);</li>
          <li>(b) The Customer warrants that its telematics surveillance is justified under its own Legitimate Interests Assessment (LIA), statutory transport compliance obligations, or formal workforce Data Protection Impact Assessment (DPIA) prior to provisioning the Tachyo Driver application to any driver.</li>
        </ul>
      </LegalClause>

      <LegalClause id="os-boundary" heading="5. Device hardware, GPS telematics & operating system boundary">
        <p>
          This section sets out the explicit operational boundary between the Tachyo mobile
          software layer and the underlying mobile device hardware (Apple iOS and Google Android).
        </p>
        <p><strong>5.1 Device Permissions Architecture:</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Fine Location Services (GNSS/GPS): the mobile application requires permission to access high-accuracy GPS coordinates (<code>ACCESS_FINE_LOCATION</code> on Android; <code>kCLAuthorizationStatusAuthorizedAlways</code> or <code>kCLAuthorizationStatusAuthorizedWhenInUse</code> on iOS).</li>
          <li>(b) Foreground & Background Tracking: continuous route calculations and geofence pings require background execution capability to prevent data loss while navigation software or camera apps run concurrently.</li>
        </ul>
        <p><strong>5.2 Operational Tracking Scope & Hardware Dissociation:</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Active Duty Binding: Tachyo&apos;s software engine is programmatically instructed to process and record GPS telemetry vectors exclusively during an active duty shift (from the moment a driver confirms &quot;Start Shift&quot; or &quot;Asset Check-In&quot; until the driver executes &quot;End Shift&quot;).</li>
          <li>(b) Hardware Level Persistence: the Customer and the Driver acknowledge that modern mobile operating systems control low-level location chipsets independently. While the Tachyo application halts the recording, processing, and database storage of geographic coordinates upon &quot;End Shift&quot;, complete hardware-level decoupling requires the device user to toggle off location permissions in device system settings.</li>
          <li>(c) Strict Exclusion of Post-Shift Processing: Tachyo LTD covenants that it does not inspect, process, log, monetize, or provide to the Transport Manager any geographic location data received outside an active shift state. Any raw location packets pinged while a shift is inactive are dropped at the edge gateway without persistence.</li>
        </ul>
        <p><strong>5.3 Camera & Local Media Storage Boundaries:</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Device camera permissions are accessed strictly upon deliberate user initiation to capture visual proof of physical vehicle defects or fuel purchase dockets;</li>
          <li>(b) The application does not maintain persistent background access to the camera hardware or unrelated photo library assets outside the designated capture container.</li>
        </ul>
      </LegalClause>

      <LegalClause id="security" heading="6. Data residency, security & storage architecture">
        <p><strong>6.1 Territorial Data Residency (United Kingdom):</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) All primary databases, transaction logs, telematics records, and uploaded image files are hosted exclusively within the United Kingdom;</li>
          <li>(b) Physical infrastructure is provisioned through Supabase Inc. utilizing Amazon Web Services (AWS) in the London Region (eu-west-2);</li>
          <li>(c) Tachyo LTD guarantees that zero Customer personal data, driver location coordinates, or compliance dockets are transferred outside the territorial boundaries of the United Kingdom, eliminating cross-border transfer mechanisms under Chapter V of the UK GDPR.</li>
        </ul>
        <p><strong>6.2 Cryptographic & Technical Safeguards:</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Data in Transit: all communications between client browsers, native driver mobile endpoints, and the API gateway are encrypted using Transport Layer Security (TLS 1.3), enforcing HTTP Strict Transport Security (HSTS);</li>
          <li>(b) Data at Rest: database storage volumes, database backups, and media buckets are secured using Advanced Encryption Standard (AES-256);</li>
          <li>(c) Access Governance: production database access is governed by strict Role-Based Access Control (RBAC), multi-factor hardware security keys (FIDO2), and automated audit trails.</li>
        </ul>
        <p><strong>6.3 Data Minimization & Retention Schedules:</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Fleet Safety Inspections & VOR Records: retained for fifteen (15) months in accordance with DVSA statutory guide to maintaining roadworthiness;</li>
          <li>(b) Driver Working Time & Duty Counters: retained for twenty-four (24) months to fulfill statutory inspection criteria under the Road Transport (Working Time) Regulations 2005;</li>
          <li>(c) Financial & Billing Manifests: retained for six (6) full financial years plus the current operating year pursuant to Section 388 of the Companies Act 2006 and HMRC requirements;</li>
          <li>(d) Raw GPS Coordinate Breadcrumbs: pruned or consolidated into generalized route vectors after ninety (90) days, unless an open insurance claim or active accident report mandates preservation.</li>
        </ul>
      </LegalClause>

      <LegalClause id="sub-processors" heading="7. Authorized third-party sub-processors & infrastructure partners">
        <p>
          Tachyo LTD maintains formal Data Processing Agreements containing statutory Article 28
          UK GDPR commitments with all downstream service providers:
        </p>
        <p><strong>7.1 Supabase Inc. (Database & Authentication Engine):</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Function: Database hosting, edge compute, and user identity management.</li>
          <li>Location: Dedicated infrastructure deployed in AWS London (eu-west-2), UK.</li>
        </ul>
        <p><strong>7.2 Machine-Vision OCR Processing Engine:</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Function: Parsing numerical text from fuel receipt images.</li>
          <li>Security Commitment: Image streams processed ephemerally within the AWS London perimeter without permanent retention of raw imagery outside Tachyo&apos;s encrypted storage.</li>
        </ul>
      </LegalClause>

      <LegalClause id="sar" heading="8. Data subject rights, inquiries & subject access requests (SARs)">
        <p>
          Under Chapter III of the UK GDPR and the Data Protection Act 2018, individuals possess
          statutory entitlements regarding their personal data. The operational mechanics for
          executing these rights depend strictly on whether Tachyo LTD acts as an independent
          Controller or as a technical Processor.
        </p>
        <p><strong>8.1 Scope of Statutory Rights:</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Right of Access (Article 15 UK GDPR): The entitlement to obtain formal confirmation as to whether personal data is being processed and receive a structured copy of all associated records.</li>
          <li>(b) Right to Rectification (Article 16 UK GDPR): The entitlement to mandate the correction of inaccurate personal data or completion of incomplete operational records.</li>
          <li>(c) Right to Erasure / &quot;Right to be Forgotten&quot; (Article 17 UK GDPR): The right to request the irreversible deletion of personal data, subject to the statutory retention exclusions detailed in Clause 8.4.</li>
          <li>(d) Right to Restriction of Processing (Article 18 UK GDPR): The right to freeze the active processing of records during ongoing disputes regarding accuracy or lawful basis.</li>
          <li>(e) Right to Data Portability (Article 20 UK GDPR): The entitlement to receive personal data in a structured, commonly used, and machine-readable format (e.g., CSV, JSON).</li>
          <li>(f) Right to Object (Article 21 UK GDPR): The entitlement to challenge data processing predicated upon Legitimate Interests under Article 6(1)(f).</li>
        </ul>
        <p><strong>8.2 Processing Subject Access Requests for Direct Account Data (Tachyo as Controller):</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Transport Managers, enterprise account holders, and administrative personnel exercising rights over billing, account credentials, or corporate communications must submit a formal request via email to privacy@tachyo.co.uk.</li>
          <li>(b) Tachyo LTD shall confirm receipt within five (5) business days and complete identity verification using multi-factor cryptographic credentials.</li>
          <li>(c) Compliant disclosures shall be executed without undue delay and at the latest within one (1) calendar month of receipt, extensible by two (2) further months for complex enterprise queries in accordance with Article 12(3) UK GDPR.</li>
        </ul>
        <p><strong>8.3 Protocol for Employed, Subcontracted, and Agency Drivers (Tachyo as Processor):</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Where a commercial driver (whether employed via PAYE, engaged as an independent subcontractor, or supplied via an employment agency) submits a SAR directly to Tachyo LTD concerning telematics, GPS traces, fuel receipts, or shift logs, Tachyo LTD acts strictly as a Data Processor.</li>
          <li>(b) Tachyo LTD possesses neither the lawful authority nor the independent legal entitlement to alter, disclose, or delete Customer-controlled operational records without express written authorization from the primary Data Controller (the Haulier / Transport Operator).</li>
          <li>(c) Routing SLA: Tachyo LTD covenants to notify and forward any driver-originated SAR or inquiry to the designated Transport Manager of the relevant Customer within three (3) business days of electronic receipt.</li>
          <li>(d) Tachyo LTD shall provide technical tooling enabling the Customer to extract, export, or redact driver records to fulfill statutory deadlines, but legal accountability for timely response rests exclusively with the Customer.</li>
        </ul>
        <p><strong>8.4 Statutory Precedence Over Erasure Requests (Legal & Regulatory Overrides):</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) The Right to Erasure under Article 17 is expressly curtailed where continued retention is necessary for compliance with a legal obligation or the establishment, exercise, or defence of legal claims pursuant to Article 17(3)(b) and (e) UK GDPR.</li>
          <li>
            (b) Requests by drivers to purge shift timestamps, telematics traces, or defect audit logs shall be refused to the extent that such records are mandated for preservation by:
            <ul className="list-disc space-y-1.5 pl-5 mt-1.5">
              <li>(i) The Goods Vehicles (Licensing of Operators) Act 1995 (15-month roadworthiness inspection preservation);</li>
              <li>(ii) The Road Transport (Working Time) Regulations 2005 (24-month working time enforcement);</li>
              <li>(iii) The Limitation Act 1980 (statutory 6-year period for commercial contract and tortious negligence claims).</li>
            </ul>
          </li>
        </ul>
      </LegalClause>

      <LegalClause id="automated-processing" heading="9. Automated processing, algorithmic heuristics & profiling (Article 22 UK GDPR)">
        <p>
          This section formally defines the mathematical and heuristic nature of the Tachyo
          platform to disclaim the existence of solely automated legal decision-making.
        </p>
        <p><strong>9.1 Absence of Solely Automated Determinations:</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Tachyo LTD does not execute automated decision-making processes that produce legal effects concerning individuals or similarly significantly affect them within the statutory definition of Article 22(1) UK GDPR.</li>
          <li>(b) The software does not automatically levy disciplinary sanctions, adjust contractual remuneration rates, or terminate driver access tokens without human intervention.</li>
        </ul>
        <p><strong>9.2 Algorithmic Triage & Heuristic UI Indicators:</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            (a) The platform applies deterministic algorithms to raw input data to generate advisory visualizations, specifically utilizing:
            <ul className="list-disc space-y-1.5 pl-5 mt-1.5">
              <li>(i) Red (#CC0000) for &quot;Critical VOR&quot; states where an unresolved major defect or an overdue inspection (≤ 0 days) is detected;</li>
              <li>(ii) Amber (#F59E0B) for &quot;Action Required / Due Soon&quot; states within user-configured threshold envelopes;</li>
              <li>(iii) Emerald (#10B981) for &quot;Compliant&quot; states where operational tolerances remain within configured parameters.</li>
            </ul>
          </li>
          <li>(b) These heuristic classifications represent computational summaries of stored database records and do not constitute autonomous expert determinations.</li>
        </ul>
        <p><strong>9.3 Mandatory &quot;Human-in-the-Loop&quot; Operational Architecture:</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Any operational action that impacts vehicle roadworthiness, legal compliance, or driver duty status mandates an affirmative manual action by a qualified human operator (e.g., driver walkaround verification, Transport Manager sign-off, or certified workshop clearance).</li>
          <li>(b) The customer acknowledges that Tachyo&apos;s algorithms function as operational decision-support software and that sole professional accountability for vehicle release rests with the Operator Licence holder.</li>
        </ul>
        <p><strong>9.4 Margin, Yield & Performance Calculations:</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Calculations displayed within profitability and driver yield dashboards (e.g., gross margin percentages, hourly revenue yield, fuel efficiency indicators) are arithmetic aggregations derived from uploaded carrier manifests, shift timestamps, and approved fuel receipts.</li>
          <li>(b) Such calculations serve analytical operational purposes only and must be independently audited by the Customer before implementation in payroll systems or statutory tax filings.</li>
        </ul>
      </LegalClause>

      <LegalClause id="breach-management" heading="10. Personal data breach management & incident notification">
        <p>
          Tachyo LTD maintains rigorous incident response protocols aligned with the Data
          Protection Act 2018 and National Cyber Security Centre (NCSC) guidance.
        </p>
        <p>
          <strong>10.1 Definition of a Security Incident:</strong> A personal data breach
          constitutes any confirmed breach of security leading to the accidental or unlawful
          destruction, loss, alteration, unauthorized disclosure of, or access to, personal data
          transmitted, stored, or otherwise processed within the AWS London infrastructure.
        </p>
        <p><strong>10.2 Processor-to-Controller Notification Protocols (Article 33(2) UK GDPR):</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Upon confirming a personal data breach affecting Customer fleet, telematics, or driver data, Tachyo LTD shall notify the primary account administrator and designated Transport Manager without undue delay, and in any event within forty-eight (48) hours of formal confirmation.</li>
          <li>
            (b) The notification shall detail:
            <ul className="list-disc space-y-1.5 pl-5 mt-1.5">
              <li>(i) The nature and technical vector of the personal data breach;</li>
              <li>(ii) The approximate categories and volume of data subjects and telematics records implicated;</li>
              <li>(iii) The identity and contact coordinates of the Data Protection Officer;</li>
              <li>(iv) Immediate mitigation measures implemented to contain the security incident;</li>
              <li>(v) Recommended containment actions for the Customer.</li>
            </ul>
          </li>
        </ul>
        <p>
          <strong>10.3 Direct Supervisory Reporting (Tachyo as Controller — Article 33(1) UK GDPR):</strong>{" "}
          Where a confirmed breach occurs concerning data for which Tachyo LTD acts as an
          independent Controller (e.g., administrative account credentials, billing tokens,
          corporate identity data), Tachyo LTD shall formally notify the Information
          Commissioner&apos;s Office (ICO) within seventy-two (72) hours of becoming aware of the
          event, unless the breach is assessed as unlikely to result in a risk to the rights and
          freedoms of natural persons.
        </p>
        <p>
          <strong>10.4 Forensic Preservation & Remediation Commitments:</strong> Tachyo LTD shall
          preserve all relevant network audit trails, server access logs, and edge firewall
          records within its AWS London perimeter for forensic analysis and provide reasonable
          technical assistance to Customers in discharging their notification obligations under
          Article 34 UK GDPR.
        </p>
      </LegalClause>

      <LegalClause id="law-enforcement" heading="11. Statutory disclosures, law enforcement & regulatory cooperation">
        <p><strong>11.1 Subpoenas, Court Warrants & Judicial Orders:</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Tachyo LTD shall not disclose personal data to third parties except where compelled to do so by a valid order issued by a court of competent jurisdiction within England and Wales (including the High Court, Crown Court, or County Court).</li>
          <li>(b) Prior to executing any judicial disclosure, Tachyo LTD shall review the legal validity of the warrant with external legal counsel and, where legally permissible, provide prompt written notification to the affected Customer to enable them to seek protective relief.</li>
        </ul>
        <p><strong>11.2 Regulatory Oversight (DVSA & Traffic Commissioners):</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) The Customer acknowledges that records stored within the Tachyo platform concerning vehicle maintenance, defect rectification, and driver hours may be subject to inspection by the Driver and Vehicle Standards Agency (DVSA) or formal request by a Traffic Commissioner for Great Britain under the Goods Vehicles (Licensing of Operators) Act 1995.</li>
          <li>(b) Tachyo LTD provides self-service export utilities to enable Customers to produce required compliance packs during statutory audits or Public Inquiries (PI).</li>
        </ul>
        <p><strong>11.3 Police Investigations & Road Traffic Incident Inquiries:</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            (a) Under Schedule 2, Part 1, Paragraph 2 of the Data Protection Act 2018, Tachyo LTD may process and disclose specific telematics records (e.g., historical GPS breadcrumbs, speed vectors, or shift logs) to Police forces in England, Wales, or Police Scotland where:
            <ul className="list-disc space-y-1.5 pl-5 mt-1.5">
              <li>(i) The request is formally submitted via an official Section 29 / Schedule 2 Data Protection Request Form signed by an authorized Police Officer;</li>
              <li>(ii) The disclosure is strictly necessary for the prevention or detection of crime, or the apprehension or prosecution of offenders (e.g., investigation of fatal or serious road collisions under the Road Traffic Act 1988).</li>
            </ul>
          </li>
        </ul>
      </LegalClause>
    </LegalPortalShell>
  );
}
