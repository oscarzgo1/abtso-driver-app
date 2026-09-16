import 'package:flutter/material.dart';

/// The distinct legal documents available in the app. Each one gets its
/// own dedicated entry point (a button in Settings → Legal & Compliance)
/// and its own self-contained screen — a user reading one document never
/// silently scrolls into a different one.
///
/// Full statutory/contractual text supplied directly by the business —
/// kept verbatim, in sync with marketing_site's /legal/* pages and
/// admin_dashboard's login-page legal modal. `appTermsOfUse` is now the
/// full B2B Master SaaS Agreement (the Customer/Operator-facing
/// contract) rather than a separate driver-only document — a driver
/// reading it here sees the same Master Agreement text a Transport
/// Manager would see in the admin dashboard.
enum LegalDocument { privacyNotice, appTermsOfUse, telematicsPolicy, dpa }

extension LegalDocumentLabel on LegalDocument {
  /// Short label used on the Settings button and in the AppBar.
  String get label => switch (this) {
        LegalDocument.privacyNotice => 'Privacy Policy',
        LegalDocument.appTermsOfUse => 'App Terms of Use',
        LegalDocument.telematicsPolicy => 'Telematics & GPS Policy',
        LegalDocument.dpa => 'Data Processing Addendum',
      };

  IconData get icon => switch (this) {
        LegalDocument.privacyNotice => Icons.privacy_tip_outlined,
        LegalDocument.appTermsOfUse => Icons.description_outlined,
        LegalDocument.telematicsPolicy => Icons.gps_fixed_outlined,
        LegalDocument.dpa => Icons.gavel_outlined,
      };
}

/// One page belonging to a single [document]. To add a page to an
/// existing document, insert a [PolicyPage] among the others that share
/// its [document] value — order is preserved. To add a whole new
/// document: add a case to [LegalDocument] above, give it a label/icon,
/// add its pages here, and add one button for it in Settings → Legal &
/// Compliance (main_layout.dart). Nothing else needs to change.
class PolicyPage {
  final LegalDocument document;
  final String title;
  final String body;

  const PolicyPage({required this.document, required this.title, required this.body});
}

/// Tachyo driver-facing legal documents. Public — the login screen's
/// consolidated vertical-scroll review (legal_review_screen.dart) reuses
/// this exact same real text rather than duplicating it.
const List<PolicyPage> policyPages = [
  // ── Driver Privacy Notice ── (TACHYO LTD — Statutory Privacy Notice &
  // Data Protection Declaration, TCH-UK-PRIV-2026-V1 — full text, same
  // as marketing_site's /legal/privacy and admin_dashboard's login-page
  // legal modal. Kept in sync manually — update all three when the
  // policy changes.)
  PolicyPage(
    document: LegalDocument.privacyNotice,
    title: 'Statutory Identification',
    body: '''TACHYO LTD — STATUTORY PRIVACY NOTICE & DATA PROTECTION DECLARATION
Document Reference: TCH-UK-PRIV-2026-V1
Statutory Framework: UK General Data Protection Regulation (UK GDPR), Data Protection Act 2018 (DPA 2018), Privacy and Electronic Communications Regulations (PECR).

1. STATUTORY IDENTIFICATION & REGULATORY STATUS

1.1 Data Controller & Operator Identity: This Privacy Policy governs the processing of personal data by Tachyo LTD, a private limited company incorporated under the laws of England and Wales, registered under Company Number 12356231, with its registered office situated at 20 South Street, Doncaster, England, DN4 5FH ("Tachyo", "we", "us", or "our").

1.2 Supervisory Authority Registration: Tachyo LTD maintains formal notification and registration with the Information Commissioner's Office (ICO) in the United Kingdom as a fee-paying controller and processor under the Data Protection (Charges and Information) Regulations 2018.

1.3 Data Protection Officer & Point of Contact: Inquiries regarding statutory data rights, exercise of Articles 15–22 UK GDPR privileges, or regulatory requests must be directed to:
• Direct Email: privacy@tachyo.co.uk
• Postal Address: Data Protection Officer, Tachyo LTD, 20 South Street, Doncaster, DN4 5FH.''',
  ),
  PolicyPage(
    document: LegalDocument.privacyNotice,
    title: 'Controller vs. Processor',
    body: '''2. DUAL-CAPACITY OPERATING FRAMEWORK (CONTROLLER VS. PROCESSOR)

The legal status of Tachyo LTD fundamentally bifurcates depending on the specific category of personal data and the commercial context of collection:

2.1 Tachyo as an Independent Data Controller (Account & Billing Data): Tachyo LTD acts as an independent Data Controller pursuant to Article 4(7) of the UK GDPR with respect to:
(a) Direct customer registration, administrative credentials, corporate contact identities, and Transport Manager authorization records;
(b) Commercial payment processing tokens, invoicing records, VAT registrations, and transaction audit trails;
(c) Direct customer support transcripts, platform usage diagnostics, telemetry crash reports, and system telemetry logs;
(d) Marketing communications governed strictly by PECR and opted-in commercial correspondence.

2.2 Tachyo as a Data Processor (Customer Fleet & Telematics Operations): Tachyo LTD acts strictly as a Data Processor pursuant to Article 4(8) of the UK GDPR on behalf of the commercial Customer (the Haulier, Logistics Operator, or Carrier) who acts as the primary Data Controller with respect to:
(a) Driver mobile application telematics, including real-time GPS coordinates, route histories, and speed pings;
(b) Driver shift timestamps, continuous driving counters, tachograph advisory calculations, and Working Time Directive (WTD) intervals;
(c) Driver photographic defect submissions (walkaround checks), uploaded fuel receipts, pump receipts, and vehicle registration linkage;
(d) Subcontractor, agency worker, or PAYE driver payroll rate attributions and route yields.

2.3 Absence of Direct Driver Employment Nexus: Tachyo LTD maintains no direct contractual, employment, or agency nexus with individual drivers operating mobile telematics endpoints. The commercial Customer warrants that it maintains lawful basis under Article 6 of the UK GDPR to instruct Tachyo LTD to process driver personal data.''',
  ),
  PolicyPage(
    document: LegalDocument.privacyNotice,
    title: 'Data We Process',
    body: '''3. EXHAUSTIVE TAXONOMY OF PROCESSED DATA

Tachyo LTD collects and processes distinct categories of electronic, visual, and spatial information across the web platform and native driver mobile interfaces:

3.1 Account & Identity Records:
(a) Full legal name, corporate trade name, job title, and transport role (e.g., Operator Licence Holder, Transport Manager, Traffic Dispatcher, Driver);
(b) Business contact details, including corporate physical address, dispatch depot postcodes, business email address, and mobile dispatch telephone numbers;
(c) Encrypted password hashes, session cookies, multi-factor authentication (MFA) tokens, and IP audit trails.

3.2 Real-Time Spatial & Device Telematics (GPS & Hardware Data):
(a) High-frequency Global Navigation Satellite System (GNSS/GPS) coordinates, including latitude, longitude, altitude, horizontal accuracy tolerances, and bearing;
(b) Telematics vector calculations, including calculated road speeds (mph), acceleration curves, idling stationary states, and depot geofence entry/exit pings;
(c) Mobile hardware diagnostics: hardware model (e.g., iPhone 15, Samsung Galaxy), operating system version, mobile network operator, battery level percentage, and location permission state (Always, While Using, Denied).

3.3 Compliance & Working Hours Telemetry:
(a) Shift start, pause, rest, and termination timestamps recorded via manual driver touch-event or telemetry shift triggers;
(b) Segmented calculation arrays: continuous driving duration (EC 561/2006 4.5-hour counter), cumulative rest periods, 6.0-hour WTD continuous duty counters, and daily shift span (13h/15h spreadover tracking);
(c) Assigned tractor unit registrations (VRM), trailer identification plates, and digital coupling events.

3.4 Visual Evidence, Image Metadata & OCR Extraction:
(a) Photographic walkaround defect captures submitted via device camera (e.g., cracked lenses, tyre bulges, bodywork damage);
(b) Exchangeable Image File Format (EXIF) metadata embedded within uploaded images, including hardware camera specs, timestamps, and embedded GPS location stamps at the moment of photo capture;
(c) Commercial fuel and lubricant purchase receipts uploaded for expense tracking;
(d) Optical Character Recognition (OCR) raw text vectors extracted from fuel pump dockets, including date, fuel volume (litres), total financial value (£ GBP), and vendor VAT registration numbers.''',
  ),
  PolicyPage(
    document: LegalDocument.privacyNotice,
    title: 'Lawful Bases',
    body: '''4. STATUTORY LAWFUL BASES FOR DATA PROCESSING (ARTICLE 6 UK GDPR)

Under Section 8 of the Data Protection Act 2018 and Article 6(1) of the UK GDPR, Tachyo LTD relies on distinct legal bases to justify the capture and retention of data across its services:

4.1 Performance of Commercial Contract (Article 6(1)(b) UK GDPR):
(a) Provision of the Tachyo Software-as-a-Service (SaaS) web panel, maintenance of active enterprise tenants, and administrative user identity management;
(b) Real-time routing of mobile check-in telemetry from driver field units to authorized operator dispatch cockpits;
(c) Calculation of delivery yields, load matching against carrier CSV/XLSX manifests, and generation of driver gross margin tables.

4.2 Compliance with Statutory & Regulatory Obligations (Article 6(1)(c) UK GDPR):
(a) Processing transaction ledgers, VAT documentation, and billing manifests pursuant to the Value Added Tax Act 1994 and UK corporate taxation accounting mandates;
(b) Providing auditable roadworthiness logs, roller brake test records, and defect rectifications necessary for the Customer to discharge duties under the Goods Vehicles (Licensing of Operators) Act 1995 and Driver and Vehicle Standards Agency (DVSA) statutory maintenance guidelines;
(c) Facilitating compliance with tachograph and driving hours verification pursuant to Retained Regulation (EC) 561/2006 and the Road Transport (Working Time) Regulations 2005.

4.3 Legitimate Commercial Interests (Article 6(1)(f) UK GDPR):
(a) Algorithmic heuristics applied to raw defect inputs to prioritize workshop triage (e.g., immediate Vehicle Off Road [VOR] grounding notices);
(b) Security monitoring, network penetration prevention, denial-of-service mitigation, and IP abuse prevention;
(c) Aggregated, fully anonymized statistical analysis of component failure rates across HGV classes to improve predictive maintenance algorithms (with all vehicle registrations and corporate identifiers scrubbed).

4.4 Operator's Lawful Basis for Employee / Subcontractor Telematics:
(a) Tachyo LTD does not rely on individual worker "Consent" (Article 6(1)(a)) due to the systemic imbalance of power inherent in employment and agency relationships, as recognized by the Information Commissioner's Office (ICO);
(b) The Customer warrants that its telematics surveillance is justified under its own Legitimate Interests Assessment (LIA), statutory transport compliance obligations, or formal workforce Data Protection Impact Assessment (DPIA) prior to provisioning the Tachyo Driver application to any driver.''',
  ),
  PolicyPage(
    document: LegalDocument.privacyNotice,
    title: 'GPS & Device Boundary',
    body: '''5. DEVICE HARDWARE, GPS TELEMATICS & OPERATING SYSTEM BOUNDARY

This section sets out the explicit operational boundary between the Tachyo mobile software layer and the underlying mobile device hardware (Apple iOS and Google Android).

5.1 Device Permissions Architecture:
(a) Fine Location Services (GNSS/GPS): The mobile application requires permission to access high-accuracy GPS coordinates (ACCESS_FINE_LOCATION on Android; kCLAuthorizationStatusAuthorizedAlways or kCLAuthorizationStatusAuthorizedWhenInUse on iOS).
(b) Foreground & Background Tracking: Continuous route calculations and geofence pings require background execution capability to prevent data loss while navigation software or camera apps run concurrently.

5.2 Operational Tracking Scope & Hardware Dissociation:
(a) Active Duty Binding: Tachyo's software engine is programmatically instructed to process and record GPS telemetry vectors exclusively during an active duty shift (from the moment a driver confirms "Start Shift" or "Asset Check-In" until the driver executes "End Shift").
(b) Hardware Level Persistence: The Customer and the Driver acknowledge that modern mobile operating systems control low-level location chipsets independently. While the Tachyo application halts the recording, processing, and database storage of geographic coordinates upon "End Shift", complete hardware-level decoupling requires the device user to toggle off location permissions in device system settings.
(c) Strict Exclusion of Post-Shift Processing: Tachyo LTD covenants that it does not inspect, process, log, monetize, or provide to the Transport Manager any geographic location data received outside an active shift state. Any raw location packets pinged while a shift is inactive are dropped at the edge gateway without persistence.

5.3 Camera & Local Media Storage Boundaries:
(a) Device camera permissions are accessed strictly upon deliberate user initiation to capture visual proof of physical vehicle defects or fuel purchase dockets;
(b) The application does not maintain persistent background access to the camera hardware or unrelated photo library assets outside the designated capture container.''',
  ),
  PolicyPage(
    document: LegalDocument.privacyNotice,
    title: 'Residency & Security',
    body: '''6. DATA RESIDENCY, SECURITY & STORAGE ARCHITECTURE

6.1 Territorial Data Residency (United Kingdom):
(a) All primary databases, transaction logs, telematics records, and uploaded image files are hosted exclusively within the United Kingdom;
(b) Physical infrastructure is provisioned through Supabase Inc. utilizing Amazon Web Services (AWS) in the London Region (eu-west-2);
(c) Tachyo LTD guarantees that zero Customer personal data, driver location coordinates, or compliance dockets are transferred outside the territorial boundaries of the United Kingdom, eliminating cross-border transfer mechanisms under Chapter V of the UK GDPR.

6.2 Cryptographic & Technical Safeguards:
(a) Data in Transit: All communications between client browsers, native driver mobile endpoints, and the API gateway are encrypted using Transport Layer Security (TLS 1.3), enforcing HTTP Strict Transport Security (HSTS);
(b) Data at Rest: Database storage volumes, database backups, and media buckets are secured using Advanced Encryption Standard (AES-256);
(c) Access Governance: Production database access is governed by strict Role-Based Access Control (RBAC), multi-factor hardware security keys (FIDO2), and automated audit trails.

6.3 Data Minimization & Retention Schedules:
(a) Fleet Safety Inspections & VOR Records: Retained for fifteen (15) months in accordance with DVSA statutory guide to maintaining roadworthiness;
(b) Driver Working Time & Duty Counters: Retained for twenty-four (24) months to fulfill statutory inspection criteria under the Road Transport (Working Time) Regulations 2005;
(c) Financial & Billing Manifests: Retained for six (6) full financial years plus the current operating year pursuant to Section 388 of the Companies Act 2006 and HMRC requirements;
(d) Raw GPS Coordinate Breadcrumbs: Pruned or consolidated into generalized route vectors after ninety (90) days, unless an open insurance claim or active accident report mandates preservation.''',
  ),
  PolicyPage(
    document: LegalDocument.privacyNotice,
    title: 'Sub-Processors',
    body: '''7. AUTHORIZED THIRD-PARTY SUB-PROCESSORS & INFRASTRUCTURE PARTNERS

Tachyo LTD maintains formal Data Processing Agreements containing statutory Article 28 UK GDPR commitments with all downstream service providers:

7.1 Supabase Inc. (Database & Authentication Engine):
Function: Database hosting, edge compute, and user identity management.
Location: Dedicated infrastructure deployed in AWS London (eu-west-2), UK.

7.2 Machine-Vision OCR Processing Engine:
Function: Parsing numerical text from fuel receipt images.
Security Commitment: Image streams processed ephemerally within the AWS London perimeter without permanent retention of raw imagery outside Tachyo's encrypted storage.''',
  ),
  PolicyPage(
    document: LegalDocument.privacyNotice,
    title: 'Your Rights & SARs',
    body: '''8. DATA SUBJECT RIGHTS, INQUIRIES & SUBJECT ACCESS REQUESTS (SARs)

Under Chapter III of the UK GDPR and the Data Protection Act 2018, individuals possess statutory entitlements regarding their personal data. The operational mechanics for executing these rights depend strictly on whether Tachyo LTD acts as an independent Controller or as a technical Processor.

8.1 Scope of Statutory Rights:
(a) Right of Access (Article 15 UK GDPR): The entitlement to obtain formal confirmation as to whether personal data is being processed and receive a structured copy of all associated records.
(b) Right to Rectification (Article 16 UK GDPR): The entitlement to mandate the correction of inaccurate personal data or completion of incomplete operational records.
(c) Right to Erasure / "Right to be Forgotten" (Article 17 UK GDPR): The right to request the irreversible deletion of personal data, subject to the statutory retention exclusions detailed in Clause 8.4.
(d) Right to Restriction of Processing (Article 18 UK GDPR): The right to freeze the active processing of records during ongoing disputes regarding accuracy or lawful basis.
(e) Right to Data Portability (Article 20 UK GDPR): The entitlement to receive personal data in a structured, commonly used, and machine-readable format (e.g., CSV, JSON).
(f) Right to Object (Article 21 UK GDPR): The entitlement to challenge data processing predicated upon Legitimate Interests under Article 6(1)(f).

8.2 Processing Subject Access Requests for Direct Account Data (Tachyo as Controller):
(a) Transport Managers, enterprise account holders, and administrative personnel exercising rights over billing, account credentials, or corporate communications must submit a formal request via email to privacy@tachyo.co.uk.
(b) Tachyo LTD shall confirm receipt within five (5) business days and complete identity verification using multi-factor cryptographic credentials.
(c) Compliant disclosures shall be executed without undue delay and at the latest within one (1) calendar month of receipt, extensible by two (2) further months for complex enterprise queries in accordance with Article 12(3) UK GDPR.

8.3 Protocol for Employed, Subcontracted, and Agency Drivers (Tachyo as Processor):
(a) Where a commercial driver (whether employed via PAYE, engaged as an independent subcontractor, or supplied via an employment agency) submits a SAR directly to Tachyo LTD concerning telematics, GPS traces, fuel receipts, or shift logs, Tachyo LTD acts strictly as a Data Processor.
(b) Tachyo LTD possesses neither the lawful authority nor the independent legal entitlement to alter, disclose, or delete Customer-controlled operational records without express written authorization from the primary Data Controller (the Haulier / Transport Operator).
(c) Routing SLA: Tachyo LTD covenants to notify and forward any driver-originated SAR or inquiry to the designated Transport Manager of the relevant Customer within three (3) business days of electronic receipt.
(d) Tachyo LTD shall provide technical tooling enabling the Customer to extract, export, or redact driver records to fulfill statutory deadlines, but legal accountability for timely response rests exclusively with the Customer.

8.4 Statutory Precedence Over Erasure Requests (Legal & Regulatory Overrides):
(a) The Right to Erasure under Article 17 is expressly curtailed where continued retention is necessary for compliance with a legal obligation or the establishment, exercise, or defence of legal claims pursuant to Article 17(3)(b) and (e) UK GDPR.
(b) Requests by drivers to purge shift timestamps, telematics traces, or defect audit logs shall be refused to the extent that such records are mandated for preservation by:
(i) The Goods Vehicles (Licensing of Operators) Act 1995 (15-month roadworthiness inspection preservation);
(ii) The Road Transport (Working Time) Regulations 2005 (24-month working time enforcement);
(iii) The Limitation Act 1980 (statutory 6-year period for commercial contract and tortious negligence claims).''',
  ),
  PolicyPage(
    document: LegalDocument.privacyNotice,
    title: 'Automated Processing',
    body: '''9. AUTOMATED PROCESSING, ALGORITHMIC HEURISTICS & PROFILING (ARTICLE 22 UK GDPR)

This section formally defines the mathematical and heuristic nature of the Tachyo platform to disclaim the existence of solely automated legal decision-making.

9.1 Absence of Solely Automated Determinations:
(a) Tachyo LTD does not execute automated decision-making processes that produce legal effects concerning individuals or similarly significantly affect them within the statutory definition of Article 22(1) UK GDPR.
(b) The software does not automatically levy disciplinary sanctions, adjust contractual remuneration rates, or terminate driver access tokens without human intervention.

9.2 Algorithmic Triage & Heuristic UI Indicators:
(a) The platform applies deterministic algorithms to raw input data to generate advisory visualizations, specifically utilizing:
(i) Red (#CC0000) for "Critical VOR" states where an unresolved major defect or an overdue inspection (≤ 0 days) is detected;
(ii) Amber (#F59E0B) for "Action Required / Due Soon" states within user-configured threshold envelopes;
(iii) Emerald (#10B981) for "Compliant" states where operational tolerances remain within configured parameters.
(b) These heuristic classifications represent computational summaries of stored database records and do not constitute autonomous expert determinations.

9.3 Mandatory "Human-in-the-Loop" Operational Architecture:
(a) Any operational action that impacts vehicle roadworthiness, legal compliance, or driver duty status mandates an affirmative manual action by a qualified human operator (e.g., driver walkaround verification, Transport Manager sign-off, or certified workshop clearance).
(b) The customer acknowledges that Tachyo's algorithms function as operational decision-support software and that sole professional accountability for vehicle release rests with the Operator Licence holder.

9.4 Margin, Yield & Performance Calculations:
(a) Calculations displayed within profitability and driver yield dashboards (e.g., gross margin percentages, hourly revenue yield, fuel efficiency indicators) are arithmetic aggregations derived from uploaded carrier manifests, shift timestamps, and approved fuel receipts.
(b) Such calculations serve analytical operational purposes only and must be independently audited by the Customer before implementation in payroll systems or statutory tax filings.''',
  ),
  PolicyPage(
    document: LegalDocument.privacyNotice,
    title: 'Breach Management',
    body: '''10. PERSONAL DATA BREACH MANAGEMENT & INCIDENT NOTIFICATION

Tachyo LTD maintains rigorous incident response protocols aligned with the Data Protection Act 2018 and National Cyber Security Centre (NCSC) guidance.

10.1 Definition of a Security Incident: A personal data breach constitutes any confirmed breach of security leading to the accidental or unlawful destruction, loss, alteration, unauthorized disclosure of, or access to, personal data transmitted, stored, or otherwise processed within the AWS London infrastructure.

10.2 Processor-to-Controller Notification Protocols (Article 33(2) UK GDPR):
(a) Upon confirming a personal data breach affecting Customer fleet, telematics, or driver data, Tachyo LTD shall notify the primary account administrator and designated Transport Manager without undue delay, and in any event within forty-eight (48) hours of formal confirmation.
(b) The notification shall detail:
(i) The nature and technical vector of the personal data breach;
(ii) The approximate categories and volume of data subjects and telematics records implicated;
(iii) The identity and contact coordinates of the Data Protection Officer;
(iv) Immediate mitigation measures implemented to contain the security incident;
(v) Recommended containment actions for the Customer.

10.3 Direct Supervisory Reporting (Tachyo as Controller — Article 33(1) UK GDPR): Where a confirmed breach occurs concerning data for which Tachyo LTD acts as an independent Controller (e.g., administrative account credentials, billing tokens, corporate identity data), Tachyo LTD shall formally notify the Information Commissioner's Office (ICO) within seventy-two (72) hours of becoming aware of the event, unless the breach is assessed as unlikely to result in a risk to the rights and freedoms of natural persons.

10.4 Forensic Preservation & Remediation Commitments: Tachyo LTD shall preserve all relevant network audit trails, server access logs, and edge firewall records within its AWS London perimeter for forensic analysis and provide reasonable technical assistance to Customers in discharging their notification obligations under Article 34 UK GDPR.''',
  ),
  PolicyPage(
    document: LegalDocument.privacyNotice,
    title: 'Statutory Disclosures',
    body: '''11. STATUTORY DISCLOSURES, LAW ENFORCEMENT & REGULATORY COOPERATION

11.1 Subpoenas, Court Warrants & Judicial Orders:
(a) Tachyo LTD shall not disclose personal data to third parties except where compelled to do so by a valid order issued by a court of competent jurisdiction within England and Wales (including the High Court, Crown Court, or County Court).
(b) Prior to executing any judicial disclosure, Tachyo LTD shall review the legal validity of the warrant with external legal counsel and, where legally permissible, provide prompt written notification to the affected Customer to enable them to seek protective relief.

11.2 Regulatory Oversight (DVSA & Traffic Commissioners):
(a) The Customer acknowledges that records stored within the Tachyo platform concerning vehicle maintenance, defect rectification, and driver hours may be subject to inspection by the Driver and Vehicle Standards Agency (DVSA) or formal request by a Traffic Commissioner for Great Britain under the Goods Vehicles (Licensing of Operators) Act 1995.
(b) Tachyo LTD provides self-service export utilities to enable Customers to produce required compliance packs during statutory audits or Public Inquiries (PI).

11.3 Police Investigations & Road Traffic Incident Inquiries:
(a) Under Schedule 2, Part 1, Paragraph 2 of the Data Protection Act 2018, Tachyo LTD may process and disclose specific telematics records (e.g., historical GPS breadcrumbs, speed vectors, or shift logs) to Police forces in England, Wales, or Police Scotland where:
(i) The request is formally submitted via an official Section 29 / Schedule 2 Data Protection Request Form signed by an authorized Police Officer;
(ii) The disclosure is strictly necessary for the prevention or detection of crime, or the apprehension or prosecution of offenders (e.g., investigation of fatal or serious road collisions under the Road Traffic Act 1988).

Your rights: you can ask to see, correct, or ask about deleting your data — start with your employer, since for your shift and telematics data they are the Data Controller. You also have the right to complain to the UK Information Commissioner's Office (ico.org.uk). Questions about the app itself: privacy@tachyo.co.uk''',
  ),

  // ── App Terms of Use ── (TACHYO LTD — B2B Master SaaS Agreement &
  // Terms of Service — full text, same as marketing_site's /legal/terms
  // and admin_dashboard's login-page legal modal. This is the Customer/
  // Operator-facing Master Agreement, not a driver-specific document —
  // kept in sync manually across all three surfaces.)
  PolicyPage(
    document: LegalDocument.appTermsOfUse,
    title: 'Definitions & B2B Status',
    body: '''TACHYO LTD — B2B MASTER SAAS AGREEMENT & TERMS OF SERVICE

1. DEFINITIONS & COMMERCIAL B2B STATUS

1.1 Parties: This Master Services Agreement ("Agreement") is entered into between Tachyo LTD registered at 20 South Street, Doncaster, England, DN4 5FH ("Tachyo", "Provider"), and the commercial entity subscribing to the Service ("Customer", "Operator").

1.2 Strict Exclusion of Consumer Law: The Service is supplied solely on a business-to-business (B2B) basis for commercial transport fleet operations. To the fullest extent permitted by law, the provisions of the Consumer Rights Act 2015 and the Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013 are expressly excluded.

1.3 Authority to Bind: The individual accepting these terms warrants that they possess legal authority to enter into binding commercial contracts on behalf of the Customer entity.''',
  ),
  PolicyPage(
    document: LegalDocument.appTermsOfUse,
    title: 'Licence & Access',
    body: '''2. SAAS LICENCE GRANT & ACCESS RESTRICTIONS

2.1 Scope of Licence: Tachyo grants the Customer a non-exclusive, non-transferable, revocable licence to access the web dispatch platform and deploy the mobile PWA endpoint to authorized drivers solely for internal fleet telematics and compliance management.

2.2 Prohibited Conduct: The Customer shall not, and shall not permit any employee, agency worker, or third party to:
(a) Reverse engineer, decompile, or extract source code from the Tachyo platform;
(b) Resell, sub-license, white-label, or provide commercial bureau dispatch services to external hauliers without prior written consent;
(c) Inject synthetic telemetry, manipulate GPS time-series records, or simulate vehicle inspections through programmatic scripting.''',
  ),
  PolicyPage(
    document: LegalDocument.appTermsOfUse,
    title: 'Heuristic UI & Roadworthiness',
    body: '''3. HEURISTIC UI, ALGORITHMIC INDICATORS & STATUTORY ROADWORTHINESS DISCLAIMER

3.1 Non-Certification Status of Visual Signals: The Customer acknowledges that all visual status indicators, color-coded badges, and operational banners displayed across the Service:
(a) Emerald Green (#10B981 / "Compliant"): Signifies solely that recorded database entries have not triggered a mathematical threshold alert based on user-entered parameters;
(b) Amber (#F59E0B / "Due Soon"): Signifies solely that an upcoming statutory date falls within the Customer-configured warning lead time;
(c) Brand Red (#CC0000 / "Critical VOR"): Reflects an active recorded safety defect or expired inspection date (≤ 0 days);
(d) Do NOT constitute a statutory Certificate of Roadworthiness, mechanical sign-off, or verification under the Road Traffic Act 1988.

3.2 Mandatory Human Verification: The visual representation of an asset as "Compliant" or "Green" within the UI shall never replace, diminish, or alter the driver's statutory duty to conduct a physical pre-use walkaround inspection, nor the Transport Manager's duty to independently inspect workshop documentation.

3.3 Zero Liability for Roadside Enforcement & DVSA Sanctions: Tachyo LTD disclaims all liability for:
(a) Prohibition notices (including immediate or delayed PG9 notices) issued by DVSA examiners or Police constables;
(b) Roadside vehicle impoundments, fixed penalty notices, or immobilization fees;
(c) Overdue Periodic Maintenance Inspections (PMIs) or missed Roller Brake Tests resulting from inaccurate date entries by the Customer.''',
  ),
  PolicyPage(
    document: LegalDocument.appTermsOfUse,
    title: 'Operator Licence Compliance',
    body: '''4. OPERATOR LICENCE (O-LICENCE) STATUTORY COMPLIANCE

4.1 Primacy of Statutory Undertakings: The Customer, as the statutory Operator Licence holder under the Goods Vehicles (Licensing of Operators) Act 1995, retains exclusive, non-delegable legal accountability for fulfilling all license undertakings before the Traffic Commissioners for Great Britain.

4.2 Transport Manager Professional Responsibility: Tachyo functions strictly as passive operational software. It does not act as, nor replace the statutory functions of, a professionally competent Transport Manager (CPC holder).

4.3 Audit & Public Inquiry Disclaimers: In the event that the Customer is summoned to a formal Public Inquiry (PI) or Preliminary Hearing before a Traffic Commissioner, Tachyo LTD accepts zero responsibility for regulatory curtailments, licence suspensions, or revocations resulting from poor maintenance regimes or driver hours breaches.''',
  ),
  PolicyPage(
    document: LegalDocument.appTermsOfUse,
    title: 'Financial Analytics & OCR',
    body: '''5. FINANCIAL YIELD ANALYTICS, SMART CSV INGESTION & FUEL OCR DISCLAIMERS

5.1 Advisory Nature of Financial Computations:
(a) All figures generated across the Profitability and Settlement dashboards (including Gross Billed Revenue, Shift Payroll Yield, Fuel Running Costs, and Gross Profit Margins) represent computational estimates derived from Customer-provided inputs.
(b) The Service is an operational management aid and does not constitute professional accounting, taxation, or payroll processing software under the purview of HM Revenue & Customs (HMRC).

5.2 Carrier Remittance & Manifest Parsing (Fuzzy Ingestion):
(a) While the platform employs heuristic algorithms to auto-detect and map columns from carrier remittance documents (including Amazon Relay, DHL, Eddie Stobart, and third-party freight brokers), the Customer maintains sole responsibility for confirming the accuracy of rate mappings prior to reconciliation.
(b) Tachyo LTD accepts zero liability for discrepancies, missing rate items, disputed demurrage charges, or carrier chargebacks resulting from malformed CSV/XLSX imports.

5.3 Fuel Docket Machine-Vision OCR Parsing:
(a) Optical Character Recognition (OCR) applied to driver fuel receipts is subject to physical image degradation (e.g., thermal ink fade, poor lighting, or camera distortion).
(b) Extracted totals, volumes in litres, and VAT registrations must be manually audited and approved by the Customer's dispatch or accounts team before export. Tachyo disclaims all liability for incorrect input VAT reclaim submissions made to HMRC.

5.4 Payroll Exclusion & Wage Dispute Indemnity:
(a) Calculations of driver earnings based on hourly rates, day rates, or per-mile allocations serve purely for internal job-costing analysis.
(b) The Customer warrants that formal driver payroll, minimum wage compliance (National Minimum Wage Act 1998), and working time pay (Working Time Regulations 1998) are managed through an independent payroll system. The Customer shall indemnify Tachyo against any driver unlawful deduction of wages claims before an Employment Tribunal.''',
  ),
  PolicyPage(
    document: LegalDocument.appTermsOfUse,
    title: 'Limitation of Liability',
    body: '''6. ABSOLUTE LIMITATION OF FINANCIAL LIABILITY (THE LIABILITY CAP)

6.1 Uncapped Liabilities (Statutory Protections): Nothing in this Agreement shall limit or exclude either party's liability for:
(a) Death or personal injury caused by its negligence;
(b) Fraud or fraudulent misrepresentation;
(c) Any other liability that cannot be excluded under the laws of England and Wales.

6.2 Consequential & Indirect Loss Exclusion: To the maximum extent permitted by the Unfair Contract Terms Act 1977 (UCTA), Tachyo LTD shall have no liability to the Customer, whether in contract, tort (including negligence), breach of statutory duty, or otherwise, for:
(a) Loss of profits, commercial contracts, or revenue (including cancellation of haulier contracts by Amazon, DHL, or prime contractors);
(b) Loss of business opportunity, goodwill, or commercial reputation;
(c) Fines, fixed penalties, or regulatory levies imposed by the DVSA, Traffic Commissioners, or Police constables;
(d) Loss, corruption, or temporary inaccessibility of data or telematics breadcrumbs.

6.3 Total Aggregate Financial Ceiling:
(a) Subject to Clause 6.1, Tachyo LTD's total aggregate liability arising out of or related to the Service, whether in contract, tort, or otherwise, shall be strictly limited to the total subscription fees actually paid by the Customer to Tachyo LTD in the three (3) months immediately preceding the event giving rise to the claim.
(b) Both parties explicitly agree that this financial cap satisfies the requirement of reasonableness under Section 11 of the Unfair Contract Terms Act 1977, taking into account the subscription pricing model.''',
  ),
  PolicyPage(
    document: LegalDocument.appTermsOfUse,
    title: 'Guarantee, Cancellation & Purge',
    body: '''7. 14-DAY COMMERCIAL GUARANTEE, CANCELLATION & CRYPTOGRAPHIC DATA PURGE

7.1 14-Day Money-Back Commercial Guarantee:
(a) New enterprise subscribers may terminate their subscription within fourteen (14) calendar days of the initial subscription payment date.
(b) Upon receipt of written termination to support@tachyo.co.uk within this 14-day window, Tachyo LTD shall process a 100% refund of the initial subscription fee to the original payment method within five (5) business days.

7.2 Post-Termination 14-Day Data Export Window:
(a) Following account cancellation or termination, the Customer is granted a strict window of fourteen (14) calendar days to access the web panel and execute self-service data exports (CSV and PDF compliance logs).
(b) During this 14-day window, telematics ingestion and mobile app check-ins are suspended; the portal operates in read-only export mode.

7.3 Irreversible Cryptographic Hard Purge:
(a) Exactly at 23:59 BST on the fourteenth (14th) calendar day following termination, the system automatically executes a script executing a permanent hard delete across all Customer databases, database backups, uploaded walkaround defect photos, and fuel receipt dockets stored within AWS London (eu-west-2).
(b) Following this automated event, data recovery is mathematically impossible. Tachyo LTD disclaims all responsibility for Customer records lost due to failure to export compliance logs within the 14-day window prior to statutory DVSA audits.''',
  ),
  PolicyPage(
    document: LegalDocument.appTermsOfUse,
    title: 'Governing Law & Jurisdiction',
    body: '''8. GOVERNING LAW, DISPUTE RESOLUTION & JURISDICTION

8.1 Governing Law: This Agreement and any dispute or claim arising out of or in connection with it or its subject matter or formation (including non-contractual disputes or claims) shall be governed by and construed in accordance with the laws of England and Wales.

8.2 Mandatory Pre-Litigation Executive Negotiation: Prior to initiating formal court proceedings, senior commercial executives of both parties must engage in good-faith negotiations for a period of not less than thirty (30) calendar days following electronic delivery of a formal Dispute Notice.

8.3 Exclusive Jurisdiction: Each party irrevocably agrees that the Courts of England and Wales (specifically sitting in Doncaster, Sheffield, or London) shall have exclusive jurisdiction to settle any dispute or claim arising out of or in connection with this Agreement.''',
  ),

  // ── Telematics & GPS Policy ── (TACHYO LTD — Driver Telematics, GPS &
  // Mobile App Policy, TCH-UK-TEL-2026-V1 — full text, same as
  // marketing_site's /legal/telematics and admin_dashboard's login-page
  // legal modal. Kept in sync manually across all three surfaces.)
  PolicyPage(
    document: LegalDocument.telematicsPolicy,
    title: 'Hardware Permissions',
    body: '''TACHYO LTD — DRIVER TELEMATICS, GPS & MOBILE APP POLICY
Document Reference: TCH-UK-TEL-2026-V1
Statutory Alignment: UK GDPR, Data Protection Act 2018, Road Traffic Act 1988, Transport Act 1968.

1. HARDWARE-LEVEL LOCATION PERMISSIONS & OPERATING SYSTEM ARCHITECTURE

1.1 Low-Level Hardware Permissions:
(a) Operation of the mobile application mandates the granting of high-precision Global Navigation Satellite System (GNSS/GPS) access permissions at the operating system level:
Apple iOS: CoreLocation framework authorization set to "Always Allow" or "While Using the App";
Google Android: ACCESS_FINE_LOCATION and ACCESS_BACKGROUND_LOCATION permissions.
(b) Operating System Autonomy: The Customer and Driver acknowledge that mobile operating systems independently control hardware power states, antenna polling intervals, and permission dialogs.

1.2 Distinction Between OS Permission and App Duty State:
(a) Granting background location permissions to the device operating system enables the software container to execute location polling when the application interface is minimized.
(b) Hardware De-coupling: Revocation of physical satellite querying can only be executed by the end-user directly through device system settings (Settings ➔ Tachyo ➔ Location ➔ Never).''',
  ),
  PolicyPage(
    document: LegalDocument.telematicsPolicy,
    title: 'Active Duty Tracking Scope',
    body: '''2. ACTIVE DUTY TRACKING SCOPE & EDGE GATEWAY DROPPING

2.1 Strict Shift-Bound Processing Window:
(a) Telematics data processing, geographic vector calculations, and database persistence occur strictly and exclusively during an active duty shift.
(b) An active duty shift is initiated programmatically when the driver completes the digital check-in sequence ("Start Shift" / "Asset Coupling") and concludes definitively when the driver executes "End Shift".

2.2 Post-Shift Packet Dropping at Edge Perimeter:
(a) Any stray GNSS telemetry packets transmitted by a device hardware background process while in an inactive or uncoupled shift state are dropped at the API edge gateway without ingestion, persistence, or display.
(b) Tachyo LTD covenants that it maintains zero historical database records, analytical profiles, or real-time maps of driver geographic positioning outside active operational shift logs.''',
  ),
  PolicyPage(
    document: LegalDocument.telematicsPolicy,
    title: 'Signal Attenuation',
    body: '''3. ATMOSPHERIC, SUBTERRANEAN & HARDWARE SIGNAL ATTENUATION

3.1 Environmental Attenuation Factors: The accuracy, continuity, and availability of telematics data points are subject to external technical and atmospheric constraints beyond Tachyo LTD's control, including:
(a) Signal blockage caused by transit through tunnels, subterranean loading bays, metal-clad logistics distribution hubs, or deep urban topography;
(b) Battery preservation protocols enforced by mobile operating systems (e.g., Apple iOS Low Power Mode, Android Doze Mode, OEM memory managers);
(c) Mobile cellular network dropouts, SIM card data starvation, or regional roaming latency.

3.2 Tachograph & Driving Hours Primacy:
(a) Calculations displayed on the mobile interface (e.g., 4.5-hour continuous driving counters, 6.0-hour Working Time Directive meters) are mathematical estimators derived from mobile motion vectors.
(b) In the event of any divergence between Tachyo mobile software telemetry and the digital vehicle tachograph unit (VU / Smart Tacho 2), the calibrated on-board vehicle tachograph and driver smart card maintain absolute legal precedence under Retained Regulation (EC) 561/2006.
(c) Tachyo LTD accepts zero liability for roadside DVSA driving hours infringements resulting from telemetry drift, lost pings, or device power depletion.''',
  ),
  PolicyPage(
    document: LegalDocument.telematicsPolicy,
    title: 'Camera & Fuel OCR',
    body: '''4. DEVICE CAMERA PERMISSIONS, WALKAROUND PROOF & FUEL RECEIPT OCR

4.1 Limited Optical Access Scope:
(a) Device camera hardware access permissions are utilized solely to capture contemporaneous evidence of vehicle roadworthiness defects during daily walkaround checks and physical fuel pump purchase dockets.
(b) The application does not maintain automated background camera access, video streaming capability, or facial recognition biometric processing.

4.2 EXIF Metadata & Geostamp Verification:
(a) Photographs submitted through the walkaround defect inspection workflow automatically extract embedded EXIF metadata, capturing exact device timestamps and geographic coordinates at the moment of shutter actuation.
(b) This metadata is processed to provide the Transport Manager with auditable cryptographic proof that the physical inspection was performed in proximity to the commercial asset, fulfilling DVSA Guide to Maintaining Roadworthiness evidentiary expectations.

4.3 Commercial Fuel Receipts & OCR Limitations:
(a) Photographic captures of fuel and AdBlue dockets are processed via optical machine vision solely to extract transactional integers (litres dispensed, total value in £ GBP, VAT numbers).
(b) Drivers and dispatch staff must manually verify parsed figures against the raw receipt image. Tachyo LTD disclaims liability for fiscal or HMRC VAT filing errors resulting from folded, faded, or illegible paper dockets.''',
  ),
  PolicyPage(
    document: LegalDocument.telematicsPolicy,
    title: 'Security & Credential Integrity',
    body: '''5. DRIVER APP SECURITY & CREDENTIAL INTEGRITY

5.1 Prohibition of Account Sharing: Drivers shall not disclose authentication credentials or share active mobile sessions with any other driver.

5.2 Vehicle Registration Association: The driver is strictly responsible for ensuring that the vehicle registration mark (VRM) entered during mobile check-in accurately matches the physical tractor unit and trailer coupled during the shift.

5.3 Tampering & Mock Locations: The use of mock-location developer tools, GPS spoofing software, or modified operating system kernels (jailbreaking/rooting) is strictly prohibited and results in immediate automated account suspension and formal notification to the Operator Licence holder.''',
  ),

  // ── Data Processing Addendum ── (TACHYO LTD — DPA, TCH-UK-DPA-2026-V1
  // — full text, same as marketing_site's /legal/dpa and
  // admin_dashboard's login-page legal modal. This is the Tachyo/
  // Customer processor agreement, not a driver-specific document —
  // kept in sync manually across all three surfaces.)
  PolicyPage(
    document: LegalDocument.dpa,
    title: 'Scope & Statutory Roles',
    body: '''TACHYO LTD — DATA PROCESSING ADDENDUM (DPA)
Pursuant to Article 28 of the UK General Data Protection Regulation (UK GDPR)
Document Reference: TCH-UK-DPA-2026-V1
Parties: Tachyo LTD ("Data Processor") and the Contracting Fleet Operator ("Data Controller").

1. SCOPE, SUBJECT MATTER & STATUTORY ROLES

1.1 Regulatory Scope: This Addendum governs the processing of personal data by Tachyo LTD on behalf of the Customer in connection with the provision of the Tachyo fleet telematics, compliance, and yield platform pursuant to Article 28(3) of the UK GDPR.

1.2 Designation of Roles:
(a) The Customer is and shall remain the Data Controller in respect of all fleet operational data, including driver location data, shifts, tachograph advisory calculations, walkaround defect images, and fuel receipts.
(b) Tachyo LTD is and shall act strictly as the Data Processor acting solely under the documented instructions of the Customer.

1.3 Details of Processing Activities:
(a) Subject Matter: Automated ingestion, calculation, display, and storage of commercial vehicle fleet telematics, driver duty timestamps, vehicle roadworthiness logs, and delivery remittance reconciliation.
(b) Duration: The duration of the Customer's commercial subscription plus the mandatory 14-day data export and retention window.
(c) Categories of Data Subjects: Commercial HGV drivers (employed under PAYE, engaged as self-employed subcontractors, or supplied via third-party driver recruitment agencies), Transport Managers, and logistics dispatchers.
(d) Types of Personal Data: Driver full names, internal identification numbers, mobile GPS coordinates, vehicle registration mark (VRM) linkage, shift hours, photographs of defect walkaround inspections, and fuel pump receipt images.''',
  ),
  PolicyPage(
    document: LegalDocument.dpa,
    title: 'Processor Obligations',
    body: '''2. PROCESSOR OBLIGATIONS & DOCUMENTED INSTRUCTIONS

2.1 Processing Instructions: Tachyo LTD shall process personal data only on documented instructions from the Customer (including via the configuration settings and user interactions within the SaaS dashboard), unless required to do so by the laws of England and Wales or statutory UK public authority orders.

2.2 Staff Confidentiality: Tachyo LTD guarantees that all software engineers, support specialists, and personnel authorized to access production databases have committed themselves to strict statutory obligations of confidentiality.

2.3 Technical & Organizational Measures (Security): Tachyo LTD shall maintain appropriate technical and organizational measures to ensure a level of security appropriate to the risk, including:
(a) Storage of database records strictly within AWS London (eu-west-2);
(b) Cryptographic encryption of database storage volumes and backups using Advanced Encryption Standard (AES-256);
(c) Enforced end-to-end transport layer encryption (TLS 1.3) across all API communications;
(d) Automated daily database snapshot backups retained in an encrypted state.''',
  ),
  PolicyPage(
    document: LegalDocument.dpa,
    title: 'Sub-Processors',
    body: '''3. SUB-PROCESSORS & INFRASTRUCTURE AUTHORISATION

3.1 General Written Authorisation: The Customer hereby grants Tachyo LTD general written authorisation to engage the third-party sub-processors specified below:
(a) Supabase Inc. — Managed PostgreSQL Database Engine & Authentication (hosted in AWS London, UK);
(b) Amazon Web Services EMEA SARL — S3 Object Storage for defect images and fuel dockets (AWS London eu-west-2, UK);
(c) Stripe Payments UK, Ltd. — Subscription payment processing and billing infrastructure (London, UK);
(d) Twilio Ireland Limited / SendGrid UK — SMS VOR safety alerts and critical two-factor notifications.

3.2 Sub-Processor Flow-Down: Tachyo LTD warrants that it imposes statutory data protection obligations no less onerous than those set out in this DPA upon every sub-processor via formal contract.

3.3 Notification of Sub-Processor Alterations: Tachyo LTD shall provide the Customer with at least thirty (30) calendar days' electronic notice prior to appointing any new sub-processor, providing the Customer with the commercial opportunity to object on reasonable data protection grounds.''',
  ),
  PolicyPage(
    document: LegalDocument.dpa,
    title: 'Employment Tribunal Shield',
    body: '''4. THE DRIVER EMPLOYMENT TRIBUNAL & SURVEILLANCE SHIELD (TOTAL INDEMNITY)

4.1 Customer Warranty on Driver Transparency: The Customer expressly warrants and covenants that:
(a) Prior to requiring or requesting any driver (whether direct employee, agency driver, or self-employed sub-contractor) to download, log into, or use the Tachyo mobile endpoint, the Customer has provided said driver with a statutory Article 13/14 UK GDPR Employee Privacy Notice;
(b) The Customer possesses an audited lawful basis under Article 6 of the UK GDPR (such as Legitimate Interests supported by an LIA, or statutory compliance with the Goods Vehicles Act 1995) to conduct GPS tracking and duty-time verification;
(c) The Customer maintains sole responsibility for complying with the Information Commissioner's Employment Practices Code regarding electronic monitoring at work.

4.2 Full Indemnification by Customer:
(a) The Customer shall indemnify, defend, and hold harmless Tachyo LTD, its directors, and officers against all liabilities, losses, damages, legal costs (calculated on a full indemnity solicitor-and-own-client basis), fines, and settlements arising from:
(i) Any claim, grievance, or Employment Tribunal action brought by a driver alleging unlawful workplace surveillance, constructive dismissal, or infringement of privacy rights under Article 8 of the European Convention on Human Rights (ECHR);
(ii) Any enforcement action or administrative monetary penalty issued by the Information Commissioner's Office (ICO) resulting from the Customer's failure to establish a lawful basis for monitoring its transport workforce.''',
  ),
  PolicyPage(
    document: LegalDocument.dpa,
    title: 'Data Subject Rights',
    body: '''5. DATA SUBJECT RIGHTS & REGULATORY ASSISTANCE

5.1 Assistance via In-Product Utilities: Taking into account the nature of the processing, Tachyo LTD shall assist the Customer by appropriate technical measures, insofar as this is commercially possible, to respond to drivers exercising statutory rights under Chapter III of the UK GDPR (including Subject Access Requests and Rectification).

5.2 Driver Request Routing: Where a driver submits a Subject Access Request (SAR) directly to Tachyo LTD, Tachyo shall not disclose any Customer records directly, but shall notify the Customer's designated Transport Manager within three (3) business days.

5.3 Exclusion of Unilateral Erasure: Tachyo LTD shall not alter, redact, or erase any historical defect inspections, maintenance confirmations, or duty hours records upon direct driver request, recognizing that such records represent statutory property of the Customer mandated for retention under the Goods Vehicles (Licensing of Operators) Act 1995.''',
  ),
  PolicyPage(
    document: LegalDocument.dpa,
    title: 'Audit Rights',
    body: '''6. AUDIT RIGHTS & REGULATORY INSPECTIONS

6.1 Provision of Compliance Proof: Tachyo LTD shall make available to the Customer all information reasonably necessary to demonstrate compliance with the statutory obligations laid down in Article 28 UK GDPR.

6.2 Audit Parameters:
(a) Any physical or electronic audit by the Customer or its appointed independent auditor shall occur no more than once in any twelve-month period;
(b) Audits mandate at least thirty (30) business days' prior written notice;
(c) Audits shall be conducted during normal UK business hours without disrupting operational SaaS infrastructure;
(d) Audits shall not grant access to proprietary source code, underlying intellectual property, or data belonging to other multi-tenant fleet subscribers.''',
  ),
  PolicyPage(
    document: LegalDocument.dpa,
    title: 'Termination & Data Purge',
    body: '''7. TERMINATION, 14-DAY EXPORT WINDOW & IRREVERSIBLE HARD PURGE

7.1 Cessation of Processing: Upon termination or expiration of the Customer's SaaS subscription, Tachyo LTD shall immediately halt all active telematics processing, driver check-in ingestions, and OCR parsing.

7.2 Mandatory 14-Day Self-Service Export: The Customer shall maintain self-service access to the read-only reporting portal for exactly fourteen (14) calendar days post-termination to export all historical fleet compliance logs, inspection dockets, and settlement records in structured .csv format.

7.3 Automated Cryptographic Purge:
(a) At 23:59 BST on the fourteenth (14th) calendar day following subscription termination, Tachyo LTD's automated database routines shall execute an irreversible, cryptographic hard deletion of all Customer personal data across active database tables, object storage buckets (receipts and defect photos), and temporary session logs within AWS London (eu-west-2).
(b) Backup archives shall be overwritten and eradicated in accordance with standard disaster recovery rotation cycles (not to exceed thirty (30) days).

7.4 Certification of Destruction: Upon written request received prior to the expiration of the 14-day window, Tachyo LTD shall issue an electronic Certificate of Data Destruction confirming compliance with this Clause.''',
  ),
];

class LegalComplianceScreen extends StatefulWidget {
  /// Which document to open. Defaults to the Privacy Notice so the
  /// existing pre-login "Terms & Conditions and Privacy Policy" link
  /// (which doesn't specify one) keeps behaving exactly as before.
  final LegalDocument document;

  const LegalComplianceScreen({super.key, this.document = LegalDocument.privacyNotice});

  @override
  State<LegalComplianceScreen> createState() => _LegalComplianceScreenState();
}

class _LegalComplianceScreenState extends State<LegalComplianceScreen> {
  final PageController _pageController = PageController();
  int _currentPage = 0;

  /// Only this document's pages — swiping past the last one simply stops
  /// there, rather than silently continuing into a different document.
  late final List<PolicyPage> _pages =
      policyPages.where((p) => p.document == widget.document).toList();

  int get _pageCount => _pages.length;

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  void _goToPage(int index) {
    if (index < 0 || index >= _pageCount) return;
    _pageController.animateToPage(
      index,
      duration: const Duration(milliseconds: 280),
      curve: Curves.easeOutCubic,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        centerTitle: true,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18, color: Color(0xFF1C1C1E)),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text(
          widget.document.label,
          style: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: Color(0xFF1C1C1E),
          ),
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(height: 1, color: const Color(0xFFE5E5EA)),
        ),
      ),
      body: SafeArea(
        child: Column(
          children: [
            // ── Page counter ─────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 10),
              child: Text(
                'PAGE ${_currentPage + 1} OF $_pageCount',
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.8,
                  color: Color(0xFF8E8E93),
                ),
              ),
            ),

            // ── Dot page indicator — tap a dot to jump straight to that
            // page, or just swipe left/right through the document. No
            // Previous/Next button bar.
            if (_pageCount > 1)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                child: Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: List.generate(_pageCount, (i) {
                    final isActive = i == _currentPage;
                    return GestureDetector(
                      onTap: () => _goToPage(i),
                      child: Padding(
                        padding: const EdgeInsets.all(4),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          width: isActive ? 9 : 7,
                          height: isActive ? 9 : 7,
                          decoration: BoxDecoration(
                            color: isActive ? const Color(0xFF8E8E93) : const Color(0xFFD1D1D6),
                            shape: BoxShape.circle,
                          ),
                        ),
                      ),
                    );
                  }),
                ),
              ),

            const Divider(height: 1, color: Color(0xFFE5E5EA)),

            // ── Paginated document content ─────────────────────
            Expanded(
              child: PageView.builder(
                controller: _pageController,
                itemCount: _pageCount,
                onPageChanged: (index) => setState(() => _currentPage = index),
                itemBuilder: (context, index) {
                  final page = _pages[index];
                  return SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          page.title,
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w900,
                            letterSpacing: -0.2,
                            color: Color(0xFF1C1C1E),
                          ),
                        ),
                        const SizedBox(height: 16),
                        Text(
                          page.body,
                          style: const TextStyle(
                            fontSize: 13,
                            height: 1.55,
                            color: Color(0xFF3A3A3C),
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
