import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import MemberCell from './components/ui/member-cell';
import { useSectionRefresh } from './lib/section-refresh';
import { AnimatePresence, motion } from 'framer-motion';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@maplibre/maplibre-gl-leaflet';
import { FlowButton } from './components/ui/flow-button';
import { ImageLightbox } from './components/ui/image-lightbox';
import { Sidebar, SidebarBody, SidebarLink } from './components/ui/sidebar';
import { Users, FileSpreadsheet, Clock, ShieldAlert, LogOut, Download, Check, Volume2, VolumeX, RefreshCw, Mail, Lock, Shield, Bell, MapPinned, Radio, Route, LayoutGrid, Container, Banknote, FileText, User, X, ChevronDown, ListChecks, BarChart3, AlertOctagon, Moon, Building2, Calendar, AlertTriangle, CreditCard, LocateFixed, Gauge, SatelliteDish, Truck, IdCard, Settings, KeyRound, Palette, Warehouse, Wrench, Phone, Sparkles, CircleCheck, CircleX, ShieldCheck, UploadCloud, ChevronRight, Fuel, Scale, ExternalLink, BellOff, MapPin, CheckCircle2, Trash2, UserPlus, UserX, Pencil, MoreVertical, Receipt, ParkingCircle, CalendarDays, Inbox, Settings2 } from 'lucide-react';
import Papa from 'papaparse';
import { BrandLogo } from './components/ui/brand-logo';
import type { BadgeDeltaDirection, BadgeDeltaTone } from './components/ui/badge-delta';
import TableFilter, { type TableFilterGroup } from './components/ui/table-filter';
import { MetricLineChart, type MetricTile } from './components/ui/metric-line-chart';
import { ProgressMetricCard, type MetricPoint, type MetricSummary } from './components/ui/progress-metric-card';
import { RankBars } from './components/ui/rank-bars';
import { EarningsDateRangePicker } from './components/ui/earnings-date-range-picker';
import { NotificationIcon, EyeToggleIcon, VolumeIcon, SaveIcon, DownloadIcon } from './components/ui/animated-state-icons';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import NoData from './components/ui/no-data';
import { Switch } from './components/ui/switch-button';
import { ThemeToggle } from './components/ui/theme-toggle';
import { driverPinHtml, trailerPinHtml, DRIVER_PIN_SIZE, DRIVER_PIN_ANCHOR, TRAILER_PIN_SIZE, TRAILER_PIN_ANCHOR } from './lib/map-pins';
import { riskIssuesByNumber, unroadworthyInUse, type RiskVehicleRow } from './lib/roadworthy';
import FilterBar, { FilterType, FilterOperator, AnimateChangeInHeight, type Filter as AnalyticsFilter, type FilterOption } from './components/ui/filters';
import Compliance from './pages/Compliance';
import ComplianceDefects from './pages/ComplianceDefects';
import FleetRoadworthiness from './pages/FleetRoadworthiness';
import DriverHours from './pages/DriverHours';
import { type ShiftLoad } from './components/ShiftLoadsEditor';
import WalkAroundHistory from './pages/WalkAroundHistory';
import EmployeeHolidays from './pages/EmployeeHolidays';
import FillTemplateModal from './components/FillTemplateModal';
import ExportPreviewModal, { type PreviewColumn, type PreviewRow } from './components/ExportPreviewModal';
import { type PayrollShift, type DayRates } from './lib/payroll-data';
import PlatformAccounts from './pages/PlatformAccounts';
import SecuritySettings from './components/SecuritySettings';
import PlanSettings from './components/PlanSettings';
import FuelBonusSettings from './components/FuelBonusSettings';
import DispatchLoadsModal from './components/DispatchLoadsModal';
import ShipmentsTracking from './components/ShipmentsTracking';
import DeliveryHistory from './components/DeliveryHistory';
import LiveTelemetryPanel from './components/LiveTelemetryPanel';
import PayRulesSettings from './components/PayRulesSettings';
import JourneyHistory from './pages/JourneyHistory';
import { buildJourney, LABEL_META, type Ping } from './lib/journey';
import { drawJourney } from './lib/journey-map';
import LockedFeature from './components/LockedFeature';
import { TAB_FEATURE, FEATURE_LABEL, type Entitlements, type FeatureKey } from './lib/entitlements';
import TrueProfitSection, { TrueProfitForecast, TrueProfitTargets } from './components/analytics/TrueProfitSection';
import { ActionMenu, AnalyticsCard, AnalyticsPageHeader, AnalyticsSection, SegmentedToggle } from './components/analytics/AnalyticsLayout';
import CostLedgerModal from './components/analytics/CostLedgerModal';
import AnalyticsBreakdowns from './components/analytics/AnalyticsBreakdowns';
import { computeTrueCost, computeTrueCostSeries, shiftRevenueFromLoads, DEFAULT_ANALYTICS_SETTINGS, VAT_RATE, type AnalyticsSettings, type OrgCost, type TrueCostResult, type VatMode } from './lib/true-cost';
import { computeBreakdowns } from './lib/analytics-breakdowns';
import DispatchDashboard from './pages/DispatchDashboard';
import { computeShiftCompliance, walkaroundIssues, formatCheckDuration, type ComplianceCheck } from './lib/walkaround-compliance';
import CarrierSettlementImportModal from './pages/CarrierSettlementImportModal';
import DriverBulkImportModal from './pages/DriverBulkImportModal';
import PayrollDrawer, { type PayrollShiftContext, type PayrollDrawerSaveValues } from './pages/PayrollDrawer';

// "Remember Me" stores only the administrator's email address for prefill —
// never the password. Session persistence itself is handled by Supabase.
const REMEMBERED_EMAIL_KEY = 'admin_remembered_email';

// [Company Name] legal documents — same text as the driver app's Legal &
// Compliance screen (driver_app/lib/features/legal/presentation/
// legal_compliance_screen.dart). Kept in sync manually since the two apps
// don't share a content source; update both when the policy changes.
interface LegalSection {
  heading: string;
  body: string;
}

// DRAFT — not yet reviewed by a solicitor. See legal/*.md at the repo
// root for the canonical versions of these documents and the caveats
// that apply to all of them (placeholders, jurisdiction, etc.) — this is
// the same content, reformatted for this in-app modal. Tachyo is a SaaS
// platform: Customer companies are the controller of their own drivers'
// data, Tachyo is the processor. Keep this file and the driver app's
// legal_compliance_screen.dart content in sync when either changes.
const LEGAL_DOCUMENTS: Record<'privacy' | 'terms' | 'dpa' | 'telematics', { title: string; sections: LegalSection[] }> = {
  privacy: {
    title: 'TACHYO LTD — STATUTORY PRIVACY NOTICE & DATA PROTECTION DECLARATION',
    sections: [
      {
        heading: 'Document Reference: TCH-UK-PRIV-2026-V1',
        body: 'Statutory Framework: UK General Data Protection Regulation (UK GDPR), Data Protection Act 2018 (DPA 2018), Privacy and Electronic Communications Regulations (PECR).',
      },
      {
        heading: '1. Statutory Identification & Regulatory Status',
        body: '1.1 Data Controller & Operator Identity: This Privacy Policy governs the processing of personal data by Tachyo LTD, a private limited company incorporated under the laws of England and Wales, registered under Company Number 12356231, with its registered office situated at 20 South Street, Doncaster, England, DN4 5FH ("Tachyo", "we", "us", or "our").\n\n1.2 Supervisory Authority Registration: Tachyo LTD maintains formal notification and registration with the Information Commissioner’s Office (ICO) in the United Kingdom as a fee-paying controller and processor under the Data Protection (Charges and Information) Regulations 2018.\n\n1.3 Data Protection Officer & Point of Contact: Inquiries regarding statutory data rights, exercise of Articles 15–22 UK GDPR privileges, or regulatory requests must be directed to:\n• Direct Email: privacy@tachyo.co.uk\n• Postal Address: Data Protection Officer, Tachyo LTD, 20 South Street, Doncaster, DN4 5FH.',
      },
      {
        heading: '2. Dual-Capacity Operating Framework (Controller vs. Processor)',
        body: 'The legal status of Tachyo LTD fundamentally bifurcates depending on the specific category of personal data and the commercial context of collection:\n\n2.1 Tachyo as an Independent Data Controller (Account & Billing Data): Tachyo LTD acts as an independent Data Controller pursuant to Article 4(7) of the UK GDPR with respect to:\n(a) Direct customer registration, administrative credentials, corporate contact identities, and Transport Manager authorization records;\n(b) Commercial payment processing tokens, invoicing records, VAT registrations, and transaction audit trails;\n(c) Direct customer support transcripts, platform usage diagnostics, telemetry crash reports, and system telemetry logs;\n(d) Marketing communications governed strictly by PECR and opted-in commercial correspondence.\n\n2.2 Tachyo as a Data Processor (Customer Fleet & Telematics Operations): Tachyo LTD acts strictly as a Data Processor pursuant to Article 4(8) of the UK GDPR on behalf of the commercial Customer (the Haulier, Logistics Operator, or Carrier) who acts as the primary Data Controller with respect to:\n(a) Driver mobile application telematics, including real-time GPS coordinates, route histories, and speed pings;\n(b) Driver shift timestamps, continuous driving counters, tachograph advisory calculations, and Working Time Directive (WTD) intervals;\n(c) Driver photographic defect submissions (walkaround checks), uploaded fuel receipts, pump receipts, and vehicle registration linkage;\n(d) Subcontractor, agency worker, or PAYE driver payroll rate attributions and route yields.\n\n2.3 Absence of Direct Driver Employment Nexus: Tachyo LTD maintains no direct contractual, employment, or agency nexus with individual drivers operating mobile telematics endpoints. The commercial Customer warrants that it maintains lawful basis under Article 6 of the UK GDPR to instruct Tachyo LTD to process driver personal data.',
      },
      {
        heading: '3. Exhaustive Taxonomy of Processed Data',
        body: 'Tachyo LTD collects and processes distinct categories of electronic, visual, and spatial information across the web platform and native driver mobile interfaces:\n\n3.1 Account & Identity Records:\n(a) Full legal name, corporate trade name, job title, and transport role (e.g., Operator Licence Holder, Transport Manager, Traffic Dispatcher, Driver);\n(b) Business contact details, including corporate physical address, dispatch depot postcodes, business email address, and mobile dispatch telephone numbers;\n(c) Encrypted password hashes, session cookies, multi-factor authentication (MFA) tokens, and IP audit trails.\n\n3.2 Real-Time Spatial & Device Telematics (GPS & Hardware Data):\n(a) High-frequency Global Navigation Satellite System (GNSS/GPS) coordinates, including latitude, longitude, altitude, horizontal accuracy tolerances, and bearing;\n(b) Telematics vector calculations, including calculated road speeds (mph), acceleration curves, idling stationary states, and depot geofence entry/exit pings;\n(c) Mobile hardware diagnostics: hardware model (e.g., iPhone 15, Samsung Galaxy), operating system version, mobile network operator, battery level percentage, and location permission state (Always, While Using, Denied).\n\n3.3 Compliance & Working Hours Telemetry:\n(a) Shift start, pause, rest, and termination timestamps recorded via manual driver touch-event or telemetry shift triggers;\n(b) Segmented calculation arrays: continuous driving duration (EC 561/2006 4.5-hour counter), cumulative rest periods, 6.0-hour WTD continuous duty counters, and daily shift span (13h/15h spreadover tracking);\n(c) Assigned tractor unit registrations (VRM), trailer identification plates, and digital coupling events.\n\n3.4 Visual Evidence, Image Metadata & OCR Extraction:\n(a) Photographic walkaround defect captures submitted via device camera (e.g., cracked lenses, tyre bulges, bodywork damage);\n(b) Exchangeable Image File Format (EXIF) metadata embedded within uploaded images, including hardware camera specs, timestamps, and embedded GPS location stamps at the moment of photo capture;\n(c) Commercial fuel and lubricant purchase receipts uploaded for expense tracking;\n(d) Optical Character Recognition (OCR) raw text vectors extracted from fuel pump dockets, including date, fuel volume (litres), total financial value (£ GBP), and vendor VAT registration numbers.',
      },
      {
        heading: '4. Statutory Lawful Bases for Data Processing (Article 6 UK GDPR)',
        body: 'Under Section 8 of the Data Protection Act 2018 and Article 6(1) of the UK GDPR, Tachyo LTD relies on distinct legal bases to justify the capture and retention of data across its services:\n\n4.1 Performance of Commercial Contract (Article 6(1)(b) UK GDPR):\n(a) Provision of the Tachyo Software-as-a-Service (SaaS) web panel, maintenance of active enterprise tenants, and administrative user identity management;\n(b) Real-time routing of mobile check-in telemetry from driver field units to authorized operator dispatch cockpits;\n(c) Calculation of delivery yields, load matching against carrier CSV/XLSX manifests, and generation of driver gross margin tables.\n\n4.2 Compliance with Statutory & Regulatory Obligations (Article 6(1)(c) UK GDPR):\n(a) Processing transaction ledgers, VAT documentation, and billing manifests pursuant to the Value Added Tax Act 1994 and UK corporate taxation accounting mandates;\n(b) Providing auditable roadworthiness logs, roller brake test records, and defect rectifications necessary for the Customer to discharge duties under the Goods Vehicles (Licensing of Operators) Act 1995 and Driver and Vehicle Standards Agency (DVSA) statutory maintenance guidelines;\n(c) Facilitating compliance with tachograph and driving hours verification pursuant to Retained Regulation (EC) 561/2006 and the Road Transport (Working Time) Regulations 2005.\n\n4.3 Legitimate Commercial Interests (Article 6(1)(f) UK GDPR):\n(a) Algorithmic heuristics applied to raw defect inputs to prioritize workshop triage (e.g., immediate Vehicle Off Road [VOR] grounding notices);\n(b) Security monitoring, network penetration prevention, denial-of-service mitigation, and IP abuse prevention;\n(c) Aggregated, fully anonymized statistical analysis of component failure rates across HGV classes to improve predictive maintenance algorithms (with all vehicle registrations and corporate identifiers scrubbed).\n\n4.4 Operator’s Lawful Basis for Employee / Subcontractor Telematics:\n(a) Tachyo LTD does not rely on individual worker "Consent" (Article 6(1)(a)) due to the systemic imbalance of power inherent in employment and agency relationships, as recognized by the Information Commissioner’s Office (ICO);\n(b) The Customer warrants that its telematics surveillance is justified under its own Legitimate Interests Assessment (LIA), statutory transport compliance obligations, or formal workforce Data Protection Impact Assessment (DPIA) prior to provisioning the Tachyo Driver application to any driver.',
      },
      {
        heading: '5. Device Hardware, GPS Telematics & Operating System Boundary',
        body: 'This section sets out the explicit operational boundary between the Tachyo mobile software layer and the underlying mobile device hardware (Apple iOS and Google Android).\n\n5.1 Device Permissions Architecture:\n(a) Fine Location Services (GNSS/GPS): The mobile application requires permission to access high-accuracy GPS coordinates (ACCESS_FINE_LOCATION on Android; kCLAuthorizationStatusAuthorizedAlways or kCLAuthorizationStatusAuthorizedWhenInUse on iOS).\n(b) Foreground & Background Tracking: Continuous route calculations and geofence pings require background execution capability to prevent data loss while navigation software or camera apps run concurrently.\n\n5.2 Operational Tracking Scope & Hardware Dissociation:\n(a) Active Duty Binding: Tachyo’s software engine is programmatically instructed to process and record GPS telemetry vectors exclusively during an active duty shift (from the moment a driver confirms "Start Shift" or "Asset Check-In" until the driver executes "End Shift").\n(b) Hardware Level Persistence: The Customer and the Driver acknowledge that modern mobile operating systems control low-level location chipsets independently. While the Tachyo application halts the recording, processing, and database storage of geographic coordinates upon "End Shift", complete hardware-level decoupling requires the device user to toggle off location permissions in device system settings.\n(c) Strict Exclusion of Post-Shift Processing: Tachyo LTD covenants that it does not inspect, process, log, monetize, or provide to the Transport Manager any geographic location data received outside an active shift state. Any raw location packets pinged while a shift is inactive are dropped at the edge gateway without persistence.\n\n5.3 Camera & Local Media Storage Boundaries:\n(a) Device camera permissions are accessed strictly upon deliberate user initiation to capture visual proof of physical vehicle defects or fuel purchase dockets;\n(b) The application does not maintain persistent background access to the camera hardware or unrelated photo library assets outside the designated capture container.',
      },
      {
        heading: '6. Data Residency, Security & Storage Architecture',
        body: '6.1 Territorial Data Residency (United Kingdom):\n(a) All primary databases, transaction logs, telematics records, and uploaded image files are hosted exclusively within the United Kingdom;\n(b) Physical infrastructure is provisioned through Supabase Inc. utilizing Amazon Web Services (AWS) in the London Region (eu-west-2);\n(c) Tachyo LTD guarantees that zero Customer personal data, driver location coordinates, or compliance dockets are transferred outside the territorial boundaries of the United Kingdom, eliminating cross-border transfer mechanisms under Chapter V of the UK GDPR.\n\n6.2 Cryptographic & Technical Safeguards:\n(a) Data in Transit: All communications between client browsers, native driver mobile endpoints, and the API gateway are encrypted using Transport Layer Security (TLS 1.3), enforcing HTTP Strict Transport Security (HSTS);\n(b) Data at Rest: Database storage volumes, database backups, and media buckets are secured using Advanced Encryption Standard (AES-256);\n(c) Access Governance: Production database access is governed by strict Role-Based Access Control (RBAC), multi-factor hardware security keys (FIDO2), and automated audit trails.\n\n6.3 Data Minimization & Retention Schedules:\n(a) Fleet Safety Inspections & VOR Records: Retained for fifteen (15) months in accordance with DVSA statutory guide to maintaining roadworthiness;\n(b) Driver Working Time & Duty Counters: Retained for twenty-four (24) months to fulfill statutory inspection criteria under the Road Transport (Working Time) Regulations 2005;\n(c) Financial & Billing Manifests: Retained for six (6) full financial years plus the current operating year pursuant to Section 388 of the Companies Act 2006 and HMRC requirements;\n(d) Raw GPS Coordinate Breadcrumbs: Pruned or consolidated into generalized route vectors after ninety (90) days, unless an open insurance claim or active accident report mandates preservation.',
      },
      {
        heading: '7. Authorized Third-Party Sub-Processors & Infrastructure Partners',
        body: 'Tachyo LTD maintains formal Data Processing Agreements containing statutory Article 28 UK GDPR commitments with all downstream service providers:\n\n7.1 Supabase Inc. (Database & Authentication Engine):\nFunction: Database hosting, edge compute, and user identity management.\nLocation: Dedicated infrastructure deployed in AWS London (eu-west-2), UK.\n\n7.2 Machine-Vision OCR Processing Engine:\nFunction: Parsing numerical text from fuel receipt images.\nSecurity Commitment: Image streams processed ephemerally within the AWS London perimeter without permanent retention of raw imagery outside Tachyo’s encrypted storage.',
      },
      {
        heading: '8. Data Subject Rights, Inquiries & Subject Access Requests (SARs)',
        body: 'Under Chapter III of the UK GDPR and the Data Protection Act 2018, individuals possess statutory entitlements regarding their personal data. The operational mechanics for executing these rights depend strictly on whether Tachyo LTD acts as an independent Controller or as a technical Processor.\n\n8.1 Scope of Statutory Rights:\n(a) Right of Access (Article 15 UK GDPR): The entitlement to obtain formal confirmation as to whether personal data is being processed and receive a structured copy of all associated records.\n(b) Right to Rectification (Article 16 UK GDPR): The entitlement to mandate the correction of inaccurate personal data or completion of incomplete operational records.\n(c) Right to Erasure / "Right to be Forgotten" (Article 17 UK GDPR): The right to request the irreversible deletion of personal data, subject to the statutory retention exclusions detailed in Clause 8.4.\n(d) Right to Restriction of Processing (Article 18 UK GDPR): The right to freeze the active processing of records during ongoing disputes regarding accuracy or lawful basis.\n(e) Right to Data Portability (Article 20 UK GDPR): The entitlement to receive personal data in a structured, commonly used, and machine-readable format (e.g., CSV, JSON).\n(f) Right to Object (Article 21 UK GDPR): The entitlement to challenge data processing predicated upon Legitimate Interests under Article 6(1)(f).\n\n8.2 Processing Subject Access Requests for Direct Account Data (Tachyo as Controller):\n(a) Transport Managers, enterprise account holders, and administrative personnel exercising rights over billing, account credentials, or corporate communications must submit a formal request via email to privacy@tachyo.co.uk.\n(b) Tachyo LTD shall confirm receipt within five (5) business days and complete identity verification using multi-factor cryptographic credentials.\n(c) Compliant disclosures shall be executed without undue delay and at the latest within one (1) calendar month of receipt, extensible by two (2) further months for complex enterprise queries in accordance with Article 12(3) UK GDPR.\n\n8.3 Protocol for Employed, Subcontracted, and Agency Drivers (Tachyo as Processor):\n(a) Where a commercial driver (whether employed via PAYE, engaged as an independent subcontractor, or supplied via an employment agency) submits a SAR directly to Tachyo LTD concerning telematics, GPS traces, fuel receipts, or shift logs, Tachyo LTD acts strictly as a Data Processor.\n(b) Tachyo LTD possesses neither the lawful authority nor the independent legal entitlement to alter, disclose, or delete Customer-controlled operational records without express written authorization from the primary Data Controller (the Haulier / Transport Operator).\n(c) Routing SLA: Tachyo LTD covenants to notify and forward any driver-originated SAR or inquiry to the designated Transport Manager of the relevant Customer within three (3) business days of electronic receipt.\n(d) Tachyo LTD shall provide technical tooling enabling the Customer to extract, export, or redact driver records to fulfill statutory deadlines, but legal accountability for timely response rests exclusively with the Customer.\n\n8.4 Statutory Precedence Over Erasure Requests (Legal & Regulatory Overrides):\n(a) The Right to Erasure under Article 17 is expressly curtailed where continued retention is necessary for compliance with a legal obligation or the establishment, exercise, or defence of legal claims pursuant to Article 17(3)(b) and (e) UK GDPR.\n(b) Requests by drivers to purge shift timestamps, telematics traces, or defect audit logs shall be refused to the extent that such records are mandated for preservation by:\n(i) The Goods Vehicles (Licensing of Operators) Act 1995 (15-month roadworthiness inspection preservation);\n(ii) The Road Transport (Working Time) Regulations 2005 (24-month working time enforcement);\n(iii) The Limitation Act 1980 (statutory 6-year period for commercial contract and tortious negligence claims).',
      },
      {
        heading: '9. Automated Processing, Algorithmic Heuristics & Profiling (Article 22 UK GDPR)',
        body: 'This section formally defines the mathematical and heuristic nature of the Tachyo platform to disclaim the existence of solely automated legal decision-making.\n\n9.1 Absence of Solely Automated Determinations:\n(a) Tachyo LTD does not execute automated decision-making processes that produce legal effects concerning individuals or similarly significantly affect them within the statutory definition of Article 22(1) UK GDPR.\n(b) The software does not automatically levy disciplinary sanctions, adjust contractual remuneration rates, or terminate driver access tokens without human intervention.\n\n9.2 Algorithmic Triage & Heuristic UI Indicators:\n(a) The platform applies deterministic algorithms to raw input data to generate advisory visualizations, specifically utilizing:\n(i) Red (#CC0000) for "Critical VOR" states where an unresolved major defect or an overdue inspection (≤ 0 days) is detected;\n(ii) Amber (#F59E0B) for "Action Required / Due Soon" states within user-configured threshold envelopes;\n(iii) Emerald (#10B981) for "Compliant" states where operational tolerances remain within configured parameters.\n(b) These heuristic classifications represent computational summaries of stored database records and do not constitute autonomous expert determinations.\n\n9.3 Mandatory "Human-in-the-Loop" Operational Architecture:\n(a) Any operational action that impacts vehicle roadworthiness, legal compliance, or driver duty status mandates an affirmative manual action by a qualified human operator (e.g., driver walkaround verification, Transport Manager sign-off, or certified workshop clearance).\n(b) The customer acknowledges that Tachyo’s algorithms function as operational decision-support software and that sole professional accountability for vehicle release rests with the Operator Licence holder.\n\n9.4 Margin, Yield & Performance Calculations:\n(a) Calculations displayed within profitability and driver yield dashboards (e.g., gross margin percentages, hourly revenue yield, fuel efficiency indicators) are arithmetic aggregations derived from uploaded carrier manifests, shift timestamps, and approved fuel receipts.\n(b) Such calculations serve analytical operational purposes only and must be independently audited by the Customer before implementation in payroll systems or statutory tax filings.',
      },
      {
        heading: '10. Personal Data Breach Management & Incident Notification',
        body: 'Tachyo LTD maintains rigorous incident response protocols aligned with the Data Protection Act 2018 and National Cyber Security Centre (NCSC) guidance.\n\n10.1 Definition of a Security Incident: A personal data breach constitutes any confirmed breach of security leading to the accidental or unlawful destruction, loss, alteration, unauthorized disclosure of, or access to, personal data transmitted, stored, or otherwise processed within the AWS London infrastructure.\n\n10.2 Processor-to-Controller Notification Protocols (Article 33(2) UK GDPR):\n(a) Upon confirming a personal data breach affecting Customer fleet, telematics, or driver data, Tachyo LTD shall notify the primary account administrator and designated Transport Manager without undue delay, and in any event within forty-eight (48) hours of formal confirmation.\n(b) The notification shall detail:\n(i) The nature and technical vector of the personal data breach;\n(ii) The approximate categories and volume of data subjects and telematics records implicated;\n(iii) The identity and contact coordinates of the Data Protection Officer;\n(iv) Immediate mitigation measures implemented to contain the security incident;\n(v) Recommended containment actions for the Customer.\n\n10.3 Direct Supervisory Reporting (Tachyo as Controller — Article 33(1) UK GDPR): Where a confirmed breach occurs concerning data for which Tachyo LTD acts as an independent Controller (e.g., administrative account credentials, billing tokens, corporate identity data), Tachyo LTD shall formally notify the Information Commissioner’s Office (ICO) within seventy-two (72) hours of becoming aware of the event, unless the breach is assessed as unlikely to result in a risk to the rights and freedoms of natural persons.\n\n10.4 Forensic Preservation & Remediation Commitments: Tachyo LTD shall preserve all relevant network audit trails, server access logs, and edge firewall records within its AWS London perimeter for forensic analysis and provide reasonable technical assistance to Customers in discharging their notification obligations under Article 34 UK GDPR.',
      },
      {
        heading: '11. Statutory Disclosures, Law Enforcement & Regulatory Cooperation',
        body: '11.1 Subpoenas, Court Warrants & Judicial Orders:\n(a) Tachyo LTD shall not disclose personal data to third parties except where compelled to do so by a valid order issued by a court of competent jurisdiction within England and Wales (including the High Court, Crown Court, or County Court).\n(b) Prior to executing any judicial disclosure, Tachyo LTD shall review the legal validity of the warrant with external legal counsel and, where legally permissible, provide prompt written notification to the affected Customer to enable them to seek protective relief.\n\n11.2 Regulatory Oversight (DVSA & Traffic Commissioners):\n(a) The Customer acknowledges that records stored within the Tachyo platform concerning vehicle maintenance, defect rectification, and driver hours may be subject to inspection by the Driver and Vehicle Standards Agency (DVSA) or formal request by a Traffic Commissioner for Great Britain under the Goods Vehicles (Licensing of Operators) Act 1995.\n(b) Tachyo LTD provides self-service export utilities to enable Customers to produce required compliance packs during statutory audits or Public Inquiries (PI).\n\n11.3 Police Investigations & Road Traffic Incident Inquiries:\n(a) Under Schedule 2, Part 1, Paragraph 2 of the Data Protection Act 2018, Tachyo LTD may process and disclose specific telematics records (e.g., historical GPS breadcrumbs, speed vectors, or shift logs) to Police forces in England, Wales, or Police Scotland where:\n(i) The request is formally submitted via an official Section 29 / Schedule 2 Data Protection Request Form signed by an authorized Police Officer;\n(ii) The disclosure is strictly necessary for the prevention or detection of crime, or the apprehension or prosecution of offenders (e.g., investigation of fatal or serious road collisions under the Road Traffic Act 1988).',
      },
    ],
  },
  terms: {
    title: 'TACHYO LTD — B2B MASTER SAAS AGREEMENT & TERMS OF SERVICE',
    sections: [
      {
        heading: '1. Definitions & Commercial B2B Status',
        body: '1.1 Parties: This Master Services Agreement ("Agreement") is entered into between Tachyo LTD registered at 20 South Street, Doncaster, England, DN4 5FH ("Tachyo", "Provider"), and the commercial entity subscribing to the Service ("Customer", "Operator").\n\n1.2 Strict Exclusion of Consumer Law: The Service is supplied solely on a business-to-business (B2B) basis for commercial transport fleet operations. To the fullest extent permitted by law, the provisions of the Consumer Rights Act 2015 and the Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013 are expressly excluded.\n\n1.3 Authority to Bind: The individual accepting these terms warrants that they possess legal authority to enter into binding commercial contracts on behalf of the Customer entity.',
      },
      {
        heading: '2. SaaS Licence Grant & Access Restrictions',
        body: '2.1 Scope of Licence: Tachyo grants the Customer a non-exclusive, non-transferable, revocable licence to access the web dispatch platform and deploy the mobile PWA endpoint to authorized drivers solely for internal fleet telematics and compliance management.\n\n2.2 Prohibited Conduct: The Customer shall not, and shall not permit any employee, agency worker, or third party to:\n(a) Reverse engineer, decompile, or extract source code from the Tachyo platform;\n(b) Resell, sub-license, white-label, or provide commercial bureau dispatch services to external hauliers without prior written consent;\n(c) Inject synthetic telemetry, manipulate GPS time-series records, or simulate vehicle inspections through programmatic scripting.',
      },
      {
        heading: '3. Heuristic UI, Algorithmic Indicators & Statutory Roadworthiness Disclaimer',
        body: '3.1 Non-Certification Status of Visual Signals: The Customer acknowledges that all visual status indicators, color-coded badges, and operational banners displayed across the Service:\n(a) Emerald Green (#10B981 / "Compliant"): Signifies solely that recorded database entries have not triggered a mathematical threshold alert based on user-entered parameters;\n(b) Amber (#F59E0B / "Due Soon"): Signifies solely that an upcoming statutory date falls within the Customer-configured warning lead time;\n(c) Brand Red (#CC0000 / "Critical VOR"): Reflects an active recorded safety defect or expired inspection date (≤ 0 days);\n(d) Do NOT constitute a statutory Certificate of Roadworthiness, mechanical sign-off, or verification under the Road Traffic Act 1988.\n\n3.2 Mandatory Human Verification: The visual representation of an asset as "Compliant" or "Green" within the UI shall never replace, diminish, or alter the driver’s statutory duty to conduct a physical pre-use walkaround inspection, nor the Transport Manager\'s duty to independently inspect workshop documentation.\n\n3.3 Zero Liability for Roadside Enforcement & DVSA Sanctions: Tachyo LTD disclaims all liability for:\n(a) Prohibition notices (including immediate or delayed PG9 notices) issued by DVSA examiners or Police constables;\n(b) Roadside vehicle impoundments, fixed penalty notices, or immobilization fees;\n(c) Overdue Periodic Maintenance Inspections (PMIs) or missed Roller Brake Tests resulting from inaccurate date entries by the Customer.',
      },
      {
        heading: '4. Operator Licence (O-Licence) Statutory Compliance',
        body: '4.1 Primacy of Statutory Undertakings: The Customer, as the statutory Operator Licence holder under the Goods Vehicles (Licensing of Operators) Act 1995, retains exclusive, non-delegable legal accountability for fulfilling all license undertakings before the Traffic Commissioners for Great Britain.\n\n4.2 Transport Manager Professional Responsibility: Tachyo functions strictly as passive operational software. It does not act as, nor replace the statutory functions of, a professionally competent Transport Manager (CPC holder).\n\n4.3 Audit & Public Inquiry Disclaimers: In the event that the Customer is summoned to a formal Public Inquiry (PI) or Preliminary Hearing before a Traffic Commissioner, Tachyo LTD accepts zero responsibility for regulatory curtailments, licence suspensions, or revocations resulting from poor maintenance regimes or driver hours breaches.',
      },
      {
        heading: '5. Financial Yield Analytics, Smart CSV Ingestion & Fuel OCR Disclaimers',
        body: '5.1 Advisory Nature of Financial Computations:\n(a) All figures generated across the Profitability and Settlement dashboards (including Gross Billed Revenue, Shift Payroll Yield, Fuel Running Costs, and Gross Profit Margins) represent computational estimates derived from Customer-provided inputs.\n(b) The Service is an operational management aid and does not constitute professional accounting, taxation, or payroll processing software under the purview of HM Revenue & Customs (HMRC).\n\n5.2 Carrier Remittance & Manifest Parsing (Fuzzy Ingestion):\n(a) While the platform employs heuristic algorithms to auto-detect and map columns from carrier remittance documents (including Amazon Relay, DHL, Eddie Stobart, and third-party freight brokers), the Customer maintains sole responsibility for confirming the accuracy of rate mappings prior to reconciliation.\n(b) Tachyo LTD accepts zero liability for discrepancies, missing rate items, disputed demurrage charges, or carrier chargebacks resulting from malformed CSV/XLSX imports.\n\n5.3 Fuel Docket Machine-Vision OCR Parsing:\n(a) Optical Character Recognition (OCR) applied to driver fuel receipts is subject to physical image degradation (e.g., thermal ink fade, poor lighting, or camera distortion).\n(b) Extracted totals, volumes in litres, and VAT registrations must be manually audited and approved by the Customer\'s dispatch or accounts team before export. Tachyo disclaims all liability for incorrect input VAT reclaim submissions made to HMRC.\n\n5.4 Payroll Exclusion & Wage Dispute Indemnity:\n(a) Calculations of driver earnings based on hourly rates, day rates, or per-mile allocations serve purely for internal job-costing analysis.\n(b) The Customer warrants that formal driver payroll, minimum wage compliance (National Minimum Wage Act 1998), and working time pay (Working Time Regulations 1998) are managed through an independent payroll system. The Customer shall indemnify Tachyo against any driver unlawful deduction of wages claims before an Employment Tribunal.',
      },
      {
        heading: '6. Absolute Limitation of Financial Liability (The Liability Cap)',
        body: '6.1 Uncapped Liabilities (Statutory Protections): Nothing in this Agreement shall limit or exclude either party\'s liability for:\n(a) Death or personal injury caused by its negligence;\n(b) Fraud or fraudulent misrepresentation;\n(c) Any other liability that cannot be excluded under the laws of England and Wales.\n\n6.2 Consequential & Indirect Loss Exclusion: To the maximum extent permitted by the Unfair Contract Terms Act 1977 (UCTA), Tachyo LTD shall have no liability to the Customer, whether in contract, tort (including negligence), breach of statutory duty, or otherwise, for:\n(a) Loss of profits, commercial contracts, or revenue (including cancellation of haulier contracts by Amazon, DHL, or prime contractors);\n(b) Loss of business opportunity, goodwill, or commercial reputation;\n(c) Fines, fixed penalties, or regulatory levies imposed by the DVSA, Traffic Commissioners, or Police constables;\n(d) Loss, corruption, or temporary inaccessibility of data or telematics breadcrumbs.\n\n6.3 Total Aggregate Financial Ceiling:\n(a) Subject to Clause 6.1, Tachyo LTD’s total aggregate liability arising out of or related to the Service, whether in contract, tort, or otherwise, shall be strictly limited to the total subscription fees actually paid by the Customer to Tachyo LTD in the three (3) months immediately preceding the event giving rise to the claim.\n(b) Both parties explicitly agree that this financial cap satisfies the requirement of reasonableness under Section 11 of the Unfair Contract Terms Act 1977, taking into account the subscription pricing model.',
      },
      {
        heading: '7. 14-Day Commercial Guarantee, Cancellation & Cryptographic Data Purge',
        body: '7.1 14-Day Money-Back Commercial Guarantee:\n(a) New enterprise subscribers may terminate their subscription within fourteen (14) calendar days of the initial subscription payment date.\n(b) Upon receipt of written termination to support@tachyo.co.uk within this 14-day window, Tachyo LTD shall process a 100% refund of the initial subscription fee to the original payment method within five (5) business days.\n\n7.2 Post-Termination 14-Day Data Export Window:\n(a) Following account cancellation or termination, the Customer is granted a strict window of fourteen (14) calendar days to access the web panel and execute self-service data exports (CSV and PDF compliance logs).\n(b) During this 14-day window, telematics ingestion and mobile app check-ins are suspended; the portal operates in read-only export mode.\n\n7.3 Irreversible Cryptographic Hard Purge:\n(a) Exactly at 23:59 BST on the fourteenth (14th) calendar day following termination, the system automatically executes a script executing a permanent hard delete across all Customer databases, database backups, uploaded walkaround defect photos, and fuel receipt dockets stored within AWS London (eu-west-2).\n(b) Following this automated event, data recovery is mathematically impossible. Tachyo LTD disclaims all responsibility for Customer records lost due to failure to export compliance logs within the 14-day window prior to statutory DVSA audits.',
      },
      {
        heading: '8. Governing Law, Dispute Resolution & Jurisdiction',
        body: '8.1 Governing Law: This Agreement and any dispute or claim arising out of or in connection with it or its subject matter or formation (including non-contractual disputes or claims) shall be governed by and construed in accordance with the laws of England and Wales.\n\n8.2 Mandatory Pre-Litigation Executive Negotiation: Prior to initiating formal court proceedings, senior commercial executives of both parties must engage in good-faith negotiations for a period of not less than thirty (30) calendar days following electronic delivery of a formal Dispute Notice.\n\n8.3 Exclusive Jurisdiction: Each party irrevocably agrees that the Courts of England and Wales (specifically sitting in Doncaster, Sheffield, or London) shall have exclusive jurisdiction to settle any dispute or claim arising out of or in connection with this Agreement.',
      },
    ],
  },
  dpa: {
    title: 'TACHYO LTD — DATA PROCESSING ADDENDUM (DPA)',
    sections: [
      {
        heading: 'Document Reference: TCH-UK-DPA-2026-V1',
        body: 'Pursuant to Article 28 of the UK General Data Protection Regulation (UK GDPR).\n\nParties: Tachyo LTD ("Data Processor") and the Contracting Fleet Operator ("Data Controller").',
      },
      {
        heading: '1. Scope, Subject Matter & Statutory Roles',
        body: '1.1 Regulatory Scope: This Addendum governs the processing of personal data by Tachyo LTD on behalf of the Customer in connection with the provision of the Tachyo fleet telematics, compliance, and yield platform pursuant to Article 28(3) of the UK GDPR.\n\n1.2 Designation of Roles:\n(a) The Customer is and shall remain the Data Controller in respect of all fleet operational data, including driver location data, shifts, tachograph advisory calculations, walkaround defect images, and fuel receipts.\n(b) Tachyo LTD is and shall act strictly as the Data Processor acting solely under the documented instructions of the Customer.\n\n1.3 Details of Processing Activities:\n(a) Subject Matter: Automated ingestion, calculation, display, and storage of commercial vehicle fleet telematics, driver duty timestamps, vehicle roadworthiness logs, and delivery remittance reconciliation.\n(b) Duration: The duration of the Customer\'s commercial subscription plus the mandatory 14-day data export and retention window.\n(c) Categories of Data Subjects: Commercial HGV drivers (employed under PAYE, engaged as self-employed subcontractors, or supplied via third-party driver recruitment agencies), Transport Managers, and logistics dispatchers.\n(d) Types of Personal Data: Driver full names, internal identification numbers, mobile GPS coordinates, vehicle registration mark (VRM) linkage, shift hours, photographs of defect walkaround inspections, and fuel pump receipt images.',
      },
      {
        heading: '2. Processor Obligations & Documented Instructions',
        body: '2.1 Processing Instructions: Tachyo LTD shall process personal data only on documented instructions from the Customer (including via the configuration settings and user interactions within the SaaS dashboard), unless required to do so by the laws of England and Wales or statutory UK public authority orders.\n\n2.2 Staff Confidentiality: Tachyo LTD guarantees that all software engineers, support specialists, and personnel authorized to access production databases have committed themselves to strict statutory obligations of confidentiality.\n\n2.3 Technical & Organizational Measures (Security): Tachyo LTD shall maintain appropriate technical and organizational measures to ensure a level of security appropriate to the risk, including:\n(a) Storage of database records strictly within AWS London (eu-west-2);\n(b) Cryptographic encryption of database storage volumes and backups using Advanced Encryption Standard (AES-256);\n(c) Enforced end-to-end transport layer encryption (TLS 1.3) across all API communications;\n(d) Automated daily database snapshot backups retained in an encrypted state.',
      },
      {
        heading: '3. Sub-Processors & Infrastructure Authorisation',
        body: '3.1 General Written Authorisation: The Customer hereby grants Tachyo LTD general written authorisation to engage the third-party sub-processors specified below:\n(a) Supabase Inc. — Managed PostgreSQL Database Engine & Authentication (hosted in AWS London, UK);\n(b) Amazon Web Services EMEA SARL — S3 Object Storage for defect images and fuel dockets (AWS London eu-west-2, UK);\n(c) Stripe Payments UK, Ltd. — Subscription payment processing and billing infrastructure (London, UK);\n(d) Twilio Ireland Limited / SendGrid UK — SMS VOR safety alerts and critical two-factor notifications.\n\n3.2 Sub-Processor Flow-Down: Tachyo LTD warrants that it imposes statutory data protection obligations no less onerous than those set out in this DPA upon every sub-processor via formal contract.\n\n3.3 Notification of Sub-Processor Alterations: Tachyo LTD shall provide the Customer with at least thirty (30) calendar days\' electronic notice prior to appointing any new sub-processor, providing the Customer with the commercial opportunity to object on reasonable data protection grounds.',
      },
      {
        heading: '4. The Driver Employment Tribunal & Surveillance Shield (Total Indemnity)',
        body: '4.1 Customer Warranty on Driver Transparency: The Customer expressly warrants and covenants that:\n(a) Prior to requiring or requesting any driver (whether direct employee, agency driver, or self-employed sub-contractor) to download, log into, or use the Tachyo mobile endpoint, the Customer has provided said driver with a statutory Article 13/14 UK GDPR Employee Privacy Notice;\n(b) The Customer possesses an audited lawful basis under Article 6 of the UK GDPR (such as Legitimate Interests supported by an LIA, or statutory compliance with the Goods Vehicles Act 1995) to conduct GPS tracking and duty-time verification;\n(c) The Customer maintains sole responsibility for complying with the Information Commissioner’s Employment Practices Code regarding electronic monitoring at work.\n\n4.2 Full Indemnification by Customer:\n(a) The Customer shall indemnify, defend, and hold harmless Tachyo LTD, its directors, and officers against all liabilities, losses, damages, legal costs (calculated on a full indemnity solicitor-and-own-client basis), fines, and settlements arising from:\n(i) Any claim, grievance, or Employment Tribunal action brought by a driver alleging unlawful workplace surveillance, constructive dismissal, or infringement of privacy rights under Article 8 of the European Convention on Human Rights (ECHR);\n(ii) Any enforcement action or administrative monetary penalty issued by the Information Commissioner\'s Office (ICO) resulting from the Customer\'s failure to establish a lawful basis for monitoring its transport workforce.',
      },
      {
        heading: '5. Data Subject Rights & Regulatory Assistance',
        body: '5.1 Assistance via In-Product Utilities: Taking into account the nature of the processing, Tachyo LTD shall assist the Customer by appropriate technical measures, insofar as this is commercially possible, to respond to drivers exercising statutory rights under Chapter III of the UK GDPR (including Subject Access Requests and Rectification).\n\n5.2 Driver Request Routing: Where a driver submits a Subject Access Request (SAR) directly to Tachyo LTD, Tachyo shall not disclose any Customer records directly, but shall notify the Customer\'s designated Transport Manager within three (3) business days.\n\n5.3 Exclusion of Unilateral Erasure: Tachyo LTD shall not alter, redact, or erase any historical defect inspections, maintenance confirmations, or duty hours records upon direct driver request, recognizing that such records represent statutory property of the Customer mandated for retention under the Goods Vehicles (Licensing of Operators) Act 1995.',
      },
      {
        heading: '6. Audit Rights & Regulatory Inspections',
        body: '6.1 Provision of Compliance Proof: Tachyo LTD shall make available to the Customer all information reasonably necessary to demonstrate compliance with the statutory obligations laid down in Article 28 UK GDPR.\n\n6.2 Audit Parameters:\n(a) Any physical or electronic audit by the Customer or its appointed independent auditor shall occur no more than once in any twelve-month period;\n(b) Audits mandate at least thirty (30) business days’ prior written notice;\n(c) Audits shall be conducted during normal UK business hours without disrupting operational SaaS infrastructure;\n(d) Audits shall not grant access to proprietary source code, underlying intellectual property, or data belonging to other multi-tenant fleet subscribers.',
      },
      {
        heading: '7. Termination, 14-Day Export Window & Irreversible Hard Purge',
        body: '7.1 Cessation of Processing: Upon termination or expiration of the Customer’s SaaS subscription, Tachyo LTD shall immediately halt all active telematics processing, driver check-in ingestions, and OCR parsing.\n\n7.2 Mandatory 14-Day Self-Service Export: The Customer shall maintain self-service access to the read-only reporting portal for exactly fourteen (14) calendar days post-termination to export all historical fleet compliance logs, inspection dockets, and settlement records in structured .csv format.\n\n7.3 Automated Cryptographic Purge:\n(a) At 23:59 BST on the fourteenth (14th) calendar day following subscription termination, Tachyo LTD’s automated database routines shall execute an irreversible, cryptographic hard deletion of all Customer personal data across active database tables, object storage buckets (receipts and defect photos), and temporary session logs within AWS London (eu-west-2).\n(b) Backup archives shall be overwritten and eradicated in accordance with standard disaster recovery rotation cycles (not to exceed thirty (30) days).\n\n7.4 Certification of Destruction: Upon written request received prior to the expiration of the 14-day window, Tachyo LTD shall issue an electronic Certificate of Data Destruction confirming compliance with this Clause.',
      },
    ],
  },
  telematics: {
    title: 'TACHYO LTD — DRIVER TELEMATICS, GPS & MOBILE APP POLICY',
    sections: [
      {
        heading: 'Document Reference: TCH-UK-TEL-2026-V1',
        body: 'Statutory Alignment: UK GDPR, Data Protection Act 2018, Road Traffic Act 1988, Transport Act 1968.',
      },
      {
        heading: '1. Hardware-Level Location Permissions & Operating System Architecture',
        body: '1.1 Low-Level Hardware Permissions:\n(a) Operation of the mobile application mandates the granting of high-precision Global Navigation Satellite System (GNSS/GPS) access permissions at the operating system level:\nApple iOS: CoreLocation framework authorization set to "Always Allow" or "While Using the App";\nGoogle Android: ACCESS_FINE_LOCATION and ACCESS_BACKGROUND_LOCATION permissions.\n(b) Operating System Autonomy: The Customer and Driver acknowledge that mobile operating systems independently control hardware power states, antenna polling intervals, and permission dialogs.\n\n1.2 Distinction Between OS Permission and App Duty State:\n(a) Granting background location permissions to the device operating system enables the software container to execute location polling when the application interface is minimized.\n(b) Hardware De-coupling: Revocation of physical satellite querying can only be executed by the end-user directly through device system settings (Settings ➔ Tachyo ➔ Location ➔ Never).',
      },
      {
        heading: '2. Active Duty Tracking Scope & Edge Gateway Dropping',
        body: '2.1 Strict Shift-Bound Processing Window:\n(a) Telematics data processing, geographic vector calculations, and database persistence occur strictly and exclusively during an active duty shift.\n(b) An active duty shift is initiated programmatically when the driver completes the digital check-in sequence ("Start Shift" / "Asset Coupling") and concludes definitively when the driver executes "End Shift".\n\n2.2 Post-Shift Packet Dropping at Edge Perimeter:\n(a) Any stray GNSS telemetry packets transmitted by a device hardware background process while in an inactive or uncoupled shift state are dropped at the API edge gateway without ingestion, persistence, or display.\n(b) Tachyo LTD covenants that it maintains zero historical database records, analytical profiles, or real-time maps of driver geographic positioning outside active operational shift logs.',
      },
      {
        heading: '3. Atmospheric, Subterranean & Hardware Signal Attenuation',
        body: '3.1 Environmental Attenuation Factors: The accuracy, continuity, and availability of telematics data points are subject to external technical and atmospheric constraints beyond Tachyo LTD\'s control, including:\n(a) Signal blockage caused by transit through tunnels, subterranean loading bays, metal-clad logistics distribution hubs, or deep urban topography;\n(b) Battery preservation protocols enforced by mobile operating systems (e.g., Apple iOS Low Power Mode, Android Doze Mode, OEM memory managers);\n(c) Mobile cellular network dropouts, SIM card data starvation, or regional roaming latency.\n\n3.2 Tachograph & Driving Hours Primacy:\n(a) Calculations displayed on the mobile interface (e.g., 4.5-hour continuous driving counters, 6.0-hour Working Time Directive meters) are mathematical estimators derived from mobile motion vectors.\n(b) In the event of any divergence between Tachyo mobile software telemetry and the digital vehicle tachograph unit (VU / Smart Tacho 2), the calibrated on-board vehicle tachograph and driver smart card maintain absolute legal precedence under Retained Regulation (EC) 561/2006.\n(c) Tachyo LTD accepts zero liability for roadside DVSA driving hours infringements resulting from telemetry drift, lost pings, or device power depletion.',
      },
      {
        heading: '4. Device Camera Permissions, Walkaround Proof & Fuel Receipt OCR',
        body: '4.1 Limited Optical Access Scope:\n(a) Device camera hardware access permissions are utilized solely to capture contemporaneous evidence of vehicle roadworthiness defects during daily walkaround checks and physical fuel pump purchase dockets.\n(b) The application does not maintain automated background camera access, video streaming capability, or facial recognition biometric processing.\n\n4.2 EXIF Metadata & Geostamp Verification:\n(a) Photographs submitted through the walkaround defect inspection workflow automatically extract embedded EXIF metadata, capturing exact device timestamps and geographic coordinates at the moment of shutter actuation.\n(b) This metadata is processed to provide the Transport Manager with auditable cryptographic proof that the physical inspection was performed in proximity to the commercial asset, fulfilling DVSA Guide to Maintaining Roadworthiness evidentiary expectations.\n\n4.3 Commercial Fuel Receipts & OCR Limitations:\n(a) Photographic captures of fuel and AdBlue dockets are processed via optical machine vision solely to extract transactional integers (litres dispensed, total value in £ GBP, VAT numbers).\n(b) Drivers and dispatch staff must manually verify parsed figures against the raw receipt image. Tachyo LTD disclaims liability for fiscal or HMRC VAT filing errors resulting from folded, faded, or illegible paper dockets.',
      },
      {
        heading: '5. Driver App Security & Credential Integrity',
        body: '5.1 Prohibition of Account Sharing: Drivers shall not disclose authentication credentials or share active mobile sessions with any other driver.\n\n5.2 Vehicle Registration Association: The driver is strictly responsible for ensuring that the vehicle registration mark (VRM) entered during mobile check-in accurately matches the physical tractor unit and trailer coupled during the shift.\n\n5.3 Tampering & Mock Locations: The use of mock-location developer tools, GPS spoofing software, or modified operating system kernels (jailbreaking/rooting) is strictly prohibited and results in immediate automated account suspension and formal notification to the Operator Licence holder.',
      },
    ],
  },
};

// Waypoints list representing the HGV route between Rossington Depot and Wheatley Depot
const routeWaypoints = [
  { latitude: 53.481798, longitude: -1.086552 }, // Rossington Depot Base A
  { latitude: 53.4920, longitude: -1.0810 },
  { latitude: 53.5020, longitude: -1.0750 },
  { latitude: 53.5120, longitude: -1.0710 },
  { latitude: 53.5220, longitude: -1.0730 },
  { latitude: 53.5320, longitude: -1.0770 },
  { latitude: 53.5420, longitude: -1.0840 },
  { latitude: 53.550248, longitude: -1.091061 }  // Wheatley Depot Base B
];

// Initialize Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Mock mode ONLY when env vars are genuinely missing — never block real project URLs
export const isMockMode =
  !supabaseUrl ||
  !supabaseUrl.startsWith('http') ||
  supabaseUrl.includes('YOUR_PROJECT');

export let supabase: SupabaseClient | null = null;
if (!isMockMode) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
}

// Interfaces & Role Types
export type UserRole = 'logistics' | 'payroll_admin';

// Per-organization alert/flag thresholds (migration 038). Defaults here match
// the values that were hardcoded platform-wide before that migration, so any
// environment where the migration hasn't been applied yet (columns don't
// exist) behaves identically to before — see loadOrgAlertSettings.
export interface OrgAlertSettings {
  longShiftFlagHours: number;
  idleAlertMinutes: number;
  nightOutMinGapHours: number;
  nightOutMaxGapHours: number;
  complianceAlertLeadDays: number;
  // Migration 050 — whether the driver app's Action Hub shows "Request
  // Night Out" at all. Defaults false: an operator who doesn't run a
  // Night Out allowance scheme shouldn't see the option.
  allowDriverNightOutRequests: boolean;
  // Alert Monitors consolidation (migration 056) — walkaroundCheckTargetMinutes
  // existed on organizations since 052 but had no save path anywhere until
  // now. The per-org configurable fuel-anomaly floor/rolling-drop settings
  // that used to live here were retired in migration 070: fuel theft
  // detection is now a single fixed fleet-wide rule (7.0 MPG / 40 L/100km
  // on brim-to-brim fills), computed and stored server-side, not a tunable
  // per-org setting.
  walkaroundCheckTargetMinutes: number;
  // Migration 059 — minutes a driver's vehicle is stationary before the
  // app reminds them to attach a load or confirm its delivery.
  loadReminderMinutes: number;
  /** Company-wide off switch for idle detection (dashboard + Alert Panel). */
  idleDetectionEnabled: boolean;
}
export const DEFAULT_ORG_ALERT_SETTINGS: OrgAlertSettings = {
  longShiftFlagHours: 18,
  idleAlertMinutes: 50,
  idleDetectionEnabled: true,
  nightOutMinGapHours: 8,
  nightOutMaxGapHours: 15,
  complianceAlertLeadDays: 30,
  allowDriverNightOutRequests: false,
  walkaroundCheckTargetMinutes: 15,
  loadReminderMinutes: 30,
};

// Compliance & Safety types now live in ./pages/Compliance.tsx, which owns
// its own data fetching against the vehicles/incident_reports tables
// (migrations 040/041) rather than routing through this file's state.

export interface EmployeeRate {
  id?: string;
  driver_id: string;
  rate_type: string;
  fixed_rate?: number | null;
  mon_fri_rate: number;
  sat_rate: number;
  sun_rate: number;
  saturday_rate?: number;
  sunday_rate?: number;
  agency_name: string;
}

// A manually-set job tag, distinct from user_roles.department (which is
// which dashboard account type someone has — logistics vs payroll admin,
// an unrelated concept that happens to share the word "logistics").
type EmployeeProfession = 'driver' | 'mechanic' | 'logistics';

const PROFESSION_LABEL: Record<EmployeeProfession, string> = {
  driver: 'Drivers',
  mechanic: 'Mechanics',
  logistics: 'Logistics',
};
// Singular form for a per-employee role pill — "Logistics" has no clean
// singular via a trailing-s strip (that would read "Logistic"), so this
// is a real lookup, not PROFESSION_LABEL with an 's' chopped off.
const PROFESSION_LABEL_SINGULAR: Record<EmployeeProfession, string> = {
  driver: 'Driver',
  mechanic: 'Mechanic',
  logistics: 'Dispatcher',
};
const PROFESSION_ICON: Record<EmployeeProfession, typeof Truck> = {
  driver: Truck,
  mechanic: Wrench,
  logistics: Warehouse,
};

interface Employee {
  id: string;
  driver_id: string;
  full_name: string;
  phone: string;
  is_active: boolean;
  hourly_rate?: number;
  fixed_rate?: number | null;
  rate_profile?: string;
  created_at?: string;
  profession?: EmployeeProfession;
}

interface IdleAlert {
  id: string;
  driver_id: string;
  driver_name?: string;
  driver_code?: string;
  shift_id: string;
  started_at?: string;
  latitude: number;
  longitude: number;
  acknowledged: boolean;
  status?: 'active' | 'acknowledged';
  driver?: {
    full_name: string;
    driver_id: string;
  };
  is_sos?: boolean;
  created_at?: string;
  timestamp?: string;
  /** Real (via shift_id -> shifts.vehicle_id -> vehicles.vehicle_number) —
   * null when the shift this alert fired on never had a vehicle assigned. */
  vehicle_number?: string | null;
}

interface GpsOfflineEvent {
  id: string;
  driver_id: string;
  shift_id: string;
  started_at: string;
  detected_at: string;
  resolved_at: string | null;
  last_lat: number | null;
  last_lng: number | null;
  time_frozen: boolean;
  action_taken: 'alert' | 'time_frozen' | 'clocked_out';
  acknowledged: boolean;
  driver_name?: string;
  vehicle_number?: string | null;
}

interface GpsPolicySettings {
  enabled: boolean;
  afterMinutes: number;
  notifyDriver: boolean;
  action: 'none' | 'freeze_time' | 'clock_out';
  clockOutMinutes: number;
}
const DEFAULT_GPS_POLICY: GpsPolicySettings = { enabled: true, afterMinutes: 10, notifyDriver: true, action: 'none', clockOutMinutes: 60 };

interface Depot {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  geofence_radius_m: number;
  address: string | null;
}

/** The Compliance module's fleet register (migration 040) — reused here
 * (not duplicated) as the source of truth for "Assigned Vehicle" on a
 * shift, since it's the org's one real list of truck/trailer
 * registrations. */
interface FleetVehicle {
  id: string;
  vehicle_number: string;
  vehicle_type: 'truck' | 'trailer';
  is_active: boolean;
  make?: string | null;
}

interface Shift {
  id: string;
  driver_id: string;
  driver_name?: string;
  driver_code?: string;
  depot_name?: string;
  start_time: string;
  end_time: string | null;
  status: 'active' | 'completed';
  base_hourly_rate: number;
  override_rate: number | null;
  effective_rate: number;
  total_hours: number | null;
  total_pay: number | null;
  week_number: number;
  week_year?: number;
  night_out_status?: 'none' | 'pending' | 'approved' | 'rejected';
  night_out_requested?: boolean;
  night_out_amount?: number;
  night_out_allowance?: number | null;
  extras_amount?: number | null;
  extras_note?: string | null;
  rate_type?: string | null;
  real_id?: string;
  is_week_boundary?: boolean;
  boundary_label?: string;
  created_at?: string;
  /** Amount billed to the client for this load — lives in the separate
   * public.shift_revenue table, never on shifts itself, so drivers'
   * own select-star queries against shifts can never return it. Null
   * until a dispatcher sets it from Analytics → Load Revenue. */
  revenue_amount?: number | null;
  load_reference?: string | null;
  /** When the driver confirmed delivery in the app (migration 059). */
  load_delivered_at?: string | null;
  /** delivery-photos storage paths taken at Confirm Delivery (migration 060). */
  delivery_paperwork_path?: string | null;
  delivery_evidence_path?: string | null;
  /** Real (migration 045) — nullable until an admin assigns a vehicle to
   * this shift from the Profitability ledger or a settlement import
   * matches one by registration. */
  vehicle_id?: string | null;
  vehicle_number?: string | null;
  /** Real (migration 049) — independent nullable FK to the same
   * vehicles table as vehicle_id; a shift can have a tractor with no
   * trailer, or vice versa. */
  trailer_id?: string | null;
  trailer_number?: string | null;
  /** Real (migration 045) — set by the carrier settlement importer or
   * manually alongside load_reference; null for shifts never imported. */
  carrier_name?: string | null;
  /** Every load on the shift (migration 063), oldest first. */
  loads?: ShiftLoad[];
  /** Rate snapshot (migration 048) — the rate actually applied when this
   * shift was completed, locked at that moment and never re-derived from
   * the driver's live profile afterwards. Null until the shift has
   * completed at least once. See calculate_shift_financials() trigger. */
  applied_rate_type?: 'hourly' | 'fixed_shift' | null;
  applied_rate_amount?: number | null;
  rate_snapshot_timestamp?: string | null;
  deduction_amount?: number | null;
  deduction_reason?: string | null;
  is_micro_shift_override?: boolean;
  payroll_notes?: string | null;
}

/** Driver-submitted fuel receipt (migration 047) — starts 'pending';
 * only 'approved' rows count toward the Profitability cockpit's Actual
 * Fuel Cost, so an unreviewed photo can never silently inflate anyone's
 * numbers. receipt_photo_path is a private Storage object path, same
 * shape as incident_reports.photo_urls — resolved to a signed URL only
 * when actually displaying the thumbnail/lightbox. */
interface FuelReceipt {
  id: string;
  driver_id: string;
  driver_name?: string;
  shift_id: string | null;
  vehicle_id: string | null;
  vehicle_number?: string;
  liters: number | null;
  // Nullable since migration 049 dropped the NOT NULL constraint — the
  // driver app's "Total cost" field is explicitly optional (only litres
  // is required), so a real row can and does arrive with this null.
  total_cost: number | null;
  vendor: string | null;
  receipt_photo_path: string;
  status: 'pending' | 'approved' | 'rejected';
  auto_approved?: boolean;
  created_at: string;
  // Anti-theft pass (migration 055) — odometer + dashboard photo are a
  // second, independently-checkable data point alongside the receipt
  // itself; GPS is captured silently by the driver app at submit time.
  odometer_miles: number | null;
  dashboard_photo_path: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  fuel_tank_capacity_litres?: number | null;
  // Simplified, fixed fuel theft engine (migration 070/071) — every
  // truck is always refuelled to the brim, so is_full_tank marks a valid
  // MPG comparison anchor, and delta_miles/calculated_mpg/theft_flag/
  // theft_reason are computed and stored server-side by
  // trg_calc_fuel_theft_flag, not recomputed here. calculated_mpg below
  // 7.0 UK MPG (>40 L/100km) on a full-tank-to-full-tank stretch means
  // fuel left the truck outside the engine.
  is_full_tank: boolean;
  delta_miles: number | null;
  calculated_mpg: number | null;
  theft_flag: boolean;
  theft_reason: string | null;
}

interface ParkingExpense {
  id: string;
  driver_id: string;
  driver_name?: string;
  shift_id: string | null;
  amount: number;
  location: string | null;
  parking_date: string;
  note: string | null;
  receipt_photo_path: string;
  status: 'pending' | 'approved' | 'rejected';
  auto_approved?: boolean;
  created_at: string;
}

interface LiveLocation {
  driver_id: string;
  driver_name: string;
  driver_code: string;
  latitude: number;
  longitude: number;
  speed_mph: number;
  last_ping: string;
  status: 'moving' | 'stationary' | 'idle';
}

/** Reads the device's current GPS position via the browser's own Geolocation
 * API — no third-party location service involved. Used by the depot forms'
 * "Use my current location" button so an admin standing at the depot can
 * fill in its coordinates without looking them up manually. */
function getCurrentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location is not supported by this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        const message = err.code === err.PERMISSION_DENIED
          ? 'Location access was denied — allow it in your browser, or enter coordinates manually.'
          : 'Could not get your current location. Enter coordinates manually.';
        reject(new Error(message));
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

/** Best-effort reverse geocode (coordinates → a human-readable address) via
 * OpenStreetMap's keyless Nominatim endpoint — same no-API-key approach
 * already used for this app's map tiles. Purely a convenience to prefill
 * the address field; failures are swallowed since address is optional. */
async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=0`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.display_name ?? null;
  } catch {
    return null;
  }
}

/** "1.3h" is meaningless to a driver checking their own pay — real shift
 * duration, in whole hours and minutes. Used everywhere the Profitability
 * ledger shows a duration, replacing the old decimal-hours display. */
function formatHoursMinutes(totalHours: number): string {
  const totalMinutes = Math.max(0, Math.round(totalHours * 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** "john o'brien-smith" -> "John O'Brien-Smith" — capitalises after a
 * space, hyphen or apostrophe so double-barrelled and Irish/Scottish
 * names come out right, not just "First Word". Used both as display-only
 * formatting (e.g. the Profitability ledger) and to normalise a name
 * before it's saved, so every section of the dashboard and the driver
 * app — which just reads the same drivers.full_name — shows it the same
 * capitalised way. */
function toTitleCase(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/(^|[\s\-'])([a-z])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** Some timestamps from Postgres arrive without a timezone suffix — treat
 * those as UTC rather than letting the browser assume local time. */
function normalizeUtcIso(raw: string): string {
  const str = raw.toString().trim();
  return str.endsWith('Z') || str.includes('+') ? str : `${str.replace(' ', 'T')}Z`;
}

/** "12m ago" / "3h ago" / a real date once it's old enough that a relative
 * count stops being useful — replaces raw "(2797 minutes ago)" counters
 * on the Alert Monitors cards. */
function formatRelativeAlertTime(rawTimestamp: string): string {
  const ms = new Date(normalizeUtcIso(rawTimestamp)).getTime();
  const diffMins = Math.round((Date.now() - ms) / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const d = new Date(ms);
  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' })} • ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('admin_session') === 'true';
  });
  // Least privilege: the cached value is only a first paint hint — the real
  // department is re-resolved from the database on every session restore.
  const [userRole, setUserRole] = useState<UserRole>(() => {
    return localStorage.getItem('admin_role') === 'payroll_admin' ? 'payroll_admin' : 'logistics';
  });
  const [loginEmail, setLoginEmail] = useState(() => localStorage.getItem(REMEMBERED_EMAIL_KEY) || '');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [legalModalOpen, setLegalModalOpen] = useState(false);
  const [legalModalDoc, setLegalModalDoc] = useState<'privacy' | 'terms' | 'dpa' | 'telematics'>('privacy');
  const [rememberMe, setRememberMe] = useState(() => !!localStorage.getItem(REMEMBERED_EMAIL_KEY));

  // Department sign-up

  // Request access — replaces free self-service company sign-up. A new
  // visitor becomes an "interest buyer" (request-access Edge Function,
  // migration 061): no login is created until the Tachyo team sets the
  // company up from the Accounts page. Department sign-up for staff of an
  // existing company is unchanged (it needs that company's code).
  const EMPTY_ACCESS_REQUEST = { companyName: '', contactName: '', email: '', phone: '', fleetSize: '', message: '', website: '' };
  const [requestAccessMode, setRequestAccessMode] = useState(false);
  const [requestAccessForm, setRequestAccessForm] = useState(EMPTY_ACCESS_REQUEST);
  const [isSubmittingAccessRequest, setIsSubmittingAccessRequest] = useState(false);
  const [requestAccessError, setRequestAccessError] = useState('');
  const [requestAccessDone, setRequestAccessDone] = useState(false);

  // Password reset / recovery
  const [resetNotice, setResetNotice] = useState<{ tone: 'info' | 'error' | 'success'; text: string } | null>(null);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  // Two-step sign-in (migration 065). After signing in with the
  // password, Supabase's assurance level may still be AAL1 — we ask for
  // the 6-digit code from the admin's authenticator before treating
  // them as signed in.
  const [mfaChallenge, setMfaChallenge] = useState<null | { factorId: string; code: string; verifying: boolean; error: string }>(null);
  const finishAdminLogin = async () => {
    const { role, blocked, companyName, organizationId } = await resolveUserRole();
    if (blocked) {
      await supabase!.auth.signOut();
      setIsAuthenticated(false);
      localStorage.removeItem('admin_session');
      setLoginError(`Access for ${companyName ?? 'this company'} is suspended. Contact Tachyo support to reactivate it.`);
      return;
    }
    setIsAuthenticated(true);
    localStorage.setItem('admin_session', 'true');
    persistRememberedEmail(loginEmail);
    setUserRole(role);
    localStorage.setItem('admin_role', role);
    if (organizationId) {
      setCurrentOrgId(organizationId);
      loadOrgAlertSettings(organizationId);
    }
    if (role === 'logistics') setActiveTab('dashboard');
  };
  const [activeTab, setActiveTab] = useState<'dashboard' | 'live' | 'alerts' | 'drivers' | 'rates' | 'holidays' | 'analytics' | 'shipments' | 'compliance' | 'fleet-roadworthiness' | 'driver-hours' | 'compliance-defects' | 'walkaround-history' | 'accounts'>('dashboard');
  // Sidebar expand/collapse — controlled here (not left to the component's
  // own internal state) so the brand header can also switch between the
  // full wordmark and the icon-only mark based on the same flag.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // The rail expands on hover and collapses on mouseleave. Opening the theme
  // menu moves the pointer off the rail (and Radix's modal mode drops
  // pointer-events on the body, which fires mouseleave immediately), so
  // without this the rail would collapse and unmount the menu mid-click.
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const railExpanded = sidebarOpen || themeMenuOpen;

  // Route Guard: enforce that logistics role cannot access rates, reports,
  // or team-management tabs — these control money and who can join the
  // company at all. Billing is a modal, not a tab, and gated separately.
  useEffect(() => {
    if (userRole === 'logistics' && (activeTab === 'rates' || activeTab === 'shipments')) {
      setActiveTab('dashboard');
    }
  }, [userRole, activeTab]);

  // Team & Access tab: the org's own driver company code + registration codes.
  const [teamOrgInfo, setTeamOrgInfo] = useState<{ id: string; name: string; slug: string; plan: string; support_phone_1?: string | null; support_phone_2?: string | null } | null>(null);
  // Settings → Company: the driver app's own support-contact numbers,
  // scoped to this org (migration 039) — replaces what used to be two
  // hardcoded personal mobile numbers shared by every company's drivers.
  const [supportPhone1, setSupportPhone1] = useState('');
  const [supportPhone2, setSupportPhone2] = useState('');
  const [isSavingSupportContacts, setIsSavingSupportContacts] = useState(false);
  const [supportContactsError, setSupportContactsError] = useState('');
  const [supportContactsSuccess, setSupportContactsSuccess] = useState('');
  const [isLoadingTeam, setIsLoadingTeam] = useState(false);
  const [teamError, setTeamError] = useState('');
  const [rotatingCode, setRotatingCode] = useState<'logistics' | 'payroll' | null>(null);
  const [justRotatedCode, setJustRotatedCode] = useState<{ type: 'logistics' | 'payroll'; code: string } | null>(null);
  // Alerts settings tab: per-company flag/idle/night-out thresholds. Loaded
  // independently of teamOrgInfo (right after login, not gated behind opening
  // Settings) since flaggedShifts/night-out detection run on every render of
  // the reports view, whether or not the admin has ever opened Settings.
  const [orgAlertSettings, setOrgAlertSettings] = useState<OrgAlertSettings>(DEFAULT_ORG_ALERT_SETTINGS);
  const [alertSettingsForm, setAlertSettingsForm] = useState({
    longShiftFlagHours: String(DEFAULT_ORG_ALERT_SETTINGS.longShiftFlagHours),
    idleAlertMinutes: String(DEFAULT_ORG_ALERT_SETTINGS.idleAlertMinutes),
    nightOutMinGapHours: String(DEFAULT_ORG_ALERT_SETTINGS.nightOutMinGapHours),
    nightOutMaxGapHours: String(DEFAULT_ORG_ALERT_SETTINGS.nightOutMaxGapHours),
    complianceAlertLeadDays: String(DEFAULT_ORG_ALERT_SETTINGS.complianceAlertLeadDays),
    walkaroundCheckTargetMinutes: String(DEFAULT_ORG_ALERT_SETTINGS.walkaroundCheckTargetMinutes),
    loadReminderMinutes: String(DEFAULT_ORG_ALERT_SETTINGS.loadReminderMinutes),
  });
  const [isSavingAlertSettings, setIsSavingAlertSettings] = useState(false);
  const [alertSettingsError, setAlertSettingsError] = useState('');
  const [alertSettingsSuccess, setAlertSettingsSuccess] = useState('');

  // Resolved once at session start/login (see resolveUserRole call sites) —
  // independent of the Settings modal's teamOrgInfo, which only loads when
  // Settings is opened. Compliance & Safety needs the org id on first visit.
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);
  // Lifted from the two Compliance sub-pages purely to drive the sidebar
  // nav dot — each page owns all its own data otherwise. A page's count
  // stays at its last-known value while unmounted (the other sub-page is
  // active), rather than resetting to 0, so the badge doesn't flicker off
  // just because you navigated to the other sub-page.
  const [fleetAlertCount, setFleetAlertCount] = useState(0);
  const [wtdAlertCount, setWtdAlertCount] = useState(0);
  const complianceAlertCount = fleetAlertCount + wtdAlertCount;
  const [isDispatchExpanded, setIsDispatchExpanded] = useState(true);
  const [isComplianceExpanded, setIsComplianceExpanded] = useState(false);
  const [isDriverProfilesExpanded, setIsDriverProfilesExpanded] = useState(false);
  // Brief "done" flash on export buttons — these builds are synchronous
  // (generate the file client-side, trigger download), so there's no real
  // loading phase, just a confirmation the click was registered.
  const [justExported, setJustExported] = useState<null | 'csv' | 'excel' | 'ledger'>(null);
  const flashExported = (kind: 'csv' | 'excel' | 'ledger') => {
    setJustExported(kind);
    setTimeout(() => setJustExported(k => (k === kind ? null : k)), 1200);
  };
  // Access Codes → Create Account: replaces the old pre-auth "register with
  // a department code" screen with an admin-driven equivalent — no code
  // needed since the caller is already authenticated and scoped to their org.
  const [newAccountEmail, setNewAccountEmail] = useState('');
  const [newAccountPassword, setNewAccountPassword] = useState('');
  const [newAccountRole, setNewAccountRole] = useState<UserRole>('logistics');
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [createAccountError, setCreateAccountError] = useState('');
  const [createAccountSuccess, setCreateAccountSuccess] = useState('');
  // Same popup pattern for Settings — off the "Settings" sidebar button,
  // not a nav tab.
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [activeSettingsSection, setActiveSettingsSection] = useState<'company' | 'access-codes' | 'depots' | 'alerts' | 'fuel-bonus' | 'payroll' | 'appearance' | 'security' | 'plan' | 'legal'>('company');

  /// Resolves the signed-in user's department from public.user_roles.
  /// Matched on email: the deployed table is keyed by email and has no
  /// user_id column, unlike the definition in migration 009.
  /// Least privilege: anything unrecognised resolves to 'logistics'.
  // Also reports whether the caller's organization has been blocked (see
  // migration 037 — trial expired, is_active flipped false). RLS still
  // lets a blocked user read their own user_roles/organizations rows
  // (only the operational tables are gated), so this same lookup can
  // detect the block and explain it, rather than the caller just hitting
  // empty data everywhere with no indication why.
  const resolveUserRole = useCallback(async (): Promise<{ role: UserRole; blocked: boolean; companyName?: string; organizationId?: string }> => {
    const { data: { user } } = await supabase!.auth.getUser();
    const email = (user?.email ?? '').toLowerCase().trim();
    if (!email) return { role: 'logistics', blocked: false };

    const { data, error } = await supabase!
      .from('user_roles')
      .select('role, organization_id')
      .eq('email', email)
      .limit(1);

    if (error) {
      console.warn('Role lookup failed, defaulting to logistics:', error.message);
      return { role: 'logistics', blocked: false };
    }
    const row = data?.[0];
    const role: UserRole = row?.role === 'payroll_admin' ? 'payroll_admin' : 'logistics';
    if (!row?.organization_id) return { role, blocked: false };

    const { data: orgData } = await supabase!
      .from('organizations')
      .select('is_active, name')
      .eq('id', row.organization_id)
      .maybeSingle();

    return { role, blocked: orgData?.is_active === false, companyName: orgData?.name, organizationId: row.organization_id };
  }, []);

  /// Loads this org's alert/flag thresholds (migration 038) — a separate,
  /// isolated query from the is_active/name lookup above so that on an
  /// environment where migration 038 hasn't been applied yet (the columns
  /// don't exist), this query's failure can't take down role resolution or
  /// the "org blocked" check with it. Silently keeps DEFAULT_ORG_ALERT_SETTINGS
  /// on any error.
  const loadOrgAlertSettings = useCallback(async (orgId: string) => {
    if (isMockMode || !supabase || !orgId) return;
    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('long_shift_flag_hours, idle_alert_minutes, idle_detection_enabled, night_out_min_gap_hours, night_out_max_gap_hours, compliance_alert_lead_days, allow_driver_night_out_requests, walkaround_check_target_minutes, load_reminder_minutes')
        .eq('id', orgId)
        .maybeSingle();
      if (error || !data) return;
      setOrgAlertSettings({
        longShiftFlagHours: Number(data.long_shift_flag_hours) || DEFAULT_ORG_ALERT_SETTINGS.longShiftFlagHours,
        idleAlertMinutes: Number(data.idle_alert_minutes) || DEFAULT_ORG_ALERT_SETTINGS.idleAlertMinutes,
        nightOutMinGapHours: data.night_out_min_gap_hours != null ? Number(data.night_out_min_gap_hours) : DEFAULT_ORG_ALERT_SETTINGS.nightOutMinGapHours,
        nightOutMaxGapHours: data.night_out_max_gap_hours != null ? Number(data.night_out_max_gap_hours) : DEFAULT_ORG_ALERT_SETTINGS.nightOutMaxGapHours,
        complianceAlertLeadDays: Number(data.compliance_alert_lead_days) || DEFAULT_ORG_ALERT_SETTINGS.complianceAlertLeadDays,
        allowDriverNightOutRequests: data.allow_driver_night_out_requests === true,
        walkaroundCheckTargetMinutes: Number(data.walkaround_check_target_minutes) || DEFAULT_ORG_ALERT_SETTINGS.walkaroundCheckTargetMinutes,
        loadReminderMinutes: Number(data.load_reminder_minutes) || DEFAULT_ORG_ALERT_SETTINGS.loadReminderMinutes,
        idleDetectionEnabled: data.idle_detection_enabled !== false,
      });
    } catch (_) {
      // Migration 038 likely not applied on this environment yet — keep defaults.
    }
    try {
      const { data } = await supabase
        .from('organizations')
        .select('gps_offline_detection_enabled, gps_offline_after_minutes, gps_offline_notify_driver, gps_offline_action, gps_offline_clock_out_minutes')
        .eq('id', orgId)
        .maybeSingle();
      if (data) {
        const next: GpsPolicySettings = {
          enabled: data.gps_offline_detection_enabled !== false,
          afterMinutes: Number(data.gps_offline_after_minutes) || 10,
          notifyDriver: data.gps_offline_notify_driver !== false,
          action: (['none', 'freeze_time', 'clock_out'].includes(data.gps_offline_action) ? data.gps_offline_action : 'none') as GpsPolicySettings['action'],
          clockOutMinutes: Number(data.gps_offline_clock_out_minutes) || 60,
        };
        setGpsPolicy(next);
        setGpsPolicyForm({ afterMinutes: String(next.afterMinutes), clockOutMinutes: String(next.clockOutMinutes) });
      }
    } catch (_) {
      // Migration 081 not applied here — keep defaults.
    }
    try {
      const { data } = await supabase
        .from('organizations')
        .select('idle_action, idle_notify_driver')
        .eq('id', orgId)
        .maybeSingle();
      if (data) {
        setIdlePolicy({
          action: data.idle_action === 'freeze_time' ? 'freeze_time' : 'none',
          notifyDriver: data.idle_notify_driver !== false,
        });
      }
    } catch (_) {
      // Migration 101 not applied here — keep defaults.
    }
  }, []);

  // Database States
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [isDispatchOpen, setIsDispatchOpen] = useState(false);
  // 'assign' = pick a load for a driver (from a Tracking List card); 'files' = Import Carrier.
  const [dispatchMode, setDispatchMode] = useState<'assign' | 'files'>('assign');
  const [shipmentsView, setShipmentsView] = useState<'tracking' | 'history'>('tracking');
  const [dispatchDriverId, setDispatchDriverId] = useState('');
  // Loads the office has assigned that are still open — shown on the Active
  // Loads live board so an assignment is visible the moment it's made and
  // stays visible while the driver runs it.
  const [dispatchBoard, setDispatchBoard] = useState<{ id: string; driver_id: string; vrid: string; origin: string | null; destination: string | null; status: 'assigned' | 'in_progress'; trailer_number: string | null }[]>([]);
  const loadDispatchBoard = useCallback(async () => {
    if (isMockMode || !supabase || !currentOrgId) return;
    const { data } = await supabase
      .from('dispatch_loads')
      .select('id, driver_id, vrid, origin, destination, status, trailer_number')
      .in('status', ['assigned', 'in_progress'])
      .order('created_at', { ascending: false });
    if (data) setDispatchBoard(data as typeof dispatchBoard);
  }, [isMockMode, currentOrgId]);
  useEffect(() => { loadDispatchBoard(); }, [loadDispatchBoard]);
  useEffect(() => {
    if (isMockMode || !supabase || !currentOrgId) return;
    const channel = supabase
      .channel('realtime_dispatch_loads')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatch_loads' }, () => { loadDispatchBoard(); })
      .subscribe();
    return () => { supabase!.removeChannel(channel); };
  }, [isMockMode, currentOrgId, loadDispatchBoard]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  // Everything the server has sent; `alerts` below is what the UI sees.
  // With company-wide idle detection switched off (Settings → Alerts),
  // idle alerts are hidden everywhere — panel, bell badge, map markers,
  // dashboard and the audio siren — while SOS alerts always show. Nothing
  // is deleted, so switching it back on restores them.
  const [allAlerts, setAlerts] = useState<IdleAlert[]>([]);
  const alerts = useMemo(
    () => (orgAlertSettings.idleDetectionEnabled ? allAlerts : allAlerts.filter(a => a.is_sos)),
    [allAlerts, orgAlertSettings.idleDetectionEnabled],
  );
  // Driver whose journey-so-far is drawn on the live map (click a driver).
  const [trailDriverId, setTrailDriverId] = useState<string | null>(null);
  const trailLayerRef = useRef<L.LayerGroup | null>(null);
  // Trailers shown on the live map. Today a trailer's position is its coupled
  // driver's; when trailers get their own GPS trackers, this is where their
  // own coordinates take over (see trailerSource below).
  const [showTrailers, setShowTrailers] = useState(false);
  // Live Map page has two tabs: the live view and the stored journeys.
  const [liveSubTab, setLiveSubTab] = useState<'live' | 'journey'>('live');
  const trailerMarkersRef = useRef<Record<string, L.Marker>>({});
  const trailFittedFor = useRef<string | null>(null);
  const [gpsOfflineEvents, setGpsOfflineEvents] = useState<GpsOfflineEvent[]>([]);
  const [gpsPolicy, setGpsPolicy] = useState<GpsPolicySettings>(DEFAULT_GPS_POLICY);
  // What happens when an employee is idle (migrations 101/102): alert only, or freeze their time.
  const [idlePolicy, setIdlePolicy] = useState<{ action: 'none' | 'freeze_time'; notifyDriver: boolean }>({ action: 'none', notifyDriver: true });
  const [isSavingIdlePolicy, setIsSavingIdlePolicy] = useState(false);
  const [gpsPolicyForm, setGpsPolicyForm] = useState({ afterMinutes: '10', clockOutMinutes: '60' });
  const [isSavingGpsPolicy, setIsSavingGpsPolicy] = useState(false);
  const [gpsPolicyMessage, setGpsPolicyMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  // Office-assigned load each driver has right now (in progress wins over waiting).
  const assignedLoadByDriver = useMemo(() => {
    const out: Record<string, string> = {};
    [...dispatchBoard].sort((a, b) => (a.status === 'in_progress' ? -1 : 1) - (b.status === 'in_progress' ? -1 : 1)).forEach(l => {
      if (!out[l.driver_id]) out[l.driver_id] = l.vrid;
    });
    return out;
  }, [dispatchBoard]);
  const noSignalDriverIds = useMemo(
    () => new Set(gpsOfflineEvents.filter(e => !e.resolved_at).map(e => e.driver_id)),
    [gpsOfflineEvents],
  );
  const [alertCategoryFilter, setAlertCategoryFilter] = useState<'all' | 'gps_offline' | 'sos' | 'idle50' | 'fuel_anomaly' | 'fuel_pending' | 'parking_pending' | 'walkaround' | 'holiday_pending' | 'access_requests' | 'risk_signoffs' | 'unroadworthy_use' | 'pin_reset' | 'account_deletion'>('all');
  const [depots, setDepots] = useState<Depot[]>([]);
  const [, setFleetVehicles] = useState<FleetVehicle[]>([]);
  const [mileageByShift, setMileageByShift] = useState<Record<string, number>>({});
  const [fuelReceipts, setFuelReceipts] = useState<FuelReceipt[]>([]);
  const [fuelReceiptLightboxUrl, setFuelReceiptLightboxUrl] = useState<string | null>(null);
  // GPS-vs-claimed-station comparison (migration 055) — the vendor name
  // is driver-entered free text, not a geocoded/verified address (this
  // project has no Google/Mapbox geocoding key), so it's shown as
  // context alongside the real GPS pin, not matched against it.
  const [gpsCompareReceipt, setGpsCompareReceipt] = useState<FuelReceipt | null>(null);
  const [reviewingFuelReceiptId, setReviewingFuelReceiptId] = useState<string | null>(null);
  // Fuel Receipts Audit modal — replaces the old full-width bottom
  // section; same data/handlers, just triggered from the toolbar now.
  const [isFuelReceiptsModalOpen, setIsFuelReceiptsModalOpen] = useState(false);
  const [fuelModalDriverSearch, setFuelModalDriverSearch] = useState('');
  // Overnight Parking Expenses — same review-queue shape as Fuel
  // Receipts, except approving one also reimburses it into that
  // shift's payroll (extras_amount) instead of feeding a cost KPI.
  const [parkingExpenses, setParkingExpenses] = useState<ParkingExpense[]>([]);
  const [parkingExpenseLightboxUrl, setParkingExpenseLightboxUrl] = useState<string | null>(null);
  const [reviewingParkingExpenseId, setReviewingParkingExpenseId] = useState<string | null>(null);
  const [isParkingExpensesModalOpen, setIsParkingExpensesModalOpen] = useState(false);
  const [parkingModalDriverSearch, setParkingModalDriverSearch] = useState('');
  const [parkingShiftAssignment, setParkingShiftAssignment] = useState<Record<string, string>>({});
  const [fuelModalVehicleFilter, setFuelModalVehicleFilter] = useState('');
  const [fuelModalDateStart, setFuelModalDateStart] = useState('');
  const [fuelModalDateEnd, setFuelModalDateEnd] = useState('');
  const [isSavingDepot, setIsSavingDepot] = useState(false);
  const [depotFormError, setDepotFormError] = useState('');
  const [newDepotName, setNewDepotName] = useState('');
  const [newDepotAddress, setNewDepotAddress] = useState('');
  const [newDepotLat, setNewDepotLat] = useState('');
  const [newDepotLng, setNewDepotLng] = useState('');
  const [newDepotRadius, setNewDepotRadius] = useState('150');
  // When set, the depot form edits this depot instead of adding a new one.
  const [editingDepotId, setEditingDepotId] = useState<string | null>(null);
  const [isLocatingDepot, setIsLocatingDepot] = useState(false);
  const [analyticsFilters, setAnalyticsFilters] = useState<AnalyticsFilter[]>([
    { id: 'default-period', type: FilterType.PERIOD, operator: FilterOperator.IS, value: ['Last 30 days'] },
  ]);
  // "Custom range" period (inclusive dates, yyyy-mm-dd).
  const [analyticsCustomRange, setAnalyticsCustomRange] = useState(() => {
    const to = new Date();
    const from = new Date(Date.now() - 29 * 86_400_000);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  });
  const [analyticsVatMode, setAnalyticsVatMode] = useState<VatMode>('ex');
  // Page-header slot AnalyticsBreakdowns mounts its report buttons into.
  const [analyticsReportSlot, setAnalyticsReportSlot] = useState<HTMLDivElement | null>(null);
  const [isCostLedgerOpen, setIsCostLedgerOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isDriverBulkImportOpen, setIsDriverBulkImportOpen] = useState(false);
  const [clearedAlertIds, setClearedAlertIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('cleared_alerts');
      return saved ? JSON.parse(saved) : [];
    } catch (_) {
      return [];
    }
  });



  const [liveLocations, setLiveLocations] = useState<LiveLocation[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Active Telemetry Feed panel (Live Dispatch Board) — view, search and
  // filter state. "All Activity" shows the full roster (including drivers
  // who aren't currently pinging in) rather than only the live subset.
  const mockProgressRef = useRef<{ [driverId: string]: { index: number; direction: 'forward' | 'backward'; waitTicks: number } }>({});
  // Audio Control
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const audioIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastSirenPlayRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        audioCtxRef.current = new AudioCtx();
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  }, []);

  // Global listener to unlock audio on first user click/keydown/tap anywhere on screen
  useEffect(() => {
    const unlockAudio = () => {
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
    };
    window.addEventListener('click', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);
    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
  }, []);

  // ── Audio Alert Synthesizer ─────────────────────────────────
  const playAlertSiren = useCallback(() => {
    if (isAudioMuted) return;
    
    // Cooldown check: prevent duplicate overlapping beep loops
    const now = Date.now();
    if (now - lastSirenPlayRef.current < 1200) {
      return;
    }
    lastSirenPlayRef.current = now;

    try {
      const ctx = getAudioContext();
      if (ctx) {
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        
        // Siren Osc 1 (High Tone 880Hz)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(880, ctx.currentTime);
        gain1.gain.setValueAtTime(0.4, ctx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(ctx.currentTime);
        osc1.stop(ctx.currentTime + 0.3);
        
        // Siren Osc 2 (Low Tone 660Hz after 150ms)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
        gain2.gain.setValueAtTime(0.4, ctx.currentTime + 0.15);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(ctx.currentTime + 0.15);
        osc2.stop(ctx.currentTime + 0.45);
      }
    } catch (e) {
      console.warn('Audio siren error:', e);
    }
  }, [isAudioMuted, getAudioContext]);

  // Trigger looping sirens when unacknowledged alerts exist
  useEffect(() => {
    const unacknowledged = alerts.filter(a => !a.acknowledged);
    
    if (unacknowledged.length > 0 && !isAudioMuted) {
      if (!audioIntervalRef.current) {
        playAlertSiren();
        audioIntervalRef.current = setInterval(() => {
          playAlertSiren();
        }, 2200);
      }
    } else {
      if (audioIntervalRef.current) {
        clearInterval(audioIntervalRef.current);
        audioIntervalRef.current = null;
      }
    }

    return () => {
      if (audioIntervalRef.current) {
        clearInterval(audioIntervalRef.current);
        audioIntervalRef.current = null;
      }
    };
  }, [alerts, isAudioMuted, playAlertSiren]);

  // Driver CRUD Forms State
  const [isAddingEmployee, setIsAddingEmployee] = useState(false);
  // One-time activation code shown after Add Employee / Reset PIN
  // (migration 065). Once dismissed it's gone — the admin has to issue
  // a fresh one from the row menu.
  const [activationCodeShown, setActivationCodeShown] = useState<null | { code: string; name: string; driverId: string; reason: 'created' | 'reset' }>(null);
  const [newEmployeeName, setNewEmployeeName] = useState('');
  const [newEmployeeCode, setNewEmployeeCode] = useState('');
  const [newEmployeePhone, setNewEmployeePhone] = useState('');
  const [crudError, setCrudError] = useState('');
  // Compensation Setup, collected in the same Add Employee dialog now
  // rather than a separate step — Section 2 of the merged form.
  const [newEmployeeProfession, setNewEmployeeProfession] = useState<EmployeeProfession>('driver');
  const [newEmployeeRateType, setNewEmployeeRateType] = useState<'Hourly' | 'Fixed Shift Rate (Day Rate)'>('Hourly');
  const [newEmployeeBaseRate, setNewEmployeeBaseRate] = useState('16.00');
  const [newEmployeeAgency, setNewEmployeeAgency] = useState('Direct');

  // Per-row "..." overflow menu (Reset PIN / Deactivate / Remove) — same
  // open-one-at-a-time popup pattern already used for shift row actions
  // elsewhere in this app.
  const [openEmployeeMenuId, setOpenEmployeeMenuId] = useState<string | null>(null);

  // Edit Employee State
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editNewPin, setEditNewPin] = useState('');
  const [editEmployeeError, setEditEmployeeError] = useState('');
  const [isSavingEmployee, setIsSavingEmployee] = useState(false);

  const openEditEmployeeModal = (emp: Employee) => {
    setEditingEmployee(emp);
    setEditFullName(emp.full_name || '');
    setEditUsername(emp.driver_id || '');
    setEditPhone(emp.phone || '');
    setEditNewPin('');
    setEditEmployeeError('');

    // Prefill compensation fields too — Compensation Profiles is merged
    // into this one Edit modal now rather than living as a separate tab.
    const currentRate = employeeRates[emp.id] || employeeRates[emp.driver_id];
    const isFixed = Boolean(currentRate?.rate_type && currentRate.rate_type.toLowerCase().includes('fixed'));
    setEditRateType(isFixed ? 'Fixed Shift Rate (Day Rate)' : 'Hourly');
    setEditFixedRate(String(currentRate?.fixed_rate ?? 150.00));
    setEditMonFriRate(String(currentRate?.mon_fri_rate ?? emp.hourly_rate ?? 16.00));
    setEditSatRate(String((currentRate as any)?.saturday_rate ?? (currentRate as any)?.sat_rate ?? 17.00));
    setEditSunRate(String((currentRate as any)?.sunday_rate ?? (currentRate as any)?.sun_rate ?? 18.00));
    setEditAgencyName(currentRate?.agency_name || (emp as any).agency_name || (emp as any).agency || 'Direct');
  };

  const handleNewEmployeeNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setNewEmployeeName(newName);

    // Auto-generate username: lowercase, replace spaces with dots, remove accents and special chars
    const generatedUsername = newName
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, '.')
      .replace(/[^a-z0-9.]/g, '');

    setNewEmployeeCode(generatedUsername);
  };

  // Employee Rates & Agency state
  const [employeeRates, setEmployeeRates] = useState<{ [driverId: string]: EmployeeRate }>({
    'drv-1': { driver_id: 'drv-1', rate_type: 'Hourly Sat/Sun separate', mon_fri_rate: 16.00, sat_rate: 17.00, sun_rate: 18.00, agency_name: 'LWR' },
    'drv-2': { driver_id: 'drv-2', rate_type: 'Hourly Sat/Sun separate', mon_fri_rate: 16.50, sat_rate: 17.50, sun_rate: 18.50, agency_name: 'PMP' },
    'drv-3': { driver_id: 'drv-3', rate_type: 'Fixed weekly', mon_fri_rate: 18.00, sat_rate: 18.00, sun_rate: 18.00, agency_name: 'Direct' },
  });
  const [reportAgencyFilter, setReportAgencyFilter] = useState('all');

  // Rate Editing state — now surfaced inside the merged Edit Employee
  // modal (Employee Database tab) instead of a separate Compensation
  // Profiles tab; handleSaveRate itself is unchanged.
  const [editMonFriRate, setEditMonFriRate] = useState<string>('16.00');
  const [editSatRate, setEditSatRate] = useState<string>('17.00');
  const [editSunRate, setEditSunRate] = useState<string>('18.00');
  const [editFixedRate, setEditFixedRate] = useState<string>('150.00');
  const [editRateType, setEditRateType] = useState<string>('Hourly');
  const [editAgencyName, setEditAgencyName] = useState<string>('Direct');

  // Report Filters
  const [reportEmployeeFilter, setReportEmployeeFilter] = useState('all');
  // Free-text search in the Compensation Summary filter bar: matches
  // employee, ID, agency, depot, vehicle, trailer, load, notes and more.
  const [summarySearch, setSummarySearch] = useState('');
  const [reportDateStart, setReportDateStart] = useState('');
  const [reportDateEnd, setReportDateEnd] = useState('');
  const [showOnlyNightOutRequested, setShowOnlyNightOutRequested] = useState(false);
  const [reportViewMode, setReportViewMode] = useState<'detailed' | 'weekly' | 'monthly'>('detailed');
  const [summaryMenuOpen, setSummaryMenuOpen] = useState(false);
  const [flagsMenuOpen, setFlagsMenuOpen] = useState(false);
  const [selectedShiftIds, setSelectedShiftIds] = useState<Set<string>>(new Set());
  // Compensation Summary -> "Fill in the template" dialog
  const [fillTemplateOpen, setFillTemplateOpen] = useState(false);
  // Compensation Summary -> preview before Export CSV / Excel / Summary
  const [exportPreview, setExportPreview] = useState<null | {
    title: string; subtitle: string; columns: PreviewColumn[]; rows: PreviewRow[];
    defaultFormat: 'csv' | 'xlsx'; fileBase: string; storageKey: string; flash: 'csv' | 'excel';
  }>(null);

  // Unified Payroll Action drawer (Night Out / Bonus / Deductions).
  // `shift` is only populated in 'single' mode — a bulk selection has no
  // single locked rate or timestamp to show context for.
  const [actionModal, setActionModal] = useState<{
    isOpen: boolean;
    type: 'single' | 'bulk';
    shiftIds: string[];
    driverName: string;
    currentExtras: number;
    currentNote: string;
    currentNO: number;
    currentDeduction: number;
    currentDeductionReason: string;
    currentNotes: string;
    currentMicroOverride: boolean;
    shift: Shift | null;
  } | null>(null);
  const [isSavingPayroll, setIsSavingPayroll] = useState(false);

  // In-dashboard replacements for window.alert/confirm/prompt — those
  // render as the browser's own native dialog, which looks like a broken
  // "site says" box and doesn't match the app at all.
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' | 'info' } | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const showToast = (message: string, tone: 'success' | 'error' | 'info' = 'info') => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast({ message, tone });
    toastTimerRef.current = window.setTimeout(() => setToast(null), tone === 'error' ? 6000 : 4000);
  };

  const [confirmDialog, setConfirmDialog] = useState<{
    message: string;
    tone?: 'danger' | 'default';
    onConfirm: () => void;
  } | null>(null);
  const requestConfirm = (message: string, onConfirm: () => void, tone: 'danger' | 'default' = 'default') => {
    setConfirmDialog({ message, onConfirm, tone });
  };

  // Replaces the two sequential window.prompt() calls that used to collect
  // a shift's new start/end time as free-typed text.
  const [editTimeModal, setEditTimeModal] = useState<{
    shiftId: string;
    startValue: string;
    endValue: string;
    isOngoing: boolean;
  } | null>(null);

  // Replaces the "type 1 or 2" window.prompt() used to pick a depot when
  // manually clocking a driver in.
  const [depotSelectModal, setDepotSelectModal] = useState<{
    driverId: string;
    depots: { id: string; name: string; latitude: number; longitude: number }[];
  } | null>(null);

  // Leaflet Map Reference
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<{ [key: string]: L.Marker }>({});
  const depotLayersRef = useRef<L.Layer[]>([]);

  // ── MOCK DATA SEED ──────────────────────────────────────────
  const mockEmployees: Employee[] = [
    { id: 'drv-1', driver_id: 'DRV-001', full_name: 'John Smith', phone: '+44 7700 900001', is_active: true, rate_profile: 'LWR' },
    { id: 'drv-2', driver_id: 'DRV-002', full_name: 'David Jones', phone: '+44 7700 900002', is_active: true, rate_profile: 'LWR' },
    { id: 'drv-3', driver_id: 'DRV-003', full_name: 'Robert Taylor', phone: '+44 7700 900003', is_active: true, rate_profile: 'LWR' },
  ];

  const mockShifts: Shift[] = [
    // Weekend retroactive override demonstration (Fri+Sat+Sun completed shifts)
    {
      id: 'sh-1',
      driver_id: 'drv-1',
      driver_name: 'John Smith',
      driver_code: 'DRV-001',
      depot_name: 'Rossington Depot',
      start_time: '2026-07-03T08:00:00Z', // Friday
      end_time: '2026-07-03T16:00:00Z',
      status: 'completed',
      base_hourly_rate: 16.0,
      override_rate: 18.0, // Upgraded to £18
      effective_rate: 18.0,
      total_hours: 8.0,
      total_pay: 144.0,
      week_number: 27,
    },
    {
      id: 'sh-2',
      driver_id: 'drv-1',
      driver_name: 'John Smith',
      driver_code: 'DRV-001',
      depot_name: 'Rossington Depot',
      start_time: '2026-07-04T08:00:00Z', // Saturday
      end_time: '2026-07-04T16:00:00Z',
      status: 'completed',
      base_hourly_rate: 17.0,
      override_rate: 18.0, // Upgraded to £18
      effective_rate: 18.0,
      total_hours: 8.0,
      total_pay: 144.0,
      week_number: 27,
    },
    {
      id: 'sh-3',
      driver_id: 'drv-1',
      driver_name: 'John Smith',
      driver_code: 'DRV-001',
      depot_name: 'Rossington Depot',
      start_time: '2026-07-05T08:00:00Z', // Sunday
      end_time: '2026-07-05T16:00:00Z',
      status: 'completed',
      base_hourly_rate: 18.0,
      override_rate: null,
      effective_rate: 18.0,
      total_hours: 8.0,
      total_pay: 144.0,
      week_number: 27,
    },
    // Standard weekday shift (no override)
    {
      id: 'sh-4',
      driver_id: 'drv-2',
      driver_name: 'David Jones',
      driver_code: 'DRV-002',
      depot_name: 'Wheatley Depot',
      start_time: '2026-07-06T08:00:00Z', // Monday
      end_time: '2026-07-06T17:00:00Z',
      status: 'completed',
      base_hourly_rate: 16.0,
      override_rate: null,
      effective_rate: 16.0,
      total_hours: 9.0,
      total_pay: 144.0,
      week_number: 28,
    },
    // On shift right now (live map demo): trailer + load, trailer without a load, and a solo unit
    { id: 'sh-live-1', driver_id: 'drv-1', driver_name: 'John Smith', driver_code: 'DRV-001', depot_name: 'Rossington Depot', start_time: new Date(Date.now() - 4 * 3600000).toISOString(), end_time: null, status: 'active', vehicle_number: 'NX25 HLT', trailer_number: 'TRL-7412', load_reference: 'NL-208841' } as unknown as Shift,
    { id: 'sh-live-2', driver_id: 'drv-2', driver_name: 'David Jones', driver_code: 'DRV-002', depot_name: 'Wheatley Depot', start_time: new Date(Date.now() - 3 * 3600000).toISOString(), end_time: null, status: 'active', vehicle_number: 'LK24 BRV', trailer_number: 'TRL-7413', load_reference: null } as unknown as Shift,
    { id: 'sh-live-3', driver_id: 'drv-3', driver_name: 'Robert Taylor', driver_code: 'DRV-003', depot_name: 'Rossington Depot', start_time: new Date(Date.now() - 2 * 3600000).toISOString(), end_time: null, status: 'active', vehicle_number: 'YN73 GHT', trailer_number: null, load_reference: null } as unknown as Shift,
  ];

  const mockLocations: LiveLocation[] = [
    {
      driver_id: 'drv-1',
      driver_name: 'John Smith',
      driver_code: 'DRV-001',
      latitude: 53.4830,
      longitude: -1.0850,
      speed_mph: 0,
      last_ping: new Date().toISOString(),
      status: 'idle', // Stationary for >50 mins
    },
    {
      driver_id: 'drv-2',
      driver_name: 'David Jones',
      driver_code: 'DRV-002',
      latitude: 53.5350,
      longitude: -1.0990,
      speed_mph: 42,
      last_ping: new Date().toISOString(),
      status: 'moving',
    },
    {
      driver_id: 'drv-3',
      driver_name: 'Robert Taylor',
      driver_code: 'DRV-003',
      latitude: 53.4990,
      longitude: -1.1210,
      speed_mph: 0,
      last_ping: new Date().toISOString(),
      status: 'stationary',
    },
  ];

  // ── Database / API Loading ──────────────────────────────────
  const loadData = useCallback(async (overrideClearedIds?: string[]) => {
    const activeClearedIds = overrideClearedIds || clearedAlertIds;
    if (isMockMode) {
      // Mock data loader
      setEmployees(mockEmployees);
      setShifts(mockShifts);
      setDepots([
        { id: 'depot-1', name: 'Rossington Depot', latitude: 53.481798, longitude: -1.086552, geofence_radius_m: 200, address: 'Rossington Base' },
        { id: 'depot-2', name: 'Wheatley Depot', latitude: 53.550248, longitude: -1.091061, geofence_radius_m: 200, address: 'Wheatley Base' },
      ]);
      
      // Two mock alerts — one idle, one SOS — so both Alert card
      // severities (amber-light warning, solid-red critical) render in
      // mock mode without touching real data.
      setAlerts([
        {
          id: 'alt-1',
          driver_id: 'drv-1',
          driver_name: 'John Smith',
          driver_code: 'DRV-001',
          shift_id: 'sh-1',
          started_at: new Date(Date.now() - 50 * 60 * 1000).toISOString(), // 50 mins ago
          latitude: 53.4830,
          longitude: -1.0850,
          acknowledged: false,
        },
        {
          id: 'alt-2',
          driver_id: 'drv-2',
          driver_name: 'David Jones',
          driver_code: 'DRV-002',
          shift_id: 'sh-2',
          created_at: new Date(Date.now() - 4 * 60 * 1000).toISOString(), // 4 mins ago
          latitude: 53.5350,
          longitude: -1.0990,
          acknowledged: false,
          is_sos: true,
        },
      ]);
      setLiveLocations(mockLocations);
      return;
    }

    // Production Supabase Load
    try {
      // Trigger idle alerts calculation in database first
      await supabase!.rpc('detect_idle_drivers');

      // Sync session user role
      const activeRole = (localStorage.getItem('admin_role') as UserRole) || userRole;
      setUserRole(activeRole);

      // Fetch Drivers directly from Supabase — single source of truth
      const { data: drvs } = await supabase!.from('drivers').select('*').order('created_at', { ascending: false });
      
      const mappedDrivers = (drvs || []).map((d: any) => {
        const agencyVal = d.agency_name || d.agency || 'Direct';
        return {
          ...d,
          agency_name: agencyVal,
          agency: agencyVal
        };
      });
      setEmployees(mappedDrivers);

      if (mappedDrivers.length > 0 && activeRole === 'payroll_admin') {
        const ratesMap: Record<string, EmployeeRate> = {};

        mappedDrivers.forEach((d: any) => {
          const rateTypeVal = d.rate_type === 'Fixed Shift Rate (Day Rate)'
            ? 'Fixed Shift Rate (Day Rate)'
            : 'Hourly';

          const baseHourly  = Number(d.mon_fri_rate)   || Number(d.hourly_rate)   || 16.00;
          const satHourly   = Number(d.saturday_rate)  || Number(d.sat_rate)      || 17.00;
          const sunHourly   = Number(d.sunday_rate)    || Number(d.sun_rate)      || 18.00;

          // When rate type is Fixed, fixed_rate may be null if schema cache dropped it.
          // Fall back to hourly_rate which tier-3 always saves correctly.
          const fixedRateVal = rateTypeVal === 'Fixed Shift Rate (Day Rate)'
            ? (Number(d.fixed_rate) || Number(d.hourly_rate) || null)
            : (d.fixed_rate ? Number(d.fixed_rate) : null);

          const agencyVal = d.agency_name || d.agency || 'Direct';

          const mappedRate: EmployeeRate = {
            id: d.id,
            driver_id: d.driver_id || d.id,
            rate_type: rateTypeVal,
            fixed_rate: fixedRateVal,
            mon_fri_rate: baseHourly,
            saturday_rate: satHourly,
            sunday_rate: sunHourly,
            sat_rate: satHourly,
            sun_rate: sunHourly,
            agency_name: agencyVal,
          };
          if (d.id) ratesMap[d.id] = mappedRate;
          if (d.driver_id) ratesMap[d.driver_id] = mappedRate;
          if (d.employee_id) ratesMap[d.employee_id] = mappedRate;
          if (d.driver_code) ratesMap[d.driver_code] = mappedRate;
        });

        setEmployeeRates(ratesMap);
      } else {
        setEmployeeRates({});
      }

      // Fetch Depots (org-scoped by RLS) — used for manual clock-in and
      // the Team & Access "Depots" management section
      const { data: dpts } = await supabase!
        .from('depots')
        .select('*')
        .order('name', { ascending: true });
      setDepots(dpts || []);

      // Fetch the fleet register (migration 040) — used to assign a real
      // vehicle to a shift from the Profitability ledger, and to match
      // carrier settlement rows by registration during import.
      const { data: fVehicles } = await supabase!
        .from('vehicles')
        .select('id, vehicle_number, vehicle_type, is_active, make')
        .eq('is_active', true)
        .order('vehicle_number', { ascending: true });
      setFleetVehicles((fVehicles || []) as FleetVehicle[]);

      // Fetch Shifts. shift_revenue is a separate table (see migration 035)
      // so this embed only ever returns data to logistics/payroll_admin —
      // its RLS policy has no driver-facing rule at all, unlike columns on
      // shifts itself which the driver app's own select-star queries would
      // otherwise be able to read straight off their own shift row.
      // Paged: PostgREST returns at most 1,000 rows per request, so a
      // single select silently dropped older shifts once a company passed
      // that — and with them, real figures from Analytics' longer periods
      // and comparisons. id breaks start_time ties so pages never overlap.
      const SHIFT_PAGE = 1000;
      const sfts: any[] = [];
      let shiftsError: { message: string } | null = null;
      for (let from = 0; ; from += SHIFT_PAGE) {
        const { data: page, error } = await supabase!
          .from('shifts')
          .select('*, drivers(full_name, driver_id), depots(name), vehicle:vehicles!vehicle_id(vehicle_number), trailer:vehicles!trailer_id(vehicle_number), shift_revenue(revenue_amount, load_reference, carrier_name, delivered_at, delivery_paperwork_path, delivery_evidence_path), shift_loads(id, load_reference, carrier_name, revenue_amount, booked_departure_at, booked_delivery_at, delivered_at, delivery_paperwork_path, delivery_evidence_path, created_at)')
          .order('start_time', { ascending: false })
          .order('id', { ascending: true })
          .range(from, from + SHIFT_PAGE - 1);
        if (error) { shiftsError = error; break; }
        sfts.push(...(page ?? []));
        if (!page || page.length < SHIFT_PAGE) break;
      }

      // A Postgrest-level error here (RLS denial, a bad embed, anything)
      // resolves normally with { data: null, error: {...} } rather than
      // throwing — the old code never checked this, so a failed shifts
      // fetch silently fell through to `sfts || []` and just looked like
      // "no active shifts" with zero indication anything actually broke.
      if (shiftsError) {
        console.error('loadData: shifts fetch failed:', shiftsError.message, shiftsError);
        showToast('Could not load shifts: ' + shiftsError.message, 'error');
      }

      // Prices of delivered loads (typed in, or read from the carrier file): a shift with no
      // revenue of its own (settlement or manual) takes the sum of the loads its driver delivered during it.
      const { data: pricedLoads } = await supabase!
        .from('dispatch_loads')
        .select('driver_id, price, completed_at')
        .eq('status', 'completed')
        .not('price', 'is', null)
        .not('completed_at', 'is', null)
        .limit(5000);
      const loadRevenueFor = (s: any): number | null => {
        const from = new Date(s.start_time).getTime();
        const to = s.end_time ? new Date(s.end_time).getTime() : Date.now();
        let sum = 0; let found = false;
        for (const l of (pricedLoads ?? []) as { driver_id: string; price: number | string; completed_at: string }[]) {
          if (l.driver_id !== s.driver_id) continue;
          const t = new Date(l.completed_at).getTime();
          if (t >= from && t <= to) { sum += Number(l.price) || 0; found = true; }
        }
        return found ? Math.round(sum * 100) / 100 : null;
      };

      const mappedShifts = sfts.map((s: any) => {
        // shift_id is shift_revenue's own primary key, so PostgREST treats
        // this as a one-to-one embed and returns a single object — but
        // tolerate an array shape too rather than assume a client version.
        const revenueRow = Array.isArray(s.shift_revenue) ? s.shift_revenue[0] : s.shift_revenue;
        return {
          ...s,
          driver_name: s.drivers?.full_name || s.employee?.name || s.driver?.name || s.driver_name || 'Driver',
          driver_code: s.drivers?.driver_id || s.driver_code || '',
          depot_name: s.depots?.name,
          extras_amount: s.extras_amount ?? null,
          extras_note: s.extras_note ?? null,
          total_pay: s.total_pay ?? null,
          revenue_amount: revenueRow?.revenue_amount ?? loadRevenueFor(s),
          load_reference: revenueRow?.load_reference ?? null,
          load_delivered_at: revenueRow?.delivered_at ?? null,
          delivery_paperwork_path: revenueRow?.delivery_paperwork_path ?? null,
          delivery_evidence_path: revenueRow?.delivery_evidence_path ?? null,
          loads: ((s.shift_loads ?? []) as ShiftLoad[]).map(l => ({ ...l, revenue_amount: l.revenue_amount === null ? null : Number(l.revenue_amount) })).sort((a, b) => a.created_at.localeCompare(b.created_at)),
          vehicle_id: s.vehicle_id ?? null,
          vehicle_number: s.vehicle?.vehicle_number ?? null,
          trailer_id: s.trailer_id ?? null,
          trailer_number: s.trailer?.vehicle_number ?? s.custom_trailer_number ?? null,
          carrier_name: revenueRow?.carrier_name ?? null,
        };
      });
      setShifts(mappedShifts);

      // Fetch Active Idle Alerts — joined through to the vehicle assigned
      // to the shift this alert fired on (nullable: not every shift has
      // one), so the card can show a real VRM instead of fabricating one.
      // Dismissed alerts are stored as cleared = true in the database, so
      // they stay dismissed after a reload and for every other dispatcher.
      const { data: alrts } = await supabase!
        .from('idle_alerts')
        .select('*, drivers(full_name, driver_id), shifts(vehicle_id, vehicles!vehicle_id(vehicle_number))')
        .eq('cleared', false)
        .order('started_at', { ascending: false });

      const mappedIdle = (alrts || [])
        .filter((a: any) => !activeClearedIds.includes(a.id))
        .map((a: any) => ({
          ...a,
          driver_name: a.drivers?.full_name,
          driver_code: a.drivers?.driver_id,
          vehicle_number: a.shifts?.vehicles?.vehicle_number ?? null,
          is_sos: false,
          timestamp: a.started_at,
        }));

      // Fetch Active SOS Alerts
      const { data: sosAlrts } = await supabase!
        .from('sos_alerts')
        .select('*, drivers(full_name, driver_id), shifts(vehicle_id, vehicles!vehicle_id(vehicle_number))')
        .order('created_at', { ascending: false });

      const mappedSOS = (sosAlrts || [])
        .filter((a: any) => a.cleared !== true && !activeClearedIds.includes(a.id))
        .map((a: any) => ({
          ...a,
          driver_name: a.drivers?.full_name,
          driver_code: a.drivers?.driver_id,
          vehicle_number: a.shifts?.vehicles?.vehicle_number ?? null,
          is_sos: true,
          started_at: a.created_at, // Map for start time rendering
          timestamp: a.created_at,
        }));

      // Combine and sort by timestamp descending
      const combinedAlerts = [...mappedIdle, ...mappedSOS].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      setAlerts(combinedAlerts);

      // Drivers on shift whose GPS stopped (migration 081): open events,
      // plus recent unacknowledged ones so the Alert Panel can show what
      // happened while nobody was watching.
      const { data: offlineRows } = await supabase!
        .from('gps_offline_events')
        .select('*, drivers(full_name), shifts(vehicles!vehicle_id(vehicle_number))')
        .or('resolved_at.is.null,acknowledged.eq.false')
        .order('started_at', { ascending: false })
        .limit(100);
      setGpsOfflineEvents((offlineRows || []).map((e: any) => ({
        ...e,
        driver_name: e.drivers?.full_name,
        vehicle_number: e.shifts?.vehicles?.vehicle_number ?? null,
      })));

      // 1. Fetch Live Locations from live_driver_locations view
      const { data: viewLocs } = await supabase!
        .from('live_driver_locations')
        .select('*');

      // 2. Fetch Active Shifts without end_time for fallback
      const { data: activeShifts } = await supabase!
        .from('shifts')
        .select('*, drivers(full_name, driver_id)')
        .eq('status', 'active')
        .is('end_time', null);

      const locsMap = new Map<string, LiveLocation>();

      // Populate from live_driver_locations view (filtering out drivers who have clocked out with end_time)
      const parseUtcTimestamp = (ts: string | null | undefined): number => {
        if (!ts) return 0;
        const str = ts.toString().trim();
        const cleanStr = str.endsWith('Z') || str.includes('+') ? str : `${str.replace(' ', 'T')}Z`;
        return new Date(cleanStr).getTime();
      };

      if (viewLocs && viewLocs.length > 0) {
        const nowTs = Date.now();
        for (const item of viewLocs) {
          // Check if driver has an active shift without end_time. Ignore
          // future-dated rows (bad seed/test data) so a bogus completed
          // shift can't outrank the driver's real current shift and hide
          // otherwise-correct live telemetry behind a false "clocked out".
          const drvLatestShift = (mappedShifts || [])
            .filter((s: any) => new Date(s.start_time).getTime() <= nowTs)
            .find((s: any) =>
              s.driver_id === item.driver_id || s.driver_id === item.driver_code || s.driver_code === item.driver_code
            );

          // If latest shift has an end_time or status is completed, the driver IS CLOCKED OUT! Skip!
          if (drvLatestShift && (drvLatestShift.end_time || drvLatestShift.status === 'completed')) {
            continue;
          }

          const pingTime = parseUtcTimestamp(item.recorded_at);
          const now = Date.now();
          const diffMinutes = pingTime > 0 ? (now - pingTime) / 60000 : 999;

          let currentStatus: 'moving' | 'stationary' | 'idle' = (item.speed || 0) < 0.5 ? 'stationary' : 'moving';
          if (orgAlertSettings.idleDetectionEnabled && diffMinutes >= orgAlertSettings.idleAlertMinutes) {
            currentStatus = 'idle';
          }

          locsMap.set(item.driver_id, {
            driver_id: item.driver_id,
            driver_name: item.full_name || 'Driver',
            driver_code: item.emp_code || 'DRV',
            latitude: item.latitude,
            longitude: item.longitude,
            speed_mph: (item.speed || 0) * 2.23694,
            last_ping: item.recorded_at,
            status: currentStatus,
          });
        }
      }

      // Fallback for active drivers without end_time not captured by view
      for (const shift of activeShifts || []) {
        if (shift.end_time || shift.status === 'completed') continue;
        if (!locsMap.has(shift.driver_id)) {
          const { data: lastLoc } = await supabase!
            .from('gps_locations')
            .select('*')
            .eq('shift_id', shift.id)
            .order('recorded_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (lastLoc) {
            const pingTime = parseUtcTimestamp(lastLoc.recorded_at);
            const now = Date.now();
            const diffMinutes = pingTime > 0 ? (now - pingTime) / 60000 : 999;

            let currentStatus: 'moving' | 'stationary' | 'idle' = (lastLoc.speed || 0) < 0.5 ? 'stationary' : 'moving';
            if (orgAlertSettings.idleDetectionEnabled && diffMinutes >= orgAlertSettings.idleAlertMinutes) {
              currentStatus = 'idle';
            }

            locsMap.set(shift.driver_id, {
              driver_id: shift.driver_id,
              driver_name: shift.drivers?.full_name || 'Driver',
              driver_code: shift.drivers?.driver_id || 'DRV',
              latitude: lastLoc.latitude,
              longitude: lastLoc.longitude,
              speed_mph: (lastLoc.speed || 0) * 2.23694,
              last_ping: lastLoc.recorded_at,
              status: currentStatus,
            });
          } else if (shift.start_lat !== null && shift.start_lng !== null) {
            const pingTime = parseUtcTimestamp(shift.start_time);
            const now = Date.now();
            const diffMinutes = pingTime > 0 ? (now - pingTime) / 60000 : 999;

            locsMap.set(shift.driver_id, {
              driver_id: shift.driver_id,
              driver_name: shift.drivers?.full_name || 'Driver',
              driver_code: shift.drivers?.driver_id || 'DRV',
              latitude: shift.start_lat,
              longitude: shift.start_lng,
              speed_mph: 0,
              last_ping: shift.start_time,
              status: diffMinutes >= orgAlertSettings.idleAlertMinutes ? 'idle' : 'stationary',
            });
          }
        }
      }

      setLiveLocations(Array.from(locsMap.values()));
    } catch (e: any) {
      // Was console-only — a thrown network/connection failure here
      // (as opposed to a query-level {error} response, handled above)
      // silently left every view exactly as stale as it already was,
      // with nothing on screen to say a refresh had failed.
      console.error('loadData failed:', e);
      showToast('Could not refresh dashboard data: ' + (e?.message || 'connection error'), 'error');
    }
  }, [isMockMode, userRole, clearedAlertIds, orgAlertSettings.idleAlertMinutes]);

  const handleMapRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setIsRefreshing(false);
    }
  };

   useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated, loadData]);

  // Periodic background refresh for idle checks & offline sync
  useEffect(() => {
    if (isMockMode || !isAuthenticated) return;

    const runIdleDetection = async () => {
      try {
        const { error } = await supabase!.rpc('detect_idle_drivers');
        if (error) {
          console.error('CRITICAL RPC ERROR (detect_idle_drivers):', error.message, error.details);
        }
      } catch (err) {
        console.error('Failed to trigger idle detection RPC request:', err);
      }
    };

    runIdleDetection();

    // Trigger detection and reload data every 15 seconds to catch manual entries
    const interval = setInterval(async () => {
      await runIdleDetection();
      await loadData();
    }, 15000);

    return () => clearInterval(interval);
  }, [isAuthenticated, isMockMode, loadData]);

  // ── Supabase Auth State Change Listener ──────────────────────────
  useEffect(() => {
    if (isMockMode) return;

    const { data: { subscription } } = supabase!.auth.onAuthStateChange((event, session) => {
      // A reset link signs the user in with a recovery session. Divert them to the
      // "set a new password" screen instead of dropping them into the dashboard.
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true);
        return;
      }

      if (session) {
        // Deferred out of the callback: supabase-js holds its auth lock
        // while listeners run, so awaiting another auth call here can hang.
        setTimeout(async () => {
          // A password-only (AAL1) session for an account with a verified
          // authenticator isn't signed in yet. This listener fires on
          // SIGNED_IN before handleLogin's own check, and on every reload,
          // so the two-step gate has to live here as well.
          const { data: aal } = await supabase!.auth.mfa.getAuthenticatorAssuranceLevel();
          if (aal?.currentLevel === 'aal1' && aal.nextLevel === 'aal2') {
            setIsAuthenticated(false);
            localStorage.removeItem('admin_session');
            const { data: factors } = await supabase!.auth.mfa.listFactors();
            const first = (factors?.totp ?? []).find(f => f.status === 'verified');
            if (first) {
              setMfaChallenge(prev => prev ?? { factorId: first.id, code: '', verifying: false, error: '' });
            } else {
              await supabase!.auth.signOut();
            }
            return;
          }

          setIsAuthenticated(true);
          localStorage.setItem('admin_session', 'true');

          // A provisioned or admin-reset account carries a temporary password —
          // divert to the same "set a new password" screen before anything else.
          if (session.user?.user_metadata?.must_change_password) {
            setRecoveryMode(true);
          }

          // Re-resolve the department from the database so an edited
          // localStorage value cannot widen the UI on reload — and check
          // the org hasn't been blocked since the last visit.
          const { role, blocked, companyName, organizationId } = await resolveUserRole();
          if (blocked) {
            supabase!.auth.signOut();
            setIsAuthenticated(false);
            localStorage.removeItem('admin_session');
            localStorage.removeItem('admin_role');
            setLoginError(`Access for ${companyName ?? 'this company'} is suspended. Contact Tachyo support to reactivate it.`);
            return;
          }
          setUserRole(role);
          localStorage.setItem('admin_role', role);
          if (organizationId) {
            setCurrentOrgId(organizationId);
            loadOrgAlertSettings(organizationId);
          }
        }, 0);
      } else {
        setIsAuthenticated(false);
        localStorage.removeItem('admin_session');
      }
    });

    return () => subscription.unsubscribe();
  }, [resolveUserRole, loadOrgAlertSettings]);

  // ── WebSockets Realtime Subscriptions ──────────────────────────
  useEffect(() => {
    if (isMockMode || !isAuthenticated) return;

    // Realtime channel for new Idle Alerts
    const alertChannel = supabase!
      .channel('realtime_alerts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'idle_alerts' },
        async () => {
          // Play siren instantly
          playAlertSiren();
          // Reload data
          loadData();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'idle_alerts' },
        () => {
          loadData();
        }
      )
      .subscribe();

    // Drivers whose GPS stops / resumes (migration 081)
    const gpsOfflineChannel = supabase!
      .channel('realtime_gps_offline')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gps_offline_events' }, () => { loadData(); })
      .subscribe();

    // Realtime channel for new SOS Alerts
    const sosAlertChannel = supabase!
      .channel('realtime_sos_alerts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sos_alerts' },
        async () => {
          // Play siren instantly (emergency!)
          playAlertSiren();
          // Reload data
          loadData();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sos_alerts' },
        () => {
          loadData();
        }
      )
      .subscribe();

    // Realtime channel for shift pings / clock actions
    // Every table the dashboard/board/tables are built from triggers the
    // same reload, so a change made in ANY section (a load attached or
    // delivered, an employee edited, a vehicle changed) shows up
    // everywhere without a refresh. Debounced so a burst of writes
    // (e.g. one clock-in touching several rows) is one reload.
    let reloadTimer: ReturnType<typeof setTimeout> | undefined;
    const reloadSoon = () => {
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => loadData(), 400);
    };
    const shiftChannel = supabase!
      .channel('realtime_shifts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, reloadSoon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_loads' }, reloadSoon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_revenue' }, reloadSoon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, reloadSoon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, reloadSoon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'depots' }, reloadSoon)
      .subscribe();

    // Realtime channel for GPS coordinates (live driver movement updates)
    const gpsChannel = supabase!
      .channel('realtime_gps')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'gps_locations' },
        () => {
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase!.removeChannel(alertChannel);
      supabase!.removeChannel(sosAlertChannel);
      supabase!.removeChannel(gpsOfflineChannel);
      clearTimeout(reloadTimer);
      supabase!.removeChannel(shiftChannel);
      supabase!.removeChannel(gpsChannel);
    };
  }, [isAuthenticated, isMockMode, loadData]);

  // ── GPS Mileage (Profitability) ───────────────────────────
  // Real distance per completed shift, computed server-side by the
  // shift_mileages() RPC (migration 045) from actual gps_locations via
  // PostGIS — never estimated client-side. Fetched in batches, only for
  // shifts not already resolved, so this stays a one-time backfill per
  // shift rather than refiring on every unrelated `shifts` update (e.g.
  // a revenue edit). A shift absent from the result (under 2 GPS pings)
  // is left out of the map entirely — genuinely unknown, not zero.
  // Shifts already sent to the RPC. A shift with too few pings never lands
  // in mileageByShift, so "not in the map" alone can't mean "not asked yet"
  // — that re-requested it on every state update, in a tight loop.
  const mileageRequestedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (isMockMode || !supabase || !isAuthenticated) return;
    const requested = mileageRequestedRef.current;
    const missing = shifts
      .filter(s => s.status === 'completed' && !(s.id in mileageByShift) && !requested.has(s.id))
      .map(s => s.id);
    if (missing.length === 0) return;
    missing.forEach(id => requested.add(id));
    (async () => {
      const updates: Record<string, number> = {};
      for (let i = 0; i < missing.length; i += 200) {
        const chunk = missing.slice(i, i + 200);
        const { data, error } = await supabase!.rpc('shift_mileages', { p_shift_ids: chunk });
        // Let a failed batch be retried on the next shifts refresh.
        if (error) { chunk.forEach(id => requested.delete(id)); continue; }
        for (const row of (data ?? []) as { shift_id: string; miles: number }[]) {
          updates[row.shift_id] = Number(row.miles);
        }
      }
      if (Object.keys(updates).length > 0) setMileageByShift(prev => ({ ...prev, ...updates }));
    })();
  }, [shifts, isMockMode, isAuthenticated, mileageByShift]);

  // ── Fuel Receipts (Profitability) ─────────────────────────
  // Driver-submitted receipts (migration 047) — this is what Actual
  // Fuel Cost is now computed from (approved rows only), replacing the
  // old GPS-mileage estimate. Realtime so a receipt a driver just
  // photographed shows up in the review queue without a manual refresh,
  // same pattern as the Compliance incident-reports feed.
  const loadFuelReceipts = useCallback(async () => {
    if (isMockMode || !supabase || !currentOrgId) return;
    const { data, error } = await supabase
      .from('fuel_receipts')
      .select('id, driver_id, shift_id, vehicle_id, liters, total_cost, vendor, receipt_photo_path, status, auto_approved, created_at, odometer_miles, dashboard_photo_path, gps_lat, gps_lng, is_full_tank, delta_miles, calculated_mpg, theft_flag, theft_reason, drivers(full_name), vehicles!vehicle_id(vehicle_number, fuel_tank_capacity_litres)')
      .eq('organization_id', currentOrgId)
      .order('created_at', { ascending: false });
    // Was silently dropping a failed fetch (network error, RLS denial,
    // anything) — the receipts list just stayed empty/stale with no
    // indication anything went wrong. Surfaced now so a real failure is
    // visible instead of looking identical to "no receipts yet".
    if (error) {
      console.error('loadFuelReceipts failed:', error.message, error);
      showToast('Could not load fuel receipts: ' + error.message, 'error');
      return;
    }
    if (data) {
      setFuelReceipts((data as any[]).map(r => ({
        ...r,
        driver_name: r.drivers?.full_name,
        vehicle_number: r.vehicles?.vehicle_number,
        fuel_tank_capacity_litres: r.vehicles?.fuel_tank_capacity_litres ?? null,
      })) as FuelReceipt[]);
    }
  }, [isMockMode, currentOrgId]);

  useEffect(() => {
    loadFuelReceipts();
  }, [loadFuelReceipts]);

  useEffect(() => {
    if (isMockMode || !supabase || !currentOrgId) return;
    const channel = supabase
      .channel('realtime_fuel_receipts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fuel_receipts' }, () => {
        loadFuelReceipts();
      })
      .subscribe();
    return () => {
      supabase!.removeChannel(channel);
    };
  }, [isMockMode, currentOrgId, loadFuelReceipts]);

  // Overnight Parking Expenses — same load/realtime shape as fuel
  // receipts above.
  const loadParkingExpenses = useCallback(async () => {
    if (isMockMode || !supabase || !currentOrgId) return;
    const { data, error } = await supabase
      .from('parking_expenses')
      .select('id, driver_id, shift_id, amount, location, parking_date, note, receipt_photo_path, status, auto_approved, created_at, drivers(full_name)')
      .eq('organization_id', currentOrgId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('loadParkingExpenses failed:', error.message, error);
      showToast('Could not load parking expenses: ' + error.message, 'error');
      return;
    }
    if (data) {
      setParkingExpenses((data as any[]).map(r => ({
        ...r,
        driver_name: r.drivers?.full_name,
      })) as ParkingExpense[]);
    }
  }, [isMockMode, currentOrgId]);

  useEffect(() => {
    loadParkingExpenses();
  }, [loadParkingExpenses]);

  useEffect(() => {
    if (isMockMode || !supabase || !currentOrgId) return;
    const channel = supabase
      .channel('realtime_parking_expenses')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parking_expenses' }, () => {
        loadParkingExpenses();
      })
      .subscribe();
    return () => {
      supabase!.removeChannel(channel);
    };
  }, [isMockMode, currentOrgId, loadParkingExpenses]);

  const pendingParkingExpensesCount = useMemo(
    () => parkingExpenses.filter(r => r.status === 'pending').length,
    [parkingExpenses],
  );

  // ── Walk-around check compliance (Alert Panel) ──────────────
  // Last 14 days is plenty for "who skipped or rushed a check this
  // week"; the full history lives on the Walk-Around Checks page.
  const [recentWalkarounds, setRecentWalkarounds] = useState<ComplianceCheck[]>([]);
  const loadRecentWalkarounds = useCallback(async () => {
    if (isMockMode || !supabase || !currentOrgId) return;
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('walkaround_checks')
      .select('id, shift_id, check_type, completed_at, duration_seconds, overall_result, defect_note')
      .eq('organization_id', currentOrgId)
      .gte('started_at', since);
    if (error) {
      console.error('loadRecentWalkarounds failed:', error.message);
      return;
    }
    setRecentWalkarounds((data ?? []) as ComplianceCheck[]);
  }, [isMockMode, currentOrgId]);

  useEffect(() => {
    loadRecentWalkarounds();
  }, [loadRecentWalkarounds]);

  useEffect(() => {
    if (isMockMode || !supabase || !currentOrgId) return;
    const channel = supabase
      .channel('realtime_walkaround_alerts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'walkaround_checks' }, () => loadRecentWalkarounds())
      .subscribe();
    return () => {
      supabase!.removeChannel(channel);
    };
  }, [isMockMode, currentOrgId, loadRecentWalkarounds]);

  const walkaroundAlertIssues = useMemo(() => {
    const compliance = computeShiftCompliance(shifts, recentWalkarounds, {
      targetMinutes: orgAlertSettings.walkaroundCheckTargetMinutes,
      since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      // Every profession does walk-around checks — no exempt roles.
      isFieldRole: () => true,
    });
    return walkaroundIssues(compliance);
  }, [shifts, recentWalkarounds, orgAlertSettings.walkaroundCheckTargetMinutes]);

  const walkaroundIssuesToday = useMemo(() => {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    return walkaroundAlertIssues.filter(i => new Date(i.at) >= midnight).length;
  }, [walkaroundAlertIssues]);

  // ── Plan & entitlements (migration 067) ─────────────────────
  // The database decides what the plan allows; this only tidies the UI.
  // Until the answer arrives (or if it can't be fetched) nothing is hidden.
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const loadEntitlements = useCallback(async () => {
    if (isMockMode || !supabase || !currentOrgId) return;
    const { data, error } = await supabase.rpc('my_entitlements');
    if (!error && data) setEntitlements(data as Entitlements);
  }, [isMockMode, currentOrgId]);

  useEffect(() => {
    loadEntitlements();
  }, [loadEntitlements]);

  // Pick up a plan change made by the Tachyo team without a full reload.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') loadEntitlements(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loadEntitlements]);

  const hasFeature = useCallback(
    (key: FeatureKey) => (entitlements ? entitlements.features.includes(key) : true),
    [entitlements],
  );
  const tabFeature = TAB_FEATURE[activeTab];
  const tabLocked = tabFeature ? !hasFeature(tabFeature) : false;

  // ── True cost ledger + analytics targets (migration 062) ────
  const [orgCosts, setOrgCosts] = useState<OrgCost[]>([]);
  const [analyticsSettings, setAnalyticsSettings] = useState<AnalyticsSettings>(DEFAULT_ANALYTICS_SETTINGS);
  const loadTrueCostData = useCallback(async () => {
    if (isMockMode || !supabase || !currentOrgId) return;
    const [{ data: costRows, error: costErr }, { data: settingsRow }] = await Promise.all([
      supabase.from('org_costs').select('*').eq('organization_id', currentOrgId).order('start_date', { ascending: false }),
      supabase.from('org_analytics_settings').select('*').eq('organization_id', currentOrgId).maybeSingle(),
    ]);
    if (costErr) {
      console.error('loadTrueCostData failed:', costErr.message);
      return;
    }
    setOrgCosts(((costRows ?? []) as any[]).map(c => ({ ...c, amount: Number(c.amount) })) as OrgCost[]);
    if (settingsRow) {
      setAnalyticsSettings({
        employer_oncost_percent: Number(settingsRow.employer_oncost_percent) || 0,
        target_margin_percent: Number(settingsRow.target_margin_percent),
        target_revenue_per_truck_day: settingsRow.target_revenue_per_truck_day === null ? null : Number(settingsRow.target_revenue_per_truck_day),
        target_weekly_profit: settingsRow.target_weekly_profit === null ? null : Number(settingsRow.target_weekly_profit),
      });
    }
  }, [isMockMode, currentOrgId, userRole]);

  useEffect(() => {
    loadTrueCostData();
  }, [loadTrueCostData]);

  // ── Holiday requests (Alert Panel) ──────────────────────────
  // Every employee can request holiday from the app (migration 061);
  // pending requests wait here — and on Employee Holidays — for an admin
  // to approve or decline.
  const [holidayRequests, setHolidayRequests] = useState<{
    id: string;
    driver_id: string;
    driver_name?: string;
    start_date: string;
    end_date: string;
    note: string | null;
    leave_type: string;
    created_at: string;
  }[]>([]);
  const [decliningHolidayId, setDecliningHolidayId] = useState<string | null>(null);
  const [holidayDeclineNote, setHolidayDeclineNote] = useState('');
  const [reviewingHolidayId, setReviewingHolidayId] = useState<string | null>(null);

  const loadHolidayRequests = useCallback(async () => {
    if (isMockMode || !supabase || !currentOrgId) return;
    const { data, error } = await supabase
      .from('employee_holidays')
      .select('id, driver_id, start_date, end_date, note, leave_type, created_at, drivers(full_name)')
      .eq('organization_id', currentOrgId)
      .eq('status', 'pending')
      .order('start_date');
    if (error) {
      console.error('loadHolidayRequests failed:', error.message);
      return;
    }
    setHolidayRequests((data ?? []).map((h: any) => ({ ...h, driver_name: h.drivers?.full_name })));
  }, [isMockMode, currentOrgId]);

  useEffect(() => {
    loadHolidayRequests();
  }, [loadHolidayRequests]);

  useEffect(() => {
    if (isMockMode || !supabase || !currentOrgId) return;
    const channel = supabase
      .channel('realtime_holiday_requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employee_holidays' }, () => loadHolidayRequests())
      .subscribe();
    return () => {
      supabase!.removeChannel(channel);
    };
  }, [isMockMode, currentOrgId, loadHolidayRequests]);

  const reviewHolidayRequest = async (id: string, decision: 'approved' | 'declined', note?: string) => {
    if (isMockMode || !supabase) return;
    setReviewingHolidayId(id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('employee_holidays')
        .update({
          status: decision,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user?.email?.toLowerCase() ?? null,
          review_note: note?.trim() || null,
        })
        .eq('id', id)
        .eq('status', 'pending');
      if (error) throw error;
      setHolidayRequests(prev => prev.filter(h => h.id !== id));
      setDecliningHolidayId(null);
      setHolidayDeclineNote('');
      showToast(decision === 'approved' ? 'Holiday approved — it now shows on the calendar.' : 'Holiday request declined.', 'success');
    } catch (err: any) {
      showToast('Could not update the holiday request: ' + (err?.message ?? 'unknown error'), 'error');
    } finally {
      setReviewingHolidayId(null);
    }
  };

  // ── Account deletion requests (migration 100) ──────────────
  // An employee asks, from the app's login screen or settings, for their
  // account and everything attached to it to be removed. It waits here until
  // an administrator confirms; confirming deletes the data for good.
  const [deletionRequests, setDeletionRequests] = useState<{
    id: string;
    driver_name: string | null;
    driver_ref: string | null;
    reason: string | null;
    source: 'login' | 'app';
    requested_at: string;
  }[]>([]);
  const [deletingRequestId, setDeletingRequestId] = useState<string | null>(null);
  const loadDeletionRequests = useCallback(async () => {
    if (isMockMode || !supabase || !currentOrgId) return;
    const { data, error } = await supabase
      .from('account_deletion_requests')
      .select('id, driver_name, driver_ref, reason, source, requested_at')
      .eq('organization_id', currentOrgId)
      .eq('status', 'pending')
      .order('requested_at', { ascending: false });
    if (error) { console.error('loadDeletionRequests failed:', error.message); return; }
    setDeletionRequests((data ?? []) as typeof deletionRequests);
  }, [isMockMode, currentOrgId]);

  useEffect(() => { loadDeletionRequests(); }, [loadDeletionRequests]);

  // "Refresh" on a No Data panel re-reads the data behind the screen on view.
  useSectionRefresh(() => { loadData(); loadDeletionRequests(); loadPinResetRequests(); loadRiskSignoffs(); loadUnitRisk(); });

  useEffect(() => {
    if (isMockMode || !supabase || !currentOrgId) return;
    const channel = supabase
      .channel('realtime_account_deletion')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'account_deletion_requests' }, () => loadDeletionRequests())
      .subscribe();
    return () => { supabase!.removeChannel(channel); };
  }, [isMockMode, currentOrgId, loadDeletionRequests]);

  const confirmAccountDeletion = async (r: { id: string; driver_name: string | null; driver_ref: string | null }) => {
    if (isMockMode || !supabase) return;
    const who = `${r.driver_name ?? 'this employee'}${r.driver_ref ? ` (${r.driver_ref})` : ''}`;
    if (!window.confirm(`Permanently delete ${who} and everything attached to the account — shifts, locations, walk-around checks, defect reports, receipts, holidays, rota and their sign-in?\n\nThis cannot be undone. Only continue once you are sure the request really came from them.`)) return;
    setDeletingRequestId(r.id);
    const { error } = await supabase.rpc('complete_account_deletion', { p_request_id: r.id });
    setDeletingRequestId(null);
    if (error) { showToast(`Could not delete the account: ${error.message}`, 'error'); return; }
    showToast(`${who} and all their data have been deleted.`, 'success');
    loadDeletionRequests();
  };

  const dismissAccountDeletion = async (id: string) => {
    if (isMockMode || !supabase) return;
    const { error } = await supabase.from('account_deletion_requests')
      .update({ status: 'dismissed', handled_at: new Date().toISOString() }).eq('id', id);
    if (error) { showToast(`Could not dismiss it: ${error.message}`, 'error'); return; }
    loadDeletionRequests();
  };

  // ── PIN reset requests (migration 065) ─────────────────────
  const [pinResetRequests, setPinResetRequests] = useState<{
    id: string;
    driver_id: string;
    driver_name?: string;
    driver_code?: string;
    requested_at: string;
  }[]>([]);
  const loadPinResetRequests = useCallback(async () => {
    if (isMockMode || !supabase || !currentOrgId) return;
    const { data, error } = await supabase
      .from('driver_pin_reset_requests')
      .select('id, driver_id, requested_at, drivers(full_name, driver_id)')
      .eq('organization_id', currentOrgId)
      .is('handled_at', null)
      .order('requested_at', { ascending: false });
    if (error) {
      console.error('loadPinResetRequests failed:', error.message);
      return;
    }
    setPinResetRequests((data ?? []).map((r: any) => ({
      id: r.id, driver_id: r.driver_id, requested_at: r.requested_at,
      driver_name: r.drivers?.full_name, driver_code: r.drivers?.driver_id,
    })));
  }, [isMockMode, currentOrgId]);

  useEffect(() => { loadPinResetRequests(); }, [loadPinResetRequests]);

  useEffect(() => {
    if (isMockMode || !supabase || !currentOrgId) return;
    const channel = supabase
      .channel('realtime_pin_reset')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_pin_reset_requests' }, () => loadPinResetRequests())
      .subscribe();
    return () => { supabase!.removeChannel(channel); };
  }, [isMockMode, currentOrgId, loadPinResetRequests]);

  const issuePinResetFromRequest = async (driverId: string, driverCode: string, driverName: string) => {
    if (isMockMode || !supabase) return;
    try {
      const { data, error } = await supabase.functions.invoke('create-driver', {
        body: { action: 'reset_pin', id: driverId },
      });
      if (error) {
        showToast(`Could not issue an activation code: ${error.message}`, 'error');
        return;
      }
      if (data?.activation_code) {
        setActivationCodeShown({ code: data.activation_code, name: driverName, driverId: driverCode, reason: 'reset' });
      }
      loadPinResetRequests();
    } catch (err: any) {
      showToast(`Could not issue an activation code: ${err?.message ?? 'unknown error'}`, 'error');
    }
  };

  // ── Unroadworthy sign-offs (migration 063) ──────────────────
  // A driver who takes a unit/trailer with expired MOT/tax/insurance/
  // inspection or VOR signs on screen; each one waits here until an
  // admin marks it reviewed.
  const [riskSignoffs, setRiskSignoffs] = useState<{
    id: string;
    driver_name?: string;
    vehicle_number?: string;
    issues: string[];
    context: string;
    signer_name: string;
    signature_svg: string;
    acknowledged_at: string;
  }[]>([]);
  const loadRiskSignoffs = useCallback(async () => {
    if (isMockMode || !supabase || !currentOrgId) return;
    const { data, error } = await supabase
      .from('vehicle_risk_acknowledgements')
      .select('id, issues, context, signer_name, signature_svg, acknowledged_at, drivers(full_name), vehicle:vehicles!vehicle_id(vehicle_number)')
      .eq('organization_id', currentOrgId)
      .is('reviewed_at', null)
      .order('acknowledged_at', { ascending: false })
      .limit(100);
    if (error) {
      console.error('loadRiskSignoffs failed:', error.message);
      return;
    }
    setRiskSignoffs((data ?? []).map((r: any) => ({ ...r, driver_name: r.drivers?.full_name, vehicle_number: r.vehicle?.vehicle_number })));
  }, [isMockMode, currentOrgId]);

  useEffect(() => {
    loadRiskSignoffs();
  }, [loadRiskSignoffs]);

  useEffect(() => {
    if (isMockMode || !supabase || !currentOrgId) return;
    const channel = supabase
      .channel('realtime_risk_signoffs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicle_risk_acknowledgements' }, () => loadRiskSignoffs())
      .subscribe();
    return () => {
      supabase!.removeChannel(channel);
    };
  }, [isMockMode, currentOrgId, loadRiskSignoffs]);

  const markRiskSignoffReviewed = async (id: string) => {
    if (isMockMode || !supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('vehicle_risk_acknowledgements')
      .update({ reviewed_at: new Date().toISOString(), reviewed_by: user?.email?.toLowerCase() ?? null })
      .eq('id', id);
    if (error) {
      showToast('Could not mark it reviewed: ' + error.message, 'error');
      return;
    }
    setRiskSignoffs(prev => prev.filter(r => r.id !== id));
  };

  // ── Not-roadworthy units in use (derived, always live) ─────────
  // The sign-off above only exists once a driver signs. This watches every
  // open shift against the fleet register, so the office sees a unit or
  // trailer that can't be on the road for as long as the driver has it,
  // whether or not anyone signed.
  const [unitRiskRows, setUnitRiskRows] = useState<RiskVehicleRow[]>([]);
  const [criticalVehicleIds, setCriticalVehicleIds] = useState<string[]>([]);
  const loadUnitRisk = useCallback(async () => {
    if (isMockMode || !supabase || !currentOrgId) return;
    const [v, d] = await Promise.all([
      supabase.from('vehicles').select('id, vehicle_number, vehicle_type, inspection_type, inspection_due_date, mot_due_date, tax_due_date, insurance_expiry_date, manual_vor').eq('organization_id', currentOrgId).eq('is_active', true),
      supabase.from('incident_reports').select('vehicle_id, trailer_id').eq('organization_id', currentOrgId).eq('severity', 'critical_vor').neq('status', 'closed'),
    ]);
    if (!v.error) setUnitRiskRows((v.data ?? []) as RiskVehicleRow[]);
    if (!d.error) setCriticalVehicleIds((d.data ?? []).flatMap((r: any) => [r.vehicle_id, r.trailer_id]).filter(Boolean) as string[]);
  }, [isMockMode, currentOrgId]);

  useEffect(() => {
    loadUnitRisk();
    if (isMockMode || !supabase || !currentOrgId) return;
    const channel = supabase
      .channel('realtime_unit_risk')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, () => loadUnitRisk())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incident_reports' }, () => loadUnitRisk())
      .subscribe();
    // Dates roll over at midnight without any row changing.
    const timer = setInterval(loadUnitRisk, 10 * 60 * 1000);
    return () => { clearInterval(timer); supabase!.removeChannel(channel); };
  }, [isMockMode, currentOrgId, loadUnitRisk]);

  // Roadworthy icon -> Fleet Roadworthiness, opened on that exact unit/trailer.
  const [fleetFocus, setFleetFocus] = useState<{ number: string; nonce: number } | null>(null);
  // Status badge -> the Defect Registry, filtered to that registration.
  const [defectFocus, setDefectFocus] = useState<{ number: string; nonce: number } | null>(null);
  const openUnitStatus = useCallback((reg: string) => {
    setDefectFocus({ number: reg, nonce: Date.now() });
    setActiveTab('compliance-defects');
  }, []);
  const openFleetUnit = useCallback((number: string) => {
    setFleetFocus({ number, nonce: Date.now() });
    setActiveTab('fleet-roadworthiness');
  }, []);

  // Signed acceptances for units on the road (any review state), so the
  // "Not Roadworthy In Use" card can show the driver's signature.
  const [unitSignoffs, setUnitSignoffs] = useState<{ shift_id: string | null; number: string; signer_name: string; signature_svg: string; acknowledged_at: string }[]>([]);
  useEffect(() => {
    if (isMockMode || !supabase || !currentOrgId) return;
    let cancelled = false;
    supabase
      .from('vehicle_risk_acknowledgements')
      .select('shift_id, signer_name, signature_svg, acknowledged_at, vehicle:vehicles!vehicle_id(vehicle_number)')
      .eq('organization_id', currentOrgId)
      .gte('acknowledged_at', new Date(Date.now() - 30 * 86400000).toISOString())
      .order('acknowledged_at', { ascending: false })
      .limit(300)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setUnitSignoffs(data.map((r: any) => ({ shift_id: r.shift_id, number: (r.vehicle?.vehicle_number ?? '').toUpperCase(), signer_name: r.signer_name, signature_svg: r.signature_svg, acknowledged_at: r.acknowledged_at })));
      });
    return () => { cancelled = true; };
    // riskSignoffs changes whenever a sign-off arrives or is reviewed.
  }, [isMockMode, currentOrgId, riskSignoffs.length]);

  const unitRisk = useMemo(() => riskIssuesByNumber(unitRiskRows, new Set(criticalVehicleIds)), [unitRiskRows, criticalVehicleIds]);
  const unroadworthyUse = useMemo(() => unroadworthyInUse(shifts, unitRisk), [shifts, unitRisk]);

  // ── Platform owner (Accounts page) ──────────────────────────
  // is_platform_admin() (migration 061) — only the Tachyo team sees the
  // Accounts page and new interest buyers in the Alert Panel.
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [newAccessRequests, setNewAccessRequests] = useState<{
    id: string;
    company_name: string;
    contact_name: string;
    fleet_size: string | null;
    source: string;
    created_at: string;
  }[]>([]);

  useEffect(() => {
    if (isMockMode || !supabase || !isAuthenticated) {
      setIsPlatformAdmin(false);
      return;
    }
    let cancelled = false;
    supabase.rpc('is_platform_admin').then(({ data, error }) => {
      if (!cancelled) setIsPlatformAdmin(!error && data === true);
    });
    return () => { cancelled = true; };
  }, [isMockMode, isAuthenticated, currentOrgId]);

  const loadNewAccessRequests = useCallback(async () => {
    if (isMockMode || !supabase || !isPlatformAdmin) {
      setNewAccessRequests([]);
      return;
    }
    const { data, error } = await supabase
      .from('access_requests')
      .select('id, company_name, contact_name, fleet_size, source, created_at')
      .eq('stage', 'new')
      .order('created_at', { ascending: false })
      .limit(50);
    if (!error) setNewAccessRequests(data ?? []);
  }, [isMockMode, isPlatformAdmin]);

  useEffect(() => {
    loadNewAccessRequests();
    if (!isPlatformAdmin) return;
    const id = window.setInterval(loadNewAccessRequests, 60_000);
    return () => window.clearInterval(id);
  }, [isPlatformAdmin, loadNewAccessRequests]);

  // Approving a claim reimburses it straight into that shift's payroll
  // — added onto extras_amount/extras_note, the same "extra pay on top
  // of the base rate" bucket getShiftFinancials() already folds into
  // gross pay, rather than inventing a second payroll-adjustment path.
  // A claim with no shift_id can't be approved until one's assigned
  // (see parkingShiftAssignment / the modal's inline picker) — there's
  // nowhere to actually credit the money otherwise.
  const handleReviewParkingExpense = useCallback(async (expense: ParkingExpense, status: 'approved' | 'rejected') => {
    if (isMockMode || !supabase) return;
    const targetShiftId = expense.shift_id ?? parkingShiftAssignment[expense.id] ?? null;
    if (status === 'approved' && !targetShiftId) {
      showToast('Assign this claim to a shift before approving it.', 'error');
      return;
    }
    setReviewingParkingExpenseId(expense.id);
    try {
      if (status === 'approved' && targetShiftId) {
        const targetShift = shifts.find(s => s.id === targetShiftId);
        const currentExtras = Number(targetShift?.extras_amount) || 0;
        const currentNote = targetShift?.extras_note ?? undefined;
        const claimNote = `Overnight parking${expense.location ? ` (${expense.location})` : ''}: £${expense.amount.toFixed(2)}`;
        const { error: shiftError } = await supabase
          .from('shifts')
          .update({
            extras_amount: Number((currentExtras + expense.amount).toFixed(2)),
            extras_note: currentNote ? `${currentNote}; ${claimNote}` : claimNote,
          })
          .eq('id', targetShiftId);
        if (shiftError) {
          showToast('Could not add this to payroll: ' + shiftError.message, 'error');
          return;
        }
      }
      await supabase
        .from('parking_expenses')
        .update({ status, reviewed_at: new Date().toISOString(), ...(expense.shift_id ? {} : { shift_id: targetShiftId }) })
        .eq('id', expense.id);
      setParkingExpenses(prev => prev.map(r => (r.id === expense.id ? { ...r, status, shift_id: r.shift_id ?? targetShiftId } : r)));
      if (status === 'approved') {
        showToast(`£${expense.amount.toFixed(2)} added to payroll for this shift.`, 'success');
        loadData();
      }
    } finally {
      setReviewingParkingExpenseId(null);
    }
  }, [isMockMode, shifts, parkingShiftAssignment]);

  const openParkingExpenseLightbox = useCallback(async (path: string) => {
    if (isMockMode || !supabase) return;
    const { data } = await supabase.storage.from('parking-receipts').createSignedUrl(path, 3600);
    if (data?.signedUrl) setParkingExpenseLightboxUrl(data.signedUrl);
  }, [isMockMode]);

  const [parkingExpenseThumbUrls, setParkingExpenseThumbUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (isMockMode || !supabase || parkingExpenses.length === 0) return;
    const paths = parkingExpenses.map(r => r.receipt_photo_path).filter(p => !(p in parkingExpenseThumbUrls));
    if (paths.length === 0) return;
    let cancelled = false;
    supabase.storage.from('parking-receipts').createSignedUrls(paths, 3600).then(({ data }) => {
      if (cancelled || !data) return;
      const updates: Record<string, string> = {};
      data.forEach((d, i) => {
        if (d.signedUrl) updates[paths[i]] = d.signedUrl;
      });
      setParkingExpenseThumbUrls(prev => ({ ...prev, ...updates }));
    });
    return () => { cancelled = true; };
  }, [parkingExpenses, isMockMode, parkingExpenseThumbUrls]);

  // Drives the Analytics sidebar nav badge — fuelReceipts itself is loaded
  // and kept live (realtime subscription above) regardless of which tab is
  // active, but the review queue is a modal opened from inside Analytics,
  // so a receipt arriving while an admin is on Live/Drivers/Compliance had
  // no visible sign anything showed up until they happened to click in.
  const pendingFuelReceiptsCount = useMemo(
    () => fuelReceipts.filter(r => r.status === 'pending').length,
    [fuelReceipts],
  );

  // Drives the Shipments sidebar nav badge — a completed shift with no
  // revenue figure set yet is a load waiting to be rated ("Pending
  // Remittance" in the ledger itself). Deliberately a simple unfiltered
  // count (not respecting Analytics'/Shipments' own period/driver
  // filters) since this is a glance-from-anywhere indicator, not a
  // report.
  const pendingLoadsCount = useMemo(
    () => shifts.filter(s => s.status === 'completed' && (s.revenue_amount === null || s.revenue_amount === undefined)).length,
    [shifts],
  );

  // Real, per-shift Actual Fuel Cost — sum of that shift's APPROVED
  // receipts only. A shift with no approved receipts is genuinely
  // unknown-cost (0 here), not "no fuel used"; the ledger/KPI strip
  // render that distinction rather than implying a confirmed zero.
  const approvedFuelCostByShift = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of fuelReceipts) {
      if (r.status !== 'approved' || !r.shift_id) continue;
      map[r.shift_id] = (map[r.shift_id] ?? 0) + (r.total_cost ?? 0);
    }
    return map;
  }, [fuelReceipts]);

  // Fuel theft / skimming detection (migration 070/071) — a valid
  // receipt proves litres were PAID for, not that they went in THIS
  // tank. Every truck in this fleet is always refuelled to the brim, so
  // two full-tank fills bracket exactly the fuel burned over the miles
  // between them: worse than the fixed 7.0 UK MPG / 40 L/100km fleet-
  // wide ceiling on that stretch means fuel left the truck outside the
  // engine. Computed and stored server-side by trg_calc_fuel_theft_flag
  // (delta_miles/calculated_mpg/theft_flag/theft_reason columns on the
  // row itself) — read directly off each FuelReceipt, not recomputed
  // here, so every viewer of this table sees the same answer.
  const anomalousFuelReceiptCount = useMemo(
    () => fuelReceipts.filter(r => r.theft_flag).length,
    [fuelReceipts],
  );

  const handleReviewFuelReceipt = useCallback(async (id: string, status: 'approved' | 'rejected') => {
    if (isMockMode || !supabase) return;
    setReviewingFuelReceiptId(id);
    try {
      await supabase.from('fuel_receipts').update({ status, reviewed_at: new Date().toISOString() }).eq('id', id);
      setFuelReceipts(prev => prev.map(r => (r.id === id ? { ...r, status } : r)));
    } finally {
      setReviewingFuelReceiptId(null);
    }
  }, [isMockMode]);

  const openFuelReceiptLightbox = useCallback(async (path: string) => {
    if (isMockMode || !supabase) return;
    const { data } = await supabase.storage.from('fuel-receipts').createSignedUrl(path, 3600);
    if (data?.signedUrl) setFuelReceiptLightboxUrl(data.signedUrl);
  }, [isMockMode]);

  const [fuelReceiptThumbUrls, setFuelReceiptThumbUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (isMockMode || !supabase || fuelReceipts.length === 0) return;
    const paths = fuelReceipts.map(r => r.receipt_photo_path).filter(p => !(p in fuelReceiptThumbUrls));
    if (paths.length === 0) return;
    let cancelled = false;
    supabase.storage.from('fuel-receipts').createSignedUrls(paths, 3600).then(({ data }) => {
      if (cancelled || !data) return;
      const updates: Record<string, string> = {};
      data.forEach((d, i) => {
        if (d.signedUrl) updates[paths[i]] = d.signedUrl;
      });
      setFuelReceiptThumbUrls(prev => ({ ...prev, ...updates }));
    });
    return () => { cancelled = true; };
  }, [fuelReceipts, isMockMode, fuelReceiptThumbUrls]);

  // ── Simulation Engine (Mock Mode Movement along HGV Route) ───
  useEffect(() => {
    if (!isMockMode || !isAuthenticated) return;

    const interval = setInterval(() => {

        setLiveLocations(prevLocations =>
          prevLocations.map(loc => {
            if (loc.status !== 'moving') return loc;

            const progressMap = mockProgressRef.current;
            const driverProgress = progressMap[loc.driver_id] || { index: 0, direction: 'forward', waitTicks: 0 };
            
            // If currently waiting at a depot
            if (driverProgress.waitTicks > 0) {
              const updatedTicks = driverProgress.waitTicks - 1;
              progressMap[loc.driver_id] = { ...driverProgress, waitTicks: updatedTicks };
              
              if (updatedTicks === 0) {
                return {
                  ...loc,
                  status: 'moving',
                  speed_mph: 42,
                  last_ping: new Date().toISOString(),
                };
              }

              return {
                ...loc,
                status: 'stationary',
                speed_mph: 0,
                last_ping: new Date().toISOString(),
              };
            }

            // Proceed along waypoints
            let nextIndex = driverProgress.index;
            let nextDirection = driverProgress.direction;
            let nextWaitTicks = 0;

            if (nextDirection === 'forward') {
              nextIndex += 1;
              if (nextIndex >= routeWaypoints.length) {
                nextIndex = routeWaypoints.length - 1;
                nextDirection = 'backward';
                nextWaitTicks = 2; // Simulate 12 seconds loading wait at depot
              }
            } else {
              nextIndex -= 1;
              if (nextIndex < 0) {
                nextIndex = 0;
                nextDirection = 'forward';
                nextWaitTicks = 2; // Simulate 12 seconds unloading wait at depot
              }
            }

            const currentPoint = routeWaypoints[nextIndex];
            progressMap[loc.driver_id] = { index: nextIndex, direction: nextDirection, waitTicks: nextWaitTicks };

            if (nextWaitTicks > 0) {
              return {
                ...loc,
                latitude: currentPoint.latitude,
                longitude: currentPoint.longitude,
                status: 'stationary',
                speed_mph: 0,
                last_ping: new Date().toISOString(),
              };
            }

            return {
              ...loc,
              latitude: currentPoint.latitude,
              longitude: currentPoint.longitude,
              status: 'moving',
              speed_mph: 42,
              last_ping: new Date().toISOString(),
            };
          })
        );

    }, 6000);

    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // ── Admin Login Logic ───────────────────────────────────────

  /// Persists (or clears) the remembered email once a sign-in actually succeeds.
  const persistRememberedEmail = (email: string) => {
    if (rememberMe) {
      localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
    } else {
      localStorage.removeItem(REMEMBERED_EMAIL_KEY);
    }
  };

  /// Extracts the real error message from an edge function response.
  /// supabase-js returns { data: null, error: FunctionsHttpError } for ANY
  /// non-2xx and keeps the JSON body on error.context — without unwrapping it
  /// the UI can only ever say "Edge Function returned a non-2xx status code".
  /// Returns null when the call actually succeeded.
  const readFunctionError = async (data: any, error: any): Promise<string | null> => {
    if (data?.error) return data.error;
    if (!error) return null;

    try {
      const body = await error.context?.json?.();
      if (body?.error) return body.error;
    } catch (_) {
      // Body was not JSON — fall back to the generic message below.
    }
    return error.message ?? 'The request failed.';
  };

  /// Sends a request-access enquiry from the login page. Nothing is
  /// created beyond the access_requests row — see request-access.
  const handleRequestAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    setRequestAccessError('');
    const form = requestAccessForm;
    if (form.companyName.trim().length < 2) {
      setRequestAccessError('Enter your company name.');
      return;
    }
    if (form.contactName.trim().length < 2) {
      setRequestAccessError('Enter your name.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setRequestAccessError('Enter a valid work email address.');
      return;
    }
    if (isMockMode || !supabase) {
      setRequestAccessError('Access requests are unavailable in sandbox mock mode.');
      return;
    }

    setIsSubmittingAccessRequest(true);
    try {
      const { data, error } = await supabase.functions.invoke('request-access', {
        body: { ...form, email: form.email.trim().toLowerCase(), source: 'admin_login' },
      });
      const failure = await readFunctionError(data, error);
      if (failure) {
        setRequestAccessError(failure);
      } else {
        setRequestAccessDone(true);
      }
    } catch (_) {
      setRequestAccessError('Could not reach the request service. Please try again.');
    } finally {
      setIsSubmittingAccessRequest(false);
    }
  };

  /// Loads the signed-in admin's own company info for the Settings →
  /// Company tab (name + slug, the latter doubling as the driver company
  /// code, plus the driver-support phone numbers). Payroll admins get the
  /// fuller "list" response (also used by Access Codes); logistics accounts
  /// are only allowed the narrower "get-org-info" action server-side, so
  /// they use that one instead — same `organization` shape either way.
  const loadTeamInfo = useCallback(async () => {
    if (isMockMode || !supabase) return;
    setIsLoadingTeam(true);
    setTeamError('');
    try {
      const activeRole = (localStorage.getItem('admin_role') as UserRole) || userRole;
      const action = activeRole === 'payroll_admin' ? 'list' : 'get-org-info';
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action },
      });
      const failure = await readFunctionError(data, error);
      if (failure) {
        setTeamError(failure);
      } else {
        setTeamOrgInfo(data.organization ?? null);
      }
    } catch (_) {
      setTeamError('Could not load your company details.');
    } finally {
      setIsLoadingTeam(false);
    }
  }, [userRole]);

  /// Rotates one of the company's department registration codes. The new
  /// plaintext code is shown once — same one-time-reveal pattern as company
  /// sign-up, since only the hash is kept afterward.
  const handleRotateCode = async (codeType: 'logistics' | 'payroll') => {
    if (isMockMode || !supabase) return;
    setRotatingCode(codeType);
    setTeamError('');
    setJustRotatedCode(null);
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'rotate-code', codeType },
      });
      const failure = await readFunctionError(data, error);
      if (failure) {
        setTeamError(failure);
      } else {
        setJustRotatedCode({ type: codeType, code: data.code });
      }
    } catch (_) {
      setTeamError('Could not rotate the code.');
    } finally {
      setRotatingCode(null);
    }
  };

  /// Keeps the Settings → Alerts form in sync with the loaded/saved org
  /// values — runs on initial load and again after a successful save.
  useEffect(() => {
    setAlertSettingsForm({
      longShiftFlagHours: String(orgAlertSettings.longShiftFlagHours),
      idleAlertMinutes: String(orgAlertSettings.idleAlertMinutes),
      nightOutMinGapHours: String(orgAlertSettings.nightOutMinGapHours),
      nightOutMaxGapHours: String(orgAlertSettings.nightOutMaxGapHours),
      complianceAlertLeadDays: String(orgAlertSettings.complianceAlertLeadDays),
      walkaroundCheckTargetMinutes: String(orgAlertSettings.walkaroundCheckTargetMinutes),
      loadReminderMinutes: String(orgAlertSettings.loadReminderMinutes),
    });
  }, [orgAlertSettings]);

  /// Saves the five per-company alert thresholds via admin-users'
  /// update-alert-settings action (migration 038/040 + edge function deploy
  /// required — on an environment where either is still pending, this
  /// surfaces the real server error rather than pretending to succeed).
  const handleSaveAlertSettings = async () => {
    if (isMockMode || !supabase) return;
    const longShiftFlagHours = parseFloat(alertSettingsForm.longShiftFlagHours);
    const idleAlertMinutes = parseInt(alertSettingsForm.idleAlertMinutes, 10);
    const nightOutMinGapHours = parseFloat(alertSettingsForm.nightOutMinGapHours);
    const nightOutMaxGapHours = parseFloat(alertSettingsForm.nightOutMaxGapHours);
    const complianceAlertLeadDays = parseInt(alertSettingsForm.complianceAlertLeadDays, 10);
    const walkaroundCheckTargetMinutes = parseInt(alertSettingsForm.walkaroundCheckTargetMinutes, 10);
    const loadReminderMinutes = parseInt(alertSettingsForm.loadReminderMinutes, 10);

    setAlertSettingsError('');
    setAlertSettingsSuccess('');

    if (!Number.isFinite(longShiftFlagHours) || longShiftFlagHours <= 0) {
      setAlertSettingsError('Long-shift flag threshold must be a positive number of hours.');
      return;
    }
    if (!Number.isInteger(idleAlertMinutes) || idleAlertMinutes <= 0) {
      setAlertSettingsError('Idle alert threshold must be a positive whole number of minutes.');
      return;
    }
    if (!Number.isFinite(nightOutMinGapHours) || nightOutMinGapHours < 0) {
      setAlertSettingsError('Night-out minimum gap must be zero or a positive number of hours.');
      return;
    }
    if (!Number.isFinite(nightOutMaxGapHours) || nightOutMaxGapHours <= nightOutMinGapHours) {
      setAlertSettingsError('Night-out maximum gap must be greater than the minimum gap.');
      return;
    }
    if (!Number.isInteger(complianceAlertLeadDays) || complianceAlertLeadDays <= 0) {
      setAlertSettingsError('MOT alert lead time must be a positive whole number of days.');
      return;
    }
    if (!Number.isInteger(walkaroundCheckTargetMinutes) || walkaroundCheckTargetMinutes <= 0) {
      setAlertSettingsError('Walk-around check target must be a positive whole number of minutes.');
      return;
    }
    if (!Number.isInteger(loadReminderMinutes) || loadReminderMinutes < 5 || loadReminderMinutes > 600) {
      setAlertSettingsError('Load reminder must be a whole number of minutes between 5 and 600.');
      return;
    }

    setIsSavingAlertSettings(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: {
          action: 'update-alert-settings',
          longShiftFlagHours,
          idleAlertMinutes,
          nightOutMinGapHours,
          nightOutMaxGapHours,
          complianceAlertLeadDays,
          walkaroundCheckTargetMinutes,
          loadReminderMinutes,
        },
      });
      const failure = await readFunctionError(data, error);
      if (failure) {
        setAlertSettingsError(failure);
      } else {
        setOrgAlertSettings(prev => ({
          ...prev, longShiftFlagHours, idleAlertMinutes, nightOutMinGapHours, nightOutMaxGapHours, complianceAlertLeadDays,
          walkaroundCheckTargetMinutes, loadReminderMinutes,
        }));
        setAlertSettingsSuccess('Saved.');
        setTimeout(() => setAlertSettingsSuccess(''), 1800);
      }
    } catch (_) {
      setAlertSettingsError('Could not save alert settings.');
    } finally {
      setIsSavingAlertSettings(false);
    }
  };

  /// Saves the GPS-tracking policy (migration 082 RPC). `patch` lets the
  /// on/off switches save instantly; the numeric fields come from the form.
  const saveIdlePolicy = async (patch: Partial<{ action: 'none' | 'freeze_time'; notifyDriver: boolean }>) => {
    if (isMockMode || !supabase || isSavingIdlePolicy) return;
    const next = { ...idlePolicy, ...patch };
    setIsSavingIdlePolicy(true);
    const { error } = await supabase.rpc('set_idle_policy', { p_action: next.action, p_notify_driver: next.notifyDriver });
    setIsSavingIdlePolicy(false);
    if (error) { showToast(`Could not save the idle policy: ${error.message}`, 'error'); return; }
    setIdlePolicy(next);
    showToast('Idle policy saved.', 'success');
  };

  const saveGpsPolicy = async (patch: Partial<GpsPolicySettings> = {}) => {
    if (isMockMode || !supabase || isSavingGpsPolicy) return;
    const next: GpsPolicySettings = {
      ...gpsPolicy,
      afterMinutes: parseInt(gpsPolicyForm.afterMinutes, 10),
      clockOutMinutes: parseInt(gpsPolicyForm.clockOutMinutes, 10),
      ...patch,
    };
    if (!Number.isInteger(next.afterMinutes) || next.afterMinutes < 5 || next.afterMinutes > 120) {
      setGpsPolicyMessage({ kind: 'error', text: 'Minutes without GPS must be between 5 and 120.' });
      return;
    }
    if (!Number.isInteger(next.clockOutMinutes) || next.clockOutMinutes < 10 || next.clockOutMinutes > 480) {
      setGpsPolicyMessage({ kind: 'error', text: 'Auto clock-out must be between 10 and 480 minutes.' });
      return;
    }
    setIsSavingGpsPolicy(true);
    setGpsPolicyMessage(null);
    const { error } = await supabase.rpc('set_gps_policy', {
      p_enabled: next.enabled,
      p_after_minutes: next.afterMinutes,
      p_notify_driver: next.notifyDriver,
      p_action: next.action,
      p_clock_out_minutes: next.clockOutMinutes,
    });
    setIsSavingGpsPolicy(false);
    if (error) {
      setGpsPolicyMessage({ kind: 'error', text: error.message });
      return;
    }
    setGpsPolicy(next);
    setGpsPolicyMessage({ kind: 'success', text: 'Saved.' });
    setTimeout(() => setGpsPolicyMessage(null), 1800);
  };

  /// Instant on/off toggle for company-wide idle detection (item 3).
  /// Same pattern as the Night Out toggle: an independent call so the
  /// switch never depends on the numeric threshold fields also being
  /// currently valid.
  const [isSavingIdleToggle, setIsSavingIdleToggle] = useState(false);
  const handleToggleIdleDetection = async () => {
    if (isMockMode || !supabase || isSavingIdleToggle) return;
    const nextValue = !orgAlertSettings.idleDetectionEnabled;
    setIsSavingIdleToggle(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: {
          action: 'update-alert-settings',
          longShiftFlagHours: orgAlertSettings.longShiftFlagHours,
          idleAlertMinutes: orgAlertSettings.idleAlertMinutes,
          nightOutMinGapHours: orgAlertSettings.nightOutMinGapHours,
          nightOutMaxGapHours: orgAlertSettings.nightOutMaxGapHours,
          complianceAlertLeadDays: orgAlertSettings.complianceAlertLeadDays,
          walkaroundCheckTargetMinutes: orgAlertSettings.walkaroundCheckTargetMinutes,
          loadReminderMinutes: orgAlertSettings.loadReminderMinutes,
          idleDetectionEnabled: nextValue,
        },
      });
      const failure = await readFunctionError(data, error);
      if (failure) {
        showToast(`Couldn't change idle detection: ${failure}`, 'error');
      } else {
        setOrgAlertSettings(prev => ({ ...prev, idleDetectionEnabled: nextValue }));
      }
    } finally {
      setIsSavingIdleToggle(false);
    }
  };

  /// Instant on/off toggle for "Allow Drivers to Request Night Out"
  /// (migration 050) — a separate call from handleSaveAlertSettings
  /// above so flipping it never depends on the numeric threshold fields
  /// also being currently valid. Reuses the same update-alert-settings
  /// action with the other fields' already-saved values unchanged; the
  /// edge function only touches allow_driver_night_out_requests when
  /// this key is present in the body, so a plain "Save Thresholds"
  /// click (which never sends this key) can't accidentally revert it.
  const [isSavingNightOutToggle, setIsSavingNightOutToggle] = useState(false);
  const handleToggleNightOutRequests = async () => {
    if (isMockMode || !supabase || isSavingNightOutToggle) return;
    const nextValue = !orgAlertSettings.allowDriverNightOutRequests;
    setIsSavingNightOutToggle(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: {
          action: 'update-alert-settings',
          longShiftFlagHours: orgAlertSettings.longShiftFlagHours,
          idleAlertMinutes: orgAlertSettings.idleAlertMinutes,
          nightOutMinGapHours: orgAlertSettings.nightOutMinGapHours,
          nightOutMaxGapHours: orgAlertSettings.nightOutMaxGapHours,
          complianceAlertLeadDays: orgAlertSettings.complianceAlertLeadDays,
          walkaroundCheckTargetMinutes: orgAlertSettings.walkaroundCheckTargetMinutes,
          loadReminderMinutes: orgAlertSettings.loadReminderMinutes,
          allowDriverNightOutRequests: nextValue,
        },
      });
      const failure = await readFunctionError(data, error);
      if (failure) {
        showToast(`Couldn't change Night Out requests: ${failure}`, 'error');
      } else {
        setOrgAlertSettings(prev => ({ ...prev, allowDriverNightOutRequests: nextValue }));
      }
    } finally {
      setIsSavingNightOutToggle(false);
    }
  };

  /// Keeps the Settings → Company support-number fields in sync with
  /// whatever's loaded from the server — runs on initial load and again
  /// after a successful save.
  useEffect(() => {
    setSupportPhone1(teamOrgInfo?.support_phone_1 ?? '');
    setSupportPhone2(teamOrgInfo?.support_phone_2 ?? '');
  }, [teamOrgInfo]);

  /// Saves the org's own driver-support phone number(s) via admin-users'
  /// update-support-contacts action (migration 039 + edge function deploy
  /// required — replaces what used to be two hardcoded numbers shared by
  /// every company's drivers). Either field can be left blank; the driver
  /// app only renders a row for whichever number(s) are actually set.
  const handleSaveSupportContacts = async () => {
    if (isMockMode || !supabase) return;
    setSupportContactsError('');
    setSupportContactsSuccess('');
    setIsSavingSupportContacts(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: {
          action: 'update-support-contacts',
          supportPhone1: supportPhone1.trim(),
          supportPhone2: supportPhone2.trim(),
        },
      });
      const failure = await readFunctionError(data, error);
      if (failure) {
        setSupportContactsError(failure);
      } else {
        setTeamOrgInfo((prev) => (prev ? { ...prev, support_phone_1: data.supportPhone1, support_phone_2: data.supportPhone2 } : prev));
        setSupportContactsSuccess('Saved.');
        setTimeout(() => setSupportContactsSuccess(''), 1800);
      }
    } catch (_) {
      setSupportContactsError('Could not save support contact numbers.');
    } finally {
      setIsSavingSupportContacts(false);
    }
  };

  /// Creates a dashboard account directly from Settings → Access Codes.
  /// Replaces the pre-auth department-code signup screen: the admin is
  /// already authenticated, so admin-users' "create" action scopes the new
  /// account to the caller's own organization server-side — no code to type.
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateAccountError('');
    setCreateAccountSuccess('');

    const email = newAccountEmail.trim().toLowerCase();
    if (!email.includes('@')) {
      setCreateAccountError('Enter a valid email address.');
      return;
    }
    if (newAccountPassword.length < 8) {
      setCreateAccountError('Temporary password must be at least 8 characters.');
      return;
    }
    if (isMockMode || !supabase) {
      setCreateAccountError('Account creation is unavailable in sandbox mock mode.');
      return;
    }

    setIsCreatingAccount(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'create', email, password: newAccountPassword, role: newAccountRole },
      });
      const failure = await readFunctionError(data, error);
      if (failure) {
        setCreateAccountError(failure);
      } else {
        setNewAccountEmail('');
        setNewAccountPassword('');
        setNewAccountRole('logistics');
        setCreateAccountSuccess(`Account created for ${email}. Share the temporary password with them directly.`);
      }
    } catch (_) {
      setCreateAccountError('Could not reach the account service.');
    } finally {
      setIsCreatingAccount(false);
    }
  };

  /// Fills the Add Depot form's coordinates (and, best-effort, its address)
  /// from the device's current GPS position — for an admin standing at the
  /// depot itself rather than looking up its coordinates online.
  const handleUseCurrentLocationDepot = async () => {
    setDepotFormError('');
    setIsLocatingDepot(true);
    try {
      const { lat, lng } = await getCurrentPosition();
      setNewDepotLat(lat.toFixed(6));
      setNewDepotLng(lng.toFixed(6));
      const address = await reverseGeocode(lat, lng);
      if (address && !newDepotAddress.trim()) setNewDepotAddress(address);
    } catch (err: any) {
      setDepotFormError(err?.message ?? 'Could not get your current location.');
    } finally {
      setIsLocatingDepot(false);
    }
  };

  /// Adds a depot for the caller's own organization. Depots have no
  /// auto-org-id trigger (unlike shifts/gps, which inherit it from their
  /// driver), so the org id resolved via loadTeamInfo() is sent explicitly —
  /// the depots_org_admin_write RLS policy rejects anything else.
  const handleAddDepot = async (e: React.FormEvent) => {
    e.preventDefault();
    setDepotFormError('');

    if (!teamOrgInfo?.id) {
      setDepotFormError('Still loading your company details — try again in a moment.');
      return;
    }

    const name = newDepotName.trim();
    const lat = parseFloat(newDepotLat);
    const lng = parseFloat(newDepotLng);
    const radius = parseInt(newDepotRadius, 10);

    if (!name) {
      setDepotFormError('Enter a depot name.');
      return;
    }
    if (Number.isNaN(lat) || lat < -90 || lat > 90) {
      setDepotFormError('Latitude must be a number between -90 and 90.');
      return;
    }
    if (Number.isNaN(lng) || lng < -180 || lng > 180) {
      setDepotFormError('Longitude must be a number between -180 and 180.');
      return;
    }
    if (!Number.isNaN(radius) && (radius < 1 || radius > 2_000_000_000)) {
      setDepotFormError('Enter a radius in metres between 1 and 2,000,000,000.');
      return;
    }

    setIsSavingDepot(true);
    try {
      const fields = {
        name,
        address: newDepotAddress.trim() || null,
        latitude: lat,
        longitude: lng,
        geofence_radius_m: Number.isNaN(radius) || radius <= 0 ? 150 : radius,
      };
      const editing = editingDepotId;
      const { error } = editing
        ? await supabase!.from('depots').update(fields).eq('id', editing)
        : await supabase!.from('depots').insert({ organization_id: teamOrgInfo.id, ...fields });
      if (error) throw error;

      resetDepotForm();
      showToast(editing ? 'Depot updated.' : 'Depot added.', 'success');
      await loadData();
    } catch (err: any) {
      setDepotFormError(err?.message ?? 'Failed to save the depot.');
    } finally {
      setIsSavingDepot(false);
    }
  };

  const resetDepotForm = () => {
    setEditingDepotId(null);
    setNewDepotName('');
    setNewDepotAddress('');
    setNewDepotLat('');
    setNewDepotLng('');
    setNewDepotRadius('150');
    setDepotFormError('');
  };

  const startEditDepot = (d: { id: string; name: string; address?: string | null; latitude: number; longitude: number; geofence_radius_m: number }) => {
    setEditingDepotId(d.id);
    setNewDepotName(d.name);
    setNewDepotAddress(d.address ?? '');
    setNewDepotLat(String(d.latitude));
    setNewDepotLng(String(d.longitude));
    setNewDepotRadius(String(d.geofence_radius_m));
    setDepotFormError('');
    setTimeout(() => document.getElementById('depot-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };

  const handleDeleteDepot = (depotId: string, depotName: string) => {
    requestConfirm(
      `Remove "${depotName}"? Drivers won't be able to clock in at this depot anymore. Past shifts recorded there are unaffected.`,
      async () => {
        try {
          const { error } = await supabase!.from('depots').delete().eq('id', depotId);
          if (error) throw error;
          showToast('Depot removed.', 'success');
          await loadData();
        } catch (err: any) {
          showToast(err?.message ?? 'Failed to remove depot.', 'error');
        }
      },
      'danger'
    );
  };

  useEffect(() => {
    if (isAuthenticated && settingsModalOpen) {
      loadEntitlements();
      loadTeamInfo();
    }
  }, [isAuthenticated, settingsModalOpen, loadTeamInfo, loadEntitlements]);

  /// Sends a Supabase password-reset email. The link returns the admin to this
  /// app, where the PASSWORD_RECOVERY listener above opens the new-password screen.
  const handleForgotPassword = async () => {
    setLoginError('');
    const email = loginEmail.trim();

    if (!email) {
      setResetNotice({ tone: 'error', text: 'Enter your administrator email above, then select Forgot Password.' });
      return;
    }

    if (isMockMode) {
      setResetNotice({ tone: 'info', text: 'Password reset is unavailable in sandbox mock mode.' });
      return;
    }

    setIsSendingReset(true);
    setResetNotice(null);

    try {
      const { error } = await supabase!.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });

      if (error) {
        setResetNotice({ tone: 'error', text: error.message });
      } else {
        // Supabase does not disclose whether the address exists — keep the wording neutral.
        setResetNotice({
          tone: 'success',
          text: `If ${email} is a registered administrator, a reset link is on its way. Check your inbox.`,
        });
      }
    } catch (_) {
      setResetNotice({ tone: 'error', text: 'Could not reach the authentication service.' });
    } finally {
      setIsSendingReset(false);
    }
  };

  /// Applies the new password chosen on the recovery screen.
  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError('');

    if (newPassword.length < 8) {
      setRecoveryError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setRecoveryError('Passwords do not match.');
      return;
    }

    setIsSavingPassword(true);

    try {
      // Clearing the flag in the same call means a provisioned account stops
      // being diverted to this screen once the temporary password is replaced.
      const { error } = await supabase!.auth.updateUser({
        password: newPassword,
        data: { must_change_password: false },
      });

      if (error) {
        setRecoveryError(error.message);
      } else {
        // Drop the recovery session so the new password is used deliberately.
        await supabase!.auth.signOut();
        setRecoveryMode(false);
        setNewPassword('');
        setConfirmPassword('');
        setLoginPassword('');
        setIsAuthenticated(false);
        localStorage.removeItem('admin_session');
        setResetNotice({ tone: 'success', text: 'Password updated. Sign in with your new password.' });
      }
    } catch (_) {
      setRecoveryError('Could not reach the authentication service.');
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setResetNotice(null);

    if (isMockMode) {
      if (loginEmail === 'logistics@example.com' && loginPassword === 'logistics123') {
        setIsAuthenticated(true);
        setUserRole('logistics');
        localStorage.setItem('admin_session', 'true');
        localStorage.setItem('admin_role', 'logistics');
        persistRememberedEmail(loginEmail);
        setActiveTab('dashboard');
      } else if (
        loginEmail === 'payroll@example.com' &&
        loginPassword === 'payroll123'
      ) {
        setIsAuthenticated(true);
        setUserRole('payroll_admin');
        localStorage.setItem('admin_session', 'true');
        localStorage.setItem('admin_role', 'payroll_admin');
        persistRememberedEmail(loginEmail);
      } else {
        setLoginError('Invalid email or password. Use payroll@example.com / payroll123 OR logistics@example.com / logistics123');
      }
      return;
    }

    try {
      const { error } = await supabase!.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });

      if (error) {
        setLoginError(error.message);
        return;
      }

      // Two-step: if the account has a verified authenticator, Supabase
      // reports currentLevel < nextLevel and we ask for the code before
      // handing over.
      const { data: aal } = await supabase!.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel === 'aal1' && aal.nextLevel === 'aal2') {
        const { data: factors } = await supabase!.auth.mfa.listFactors();
        const first = ((factors as any)?.totp ?? (factors as any)?.all ?? [])
          .find((f: any) => f.status === 'verified') as { id: string } | undefined;
        if (first) {
          setMfaChallenge({ factorId: first.id, code: '', verifying: false, error: '' });
          return;
        }
      }
      await finishAdminLogin();
    } catch (_) {
      setLoginError('Authentication connection failure.');
    }
  };

  const handleLogout = async () => {
    if (!isMockMode) {
      await supabase!.auth.signOut();
    }
    setIsAuthenticated(false);
    localStorage.removeItem('admin_session');
    localStorage.removeItem('admin_role');
    setActiveTab('dashboard');
  };

  // ── Alert Acknowledgement & Clearing ───────────────────────
  const acknowledgeAlert = async (alertId: string, isSos?: boolean) => {
    if (isMockMode) {
      setAlerts(prev =>
        prev.map(a => (a.id === alertId ? { ...a, acknowledged: true } : a))
      );
      return;
    }

    try {
      const table = isSos ? 'sos_alerts' : 'idle_alerts';
      await supabase!
        .from(table)
        .update({ acknowledged: true })
        .eq('id', alertId);
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const acknowledgeGpsOffline = async (eventId: string) => {
    if (isMockMode || !supabase) return;
    await supabase
      .from('gps_offline_events')
      .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
      .eq('id', eventId);
    loadData();
  };

  const clearAlert = async (alertId: string, isSos?: boolean) => {
    if (isMockMode) {
      setAlerts(prev => prev.filter(a => a.id !== alertId));
      return;
    }

    try {
      const table = isSos ? 'sos_alerts' : 'idle_alerts';
      await supabase!
        .from(table)
        .update({ acknowledged: true, cleared: true })
        .eq('id', alertId);

      const nextClearedIds = [...clearedAlertIds, alertId];
      setClearedAlertIds(nextClearedIds);
      loadData(nextClearedIds);
    } catch (e) {
      console.error('Failed to clear alert:', e);
    }
  };

  const handleClearAllAlerts = async () => {
    if (isMockMode) {
      setAlerts([]);
      return;
    }

    try {
      // 1. Bulk acknowledge all active alerts in the database to trigger loop guards
      // "Clear Alerts" dismisses everything currently shown, in the
      // database — not just in this browser — so it survives a reload.
      await supabase!
        .from('idle_alerts')
        .update({ acknowledged: true, cleared: true })
        .eq('cleared', false);

      await supabase!
        .from('sos_alerts')
        .update({ acknowledged: true, cleared: true })
        .eq('cleared', false);

      // 2. Add current active alert IDs to local cleared storage
      const activeIds = alerts.map(a => a.id);
      const nextClearedIds = [...clearedAlertIds, ...activeIds];
      setClearedAlertIds(nextClearedIds);

      loadData(nextClearedIds);
    } catch (e) {
      console.error('Failed to clear all alerts:', e);
    }
  };

  // ── Employee Profiles CRUD Actions ──────────────────────────
  // A random 6-digit PIN — used by the "generate" button on both the
  // Add Employee form and the Edit Employee reset-PIN field. Plain
  // Math.random is fine here: this is a convenience default the admin
  // can see and hand to the employee, not a cryptographic secret in
  // transit — the real security boundary is the bcrypt hash it becomes
  // once saved (hash_driver_pin(), consolidated_migration.sql).
  const generateRandomPin = () => String(Math.floor(100000 + Math.random() * 900000));

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setCrudError('');

    if (!newEmployeeName.trim() || !newEmployeeCode.trim() || !newEmployeePhone.trim()) {
      setCrudError('Please fill in the name, username and phone.');
      return;
    }

    if (isMockMode || !supabase) {
      setCrudError('No Supabase connection. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.');
      return;
    }

    const cleanCode = newEmployeeCode.trim();
    const cleanName = toTitleCase(newEmployeeName.trim());
    const cleanPhone = newEmployeePhone.trim() || 'N/A';

    try {
      const { data, error } = await supabase.functions.invoke('create-driver', {
        body: {
          driver_id: cleanCode,
          full_name: cleanName,
          phone: cleanPhone,
        },
      });

      // Parse error body if Supabase wrapped it
      if (error) {
        let msg = error.message;
        try {
          const ctx = error as any;
          if (ctx?.context?.json) {
            const body = await ctx.context.json();
            if (body?.error) msg = body.error;
          }
        } catch (_) {}
        setCrudError(`Failed to create employee: ${msg}`);
        return;
      }

      if (data?.error) {
        setCrudError(`Failed to create employee: ${data.error}`);
        return;
      }

      if (data?.success && data?.driver) {
        // Successfully persisted in Supabase — update UI from real response
        const createdDriver = data.driver as Employee;

        // Compensation Setup (Section 2 of the same dialog) — a second
        // write against the same drivers row create-driver just made,
        // same field shape handleSaveRate already uses elsewhere. Best
        // effort: identity is already saved at this point regardless of
        // whether this part succeeds, so a failure here surfaces as a
        // toast rather than blocking the whole "Save Employee Profile".
        const isFixed = newEmployeeRateType === 'Fixed Shift Rate (Day Rate)';
        const parsedRate = parseFloat(newEmployeeBaseRate) || (isFixed ? 150.00 : 16.00);
        try {
          await supabase.from('drivers').update({
            profession: newEmployeeProfession,
            agency_name: newEmployeeAgency || 'Direct',
            rate_type: isFixed ? 'Fixed Shift Rate (Day Rate)' : 'Hourly',
            fixed_rate: isFixed ? parsedRate : null,
            mon_fri_rate: parsedRate,
            saturday_rate: parsedRate,
            sunday_rate: parsedRate,
            hourly_rate: parsedRate,
          }).eq('id', createdDriver.id);
        } catch (rateErr: any) {
          showToast(`Employee created, but compensation setup failed: ${rateErr?.message ?? 'unknown error'} — set it from Edit.`, 'error');
        }

        setEmployees(prev => {
          const m = new Map(prev.map(e => [e.driver_id, e]));
          m.set(createdDriver.driver_id, createdDriver);
          return Array.from(m.values());
        });
        setIsAddingEmployee(false);
        setNewEmployeeName('');
        setNewEmployeeCode('');
        setNewEmployeePhone('');
        setNewEmployeeProfession('driver');
        if (typeof data.activation_code === 'string') {
          setActivationCodeShown({ code: data.activation_code, name: cleanName, driverId: createdDriver.driver_id, reason: 'created' });
        } else if (data.activation_code_error) {
          showToast(`Employee created, but the activation code failed: ${data.activation_code_error} — use "Reset PIN" from the row menu.`, 'error');
        }
        setNewEmployeeRateType('Hourly');
        setNewEmployeeBaseRate('16.00');
        setNewEmployeeAgency('Direct');
        // Refresh from DB to get server-assigned fields
        loadData();
        return;
      }

      setCrudError('Unexpected response from server. Please try again.');
    } catch (e: any) {
      setCrudError(`Connection error: ${e?.message ?? 'Failed to create employee.'}`);
    }
  };




  const toggleEmployeeStatus = async (employeeId: string, currentIsActive: boolean) => {
    const nextActive = !currentIsActive;
    
    if (isMockMode) {
      setEmployees(prev =>
          prev.map(e => (e.id === employeeId ? { ...e, is_active: nextActive } : e))
      );
      return;
    }

    try {
      await supabase!
        .from('drivers')
        .update({ is_active: nextActive })
        .eq('id', employeeId);
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const updateEmployeeProfession = async (employeeId: string, profession: EmployeeProfession) => {
    setEmployees(prev => prev.map(e => (e.id === employeeId ? { ...e, profession } : e)));

    if (isMockMode) return;

    try {
      await supabase!
        .from('drivers')
        .update({ profession })
        .eq('id', employeeId);
    } catch (e) {
      console.error(e);
      loadData();
    }
  };

  const handleDeleteEmployee = (employeeId: string) => {
    requestConfirm(
      'Are you sure you want to permanently remove this employee profile? Historical shifts will remain intact, but the account will be deleted.',
      () => performDeleteEmployee(employeeId),
      'danger'
    );
  };

  const performDeleteEmployee = async (employeeId: string) => {
    if (isMockMode) {
      setEmployees(prev => prev.filter(e => e.id !== employeeId));
      return;
    }

    try {
      const { data, error } = await supabase!.functions.invoke('create-driver', {
        body: {
          action: 'delete',
          id: employeeId,
        },
      });

      if (error) {
        let realMessage = error.message;
        try {
          const ctx = error as any;
          if (ctx.context?.json) {
            const body = await ctx.context.json();
            if (body?.error) realMessage = body.error;
          } else if (ctx.context?.text) {
            const body = await ctx.context.text();
            if (body) realMessage = body;
          }
        } catch (_) {}
        showToast('Failed to remove employee: ' + realMessage, 'error');
      } else if (data && data.error) {
        showToast('Failed to remove employee: ' + data.error, 'error');
      } else {
        showToast('Employee profile removed.', 'success');
        loadData();
      }
    } catch (e: any) {
      console.error(e);
      showToast('Connection error: ' + (e?.message ?? 'Failed to remove employee.'), 'error');
    }
  };


  // Returns whether the save actually succeeded — the merged Edit Employee
  // modal (personal details + compensation in one form) needs this so it
  // only proceeds to handleSaveRate after the personal-details half has
  // genuinely gone through, not on a validation failure.
  const handleUpdateEmployee = async (e: React.FormEvent): Promise<boolean> => {
    e.preventDefault();
    if (!editingEmployee) return false;
    setEditEmployeeError('');
    setIsSavingEmployee(true);

    const cleanName = toTitleCase(editFullName.trim());
    const cleanUsername = editUsername.trim();
    const cleanPhone = editPhone.trim();
    const cleanPin = editNewPin.trim();

    if (!cleanName || !cleanUsername) {
      setEditEmployeeError('Full Name and Username are required.');
      setIsSavingEmployee(false);
      return false;
    }

    if (cleanPin && cleanPin.length !== 6) {
      // Must match the driver app's login screen exactly (6 digits) — a
      // shorter PIN here would leave the driver unable to ever log in.
      setEditEmployeeError('New PIN must be exactly 6 digits if provided.');
      setIsSavingEmployee(false);
      return false;
    }

    if (isMockMode || !supabase) {
      setEmployees(prev =>
        prev.map(emp =>
          emp.id === editingEmployee.id
            ? { ...emp, full_name: cleanName, driver_id: cleanUsername, phone: cleanPhone }
            : emp
        )
      );
      setEditingEmployee(null);
      setIsSavingEmployee(false);
      return true;
    }

    try {
      // 1. Direct update on drivers table for instant database synchronization
      const dbPayload: any = {
        full_name: cleanName,
        driver_id: cleanUsername,
        phone: cleanPhone,
      };
      if (cleanPin) {
        dbPayload.pin_hash = cleanPin;
        // Without this the driver stays 'pending' forever if they hadn't
        // activated yet — driver-login refuses any PIN outright while
        // pending, no matter how correct it is, so a PIN set here would
        // silently never work. (The hash itself is fine: a BEFORE UPDATE
        // trigger on drivers bcrypts pin_hash on every write.)
        dbPayload.pin_status = 'set';
        dbPayload.pin_set_at = new Date().toISOString();
        dbPayload.pin_locked_until = null;
        dbPayload.pin_lock_level = 0;
        dbPayload.pin_failed_attempts = 0;
        dbPayload.pin_failed_since = null;
      }

      const { error: dbError } = await supabase
        .from('drivers')
        .update(dbPayload)
        .eq('id', editingEmployee.id);

      if (dbError) {
        setEditEmployeeError(`Failed to update employee: ${dbError.message}`);
        setIsSavingEmployee(false);
        return false;
      }

      // 2. Invoke create-driver edge function to update Auth credentials if PIN or username changed
      if (cleanPin || cleanUsername !== editingEmployee.driver_id) {
        try {
          await supabase.functions.invoke('create-driver', {
            body: {
              action: 'update',
              id: editingEmployee.id,
              driver_id: cleanUsername,
              full_name: cleanName,
              phone: cleanPhone,
              pin: cleanPin || undefined,
            },
          });
        } catch (fnErr) {
          console.warn('Edge function auth sync warning:', fnErr);
        }
      }

      // 3. Update local state immediately
      setEmployees(prev =>
        prev.map(emp =>
          emp.id === editingEmployee.id
            ? { ...emp, full_name: cleanName, driver_id: cleanUsername, phone: cleanPhone }
            : emp
        )
      );
      setEditingEmployee(null);
      setIsSavingEmployee(false);
      loadData();
      return true;
    } catch (err: any) {
      setEditEmployeeError(`Update failed: ${err?.message ?? 'Unknown error'}`);
      setIsSavingEmployee(false);
      return false;
    }
  };

  // One form, one save action: personal details (handleUpdateEmployee)
  // and compensation (handleSaveRate) are two separate, already-working
  // save paths against the same drivers row — this just runs them back
  // to back so the merged Edit modal's single button does both, instead
  // of duplicating either function's own validation/error-handling logic.
  const handleSaveEmployeeAndCompensation = async (e: React.FormEvent) => {
    if (!editingEmployee) return;
    const empId = editingEmployee.id;
    const personalSaved = await handleUpdateEmployee(e);
    if (personalSaved) {
      await handleSaveRate(empId);
    }
  };

  // Migration 065: admins never see PINs. A one-time activation code
  // is issued and shown once; the driver enters it in the app and picks
  // their own 6-digit PIN.
  const handleResetPin = (emp: Employee) => {
    requestConfirm(
      `Issue a new activation code for ${emp.full_name}? Their current PIN keeps working until they finish setting a new one.`,
      async () => {
        if (isMockMode || !supabase) {
          showToast('Activation codes are not available in mock mode.', 'error');
          return;
        }
        try {
          const { data, error } = await supabase.functions.invoke('create-driver', {
            body: { action: 'reset_pin', id: emp.id },
          });
          if (error) {
            let msg = error.message;
            try {
              const body = await (error as any).context?.json?.();
              if (body?.error) msg = body.error;
            } catch (_) {}
            showToast(`Could not issue an activation code: ${msg}`, 'error');
            return;
          }
          if (data?.activation_code) {
            setActivationCodeShown({ code: data.activation_code, name: emp.full_name, driverId: data.driver_id ?? emp.driver_id, reason: 'reset' });
          }
        } catch (err: any) {
          showToast(`Could not issue an activation code: ${err?.message ?? 'unknown error'}`, 'error');
        }
      },
      'default'
    );
  };

  const handleManualClockIn = async (driverId: string) => {
    if (isMockMode) {
      showToast("Manual Clock In not supported in Mock Mode.", 'error');
      return;
    }

    if (depots.length === 0) {
      showToast(
        userRole === 'payroll_admin'
          ? "No depots set up yet — add one under Team & Access before clocking in a driver."
          : "No depots set up yet — ask a payroll admin to add one under Team & Access.",
        'error'
      );
      return;
    }

    setDepotSelectModal({ driverId, depots });
  };

  const performManualClockIn = async (driverId: string, depot: { id: string; name: string; latitude: number; longitude: number }) => {
    setDepotSelectModal(null);
    try {
      const startTime = new Date().toISOString();
      const { data: shiftData, error } = await supabase!
        .from('shifts')
        .insert({
          driver_id: driverId,
          depot_id: depot.id,
          start_time: startTime,
          status: 'active',
          start_lat: depot.latitude,
          start_lng: depot.longitude
        })
        .select('id')
        .single();

      if (error) {
        showToast("Failed to manual clock in: " + error.message, 'error');
      } else {
        // Insert an initial GPS ping so the driver appears on the live map
        // and the idle detection pipeline has a baseline ping to measure from.
        if (shiftData?.id) {
          const { error: gpsError } = await supabase!
            .from('gps_locations')
            .insert({
              driver_id: driverId,
              shift_id: shiftData.id,
              latitude: depot.latitude,
              longitude: depot.longitude,
              speed: 0,
              accuracy: 5.0,
              recorded_at: startTime,
            });
          if (gpsError) {
            console.warn('Manual clock-in GPS ping failed (non-fatal):', gpsError.message);
          }
        }
        showToast('Driver clocked in.', 'success');
        loadData();
      }
    } catch (e: any) {
      showToast("Failed to manual clock in: " + e.message, 'error');
    }
  };

  const handleManualClockOut = (driverId: string, shiftId: string) => {
    if (isMockMode) {
      showToast("Manual Clock Out not supported in Mock Mode.", 'error');
      return;
    }

    requestConfirm(
      "Are you sure you want to manually clock out this driver? This will end their shift immediately and log them out of the mobile app.",
      () => performManualClockOut(driverId, shiftId),
      'danger'
    );
  };

  const performManualClockOut = async (driverId: string, shiftId: string) => {
    try {
      // Get shift details to find depot coords
      const { data: shiftData } = await supabase!
        .from('shifts')
        .select('*, depots(*)')
        .eq('id', shiftId)
        .single();

      const lat = shiftData?.depots?.latitude ?? null;
      const lng = shiftData?.depots?.longitude ?? null;
      const endTime = new Date().toISOString();

      // 1. Calculate final duration
      const totalHours = (new Date(endTime).getTime() - new Date(shiftData.start_time).getTime()) / (1000 * 60 * 60);

      // 2. Fetch the CURRENT driver profile to lock it in history
      const drvProfile = employeeRates[driverId] || employees.find(e => e.id === driverId || e.driver_id === driverId);
      const isFixed = drvProfile?.rate_type?.toLowerCase().includes('fixed') || Boolean(drvProfile?.fixed_rate);
      const baseRate = isFixed ? (Number(drvProfile?.fixed_rate) || 150) : (Number(drvProfile?.mon_fri_rate) || 16);

      // 3. Simulate shift to calculate exact gross pay
      const simulatedShift = {
        ...shiftData,
        start_time: shiftData.start_time,
        end_time: endTime,
        total_hours: totalHours,
        status: 'completed',
        total_pay: null,
        rate_type: isFixed ? 'Fixed Shift Rate (Day Rate)' : 'Hourly',
        effective_rate: isFixed ? baseRate : null,
        base_hourly_rate: isFixed ? null : baseRate,
      };
      const { grossPay } = getShiftFinancials(simulatedShift as any);

      // 4. Update the shift with frozen historical data
      const { error } = await supabase!
        .from('shifts')
        .update({
          status: 'completed',
          end_time: endTime,
          end_lat: lat,
          end_lng: lng,
          total_hours: totalHours,
          total_pay: grossPay,
          // STAMP THE HISTORY PERMANENTLY:
          rate_type: isFixed ? 'Fixed Shift Rate (Day Rate)' : 'Hourly',
          base_hourly_rate: isFixed ? null : baseRate,
          effective_rate: isFixed ? baseRate : null
        })
        .eq('id', shiftId);

      if (error) {
        showToast("Failed to manual clock out: " + error.message, 'error');
      } else {
        showToast('Driver clocked out.', 'success');
        await loadData();
      }
    } catch (e: any) {
      showToast("Failed to manual clock out: " + e.message, 'error');
    }
  };

  // Opens the Edit Shift Time modal, pre-filled from the shift's current
  // values — datetime-local inputs use "YYYY-MM-DDTHH:mm", no timezone.
  const handleEditShiftTime = (shiftId: string, currentStartTime: string, currentEndTime: string | null) => {
    const formatForInput = (isoStr: string) => new Date(isoStr).toISOString().slice(0, 16);
    setEditTimeModal({
      shiftId,
      startValue: formatForInput(currentStartTime),
      endValue: currentEndTime ? formatForInput(currentEndTime) : '',
      isOngoing: !currentEndTime,
    });
  };

  const performEditShiftTime = async () => {
    if (!editTimeModal) return;
    const { shiftId, startValue, endValue, isOngoing } = editTimeModal;

    if (!startValue) {
      showToast('Start date and time is required.', 'error');
      return;
    }

    const newStartTime = new Date(startValue).toISOString();
    const targetShift = shifts.find(s => s.id === shiftId);
    if (!targetShift) return;

    let updatePayload: any = {
      start_time: newStartTime,
      status: 'completed',
    };

    if (isOngoing) {
      updatePayload.end_time = null;
      updatePayload.status = 'active';
      updatePayload.total_pay = null;
      updatePayload.total_hours = null;
    } else {
      if (!endValue) {
        showToast('End date and time is required, or mark the shift as still active.', 'error');
        return;
      }
      const newEndTime = new Date(endValue).toISOString();
      if (new Date(newEndTime) <= new Date(newStartTime)) {
        showToast('End time must be strictly after the start time.', 'error');
        return;
      }
      updatePayload.end_time = newEndTime;

      // total_hours and total_pay are deliberately NOT computed here
      // anymore. calculate_shift_financials() (migration 048) derives
      // total_hours from the corrected start/end times itself, and prices
      // it at this shift's LOCKED rate snapshot — never the driver's live
      // profile rate — so a time correction can never silently re-price
      // the whole shift the way it used to.
    }

    // 3. Update Database
    const { error } = await supabase!
      .from('shifts')
      .update(updatePayload)
      .eq('id', shiftId);

    if (error) {
      showToast("Failed to update shift: " + error.message, 'error');
    } else {
      showToast("Shift times updated successfully.", 'success');
      setEditTimeModal(null);
      loadData(); // Refresh UI
    }
  };



  const openActionModal = (
    type: 'single' | 'bulk',
    shiftIds: string[],
    driverName: string,
    defaultExtras = 0,
    defaultNote = '',
    defaultNO = 0,
    shift: Shift | null = null,
  ) => {
    setActionModal({
      isOpen: true,
      type,
      shiftIds,
      driverName: type === 'bulk' ? `${shiftIds.length} Selected Shifts` : driverName,
      currentExtras: defaultExtras,
      currentNote: defaultNote,
      currentNO: defaultNO,
      currentDeduction: shift ? (Number(shift.deduction_amount) || 0) : 0,
      currentDeductionReason: shift?.deduction_reason || '',
      currentNotes: shift?.payroll_notes || '',
      currentMicroOverride: Boolean(shift?.is_micro_shift_override),
      shift,
    });
  };

  // The rate/hours math is no longer computed client-side at all — the
  // calculate_shift_financials() trigger (migration 048) derives
  // total_pay authoritatively from the shift's LOCKED rate snapshot plus
  // whatever adjustment fields are sent here. This is what makes the
  // lock actually hold: the client never has to (and never should) try
  // to reconstruct or protect the historical rate itself.
  const handleSaveModalAction = async (values: PayrollDrawerSaveValues) => {
    if (!actionModal) return;
    setIsSavingPayroll(true);

    const isSingleRateOverride = actionModal.type === 'single' && values.rateOverride && actionModal.shiftIds.length === 1;

    for (const shiftId of actionModal.shiftIds) {
       const targetShift = shifts.find(s => s.id === shiftId || s.real_id === shiftId);
       if (!targetShift) continue;
       const realId = targetShift.real_id || targetShift.id;

       const updatePayload: any = {
         extras_amount: values.bonusAmount,
         extras_note: values.bonusNote || null,
         night_out_amount: values.nightOutAmount,
         night_out_status: values.nightOutAmount > 0 ? 'approved' : 'none',
         deduction_amount: values.deductionAmount,
         deduction_reason: values.deductionReason || null,
         payroll_notes: values.notes || null,
         is_micro_shift_override: values.microShiftOverride,
       };

       if (isSingleRateOverride && values.rateOverride) {
         // Deliberate manager override — a fresh rate_snapshot_timestamp
         // is exactly the signal the trigger looks for to re-lock the
         // rate instead of freezing the old one.
         updatePayload.applied_rate_type = values.rateOverride.type;
         updatePayload.applied_rate_amount = values.rateOverride.amount;
         updatePayload.rate_snapshot_timestamp = new Date().toISOString();
       }

       const { error } = await supabase!.from('shifts').update(updatePayload).eq('id', realId);
       if (error) {
         showToast(`Failed to update payroll for ${targetShift.driver_name || 'driver'}: ${error.message}`, 'error');
       }
    }

    setIsSavingPayroll(false);

    setActionModal(null);
    if (actionModal.type === 'bulk') setSelectedShiftIds(new Set());
    await loadData();
  };

  // Period, filters and search, as shown under the title of every export.
  const exportSubtitle = () => {
    const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const parts = [
      reportDateStart && reportDateEnd ? `${fmt(reportDateStart)} – ${fmt(reportDateEnd)}`
        : reportDateStart ? `From ${fmt(reportDateStart)}`
        : reportDateEnd ? `Up to ${fmt(reportDateEnd)}`
        : 'All dates',
    ];
    if (reportAgencyFilter !== 'all') parts.push(reportAgencyFilter);
    if (reportEmployeeFilter !== 'all') parts.push(employees.find(e => e.id === reportEmployeeFilter)?.full_name ?? 'One employee');
    if (summarySearch.trim()) parts.push(`Search "${summarySearch.trim()}"`);
    if (showOnlyNightOutRequested) parts.push('Night out requests only');
    return parts.join(' · ');
  };
  const exportFileBase = (kind: string) => {
    const stamp = reportDateStart && reportDateEnd ? `${reportDateStart}_to_${reportDateEnd}` : new Date().toISOString().split('T')[0];
    return `${kind}_${stamp}`;
  };

  const handleExportSummaryCSV = () => {
    const filteredShifts = getFilteredShifts();
    if (filteredShifts.length === 0) {
      showToast("No data available to export.", 'error');
      return;
    }

    // Same totals as the Weekly Summary view
    const summaryData: Record<string, { name: string; code: string; agency: string; shifts: number; hours: number; nightOuts: number; nightOutPay: number; extras: number; deductions: number; gross: number }> = {};
    filteredShifts.forEach(shift => {
       const { grossPay, noAmt, extrasAmt, deductionAmt, liveHours } = getShiftFinancials(shift);
       const id = shift.driver_id;
       if (!summaryData[id]) {
           summaryData[id] = {
               name: shift.driver_name || 'Driver',
               code: shift.driver_code || '',
               agency: employeeRates[id]?.agency_name || 'Direct',
               shifts: 0, hours: 0, nightOuts: 0, nightOutPay: 0, extras: 0, deductions: 0, gross: 0,
           };
       }
       const row = summaryData[id];
       row.hours += (liveHours || 0);
       row.gross += grossPay;
       row.extras += extrasAmt;
       row.deductions += deductionAmt;
       row.nightOutPay += noAmt;
       row.nightOuts += (noAmt > 0 ? 1 : 0);
       if (!shift.is_week_boundary || shift.boundary_label?.includes('Part 1')) row.shifts += 1;
    });
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const rows = Object.values(summaryData)
      .map(r => ({ ...r, hours: r2(r.hours), gross: r2(r.gross), extras: r2(r.extras), deductions: r2(r.deductions), nightOutPay: r2(r.nightOutPay) }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));

    setExportPreview({
      title: 'Payroll summary',
      subtitle: exportSubtitle(),
      columns: [
        { key: 'name', label: 'Employee Name' },
        { key: 'code', label: 'Employee ID' },
        { key: 'agency', label: 'Agency' },
        { key: 'shifts', label: 'Shifts Logged', kind: 'number' },
        { key: 'hours', label: 'Total Hours', kind: 'hours' },
        { key: 'nightOuts', label: 'Night Outs', kind: 'number' },
        { key: 'nightOutPay', label: 'Night Out (£)', kind: 'money' },
        { key: 'extras', label: 'Extras (£)', kind: 'money' },
        { key: 'deductions', label: 'Deductions (£)', kind: 'money' },
        { key: 'gross', label: 'Gross Pay (£)', kind: 'money' },
      ],
      rows,
      defaultFormat: 'csv',
      fileBase: exportFileBase('Payroll_Summary'),
      storageKey: 'comp-summary',
      flash: 'csv',
    });
  };

  // Export Drivers — the full current roster's non-secret fields. PINs are
  // deliberately excluded: they're bcrypt-hashed the moment they're saved
  // and genuinely can't be recovered here (same reason "Reset Default PIN"
  // exists) — an admin who needs a driver's login uses that action instead,
  // which shows the new PIN once at the point it's generated.
  const handleExportEmployees = () => {
    if (employees.length === 0) {
      showToast('No drivers to export.', 'error');
      return;
    }
    const exportData = employees.map(emp => {
      const rate = employeeRates[emp.id] || employeeRates[emp.driver_id];
      const isFixed = Boolean(rate?.rate_type?.toLowerCase().includes('fixed'));
      return {
        'Driver ID': emp.driver_id,
        'Full Name': emp.full_name,
        'Phone': emp.phone || '',
        'Role': emp.profession ?? 'driver',
        'Agency': (emp as any).agency_name || (emp as any).agency || rate?.agency_name || 'Direct',
        'Rate Type': rate?.rate_type || 'Hourly',
        'Rate (£)': (isFixed ? rate?.fixed_rate : rate?.mon_fri_rate ?? emp.hourly_rate) ?? '',
        'Active': emp.is_active ? 'Yes' : 'No',
      };
    });
    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `drivers-export-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // ── Rates & Night Out Handlers ────────────────────────────────
  const handleSaveRate = async (driverId: string) => {
    console.log("Saving rate profile overrides directly to drivers table for driver ID:", driverId);

    const targetEmp = employees.find(e => e.id === driverId || e.driver_id === driverId);
    const primaryId = targetEmp?.id || driverId;
    const driverCode = targetEmp?.driver_id || (targetEmp as any)?.driver_code || driverId;

    const isFixed = editRateType === 'Fixed' || editRateType === 'Fixed Shift Rate (Day Rate)';
    const parsedFixed = parseFloat(editFixedRate) || 150.00;
    const parsedMonFri = parseFloat(editMonFriRate) || 16.00;
    const parsedSat = parseFloat(editSatRate) || 17.00;
    const parsedSun = parseFloat(editSunRate) || 18.00;

    const targetAgency = editAgencyName || 'Direct';
    const agencyFields = {
      agency_name: targetAgency
    };

    // CRITICAL: Update drivers table. Keep hourly cols populated (non-null)
    // so the DB always has readable rate data regardless of schema cache state.
    const driverPayload: any = {
      ...agencyFields,
      rate_type: isFixed ? 'Fixed Shift Rate (Day Rate)' : 'Hourly',
      fixed_rate: isFixed ? parsedFixed : null,
      // Keep hourly fields populated always — display logic uses rate_type to decide rendering
      mon_fri_rate: parsedMonFri,
      saturday_rate: parsedSat,
      sunday_rate: parsedSun,
      hourly_rate: isFixed ? parsedFixed : parsedMonFri
    };

    const localDisplayRate: EmployeeRate = {
      driver_id: primaryId,
      rate_type: isFixed ? 'Fixed Shift Rate (Day Rate)' : 'Hourly',
      fixed_rate: isFixed ? parsedFixed : null,
      mon_fri_rate: isFixed ? parsedFixed : parsedMonFri,
      saturday_rate: isFixed ? parsedFixed : parsedSat,
      sunday_rate: isFixed ? parsedFixed : parsedSun,
      sat_rate: isFixed ? parsedFixed : parsedSat,
      sun_rate: isFixed ? parsedFixed : parsedSun,
      agency_name: targetAgency,
    };

    // Optimistically update local state for all key variations (UUID & code)
    setEmployeeRates(prev => ({ 
      ...prev, 
      [driverId]: localDisplayRate,
      [primaryId]: localDisplayRate,
      [driverCode]: localDisplayRate 
    }));

    setEmployees(prev => prev.map(e => (e.id === primaryId || e.driver_id === driverCode) ? {
      ...e,
      rate_type: localDisplayRate.rate_type,
      fixed_rate: localDisplayRate.fixed_rate,
      mon_fri_rate: localDisplayRate.mon_fri_rate,
      saturday_rate: localDisplayRate.saturday_rate,
      sunday_rate: localDisplayRate.sunday_rate,
      sat_rate: localDisplayRate.sat_rate,
      sun_rate: localDisplayRate.sun_rate,
      hourly_rate: localDisplayRate.mon_fri_rate,
      agency_name: localDisplayRate.agency_name,
      agency: localDisplayRate.agency_name
    } : e));

    if (isMockMode) {
      showToast('Driver rate profile updated successfully (Mock Mode).', 'success');
      return;
    }

    try {
      // ONLY TARGET 'drivers' TABLE FOR MUTATION
      let query = supabase!
        .from('drivers')
        .update(driverPayload);

      if (primaryId && driverCode && primaryId !== driverCode) {
        query = query.or(`id.eq.${primaryId},driver_id.eq.${driverCode}`);
      } else {
        query = query.eq('id', primaryId);
      }

      let { data, error } = await query.select();

      // ── 3-Tier schema-cache waterfall ─────────────────────────────────────
      // PostgREST only reports ONE missing column per error, so reactive stripping
      // requires N round-trips for N missing columns. Instead we proactively strip
      // ALL extended columns at once on the first schema error.
      if (error && error.message.includes('schema cache')) {
        console.warn('Tier-1 schema cache error:', error.message, '— retrying with minimal payload');

        // Tier 2: Drop all potentially uncached extended columns, keep essentials
        const tier2Payload: any = {
          ...agencyFields,
          rate_type: isFixed ? 'Fixed Shift Rate (Day Rate)' : 'Hourly',
          fixed_rate: isFixed ? parsedFixed : null,
          hourly_rate: isFixed ? parsedFixed : parsedMonFri,
          mon_fri_rate: parsedMonFri,
          saturday_rate: parsedSat,
          sunday_rate: parsedSun
        };

        const tier2Res = await supabase!
          .from('drivers')
          .update(tier2Payload)
          .or(`id.eq.${primaryId},driver_id.eq.${driverCode}`)
          .select();

        data = tier2Res.data;
        error = tier2Res.error;

        if (error && error.message.includes('schema cache')) {
          console.warn('Tier-2 schema cache error:', error.message, '— retrying with absolute minimum');

          // Tier 3: Absolute minimum fallback
          const tier3Res = await supabase!
            .from('drivers')
            .update({ 
              ...agencyFields,
              hourly_rate: isFixed ? parsedFixed : parsedMonFri,
              mon_fri_rate: parsedMonFri,
              saturday_rate: parsedSat,
              sunday_rate: parsedSun
            })
            .or(`id.eq.${primaryId},driver_id.eq.${driverCode}`)
            .select();

          data = tier3Res.data;
          error = tier3Res.error;
        }

        // Fire NOTIFY to reload PostgREST schema cache for next operation
        try {
          await supabase!.rpc('reload_schema_cache');
        } catch (_) {
          // rpc may not exist — fallback notification is best-effort
        }
      }
      // ──────────────────────────────────────────────────────────────────────

      if (error) {
        console.error('Database Error updating drivers table:', error.message);
        // Show user a soft warning but don't block — local state is already updated
        showToast('Rate saved locally. Database sync notice: ' + error.message + ' Your changes are visible but may need a page refresh after the database schema cache reloads (usually within 30 seconds).', 'error');
        await loadData();
        return;
      }

      if (!data || data.length === 0) {
        showToast(`No rows updated. Ensure driver ID (${primaryId} / ${driverCode}) is correct and RLS allows updating 'drivers' table.`, 'error');
        await loadData();
        return;
      }

      showToast(`Profile updated successfully! Rate Type: ${isFixed ? 'Fixed Shift Rate' : 'Hourly'} ${isFixed ? `(£${parsedFixed.toFixed(2)}/shift)` : ''}`, 'success');
      await loadData();
    } catch (e: any) {
      showToast(`Rate save error: ${e?.message ?? 'Unknown error'}`, 'error');
      await loadData();
    }
  };



  // ── CSV & Excel Export Functions ────────────────────────────
  const getFilteredShifts = () => {
    const searchTerms = summarySearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const rawFiltered = shifts.filter(s => {
      // Night Out Requested Filter
      if (showOnlyNightOutRequested) {
        const isReq = s.night_out_requested === true ||
                      (s as any).has_requested_night_out === true ||
                      s.night_out_status === 'pending';
        if (!isReq) return false;
      }

      // Employee Filter
      if (reportEmployeeFilter !== 'all' && s.driver_id !== reportEmployeeFilter) return false;

      // Search: every word typed must appear somewhere on the shift
      if (searchTerms.length > 0) {
        const start = new Date(s.start_time);
        const noAmt = Number(s.night_out_allowance ?? s.night_out_amount) || 0;
        const haystack = [
          s.driver_name, s.driver_code, employeeRates[s.driver_id]?.agency_name || 'Direct', s.depot_name,
          s.vehicle_number, s.trailer_number, s.load_reference, s.carrier_name,
          ...(s.loads ?? []).map(l => l.load_reference),
          s.extras_note, s.deduction_reason, s.payroll_notes,
          (noAmt > 0 || s.night_out_status === 'pending' || s.night_out_status === 'approved') ? 'night out n/o' : '',
          s.night_out_status === 'pending' ? 'requested pending' : '',
          Number(s.extras_amount) ? 'bonus extras' : '',
          Number(s.deduction_amount) ? 'deduction' : '',
          !s.end_time ? 'active ongoing open no clock-out' : '',
          start.toLocaleDateString('en-GB'), start.toLocaleDateString('en-GB', { weekday: 'long', month: 'long' }),
        ].filter(Boolean).join(' ').toLowerCase();
        if (!searchTerms.every(t => haystack.includes(t))) return false;
      }

      // Agency Filter
      if (reportAgencyFilter !== 'all') {
        const drvRate = employeeRates[s.driver_id];
        const agency = drvRate?.agency_name || 'Direct';
        if (agency !== reportAgencyFilter) return false;
      }

      // Date Range Filter
      if (reportDateStart) {
        const start = new Date(reportDateStart + 'T00:00:00').getTime();
        const sTime = new Date(s.start_time).getTime();
        if (sTime < start) return false;
      }
      if (reportDateEnd) {
        const end = new Date(reportDateEnd + 'T23:59:59').getTime();
        const sTime = new Date(s.start_time).getTime();
        if (sTime > end) return false;
      }

      return true;
    });

    const expandedShifts: Shift[] = [];

    rawFiltered.forEach(s => {
      const startObj = new Date(s.start_time);
      const endObj = s.end_time ? new Date(s.end_time) : null;

      // Detect cross-week boundary: Starts Sunday (0), Ends Monday (1)
      if (endObj && startObj.getDay() === 0 && endObj.getDay() === 1) {
        const midnight = new Date(startObj);
        midnight.setHours(24, 0, 0, 0); // Monday 00:00:00

        const hours1 = (midnight.getTime() - startObj.getTime()) / (1000 * 60 * 60);
        const hours2 = (endObj.getTime() - midnight.getTime()) / (1000 * 60 * 60);
        const totalHrs = hours1 + hours2;

        const part1: Shift = {
          ...s,
          id: `${s.id}-P1`, // Virtual ID for React key
          real_id: s.id,    // Original DB ID for editing
          end_time: midnight.toISOString(),
          total_hours: hours1,
          is_week_boundary: true,
          boundary_label: 'SUN (Part 1)'
        };

        const part2: Shift = {
          ...s,
          id: `${s.id}-P2`,
          real_id: s.id,
          start_time: midnight.toISOString(),
          total_hours: hours2,
          is_week_boundary: true,
          boundary_label: 'MON (Part 2)'
        };

        const drvProfile = employeeRates[s.driver_id] || {};
        const isFixed = s.rate_type?.toLowerCase().includes('fixed') || drvProfile?.rate_type?.toLowerCase().includes('fixed');

        if (s.total_pay !== null && s.total_pay !== undefined) {
          if (isFixed) {
            // Proportional split is correct for fixed flat rates
            part1.total_pay = Number((Number(s.total_pay) * (hours1 / totalHrs)).toFixed(2));
            part2.total_pay = Number((Number(s.total_pay) - part1.total_pay).toFixed(2));

            // Preserve the original full fixed rate explicitly for UI rendering
            const fullFixedRate = Number(s.effective_rate) || Number(s.base_hourly_rate) || 150.00;
            part1.effective_rate = fullFixedRate;
            part1.base_hourly_rate = fullFixedRate;
            part2.effective_rate = fullFixedRate;
            part2.base_hourly_rate = fullFixedRate;
          } else {
            // Exact mathematical split for hourly rates
            const extraTotal = (Number(s.extras_amount) || 0) + (Number(s.night_out_allowance ?? s.night_out_amount) || 0);
            const historicalBasePay = Number(s.total_pay) - extraTotal;

            const sunRate = Number(drvProfile?.sunday_rate) || Number(drvProfile?.sun_rate) || 18.00;
            const basePart1 = hours1 * sunRate;

            // Safeguard: cap part 1 base pay at total available base pay
            const actualBasePart1 = Math.min(basePart1, Math.max(0, historicalBasePay));
            const actualBasePart2 = Math.max(0, historicalBasePay - actualBasePart1);

            const extraPart1 = Number((extraTotal * (hours1 / totalHrs)).toFixed(2));
            const extraPart2 = Number((extraTotal - extraPart1).toFixed(2));

            part1.total_pay = Number((actualBasePart1 + extraPart1).toFixed(2));
            part2.total_pay = Number((actualBasePart2 + extraPart2).toFixed(2));

            // Override rates so getShiftFinancials renders them explicitly in the UI
            part1.base_hourly_rate = sunRate;
            part1.effective_rate = sunRate;

            const impliedMonRate = hours2 > 0 ? (actualBasePart2 / hours2) : 16.00;
            part2.base_hourly_rate = Number(impliedMonRate.toFixed(2));
            part2.effective_rate = part2.base_hourly_rate;
          }
        }

        expandedShifts.push(part1, part2);
      } else {
        // Normal shift
        expandedShifts.push({ ...s, real_id: s.id });
      }
    });

    return expandedShifts;
  };

  const calculateSplitShiftPay = (startTimeIso: string, endTimeIso: string, drvRates: any) => {
    if (!endTimeIso) return 0; // Ongoing shift

    let start = new Date(startTimeIso);
    const end = new Date(endTimeIso);
    let totalPay = 0;

    const getRateForDay = (date: Date) => {
      const day = date.getDay();
      if (!drvRates) return day === 0 ? 18.00 : day === 6 ? 17.00 : 16.00;
      if (day === 0) return Number(drvRates.sunday_rate ?? drvRates.sun_rate) || Number(drvRates.mon_fri_rate) || 18.00;
      if (day === 6) return Number(drvRates.saturday_rate ?? drvRates.sat_rate) || Number(drvRates.mon_fri_rate) || 17.00;
      return Number(drvRates.mon_fri_rate) || 16.00;
    };

    while (start < end) {
      let nextMidnight = new Date(start);
      nextMidnight.setHours(24, 0, 0, 0);

      const chunkEnd = nextMidnight < end ? nextMidnight : end;
      const chunkHours = (chunkEnd.getTime() - start.getTime()) / (1000 * 60 * 60);
      
      totalPay += chunkHours * getRateForDay(start);
      start = chunkEnd;
    }

    return totalPay;
  };

  const getShiftFinancials = (s: Shift) => {
    // 1. Determine if this shift has a LOCKED historical pay snapshot — a
    // completed shift with a stored total. Money for these is never
    // recomputed (see grossPay below): a completed shift's pay should not
    // silently change just because a rate is edited afterwards.
    const hasStoredPay = s.total_pay !== null && s.total_pay !== undefined;
    const hasHistoricalSnapshot = s.status === 'completed' && hasStoredPay;

    // 2. Resolve the driver's CURRENT rate profile. This is the source of
    // truth for how a shift is presented — Fixed vs Hourly, which day-rate
    // applies, and which agency it's under — exactly as configured in
    // Rates & Agencies right now. It is deliberately used for BOTH live and
    // historical shifts: a shift's stored numbers can freeze whatever was
    // true (or misconfigured) at the moment it closed, and displaying that
    // frozen state as if it were still current is what produced "£144.00
    // (Fixed/Shift)" for an hourly driver whose profile was later corrected.
    // Only the money (grossPay) stays pinned to the historical snapshot.
    const drvRate = employeeRates[s.driver_id] || (s as any).employee || (s as any).drivers || (s as any).driver;

    const startObj = new Date(s.start_time);
    const endObj = s.end_time ? new Date(s.end_time) : null;
    const isOngoing = !s.end_time && s.status !== 'completed';

    // CALCULATE LIVE HOURS FOR ONGOING SHIFTS
    let liveOrTotalHours = s.total_hours || 0;
    if (isOngoing) {
      liveOrTotalHours = Math.max(0, (Date.now() - startObj.getTime()) / (1000 * 60 * 60));
    }

    // Extract raw numbers safely
    const historicalTotalPay = hasStoredPay ? Number(s.total_pay) : null;
    const storedNoAmt = Number(s.night_out_allowance ?? s.night_out_amount) || 0;
    const storedExtras = Number(s.extras_amount) || 0;
    const storedDeduction = Number(s.deduction_amount) || 0;
    const historicalBasePay = historicalTotalPay !== null ? (historicalTotalPay - storedNoAmt - storedExtras + storedDeduction) : null;

    // Locked rate snapshot (migration 048) — the real, immutable record
    // of what rate applied when this shift completed. Present for every
    // shift that has ever completed (including a one-time backfill of
    // pre-migration shifts). Only a shift that somehow completed before
    // the backfill ran and was never touched again would lack one.
    const hasRateSnapshot = Boolean(s.rate_snapshot_timestamp && s.applied_rate_amount != null);

    // Fixed vs Hourly: for a locked shift, this is the snapshot itself —
    // not a live guess. Only an unlocked (still-active) shift falls back
    // to the driver's current profile, since there's nothing frozen yet.
    const isFixedRate = hasRateSnapshot
      ? s.applied_rate_type === 'fixed_shift'
      : Boolean(drvRate?.rate_type && (
          drvRate.rate_type.toLowerCase().includes('fixed') ||
          drvRate.rate_type.toLowerCase().includes('day') ||
          drvRate.rate_type.toLowerCase().includes('flat')
        ));

    // A shift under 15 minutes reads as a test/accidental clock-in, not
    // real work — the DB trigger already zeroes total_pay for these
    // unless a manager explicitly overrides it (Edit Payroll drawer).
    const isMicroShift = (s.total_hours ?? 0) > 0 && (s.total_hours ?? 0) < 0.25 && !s.is_micro_shift_override;

    const startDay = startObj.getDay();
    const endDay = endObj ? endObj.getDay() : startDay;

    // 3. Rate determination logic. A locked shift has ONE real rate — the
    // snapshot — regardless of which day(s) it spanned, so both "start"
    // and "end" resolve to the same locked figure rather than re-deriving
    // a live day-of-week rate that has nothing to do with what was
    // actually paid. Only a shift with no snapshot yet (still active)
    // uses the driver's current profile, since nothing is frozen yet.
    const getRateForDay = (day: number) => {
      if (drvRate) {
        if (isFixedRate) return Number(drvRate.fixed_rate) || Number((drvRate as any).hourly_rate) || Number(drvRate.mon_fri_rate) || 16.00;
        if (day === 0) return Number(drvRate.sunday_rate)   || Number(drvRate.sun_rate)  || Number(drvRate.mon_fri_rate) || 18.00;
        if (day === 6) return Number(drvRate.saturday_rate) || Number(drvRate.sat_rate)  || Number(drvRate.mon_fri_rate) || 17.00;
        return Number(drvRate.mon_fri_rate) || 16.00;
      }

      // No profile at all (e.g. driver record missing) — fall back to
      // whatever per-hour figure can be reverse-engineered from the total.
      const reverseEngineeredRate = (historicalBasePay !== null && s.total_hours) ? (historicalBasePay / s.total_hours) : null;
      return Number(s.base_hourly_rate) || Number(s.effective_rate) || reverseEngineeredRate || 16.00;
    };

    const startRateVal = hasRateSnapshot ? Number(s.applied_rate_amount) : getRateForDay(startDay);
    const endRateVal = hasRateSnapshot ? Number(s.applied_rate_amount) : getRateForDay(endDay);

    let basePay = 0;

    if (hasHistoricalSnapshot) {
      // Trust the locked snapshot completely for a completed shift's base
      // pay — this is the money that was actually paid and must not move
      // retroactively just because a rate was edited afterwards.
      basePay = historicalBasePay !== null ? historicalBasePay : (liveOrTotalHours * startRateVal);
      if (basePay < 0) basePay = liveOrTotalHours * startRateVal;
    } else if (isFixedRate) {
      // FLAT rate per shift — NEVER multiply by hours.
      // Use hourly_rate as fallback if fixed_rate was not persisted by schema-cache tier-3 save.
      basePay = Number(drvRate?.fixed_rate)
        || Number((drvRate as any)?.hourly_rate)
        || startRateVal;
    } else {
      basePay = s.end_time
        ? calculateSplitShiftPay(s.start_time, s.end_time, drvRate)
        : liveOrTotalHours * startRateVal;
    }

    const noAmt = Number(s.night_out_allowance ?? s.night_out_amount) || 0;
    const extrasAmt = Number(s.extras_amount) || 0;
    const deductionAmt = Number(s.deduction_amount) || 0;

    let grossPay = 0;
    if (hasHistoricalSnapshot) {
        // Trust the database completely. The total_pay already includes all extras, allowances and deductions.
        grossPay = Number(s.total_pay);
    } else {
        grossPay = Number((basePay + noAmt + extrasAmt - deductionAmt).toFixed(2));
    }

    return {
      rate: startRateVal,
      startRateVal,
      endRateVal,
      startDay,
      endDay,
      isFixedRate,
      hasRateSnapshot,
      rateSnapshotTimestamp: s.rate_snapshot_timestamp ?? null,
      isMicroShift,
      deductionAmt,
      deductionReason: s.deduction_reason ?? null,
      noAmt,
      extrasAmt,
      extrasNote: s.extras_note,
      grossPay,
      agency: drvRate?.agency_name || 'Direct',
      liveHours: liveOrTotalHours
    };
  };

  // Every shift in the shape "Fill in the template" needs, with the pay
  // getShiftFinancials() already shows in the Compensation Summary, so the
  // filled spreadsheet always adds up to the same total.
  const allPayrollShifts = useMemo<PayrollShift[]>(() => shifts.map(s => {
    const fin = getShiftFinancials(s);
    return {
      id: s.id,
      driver_id: s.driver_id,
      driver_name: s.driver_name || 'Driver',
      driver_code: s.driver_code || '',
      agency: fin.agency,
      depot: s.depot_name || '',
      rate_type: fin.isFixedRate ? 'Fixed' : 'Hourly',
      start_time: s.start_time,
      end_time: s.end_time ?? null,
      status: s.status ?? null,
      total_hours: Number(fin.liveHours) || 0,
      total_pay: Number(fin.grossPay) || 0,
      night_out: fin.noAmt,
      night_out_status: s.night_out_status ?? null,
      extras: fin.extrasAmt,
      deductions: fin.deductionAmt,
      vehicle: s.vehicle_number || '',
      trailer: s.trailer_number || '',
      load_reference: s.load_reference || '',
      rate_breakdown: (s as any).rate_breakdown ?? null,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [shifts, employeeRates]);

  const payrollRates = useMemo(() => {
    const out: Record<string, DayRates> = {};
    for (const [id, prof] of Object.entries(employeeRates)) {
      const r = prof as any;
      out[id] = { mf: Number(r?.mon_fri_rate) || 0, sat: Number(r?.saturday_rate ?? r?.sat_rate) || 0, sun: Number(r?.sunday_rate ?? r?.sun_rate) || 0 };
    }
    return out;
  }, [employeeRates]);

  // Export CSV / Export Excel: one row per shift, previewed before download.
  const openShiftExport = (format: 'csv' | 'xlsx') => {
    const filtered = getFilteredShifts();
    if (filtered.length === 0) {
      showToast('No shifts match the current filters.', 'error');
      return;
    }
    const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB');
    const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const rows: PreviewRow[] = [...filtered]
      .sort((a, b) => (a.driver_name || '').localeCompare(b.driver_name || '') || a.start_time.localeCompare(b.start_time))
      .map(s => {
        const { rate, isFixedRate, noAmt, extrasAmt, extrasNote, deductionAmt, deductionReason, grossPay, agency, hasRateSnapshot, rateSnapshotTimestamp, isMicroShift } = getShiftFinancials(s);
        return {
          name: s.driver_name || 'Driver',
          code: s.driver_code || '',
          agency,
          depot: s.depot_name || '',
          date: day(s.start_time),
          start: time(s.start_time),
          end: s.end_time ? (day(s.end_time) === day(s.start_time) ? time(s.end_time) : `${day(s.end_time)} ${time(s.end_time)}`) : 'Active',
          hours: Math.round((s.total_hours || 0) * 100) / 100,
          rate: Math.round(rate * 100) / 100,
          rateType: isFixedRate ? 'Fixed per shift' : 'Hourly',
          rateLocked: hasRateSnapshot && rateSnapshotTimestamp ? new Date(rateSnapshotTimestamp).toLocaleDateString('en-GB') : '',
          noStatus: (s.night_out_status || 'none') === 'none' ? '' : (s.night_out_status || '').replace(/^./, c => c.toUpperCase()),
          nightOut: noAmt,
          bonus: extrasAmt,
          bonusNote: extrasNote || '',
          deduction: deductionAmt,
          deductionReason: deductionReason || '',
          ignored: isMicroShift ? 'Yes' : '',
          gross: Math.round(grossPay * 100) / 100,
        };
      });

    setExportPreview({
      title: 'Payroll report',
      subtitle: exportSubtitle(),
      columns: [
        { key: 'name', label: 'Employee Name' },
        { key: 'code', label: 'Employee ID' },
        { key: 'agency', label: 'Agency' },
        { key: 'depot', label: 'Depot' },
        { key: 'date', label: 'Date' },
        { key: 'start', label: 'Clock In' },
        { key: 'end', label: 'Clock Out' },
        { key: 'hours', label: 'Hours Worked', kind: 'hours' },
        { key: 'rate', label: 'Rate (£)', kind: 'money' },
        { key: 'rateType', label: 'Rate Type' },
        { key: 'rateLocked', label: 'Rate Locked' },
        { key: 'noStatus', label: 'Night Out Status' },
        { key: 'nightOut', label: 'Night Out (£)', kind: 'money' },
        { key: 'bonus', label: 'Bonus (£)', kind: 'money' },
        { key: 'bonusNote', label: 'Bonus Note' },
        { key: 'deduction', label: 'Deduction (£)', kind: 'money' },
        { key: 'deductionReason', label: 'Deduction Reason' },
        { key: 'ignored', label: 'Ignored Test Shift' },
        { key: 'gross', label: 'Gross Pay (£)', kind: 'money' },
      ],
      rows,
      defaultFormat: format,
      fileBase: exportFileBase('Payroll_Report'),
      storageKey: 'comp-shifts',
      flash: format === 'csv' ? 'csv' : 'excel',
    });
  };
  const exportCSV = () => openShiftExport('csv');
  const exportExcel = () => openShiftExport('xlsx');

  // Clicking a driver in the telemetry panel centres the map on them.
  const focusDriverOnMap = useCallback((driverId: string) => {
    const marker = markersRef.current[driverId];
    if (!mapRef.current || !marker) return;
    marker.openPopup();
    // Turning the journey on lets the journey itself fit the map once it has
    // loaded (one move, not two fighting each other); turning it off just stays put.
    trailFittedFor.current = null;
    setTrailDriverId(prev => (prev === driverId ? null : driverId));
  }, []);

  // Draw the selected driver's journey so far (clock-in to now) on the live
  // map, using the same labelling as Journey History. Redraws whenever the
  // live positions refresh, so it grows as the driver moves.
  // Only this driver's own position redraws the journey, not every refresh of everyone's.
  const trailLive = trailDriverId ? liveLocations.find(l => l.driver_id === trailDriverId) : undefined;
  const trailLat = trailLive?.latitude;
  const trailLng = trailLive?.longitude;
  useEffect(() => {
    if (activeTab !== 'live' || liveSubTab !== 'live' || !trailDriverId || isMockMode || !supabase) {
      trailLayerRef.current?.clearLayers();
      return;
    }
    const shift = shifts.find(x => x.driver_id === trailDriverId && !x.end_time && x.status !== 'completed');
    if (!shift) { trailLayerRef.current?.clearLayers(); return; }
    let cancelled = false;
    (async () => {
      const toMs = (ts: string) => new Date(/Z$|[+-]\d\d(:?\d\d)?$/.test(ts.trim()) ? ts.trim() : `${ts.trim().replace(' ', 'T')}Z`).getTime();
      const pings: Ping[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase!
          .from('gps_locations')
          .select('latitude, longitude, speed, recorded_at')
          .eq('shift_id', shift.id)
          .order('recorded_at', { ascending: true })
          .range(from, from + 999);
        if (error) return;
        for (const r of data ?? []) {
          if (r.latitude == null || r.longitude == null) continue;
          pings.push({ lat: Number(r.latitude), lng: Number(r.longitude), speed: r.speed == null ? null : Number(r.speed), t: toMs(r.recorded_at) });
        }
        if (!data || data.length < 1000) break;
      }
      if (cancelled || !mapRef.current) return;
      const map = mapRef.current;
      const startMs = toMs(shift.start_time);
      if ((shift as { start_lat?: number | null }).start_lat != null && (shift as { start_lng?: number | null }).start_lng != null && (pings.length === 0 || pings[0].t > startMs)) {
        pings.unshift({ lat: Number((shift as { start_lat?: number | null }).start_lat), lng: Number((shift as { start_lng?: number | null }).start_lng), speed: 0, t: startMs });
      }
      const segs = buildJourney(pings, Date.now());
      const draw = () => {
        if (cancelled || mapRef.current !== map) return;
        if (!trailLayerRef.current) trailLayerRef.current = L.layerGroup().addTo(map);
        const layer = trailLayerRef.current;
        layer.clearLayers();
        const all = drawJourney(layer, segs, { map }) as [number, number][];
        if (trailFittedFor.current !== trailDriverId) {
          trailFittedFor.current = trailDriverId;
          if (all.length) map.fitBounds(L.latLngBounds(all).pad(0.2), { maxZoom: 15 });
          else if (trailLat != null && trailLng != null) map.setView([trailLat, trailLng], Math.max(map.getZoom(), 14));
        }
      };
      // Never change layers in the middle of a zoom animation (it breaks the map).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((map as any)._animatingZoom) map.once('zoomend', draw); else draw();
    })();
    return () => { cancelled = true; };
  }, [activeTab, liveSubTab, trailDriverId, trailLat, trailLng, shifts]);

  // Leaving the live tab or the driver clocking out ends the trail.
  useEffect(() => {
    if (activeTab !== 'live') setTrailDriverId(null);
  }, [activeTab]);

  // ── Leaflet Map Component Implementation ────────────────────
  useEffect(() => {
    if (!isAuthenticated || activeTab !== 'live' || liveSubTab !== 'live') {
      // Clean up map instance when tab or auth changes
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        trailLayerRef.current = null;
        trailFittedFor.current = null;
        trailerMarkersRef.current = {};
        // Markers belong to the map that was just destroyed; keep none, so
        // they are drawn again on the next map.
        markersRef.current = {};
        depotLayersRef.current = [];
      }
      return;
    }

    // Initialize Leaflet map
    if (!mapRef.current) {
      mapRef.current = L.map('live-dispatch-map', { maxZoom: 20 }).setView([53.5160, -1.0880], 11);

      // Drop Leaflet's own "Leaflet" branding link from the attribution
      // control — not required by anyone, just the library's default credit.
      // The OpenFreeMap/OpenMapTiles/OSM text below still shows; that part is
      // required by their terms and stays.
      mapRef.current.attributionControl.setPrefix(false);

      // OpenFreeMap Liberty vector tiles — keyless, unmetered, commercial use permitted
      // for small orgs (OpenFreeMap's stated usage terms cover projects under 10
      // employees / €1M revenue; re-check if this app outgrows that). Liberty is
      // OpenFreeMap's actively-maintained, full-detail default style — switched from
      // Positron, which deliberately strips out POIs and most labels and was reading
      // as too sparse/empty at the zoom levels used for dispatch. Rendered through
      // MapLibre GL; all Leaflet overlays below stay on Leaflet panes.
      L.maplibreGL({
        style: 'https://tiles.openfreemap.org/styles/liberty'
      }).addTo(mapRef.current);
      // Attribution (OpenFreeMap / OpenMapTiles / OSM) is required, and is supplied
      // automatically as linked text from the style itself — do not add it manually.
    }

    // Draw each of the org's real depots (from the Depots section under
    // Team & Access) — redrawn every time this effect runs so a depot
    // added/removed there, or one that finishes loading after the map's
    // first paint, shows up without needing a manual page reload.
    depotLayersRef.current.forEach(layer => layer.remove());
    depotLayersRef.current = [];
    depots.forEach(depot => {
      const circle = L.circle([depot.latitude, depot.longitude], {
        color: '#CC0000',
        fillColor: '#CC0000',
        fillOpacity: 0.08,
        // A radius of 1,000 km+ would cover the whole map, so it is drawn as a small ring.
        radius: depot.geofence_radius_m >= 1_000_000 ? 300 : depot.geofence_radius_m,
        weight: 1.5
      }).addTo(mapRef.current!).bindPopup(
        `<b>${depot.name}</b><br>Radius: ${depot.geofence_radius_m.toLocaleString('en-GB')}m<br>Lat: ${depot.latitude.toFixed(4)}, Lng: ${depot.longitude.toFixed(4)}`
      );
      const marker = L.marker([depot.latitude, depot.longitude], {
        icon: L.divIcon({
          className: '',
          html: `<div style="background-color:#CC0000;width:8px;height:8px;border-radius:50%;border:2px solid #FFFFFF;box-shadow:0 1px 4px rgba(204,0,0,0.4);"></div>`
        })
      }).addTo(mapRef.current!);
      depotLayersRef.current.push(circle, marker);
    });

    // Plot and update live driver markers dynamically. Each marker shows the
    // driver's tractor and the trailer coupled to it beside the dot; icon and
    // popup are refreshed on every run so a changed trailer or status shows
    // without recreating the marker.
    const escHtml = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
    // With "Show trailers" on, only trailer icons are drawn: the driver avatars
    // are hidden so the two never overlap.
    // With a driver selected (their journey is on the map) only that driver is shown.
    const visibleLocations = trailDriverId ? liveLocations.filter(l => l.driver_id === trailDriverId) : liveLocations;
    (showTrailers ? [] : visibleLocations).forEach(loc => {
      // Overlap jitter: a small fixed offset per driver (derived from the id,
      // so markers stay put between refreshes) keeps two units parked
      // together from sitting exactly on top of each other.
      let h = 0;
      for (let i = 0; i < loc.driver_id.length; i++) h = (h * 31 + loc.driver_id.charCodeAt(i)) >>> 0;
      const displayLat = loc.latitude + (((h % 1000) / 1000) - 0.5) * 0.0002;
      const displayLng = loc.longitude + ((((h >> 10) % 1000) / 1000) - 0.5) * 0.0002;

      const noSignal = noSignalDriverIds.has(loc.driver_id);
      const dotClass = noSignal ? 'driver-nosignal-dot' : loc.status === 'idle' ? 'driver-idle-dot' : 'driver-live-dot';
      const statusLabel = noSignal ? 'NO GPS SIGNAL' : loc.status.toUpperCase();

      // Same source as the Employee Database's "Current Unit" column and the
      // Driver Hours calendar (shifts.vehicle_id / trailer_id).
      const sh = shifts.find(x => (x.driver_id === loc.driver_id) && !x.end_time && x.status !== 'completed');
      const tractor = sh?.vehicle_number ? escHtml(String(sh.vehicle_number)) : null;
      const trailer = sh?.trailer_number ? escHtml(String(sh.trailer_number)) : null;
      const labelParts = [tractor, trailer ? `<span>+</span> ${trailer}` : null].filter(Boolean);
      void dotClass;
      const markerHtml = driverPinHtml({
        name: loc.driver_name || 'Driver',
        state: noSignal ? 'nosignal' : loc.status === 'idle' ? 'idle' : loc.status === 'stationary' ? 'stationary' : 'live',
        label: labelParts.length ? labelParts.join(' ') : null,
      });
      const unitLines = [
        tractor ? `<span style="color:#333333;font-size:11px;font-weight:bold;">Tractor: ${tractor}</span><br>` : '',
        trailer ? `<span style="color:#333333;font-size:11px;font-weight:bold;">Trailer: ${trailer}</span><br>` : '',
      ].join('');
      const popupHtml = `
          <div style="font-family:'Inter',sans-serif;">
            <b style="font-size:13px;color:#333333;">${escHtml(loc.driver_name)}</b><br>
            ${unitLines}
            <span style="color:#888888;font-size:11px;">Speed: ${loc.speed_mph.toFixed(0)} mph</span><br>
            <span style="color:${noSignal ? '#D99100' : loc.status === 'idle' ? '#DC2626' : loc.status === 'stationary' ? '#EA580C' : '#16A34A'};font-size:11px;font-weight:bold;">
              Status: ${statusLabel}
            </span><br>
            <a href="https://www.google.com/maps/search/?api=1&query=${loc.latitude},${loc.longitude}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-top:6px;font-size:11px;color:#CC0000;font-weight:bold;text-decoration:none;">View in Google Maps</a>
          </div>`;
      const icon = L.divIcon({ className: '', html: markerHtml, iconSize: DRIVER_PIN_SIZE, iconAnchor: DRIVER_PIN_ANCHOR });

      const existing = markersRef.current[loc.driver_id];
      if (existing) {
        existing.setLatLng([displayLat, displayLng]);
        existing.setIcon(icon);
        existing.setPopupContent(popupHtml);
      } else {
        markersRef.current[loc.driver_id] = L.marker([displayLat, displayLng], { icon })
          .addTo(mapRef.current!)
          .bindPopup(popupHtml);
      }
    });

    // Trailer markers: a trailer icon with its number, placed at the coupled
    // driver's position (shifts.trailer_id). `trailerSource` is 'driver' for
    // now; a trailer with its own tracker would report source 'tracker'.
    const wantedTrailerKeys = new Set<string>();
    if (showTrailers) {
      visibleLocations.forEach(loc => {
        const sh = shifts.find(x => (x.driver_id === loc.driver_id) && !x.end_time && x.status !== 'completed');
        if (!sh?.trailer_number) return;
        const key = `trailer-${sh.trailer_number}`;
        wantedTrailerKeys.add(key);
        const trailerNo = escHtml(String(sh.trailer_number));
        const trailerSource: 'driver' | 'tracker' = 'driver';
        // The driver avatar is hidden in this view, so the trailer sits right on the
        // position; a small fixed offset per trailer keeps two parked together apart.
        let th = 0;
        for (let i = 0; i < key.length; i++) th = (th * 31 + key.charCodeAt(i)) >>> 0;
        const lat = loc.latitude + (((th % 1000) / 1000) - 0.5) * 0.0002;
        const lng = loc.longitude + ((((th >> 10) % 1000) / 1000) - 0.5) * 0.0002;
        // A small pin: a charcoal square with a line-icon container, and the reg as a quiet label.
        const html = trailerPinHtml(String(sh.trailer_number));
        const popup = `
          <div style="font-family:'Inter',sans-serif;">
            <b style="font-size:13px;color:#333333;">Trailer ${trailerNo}</b><br>
            <span style="color:#333333;font-size:11px;">${trailerSource === 'driver' ? `Position from ${escHtml(loc.driver_name)}${sh.vehicle_number ? ` (tractor ${escHtml(String(sh.vehicle_number))})` : ''}` : 'Position from trailer tracker'}</span><br>
            <span style="color:#888888;font-size:11px;">Last update ${new Date(loc.last_ping).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span><br>
            <a href="https://www.google.com/maps/search/?api=1&query=${loc.latitude},${loc.longitude}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-top:6px;font-size:11px;color:#CC0000;font-weight:bold;text-decoration:none;">View in Google Maps</a>
          </div>`;
        const icon = L.divIcon({ className: '', html, iconSize: TRAILER_PIN_SIZE, iconAnchor: TRAILER_PIN_ANCHOR });
        const existing = trailerMarkersRef.current[key];
        if (existing) {
          existing.setLatLng([lat, lng]);
          existing.setIcon(icon);
          existing.setPopupContent(popup);
        } else {
          trailerMarkersRef.current[key] = L.marker([lat, lng], { icon, zIndexOffset: -100 }).addTo(mapRef.current!).bindPopup(popup);
        }
      });
    }
    Object.keys(trailerMarkersRef.current).forEach(key => {
      if (!wantedTrailerKeys.has(key)) {
        trailerMarkersRef.current[key].remove();
        delete trailerMarkersRef.current[key];
      }
    });

    // Plot and update unacknowledged SOS alert markers
    alerts.forEach(alert => {
      if (alert.is_sos && !alert.acknowledged) {
        const sosHtml = `<div style="background-color:#CC0000;width:13px;height:13px;border-radius:50%;border:2px solid white;box-shadow:0 0 0 4px rgba(204,0,0,0.35);animation:markerPulse 0.8s infinite;"></div>`;
        const markerId = `sos-${alert.id}`;

        if (markersRef.current[markerId]) {
          markersRef.current[markerId].setLatLng([alert.latitude, alert.longitude]);
        } else {
          const marker = L.marker([alert.latitude, alert.longitude], {
            icon: L.divIcon({ className: '', html: sosHtml, iconSize: [13, 13] })
          }).addTo(mapRef.current!).bindPopup(`
            <div style="font-family:'Inter',sans-serif;">
              <b style="font-size:13px;color:#CC0000;">🚨 EMERGENCY SOS BREAKDOWN</b><br>
              <b style="font-size:12px;color:#333333;">${alert.driver_name}</b><br>
              <span style="color:#888888;font-size:11px;">Triggered at: ${new Date(alert.created_at as string).toLocaleTimeString()}</span><br>
              <a href="https://www.google.com/maps/search/?api=1&query=${alert.latitude},${alert.longitude}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-top:6px;font-size:11px;color:#CC0000;font-weight:bold;text-decoration:none;">🗺️ Open Google Maps</a>
            </div>
          `);
          markersRef.current[markerId] = marker;
        }
      }
    });


    // Remove offline driver or acknowledged SOS markers
    Object.keys(markersRef.current).forEach(id => {
      if (id.startsWith('sos-')) {
        const alertId = id.replace('sos-', '');
        const alert = alerts.find(a => a.id === alertId);
        if (!alert || alert.acknowledged) {
          markersRef.current[id].remove();
          delete markersRef.current[id];
        }
      } else {
        if (showTrailers || !visibleLocations.find(l => l.driver_id === id)) {
          markersRef.current[id].remove();
          delete markersRef.current[id];
        }
      }
    });

  }, [isAuthenticated, activeTab, liveSubTab, liveLocations, alerts, depots, shifts, noSignalDriverIds, showTrailers, trailDriverId]);

  // ── Render login Page if Unauthenticated ───────────────────
  // ── Two-step sign-in code ─────────────────────────────────
  if (!isAuthenticated && mfaChallenge) {
    return (
      <div className="login-shell">
        <div className="login-card login-card--single">
          <div className="login-form-col">
            <div className="text-center mb-24">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '18px' }}>
                <BrandLogo transparentIcon iconSize={32} textSize={22} gap={7} fontFamily="'Plus Jakarta Sans', 'Inter', sans-serif" />
              </div>
              <h1 className="login-title">Enter your 6-digit code</h1>
              <p className="login-subtitle">Open your authenticator app on your phone.</p>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!mfaChallenge) return;
              const code = mfaChallenge.code.trim();
              if (!/^\d{6}$/.test(code)) {
                setMfaChallenge(m => m && { ...m, error: 'Enter the 6-digit code from your app.' });
                return;
              }
              setMfaChallenge(m => m && { ...m, verifying: true, error: '' });
              const { data: challenge, error: chErr } = await supabase!.auth.mfa.challenge({ factorId: mfaChallenge.factorId });
              if (chErr || !challenge) {
                setMfaChallenge(m => m && { ...m, verifying: false, error: chErr?.message ?? 'Could not start the check — try again.' });
                return;
              }
              const { error: vErr } = await supabase!.auth.mfa.verify({ factorId: mfaChallenge.factorId, challengeId: challenge.id, code });
              if (vErr) {
                setMfaChallenge(m => m && { ...m, verifying: false, error: vErr.message });
                return;
              }
              setMfaChallenge(null);
              await finishAdminLogin();
            }}>
              <input
                className="login-input font-mono"
                inputMode="numeric"
                maxLength={6}
                autoFocus
                autoComplete="one-time-code"
                placeholder="000000"
                style={{ padding: '14px', fontSize: '22px', letterSpacing: '0.3em', textAlign: 'center' }}
                value={mfaChallenge.code}
                onChange={(e) => setMfaChallenge(m => m && { ...m, code: e.target.value.replace(/\D/g, '').slice(0, 6) })}
              />
              {mfaChallenge.error && (
                <div className="text-error text-sm font-semibold mt-16">{mfaChallenge.error}</div>
              )}
              <FlowButton type="submit" disabled={mfaChallenge.verifying} text={mfaChallenge.verifying ? 'CHECKING…' : 'VERIFY'} hoverText="LET ME IN" className="w-full" />
            </form>
            <div className="login-utils" style={{ marginTop: '16px', justifyContent: 'center' }}>
              <button
                type="button"
                className="login-forgot"
                onClick={async () => {
                  await supabase!.auth.signOut();
                  setMfaChallenge(null);
                }}
              >
                ← Sign in as someone else
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Request access: new visitors become interest buyers ────
  if (!isAuthenticated && requestAccessMode) {
    const setAccessField = (key: keyof typeof EMPTY_ACCESS_REQUEST) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        setRequestAccessForm(prev => ({ ...prev, [key]: e.target.value }));
    const backToSignIn = () => {
      setRequestAccessMode(false);
      setRequestAccessError('');
      if (requestAccessDone) {
        setRequestAccessDone(false);
        setRequestAccessForm(EMPTY_ACCESS_REQUEST);
      }
    };
    return (
      <div className="login-shell">
        <div className="login-card login-card--single">
          <div className="login-form-col">
            <div className="text-center mb-24">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '18px' }}>
                <BrandLogo transparentIcon iconSize={32} textSize={22} gap={7} fontFamily="'Plus Jakarta Sans', 'Inter', sans-serif" />
              </div>
              <h1 className="login-title">{requestAccessDone ? 'Request Received' : 'Request Access'}</h1>
              <p className="login-subtitle">
                {requestAccessDone
                  ? 'Thanks — the Tachyo team will be in touch within one business day.'
                  : "Tell us about your fleet and we'll set up your company's account with you."}
              </p>
            </div>

            {requestAccessDone ? (
              <>
                <div className="login-notice login-notice--info">
                  We'll contact you at <strong>{requestAccessForm.email.trim()}</strong> to walk you through Tachyo and create
                  your company's login. No account exists yet, so there's nothing to sign in to until then.
                </div>
                <button type="button" className="login-submit" style={{ marginTop: '8px' }} onClick={backToSignIn}>
                  <Shield size={15} />
                  BACK TO SIGN IN
                </button>
              </>
            ) : (
              <form onSubmit={handleRequestAccess} style={{ position: 'relative' }}>
                <div className="input-group">
                  <label className="input-label" htmlFor="access-company">COMPANY NAME</label>
                  <div className="login-field">
                    <span className="login-field-icon"><Building2 size={16} /></span>
                    <input id="access-company" type="text" className="login-input" placeholder="Your Haulage Ltd" autoComplete="organization" value={requestAccessForm.companyName} onChange={setAccessField('companyName')} required />
                  </div>
                </div>

                <div className="input-group">
                  <label className="input-label" htmlFor="access-name">YOUR NAME</label>
                  <div className="login-field">
                    <span className="login-field-icon"><User size={16} /></span>
                    <input id="access-name" type="text" className="login-input" placeholder="Full name" autoComplete="name" value={requestAccessForm.contactName} onChange={setAccessField('contactName')} required />
                  </div>
                </div>

                <div className="input-group">
                  <label className="input-label" htmlFor="access-email">WORK EMAIL</label>
                  <div className="login-field">
                    <span className="login-field-icon"><Mail size={16} /></span>
                    <input id="access-email" type="email" className="login-input" placeholder="you@yourcompany.com" autoComplete="email" value={requestAccessForm.email} onChange={setAccessField('email')} required />
                  </div>
                </div>

                <div className="flex" style={{ gap: '12px' }}>
                  <div className="input-group" style={{ flex: 1, minWidth: 0 }}>
                    <label className="input-label" htmlFor="access-phone">PHONE (OPTIONAL)</label>
                    <div className="login-field">
                      <span className="login-field-icon"><Phone size={16} /></span>
                      <input id="access-phone" type="tel" className="login-input" placeholder="07…" autoComplete="tel" value={requestAccessForm.phone} onChange={setAccessField('phone')} />
                    </div>
                  </div>
                  <div className="input-group" style={{ flex: 1, minWidth: 0 }}>
                    <label className="input-label" htmlFor="access-fleet">FLEET SIZE</label>
                    <div className="login-field">
                      <span className="login-field-icon"><Truck size={16} /></span>
                      <select id="access-fleet" className="login-input" style={{ appearance: 'none', cursor: 'pointer', paddingRight: '34px' }} value={requestAccessForm.fleetSize} onChange={setAccessField('fleetSize')}>
                        <option value="">Select…</option>
                        <option value="1-9">1–9 vehicles</option>
                        <option value="10-49">10–49 vehicles</option>
                        <option value="50-149">50–149 vehicles</option>
                        <option value="150+">150+ vehicles</option>
                      </select>
                      <ChevronDown size={14} style={{ position: 'absolute', right: '14px', color: '#9AA1AC', pointerEvents: 'none' }} />
                    </div>
                  </div>
                </div>

                <div className="input-group">
                  <label className="input-label" htmlFor="access-message">WHAT WOULD YOU LIKE TACHYO TO SOLVE? (OPTIONAL)</label>
                  <textarea
                    id="access-message"
                    className="login-input"
                    style={{ paddingLeft: '14px', minHeight: '76px', resize: 'vertical' }}
                    placeholder="e.g. Idle time, payroll reconciliation, walk-around checks…"
                    value={requestAccessForm.message}
                    onChange={setAccessField('message')}
                  />
                </div>

                {/* Honeypot — hidden from people, filled in by bots. */}
                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  value={requestAccessForm.website}
                  onChange={setAccessField('website')}
                  style={{ position: 'absolute', left: '-10000px', width: '1px', height: '1px', opacity: 0 }}
                />

                {requestAccessError && (
                  <div className="login-notice login-notice--error">{requestAccessError}</div>
                )}

                <FlowButton
                  type="submit"
                  disabled={isSubmittingAccessRequest}
                  text={isSubmittingAccessRequest ? 'SENDING…' : 'REQUEST ACCESS'}
                  hoverText="LET'S TALK"
                  className="w-full"
                />
              </form>
            )}

            {!requestAccessDone && (
              <div className="login-utils" style={{ marginTop: '16px', justifyContent: 'center' }}>
                <button type="button" className="login-forgot" onClick={backToSignIn}>
                  ← Already have an account? Sign in
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Password Recovery: reached via the emailed reset link ──
  if (recoveryMode) {
    return (
      <div className="login-shell">
        <div className="login-card login-card--single">
          <div className="login-form-col">
            <div className="text-center mb-24">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '18px' }}>
                <BrandLogo transparentIcon iconSize={32} textSize={22} gap={7} fontFamily="'Plus Jakarta Sans', 'Inter', sans-serif" />
              </div>
              <h1 className="login-title">Set New Password</h1>
              <p className="login-subtitle">Choose a new administrator password</p>
            </div>

            <form onSubmit={handleSetNewPassword}>
              <div className="input-group">
                <label className="input-label" htmlFor="new-password">NEW PASSWORD</label>
                <div className="login-field">
                  <span className="login-field-icon"><Lock size={16} /></span>
                  <input
                    id="new-password"
                    type={showNewPassword ? 'text' : 'password'}
                    className="login-input login-input--with-toggle"
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="login-toggle"
                    onClick={() => setShowNewPassword(v => !v)}
                    aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showNewPassword}
                  >
                    <EyeToggleIcon on={showNewPassword} size={16} />
                  </button>
                </div>
              </div>

              <div className="input-group">
                <label className="input-label" htmlFor="confirm-password">CONFIRM NEW PASSWORD</label>
                <div className="login-field">
                  <span className="login-field-icon"><Lock size={16} /></span>
                  <input
                    id="confirm-password"
                    type={showNewPassword ? 'text' : 'password'}
                    className="login-input"
                    placeholder="Re-enter new password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              {recoveryError && (
                <div className="text-error text-sm font-semibold mb-16 flex align-center gap-8">
                  <ShieldAlert size={15} />
                  {recoveryError}
                </div>
              )}

              <button type="submit" className="login-submit" disabled={isSavingPassword}>
                {isSavingPassword ? <SaveIcon saving success={false} size={15} /> : <Shield size={15} />}
                {isSavingPassword ? 'UPDATING…' : 'UPDATE PASSWORD'}
              </button>
            </form>

            <p className="login-footnote">Multi-Factor Authentication enabled for enhanced security</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div
        className="login-shell"
        style={{
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: '#141416',
          isolation: 'isolate',
        }}
      >
        {/* The login form stands alone — a single frosted-glass card
            centered on a plain dark backdrop. The earlier full-bleed
            globe hero background is dropped: its WebGL rendering
            couldn't be confirmed reliably, so the real logo + company
            name go directly on the card instead — guaranteed to render
            correctly everywhere. */}
        <div className="login-card login-card--single login-card--glass" style={{ position: 'relative', zIndex: 50 }}>
          <div className="login-form-col">
            <div className="text-center mb-24">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '18px' }}>
                <BrandLogo transparentIcon iconSize={32} textSize={22} gap={7} fontFamily="'Plus Jakarta Sans', 'Inter', sans-serif" />
              </div>
              <h2 className="login-title" style={{ fontSize: '20px' }}>Welcome back</h2>
              <p className="login-subtitle">Administrator Access Only</p>
            </div>

            <form onSubmit={handleLogin}>
              <div className="input-group">
                <label className="input-label" htmlFor="login-email">ADMINISTRATOR EMAIL</label>
                <div className="login-field">
                  <span className="login-field-icon"><Mail size={16} /></span>
                  <input
                    id="login-email"
                    type="email"
                    className="login-input"
                    placeholder="you@yourcompany.com"
                    autoComplete="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="input-group">
                <label className="input-label" htmlFor="login-password">PASSWORD</label>
                <div className="login-field">
                  <span className="login-field-icon"><Lock size={16} /></span>
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    className="login-input login-input--with-toggle"
                    placeholder="••••••••••"
                    autoComplete="current-password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="login-toggle"
                    onClick={() => setShowPassword(v => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                  >
                    <EyeToggleIcon on={showPassword} size={16} />
                  </button>
                </div>
              </div>

              <div className="login-utils">
                <label className="login-remember">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  Remember Me
                </label>
                <button
                  type="button"
                  className="login-forgot"
                  onClick={handleForgotPassword}
                  disabled={isSendingReset}
                >
                  {isSendingReset ? 'Sending…' : 'Forgot Password?'}
                </button>
              </div>

              {resetNotice && (
                <div className={`login-notice login-notice--${resetNotice.tone}`} role="status">
                  {resetNotice.text}
                </div>
              )}

              {loginError && (
                <div className="text-error text-sm font-semibold mb-16 flex align-center gap-8">
                  <ShieldAlert size={15} />
                  {loginError}
                </div>
              )}

              <FlowButton type="submit" text="LOG IN" hoverText="WELCOME" className="w-full" />
            </form>

            <div className="login-utils" style={{ marginTop: '14px', justifyContent: 'center' }}>
              <button
                type="button"
                className="login-forgot"
                onClick={() => { setRequestAccessMode(true); setResetNotice(null); setLoginError(''); }}
              >
                New to Tachyo? Request access
              </button>
            </div>

            <div className="login-utils" style={{ marginTop: '4px', justifyContent: 'center' }}>
              <button
                type="button"
                className="login-forgot"
                style={{ color: 'var(--charcoal-mid)', textDecoration: 'underline' }}
                onClick={() => { setLegalModalDoc('privacy'); setLegalModalOpen(true); }}
              >
                <FileText size={12} style={{ verticalAlign: '-2px', marginRight: '4px' }} />
                Privacy Policy &amp; Terms of Service
              </button>
            </div>

            {isMockMode && (
              <div className="mt-24 p-12 text-center text-xs text-muted" style={{ border: '1px dashed var(--border-color)', borderRadius: '6px' }}>
                ℹ️ Sandbox Mock Mode Active<br/>
                <b>Payroll Admin:</b> <span className="text-secondary font-mono">payroll@example.com</span> / <span className="text-secondary font-mono">payroll123</span><br/>
                <b>Logistics:</b> <span className="text-secondary font-mono">logistics@example.com</span> / <span className="text-secondary font-mono">logistics123</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Legal & Compliance modal — viewable before login, no
             acceptance is required here: this is dashboard staff signing in
             to the dispatch console, not a contractor accepting the terms
             that govern the driver app. ────────────────────────────── */}
        {legalModalOpen && (
          <div
            className="modal-overlay"
            style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}
            onClick={() => setLegalModalOpen(false)}
          >
            <div
              className="modal-content glass-panel"
              style={{ width: '620px', maxWidth: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', borderRadius: '16px', backgroundColor: 'var(--card-bg)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid var(--border-color)', overflow: 'hidden' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid #E5E7EB' }}>
                <span className="font-black text-primary" style={{ fontSize: '15px' }}>Legal &amp; Compliance</span>
                <button
                  type="button"
                  onClick={() => setLegalModalOpen(false)}
                  aria-label="Close"
                  style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--charcoal-light)', display: 'flex' }}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ display: 'flex', gap: '8px', padding: '14px 20px 0' }}>
                <button
                  type="button"
                  className={`payroll-pill-btn ${legalModalDoc === 'privacy' ? 'payroll-pill-btn--active' : 'payroll-pill-btn--outline'}`}
                  onClick={() => setLegalModalDoc('privacy')}
                >
                  Privacy Policy
                </button>
                <button
                  type="button"
                  className={`payroll-pill-btn ${legalModalDoc === 'terms' ? 'payroll-pill-btn--active' : 'payroll-pill-btn--outline'}`}
                  onClick={() => setLegalModalDoc('terms')}
                >
                  Terms of Service
                </button>
                <button
                  type="button"
                  className={`payroll-pill-btn ${legalModalDoc === 'dpa' ? 'payroll-pill-btn--active' : 'payroll-pill-btn--outline'}`}
                  onClick={() => setLegalModalDoc('dpa')}
                >
                  Data Processing Addendum
                </button>
                <button
                  type="button"
                  className={`payroll-pill-btn ${legalModalDoc === 'telematics' ? 'payroll-pill-btn--active' : 'payroll-pill-btn--outline'}`}
                  onClick={() => setLegalModalDoc('telematics')}
                >
                  Telematics & GPS Policy
                </button>
              </div>

              <div style={{ padding: '20px', overflowY: 'auto' }}>
                <h3 className="font-black text-primary" style={{ fontSize: '16px', margin: '0 0 16px' }}>
                  {LEGAL_DOCUMENTS[legalModalDoc].title}
                </h3>
                {LEGAL_DOCUMENTS[legalModalDoc].sections.map((section, i) => (
                  <div key={i} style={{ marginBottom: '20px' }}>
                    <div className="font-bold text-primary" style={{ fontSize: '13px', marginBottom: '6px', whiteSpace: 'pre-line' }}>
                      {section.heading}
                    </div>
                    <div className="text-secondary" style={{ fontSize: '13px', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                      {section.body}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Includes fuel/parking items still awaiting review — the Alert Panel
  // (Alert Monitors) is now the only place those get approved, so the
  // "needs attention" badge belongs on this nav item, not Analytics'.
  const activeAlertsCount = alerts.filter(a => !a.acknowledged).length + gpsOfflineEvents.filter(e => !e.acknowledged).length + (hasFeature('fuel_audit') ? pendingFuelReceiptsCount : 0) + (hasFeature('payroll_rates') ? pendingParkingExpensesCount : 0) + walkaroundIssuesToday + holidayRequests.length + newAccessRequests.length + riskSignoffs.length + unroadworthyUse.length + pinResetRequests.length + deletionRequests.length;
  const pendingNightOutsCount = shifts.filter(s => s.night_out_status === 'pending').length;

  return (
    <div className="flex min-h-screen">
      {/* ── Left Sidebar Navigation ────────────────────────── */}
      {/* Same colors/classes/behavior as before (.sidebar, .nav-item,
          .nav-icon, .nav-dot in index.css) — now hosted in
          the animated collapsible Sidebar primitive: collapses to icons on
          mouse-leave, expands on hover (desktop), and gets a proper slide-in
          menu on mobile, which the fixed-grid layout never had before. */}
      <Sidebar open={railExpanded} setOpen={setSidebarOpen}>
        <SidebarBody
          widthOpen="240px"
          widthClosed="68px"
          className="sidebar !px-0 !py-0 justify-between"
        >
          <div>
            {/* Brand header — the full wordmark is too wide to fit the
                collapsed 68px rail (it would overflow the sidebar's edge),
                so collapsed shows just the square icon mark instead. The
                collapsed rail keeps the white-backed logo (it reads as a
                deliberate rounded badge); expanded uses the transparent cut,
                where a white patch would sit awkwardly against the panel. */}
            <div className="text-center" style={{ padding: railExpanded ? '28px 20px 20px' : '20px 8px 16px' }}>
              {railExpanded ? (
                <BrandLogo transparentIcon iconSize={22} textSize={15} gap={5} />
              ) : (
                <img src="/logo.png" alt="Tachyo" style={{ height: '28px', width: '28px', objectFit: 'contain', borderRadius: '6px' }} />
              )}
            </div>

            <nav className="flex flex-col" style={{ gap: '2px' }}>
              {/* Same in-sidebar accordion pattern as Driver Profiles and
                  Compliance & Safety below. Shipments stays payroll_admin
                  only inside the sub-item list, as it was as a standalone
                  item. */}
              <div>
                <button
                  type="button"
                  onClick={() => setIsDispatchExpanded(v => !v)}
                  aria-expanded={isDispatchExpanded}
                  className={`nav-item ${(activeTab === 'dashboard' || activeTab === 'live' || activeTab === 'shipments') ? 'active' : ''}`}
                  style={{ width: '100%', borderTop: 'none', borderRight: 'none', borderBottom: 'none' }}
                >
                  <span className="nav-icon">
                    <LayoutGrid size={16} strokeWidth={1.75} />
                    {userRole === 'payroll_admin' && pendingLoadsCount > 0 && (
                      <span className="nav-count-badge" title={`${pendingLoadsCount} load${pendingLoadsCount === 1 ? '' : 's'} awaiting a rate`}>
                        {pendingLoadsCount > 9 ? '9+' : pendingLoadsCount}
                      </span>
                    )}
                  </span>
                  {railExpanded && (
                    <>
                      <span className="text-inherit dark:text-inherit" style={{ flex: 1, textAlign: 'left' }}>Dispatch Board</span>
                      {isDispatchExpanded ? (
                        <ChevronDown size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
                      ) : (
                        <ChevronRight size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
                      )}
                    </>
                  )}
                </button>

                {railExpanded && (
                  <AnimateChangeInHeight>
                    {isDispatchExpanded && (
                      <div className="nav-subitem-group">
                        {([
                          ['dashboard', 'Dashboard', 0] as const,
                          ['live', 'Live Map', 0] as const,
                          ...(userRole === 'payroll_admin' ? [['shipments', 'Shipments', pendingLoadsCount] as const] : []),
                        ]).map(([tab, label, count]) => (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => setActiveTab(tab)}
                            className={`nav-subitem ${activeTab === tab ? 'active' : ''}`}
                          >
                            {label}
                            {TAB_FEATURE[tab] && !hasFeature(TAB_FEATURE[tab] as FeatureKey) && <Lock size={11} style={{ opacity: 0.6, marginLeft: '2px' }} />}
                            {count > 0 && (
                              <span
                                style={{
                                  fontSize: '10px', fontWeight: 800, padding: '1px 6px', borderRadius: '8px',
                                  background: '#FFFBEB', color: '#F59E0B',
                                }}
                              >
                                {count}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </AnimateChangeInHeight>
                )}
              </div>

              <SidebarLink
                link={{
                  label: 'Alert Monitors',
                  href: '#',
                  active: activeTab === 'alerts',
                  onClick: () => setActiveTab('alerts'),
                  icon: (
                    <span className="nav-icon">
                      <Bell size={16} strokeWidth={1.75} />
                      {activeAlertsCount > 0 && (
                        <span className="nav-count-badge" title={`${activeAlertsCount} item${activeAlertsCount === 1 ? '' : 's'} needing attention`}>
                          {activeAlertsCount > 9 ? '9+' : activeAlertsCount}
                        </span>
                      )}
                    </span>
                  ),
                }}
                className={`nav-item ${activeTab === 'alerts' ? 'active' : ''}`}
                labelClassName="text-inherit dark:text-inherit"
              />

              {/* Driver Profiles accordion — same in-sidebar expand/collapse
                  pattern as Compliance & Safety below (not a hover flyout;
                  see that block's own comment for why). Rates & Agencies
                  used to be its own standalone top-level item; it's a
                  sub-item here now since it's really a driver-profile
                  destination (pay rates per driver) and stays gated to
                  payroll_admin only within the sub-item list itself, not
                  the whole group — logistics still needs plain Driver
                  Profiles access. */}
              <div>
                <button
                  type="button"
                  onClick={() => setIsDriverProfilesExpanded(v => !v)}
                  aria-expanded={isDriverProfilesExpanded}
                  className={`nav-item ${(activeTab === 'drivers' || activeTab === 'rates' || activeTab === 'holidays') ? 'active' : ''}`}
                  style={{ width: '100%', borderTop: 'none', borderRight: 'none', borderBottom: 'none' }}
                >
                  <span className="nav-icon">
                    <Users size={16} strokeWidth={1.75} />
                    {pendingNightOutsCount + holidayRequests.length > 0 && (
                      <span className="nav-count-badge" title={`${pendingNightOutsCount + holidayRequests.length} request${pendingNightOutsCount + holidayRequests.length === 1 ? '' : 's'} pending`}>
                        {pendingNightOutsCount + holidayRequests.length > 9 ? '9+' : pendingNightOutsCount + holidayRequests.length}
                      </span>
                    )}
                  </span>
                  {railExpanded && (
                    <>
                      <span className="text-inherit dark:text-inherit" style={{ flex: 1, textAlign: 'left' }}>Driver Profiles</span>
                      {isDriverProfilesExpanded ? (
                        <ChevronDown size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
                      ) : (
                        <ChevronRight size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
                      )}
                    </>
                  )}
                </button>

                {railExpanded && (
                  <AnimateChangeInHeight>
                    {isDriverProfilesExpanded && (
                      <div className="nav-subitem-group">
                        {([
                          ['drivers', 'Employee Database', 0] as const,
                          ...(userRole === 'payroll_admin' ? [['rates', 'Compensation Summary', pendingNightOutsCount] as const] : []),
                          ['holidays', 'Employees Schedule', holidayRequests.length] as const,
                        ]).map(([tab, label, count]) => (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => setActiveTab(tab)}
                            className={`nav-subitem ${activeTab === tab ? 'active' : ''}`}
                          >
                            {label}
                            {TAB_FEATURE[tab] && !hasFeature(TAB_FEATURE[tab] as FeatureKey) && <Lock size={11} style={{ opacity: 0.6, marginLeft: '2px' }} />}
                            {count > 0 && (
                              <span
                                style={{
                                  fontSize: '10px', fontWeight: 800, padding: '1px 6px', borderRadius: '8px',
                                  background: '#FFFBEB', color: '#F59E0B',
                                }}
                              >
                                {count}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </AnimateChangeInHeight>
                )}
              </div>

              {/* Not role-gated — both payroll_admin and logistics manage
                  MOT dates and react to incident reports day to day.
                  In-sidebar accordion (not a hover flyout): clicking the
                  header expands/collapses in place, pushing the rest of the
                  nav down, revealing its three destinations as indented
                  rows — same structure as the referenced "Extra Options"
                  sidebar submenu pattern. */}
              <div>
                <button
                  type="button"
                  onClick={() => setIsComplianceExpanded(v => !v)}
                  aria-expanded={isComplianceExpanded}
                  className={`nav-item ${(activeTab === 'compliance' || activeTab === 'fleet-roadworthiness' || activeTab === 'driver-hours' || activeTab === 'compliance-defects' || activeTab === 'walkaround-history') ? 'active' : ''}`}
                  style={{ width: '100%', borderTop: 'none', borderRight: 'none', borderBottom: 'none' }}
                >
                  <span className="nav-icon">
                    <ShieldCheck size={16} strokeWidth={1.75} />
                    {complianceAlertCount > 0 && (
                      <span className="nav-count-badge" title={`${complianceAlertCount} compliance item${complianceAlertCount === 1 ? '' : 's'} need attention`}>
                        {complianceAlertCount > 9 ? '9+' : complianceAlertCount}
                      </span>
                    )}
                  </span>
                  {railExpanded && (
                    <>
                      <span className="text-inherit dark:text-inherit" style={{ flex: 1, textAlign: 'left' }}>Compliance &amp; Safety</span>
                      {isComplianceExpanded ? (
                        <ChevronDown size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
                      ) : (
                        <ChevronRight size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
                      )}
                    </>
                  )}
                </button>

                {railExpanded && (
                  <AnimateChangeInHeight>
                    {isComplianceExpanded && (
                      <div className="nav-subitem-group">
                        {([
                          ['compliance', 'Overview', 0] as const,
                          ['fleet-roadworthiness', 'Fleet Roadworthiness', fleetAlertCount] as const,
                          ['driver-hours', 'Driver Hours & WTD', wtdAlertCount] as const,
                          ['compliance-defects', 'Defect Registry', 0] as const,
                          ['walkaround-history', 'Walk-Around Checks', 0] as const,
                        ]).map(([tab, label, count]) => (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => setActiveTab(tab)}
                            className={`nav-subitem ${activeTab === tab ? 'active' : ''}`}
                          >
                            {label}
                            {TAB_FEATURE[tab] && !hasFeature(TAB_FEATURE[tab] as FeatureKey) && <Lock size={11} style={{ opacity: 0.6, marginLeft: '2px' }} />}
                            {count > 0 && (
                              <span
                                style={{
                                  fontSize: '10px', fontWeight: 800, padding: '1px 6px', borderRadius: '8px',
                                  background: '#FEF2F2', color: '#CC0000',
                                }}
                              >
                                {count}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </AnimateChangeInHeight>
                )}
              </div>

              {(
                <SidebarLink
                  link={{
                    label: 'Analytics',
                    href: '#',
                    active: activeTab === 'analytics',
                    onClick: () => setActiveTab('analytics'),
                    icon: (
                      <span className="nav-icon">
                        <BarChart3 size={16} strokeWidth={1.75} />
                        {!hasFeature('analytics') && <Lock size={10} style={{ position: 'absolute', right: '-3px', bottom: '-3px', color: 'var(--brand-red)' }} />}
                      </span>
                    ),
                  }}
                  className={`nav-item ${activeTab === 'analytics' ? 'active' : ''}`}
                  labelClassName="text-inherit dark:text-inherit"
                />
              )}

              {isPlatformAdmin && (
                <SidebarLink
                  link={{
                    label: 'Accounts',
                    href: '#',
                    active: activeTab === 'accounts',
                    onClick: () => setActiveTab('accounts'),
                    icon: (
                      <span className="nav-icon">
                        <Inbox size={16} strokeWidth={1.75} />
                        {newAccessRequests.length > 0 && (
                          <span className="nav-count-badge" title={`${newAccessRequests.length} new interest buyer${newAccessRequests.length === 1 ? '' : 's'}`}>
                            {newAccessRequests.length > 9 ? '9+' : newAccessRequests.length}
                          </span>
                        )}
                      </span>
                    ),
                  }}
                  className={`nav-item ${activeTab === 'accounts' ? 'active' : ''}`}
                  labelClassName="text-inherit dark:text-inherit"
                />
              )}

            </nav>
          </div>

          <div style={{ padding: '0 20px 20px' }}>
            {railExpanded && (
              <div className="p-12 text-center text-xs text-muted mb-16" style={{ border: '1px solid var(--border-color)', borderRadius: '10px' }}>
                <span className="font-bold uppercase" style={{ color: userRole === 'payroll_admin' ? '#10B981' : '#3B82F6' }}>
                  {userRole === 'payroll_admin' ? 'Payroll Admin' : 'Logistics Role'}
                </span>
              </div>
            )}

            {/* Settings is open to both roles now — logistics accounts only
                see the Company tab inside it (driver-support numbers +
                Appearance), everything else in the modal stays gated to
                payroll_admin by activeSettingsSection below. */}
            {(
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <SidebarLink
                  link={{
                    label: 'Settings',
                    href: '#',
                    active: settingsModalOpen,
                    onClick: () => setSettingsModalOpen(true),
                    icon: <span className="nav-icon"><Settings size={16} strokeWidth={1.75} /></span>,
                  }}
                  className={`nav-item ${settingsModalOpen ? 'active' : ''}`}
                  labelClassName="text-inherit dark:text-inherit"
                  style={{ paddingLeft: '14px', borderLeft: 0, borderRadius: '8px', flex: 1, minWidth: 0 }}
                />
                {/* Theme toggle, right next to Settings as asked — only
                    shown when the rail is expanded (collapsed 68px rail
                    has no room for a second icon button here). Gated on
                    railExpanded, not sidebarOpen, so it stays mounted while
                    its own menu is open. */}
                {railExpanded && (
                  <div style={{ flexShrink: 0, paddingRight: '8px' }}>
                    <ThemeToggle onOpenChange={setThemeMenuOpen} />
                  </div>
                )}
              </div>
            )}


            <SidebarLink
              link={{
                label: 'Log out',
                href: '#',
                onClick: handleLogout,
                icon: <span className="nav-icon"><LogOut size={16} strokeWidth={1.75} /></span>,
              }}
              className="nav-item text-error"
              labelClassName="text-inherit dark:text-inherit"
              style={{ paddingLeft: '14px', borderLeft: 0, borderRadius: '8px' }}
            />
          </div>
        </SidebarBody>
      </Sidebar>

      {/* ── Main Dashboard Content ─────────────────────────── */}
      <div className="p-32 flex flex-col overflow-auto" style={{ height: '100vh', boxSizing: 'border-box', flex: 1, minWidth: 0 }}>
        
        {activeTab === 'dashboard' && (
          <DispatchDashboard
            liveLocations={liveLocations}
            employees={employees}
            shifts={shifts}
            alerts={alerts}
            idleThresholdMinutes={orgAlertSettings.idleAlertMinutes}
            idleDetectionEnabled={orgAlertSettings.idleDetectionEnabled}
            fuelCostByShift={approvedFuelCostByShift}
            dispatchLoads={dispatchBoard}
            showFinancials={userRole === 'payroll_admin'}
            unitRisk={unitRisk}
            onOpenFleet={openFleetUnit}
            onAssign={(driverId) => { setDispatchDriverId(driverId); setDispatchMode('assign'); setIsDispatchOpen(true); }}
            onNavigate={setActiveTab}
          />
        )}

        {activeTab === 'live' && (
          <div className="flex-1 grid gap-24" style={{ gridTemplateRows: 'auto 1fr', minHeight: 0 }}>
            <div>
              <h2 className="text-xl font-black text-primary m-0">LIVE MAP</h2>
              <p className="text-xs text-muted m-0 mt-4">
                {liveSubTab === 'live'
                  ? "Every driver's last known position with their tractor and trailer, depots and active alerts."
                  : 'Pick a driver and dates to replay their journey. Every shift is kept.'}
              </p>
              <div className="live-subtabs" role="tablist">
                <button type="button" role="tab" aria-selected={liveSubTab === 'live'} className={`live-subtab ${liveSubTab === 'live' ? 'live-subtab--active' : ''}`} onClick={() => setLiveSubTab('live')}>
                  <Radio size={14} /> Live map
                </button>
                <button type="button" role="tab" aria-selected={liveSubTab === 'journey'} className={`live-subtab ${liveSubTab === 'journey' ? 'live-subtab--active' : ''}`} onClick={() => setLiveSubTab('journey')}>
                  <Route size={14} /> Journey history
                </button>
              </div>
            </div>

            {liveSubTab === 'journey' ? (
              <JourneyHistory embedded shifts={shifts} employees={employees} depots={depots} />
            ) : (
            /* Map takes three quarters of the width, telemetry status the right quarter */
            <div className="live-split">
              <div className="map-shell">
                <div id="live-dispatch-map" className="h-full w-full"></div>

                {/* Floating map controls */}
                <div className="map-toolbar">
                  <button
                    className="map-refresh-btn"
                    onClick={handleMapRefresh}
                    disabled={isRefreshing}
                  >
                    <RefreshCw size={14} className={isRefreshing ? 'spin-animation' : ''} />
                    {isRefreshing ? 'REFRESHING…' : 'REFRESH POSITIONS'}
                  </button>
                  <button
                    type="button"
                    className={`map-refresh-btn map-trailer-toggle ${showTrailers ? 'map-trailer-toggle--on' : ''}`}
                    onClick={() => setShowTrailers(v => !v)}
                    aria-pressed={showTrailers}
                    title={showTrailers ? 'Hide trailers on the map' : 'Show trailers on the map'}
                  >
                    <Container size={14} />
                    TRAILER
                  </button>
                </div>

                {trailDriverId && (
                  <div className="map-trail-chip">
                    <span>Journey so far: {liveLocations.find(l => l.driver_id === trailDriverId)?.driver_name ?? 'Driver'}</span>
                    <span className="map-trail-key">
                      {(['moving', 'stationary', 'stopped', 'no_signal'] as const).map(k => (
                        <span key={k}><i style={{ background: LABEL_META[k].color }} />{LABEL_META[k].text}</span>
                      ))}
                    </span>
                    <button type="button" onClick={() => setTrailDriverId(null)}>Hide journey</button>
                  </div>
                )}
              </div>

              <LiveTelemetryPanel
                liveLocations={liveLocations}
                shifts={shifts}
                assignedLoads={assignedLoadByDriver}
                depots={depots}
                noSignalDriverIds={noSignalDriverIds}
                isRefreshing={isRefreshing}
                onRefresh={handleMapRefresh}
                onSelectDriver={focusDriverOnMap}
              />
            </div>
            )}
          </div>
        )}


        {/* ── TAB 2: Idle Alert Center ─────────────────────── */}
        {activeTab === 'alerts' && (
          <div className="flex-1">
            <div className="flex align-center justify-between mb-16">
              <h2 className="text-xl font-black text-primary m-0">ALERT PANEL</h2>

              <div className="flex gap-12">
                {/* Audio controller toggle */}
                <button className="btn btn-secondary flex align-center" style={{ gap: '6px' }} onClick={() => setIsAudioMuted(!isAudioMuted)}>
                  {isAudioMuted ? <BellOff size={16} /> : <VolumeIcon on={isAudioMuted} size={16} />}
                  {isAudioMuted ? 'UNMUTE ALARM' : 'MUTE ALARM'}
                </button>

                {/* Clear all alerts button */}
                <button
                  className="btn btn-primary flex align-center"
                  style={{ gap: '6px', opacity: alerts.length === 0 ? 0.5 : 1, cursor: alerts.length === 0 ? 'not-allowed' : 'pointer' }}
                  onClick={handleClearAllAlerts}
                  disabled={alerts.length === 0}
                >
                  <Trash2 size={14} /> CLEAR ALERTS
                </button>
              </div>
            </div>

            {/* Category dropdown — was a row of filter pills, but the
                Alert Monitors consolidation grew this list to 6 categories
                and a pill row that wraps across two lines reads as
                cluttered; a single dropdown scales better as more
                categories join this panel over time. "Idle >50m" is a
                real threshold on real alert age, not an invented figure.
                There's no separate "Geofence" category in this schema —
                idle_alerts ARE the geofence/stationary alerts; a 4th
                option duplicating "Idle" with no distinct backing data
                would just be a fake filter, so it's deliberately not
                here. Fuel Anomaly / Fuel Pending / Parking Pending (Alert
                Monitors consolidation) reuse the same fuelReceipts/
                parkingExpenses this file already loads for Analytics
                (theft_flag/theft_reason come straight off each row,
                computed server-side) — no new query, just a second place
                those same categories surface; this panel is now the only
                place a fuel receipt or parking claim gets approved,
                Analytics only shows the already-approved totals. */}
            <div className="mb-16 flex align-center" style={{ gap: '10px', flexWrap: 'wrap' }}>
              <TableFilter
                groups={[{
                  key: 'category', label: 'Category', single: true, neutral: 'all',
                  options: ([

                    ['all', 'All Alerts', alerts.length],
                    ['gps_offline', 'GPS Tracking Off', gpsOfflineEvents.filter(e => !e.acknowledged).length],
                    ['sos', 'Emergency SOS', alerts.filter(a => a.is_sos).length],
                    ...(orgAlertSettings.idleDetectionEnabled ? [['idle50', 'Idle >50m', null] as const] : []),
                    ...(hasFeature('fuel_audit') ? [
                      ['fuel_anomaly', 'Fuel Anomaly', anomalousFuelReceiptCount] as const,
                      ['fuel_pending', 'Fuel Receipts Pending', pendingFuelReceiptsCount] as const,
                    ] : []),
                    ...(hasFeature('payroll_rates') ? [['parking_pending', 'Parking Claims Pending', pendingParkingExpensesCount] as const] : []),
                    ['walkaround', 'Walk-Around Checks', walkaroundAlertIssues.length],
                    ['unroadworthy_use', 'Not Roadworthy In Use', unroadworthyUse.length],
                    ['risk_signoffs', 'Unroadworthy Sign-Offs', riskSignoffs.length],
                    ['pin_reset', 'PIN Reset Requests', pinResetRequests.length],
                    ['account_deletion', 'Account Deletion Requests', deletionRequests.length],
                    ['holiday_pending', 'Holiday Requests', holidayRequests.length],
                    ...(isPlatformAdmin ? [['access_requests', 'Access Requests', newAccessRequests.length] as const] : []),
                  ] as const).map(([key, label, count]) => ({ value: key, label: `${label}${count !== null && count > 0 ? ` (${count})` : ''}` })),
                  selected: [alertCategoryFilter],
                  onChange: (v) => setAlertCategoryFilter((v[0] ?? 'all') as typeof alertCategoryFilter),
                }]}
              />
            </div>

            {/* Fuel Anomaly / Fuel Pending / Parking Pending — same card
                shell as the SOS/Idle cards below, driving from data this
                file already loads for Analytics rather than a new query.
                Each card links out to its real review modal (Fuel Audit /
                Parking Claims) instead of duplicating the approve/reject
                actions here. */}
            {(alertCategoryFilter === 'gps_offline' || alertCategoryFilter === 'fuel_anomaly' || alertCategoryFilter === 'fuel_pending' || alertCategoryFilter === 'parking_pending' || alertCategoryFilter === 'walkaround' || alertCategoryFilter === 'holiday_pending' || alertCategoryFilter === 'access_requests' || alertCategoryFilter === 'risk_signoffs' || alertCategoryFilter === 'unroadworthy_use' || alertCategoryFilter === 'pin_reset' || alertCategoryFilter === 'account_deletion') ? (() => {
              const renderQueueAlertCards = (
                items: { key: string; driverName?: string; subtitle?: string; dateStr: string; reasonText: string }[],
                _emptyTitle: string,
                _emptyDescription: string,
                badgeLabel: string,
                reviewLabel: string,
                onReview: () => void,
              ) => items.length === 0 ? (
                <div className="glass-card">
                  <NoData />
                </div>
              ) : (
                <div className="flex flex-col" style={{ gap: '12px' }}>
                  {items.map(item => (
                    <div key={item.key} className="alert-card alert-card--idle">
                      <div className="flex align-center justify-between mb-8">
                        <span className="alert-badge-pill alert-badge-pill--idle">
                          <AlertTriangle size={12} /> {badgeLabel}
                        </span>
                        <span className="font-mono tabular-nums text-xs text-muted">{item.dateStr}</span>
                      </div>
                      <div className="flex align-center mb-4" style={{ flexWrap: 'wrap' }}>
                        <span className="font-semibold text-primary" style={{ fontSize: '13.5px' }}>{item.driverName || 'Unknown Driver'}</span>
                        {item.subtitle && (
                          <span className="font-mono font-bold text-secondary" style={{ fontSize: '12px', marginLeft: '8px', textTransform: 'uppercase' }}>{item.subtitle}</span>
                        )}
                      </div>
                      <p className="text-xs text-secondary" style={{ margin: '0 0 10px' }}>{item.reasonText}</p>
                      <button type="button" className="alert-ack-btn" onClick={onReview}>
                        <ExternalLink size={13} /> {reviewLabel}
                      </button>
                    </div>
                  ))}
                </div>
              );

              if (alertCategoryFilter === 'gps_offline') {
                const mins = (from: string, to: string | null) => Math.max(1, Math.round(((to ? new Date(to).getTime() : Date.now()) - new Date(from).getTime()) / 60000));
                const lenLabel = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`);
                const actionText: Record<GpsOfflineEvent['action_taken'], string> = {
                  alert: 'Alert only. Time is still being paid.',
                  time_frozen: 'Time frozen: the offline stretch is not paid.',
                  clocked_out: 'Clocked out automatically at the last GPS ping.',
                };
                return gpsOfflineEvents.length === 0 ? (
                  <div className="glass-card">
                    <NoData />
                  </div>
                ) : (
                  <div className="flex flex-col" style={{ gap: '12px' }}>
                    {gpsOfflineEvents.map(ev => {
                      const open = !ev.resolved_at;
                      return (
                        <div key={ev.id} className={`alert-card ${open ? 'alert-card--sos' : 'alert-card--idle'}`}>
                          <div className="flex align-center justify-between mb-8">
                            <span className={`alert-badge-pill ${open ? 'alert-badge-pill--sos' : 'alert-badge-pill--idle'}`}>
                              <SatelliteDish size={12} /> {open ? 'GPS Tracking Off' : 'GPS Resumed'}
                            </span>
                            <span className="font-mono tabular-nums text-xs text-muted">
                              {new Date(ev.started_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <div className="flex align-center mb-4" style={{ flexWrap: 'wrap', gap: '8px' }}>
                            <span className="font-semibold text-primary" style={{ fontSize: '13.5px' }}>{toTitleCase(ev.driver_name ?? '') || 'Unknown Driver'}</span>
                            {ev.vehicle_number && <span className="font-mono font-bold text-secondary" style={{ fontSize: '12px', textTransform: 'uppercase' }}>{ev.vehicle_number}</span>}
                          </div>
                          <p className="text-xs text-secondary" style={{ margin: '0 0 6px' }}>
                            {open
                              ? `No GPS for ${lenLabel(mins(ev.started_at, null))}. The app was closed or removed from the background, or location was switched off.`
                              : `No GPS for ${lenLabel(mins(ev.started_at, ev.resolved_at))}, tracking is back.`}
                          </p>
                          <p className="text-xs text-muted" style={{ margin: '0 0 10px' }}>{actionText[ev.action_taken]}</p>
                          <div className="flex align-center" style={{ gap: '8px', flexWrap: 'wrap' }}>
                            {ev.last_lat != null && ev.last_lng != null && (
                              <a href={`https://www.google.com/maps/search/?api=1&query=${ev.last_lat},${ev.last_lng}`} target="_blank" rel="noopener noreferrer" className="comp-edit-btn">
                                <MapPin size={13} /> Last known position
                              </a>
                            )}
                            {!ev.acknowledged && (
                              <button type="button" className="alert-ack-btn" onClick={() => acknowledgeGpsOffline(ev.id)}>
                                <CheckCircle2 size={13} /> Acknowledge
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              }
              if (alertCategoryFilter === 'fuel_anomaly') {
                return renderQueueAlertCards(
                  fuelReceipts.filter(r => r.theft_flag).map(r => ({
                    key: r.id,
                    driverName: toTitleCase(r.driver_name ?? ''),
                    subtitle: r.vehicle_number,
                    dateStr: new Date(r.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
                    reasonText: r.theft_reason ?? 'Flagged as anomalous.',
                  })),
                  'No Fuel Anomalies',
                  "Every fuel log's MPG is within normal range for its vehicle.",
                  'Fuel Anomaly',
                  'Review in Fuel Audit',
                  () => setIsFuelReceiptsModalOpen(true),
                );
              }
              if (alertCategoryFilter === 'fuel_pending') {
                return renderQueueAlertCards(
                  fuelReceipts.filter(r => r.status === 'pending').map(r => ({
                    key: r.id,
                    driverName: toTitleCase(r.driver_name ?? ''),
                    subtitle: r.vehicle_number,
                    dateStr: new Date(r.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
                    reasonText: `${r.liters === null ? '—' : r.liters.toFixed(1)} L${r.total_cost != null ? ` · £${r.total_cost.toFixed(2)}` : ''} — awaiting approval.`,
                  })),
                  'No Fuel Receipts Pending',
                  'Every submitted fuel receipt has been reviewed.',
                  'Awaiting Review',
                  'Review in Fuel Audit',
                  () => setIsFuelReceiptsModalOpen(true),
                );
              }
              if (alertCategoryFilter === 'account_deletion') {
                return deletionRequests.length === 0 ? (
                  <div className="glass-card">
                    <NoData />
                  </div>
                ) : (
                  <div className="flex flex-col" style={{ gap: '12px' }}>
                    {deletionRequests.map(r => (
                      <div key={r.id} className="alert-card alert-card--sos">
                        <div className="flex align-center justify-between mb-8">
                          <span className="alert-badge-pill alert-badge-pill--sos"><Trash2 size={12} /> Account Deletion Requested</span>
                          <span className="font-mono tabular-nums text-xs text-muted">
                            {new Date(r.requested_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="flex align-center mb-4" style={{ flexWrap: 'wrap', gap: '8px' }}>
                          <span className="font-semibold text-primary" style={{ fontSize: '13.5px' }}>{toTitleCase(r.driver_name ?? '') || 'Unknown Employee'}</span>
                          <span className="font-mono font-bold text-secondary" style={{ fontSize: '12px' }}>{r.driver_ref ?? ''}</span>
                          <span className="text-xs text-muted">sent from the {r.source === 'login' ? 'login screen (signed out)' : 'app settings'}</span>
                        </div>
                        {r.reason && <p className="text-xs text-secondary" style={{ margin: '0 0 8px', overflowWrap: 'anywhere' }}>“{r.reason}”</p>}
                        <p className="text-xs text-secondary" style={{ margin: '0 0 10px' }}>
                          Deleting removes this employee&apos;s shifts, locations, checks, reports, receipts, holidays, rota and sign-in for good.
                          {r.source === 'login' ? ' This was sent without signing in, so confirm with the employee before you delete.' : ''}
                        </p>
                        <div className="flex" style={{ gap: '8px', flexWrap: 'wrap' }}>
                          <button type="button" className="alert-ack-btn" disabled={deletingRequestId === r.id} onClick={() => confirmAccountDeletion(r)}>
                            <Trash2 size={13} /> {deletingRequestId === r.id ? 'Deleting…' : 'Delete all their data'}
                          </button>
                          <button type="button" className="alert-dismiss-btn" disabled={deletingRequestId === r.id} onClick={() => dismissAccountDeletion(r.id)}>Dismiss</button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              }
              if (alertCategoryFilter === 'pin_reset') {
                return pinResetRequests.length === 0 ? (
                  <div className="glass-card">
                    <NoData />
                  </div>
                ) : (
                  <div className="flex flex-col" style={{ gap: '12px' }}>
                    {pinResetRequests.map(r => (
                      <div key={r.id} className="alert-card alert-card--idle">
                        <div className="flex align-center justify-between mb-8">
                          <span className="alert-badge-pill alert-badge-pill--idle"><KeyRound size={12} /> PIN Reset Requested</span>
                          <span className="font-mono tabular-nums text-xs text-muted">
                            {new Date(r.requested_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="flex align-center mb-4" style={{ flexWrap: 'wrap', gap: '8px' }}>
                          <span className="font-semibold text-primary" style={{ fontSize: '13.5px' }}>{toTitleCase(r.driver_name ?? '') || 'Unknown Employee'}</span>
                          <span className="font-mono font-bold text-secondary" style={{ fontSize: '12px' }}>{r.driver_code ?? ''}</span>
                        </div>
                        <p className="text-xs text-secondary" style={{ margin: '0 0 10px' }}>Issue a new activation code and pass it on so they can set a new PIN.</p>
                        <button type="button" className="alert-ack-btn" onClick={() => issuePinResetFromRequest(r.driver_id, r.driver_code ?? '', r.driver_name ?? 'Driver')}>
                          <KeyRound size={13} /> Issue activation code
                        </button>
                      </div>
                    ))}
                  </div>
                );
              }
              if (alertCategoryFilter === 'unroadworthy_use') {
                return unroadworthyUse.length === 0 ? (
                  <div className="glass-card">
                    <NoData />
                  </div>
                ) : (
                  <div className="flex flex-col" style={{ gap: '12px' }}>
                    {unroadworthyUse.map(u => (
                      <div key={`${u.shiftId}-${u.kind}`} className="alert-card alert-card--sos">
                        <div className="flex align-center justify-between mb-8">
                          <span className="alert-badge-pill alert-badge-pill--sos">
                            <AlertOctagon size={12} /> {u.kind} Not Roadworthy — On The Road
                          </span>
                          <span className="font-mono tabular-nums text-xs text-muted">
                            on shift since {new Date(u.since).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="flex align-center mb-4" style={{ flexWrap: 'wrap', gap: '8px' }}>
                          <span className="font-semibold text-primary" style={{ fontSize: '13.5px' }}>{toTitleCase(u.driverName)}</span>
                          <span className="font-mono font-bold text-secondary" style={{ fontSize: '12px', textTransform: 'uppercase' }}>{u.unit}</span>
                        </div>
                        <p className="text-xs font-bold" style={{ margin: 0, color: 'var(--brand-red)' }}>{u.issues.join(' · ')}</p>
                        {(() => {
                          const so = unitSignoffs.find(x => x.shift_id === u.shiftId && x.number === u.unit.toUpperCase());
                          return so ? (
                            <div className="flex align-center" style={{ gap: '12px', marginTop: '10px', flexWrap: 'wrap' }}>
                              <img alt={`Signature of ${so.signer_name}`} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(so.signature_svg)}`} style={{ width: '170px', height: '66px', objectFit: 'contain', background: '#fff', border: '1px solid var(--border-color)', borderRadius: '8px' }} />
                              <p className="text-xs text-secondary m-0">Signed by <strong className="text-primary">{so.signer_name}</strong><br />{new Date(so.acknowledged_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                            </div>
                          ) : (
                            <p className="text-xs text-muted" style={{ margin: '8px 0 0' }}>No signed acceptance on record for this shift.</p>
                          );
                        })()}
                        <button type="button" className="comp-edit-btn" style={{ marginTop: '10px' }} onClick={() => openFleetUnit(u.unit)}>Open {u.unit} in Fleet Roadworthiness</button>
                      </div>
                    ))}
                  </div>
                );
              }
              if (alertCategoryFilter === 'risk_signoffs') {
                const contextLabel: Record<string, string> = { coupling: 'when coupling', walkaround: 'during a walk-around check' };
                return riskSignoffs.length === 0 ? (
                  <div className="glass-card">
                    <NoData />
                  </div>
                ) : (
                  <div className="flex flex-col" style={{ gap: '12px' }}>
                    {riskSignoffs.map(r => (
                      <div key={r.id} className="alert-card alert-card--sos">
                        <div className="flex align-center justify-between mb-8">
                          <span className="alert-badge-pill alert-badge-pill--sos">
                            <AlertOctagon size={12} /> Not Roadworthy — Driver Signed
                          </span>
                          <span className="font-mono tabular-nums text-xs text-muted">
                            {new Date(r.acknowledged_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="flex align-center mb-4" style={{ flexWrap: 'wrap', gap: '8px' }}>
                          <span className="font-semibold text-primary" style={{ fontSize: '13.5px' }}>{toTitleCase(r.driver_name ?? '') || 'Unknown Employee'}</span>
                          <span className="font-mono font-bold text-secondary" style={{ fontSize: '12px', textTransform: 'uppercase' }}>{r.vehicle_number ?? ''}</span>
                        </div>
                        <p className="text-xs font-bold" style={{ margin: '0 0 8px', color: 'var(--brand-red)' }}>{r.issues.join(' · ')}</p>
                        <div className="flex align-center" style={{ gap: '14px', flexWrap: 'wrap', marginBottom: '10px' }}>
                          <img
                            alt={`Signature of ${r.signer_name}`}
                            src={`data:image/svg+xml;utf8,${encodeURIComponent(r.signature_svg)}`}
                            style={{ width: '200px', height: '80px', objectFit: 'contain', background: '#fff', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                          />
                          <p className="text-xs text-secondary m-0">
                            Signed by <strong className="text-primary">{r.signer_name}</strong> {contextLabel[r.context] ?? ''},<br />accepting responsibility for taking it on the road.
                          </p>
                        </div>
                        <button type="button" className="alert-ack-btn" onClick={() => markRiskSignoffReviewed(r.id)}>
                          <CheckCircle2 size={13} /> Mark reviewed
                        </button>
                      </div>
                    ))}
                  </div>
                );
              }
              if (alertCategoryFilter === 'holiday_pending') {
                const leaveLabel: Record<string, string> = { annual: 'Annual leave', unpaid: 'Unpaid leave', other: 'Other leave' };
                const dayCount = (start: string, end: string) =>
                  Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000) + 1;
                const shortDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
                return holidayRequests.length === 0 ? (
                  <div className="glass-card">
                    <NoData />
                  </div>
                ) : (
                  <div className="flex flex-col" style={{ gap: '12px' }}>
                    {holidayRequests.map(h => {
                      const days = dayCount(h.start_date, h.end_date);
                      const busy = reviewingHolidayId === h.id;
                      const declining = decliningHolidayId === h.id;
                      return (
                        <div key={h.id} className="alert-card alert-card--idle">
                          <div className="flex align-center justify-between mb-8">
                            <span className="alert-badge-pill alert-badge-pill--idle">
                              <CalendarDays size={12} /> Holiday Request
                            </span>
                            <span className="font-mono tabular-nums text-xs text-muted">
                              Sent {new Date(h.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                            </span>
                          </div>
                          <div className="flex align-center mb-4" style={{ flexWrap: 'wrap', gap: '8px' }}>
                            <span className="font-semibold text-primary" style={{ fontSize: '13.5px' }}>{toTitleCase(h.driver_name ?? '') || 'Unknown Employee'}</span>
                            <span className="font-mono font-bold text-secondary" style={{ fontSize: '12px' }}>
                              {shortDate(h.start_date)}{h.end_date !== h.start_date ? ` – ${shortDate(h.end_date)}` : ''}
                            </span>
                          </div>
                          <p className="text-xs text-secondary" style={{ margin: '0 0 10px' }}>
                            {leaveLabel[h.leave_type] ?? 'Leave'} · {days} day{days === 1 ? '' : 's'}{h.note ? ` — “${h.note}”` : ''}
                          </p>
                          {declining ? (
                            <div className="flex align-center" style={{ gap: '8px', flexWrap: 'wrap' }}>
                              <input
                                type="text"
                                className="input-field"
                                style={{ flex: '1 1 220px', padding: '7px 10px', fontSize: '12.5px' }}
                                placeholder="Reason (optional) — the employee sees this"
                                value={holidayDeclineNote}
                                onChange={e => setHolidayDeclineNote(e.target.value)}
                                autoFocus
                              />
                              <button type="button" className="alert-ack-btn" disabled={busy} onClick={() => reviewHolidayRequest(h.id, 'declined', holidayDeclineNote)}>
                                <CircleX size={13} /> {busy ? 'Declining…' : 'Confirm decline'}
                              </button>
                              <button type="button" className="alert-dismiss-btn" disabled={busy} onClick={() => { setDecliningHolidayId(null); setHolidayDeclineNote(''); }}>
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex align-center" style={{ gap: '8px', flexWrap: 'wrap' }}>
                              <button type="button" className="alert-ack-btn" disabled={busy} onClick={() => reviewHolidayRequest(h.id, 'approved')}>
                                <CheckCircle2 size={13} /> {busy ? 'Approving…' : 'Approve'}
                              </button>
                              <button type="button" className="alert-dismiss-btn" disabled={busy} onClick={() => { setDecliningHolidayId(h.id); setHolidayDeclineNote(''); }}>
                                <CircleX size={12} /> Decline
                              </button>
                              <button type="button" className="comp-edit-btn" onClick={() => setActiveTab('holidays')}>
                                <CalendarDays size={13} /> View calendar
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              }
              if (alertCategoryFilter === 'access_requests') {
                return renderQueueAlertCards(
                  newAccessRequests.map(r => ({
                    key: r.id,
                    driverName: r.company_name,
                    subtitle: r.fleet_size ? `${r.fleet_size} vehicles` : undefined,
                    dateStr: new Date(r.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
                    reasonText: `${r.contact_name} asked for access from the ${r.source === 'website' ? 'website' : 'admin login page'}. No account exists yet.`,
                  })),
                  'No New Access Requests',
                  'Interest buyers from the website and login page will appear here.',
                  'Interest Buyer',
                  'Open Accounts',
                  () => setActiveTab('accounts'),
                );
              }
              if (alertCategoryFilter === 'walkaround') {
                const checkLabel = (type: string) => (type === 'start_of_shift' ? 'start-of-shift check' : 'end-of-shift inspection');
                return renderQueueAlertCards(
                  walkaroundAlertIssues.map(issue => ({
                    key: issue.key,
                    driverName: toTitleCase(issue.shift.driver_name ?? ''),
                    subtitle: issue.shift.vehicle_number ?? undefined,
                    dateStr: new Date(issue.at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
                    reasonText: issue.kind === 'defects'
                      ? `Defects reported on the ${checkLabel(issue.checkType)}${issue.defectNote ? `: "${issue.defectNote}"` : '.'}`
                      : issue.kind === 'rushed'
                      ? `${checkLabel(issue.checkType)[0].toUpperCase()}${checkLabel(issue.checkType).slice(1)} took ${formatCheckDuration(issue.durationSeconds)} — under the ${orgAlertSettings.walkaroundCheckTargetMinutes}-minute target.`
                      : `Skipped the ${checkLabel(issue.checkType)} — no check was submitted for this shift.`,
                  })),
                  'No Walk-Around Issues',
                  `Every driver and mechanic completed their checks in the last 7 days, within the ${orgAlertSettings.walkaroundCheckTargetMinutes}-minute target and with no defects reported.`,
                  'Walk-Around',
                  'Open Walk-Around Checks',
                  () => setActiveTab('walkaround-history'),
                );
              }
              return renderQueueAlertCards(
                parkingExpenses.filter(r => r.status === 'pending').map(r => ({
                  key: r.id,
                  driverName: toTitleCase(r.driver_name ?? ''),
                  subtitle: r.location ?? undefined,
                  dateStr: new Date(r.parking_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
                  reasonText: `£${r.amount.toFixed(2)} — awaiting approval before it's added to payroll.`,
                })),
                'No Parking Claims Pending',
                'Every submitted overnight parking claim has been reviewed.',
                'Awaiting Review',
                'Review Claims',
                () => setIsParkingExpensesModalOpen(true),
              );
            })() : (() => {
              const diffMinsFor = (alert: IdleAlert) => {
                const rawTs = alert.is_sos ? alert.created_at : alert.started_at;
                const ms = rawTs ? new Date(normalizeUtcIso(rawTs)).getTime() : Date.now();
                return Math.max(1, Math.round((Date.now() - ms) / 60000));
              };

              const categoryFiltered = alerts.filter(a => {
                if (alertCategoryFilter === 'sos') return a.is_sos;
                if (alertCategoryFilter === 'idle50') return !a.is_sos && diffMinsFor(a) > 50;
                return true;
              });

              // Unacknowledged first, SOS before idle within that — that's
              // the order that actually needs eyes on it.
              const sortedAlerts = [...categoryFiltered].sort((a, b) => {
                if (Number(a.acknowledged) !== Number(b.acknowledged)) return Number(a.acknowledged) - Number(b.acknowledged);
                if (Boolean(a.is_sos) !== Boolean(b.is_sos)) return a.is_sos ? -1 : 1;
                return 0;
              });

              const renderAlertCard = (alert: IdleAlert) => {
                const diffMins = diffMinsFor(alert);
                const rawTs = alert.is_sos ? alert.created_at : alert.started_at;
                const relativeTime = rawTs ? formatRelativeAlertTime(rawTs) : '--';
                const cardKind: 'sos' | 'idle' | 'resolved' = alert.acknowledged ? 'resolved' : alert.is_sos ? 'sos' : 'idle';

                return (
                  <div key={alert.id} className={`alert-card alert-card--${cardKind} ${cardKind === 'sos' ? 'alert-pulse-card' : ''}`}>
                    <div className="flex align-center justify-between mb-8">
                      <span className={`alert-badge-pill alert-badge-pill--${cardKind}`}>
                        {cardKind === 'resolved' ? <CheckCircle2 size={12} /> : alert.is_sos ? <AlertOctagon size={12} /> : <Clock size={12} />}
                        {alert.is_sos ? 'Emergency SOS' : 'Idle Alert'}
                        {alert.acknowledged && ' · Acknowledged'}
                      </span>
                      <span className="font-mono tabular-nums text-xs text-muted">{relativeTime}</span>
                    </div>

                    <div className="flex align-center mb-4" style={{ flexWrap: 'wrap' }}>
                      <span className="font-semibold text-primary" style={{ fontSize: '13.5px' }}>
                        {alert.driver_name ? toTitleCase(alert.driver_name) : 'Unknown Driver'}
                      </span>
                      {alert.vehicle_number && (
                        <span className="font-mono font-bold text-secondary" style={{ fontSize: '12px', marginLeft: '8px', textTransform: 'uppercase' }}>
                          {alert.vehicle_number}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-secondary" style={{ margin: '0 0 6px' }}>
                      {alert.is_sos
                        ? 'Vehicle breakdown or employee emergency reported.'
                        : `Stationary stop duration threshold exceeded — idle for ${diffMins}m.`}
                    </p>

                    <p className="font-mono text-xs text-muted" style={{ margin: '0 0 10px' }}>
                      GPS: {(alert.latitude || 0).toFixed(6)}, {(alert.longitude || 0).toFixed(6)}
                    </p>

                    <div className="flex align-center" style={{ gap: '8px', flexWrap: 'wrap' }}>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${alert.latitude},${alert.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="comp-edit-btn"
                      >
                        <MapPin size={13} /> Open in Maps
                      </a>
                      {!alert.acknowledged && (
                        <button type="button" className="alert-ack-btn" onClick={() => acknowledgeAlert(alert.id, alert.is_sos)}>
                          <CheckCircle2 size={13} /> Acknowledge
                        </button>
                      )}
                      <button type="button" className="alert-dismiss-btn" onClick={() => clearAlert(alert.id, alert.is_sos)}>
                        <Trash2 size={12} /> Dismiss
                      </button>
                    </div>
                  </div>
                );
              };

              return sortedAlerts.length === 0 ? (
                <div className="glass-card">
                  <NoData />
                </div>
              ) : (
                <div className="flex flex-col" style={{ gap: '12px' }}>
                  {sortedAlerts.map(renderAlertCard)}
                </div>
              );
            })()}
          </div>
        )}

        {/* ── TAB 3: Employee Profiles Management ──────────────── */}
        {activeTab === 'drivers' && (
          <div className="flex-1">
            <div className="flex align-center justify-between mb-24">
              <h2 className="text-xl font-black text-primary m-0">EMPLOYEE DATABASE</h2>

              {/* FlowButton's arrow-flow hover animation reads well as a
                  marketing CTA (Billing's "Buy Now"), not for a plain,
                  frequent, utilitarian action inside a data table — back
                  to a static button matching the rest of this app's
                  buttons. */}
              <div className="flex align-center" style={{ gap: '8px' }}>
                <button type="button" className="payroll-pill-btn" onClick={handleExportEmployees}>
                  <Download size={13} /> Export Drivers
                </button>
                <button type="button" className="payroll-pill-btn" onClick={() => setIsDriverBulkImportOpen(true)}>
                  <UploadCloud size={13} /> Import Data
                </button>
                <button type="button" className="payroll-pill-btn" onClick={() => setIsAddingEmployee(!isAddingEmployee)}>
                  <UserPlus size={13} /> Add Employee
                </button>
              </div>
            </div>

            {/* Add Employee — centered dialog, identity + compensation in
                one form (Compensation Profiles is merged into this table
                now, so a new employee's rate is set at creation instead
                of a separate follow-up step). */}
            {isAddingEmployee && (
              <div
                className="modal-overlay"
                style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                onClick={() => setIsAddingEmployee(false)}
              >
                <div
                  className="modal-content glass-panel"
                  style={{ width: '540px', maxWidth: '100%', maxHeight: '88vh', overflowY: 'auto', padding: '24px', borderRadius: '16px', backgroundColor: 'var(--card-bg)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)', border: '1px solid var(--border-color)' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <h3 className="text-md font-bold text-primary mb-16">Add New Employee Profile</h3>
                  <form onSubmit={handleAddEmployee}>
                    <p className="text-xs font-bold text-muted mb-8" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Identity &amp; App Access</p>
                    <div className="grid grid-cols-2 gap-16 mb-16">
                      <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                        <span className="input-label">EMPLOYEE FULL NAME</span>
                        <div className="login-field">
                          <span className="login-field-icon"><User size={15} /></span>
                          <input
                            type="text"
                            className="login-input"
                            placeholder="John Jones"
                            value={newEmployeeName}
                            onChange={handleNewEmployeeNameChange}
                          />
                        </div>
                      </div>
                      <div className="input-group">
                        <span className="input-label">USERNAME (AUTO-GENERATED)</span>
                        <div className="login-field">
                          <span className="login-field-icon"><IdCard size={15} /></span>
                          <input
                            type="text"
                            className="login-input"
                            placeholder="john.jones"
                            value={newEmployeeCode}
                            onChange={(e) => setNewEmployeeCode(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="input-group">
                        <span className="input-label">PHONE NUMBER</span>
                        <div className="login-field">
                          <span className="login-field-icon"><Phone size={15} /></span>
                          <input
                            type="text"
                            className="login-input"
                            placeholder="+44 7700 900100"
                            value={newEmployeePhone}
                            onChange={(e) => setNewEmployeePhone(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="input-group">
                        <span className="input-label">ROLE</span>
                        <select
                          className="select-field"
                          style={{ width: '100%' }}
                          value={newEmployeeProfession}
                          onChange={(e) => setNewEmployeeProfession(e.target.value as EmployeeProfession)}
                        >
                          <option value="driver">Driver</option>
                          <option value="mechanic">Mechanic</option>
                          <option value="logistics">Dispatcher / Logistics</option>
                        </select>
                      </div>
                      {/* Migration 065: PINs are never set by admins. On
                          save, an activation code is issued and shown
                          once; the driver enters it in the app and
                          picks their own PIN. */}
                      <div className="input-group" style={{ background: 'var(--card-bg-hover)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 12px' }}>
                        <span className="input-label" style={{ margin: 0 }}>APP ACCESS</span>
                        <p className="text-xs text-secondary m-0 mt-4">
                          The employee sets their own PIN. Save this form and we'll show a one-time <strong className="text-primary">activation code</strong> to pass on to them.
                        </p>
                      </div>
                    </div>

                    <p className="text-xs font-bold text-muted mb-8" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>Compensation Setup</p>
                    <div className="grid grid-cols-2 gap-16 mb-16">
                      <div className="input-group">
                        <span className="input-label">RATE TYPE</span>
                        <select
                          className="select-field"
                          style={{ width: '100%' }}
                          value={newEmployeeRateType}
                          onChange={(e) => setNewEmployeeRateType(e.target.value as 'Hourly' | 'Fixed Shift Rate (Day Rate)')}
                        >
                          <option value="Hourly">Hourly (£/hr)</option>
                          <option value="Fixed Shift Rate (Day Rate)">Fixed Shift (£/shift)</option>
                        </select>
                      </div>
                      <div className="input-group">
                        <span className="input-label">BASE RATE (£)</span>
                        <input
                          type="number"
                          step="0.50"
                          className="input-field"
                          style={{ width: '100%' }}
                          value={newEmployeeBaseRate}
                          onChange={(e) => setNewEmployeeBaseRate(e.target.value)}
                        />
                      </div>
                      <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                        <span className="input-label">AGENCY / SUPPLIER</span>
                        <input
                          type="text"
                          className="input-field"
                          style={{ width: '100%' }}
                          placeholder="Direct (In-House), or an agency name"
                          value={newEmployeeAgency}
                          onChange={(e) => setNewEmployeeAgency(e.target.value)}
                        />
                      </div>
                    </div>

                    {crudError && (
                      <div className="text-error text-sm font-semibold mb-16">
                        {crudError}
                      </div>
                    )}

                    <div className="flex gap-8 justify-end mt-16" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                      <button type="button" className="btn btn-secondary" onClick={() => setIsAddingEmployee(false)}>Cancel</button>
                      <button type="submit" className="btn" style={{ backgroundColor: 'var(--brand-red)', color: '#fff', borderColor: 'var(--brand-red)' }}>Save Employee Profile</button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Employee Groups — was three separate badge buttons (one per
                profession); now a single icon trigger, one click, showing
                every worker organised by profession in one panel instead
                of three separate entry points. */}
            <div className="mb-24 flex items-center" style={{ gap: '10px' }}>
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" className="flags-bell-btn" aria-label="View employees by profession">
                    <Users size={16} />
                    <span className="flags-bell-dot">{employees.length}</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[260px] p-1" align="start">
                  {(['driver', 'mechanic', 'logistics'] as EmployeeProfession[]).map(prof => {
                    const group = employees.filter(e => (e.profession ?? 'driver') === prof);
                    const Icon = PROFESSION_ICON[prof];
                    return (
                      <div key={prof}>
                        <div className="flags-review-section-title"><Icon size={11} /> {PROFESSION_LABEL[prof]} ({group.length})</div>
                        {group.length === 0 ? (
                          <div className="flags-review-empty" style={{ padding: '4px 8px 10px' }}>No one assigned yet.</div>
                        ) : (
                          group.map(e => (
                            <div key={e.id} className="flags-review-item" style={{ cursor: 'default' }}>
                              <strong>{e.full_name}</strong>
                            </div>
                          ))
                        )}
                      </div>
                    );
                  })}
                </PopoverContent>
              </Popover>
              <div style={{ flex: 1, maxWidth: '440px' }}>
                <TableFilter groups={[]} className="fg--block" search={{ value: employeeSearch, onChange: setEmployeeSearch, placeholder: 'Search name, driver ID, phone, role…' }} />
              </div>
            </div>

             {/* Employees list table — Compensation Profiles merged in as
                 the COMPENSATION column (rate + breakdown), instead of
                 living as a separate tab. */}
            <div className="table-container" onClick={() => setOpenEmployeeMenuId(null)}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Contact</th>
                    <th>Role &amp; Agency</th>
                    <th>Compensation</th>
                    <th>Status</th>
                    <th>Current Unit</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.filter(e => {
                    const q = employeeSearch.trim().toLowerCase();
                    return !q || `${e.full_name} ${e.driver_id} ${e.phone ?? ''} ${e.profession ?? 'driver'} ${e.is_active ? 'active' : 'inactive'}`.toLowerCase().includes(q);
                  }).map(drv => {
                    // Find latest shift for time tracking. shifts is sorted by
                    // start_time descending, but a stray future-dated row (bad
                    // seed/test data) would otherwise outrank the driver's real
                    // current shift and mask it as "offline" with no clock-out
                    // path. Ignore anything dated after now, then prefer a
                    // genuinely open shift over a completed one.
                    const driverShifts = shifts.filter(s => s.driver_id === drv.id || s.driver_id === drv.driver_id);
                    const now = Date.now();
                    const realShifts = driverShifts.filter(s => new Date(s.start_time).getTime() <= now);
                    const openShift = realShifts.find(s => !s.end_time && s.status !== 'completed');
                    const latestShift = openShift || realShifts[0] || driverShifts[0] || null;
                    const activeShift = (latestShift && !latestShift.end_time && latestShift.status !== 'completed') ? latestShift : null;

                    // Same rate lookup/derivation Compensation Profiles used —
                    // employeeRates is the real, live-loaded source; the
                    // inline defaults only cover a driver with no rate set yet.
                    const currentRate = employeeRates[drv.id] || employeeRates[drv.driver_id] || {
                      driver_id: drv.id,
                      rate_type: (drv as any).rate_type || 'Hourly',
                      mon_fri_rate: Number((drv as any).mon_fri_rate ?? drv.hourly_rate) || 16.00,
                      sat_rate: Number((drv as any).saturday_rate) || 17.00,
                      sun_rate: Number((drv as any).sunday_rate) || 18.00,
                      agency_name: (drv as any).agency_name || (drv as any).agency || 'Direct',
                    };
                    const isFixedRate = Boolean(currentRate.rate_type && currentRate.rate_type.toLowerCase().includes('fixed'));
                    const agency = (drv as any).agency_name || (drv as any).agency || currentRate.agency_name || 'Direct';
                    const rateValue = isFixedRate ? Number(currentRate.fixed_rate || 0) : Number(currentRate.mon_fri_rate || 16.00);
                    const rateBreakdownLabel = isFixedRate
                      ? `£${rateValue.toFixed(2)} / shift`
                      : `Sat £${Number((currentRate as any).saturday_rate ?? (currentRate as any).sat_rate ?? 17).toFixed(2)} · Sun £${Number((currentRate as any).sunday_rate ?? (currentRate as any).sun_rate ?? 18).toFixed(2)}`;
                    const profession = drv.profession ?? 'driver';

                    return (
                      <tr key={drv.id}>
                        <td>
                          <MemberCell name={toTitleCase(drv.full_name)} sub={drv.driver_id} status={activeShift ? 'online' : 'offline'} />
                        </td>
                        <td className="font-mono text-secondary" style={{ fontSize: '12.5px' }}>{drv.phone || '—'}</td>
                        <td>
                          <div className="flex flex-col" style={{ gap: '4px', alignItems: 'flex-start' }}>
                            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 500, background: 'var(--card-bg-hover)', color: 'var(--charcoal-mid)', border: '1px solid var(--border-color)' }}>
                              {PROFESSION_LABEL_SINGULAR[profession]}
                            </span>
                            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 500, background: 'var(--card-bg)', color: 'var(--charcoal-mid)', border: '1px solid var(--border-color)' }}>
                              {agency === 'Direct' ? 'Direct Fleet' : agency}
                            </span>
                          </div>
                        </td>
                        <td>
                          <p className="font-mono font-semibold tabular-nums m-0" style={{ fontSize: '13px', color: 'var(--charcoal)', whiteSpace: 'nowrap' }}>
                            {isFixedRate ? `£${rateValue.toFixed(2)}/shift` : `£${rateValue.toFixed(2)}/hr`}
                          </p>
                          {!isFixedRate && (
                            <span
                              className="font-mono tabular-nums"
                              style={{ display: 'inline-block', marginTop: '4px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', color: 'var(--charcoal-light)', fontSize: '10px', padding: '2px 6px', borderRadius: '4px' }}
                            >
                              {rateBreakdownLabel}
                            </span>
                          )}
                        </td>
                        <td>
                          {activeShift ? (
                            <span className="badge badge-success" style={{ width: 'fit-content' }}>
                              Active (In Progress)
                            </span>
                          ) : (
                            <span className="badge" style={{ width: 'fit-content', background: 'var(--card-bg-hover)', color: 'var(--charcoal-light)', border: '1px solid var(--border-color)' }}>
                              Offline
                            </span>
                          )}
                        </td>
                        <td>
                          {/* Which tractor/trailer this driver is currently in —
                              a single, central place for this instead of
                              scattered across tabs (shifts.vehicle_id/trailer_id,
                              migrations 045/049), matching Live Dispatch and the
                              Driver Hours calendar's own history view. */}
                          {activeShift && (activeShift.vehicle_number || activeShift.trailer_number) ? (
                            <span className="flex flex-col" style={{ gap: '2px' }}>
                              {activeShift.vehicle_number && (
                                <span className="font-mono font-bold" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--charcoal)' }}>{activeShift.vehicle_number}</span>
                              )}
                              {activeShift.trailer_number && (
                                <span className="font-mono" style={{ fontSize: '10.5px', textTransform: 'uppercase', color: 'var(--charcoal-light)' }}>{activeShift.trailer_number}</span>
                              )}
                            </span>
                          ) : activeShift ? (
                            <span className="text-xs text-muted">Unassigned</span>
                          ) : (
                            <span className="text-xs text-muted">—</span>
                          )}
                        </td>
                        <td style={{ position: 'relative', textAlign: 'right' }}>
                          <div className="flex align-center justify-end" style={{ gap: '8px' }}>
                            {activeShift && (
                              <button
                                type="button"
                                className="payroll-mini-btn"
                                onClick={() => { setDispatchDriverId(drv.id); setDispatchMode('assign'); setIsDispatchOpen(true); }}
                                title={`Assign a load to ${toTitleCase(drv.full_name)}`}
                              >
                                <Truck size={12} /> Assign load
                              </button>
                            )}
                            {activeShift ? (
                              <button
                                className="payroll-mini-btn"
                                style={{ background: 'var(--brand-red)', borderColor: 'var(--brand-red)', color: '#fff' }}
                                onClick={() => handleManualClockOut(drv.id, activeShift.id)}
                              >
                                <Clock size={12} /> Clock Out
                              </button>
                            ) : (
                              <button
                                className="payroll-mini-btn"
                                onClick={() => handleManualClockIn(drv.id)}
                                disabled={!drv.is_active}
                                style={!drv.is_active ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                              >
                                <Clock size={12} /> Clock In
                              </button>
                            )}
                            <button className="payroll-mini-btn" onClick={() => openEditEmployeeModal(drv)}>
                              <Pencil size={12} /> Edit
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setOpenEmployeeMenuId(prev => (prev === drv.id ? null : drv.id)); }}
                              aria-label="More actions"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--charcoal-light)', padding: '4px' }}
                            >
                              <MoreVertical size={16} />
                            </button>
                            {openEmployeeMenuId === drv.id && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="glass-panel"
                                style={{
                                  position: 'absolute', right: 0, top: '36px', zIndex: 20, minWidth: '200px',
                                  borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden',
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => { setOpenEmployeeMenuId(null); handleResetPin(drv); }}
                                  className="flex align-center text-sm text-primary"
                                  style={{ gap: '8px', padding: '10px 14px', background: 'none', border: 'none', width: '100%', cursor: 'pointer', textAlign: 'left' }}
                                >
                                  <KeyRound size={13} /> Reset Default PIN
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setOpenEmployeeMenuId(null); toggleEmployeeStatus(drv.id, drv.is_active); }}
                                  className="flex align-center text-sm text-primary"
                                  style={{ gap: '8px', padding: '10px 14px', background: 'none', border: 'none', borderTop: '1px solid var(--border-color)', width: '100%', cursor: 'pointer', textAlign: 'left' }}
                                >
                                  <UserX size={13} /> {drv.is_active ? 'Deactivate Account' : 'Activate Account'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setOpenEmployeeMenuId(null); handleDeleteEmployee(drv.id); }}
                                  className="flex align-center text-sm"
                                  style={{ gap: '8px', padding: '10px 14px', background: 'none', border: 'none', borderTop: '1px solid var(--border-color)', width: '100%', cursor: 'pointer', textAlign: 'left', color: 'var(--brand-red)' }}
                                >
                                  <Trash2 size={13} /> Remove Employee
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {employees.length > 0 && employeeSearch.trim() && !employees.some(e => `${e.full_name} ${e.driver_id} ${e.phone ?? ''} ${e.profession ?? 'driver'} ${e.is_active ? 'active' : 'inactive'}`.toLowerCase().includes(employeeSearch.trim().toLowerCase())) && (
                    <tr><td colSpan={7}><NoData className="py-10" /></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Compliance & Safety overview — dispatch decision center: donut
             + urgent-queue split cards, triage metrics, and the fleet
             readiness/defect-hotspot matrix. Open to both roles. See
             src/pages/Compliance.tsx; requires migration 041. ──────────── */}
        {activeTab === 'compliance' && (
          <Compliance
            organizationId={currentOrgId}
            thresholdDays={orgAlertSettings.complianceAlertLeadDays}
            onViewGroundedAssets={() => setActiveTab('fleet-roadworthiness')}
            onViewAllDefects={() => setActiveTab('compliance-defects')}
          />
        )}

        {/* ── Defect Registry — the full, filterable/paginated defect
             list the Overview's compact 4-row inbox links out to. ───── */}
        {activeTab === 'compliance-defects' && !tabLocked && (
          <ComplianceDefects
            organizationId={currentOrgId}
            focusUnit={defectFocus}
            onBack={() => setActiveTab('compliance')}
          />
        )}

        {/* ── Walk-Around Check History — every start/end-of-shift vehicle
             check with how long it took, reached via the Compliance &
             Safety accordion. ──────────────────────────────────────── */}
        {activeTab === 'walkaround-history' && (
          <WalkAroundHistory
            organizationId={currentOrgId}
            targetMinutes={orgAlertSettings.walkaroundCheckTargetMinutes}
            shifts={shifts}
            onBack={() => setActiveTab('compliance')}
          />
        )}

        {activeTab === 'holidays' && (
          <EmployeeHolidays
            organizationId={currentOrgId}
            onReviewRequest={reviewHolidayRequest}
            onBack={() => setActiveTab('drivers')}
          />
        )}

        {/* Platform owner only — interest buyers + every customer account. */}
        {activeTab === 'accounts' && isPlatformAdmin && (
          <PlatformAccounts currentOrgId={currentOrgId} onChanged={loadNewAccessRequests} />
        )}

        {/* ── Fleet Roadworthiness — MOT/PMI/VOR asset register, reached
             via the Compliance & Safety hover flyout. ─────────────────── */}
        {activeTab === 'fleet-roadworthiness' && (
          <FleetRoadworthiness
            organizationId={currentOrgId}
            onAlertCountChange={setFleetAlertCount}
            focusUnit={fleetFocus}
            onOpenUnitStatus={openUnitStatus}
            thresholdDays={orgAlertSettings.complianceAlertLeadDays}
            onOpenAlertSettings={() => {
              setActiveSettingsSection('alerts');
              setSettingsModalOpen(true);
            }}
          />
        )}

        {/* ── Driver Hours & WTD — duty monitor, reached via the
             Compliance & Safety hover flyout. ──────────────────────── */}
        {activeTab === 'driver-hours' && !tabLocked && (
          <DriverHours
            organizationId={currentOrgId}
            onAlertCountChange={setWtdAlertCount}
            liveLocations={liveLocations}
            depots={depots}
            onViewRouteHistory={() => setActiveTab('live')}
          />
        )}

        {isDispatchOpen && <DispatchLoadsModal mode={dispatchMode} drivers={employees} initialDriverId={dispatchDriverId} onChanged={loadDispatchBoard} onOpenSettlement={() => { setIsDispatchOpen(false); setDispatchDriverId(''); setIsImportModalOpen(true); }} onClose={() => { setIsDispatchOpen(false); setDispatchDriverId(''); }} />}

        {isImportModalOpen && (
          <CarrierSettlementImportModal
            organizationId={currentOrgId}
            onClose={() => setIsImportModalOpen(false)}
            onImported={() => loadData()}
          />
        )}

        {isDriverBulkImportOpen && (
          <DriverBulkImportModal
            existingDriverIds={employees.map(e => e.driver_id)}
            onClose={() => setIsDriverBulkImportOpen(false)}
            onImported={() => loadData()}
          />
        )}

        {/* ── TAB 4: Compensation Summary (Payroll Admin Only) ───── */}
        {tabLocked && tabFeature && (
          <LockedFeature featureLabel={FEATURE_LABEL[tabFeature]} planLabel={entitlements?.plan_label ?? 'current'} companyName={teamOrgInfo?.name} />
        )}

        {activeTab === 'rates' && userRole === 'payroll_admin' && !tabLocked && (
          <div className="flex-1">
            {/* Compensation Profiles is merged into Employee Database now
                (see the `drivers` tab) — this tab is purely the payroll-
                review route the task asked to keep standalone. Its own
                "Section header" below (Compensation Summary) already
                covers the page title, so there's no separate outer
                heading here anymore. */}
            {(() => {
          const filteredShifts = getFilteredShifts();
          const totalEarnings = filteredShifts.reduce((sum, shift) => {
            const { grossPay } = getShiftFinancials(shift);
            return sum + grossPay;
          }, 0);
          const totalHours = filteredShifts.reduce((sum, s) => {
            const { liveHours } = getShiftFinancials(s);
            return sum + (liveHours || 0);
          }, 0);
          const totalNightOutAmount = filteredShifts.reduce((sum, shift) => sum + (Number(shift.night_out_allowance ?? shift.night_out_amount) || 0), 0);
          const nightOutCount = filteredShifts.filter(shift => (Number(shift.night_out_allowance ?? shift.night_out_amount) || 0) > 0).length;

          // Flags & Reviews — hoisted above the header (rather than left
          // inline near the table, where it used to render as three
          // permanently-visible banners) so the header's hover/click
          // panel can read it. Same three categories, same underlying
          // filteredShifts, just surfaced through one compact control
          // instead of stacked full-width alert boxes.
          const flaggedShifts = filteredShifts.filter(shift => {
            const end = shift.end_time ? new Date(shift.end_time).getTime() : Date.now();
            const start = new Date(shift.start_time).getTime();
            const durationHours = (end - start) / (1000 * 60 * 60);
            return durationHours > orgAlertSettings.longShiftFlagHours;
          });

          interface NightOutSuggestion {
            driverId: string;
            driverName: string;
            prevEnd: string;
            nextStart: string;
            gapHours: string;
          }
          const nightOutSuggestions: NightOutSuggestion[] = [];
          const employeeGroups: Record<string, typeof filteredShifts> = {};
          filteredShifts.forEach(shift => {
            if (!employeeGroups[shift.driver_id]) employeeGroups[shift.driver_id] = [];
            employeeGroups[shift.driver_id].push(shift);
          });
          Object.keys(employeeGroups).forEach(driverId => {
            const dShifts = employeeGroups[driverId].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
            for (let i = 0; i < dShifts.length - 1; i++) {
              const currentShift = dShifts[i];
              const nextShift = dShifts[i + 1];
              if (currentShift.end_time && nextShift.start_time) {
                const gapMs = new Date(nextShift.start_time).getTime() - new Date(currentShift.end_time).getTime();
                const gapHours = gapMs / (1000 * 60 * 60);
                if (gapHours >= orgAlertSettings.nightOutMinGapHours && gapHours <= orgAlertSettings.nightOutMaxGapHours) {
                  nightOutSuggestions.push({
                    driverId,
                    driverName: currentShift.driver_name || 'Driver',
                    prevEnd: currentShift.end_time,
                    nextStart: nextShift.start_time,
                    gapHours: gapHours.toFixed(1),
                  });
                }
              }
            }
          });

          const weekBoundaryAlerts = filteredShifts.filter(shift => shift.is_week_boundary && shift.boundary_label?.includes('Part 1'));
          const totalFlagCount = flaggedShifts.length + nightOutSuggestions.length + weekBoundaryAlerts.length;

          // Collect unique agencies for filter dropdown
          const agencies = Array.from(new Set(Object.values(employeeRates).map(r => r.agency_name || 'Direct')));

          const selectDriver = (driverId: string, _driverName?: string) => {
            setReportEmployeeFilter(driverId);
          };

          const clearDriverFilter = () => {
            setReportEmployeeFilter('all');
          };

          return (
            <div>
              {/* -- Section header ---------------------------------- */}
              <div className="flex align-center justify-between mb-24" style={{ flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 className="text-xl font-black text-primary m-0">Compensation Summary</h2>
                  <p className="text-xs text-muted mt-4">Shift-by-shift earnings, Night Out allowances, and exports for the selected period</p>
                </div>

              </div>

              {/* -- Filter bar --------------------------------------- */}
              <div className="payroll-filter-bar">
                <div className="payroll-filter-field">
                  <span className="input-label">Filters</span>
                  <TableFilter
                    groups={[
                      {
                        key: 'agency', label: 'Agency', single: true, neutral: 'all',
                        options: [{ value: 'all', label: 'All Agencies' }, ...agencies.map(ag => ({ value: ag, label: ag }))],
                        selected: [reportAgencyFilter],
                        onChange: (v) => setReportAgencyFilter(v[0] ?? 'all'),
                      },
                      {
                        key: 'driver', label: 'Driver', single: true, neutral: 'all',
                        options: [{ value: 'all', label: 'All Drivers' }, ...employees.map(d => ({ value: d.id, label: d.full_name }))],
                        selected: [reportEmployeeFilter],
                        onChange: (v) => {
                          const id = v[0] ?? 'all';
                          if (id === 'all') clearDriverFilter();
                          else selectDriver(id, employees.find(d => d.id === id)?.full_name ?? '');
                        },
                      },
                      {
                        key: 'nightout', label: `Night Out${pendingNightOutsCount > 0 ? ` (${pendingNightOutsCount})` : ''}`, single: true, neutral: 'all',
                        options: [{ value: 'all', label: 'All shifts' }, { value: 'requested', label: 'N/O requests only' }],
                        selected: [showOnlyNightOutRequested ? 'requested' : 'all'],
                        onChange: (v) => setShowOnlyNightOutRequested(v[0] === 'requested'),
                      },
                    ]}
                    search={{ value: summarySearch, onChange: setSummarySearch, placeholder: 'Search employee, agency, depot, vehicle…' }}
                  />
                </div>

                <div className="payroll-filter-field" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                  <EarningsDateRangePicker compact
                    startDate={reportDateStart}
                    endDate={reportDateEnd}
                    onChange={(start, end) => { setReportDateStart(start); setReportDateEnd(end); }}
                  />
                  {/* Flags & Reviews — a notification-bell icon button
                      instead of a text pill; click (not hover) opens the
                      same categorized list (Critical Anomalies / Night
                      Outs Detected / Week Boundary Splits). Each item is
                      still clickable through to that driver's Detailed
                      View row. */}
                  <Popover open={flagsMenuOpen} onOpenChange={setFlagsMenuOpen}>
                    <PopoverTrigger asChild>
                      <button type="button" className="flags-bell-btn" aria-label="Flags & Reviews">
                        <NotificationIcon on={totalFlagCount > 0} size={16} />
                        {totalFlagCount > 0 && <span className="flags-bell-dot">{totalFlagCount > 9 ? '9+' : totalFlagCount}</span>}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[320px] p-1" align="start">
                      {totalFlagCount === 0 ? (
                        <div className="flags-review-empty">Nothing flagged for this period.</div>
                      ) : (
                        <>
                          {flaggedShifts.length > 0 && (
                            <>
                              <div className="flags-review-section-title"><AlertOctagon size={11} /> Critical Anomalies (&gt;{orgAlertSettings.longShiftFlagHours}h)</div>
                              {flaggedShifts.map(fs => (
                                <button
                                  type="button"
                                  key={fs.id}
                                  className="flags-review-item"
                                  onClick={() => { setReportViewMode('detailed'); selectDriver(fs.driver_id, fs.driver_name || 'Driver'); setFlagsMenuOpen(false); }}
                                >
                                  <strong>{fs.driver_name}</strong> — started {new Date(fs.start_time).toLocaleString()} — <em>clock-out missing or invalid</em>
                                </button>
                              ))}
                            </>
                          )}
                          {nightOutSuggestions.length > 0 && (
                            <>
                              <div className="flags-review-section-title"><Moon size={11} /> Night Outs Detected</div>
                              {nightOutSuggestions.map((no, idx) => (
                                <button
                                  type="button"
                                  key={idx}
                                  className="flags-review-item"
                                  onClick={() => { setReportViewMode('detailed'); selectDriver(no.driverId, no.driverName); setFlagsMenuOpen(false); }}
                                >
                                  <strong>{no.driverName}</strong> — {no.gapHours}h break between {new Date(no.prevEnd).toLocaleDateString()} and {new Date(no.nextStart).toLocaleDateString()}
                                </button>
                              ))}
                            </>
                          )}
                          {weekBoundaryAlerts.length > 0 && (
                            <>
                              <div className="flags-review-section-title"><AlertTriangle size={11} /> Week Boundary Splits</div>
                              {weekBoundaryAlerts.map(fs => (
                                <button
                                  type="button"
                                  key={fs.id}
                                  className="flags-review-item"
                                  onClick={() => { setReportViewMode('detailed'); selectDriver(fs.driver_id, fs.driver_name || 'Driver'); setFlagsMenuOpen(false); }}
                                >
                                  <strong>{fs.driver_name}</strong> — <em>shift crossed Sunday midnight, auto-split for payroll</em>
                                </button>
                              ))}
                            </>
                          )}
                        </>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* -- Action row: view menu (left), bulk edit, Export menu (right) ------ */}
              <div className="payroll-action-row">
                <div className="payroll-action-group">
                  <Popover open={summaryMenuOpen} onOpenChange={setSummaryMenuOpen}>
                    <PopoverTrigger asChild>
                      <button type="button" className="payroll-pill-btn payroll-pill-btn--outline">
                        {reportViewMode === 'detailed' ? <ListChecks size={13} /> : <BarChart3 size={13} />}
                        {reportViewMode === 'detailed' ? 'Detailed View' : reportViewMode === 'weekly' ? 'Weekly Summary' : 'Monthly Summary'}
                        <ChevronDown size={13} />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[200px] p-1" align="start">
                      <button
                        type="button"
                        onClick={() => { setReportViewMode('detailed'); setSummaryMenuOpen(false); }}
                        className="flex items-center gap-2 w-full text-sm"
                        style={{ padding: '8px 10px', borderRadius: '6px', border: 'none', background: reportViewMode === 'detailed' ? 'var(--brand-red-light)' : 'transparent', color: reportViewMode === 'detailed' ? 'var(--brand-red)' : 'var(--charcoal)', fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
                      >
                        <ListChecks size={13} /> Detailed View
                      </button>
                      <button
                        type="button"
                        onClick={() => { setReportViewMode('weekly'); setSummaryMenuOpen(false); }}
                        className="flex items-center gap-2 w-full text-sm"
                        style={{ padding: '8px 10px', borderRadius: '6px', border: 'none', background: reportViewMode === 'weekly' ? 'var(--brand-red-light)' : 'transparent', color: reportViewMode === 'weekly' ? 'var(--brand-red)' : 'var(--charcoal)', fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
                      >
                        <BarChart3 size={13} /> Weekly Summary
                      </button>
                      <button
                        type="button"
                        onClick={() => { setReportViewMode('monthly'); setSummaryMenuOpen(false); }}
                        className="flex items-center gap-2 w-full text-sm"
                        style={{ padding: '8px 10px', borderRadius: '6px', border: 'none', background: reportViewMode === 'monthly' ? 'var(--brand-red-light)' : 'transparent', color: reportViewMode === 'monthly' ? 'var(--brand-red)' : 'var(--charcoal)', fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
                      >
                        <BarChart3 size={13} /> Monthly Summary
                      </button>
                    </PopoverContent>
                  </Popover>
                </div>

                {reportViewMode === 'detailed' && (
                  <div className="payroll-bulk-bar" style={{ flex: 1 }}>
                    {selectedShiftIds.size > 0 ? (
                      <>
                        <span className="payroll-selected">{selectedShiftIds.size} selected</span>
                        <button
                          className="payroll-edit-selected"
                          onClick={() => openActionModal('bulk', Array.from(selectedShiftIds), 'Bulk Update')}
                        >
                          Edit selected
                        </button>
                        <button className="payroll-clear-selection" onClick={() => setSelectedShiftIds(new Set())} aria-label="Clear selection" title="Clear selection">
                          <X size={14} />
                        </button>
                      </>
                    ) : null}
                  </div>
                )}

                {/* Import (left of Export): the template fill is chosen from its menu. */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" className="payroll-pill-btn" style={{ marginLeft: 'auto' }}>
                      <UploadCloud size={13} /> Import <ChevronDown size={13} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[220px] p-1" align="end">
                    <button
                      type="button"
                      onClick={() => setFillTemplateOpen(true)}
                      className="flex items-center gap-2 w-full text-sm"
                      style={{ padding: '8px 10px', borderRadius: '6px', border: 'none', background: 'transparent', color: 'var(--charcoal)', fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
                    >
                      <FileSpreadsheet size={13} /> Fill in the template
                    </button>
                  </PopoverContent>
                </Popover>

                {/* One Export button: the format is chosen from its menu. */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" className="payroll-pill-btn">
                      <Download size={13} /> Export <ChevronDown size={13} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[220px] p-1" align="end">
                    {([
                      ['Export CSV', <DownloadIcon key="c" done={justExported === 'csv'} />, exportCSV],
                      ['Export Excel', <FileSpreadsheet key="x" size={13} />, exportExcel],
                      ['Export Summary', <BarChart3 key="s" size={13} />, handleExportSummaryCSV],
                    ] as [string, React.ReactNode, () => void][]).map(([label, icon, run]) => (
                      <button
                        key={label}
                        type="button"
                        onClick={run}
                        className="flex items-center gap-2 w-full text-sm"
                        style={{ padding: '8px 10px', borderRadius: '6px', border: 'none', background: 'transparent', color: 'var(--charcoal)', fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
                      >
                        {icon} {label}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
              </div>

              {/* -- Reports Payroll Data Table / Dual View ----------- */}
              {reportViewMode !== 'detailed' ? (
                <>
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Employee</th>
                          <th>Agency</th>
                          <th>{reportViewMode === 'weekly' ? 'Week' : 'Month'}</th>
                          <th>Shifts Logged</th>
                          <th>Total Hours</th>
                          <th>Night Outs</th>
                          <th>Total Extras</th>
                          <th style={{ textAlign: 'right' }}>Total Gross Pay</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          // One row per employee per week (Monday to Sunday) or per month.
                          const periodOf = (iso: string): { key: string; label: string } => {
                            const d = new Date(iso);
                            if (reportViewMode === 'monthly') {
                              return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) };
                            }
                            const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
                            return { key: `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`, label: `w/c ${mon.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}` };
                          };
                          const summaryData: any = {};
                          filteredShifts.forEach(shift => {
                             const { grossPay, noAmt, extrasAmt, liveHours } = getShiftFinancials(shift);
                             const id = shift.driver_id;
                             const period = periodOf(shift.start_time);
                             const rowKey = `${id}|${period.key}`;
                             if (!summaryData[rowKey]) {
                                 summaryData[rowKey] = {
                                     driver_name: shift.driver_name,
                                     driver_code: shift.driver_code,
                                     agency: employeeRates[id]?.agency_name || 'Direct',
                                     period: period.label,
                                     periodKey: period.key,
                                     total_hours: 0,
                                     total_gross: 0,
                                     total_night_outs: 0,
                                     total_extras: 0,
                                     shift_count: 0
                                 };
                             }
                             summaryData[rowKey].total_hours += liveHours;
                             summaryData[rowKey].total_gross += grossPay;
                             summaryData[rowKey].total_extras += extrasAmt;
                             summaryData[rowKey].total_night_outs += (noAmt > 0 ? 1 : 0);
                             // Prevent double counting split shifts
                             if (!shift.is_week_boundary || shift.boundary_label?.includes('Part 1')) {
                                 summaryData[rowKey].shift_count += 1;
                             }
                          });

                          const rows = (Object.values(summaryData) as any[]).sort((a, b) => b.periodKey.localeCompare(a.periodKey) || String(a.driver_name).localeCompare(String(b.driver_name)));
                          if (rows.length === 0) return (
                            <tr>
                              <td colSpan={8}>
                                <NoData />
                              </td>
                            </tr>
                          );

                          return rows.map((row: any) => (
                             <tr key={`${row.driver_code}|${row.periodKey}`}>
                                <td><MemberCell name={toTitleCase(row.driver_name || 'Driver')} sub={row.driver_code} /></td>
                                <td><span className="payroll-agency-badge">{row.agency}</span></td>
                                <td className="text-sm font-semibold">{row.period}</td>
                                <td className="font-semibold">{row.shift_count}</td>
                                <td>{row.total_hours.toFixed(2)} hrs</td>
                                <td>{row.total_night_outs > 0 ? <span className="text-success font-bold">+{row.total_night_outs} (N/O)</span> : '—'}</td>
                                <td>{row.total_extras !== 0 ? <span className="text-primary font-bold">£{row.total_extras.toFixed(2)}</span> : '—'}</td>
                                <td className="font-black text-success text-md" style={{ textAlign: 'right' }}>£{row.total_gross.toFixed(2)}</td>
                             </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>

                  <div className="payroll-totals-bar">
                    <span className="payroll-totals-label">
                      GRAND TOTAL: ({filteredShifts.length} completed shifts | {nightOutCount} Night Outs)
                    </span>
                    <div className="payroll-totals-stats">
                      <div className="payroll-stat">
                        <div className="payroll-stat-label">Total Tracked Hours</div>
                        <div className="payroll-stat-value">{(totalHours || 0).toFixed(2)} hrs</div>
                      </div>
                      <div className="payroll-stat">
                        <div className="payroll-stat-label">Total Gross Pay</div>
                        <div className="payroll-stat-value payroll-stat-value--money">
                          £{totalEarnings.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Same grid-based table look as Compensation Profiles
                      (Contacts Table With Modal adaptation) — rounded
                      card, uppercase grid header, bordered rows — applied
                      here as a wrapper swap only. Every function already
                      in this table (bulk select-all, per-row checkboxes,
                      priority row tinting, multi-day schedule formatting,
                      stuck-shift/N-O/flag badges, Force Clock Out / Time /
                      Edit Payroll actions, gross pay) is unchanged. */}
                  {(() => {
                    const allShiftsSelected = filteredShifts.length > 0 && selectedShiftIds.size === new Set(filteredShifts.map(s => s.real_id || s.id)).size;
                    return (
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th style={{ width: '36px', textAlign: 'center' }}>
                            <input
                               type="checkbox"
                               style={{ cursor: 'pointer', width: '15px', height: '15px' }}
                               checked={allShiftsSelected}
                               onChange={(e) => {
                                  if (e.target.checked) {
                                      setSelectedShiftIds(new Set(filteredShifts.map(s => s.real_id || s.id)));
                                  } else {
                                      setSelectedShiftIds(new Set());
                                  }
                               }}
                            />
                          </th>
                          <th>Driver Name</th>
                          <th>Fleet Agency</th>
                          <th>Shift Schedule</th>
                          <th>Hours</th>
                          <th>Hourly Rate</th>
                          <th>Night Out</th>
                          <th>Flags &amp; Actions</th>
                          <th style={{ textAlign: 'right' }}>Gross Pay (£)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredShifts.length === 0 ? (
                          <tr><td colSpan={9}><NoData /></td></tr>
                        ) : (
                          filteredShifts.map(shift => {
                            const {
                              startRateVal,
                              endRateVal,
                              startDay,
                              endDay,
                              isFixedRate,
                              noAmt: noAmount,
                              grossPay: shiftGrossPay,
                              agency,
                              liveHours,
                              isMicroShift,
                            } = getShiftFinancials(shift);

                            const shiftEndMs = shift.end_time ? new Date(shift.end_time).getTime() : Date.now();
                            const shiftStartMs = new Date(shift.start_time).getTime();
                            const isFlagged = ((shiftEndMs - shiftStartMs) / (1000 * 60 * 60)) > orgAlertSettings.longShiftFlagHours;

                            // An "ongoing" shift (no end_time) whose driver has since started a
                            // NEWER shift is not actually in progress — it's a session that was
                            // never properly closed (app killed, phone died, lost connection
                            // before the clock-out call went through). Driver Profiles only
                            // looks at each driver's single latest shift, so it correctly shows
                            // them offline; this table iterates every row, so without this check
                            // the abandoned row keeps rendering as "currently active" forever.
                            // A future-dated "newer" shift (bad seed/test data) doesn't count —
                            // it hasn't actually happened yet, so it can't be why this one got
                            // abandoned, and would otherwise flag every real open shift as stuck.
                            const isStaleOrphan = !shift.end_time && shifts.some(other =>
                              other.driver_id === shift.driver_id &&
                              other.id !== shift.id &&
                              new Date(other.start_time).getTime() > shiftStartMs &&
                              new Date(other.start_time).getTime() <= Date.now()
                            );

                            const isRequested =
                              shift.night_out_requested === true ||
                              (shift as any).has_requested_night_out === true ||
                              shift.night_out_status === 'pending';

                            const hasNightOut = noAmount > 0 || isRequested;
                            const hasExtras = Boolean(shift.extras_amount && shift.extras_amount !== 0);

                            // Determine row background color based on priority
                            let rowStyle: React.CSSProperties = {};
                            if (isStaleOrphan) {
                              rowStyle = { backgroundColor: 'rgba(139, 92, 246, 0.08)' }; // Violet tint — data issue, not a pay flag
                            } else if (isFlagged) {
                              rowStyle = { backgroundColor: 'rgba(239, 68, 68, 0.08)' }; // Red tint
                            } else if (hasNightOut) {
                              rowStyle = { backgroundColor: 'rgba(245, 158, 11, 0.08)' }; // Orange tint
                            } else if (hasExtras) {
                              rowStyle = { backgroundColor: 'rgba(59, 130, 246, 0.08)' }; // Blue tint
                            }

                            return (
                              <tr key={shift.id} style={rowStyle}>
                                <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
                                  <input
                                    type="checkbox"
                                    style={{ cursor: 'pointer', width: '15px', height: '15px' }}
                                    checked={selectedShiftIds.has(shift.real_id || shift.id)}
                                    onChange={(e) => {
                                        const newSet = new Set(selectedShiftIds);
                                        const targetId = shift.real_id || shift.id;
                                        if (e.target.checked) newSet.add(targetId);
                                        else newSet.delete(targetId);
                                        setSelectedShiftIds(newSet);
                                    }}
                                  />
                                </td>
                                <td>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <MemberCell name={shift.driver_name ? toTitleCase(shift.driver_name) : '—'} />
                                    {isRequested && (
                                      <span className="badge badge-warning text-xs font-bold" style={{ alignSelf: 'flex-start', padding: '2px 6px', fontSize: '10px' }}>
                                        N/O REQUESTED
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td>
                                  <span className="payroll-agency-badge">{agency}</span>
                                </td>
                                <td>
                                  {(() => {
                                    const startObj = new Date(shift.start_time);
                                    const endObj = shift.end_time ? new Date(shift.end_time) : null;

                                    const startDateStr = startObj.toLocaleDateString();
                                    const startTimeStr = startObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                                    let endDateStr = '';
                                    let endTimeStr = 'Ongoing';

                                    if (endObj) {
                                      endDateStr = endObj.toLocaleDateString();
                                      endTimeStr = endObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                    }

                                    if (endObj && startDateStr !== endDateStr) {
                                      // Multi-day format rendering
                                      return (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                          <span style={{ fontSize: '11.5px', fontWeight: '600' }}>
                                            {startDateStr} <span style={{ fontWeight: 'normal', color: 'var(--charcoal-light)' }}>{startTimeStr}</span>
                                          </span>
                                          <span style={{ fontSize: '11.5px', fontWeight: '600' }}>
                                            {endDateStr} <span style={{ fontWeight: 'normal', color: 'var(--charcoal-light)' }}>{endTimeStr}</span>
                                          </span>
                                        </div>
                                      );
                                    } else {
                                      // Single-day format rendering
                                      return (
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                          <span style={{ fontSize: '12.5px', fontWeight: 'bold' }}>{startDateStr}</span>
                                          <span className="text-xs text-muted" style={{ fontSize: '11px' }}>{startTimeStr} - {endTimeStr}</span>
                                        </div>
                                      );
                                    }
                                  })()}
                                </td>
                                <td className="font-mono tabular-nums text-secondary" style={{ fontSize: '12px' }}>
                                  {shift.end_time ? (
                                    formatHoursMinutes(shift.total_hours || 0)
                                  ) : isStaleOrphan ? (
                                    <span className="font-bold" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--brand-red)' }}>
                                      <span style={{ width: '6px', height: '6px', backgroundColor: 'var(--brand-red)', borderRadius: '50%', display: 'inline-block' }}></span>
                                      {formatHoursMinutes(liveHours)} (stuck)
                                    </span>
                                  ) : (
                                    <span className="text-success font-bold" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <span style={{ width: '6px', height: '6px', backgroundColor: '#2E7D32', borderRadius: '50%', display: 'inline-block', boxShadow: '0 0 6px rgba(46, 125, 50, 0.6)' }}></span>
                                      {formatHoursMinutes(liveHours)}
                                    </span>
                                  )}
                                  {isMicroShift && (
                                    <span className="badge badge-accent" style={{ display: 'block', width: 'fit-content', marginTop: '4px', fontSize: '9px' }}>
                                      Ignored Test Shift
                                    </span>
                                  )}
                                </td>
                                <td className="font-mono tabular-nums" style={{ fontSize: '12.5px', color: 'var(--charcoal)' }}>
                                  {isFixedRate ? (
                                    <span>
                                      £{startRateVal.toFixed(2)} <span style={{ fontSize: '10.5px', fontWeight: 'normal', color: 'var(--charcoal-light)' }}>(Fixed/Shift)</span>
                                    </span>
                                  ) : startDay !== endDay && startRateVal !== endRateVal ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                       <span>£{startRateVal.toFixed(2)}/hr</span>
                                       <span style={{ fontSize: '10.5px', color: 'var(--charcoal-light)' }}>→ £{endRateVal.toFixed(2)}/hr</span>
                                    </div>
                                  ) : (
                                    <span>£{startRateVal.toFixed(2)}/hr</span>
                                  )}
                                </td>
                                <td>
                                  {noAmount > 0 ? (
                                    <span className="badge badge-success font-bold">
                                      +£{noAmount.toFixed(2)} N/O
                                    </span>
                                  ) : (
                                    <span className="text-muted text-xs">—</span>
                                  )}
                                </td>
                                <td>
                                  <div className="flex align-center gap-6" style={{ flexWrap: 'wrap' }}>
                                    {shift.is_week_boundary && (
                                      <span className="badge badge-warning text-xs" style={{ padding: '2px 6px', fontWeight: 'bold', marginRight: '6px' }}>
                                        SPLIT
                                      </span>
                                    )}
                                    {isFlagged && <span className="badge badge-danger text-xs">&gt;{orgAlertSettings.longShiftFlagHours}h</span>}
                                    {isStaleOrphan && (
                                      <span
                                        className="badge badge-danger text-xs font-bold"
                                        title="This driver has a newer shift — this one was never closed and is not actually in progress."
                                      >
                                        ⚠ STUCK — NEVER CLOCKED OUT
                                      </span>
                                    )}
                                    {!shift.end_time && (
                                      <button
                                        className="payroll-mini-btn"
                                        style={isStaleOrphan ? { borderColor: 'rgba(204, 0, 0, 0.3)', color: 'var(--brand-red)' } : undefined}
                                        onClick={() => handleManualClockOut(shift.driver_id, shift.real_id || shift.id)}
                                      >
                                        <LogOut size={11} /> FORCE CLOCK OUT
                                      </button>
                                    )}
                                    <button
                                      className="payroll-mini-btn"
                                      onClick={() => handleEditShiftTime(shift.real_id || shift.id, shift.start_time, shift.end_time)}
                                    >
                                      <Clock size={11} /> TIME
                                    </button>

                                    <button
                                      className="payroll-mini-btn"
                                      onClick={() => openActionModal(
                                        'single',
                                        [shift.real_id || shift.id],
                                        shift.driver_name || 'Driver',
                                        Number(shift.extras_amount) || 0,
                                        shift.extras_note || '',
                                        Number(shift.night_out_allowance ?? shift.night_out_amount ?? 0),
                                        shift
                                      )}
                                    >
                                      <FileText size={11} /> EDIT PAYROLL
                                    </button>
                                    {shift.extras_note && (
                                      <div className="text-xs italic mt-1" style={{ fontSize: '11px', color: 'var(--charcoal-light)', fontStyle: 'italic', width: '100%' }}>
                                        Note: {shift.extras_note}
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="font-mono font-semibold tabular-nums" style={{ fontSize: '13.5px', textAlign: 'right', color: shiftGrossPay > 0 ? 'var(--charcoal)' : 'var(--charcoal-light)' }}>
                                  £{shiftGrossPay.toFixed(2)}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                    );
                  })()}

                  <div className="payroll-totals-bar">
                    <span className="payroll-totals-label">
                      TOTALS FOR SELECTED PERIOD: ({filteredShifts.length} completed shifts | {nightOutCount} Night Outs: £{totalNightOutAmount.toFixed(2)})
                    </span>
                    <div className="payroll-totals-stats">
                      <div className="payroll-stat">
                        <div className="payroll-stat-label">Total Tracked Hours</div>
                        <div className="payroll-stat-value">{(totalHours || 0).toFixed(2)} hrs</div>
                      </div>
                      <div className="payroll-stat">
                        <div className="payroll-stat-label">Total Gross Pay</div>
                        <div className="payroll-stat-value payroll-stat-value--money">
                          £{totalEarnings.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          );
            })()}
          </div>
        )}

        {!tabLocked && (activeTab === 'analytics' || (activeTab === 'shipments' && userRole === 'payroll_admin')) && (() => {
          const resolveAgency = (emp: typeof employees[number]) => {
            const currentRate = employeeRates[emp.id] || employeeRates[emp.driver_id];
            return (emp as any).agency_name || (emp as any).agency || currentRate?.agency_name || 'Direct';
          };

          // Filter option lists are built from real, currently-loaded data —
          // not hardcoded enums like the reference's Status/Priority/Labels —
          // since which drivers and agencies exist is genuinely per-company.
          const driverFilterOptions: FilterOption[] = employees.map(e => ({ name: e.full_name }));
          const agencyFilterOptions: FilterOption[] = Array.from(new Set(employees.map(resolveAgency))).map(name => ({ name }));
          const depotOptionNames = Array.from(new Set([...depots.map(d => d.name), ...shifts.map(s => s.depot_name).filter((n): n is string => !!n)]));
          const depotFilterOptions: FilterOption[] = depotOptionNames.map(name => ({ name }));
          // "This Week"/"This Month" are real calendar-boundary cutoffs
          // (see NAMED_PERIOD_CUTOFFS below); "Last N weeks" stay rolling
          // windows from now, as before. Both feed the same open-ended
          // periodCutoff lower bound — a closed "Last Week" range would
          // need an upper bound the rest of this filter doesn't support
          // yet, so it's deliberately left out rather than half-built.
          const PERIOD_WEEKS: Record<string, number | null> = {
            'Last 30 days': null, 'This Week': null, 'This Month': null,
            'Last 4 weeks': 4, 'Last 8 weeks': 8, 'Last 12 weeks': 12, 'This Year': null, 'Custom range': null, 'All time': null,
          };
          const startOfTodayForPeriod = new Date();
          startOfTodayForPeriod.setHours(0, 0, 0, 0);
          // Weeks start on Sunday (the company's payroll week).
          const startOfThisWeek = new Date(startOfTodayForPeriod);
          startOfThisWeek.setDate(startOfTodayForPeriod.getDate() - startOfTodayForPeriod.getDay());
          const customFrom = analyticsCustomRange.from ? new Date(`${analyticsCustomRange.from}T00:00:00`) : null;
          const customTo = analyticsCustomRange.to ? new Date(`${analyticsCustomRange.to}T00:00:00`) : null;
          const startOfThisMonth = new Date(startOfTodayForPeriod.getFullYear(), startOfTodayForPeriod.getMonth(), 1);
          const NAMED_PERIOD_CUTOFFS: Record<string, number> = {
            'Last 30 days': startOfTodayForPeriod.getTime() - 29 * 86_400_000,
            'This Week': startOfThisWeek.getTime(),
            'This Month': startOfThisMonth.getTime(),
            'This Year': new Date(startOfTodayForPeriod.getFullYear(), 0, 1).getTime(),
            ...(customFrom ? { 'Custom range': customFrom.getTime() } : {}),
          };
          const periodFilterOptions: FilterOption[] = Object.keys(PERIOD_WEEKS).map(name => ({ name }));

          const carrierOptionNames = Array.from(new Set(shifts.map(s => s.carrier_name).filter((n): n is string => !!n))).sort();
          const carrierFilterOptions: FilterOption[] = carrierOptionNames.map(name => ({ name }));

          // Standardized to the same TableFilter popover used by Fleet
          // Roadworthiness and Compliance Defects, replacing the bespoke
          // AnalyticsFilterMenu — same button, same checklist popover,
          // everywhere in the app now. Every type but Period is a plain
          // multi-select passthrough; Period keeps its old single-select
          // behaviour (a table filter group is normally multi-select, but
          // "This Week" + "Last 12 weeks" both active has no real meaning
          // here) by collapsing onChange's array down to whichever single
          // value was just added.
          const updateAnalyticsFilter = (type: FilterType, values: string[]) => {
            setAnalyticsFilters(prev => {
              const existing = prev.find(f => f.type === type);
              if (!existing) {
                if (values.length === 0) return prev;
                return [...prev, { id: crypto.randomUUID(), type, operator: FilterOperator.IS, value: values }];
              }
              if (values.length === 0) return prev.map(f => (f.id === existing.id ? { ...f, value: [] } : f));
              return prev.map(f => (f.id === existing.id ? { ...f, value: values } : f));
            });
          };
          const updateAnalyticsPeriodFilter = (values: string[]) => {
            setAnalyticsFilters(prev => {
              const existing = prev.find(f => f.type === FilterType.PERIOD);
              if (values.length === 0) {
                return existing ? prev.map(f => (f.id === existing.id ? { ...f, value: [] } : f)) : prev;
              }
              const added = values.find(v => !existing?.value.includes(v));
              const finalValue = added ?? values[values.length - 1];
              if (!existing) {
                return [...prev, { id: crypto.randomUUID(), type: FilterType.PERIOD, operator: FilterOperator.IS, value: [finalValue] }];
              }
              return prev.map(f => (f.id === existing.id ? { ...f, value: [finalValue] } : f));
            });
          };
          const analyticsFilterGroups: TableFilterGroup[] = [
            {
              key: 'period', label: 'Period',
              options: periodFilterOptions.map(o => ({ value: o.name, label: o.name })),
              selected: analyticsFilters.find(f => f.type === FilterType.PERIOD)?.value ?? [],
              onChange: updateAnalyticsPeriodFilter,
            },
            {
              key: 'driver', label: 'Driver',
              options: driverFilterOptions.map(o => ({ value: o.name, label: o.name })),
              selected: analyticsFilters.find(f => f.type === FilterType.DRIVER)?.value ?? [],
              onChange: (v) => updateAnalyticsFilter(FilterType.DRIVER, v),
            },
            {
              key: 'agency', label: 'Agency',
              options: agencyFilterOptions.map(o => ({ value: o.name, label: o.name })),
              selected: analyticsFilters.find(f => f.type === FilterType.AGENCY)?.value ?? [],
              onChange: (v) => updateAnalyticsFilter(FilterType.AGENCY, v),
            },
            {
              key: 'depot', label: 'Depot',
              options: depotFilterOptions.map(o => ({ value: o.name, label: o.name })),
              selected: analyticsFilters.find(f => f.type === FilterType.DEPOT)?.value ?? [],
              onChange: (v) => updateAnalyticsFilter(FilterType.DEPOT, v),
            },
            {
              key: 'carrier', label: 'Carrier',
              options: carrierFilterOptions.map(o => ({ value: o.name, label: o.name })),
              selected: analyticsFilters.find(f => f.type === FilterType.CARRIER)?.value ?? [],
              onChange: (v) => updateAnalyticsFilter(FilterType.CARRIER, v),
            },
          ];

          const driverFilter = analyticsFilters.find(f => f.type === FilterType.DRIVER && f.value.length > 0);
          const agencyFilter = analyticsFilters.find(f => f.type === FilterType.AGENCY && f.value.length > 0);
          const depotFilter = analyticsFilters.find(f => f.type === FilterType.DEPOT && f.value.length > 0);
          const carrierFilter = analyticsFilters.find(f => f.type === FilterType.CARRIER && f.value.length > 0);
          const periodFilter = analyticsFilters.find(f => f.type === FilterType.PERIOD && f.value.length > 0);
          const periodWeeks = periodFilter ? PERIOD_WEEKS[periodFilter.value[0]] ?? null : null;
          const periodCutoff = periodFilter
            ? NAMED_PERIOD_CUTOFFS[periodFilter.value[0]] ?? (periodWeeks ? Date.now() - periodWeeks * 7 * 24 * 60 * 60 * 1000 : null)
            : null;
          // Upper bound only exists for a custom range (inclusive end day).
          const periodEnd = periodFilter?.value[0] === 'Custom range' && customTo ? customTo.getTime() + 86_400_000 : null;

          const driverNameById = new Map(employees.map(e => [e.id, e.full_name]));
          const agencyById = new Map(employees.map(e => [e.id, resolveAgency(e)]));

          // Split out from the period check so the same "who/where" filters
          // can be reapplied to the prior comparison window below — a
          // period-over-period delta has to compare like with like.
          const matchesNonPeriodFilters = (s: Shift, opts?: { skipDepot?: boolean }) => {
            if (driverFilter) {
              const name = driverNameById.get(s.driver_id);
              const included = !!name && driverFilter.value.includes(name);
              if (driverFilter.operator === FilterOperator.IS_NOT ? included : !included) return false;
            }
            if (agencyFilter) {
              const agency = agencyById.get(s.driver_id) ?? 'Direct';
              const included = agencyFilter.value.includes(agency);
              if (agencyFilter.operator === FilterOperator.IS_NOT ? included : !included) return false;
            }
            if (!opts?.skipDepot && depotFilter) {
              const included = !!s.depot_name && depotFilter.value.includes(s.depot_name);
              if (depotFilter.operator === FilterOperator.IS_NOT ? included : !included) return false;
            }
            // Carrier was offered as a filter but never applied. A shift
            // matches when its carrier, or any of its loads' carriers, is
            // selected.
            if (carrierFilter) {
              const carriers = [s.carrier_name, ...(s.loads ?? []).map(l => l.carrier_name)];
              const included = carriers.some(c => !!c && carrierFilter.value.includes(c));
              if (carrierFilter.operator === FilterOperator.IS_NOT ? included : !included) return false;
            }
            return true;
          };
          const matchesShiftFilters = (s: Shift) => {
            if (!matchesNonPeriodFilters(s)) return false;
            if (periodCutoff && new Date(s.start_time).getTime() < periodCutoff) return false;
            if (periodEnd && new Date(s.start_time).getTime() >= periodEnd) return false;
            return true;
          };
          // ── One set of figures for the whole tab ─────────────────
          // Every number on this page comes from the same shift set, the
          // same revenue rule and the same cost formula (computeTrueCost /
          // computeBreakdowns), so the Overview tiles, the chart, True
          // profit, the driver ranking and the scorecards always agree.
          //
          // Sub-15-minute shifts (a clock-in/out test, or an immediate
          // mis-tap) are left out — they carry no real wage or load.
          // Revenue is the sum of a shift's rated loads, so an agreed rate
          // counts even while another load on the same shift is unrated.
          const analyticsShifts = shifts
            .filter(s => s.status === 'completed' && (s.total_hours ?? 0) >= 0.25 && matchesNonPeriodFilters(s))
            .map(s => {
              const { revenue, pendingLoads } = shiftRevenueFromLoads(s);
              return { ...s, revenue_amount: revenue, pending_loads: pendingLoads };
            });
          const completedShiftsForAnalytics = analyticsShifts.filter(matchesShiftFilters);

          // Live wage accrual on shifts still running — shown beside the
          // filters, never inside the period totals (an active shift has
          // no revenue yet; folding its wage in would understate margin).
          // getShiftFinancials() estimates elapsed pay for a shift with no
          // end_time, and the 15s loadData() poll re-renders this.
          const activeShiftsForAnalytics = shifts.filter(s => s.status === 'active' && matchesShiftFilters(s));
          const liveActiveWages = activeShiftsForAnalytics.reduce((sum, s) => sum + getShiftFinancials(s).grossPay, 0);

          // Per-shift cost and profit, matching computeBreakdowns: wages
          // plus employer on-cost, plus approved fuel (VAT-inclusive at
          // the pump, so ex-VAT unless Inc VAT is selected).
          const oncostRate = (Number(analyticsSettings.employer_oncost_percent) || 0) / 100;
          const vatUp = (v: number) => (analyticsVatMode === 'inc' ? v * (1 + VAT_RATE) : v);
          const shiftFuelCost = (s: Shift) => {
            const gross = approvedFuelCostByShift[s.id] ?? 0;
            return analyticsVatMode === 'inc' ? gross : gross / (1 + VAT_RATE);
          };
          const shiftWages = (s: Shift) => (s.total_pay || 0) * (1 + oncostRate);
          const shiftProfit = (s: Shift): number | null => {
            if (s.revenue_amount === null || s.revenue_amount === undefined) return null;
            return vatUp(s.revenue_amount) - shiftWages(s) - shiftFuelCost(s);
          };
          const shiftsWithRevenue = completedShiftsForAnalytics.filter(s => s.revenue_amount !== null && s.revenue_amount !== undefined);

          // Fleet economics (unit economics + fuel efficiency in one card).
          // Per day, over rated shifts that logged GPS mileage — so a
          // period window's £/mile is always revenue and cost from the
          // same shifts that earned those miles. GPS pings arrive roughly
          // every 2 minutes, so miles (and therefore £/mile and mi/L) are
          // a close estimate rather than odometer-exact; the card says so.
          const approvedLitresByShift = new Map<string, number>();
          for (const r of fuelReceipts) {
            if (r.status !== 'approved' || !r.shift_id) continue;
            approvedLitresByShift.set(r.shift_id, (approvedLitresByShift.get(r.shift_id) ?? 0) + (r.liters ?? 0));
          }
          const economicsByDay = new Map<string, { date: Date; revenue: number; wages: number; fuel: number; miles: number; litres: number }>();
          shiftsWithRevenue.forEach(s => {
            const miles = mileageByShift[s.id] ?? 0;
            if (miles <= 0) return;
            const d = new Date(s.start_time);
            const key = d.toISOString().slice(0, 10);
            const day = economicsByDay.get(key) ?? { date: d, revenue: 0, wages: 0, fuel: 0, miles: 0, litres: 0 };
            day.revenue += vatUp(s.revenue_amount || 0);
            day.wages += shiftWages(s);
            day.fuel += shiftFuelCost(s);
            day.miles += miles;
            day.litres += approvedLitresByShift.get(s.id) ?? 0;
            economicsByDay.set(key, day);
          });
          const economicsSeries: MetricPoint[] = Array.from(economicsByDay.values())
            .sort((a, b) => a.date.getTime() - b.date.getTime())
            .map(d => ({
              date: d.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
              value: Math.round(((d.revenue - d.wages - d.fuel) / d.miles) * 100) / 100,
              revenue: d.revenue,
              wages: d.wages,
              fuel: d.fuel,
              miles: d.miles,
              litres: d.litres,
            }));
          const summarizeEconomics = (points: MetricPoint[]): MetricSummary => {
            const sum = (field: string) => points.reduce((total, p) => total + Number(p[field] ?? 0), 0);
            const miles = sum('miles');
            const wages = sum('wages');
            const fuel = sum('fuel');
            const litres = sum('litres');
            const rate = miles > 0 ? sum('revenue') / miles : 0;
            const cost = miles > 0 ? (wages + fuel) / miles : 0;
            const net = rate - cost;
            const first = points[0]?.value;
            const last = points[points.length - 1]?.value;
            const opCost = wages + fuel;
            const wagesShare = opCost > 0 ? (wages / opCost) * 100 : 0;
            return {
              headline: `${net < 0 ? '−' : ''}£${Math.abs(net).toFixed(2)}/mi`,
              changePct: points.length >= 2 && first ? ((last - first) / Math.abs(first)) * 100 : null,
              footerLeft: (
                <span className="text-xs text-muted">
                  <strong className="text-primary">£{rate.toFixed(2)}</strong> rate · <strong style={{ color: '#CC0000' }}>£{cost.toFixed(2)}</strong> cost per mile · {Math.round(miles).toLocaleString('en-GB')} mi
                </span>
              ),
              footerRight: (
                <span className="text-xs text-muted">
                  <strong className="text-primary">{litres > 0 ? (miles / litres).toFixed(2) : '—'}</strong> mi/L · wages {wagesShare.toFixed(0)}% / fuel {opCost > 0 ? (100 - wagesShare).toFixed(0) : 0}%
                </span>
              ),
            };
          };

          // Fallback for Fleet Economics when too few rated shifts have GPS
          // mileage for per-mile figures: the same unit economics per
          // driver-hour, which every rated shift has — so the card never
          // sits as an empty block beside the driver list.
          const hourlyByDay = new Map<string, { date: Date; revenue: number; wages: number; fuel: number; hours: number }>();
          shiftsWithRevenue.forEach(s => {
            const hours = s.total_hours ?? 0;
            if (hours <= 0) return;
            const d = new Date(s.start_time);
            const key = d.toISOString().slice(0, 10);
            const day = hourlyByDay.get(key) ?? { date: d, revenue: 0, wages: 0, fuel: 0, hours: 0 };
            day.revenue += vatUp(s.revenue_amount || 0);
            day.wages += shiftWages(s);
            day.fuel += shiftFuelCost(s);
            day.hours += hours;
            hourlyByDay.set(key, day);
          });
          const hourlyEconomicsSeries: MetricPoint[] = Array.from(hourlyByDay.values())
            .sort((a, b) => a.date.getTime() - b.date.getTime())
            .map(d => ({
              date: d.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
              value: Math.round(((d.revenue - d.wages - d.fuel) / d.hours) * 100) / 100,
              revenue: d.revenue,
              wages: d.wages,
              fuel: d.fuel,
              hours: d.hours,
            }));
          const summarizeHourlyEconomics = (points: MetricPoint[]): MetricSummary => {
            const sum = (field: string) => points.reduce((total, p) => total + Number(p[field] ?? 0), 0);
            const hours = sum('hours');
            const wages = sum('wages');
            const fuel = sum('fuel');
            const rate = hours > 0 ? sum('revenue') / hours : 0;
            const cost = hours > 0 ? (wages + fuel) / hours : 0;
            const net = rate - cost;
            const first = points[0]?.value;
            const last = points[points.length - 1]?.value;
            const opCost = wages + fuel;
            const wagesShare = opCost > 0 ? (wages / opCost) * 100 : 0;
            return {
              headline: `${net < 0 ? '−' : ''}£${Math.abs(net).toFixed(2)}/h`,
              changePct: points.length >= 2 && first ? ((last - first) / Math.abs(first)) * 100 : null,
              footerLeft: (
                <span className="text-xs text-muted">
                  <strong className="text-primary">£{rate.toFixed(2)}</strong> rate · <strong style={{ color: '#CC0000' }}>£{cost.toFixed(2)}</strong> cost per hour · {Math.round(hours).toLocaleString('en-GB')} h
                </span>
              ),
              footerRight: (
                <span className="text-xs text-muted">
                  wages {wagesShare.toFixed(0)}% / fuel {opCost > 0 ? (100 - wagesShare).toFixed(0) : 0}% of running cost
                </span>
              ),
            };
          };
          const economicsUsesHours = economicsSeries.length < 2 && hourlyEconomicsSeries.length >= 2;

          // Status strip — long shifts and the worst genuinely
          // loss-making shift (same per-shift profit formula as above).
          const flaggedShiftsCount = completedShiftsForAnalytics.filter(
            s => (s.total_hours ?? 0) > orgAlertSettings.longShiftFlagHours,
          ).length;
          const lossMakingShifts = shiftsWithRevenue
            .map(s => ({ name: driverNameById.get(s.driver_id) || 'Unknown driver', margin: shiftProfit(s) }))
            .filter((x): x is { name: string; margin: number } => x.margin !== null && x.margin < 0)
            .sort((a, b) => a.margin - b.margin);
          const worstLossShift = lossMakingShifts.length > 0 ? lossMakingShifts[0] : null;

          return (
            <>
            {/* Shipments: Import Carrier and Assign load live on the Live Tracking tab itself; Analytics' filters are in its own toolbar. */}

            {activeTab === 'analytics' && (() => {
              const money = (v: number) => `${v < 0 ? '−' : ''}£${Math.abs(v).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
              const moneyAxis = (v: number) => (Math.abs(v) >= 1000 ? `£${(v / 1000).toFixed(1)}k` : `£${Math.round(v)}`);
              const percent = (v: number) => `${v.toFixed(1)}%`;

              // ── The period's true figures (one computeTrueCost run) ────
              const earliestShift = analyticsShifts.reduce((min, s) => Math.min(min, new Date(s.start_time).getTime()), Date.now());
              const windowStart = new Date(periodCutoff ?? earliestShift);
              const windowEnd = new Date(periodEnd ?? Date.now());
              const trueCostInput = { shifts: analyticsShifts, fuelReceipts, costs: orgCosts, settings: analyticsSettings, vatMode: analyticsVatMode };
              const trueCostFor = (start: Date, end: Date) => computeTrueCost({ ...trueCostInput, start, end });
              const trueCurrent = trueCostFor(windowStart, windowEnd);
              const bounded = Boolean(periodCutoff);
              const spanMs = windowEnd.getTime() - windowStart.getTime();
              const truePrevious = bounded ? trueCostFor(new Date(windowStart.getTime() - spanMs), windowStart) : null;
              const shiftYear = (d: Date) => { const c = new Date(d); c.setFullYear(c.getFullYear() - 1); return c; };
              const trueLastYear = bounded ? trueCostFor(shiftYear(windowStart), shiftYear(windowEnd)) : null;
              const monthStart = new Date(startOfTodayForPeriod.getFullYear(), startOfTodayForPeriod.getMonth(), 1);
              const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
              const monthToDate = trueCostFor(monthStart, new Date());
              const elapsedDays = Math.max(1, (Date.now() - monthStart.getTime()) / 86_400_000);
              const monthForecast = {
                projected: (monthToDate.profit / elapsedDays) * daysInMonth,
                monthLabel: monthStart.toLocaleDateString('en-GB', { month: 'long' }),
                daysLeft: Math.max(0, Math.ceil(daysInMonth - elapsedDays)),
              };
              const truePeriodLabel = periodFilter?.value[0] === 'Custom range'
                ? `${analyticsCustomRange.from} → ${analyticsCustomRange.to}`
                : (periodFilter?.value[0] ?? 'All time');

              // Overview tiles: Revenue − Driver cost − Expenses = Profit,
              // exactly, and the same figures True profit breaks down.
              const figures = (r: TrueCostResult) => ({
                revenue: r.revenue,
                driverCost: r.payroll + r.oncost,
                expenses: r.fuel + r.fixed,
                profit: r.profit,
                margin: r.marginPct,
              });
              const cur = figures(trueCurrent);
              const prev = truePrevious ? figures(truePrevious) : null;
              // Which direction is good per figure: more revenue is good,
              // more cost is bad.
              const tileDelta = (current: number | null, previous: number | null | undefined, good: 'up' | 'down', asPoints = false): MetricTile['delta'] => {
                if (!prev || current === null || previous === null || previous === undefined) return null;
                if (previous === 0 && current === 0) return null;
                if (previous === 0) return { direction: current > 0 ? 'up' : 'down', label: 'New', tone: (current > 0) === (good === 'up') ? 'positive' : 'negative' };
                const diff = asPoints ? current - previous : ((current - previous) / Math.abs(previous)) * 100;
                const direction: BadgeDeltaDirection = diff > 0.05 ? 'up' : diff < -0.05 ? 'down' : 'flat';
                const tone: BadgeDeltaTone = direction === 'flat' ? 'neutral' : direction === good ? 'positive' : 'negative';
                return { direction, tone, label: `${diff > 0 ? '+' : ''}${diff.toFixed(1)}${asPoints ? 'pp' : '%'}` };
              };
              const ratedShifts = trueCurrent.shiftCount - trueCurrent.unratedShifts;
              const overviewMetrics: MetricTile[] = [
                {
                  key: 'revenue', label: 'Revenue', value: cur.revenue, previous: prev?.revenue ?? null,
                  format: money, axisFormat: moneyAxis, color: '#333333', delta: tileDelta(cur.revenue, prev?.revenue, 'up'),
                  hint: trueCurrent.shiftCount === 0 ? 'No completed shifts yet' : `${ratedShifts} of ${trueCurrent.shiftCount} shifts fully rated`,
                },
                {
                  key: 'driverCost', label: 'Driver cost', value: cur.driverCost, previous: prev?.driverCost ?? null,
                  format: money, axisFormat: moneyAxis, color: '#CC0000', delta: tileDelta(cur.driverCost, prev?.driverCost, 'down'),
                  hint: trueCurrent.oncost > 0
                    ? `Wages ${money(trueCurrent.payroll)} + NI & pension ${money(trueCurrent.oncost)}`
                    : `Wages · ${formatHoursMinutes(trueCurrent.hours)} worked`,
                },
                {
                  key: 'expenses', label: 'Expenses', value: cur.expenses, previous: prev?.expenses ?? null,
                  format: money, axisFormat: moneyAxis, color: '#F59E0B', delta: tileDelta(cur.expenses, prev?.expenses, 'down'),
                  hint: `Fuel ${money(trueCurrent.fuel)} · fixed costs ${money(trueCurrent.fixed)}`,
                },
                {
                  key: 'profit', label: 'Profit', value: cur.profit, previous: prev?.profit ?? null,
                  format: money, axisFormat: moneyAxis, color: '#10B981', delta: tileDelta(cur.profit, prev?.profit, 'up'),
                  hint: 'Revenue − driver cost − expenses',
                },
                {
                  key: 'margin', label: 'Margin', value: cur.margin ?? 0, previous: prev ? (prev.margin ?? 0) : null,
                  format: percent, color: '#64748B', delta: tileDelta(cur.margin, prev?.margin, 'up', true),
                  hint: `Target >${analyticsSettings.target_margin_percent}%`,
                },
              ];
              // Chart: the same figures per day (per week beyond ~3 months),
              // so the line adds up to the tile above it.
              const overviewSeries = computeTrueCostSeries({ ...trueCostInput, start: windowStart, end: windowEnd }).map(({ label, result }) => {
                const f = figures(result);
                const round = (v: number) => Math.round(v * 100) / 100;
                return {
                  label,
                  revenue: round(f.revenue),
                  driverCost: round(f.driverCost),
                  expenses: round(f.expenses),
                  profit: round(f.profit),
                  margin: f.margin === null ? 0 : Math.round(f.margin * 10) / 10,
                };
              });

              // Driver ranking — the drivers' own profit from
              // computeBreakdowns, so it matches their scorecards exactly.
              const driverRanking = computeBreakdowns({
                start: windowStart, end: windowEnd, shifts: analyticsShifts, fuel: fuelReceipts, costs: orgCosts,
                settings: analyticsSettings, vatMode: analyticsVatMode,
                targetCheckSeconds: orgAlertSettings.walkaroundCheckTargetMinutes * 60,
                extras: { milesByShift: {}, checks: [], idleAlerts: [], incidents: [] },
              }).drivers.sort((a, b) => b.profit - a.profit);
              const lastShiftByDriver = new Map<string, string>();
              completedShiftsForAnalytics.forEach(s => {
                const last = lastShiftByDriver.get(s.driver_id);
                if (!last || s.start_time > last) lastShiftByDriver.set(s.driver_id, s.start_time);
              });

              return (
            <>
            <div className="analytics-page">
              {/* Page header (21st.dev page-header-2): what this page is,
                  the period in view, and the page-wide controls. VAT mode
                  and Costs & targets change every figure below, and the
                  report buttons export the whole page, so they sit here
                  rather than inside one section. AnalyticsBreakdowns
                  mounts its report buttons into the header slot. */}
              <AnalyticsPageHeader
                title="Analytics"
                badge={<span className="an-badge"><Calendar size={12} /> {truePeriodLabel}</span>}
                description={`Profit, costs and performance across your fleet · figures ${analyticsVatMode === 'inc' ? 'including' : 'excluding'} VAT.`}
                actions={
                  <>
                    <SegmentedToggle
                      variant="brand"
                      label="VAT"
                      value={analyticsVatMode}
                      onChange={setAnalyticsVatMode}
                      options={[{ value: 'ex', label: 'Ex VAT' }, { value: 'inc', label: 'Inc VAT' }]}
                    />
                    {/* Import = data coming in (fixed costs and targets);
                        Export = reports going out, mounted from
                        AnalyticsBreakdowns into the header slot. */}
                    {userRole === 'payroll_admin' && (
                      <ActionMenu
                        label="Import"
                        icon={<UploadCloud size={13} />}
                        items={[{
                          key: 'costs',
                          label: 'Costs & targets',
                          hint: 'Fixed costs, margin and profit targets',
                          icon: <Settings2 size={14} />,
                          onSelect: () => setIsCostLedgerOpen(true),
                        }]}
                      />
                    )}
                  </>
                }
                actionsRef={setAnalyticsReportSlot}
              />

              {/* Toolbar — filters on the left (the same TableFilter popover
                  used by Fleet Roadworthiness and Compliance Defects, with
                  FilterBar chips for the active selections), live status
                  and anything that needs attention on the right. */}
              <div className="an-toolbar">
                <div className="an-toolbar-filters">
                  <TableFilter groups={analyticsFilterGroups} />
                  {periodFilter?.value[0] === 'Custom range' && (
                    <span style={{ minWidth: '240px' }}>
                      <EarningsDateRangePicker
                        startDate={analyticsCustomRange.from}
                        endDate={analyticsCustomRange.to}
                        onChange={(from, to) => setAnalyticsCustomRange({ from, to })}
                      />
                    </span>
                  )}
                  <FilterBar
                    filters={analyticsFilters}
                    setFilters={setAnalyticsFilters}
                    filterViewOptions={[]}
                    showAddFilterButton={false}
                    filterOptionsByType={{
                      [FilterType.DRIVER]: driverFilterOptions,
                      [FilterType.AGENCY]: agencyFilterOptions,
                      [FilterType.DEPOT]: depotFilterOptions,
                      [FilterType.PERIOD]: periodFilterOptions,
                      [FilterType.CARRIER]: carrierFilterOptions,
                    }}
                    typeIcons={{
                      [FilterType.DRIVER]: <IdCard className="size-3.5" />,
                      [FilterType.AGENCY]: <Building2 className="size-3.5" />,
                      [FilterType.DEPOT]: <Warehouse className="size-3.5" />,
                      [FilterType.PERIOD]: <Calendar className="size-3.5" />,
                      [FilterType.CARRIER]: <Building2 className="size-3.5" />,
                    }}
                  />
                </div>
                <div className="an-toolbar-status">
                  {activeShiftsForAnalytics.length > 0 && (
                    <span className="an-pill">
                      <span className="dash-live-dot" />
                      {activeShiftsForAnalytics.length} on shift now · <strong className="text-primary">£{liveActiveWages.toLocaleString('en-GB', { maximumFractionDigits: 2 })}</strong> wages accruing
                    </span>
                  )}
                  {flaggedShiftsCount === 0 && !worstLossShift ? (
                    <span className="an-pill an-pill--ok">
                      <CheckCircle2 size={14} />
                      Nothing needs attention
                    </span>
                  ) : (
                    <>
                      {flaggedShiftsCount > 0 && (
                        <span className="an-pill an-pill--alert">
                          <AlertTriangle size={13} />
                          {flaggedShiftsCount} shift{flaggedShiftsCount === 1 ? '' : 's'} over {orgAlertSettings.longShiftFlagHours}h
                        </span>
                      )}
                      {worstLossShift && (
                        <span className="an-pill an-pill--alert">
                          <AlertTriangle size={13} />
                          Loss-making shift — {toTitleCase(worstLossShift.name)} (£{worstLossShift.margin.toFixed(0)})
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* 1 · Overview — the period's headline figures as clickable
                  tiles (21st.dev line-charts-6); the selected one is
                  plotted day by day, with targets and the month-end
                  forecast beside the trend they describe. */}
              <AnalyticsSection title="Overview" description="Revenue − driver cost − expenses = profit. Select a figure to plot it over the period.">
                <MetricLineChart
                  metrics={overviewMetrics}
                  data={overviewSeries}
                  defaultKey="revenue"
                  height={300}
                  emptyText="The day-by-day trend appears once the period covers at least two days."
                  aside={
                    <>
                      <TrueProfitTargets current={trueCurrent} settings={analyticsSettings} />
                      <TrueProfitForecast forecast={monthForecast} />
                    </>
                  }
                />
              </AnalyticsSection>

              {/* 2 · True profit — revenue to profit after every cost. */}
              <AnalyticsSection title="True profit" description="What's left after wages, employer on-costs, fuel and fixed costs.">
                <TrueProfitSection
                  current={trueCurrent}
                  previous={truePrevious}
                  lastYear={trueLastYear}
                  settings={analyticsSettings}
                  hasCosts={orgCosts.length > 0}
                />
              </AnalyticsSection>

              {/* 3 · Efficiency & ranking — unit economics and fuel
                  efficiency (21st.dev progress-metric-card) beside the
                  driver margin ranking (21st.dev rank-bars). */}
              <AnalyticsSection title="Efficiency & driver ranking" description="What each mile or hour earns after wages and fuel, and which drivers contribute the most margin.">
                <div className="an-grid an-grid--split-wide">
                  <ProgressMetricCard
                    title="Fleet Economics"
                    subtitle={economicsUsesHours
                      ? 'Net profit per driver-hour after wages and fuel. Per-mile figures appear once shifts log GPS mileage.'
                      : 'Net profit per mile after wages and fuel, with fuel efficiency.'}
                    icon={<Gauge size={15} color="var(--charcoal-light)" />}
                    data={economicsUsesHours ? hourlyEconomicsSeries : economicsSeries}
                    periodOptions={[
                      { label: 'Last 7 days', points: 7 },
                      { label: 'Last 14 days', points: 14 },
                      { label: 'Whole period' },
                    ]}
                    summarize={economicsUsesHours ? summarizeHourlyEconomics : summarizeEconomics}
                    valueFormatter={v => `${v < 0 ? '−' : ''}£${Math.abs(v).toFixed(2)}`}
                    note={economicsUsesHours
                      ? 'Hours come from each shift\'s clock-in and clock-out.'
                      : 'Miles come from GPS pings every ~2 minutes, so per-mile and mi/L figures are close estimates.'}
                    emptyTitle="Not enough mileage yet"
                    emptyDescription="Needs rated shifts with logged GPS mileage on at least two days."
                  />
                  <AnalyticsCard
                    title="Driver profitability"
                    icon={<Users size={14} />}
                    description="Revenue minus each driver's wages, NI & pension and fuel this period — the same figures as their scorecards."
                  >
                    <RankBars
                      emptyText="No completed shifts yet for this period."
                      items={driverRanking.map(d => ({
                        key: d.driverId,
                        label: toTitleCase(d.name),
                        value: d.profit,
                        valueLabel: money(d.profit),
                        sub: `${d.shifts} shift${d.shifts === 1 ? '' : 's'} · ${d.hours.toFixed(1)} h`,
                        meta: lastShiftByDriver.has(d.driverId)
                          ? `Last ${new Date(lastShiftByDriver.get(d.driverId)!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                          : undefined,
                      }))}
                    />
                  </AnalyticsCard>
                </div>
              </AnalyticsSection>

              {/* 4 · Drivers, vehicles & customers — the detailed
                  scorecards and tables (renders its own section header). */}
              <AnalyticsBreakdowns
                organizationId={currentOrgId}
                companyName={(teamOrgInfo as { name?: string } | null)?.name ?? null}
                start={windowStart}
                end={windowEnd}
                periodLabel={truePeriodLabel}
                shifts={analyticsShifts}
                fuel={fuelReceipts}
                costs={orgCosts}
                settings={analyticsSettings}
                vatMode={analyticsVatMode}
                targetCheckMinutes={orgAlertSettings.walkaroundCheckTargetMinutes}
                summary={trueCurrent}
                previousProfit={truePrevious?.profit ?? null}
                lastYearProfit={trueLastYear?.profit ?? null}
                canManageReports={userRole === 'payroll_admin'}
                canExport={hasFeature('report_exports')}
                reportActionsTarget={analyticsReportSlot}
              />
            </div>
            {isCostLedgerOpen && (
              <CostLedgerModal
                costs={orgCosts}
                settings={analyticsSettings}
                onClose={() => setIsCostLedgerOpen(false)}
                onChanged={loadTrueCostData}
              />
            )}
            </>
              );
            })()}


            {activeTab === 'shipments' && (
            <>
            {/* Shipments splits into the live board (active loads, the
                assign action, and the shift ledger) and the delivery
                history (completed loads with proof of delivery). */}
            <div className="telemetry-tabs mt-16">
              {([['tracking', 'Live Tracking'], ['history', 'Delivery History']] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`telemetry-tab ${shipmentsView === key ? 'telemetry-tab--active' : ''}`}
                  onClick={() => setShipmentsView(key)}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => { setDispatchMode('files'); setIsDispatchOpen(true); }}
                className="flex items-center text-xs font-bold"
                style={{ gap: '6px', padding: '8px 14px', borderRadius: '8px', border: 'none', background: 'var(--brand-red)', color: '#fff', cursor: 'pointer', marginLeft: 'auto', whiteSpace: 'nowrap' }}
              >
                <UploadCloud size={14} />
                Import Carrier
              </button>
            </div>
            {shipmentsView === 'tracking' && (
              <ShipmentsTracking
                shifts={shifts}
                unitRisk={unitRisk}
                onOpenFleet={openFleetUnit}
                liveLocations={liveLocations}
                depots={depots}
                employees={employees}
                onAssign={(driverId) => { setDispatchDriverId(driverId); setDispatchMode('assign'); setIsDispatchOpen(true); }}
              />
            )}
            {shipmentsView === 'history' && <DeliveryHistory />}
            </>
            )}

            </>
          );
        })()}

        {/* Review modals (fuel receipts, GPS compare, parking claims) live
            outside the Analytics/Shipments-only block so the Alert Panel's
            "Review in Fuel Audit" / "Review Claims" buttons can open them
            from any page. */}
        {/* Fuel Receipts Audit — moved off the main canvas entirely
            into a modal triggered from the toolbar button. Same data/
            handlers as before (a receipt sits 'pending' until
            approved here; only approved rows feed the KPI strip and
            the ledger's Fuel Incurred column), just no longer a
            permanent full-width section on the page. */}
        {isFuelReceiptsModalOpen && (() => {
          const vehicleOptions = Array.from(new Set(fuelReceipts.map(r => r.vehicle_number).filter((v): v is string => Boolean(v)))).sort();
          const modalDriverQuery = fuelModalDriverSearch.trim().toLowerCase();
          const filteredReceipts = fuelReceipts.filter(r => {
            if (modalDriverQuery && !(r.driver_name ?? '').toLowerCase().includes(modalDriverQuery)) return false;
            if (fuelModalVehicleFilter && r.vehicle_number !== fuelModalVehicleFilter) return false;
            const receiptDate = r.created_at.slice(0, 10);
            if (fuelModalDateStart && receiptDate < fuelModalDateStart) return false;
            if (fuelModalDateEnd && receiptDate > fuelModalDateEnd) return false;
            return true;
          });
          const pendingCount = fuelReceipts.filter(r => r.status === 'pending').length;

          return (
            <>
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 998 }} onClick={() => setIsFuelReceiptsModalOpen(false)} />
              <div
                className="glass-panel"
                style={{
                  position: 'fixed', top: '5vh', left: '50%', transform: 'translateX(-50%)',
                  width: 'min(1320px, 96vw)', maxHeight: '90vh', overflowY: 'auto', zIndex: 999,
                  borderRadius: '14px', padding: '24px', background: 'var(--card-bg)',
                  boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)', border: '1px solid var(--border-color)',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-16" style={{ flexWrap: 'wrap', gap: '8px' }}>
                  <span className="flex items-center" style={{ gap: '10px' }}>
                    <Receipt size={18} color="var(--charcoal)" />
                    <h2 className="text-lg font-black text-primary m-0">Fuel &amp; AdBlue Receipts Audit</h2>
                    {pendingCount > 0 && <span className="badge badge-warning font-mono">{pendingCount} awaiting review</span>}
                    {anomalousFuelReceiptCount > 0 && (
                      <span className="badge badge-danger font-mono">
                        {anomalousFuelReceiptCount} anomal{anomalousFuelReceiptCount === 1 ? 'y' : 'ies'}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsFuelReceiptsModalOpen(false)}
                    aria-label="Close"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--charcoal-light)', display: 'flex' }}
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="flex items-center mb-16" style={{ gap: '10px', flexWrap: 'wrap' }}>
                  <TableFilter
                    groups={[{
                      key: 'vehicle', label: 'Vehicle', single: true, neutral: '',
                      options: [{ value: '', label: 'All Vehicles' }, ...vehicleOptions.map(v => ({ value: v, label: v }))],
                      selected: [fuelModalVehicleFilter],
                      onChange: (v) => setFuelModalVehicleFilter(v[0] ?? ''),
                    }]}
                    search={{ value: fuelModalDriverSearch, onChange: setFuelModalDriverSearch, placeholder: 'Search driver name…' }}
                  />
                  <span>
                    <EarningsDateRangePicker compact
                      startDate={fuelModalDateStart}
                      endDate={fuelModalDateEnd}
                      onChange={(from, to) => { setFuelModalDateStart(from); setFuelModalDateEnd(to); }}
                    />
                  </span>
                  {(fuelModalDriverSearch || fuelModalVehicleFilter || fuelModalDateStart || fuelModalDateEnd) && (
                    <button
                      type="button"
                      onClick={() => { setFuelModalDriverSearch(''); setFuelModalVehicleFilter(''); setFuelModalDateStart(''); setFuelModalDateEnd(''); }}
                      className="text-xs font-bold"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--charcoal-light)' }}
                    >
                      Clear
                    </button>
                  )}
                  <span className="text-xs text-muted" style={{ marginLeft: 'auto' }}>{filteredReceipts.length} of {fuelReceipts.length} receipts</span>
                </div>

                {fuelReceipts.length === 0 ? (
                  <NoData className="py-24" />
                ) : filteredReceipts.length === 0 ? (
                  <NoData className="py-24" />
                ) : (
                  <div className="table-container">
                    <table className="data-table data-table--nowrap">
                      <thead>
                        <tr>
                          <th>Photos</th>
                          <th>Driver Name</th>
                          <th>Vehicle Reg</th>
                          <th>Date &amp; Time</th>
                          <th>Odometer (mi)</th>
                          <th>Volume (L)</th>
                          <th>Total Cost (£)</th>
                          <th>Δ Miles / MPG</th>
                          <th>Station / Vendor</th>
                          <th>Status</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredReceipts.map(r => {
                          const thumbUrl = fuelReceiptThumbUrls[r.receipt_photo_path];
                          const dashboardThumbUrl = r.dashboard_photo_path ? fuelReceiptThumbUrls[r.dashboard_photo_path] : undefined;
                          return (
                            <React.Fragment key={r.id}>
                              <tr style={r.theft_flag ? { background: 'rgba(204,0,0,0.05)' } : undefined}>
                                <td>
                                  <div className="flex items-center" style={{ gap: '4px' }}>
                                    <button
                                      type="button"
                                      onClick={() => openFuelReceiptLightbox(r.receipt_photo_path)}
                                      style={{ position: 'relative', width: '36px', height: '36px', border: 'none', padding: 0, cursor: 'zoom-in', borderRadius: '6px', overflow: 'hidden', background: 'var(--card-bg-hover)' }}
                                      title="View pump/receipt photo"
                                    >
                                      {thumbUrl ? (
                                        <img src={thumbUrl} alt="Fuel receipt" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                      ) : (
                                        <Fuel size={13} color="var(--charcoal-light)" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
                                      )}
                                    </button>
                                    {r.dashboard_photo_path ? (
                                      <button
                                        type="button"
                                        onClick={() => openFuelReceiptLightbox(r.dashboard_photo_path!)}
                                        style={{ position: 'relative', width: '36px', height: '36px', border: 'none', padding: 0, cursor: 'zoom-in', borderRadius: '6px', overflow: 'hidden', background: 'var(--card-bg-hover)' }}
                                        title="View dashboard photo (odometer + fuel gauge)"
                                      >
                                        {dashboardThumbUrl ? (
                                          <img src={dashboardThumbUrl} alt="Dashboard" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : (
                                          <Gauge size={13} color="var(--charcoal-light)" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
                                        )}
                                      </button>
                                    ) : (
                                      <span title="No dashboard photo (submitted before this check existed)" style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', background: 'var(--card-bg-hover)' }}>
                                        <Gauge size={13} color="var(--charcoal-light)" style={{ opacity: 0.3 }} />
                                      </span>
                                    )}
                                    {r.gps_lat !== null && r.gps_lng !== null && (
                                      <button
                                        type="button"
                                        onClick={() => setGpsCompareReceipt(r)}
                                        title="Compare GPS location vs. claimed station"
                                        style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: '6px', background: 'var(--card-bg-hover)', cursor: 'pointer', color: 'var(--charcoal)' }}
                                      >
                                        <MapPin size={13} />
                                      </button>
                                    )}
                                  </div>
                                </td>
                                <td className="font-medium text-primary" style={{ fontSize: '13px' }}>{toTitleCase(r.driver_name ?? '') || '—'}</td>
                                <td>
                                  {r.vehicle_number ? (
                                    <span className="font-mono font-bold" style={{ fontSize: '11px', textTransform: 'uppercase', background: 'var(--card-bg-hover)', color: 'var(--charcoal)', padding: '2px 8px', borderRadius: '4px' }}>
                                      {r.vehicle_number}
                                    </span>
                                  ) : '—'}
                                </td>
                                <td className="whitespace-nowrap font-mono tabular-nums text-xs">
                                  {new Date(r.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}{' '}
                                  {new Date(r.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                </td>
                                <td className="font-mono tabular-nums text-xs">{r.odometer_miles === null ? '—' : r.odometer_miles.toLocaleString('en-GB')}</td>
                                <td className="font-mono tabular-nums font-semibold text-xs">
                                  {r.liters === null ? '—' : r.liters.toFixed(1)}
                                  {r.fuel_tank_capacity_litres != null && r.liters !== null && r.liters > r.fuel_tank_capacity_litres && (
                                    <AlertTriangle size={11} color="#CC0000" style={{ marginLeft: '4px', verticalAlign: 'middle' }} />
                                  )}
                                </td>
                                <td className="font-mono tabular-nums font-semibold">{r.total_cost === null ? '—' : `£${r.total_cost.toFixed(2)}`}</td>
                                <td className="whitespace-nowrap">
                                  {r.calculated_mpg != null ? (
                                    <div className="flex flex-col" style={{ gap: '2px' }}>
                                      <span className="text-xs text-muted">{r.delta_miles}mi</span>
                                      {r.theft_flag ? (
                                        <span
                                          className="font-mono tabular-nums font-black"
                                          style={{ fontSize: '11px', color: '#fff', background: '#CC0000', padding: '2px 8px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px', width: 'fit-content' }}
                                          title={r.theft_reason ?? undefined}
                                        >
                                          <AlertTriangle size={11} /> Anomaly: {r.calculated_mpg.toFixed(1)} MPG
                                        </span>
                                      ) : (
                                        <span
                                          className="font-mono tabular-nums font-bold"
                                          style={{ fontSize: '11px', color: '#10B981', background: 'rgba(16,185,129,0.12)', padding: '2px 8px', borderRadius: '4px', width: 'fit-content' }}
                                        >
                                          {r.calculated_mpg.toFixed(1)} MPG
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-xs text-muted">
                                      {r.odometer_miles === null ? 'No odometer' : !r.is_full_tank ? 'Partial fill — not compared' : 'First full-tank fill logged'}
                                    </span>
                                  )}
                                </td>
                                <td className="text-xs">{r.vendor ?? '—'}</td>
                                <td>
                                  <span className={`badge ${r.status === 'approved' ? 'badge-success' : r.status === 'rejected' ? 'badge-danger' : 'badge-warning'}`}>
                                    {r.status === 'approved' ? 'Approved' : r.status === 'rejected' ? 'Rejected' : 'Pending'}
                                  </span>
                                  {r.auto_approved && (
                                    <span className="text-xs text-muted" style={{ marginLeft: '6px' }} title="No admin reviewed this within 10 hours, so it was approved automatically.">
                                      (auto)
                                    </span>
                                  )}
                                </td>
                                <td className="whitespace-nowrap">
                                  {r.status === 'pending' && (
                                    <div className="flex items-center" style={{ gap: '6px' }}>
                                      <button
                                        type="button"
                                        disabled={reviewingFuelReceiptId === r.id}
                                        onClick={() => handleReviewFuelReceipt(r.id, 'approved')}
                                        title={r.theft_flag ? 'Flagged as an anomaly — approve only after checking the photos/GPS' : 'Approve Log'}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#10B981' }}
                                      >
                                        <CircleCheck size={18} />
                                      </button>
                                      <button
                                        type="button"
                                        disabled={reviewingFuelReceiptId === r.id}
                                        onClick={() => handleReviewFuelReceipt(r.id, 'rejected')}
                                        title={r.theft_flag ? 'Flag for Investigation' : 'Reject'}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--brand-red)' }}
                                      >
                                        <CircleX size={18} />
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                              {r.vehicle_id && r.fuel_tank_capacity_litres == null && (
                                <tr>
                                  <td colSpan={11} style={{ padding: '4px 8px', background: 'var(--card-bg-hover)' }}>
                                    <span className="flex items-center text-xs" style={{ gap: '6px', color: 'var(--charcoal-light)' }}>
                                      <AlertTriangle size={11} />
                                      {r.vehicle_number ?? 'This vehicle'}'s tank capacity isn't set — the over-capacity check is skipped until it is.
                                      <input
                                        type="number"
                                        placeholder="Capacity (L)"
                                        className="input-field"
                                        style={{ width: '110px', fontSize: '11px', padding: '2px 6px' }}
                                        onKeyDown={async (e) => {
                                          if (e.key !== 'Enter' || isMockMode || !supabase || !r.vehicle_id) return;
                                          const value = parseInt((e.target as HTMLInputElement).value, 10);
                                          if (!value || value <= 0) return;
                                          await supabase.from('vehicles').update({ fuel_tank_capacity_litres: value }).eq('id', r.vehicle_id);
                                          loadFuelReceipts();
                                        }}
                                      />
                                    </span>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          );
        })()}

        <ImageLightbox url={fuelReceiptLightboxUrl} onClose={() => setFuelReceiptLightboxUrl(null)} alt="Fuel receipt, full size" />

        {/* GPS vs. claimed station — a real embedded map centred on
            the driver's actual submit-time GPS fix (OpenStreetMap's
            public embed endpoint, no API key needed), with the
            vendor name shown as plain driver-entered text next to
            it. Honest about what this is NOT: without a geocoding
            key (Google/Mapbox) there's no way to plot where "Shell
            Membury" actually is and measure a distance — an admin
            has to eyeball whether the pin plausibly matches. */}
        {gpsCompareReceipt && gpsCompareReceipt.gps_lat !== null && gpsCompareReceipt.gps_lng !== null && (() => {
          const lat = gpsCompareReceipt.gps_lat!;
          const lng = gpsCompareReceipt.gps_lng!;
          const delta = 0.01;
          const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;
          const embedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
          const externalUrl = `https://www.google.com/maps?q=${lat},${lng}`;
          return (
            <>
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 998 }} onClick={() => setGpsCompareReceipt(null)} />
              <div
                className="glass-panel"
                style={{
                  position: 'fixed', top: '8vh', left: '50%', transform: 'translateX(-50%)',
                  width: 'min(560px, 92vw)', zIndex: 999, borderRadius: '14px', padding: '20px',
                  background: 'var(--card-bg)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)', border: '1px solid var(--border-color)',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-12">
                  <span className="flex items-center text-sm font-bold" style={{ gap: '8px' }}>
                    <MapPin size={16} color="var(--brand-red)" /> GPS at Submission
                  </span>
                  <button type="button" onClick={() => setGpsCompareReceipt(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--charcoal-light)' }}>
                    <X size={18} />
                  </button>
                </div>
                <div className="mb-12" style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--card-bg-hover)' }}>
                  <p className="text-xs font-bold text-muted m-0" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Claimed station (driver-entered, not verified)</p>
                  <p className="text-sm font-semibold text-primary m-0 mt-4">{gpsCompareReceipt.vendor || 'No vendor name entered'}</p>
                </div>
                <div style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                  <iframe
                    title="Fuel log GPS location"
                    width="100%"
                    height="320"
                    style={{ border: 0, display: 'block' }}
                    src={embedUrl}
                  />
                </div>
                <div className="flex items-center justify-between mt-8">
                  <span className="font-mono text-xs text-muted">{lat.toFixed(5)}, {lng.toFixed(5)}</span>
                  <a href={externalUrl} target="_blank" rel="noreferrer" className="text-xs font-bold" style={{ color: 'var(--brand-red)' }}>
                    Open in Google Maps <ExternalLink size={11} style={{ verticalAlign: 'middle', marginLeft: '2px' }} />
                  </a>
                </div>
                <p className="text-xs text-muted mt-8 m-0">
                  This confirms where the driver's device was when the log was submitted — not the station's real address (no geocoding is configured), so treat a mismatch as a prompt to ask, not final proof.
                </p>
              </div>
            </>
          );
        })()}

        {/* Overnight Parking Expenses — same review-queue shape as the
            Fuel Receipts Audit modal above, except approving a claim
            also reimburses it into that shift's payroll (extras_amount)
            — see handleReviewParkingExpense. A claim with no shift_id
            gets an inline "assign to shift" picker instead of the
            usual approve/reject pair, since there's nowhere to credit
            the money until one's chosen. */}
        {isParkingExpensesModalOpen && (() => {
          const modalDriverQuery = parkingModalDriverSearch.trim().toLowerCase();
          const filteredExpenses = parkingExpenses.filter(r => {
            if (modalDriverQuery && !(r.driver_name ?? '').toLowerCase().includes(modalDriverQuery)) return false;
            return true;
          });
          const pendingCount = parkingExpenses.filter(r => r.status === 'pending').length;

          return (
            <>
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 998 }} onClick={() => setIsParkingExpensesModalOpen(false)} />
              <div
                className="glass-panel"
                style={{
                  position: 'fixed', top: '5vh', left: '50%', transform: 'translateX(-50%)',
                  width: 'min(1200px, 96vw)', maxHeight: '90vh', overflowY: 'auto', zIndex: 999,
                  borderRadius: '14px', padding: '24px', background: 'var(--card-bg)',
                  boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)', border: '1px solid var(--border-color)',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-16" style={{ flexWrap: 'wrap', gap: '8px' }}>
                  <span className="flex items-center" style={{ gap: '10px' }}>
                    <ParkingCircle size={18} color="var(--charcoal)" />
                    <h2 className="text-lg font-black text-primary m-0">Overnight Parking Claims</h2>
                    {pendingCount > 0 && <span className="badge badge-warning font-mono">{pendingCount} awaiting review</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsParkingExpensesModalOpen(false)}
                    aria-label="Close"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--charcoal-light)', display: 'flex' }}
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="flex items-center mb-16" style={{ gap: '10px', flexWrap: 'wrap' }}>
                  <TableFilter groups={[]} search={{ value: parkingModalDriverSearch, onChange: setParkingModalDriverSearch, placeholder: 'Search driver name…' }} />
                  <span className="text-xs text-muted" style={{ marginLeft: 'auto' }}>{filteredExpenses.length} of {parkingExpenses.length} claims</span>
                </div>

                {parkingExpenses.length === 0 ? (
                  <NoData className="py-24" />
                ) : filteredExpenses.length === 0 ? (
                  <NoData className="py-24" />
                ) : (
                  <div className="table-container">
                    <table className="data-table data-table--nowrap">
                      <thead>
                        <tr>
                          <th>Receipt Photo</th>
                          <th>Driver Name</th>
                          <th>Location</th>
                          <th>Date</th>
                          <th>Amount (£)</th>
                          <th>Shift</th>
                          <th>Status</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredExpenses.map(r => {
                          const thumbUrl = parkingExpenseThumbUrls[r.receipt_photo_path];
                          const driverRecentShifts = shifts
                            .filter(s => (s.driver_id === r.driver_id) && s.status === 'completed')
                            .slice(0, 20);
                          return (
                            <tr key={r.id}>
                              <td>
                                <button
                                  type="button"
                                  onClick={() => openParkingExpenseLightbox(r.receipt_photo_path)}
                                  style={{ position: 'relative', width: '40px', height: '40px', border: 'none', padding: 0, cursor: 'zoom-in', borderRadius: '6px', overflow: 'hidden', background: 'var(--card-bg-hover)' }}
                                  title="View receipt photo"
                                >
                                  {thumbUrl ? (
                                    <img src={thumbUrl} alt="Parking receipt" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  ) : (
                                    <ParkingCircle size={14} color="var(--charcoal-light)" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
                                  )}
                                </button>
                              </td>
                              <td className="font-medium text-primary" style={{ fontSize: '13px' }}>{toTitleCase(r.driver_name ?? '') || '—'}</td>
                              <td className="text-xs">{r.location ?? '—'}</td>
                              <td className="whitespace-nowrap font-mono tabular-nums text-xs">
                                {new Date(r.parking_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </td>
                              <td className="font-mono tabular-nums font-semibold">£{r.amount.toFixed(2)}</td>
                              <td>
                                {r.shift_id ? (
                                  <CircleCheck size={14} color="#10B981" />
                                ) : r.status === 'pending' ? (
                                  <select
                                    className="select-field"
                                    style={{ fontSize: '11px', padding: '4px 6px' }}
                                    value={parkingShiftAssignment[r.id] ?? ''}
                                    onChange={(e) => setParkingShiftAssignment(prev => ({ ...prev, [r.id]: e.target.value }))}
                                  >
                                    <option value="">Assign shift…</option>
                                    {driverRecentShifts.map(s => (
                                      <option key={s.id} value={s.id}>
                                        {new Date(s.start_time).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                                      </option>
                                    ))}
                                  </select>
                                ) : '—'}
                              </td>
                              <td>
                                <span className={`badge ${r.status === 'approved' ? 'badge-success' : r.status === 'rejected' ? 'badge-danger' : 'badge-warning'}`}>
                                  {r.status === 'approved' ? 'Approved' : r.status === 'rejected' ? 'Rejected' : 'Pending'}
                                </span>
                                {r.auto_approved && (
                                  <span className="text-xs text-muted" style={{ marginLeft: '6px' }} title="No admin reviewed this within 10 hours, so it was approved automatically.">
                                    (auto)
                                  </span>
                                )}
                              </td>
                              <td className="whitespace-nowrap">
                                {r.status === 'pending' && (
                                  <div className="flex items-center" style={{ gap: '6px' }}>
                                    <button
                                      type="button"
                                      disabled={reviewingParkingExpenseId === r.id}
                                      onClick={() => handleReviewParkingExpense(r, 'approved')}
                                      title={r.shift_id || parkingShiftAssignment[r.id] ? 'Approve — reimburses into payroll' : 'Assign a shift first'}
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#10B981', opacity: (r.shift_id || parkingShiftAssignment[r.id]) ? 1 : 0.4 }}
                                    >
                                      <CircleCheck size={18} />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={reviewingParkingExpenseId === r.id}
                                      onClick={() => handleReviewParkingExpense(r, 'rejected')}
                                      title="Reject"
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--brand-red)' }}
                                    >
                                      <CircleX size={18} />
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          );
        })()}

        <ImageLightbox url={parkingExpenseLightboxUrl} onClose={() => setParkingExpenseLightboxUrl(null)} alt="Parking receipt, full size" />

        <AnimatePresence>
        {activationCodeShown && (
          <div
            className="modal-overlay"
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
            onClick={() => setActivationCodeShown(null)}
          >
            <div className="modal-content glass-panel" style={{ width: '440px', maxWidth: '100%', padding: '24px', borderRadius: '16px', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)' }} onClick={e => e.stopPropagation()}>
              <div className="flex align-center justify-between mb-8">
                <h3 className="text-md font-bold text-primary m-0">
                  {activationCodeShown.reason === 'created' ? 'Employee created' : 'New activation code'}
                </h3>
                <button type="button" onClick={() => setActivationCodeShown(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--charcoal-light)' }}>
                  <X size={18} />
                </button>
              </div>
              <p className="text-xs text-secondary m-0 mb-16">
                Give <strong className="text-primary">{activationCodeShown.name}</strong> this one-time activation code.
                In the Tachyo app they'll enter their Driver ID <strong className="text-primary font-mono">{activationCodeShown.driverId.toUpperCase()}</strong> and this code, then pick their own 6-digit PIN. The code works once and expires in 48 hours.
              </p>
              <div style={{ background: 'var(--card-bg-hover)', border: '2px dashed var(--brand-red)', borderRadius: '10px', padding: '18px', textAlign: 'center', marginBottom: '14px' }}>
                <p className="font-mono font-black" style={{ fontSize: '30px', letterSpacing: '0.12em', margin: 0, color: 'var(--brand-red)' }}>{activationCodeShown.code}</p>
              </div>
              <div className="flex" style={{ gap: '8px' }}>
                <button
                  type="button"
                  className="btn flex align-center"
                  style={{ flex: 1, justifyContent: 'center', gap: '6px', padding: '10px', backgroundColor: 'var(--brand-red)', color: '#fff', borderColor: 'var(--brand-red)', fontWeight: 700 }}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(activationCodeShown.code);
                      showToast('Activation code copied.', 'success');
                    } catch (_) {
                      // Clipboard blocked — value is still visible on screen.
                    }
                  }}
                >
                  Copy code
                </button>
                <button type="button" className="btn btn-secondary" style={{ padding: '6px 12px' }} onClick={() => setActivationCodeShown(null)}>Done</button>
              </div>
              <p className="text-xs text-muted m-0 mt-12">Save the code before closing — we can't show it again. If it's lost, issue a new one from the row menu.</p>
            </div>
          </div>
        )}

        {settingsModalOpen && (
          <motion.div
            className="modal-overlay"
            style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}
            onClick={() => setSettingsModalOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
          <motion.div
            className="modal-content glass-panel"
            style={{ width: '760px', maxWidth: '100%', maxHeight: '88vh', display: 'flex', flexDirection: 'column', borderRadius: '18px', backgroundColor: 'var(--card-bg)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)', border: '1px solid var(--border-color)', overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #E5E7EB' }}>
              <div>
                <span className="font-black text-primary" style={{ fontSize: '16px' }}>Settings</span>
                <p className="text-xs text-muted" style={{ margin: '4px 0 0' }}>
                  Everything that controls who can join {teamOrgInfo?.name ?? 'your company'} and where your drivers clock in.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSettingsModalOpen(false)}
                aria-label="Close"
                style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--charcoal-light)', display: 'flex' }}
              >
                <X size={18} />
              </button>
            </div>

            {(isLoadingTeam || teamError) && (
              <div style={{ padding: '12px 24px 0' }}>
                {isLoadingTeam && <p className="text-sm text-muted">Loading…</p>}
                {teamError && <div className="login-notice login-notice--error mb-16">{teamError}</div>}
              </div>
            )}

            <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
              <nav className="settings-nav">
                {([
                  { id: 'company' as const, label: 'Company', icon: Building2 },
                  { id: 'plan' as const, label: 'Your plan', icon: CreditCard },
                  ...(userRole === 'payroll_admin' ? [
                    { id: 'access-codes' as const, label: 'Access Codes', icon: KeyRound },
                    { id: 'depots' as const, label: 'Depots', icon: MapPinned },
                    { id: 'alerts' as const, label: 'Alerts', icon: Bell },
                    { id: 'payroll' as const, label: 'Payroll', icon: Banknote },
                    { id: 'fuel-bonus' as const, label: 'Fuel Bonus', icon: Fuel },
                  ] : []),
                  { id: 'appearance' as const, label: 'Appearance', icon: Palette },
                  { id: 'security' as const, label: 'Security', icon: ShieldCheck },
                  { id: 'legal' as const, label: 'Legal', icon: Scale },
                ]).map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveSettingsSection(id)}
                    className={`settings-nav-btn ${activeSettingsSection === id ? 'settings-nav-btn--active' : ''}`}
                  >
                    {activeSettingsSection === id && (
                      <motion.div
                        layoutId="settingsNavHighlight"
                        className="settings-nav-highlight"
                        transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                    <span className="settings-nav-btn-label">
                      <Icon size={14} />
                      {label}
                    </span>
                  </button>
                ))}
              </nav>

              <div style={{ flex: 1, minWidth: 0, padding: '20px 24px', overflowY: 'auto' }}>
                {activeSettingsSection === 'company' && (
                  <div>
                    <div className="settings-panel-header">
                      <p>Company</p>
                      <p>Your organisation's driver login details.</p>
                    </div>
                    {teamOrgInfo && (
                      <div className="input-group">
                        <label className="input-label">DRIVER COMPANY CODE</label>
                        <div className="login-field">
                          <span className="login-field-icon"><Users size={16} /></span>
                          <input readOnly className="login-input" value={teamOrgInfo.slug} />
                        </div>
                        <p className="text-xs text-muted mt-4">
                          Fixed at company registration — rotating it would break every existing driver's login.
                        </p>
                      </div>
                    )}

                    <h4 className="font-bold text-xs text-muted mt-24 mb-4" style={{ textTransform: 'uppercase', letterSpacing: '0.02em' }}>Driver Support Numbers</h4>
                    <p className="text-xs text-muted mb-16">
                      Shown to your own drivers under Settings → Support in the driver app. Leave either blank to hide that row entirely.
                    </p>

                    {supportContactsError && <div className="login-notice login-notice--error mb-16">{supportContactsError}</div>}
                    {supportContactsSuccess && <div className="login-notice login-notice--success mb-16">{supportContactsSuccess}</div>}

                    <div className="input-group">
                      <label className="input-label" htmlFor="support-phone-1">SUPPORT NUMBER 1</label>
                      <input
                        id="support-phone-1"
                        type="tel"
                        className="input-field"
                        placeholder="e.g. +44 7700 900123"
                        value={supportPhone1}
                        onChange={(e) => setSupportPhone1(e.target.value)}
                      />
                    </div>

                    <div className="input-group">
                      <label className="input-label" htmlFor="support-phone-2">SUPPORT NUMBER 2 (OPTIONAL)</label>
                      <input
                        id="support-phone-2"
                        type="tel"
                        className="input-field"
                        placeholder="e.g. +44 7700 900456"
                        value={supportPhone2}
                        onChange={(e) => setSupportPhone2(e.target.value)}
                      />
                    </div>

                    <button type="button" className="btn btn-primary" disabled={isSavingSupportContacts} onClick={handleSaveSupportContacts}>
                      {(isSavingSupportContacts || supportContactsSuccess) && <SaveIcon saving={isSavingSupportContacts} success={!!supportContactsSuccess} />}
                      {isSavingSupportContacts ? 'Saving…' : supportContactsSuccess ? 'Saved' : 'Save Support Numbers'}
                    </button>
                  </div>
                )}

                {userRole === 'payroll_admin' && activeSettingsSection === 'access-codes' && (
                  <div>
                    <div className="settings-panel-header">
                      <p>Access Codes</p>
                      <p>Create dashboard accounts and manage staff registration codes.</p>
                    </div>

                    <h4 className="font-bold text-xs text-muted mb-4" style={{ textTransform: 'uppercase', letterSpacing: '0.02em' }}>Create Account</h4>
                    <p className="text-xs text-muted mb-16">
                      Set up dashboard access for a new teammate directly — no registration code needed.
                      Share the temporary password with them yourself; they'll be asked to change it on first login.
                    </p>

                    {createAccountError && <div className="login-notice login-notice--error mb-16">{createAccountError}</div>}
                    {createAccountSuccess && <div className="login-notice login-notice--success mb-16">{createAccountSuccess}</div>}

                    <form onSubmit={handleCreateAccount} className="mb-24">
                      <div className="input-group">
                        <label className="input-label" htmlFor="new-account-email">WORK EMAIL</label>
                        <input
                          id="new-account-email"
                          type="email"
                          className="input-field"
                          placeholder="firstname.lastname@yourcompany.com"
                          value={newAccountEmail}
                          onChange={(e) => setNewAccountEmail(e.target.value)}
                        />
                      </div>
                      <div className="flex" style={{ gap: '12px' }}>
                        <div className="input-group" style={{ flex: 1 }}>
                          <label className="input-label" htmlFor="new-account-role">DEPARTMENT</label>
                          <select
                            id="new-account-role"
                            className="select-field"
                            value={newAccountRole}
                            onChange={(e) => setNewAccountRole(e.target.value as UserRole)}
                          >
                            <option value="logistics">Logistics</option>
                            <option value="payroll_admin">Payroll Admin</option>
                          </select>
                        </div>
                        <div className="input-group" style={{ flex: 1 }}>
                          <label className="input-label" htmlFor="new-account-password">TEMPORARY PASSWORD</label>
                          <input
                            id="new-account-password"
                            type="text"
                            className="input-field"
                            placeholder="At least 8 characters"
                            value={newAccountPassword}
                            onChange={(e) => setNewAccountPassword(e.target.value)}
                          />
                        </div>
                      </div>
                      <button type="submit" className="btn btn-primary" disabled={isCreatingAccount}>
                        {(isCreatingAccount || createAccountSuccess) && <SaveIcon saving={isCreatingAccount} success={!!createAccountSuccess} />}
                        {isCreatingAccount ? 'Creating…' : 'Create Account'}
                      </button>
                    </form>

                    <h4 className="font-bold text-xs text-muted mb-4" style={{ textTransform: 'uppercase', letterSpacing: '0.02em' }}>Registration Codes</h4>
                    <p className="text-xs text-muted mb-16">
                      Kept for reference only — nothing in the dashboard currently asks for these.
                    </p>
                    {(['logistics', 'payroll'] as const).map((codeType) => (
                      <div className="input-group" key={codeType}>
                        <label className="input-label">
                          {codeType === 'logistics' ? 'LOGISTICS REGISTRATION CODE' : 'PAYROLL REGISTRATION CODE'}
                        </label>
                        {justRotatedCode?.type === codeType ? (
                          <>
                            <div className="login-field">
                              <span className="login-field-icon"><Shield size={16} /></span>
                              <input readOnly className="login-input" value={justRotatedCode.code} />
                            </div>
                            <p className="text-xs text-muted mt-4">
                              Shown once — save it now. The old code no longer works.
                            </p>
                          </>
                        ) : (
                          <div className="login-field" style={{ justifyContent: 'space-between' }}>
                            <span className="text-sm text-muted" style={{ padding: '0 8px' }}>●●●●●●●●●●</span>
                            <button
                              type="button"
                              className="login-forgot"
                              disabled={rotatingCode === codeType}
                              onClick={() => handleRotateCode(codeType)}
                            >
                              {rotatingCode === codeType ? 'Rotating…' : 'Rotate'}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {userRole === 'payroll_admin' && activeSettingsSection === 'depots' && (
                  <div>
                    <div className="settings-panel-header">
                      <p>Depots</p>
                      <p>Manage the depot locations your drivers clock in and out from.</p>
                    </div>
                    <p className="text-sm text-muted mb-16">
                      Drivers clock in against one of these locations, and each one's radius defines the
                      geofence used to detect arrivals. Add at least one before clocking a driver in manually.
                    </p>

                    {depots.length === 0 ? (
                      <NoData className="py-24 mb-16" />
                    ) : (
                      <div className="table-container mb-16">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Coordinates</th>
                              <th>Radius</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {depots.map((depot) => (
                              <tr key={depot.id}>
                                <td className="font-bold text-primary">
                                  {depot.name}
                                  {depot.address && <div className="text-xs text-muted">{depot.address}</div>}
                                </td>
                                <td className="font-mono text-xs">{depot.latitude.toFixed(5)}, {depot.longitude.toFixed(5)}</td>
                                <td>{depot.geofence_radius_m.toLocaleString('en-GB')}m</td>
                                <td>
                                  <span className="flex align-center" style={{ gap: '12px' }}>
                                    <button
                                      type="button"
                                      className="login-forgot"
                                      onClick={() => startEditDepot(depot)}
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      className="login-forgot"
                                      style={{ color: 'var(--error-color, #DC2626)' }}
                                      onClick={() => handleDeleteDepot(depot.id, depot.name)}
                                    >
                                      Remove
                                    </button>
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {depotFormError && <div className="login-notice login-notice--error mb-16">{depotFormError}</div>}

                    <form id="depot-form" onSubmit={handleAddDepot}>
                      {editingDepotId && (
                        <p className="text-xs font-bold" style={{ margin: '0 0 12px', color: 'var(--brand-red)' }}>
                          Editing “{newDepotName || 'depot'}” — change the details below, then Save changes.
                        </p>
                      )}
                      <div className="input-group">
                        <label className="input-label" htmlFor="depot-name">DEPOT NAME</label>
                        <input
                          id="depot-name"
                          type="text"
                          className="input-field"
                          placeholder="e.g. Rossington Depot"
                          value={newDepotName}
                          onChange={(e) => setNewDepotName(e.target.value)}
                        />
                      </div>
                      <div className="input-group">
                        <label className="input-label" htmlFor="depot-address">ADDRESS (OPTIONAL)</label>
                        <input
                          id="depot-address"
                          type="text"
                          className="input-field"
                          placeholder="e.g. Great North Road, Rossington"
                          value={newDepotAddress}
                          onChange={(e) => setNewDepotAddress(e.target.value)}
                        />
                      </div>
                      <button
                        type="button"
                        className="btn"
                        style={{ marginBottom: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        onClick={handleUseCurrentLocationDepot}
                        disabled={isLocatingDepot}
                      >
                        <LocateFixed size={14} />
                        {isLocatingDepot ? 'Getting your location…' : 'Use My Current Location'}
                      </button>

                      <div className="flex" style={{ gap: '12px' }}>
                        <div className="input-group" style={{ flex: 1 }}>
                          <label className="input-label" htmlFor="depot-lat">LATITUDE</label>
                          <input
                            id="depot-lat"
                            type="text"
                            inputMode="decimal"
                            className="input-field"
                            placeholder="53.4818"
                            value={newDepotLat}
                            onChange={(e) => setNewDepotLat(e.target.value)}
                          />
                        </div>
                        <div className="input-group" style={{ flex: 1 }}>
                          <label className="input-label" htmlFor="depot-lng">LONGITUDE</label>
                          <input
                            id="depot-lng"
                            type="text"
                            inputMode="decimal"
                            className="input-field"
                            placeholder="-1.0866"
                            value={newDepotLng}
                            onChange={(e) => setNewDepotLng(e.target.value)}
                          />
                        </div>
                        <div className="input-group" style={{ width: '110px' }}>
                          <label className="input-label" htmlFor="depot-radius">RADIUS (M)</label>
                          <input
                            id="depot-radius"
                            type="text"
                            inputMode="numeric"
                            className="input-field"
                            value={newDepotRadius}
                            onChange={(e) => setNewDepotRadius(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="flex align-center" style={{ gap: '10px', margin: '2px 0 4px' }}>
                        <span className="text-xs text-muted">25 m</span>
                        <input
                          type="range"
                          min={25}
                          max={1000}
                          step={5}
                          aria-label="Geofence radius"
                          value={Math.min(1000, Math.max(25, parseInt(newDepotRadius, 10) || 150))}
                          onChange={(e) => setNewDepotRadius(e.target.value)}
                          style={{ flex: 1, accentColor: 'var(--charcoal)' }}
                        />
                        <span className="text-xs text-muted">1,000 m</span>
                      </div>
                      <p className="text-xs text-muted" style={{ margin: '4px 0 0' }}>
                        The slider covers 25–1,000 m; type any other number of metres in the box to go beyond it.
                      </p>
                      <p className="text-xs text-muted mt-4 mb-16">
                        Tap "Use My Current Location" while standing at the depot, or find coordinates by
                        searching the address on Google Maps and copying the latitude/longitude shown for the pin.
                      </p>
                      <div className="flex align-center" style={{ gap: '8px', flexWrap: 'wrap' }}>
                        <button type="submit" className="btn btn-primary" disabled={isSavingDepot}>
                          {isSavingDepot && <SaveIcon saving success={false} />}
                          {isSavingDepot ? 'Saving…' : editingDepotId ? 'Save changes' : 'Add Depot'}
                        </button>
                        {editingDepotId && (
                          <button type="button" className="btn btn-secondary" onClick={resetDepotForm}>Cancel</button>
                        )}
                      </div>
                    </form>
                  </div>
                )}

                {userRole === 'payroll_admin' && activeSettingsSection === 'alerts' && (
                  <div>
                    <div className="settings-panel-header">
                      <p>Alerts</p>
                      <p>Control audio and alert behaviour across the dashboard.</p>
                    </div>
                    <div className="flex align-center justify-between" style={{ padding: '14px 16px', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
                      <div>
                        <p className="font-bold text-sm text-primary" style={{ margin: '0 0 2px' }}>Audio Alarm</p>
                        <p className="text-xs text-muted" style={{ margin: 0 }}>
                          Play a sound when a driver triggers an SOS or an idle/break alert.
                        </p>
                      </div>
                      <Switch
                        value={!isAudioMuted}
                        onToggle={() => setIsAudioMuted(!isAudioMuted)}
                        iconOn={<Volume2 size={13} />}
                        iconOff={<VolumeX size={13} />}
                      />
                    </div>
                    <p className="text-xs text-muted mt-8">
                      This is the same alarm control available from Alert Monitors — muting it here mutes it everywhere.
                    </p>

                    <div className="flex align-center justify-between mt-16" style={{ padding: '14px 16px', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
                      <div>
                        <p className="font-bold text-sm text-primary" style={{ margin: '0 0 2px' }}>Allow Drivers to Request Night Out</p>
                        <p className="text-xs text-muted" style={{ margin: 0 }}>
                          Shows "Request Night Out" in the driver app's Action Hub. Off by default — turn on only if {teamOrgInfo?.name ?? 'your company'} runs a Night Out allowance scheme.
                        </p>
                      </div>
                      <Switch
                        value={orgAlertSettings.allowDriverNightOutRequests}
                        onToggle={handleToggleNightOutRequests}
                        iconOn={<Moon size={13} />}
                        iconOff={<Moon size={13} />}
                      />
                    </div>

                    <h4 className="font-bold text-xs text-muted mt-24 mb-4" style={{ textTransform: 'uppercase', letterSpacing: '0.02em' }}>Flag &amp; Alert Thresholds</h4>
                    <p className="text-xs text-muted mb-16">
                      When a shift, idle period, or gap between shifts should be flagged — set to match how {teamOrgInfo?.name ?? 'your company'} actually operates.
                    </p>

                    {alertSettingsError && <div className="login-notice login-notice--error mb-16">{alertSettingsError}</div>}
                    {alertSettingsSuccess && <div className="login-notice login-notice--success mb-16">{alertSettingsSuccess}</div>}

                    <div className="input-group">
                      <label className="input-label" htmlFor="long-shift-flag-hours">LONG-SHIFT FLAG (HOURS)</label>
                      <input
                        id="long-shift-flag-hours"
                        type="number"
                        min="0.5"
                        step="0.5"
                        className="input-field"
                        value={alertSettingsForm.longShiftFlagHours}
                        onChange={(e) => setAlertSettingsForm(f => ({ ...f, longShiftFlagHours: e.target.value }))}
                      />
                      <p className="text-xs text-muted mt-4">
                        Shifts longer than this show as a Critical Anomaly in Flags &amp; Reviews and the detailed shift table.
                      </p>
                    </div>

                    <div className="input-group">
                      <div className="flex align-center justify-between" style={{ gap: '10px', marginBottom: '6px' }}>
                        <label className="input-label" htmlFor="idle-alert-minutes" style={{ margin: 0 }}>IDLE DETECTION</label>
                        <label className="flex align-center text-xs font-bold" style={{ gap: '8px', cursor: isSavingIdleToggle ? 'default' : 'pointer', color: 'var(--charcoal)' }}>
                          <span>{orgAlertSettings.idleDetectionEnabled ? 'On' : 'Off'}</span>
                          <input
                            type="checkbox"
                            checked={orgAlertSettings.idleDetectionEnabled}
                            disabled={isSavingIdleToggle}
                            onChange={handleToggleIdleDetection}
                          />
                        </label>
                      </div>
                      <input
                        id="idle-alert-minutes"
                        type="number"
                        min="1"
                        step="1"
                        className="input-field"
                        value={alertSettingsForm.idleAlertMinutes}
                        disabled={!orgAlertSettings.idleDetectionEnabled}
                        onChange={(e) => setAlertSettingsForm(f => ({ ...f, idleAlertMinutes: e.target.value }))}
                      />
                      <p className="text-xs text-muted mt-4">
                        {orgAlertSettings.idleDetectionEnabled
                          ? 'How long any employee on shift can be stationary before an idle alert fires. Covers drivers, mechanics and logistics staff.'
                          : 'Idle alerts are turned off for the whole company. Dashboard and Alert Panel will hide the idle section.'}
                      </p>
                    </div>

                    <div className="input-group">
                      <label className="input-label" htmlFor="idle-action">WHEN SOMEONE IS IDLE</label>
                      <select
                        id="idle-action"
                        className="input-field"
                        value={idlePolicy.action}
                        disabled={!orgAlertSettings.idleDetectionEnabled || isSavingIdlePolicy}
                        onChange={(e) => saveIdlePolicy({ action: e.target.value as 'none' | 'freeze_time' })}
                      >
                        <option value="none">Alert only, keep paying time</option>
                        <option value="freeze_time">Freeze time while idle, the idle stretch is not paid</option>
                      </select>
                      <p className="text-xs text-muted mt-4">
                        Applies once the idle time above is reached. Frozen time is the whole stationary stretch, from when the driver stopped until they move again, and is deducted from the shift&apos;s paid hours.
                      </p>
                    </div>

                    <div className="input-group">
                      <div className="flex align-center justify-between" style={{ gap: '10px', marginBottom: '6px' }}>
                        <label className="input-label" style={{ margin: 0 }}>TELL THE DRIVER</label>
                        <label className="flex align-center text-xs font-bold" style={{ gap: '8px', cursor: 'pointer', color: 'var(--charcoal)' }}>
                          <span>{idlePolicy.notifyDriver ? 'On' : 'Off'}</span>
                          <input type="checkbox" checked={idlePolicy.notifyDriver} disabled={!orgAlertSettings.idleDetectionEnabled || isSavingIdlePolicy} onChange={() => saveIdlePolicy({ notifyDriver: !idlePolicy.notifyDriver })} />
                        </label>
                      </div>
                      <p className="text-xs text-muted mt-4">
                        The app shows the driver once when they open it: when they were idle and whether that time was frozen.
                      </p>
                    </div>

                    <div className="flex" style={{ gap: '12px' }}>
                      <div className="input-group" style={{ flex: 1 }}>
                        <label className="input-label" htmlFor="night-out-min-gap">NIGHT-OUT MIN GAP (HOURS)</label>
                        <input
                          id="night-out-min-gap"
                          type="number"
                          min="0"
                          step="0.5"
                          className="input-field"
                          value={alertSettingsForm.nightOutMinGapHours}
                          onChange={(e) => setAlertSettingsForm(f => ({ ...f, nightOutMinGapHours: e.target.value }))}
                        />
                      </div>
                      <div className="input-group" style={{ flex: 1 }}>
                        <label className="input-label" htmlFor="night-out-max-gap">NIGHT-OUT MAX GAP (HOURS)</label>
                        <input
                          id="night-out-max-gap"
                          type="number"
                          min="0"
                          step="0.5"
                          className="input-field"
                          value={alertSettingsForm.nightOutMaxGapHours}
                          onChange={(e) => setAlertSettingsForm(f => ({ ...f, nightOutMaxGapHours: e.target.value }))}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted mb-16">
                      A gap between two shifts for the same driver within this window gets suggested as a night out.
                    </p>

                    <div className="input-group">
                      <label className="input-label" htmlFor="compliance-alert-lead-days">COMPLIANCE ALERT LEAD TIME (DAYS)</label>
                      <select
                        id="compliance-alert-lead-days"
                        className="select-field"
                        value={alertSettingsForm.complianceAlertLeadDays}
                        onChange={(e) => setAlertSettingsForm(f => ({ ...f, complianceAlertLeadDays: e.target.value }))}
                      >
                        {[3, 7, 14, 30].map(days => (
                          <option key={days} value={days}>{days} days</option>
                        ))}
                      </select>
                      <p className="text-xs text-muted mt-4">
                        How many days before an inspection (MOT, PMI, Tacho, Brake Test, LOLER) is due it shows as "Due Soon" — drives the Fleet Roadworthiness table, the notifications bell, and the Compliance &amp; Safety overview.
                      </p>
                    </div>

                    <div className="input-group">
                      <label className="input-label" htmlFor="walkaround-target-minutes">WALK-AROUND CHECK TARGET (MINUTES)</label>
                      <input
                        id="walkaround-target-minutes"
                        type="number"
                        min="1"
                        step="1"
                        className="input-field"
                        value={alertSettingsForm.walkaroundCheckTargetMinutes}
                        onChange={(e) => setAlertSettingsForm(f => ({ ...f, walkaroundCheckTargetMinutes: e.target.value }))}
                      />
                      <p className="text-xs text-muted mt-4">
                        A completed walk-around check under this many minutes is flagged as possibly rushed in Walk-Around Check History — a benchmark you set, not a DVSA-mandated minimum.
                      </p>
                    </div>

                    <div className="input-group mb-16">
                      <span className="input-label">FUEL THEFT DETECTION</span>
                      <p className="text-xs text-muted m-0">
                        Fixed fleet-wide rule, not configurable per company: every truck is refuelled to the brim, so any full-tank-to-full-tank fill below <strong>7.0 UK MPG</strong> (worse than 40 L/100km) is flagged as a fuel anomaly in the Fuel &amp; AdBlue Receipts Audit. Computed automatically the moment a fuel log is submitted.
                      </p>
                    </div>

                    <div className="input-group">
                      <label className="input-label" htmlFor="load-reminder-minutes">LOAD REMINDER (MINUTES STATIONARY)</label>
                      <input
                        id="load-reminder-minutes"
                        type="number"
                        min="5"
                        max="600"
                        step="1"
                        className="input-field"
                        value={alertSettingsForm.loadReminderMinutes}
                        onChange={(e) => setAlertSettingsForm(f => ({ ...f, loadReminderMinutes: e.target.value }))}
                      />
                    </div>
                    <p className="text-xs text-muted mb-16">
                      When a driver's or mechanic's vehicle has been stationary this long, the app reminds them to attach a load (if none is attached) or to confirm its delivery (if it isn't confirmed yet). One reminder per stop.
                    </p>

                    <button type="button" className="btn btn-primary" disabled={isSavingAlertSettings} onClick={handleSaveAlertSettings}>
                      {(isSavingAlertSettings || alertSettingsSuccess) && <SaveIcon saving={isSavingAlertSettings} success={!!alertSettingsSuccess} />}
                      {isSavingAlertSettings ? 'Saving…' : alertSettingsSuccess ? 'Saved' : 'Save Thresholds'}
                    </button>

                    <h4 className="font-bold text-xs text-muted mt-24 mb-4" style={{ textTransform: 'uppercase', letterSpacing: '0.02em' }}>GPS Tracking</h4>
                    <p className="text-xs text-muted mb-16">
                      Drivers can stop live tracking by closing the app or removing it from the background. Choose how {teamOrgInfo?.name ?? 'your company'} detects this and what happens to the driver's time.
                    </p>

                    {gpsPolicyMessage && <div className={`login-notice ${gpsPolicyMessage.kind === 'error' ? 'login-notice--error' : 'login-notice--success'} mb-16`}>{gpsPolicyMessage.text}</div>}

                    <div className="input-group">
                      <div className="flex align-center justify-between" style={{ gap: '10px', marginBottom: '6px' }}>
                        <label className="input-label" htmlFor="gps-offline-minutes" style={{ margin: 0 }}>DETECT DRIVERS WITH NO GPS</label>
                        <label className="flex align-center text-xs font-bold" style={{ gap: '8px', cursor: 'pointer', color: 'var(--charcoal)' }}>
                          <span>{gpsPolicy.enabled ? 'On' : 'Off'}</span>
                          <input type="checkbox" checked={gpsPolicy.enabled} disabled={isSavingGpsPolicy} onChange={() => saveGpsPolicy({ enabled: !gpsPolicy.enabled })} />
                        </label>
                      </div>
                      <input
                        id="gps-offline-minutes"
                        type="number"
                        min="5"
                        max="120"
                        step="1"
                        className="input-field"
                        value={gpsPolicyForm.afterMinutes}
                        disabled={!gpsPolicy.enabled}
                        onChange={(e) => setGpsPolicyForm(f => ({ ...f, afterMinutes: e.target.value }))}
                      />
                      <p className="text-xs text-muted mt-4">
                        Minutes without a GPS ping, while a driver is clocked in, before a GPS Tracking Off alert appears in the Alert Panel.
                      </p>
                    </div>

                    <div className="input-group">
                      <div className="flex align-center justify-between" style={{ gap: '10px', marginBottom: '6px' }}>
                        <label className="input-label" style={{ margin: 0 }}>WARN THE DRIVER</label>
                        <label className="flex align-center text-xs font-bold" style={{ gap: '8px', cursor: 'pointer', color: 'var(--charcoal)' }}>
                          <span>{gpsPolicy.notifyDriver ? 'On' : 'Off'}</span>
                          <input type="checkbox" checked={gpsPolicy.notifyDriver} disabled={isSavingGpsPolicy || !gpsPolicy.enabled} onChange={() => saveGpsPolicy({ notifyDriver: !gpsPolicy.notifyDriver })} />
                        </label>
                      </div>
                      <p className="text-xs text-muted mt-4">
                        The app notifies the driver when tracking stops, saying what may happen: a frozen clock or an automatic clock-out.
                      </p>
                    </div>

                    <div className="input-group">
                      <label className="input-label" htmlFor="gps-offline-action">WHEN TRACKING STAYS OFF</label>
                      <select
                        id="gps-offline-action"
                        className="input-field"
                        value={gpsPolicy.action}
                        disabled={!gpsPolicy.enabled || isSavingGpsPolicy}
                        onChange={(e) => saveGpsPolicy({ action: e.target.value as GpsPolicySettings['action'] })}
                      >
                        <option value="none">Alert only, keep paying time</option>
                        <option value="freeze_time">Freeze time while offline, the stretch is not paid</option>
                        <option value="clock_out">Clock the driver out automatically</option>
                      </select>
                      <p className="text-xs text-muted mt-4">
                        Frozen time is deducted from the shift's paid hours. An automatic clock-out ends the shift at the last GPS ping.
                      </p>
                    </div>

                    {gpsPolicy.action === 'clock_out' && (
                      <div className="input-group">
                        <label className="input-label" htmlFor="gps-clockout-minutes">AUTO CLOCK-OUT AFTER (MINUTES)</label>
                        <input
                          id="gps-clockout-minutes"
                          type="number"
                          min="10"
                          max="480"
                          step="1"
                          className="input-field"
                          value={gpsPolicyForm.clockOutMinutes}
                          disabled={!gpsPolicy.enabled}
                          onChange={(e) => setGpsPolicyForm(f => ({ ...f, clockOutMinutes: e.target.value }))}
                        />
                      </div>
                    )}

                    <button type="button" className="btn btn-primary" disabled={isSavingGpsPolicy} onClick={() => saveGpsPolicy()}>
                      {isSavingGpsPolicy ? 'Saving…' : 'Save GPS Settings'}
                    </button>
                  </div>
                )}

                {activeSettingsSection === 'appearance' && (
                  <div>
                    <div className="settings-panel-header">
                      <p>Appearance</p>
                      <p>Choose how the dashboard looks — light, or match your device.</p>
                    </div>
                    <div className="flex align-center justify-between" style={{ padding: '14px 16px', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
                      <div>
                        <p className="font-bold text-sm text-primary" style={{ margin: '0 0 2px' }}>Theme</p>
                        <p className="text-xs text-muted" style={{ margin: 0 }}>
                          Light, or match your device's setting.
                        </p>
                      </div>
                      <ThemeToggle />
                    </div>
                    <p className="text-xs text-muted mt-8">
                      Same control as the icon beside Settings in the sidebar — either one changes it everywhere.
                    </p>
                  </div>
                )}

                {activeSettingsSection === 'plan' && <PlanSettings entitlements={entitlements} companyName={teamOrgInfo?.name} />}
                {userRole === 'payroll_admin' && activeSettingsSection === 'payroll' && <PayRulesSettings organizationId={currentOrgId} />}
                {userRole === 'payroll_admin' && activeSettingsSection === 'fuel-bonus' && <FuelBonusSettings />}
                {activeSettingsSection === 'security' && <SecuritySettings />}
                {activeSettingsSection === 'legal' && (
                  <div>
                    <div className="settings-panel-header">
                      <p>Legal</p>
                      <p>The agreements governing your use of Tachyo — kept up to date on our site, not duplicated here.</p>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {([
                        ['B2B Terms of Service', 'https://tachyo.co.uk/legal/terms'],
                        ['Privacy Policy', 'https://tachyo.co.uk/legal/privacy'],
                        ['Data Processing Addendum', 'https://tachyo.co.uk/legal/dpa'],
                        ['Telematics & GPS Policy', 'https://tachyo.co.uk/legal/telematics'],
                        ['Refund & Data Purge Policy', 'https://tachyo.co.uk/legal/refund-policy'],
                      ] as const).map(([label, href]) => (
                        <a
                          key={href}
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex align-center justify-between"
                          style={{ padding: '14px 16px', border: '1px solid var(--border-color)', borderRadius: '12px', color: 'var(--charcoal)', textDecoration: 'none' }}
                        >
                          <span className="font-bold text-sm">{label}</span>
                          <ExternalLink size={14} />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
          </motion.div>
        )}
        </AnimatePresence>

      </div>

      {/* Edit Payroll — right-edge slide-over drawer (migration 048).
          Single mode carries the full shift so the drawer can show its
          locked rate snapshot; bulk mode applies the same adjustments
          uniformly to every selected shift. */}
      {actionModal && actionModal.isOpen && (() => {
        const s = actionModal.shift;
        const shiftContext: PayrollShiftContext | undefined = s ? {
          driver_name: s.driver_name,
          start_time: s.start_time,
          end_time: s.end_time,
          total_hours: s.total_hours,
          vehicle_number: s.vehicle_number,
          applied_rate_type: s.applied_rate_type ?? null,
          applied_rate_amount: s.applied_rate_amount ?? null,
          rate_snapshot_timestamp: s.rate_snapshot_timestamp ?? null,
          total_pay: s.total_pay,
        } : undefined;
        const isMicroShift = Boolean(s && (s.total_hours ?? 0) > 0 && (s.total_hours ?? 0) < 0.25 && !s.is_micro_shift_override);
        return (
          <PayrollDrawer
            mode={actionModal.type}
            driverName={actionModal.driverName}
            shiftCount={actionModal.shiftIds.length}
            shift={shiftContext}
            defaultNightOut={actionModal.currentNO}
            defaultBonus={actionModal.currentExtras}
            defaultBonusNote={actionModal.currentNote}
            defaultDeduction={actionModal.currentDeduction}
            defaultDeductionReason={actionModal.currentDeductionReason}
            defaultNotes={actionModal.currentNotes}
            defaultMicroOverride={actionModal.currentMicroOverride}
            isMicroShift={isMicroShift}
            isSaving={isSavingPayroll}
            onClose={() => setActionModal(null)}
            onSave={handleSaveModalAction}
          />
        );
      })()}
      {/* Edit Employee Profile Modal — restyled onto the same icon-field
          look as the Add Employee form, and CSS variables instead of
          hardcoded light-only hex (#111827/#6B7280/#D1D5DB etc., which
          also meant this modal didn't adapt to dark mode). The PIN field
          is where "view an employee's password" actually lives in this
          app: PINs are bcrypt-hashed server-side (hash_driver_pin(),
          consolidated_migration.sql) — one-way, so no past PIN can ever
          be displayed again, by anyone, admin included. What genuinely
          answers "remind the employee what their password is" is
          resetting to a new one and telling them that instead — this
          field already did that; it just wasn't easy to generate or
          impossible to miss once set. Both payroll_admin and logistics
          already reach this modal (Driver Profiles isn't role-gated). */}
      {editingEmployee && (() => {
        const isEditingFixed = editRateType === 'Fixed' || editRateType === 'Fixed Shift Rate (Day Rate)';
        return (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="modal-content glass-panel" style={{ width: '520px', maxHeight: '88vh', overflowY: 'auto', padding: '28px', borderRadius: '16px', backgroundColor: 'var(--card-bg)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid var(--border-color)' }}>
            <div className="flex justify-between align-center mb-6" style={{ borderBottom: '2px solid var(--border-color)', paddingBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 className="text-xl font-black text-primary m-0" style={{ margin: 0, fontSize: '18px' }}>Edit Employee Profile</h2>
                <p className="text-xs text-muted mt-1" style={{ fontSize: '12px', margin: '4px 0 0 0' }}>Personal details and compensation for {editingEmployee.full_name}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingEmployee(null)}
                style={{ background: 'none', border: 'none', display: 'flex', cursor: 'pointer', color: 'var(--charcoal-light)' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEmployeeAndCompensation}>
              <div className="input-group mb-16">
                <span className="input-label">EMPLOYEE FULL NAME</span>
                <div className="login-field">
                  <span className="login-field-icon"><User size={15} /></span>
                  <input
                    type="text"
                    className="login-input"
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-16 mb-16">
                <div className="input-group">
                  <span className="input-label">USERNAME / EMPLOYEE ID</span>
                  <div className="login-field">
                    <span className="login-field-icon"><IdCard size={15} /></span>
                    <input
                      type="text"
                      className="login-input"
                      value={editUsername}
                      onChange={(e) => setEditUsername(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="input-group">
                  <span className="input-label">ROLE</span>
                  <select
                    className="select-field"
                    style={{ width: '100%' }}
                    value={editingEmployee.profession ?? 'driver'}
                    onChange={(e) => updateEmployeeProfession(editingEmployee.id, e.target.value as EmployeeProfession)}
                  >
                    <option value="driver">Driver</option>
                    <option value="mechanic">Mechanic</option>
                    <option value="logistics">Dispatcher / Logistics</option>
                  </select>
                </div>
              </div>

              <div className="input-group mb-16">
                <span className="input-label">PHONE NUMBER</span>
                <div className="login-field">
                  <span className="login-field-icon"><Phone size={15} /></span>
                  <input
                    type="text"
                    className="login-input"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="+44 7700 900100"
                  />
                </div>
              </div>

              <div className="input-group mb-16">
                <span className="input-label">RESET PIN / PASSWORD (OPTIONAL)</span>
                <div className="login-field">
                  <span className="login-field-icon"><Lock size={15} /></span>
                  <input
                    type="text"
                    className="login-input login-input--with-toggle"
                    value={editNewPin}
                    onChange={(e) => setEditNewPin(e.target.value)}
                    placeholder="Leave blank to keep the current PIN"
                    maxLength={6}
                  />
                  <button
                    type="button"
                    className="login-toggle"
                    title="Generate a random PIN"
                    onClick={() => setEditNewPin(generateRandomPin())}
                  >
                    <Sparkles size={15} />
                  </button>
                </div>
                {editNewPin.trim() ? (
                  <div className="login-notice login-notice--success" style={{ marginTop: '8px', marginBottom: 0 }}>
                    New PIN: <strong style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '1px' }}>{editNewPin}</strong> — this is the only time it's shown. Share it with {editingEmployee.full_name} now; once saved it's stored securely and can't be viewed again.
                  </div>
                ) : (
                  <p className="text-xs text-muted mt-4" style={{ marginBottom: 0 }}>Leave blank to keep the existing PIN unchanged.</p>
                )}
              </div>

              <p className="text-xs font-bold text-muted mb-8" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>Compensation</p>
              <div className="input-group mb-16">
                <span className="input-label">AGENCY / SUPPLIER</span>
                <input
                  type="text"
                  className="input-field"
                  style={{ width: '100%' }}
                  value={editAgencyName}
                  onChange={(e) => setEditAgencyName(e.target.value)}
                />
              </div>
              <div className="input-group mb-16">
                <span className="input-label">RATE TYPE</span>
                <select
                  className="select-field"
                  style={{ width: '100%' }}
                  value={editRateType || 'Hourly'}
                  onChange={(e) => setEditRateType(e.target.value)}
                >
                  <option value="Hourly">Hourly</option>
                  <option value="Fixed Shift Rate (Day Rate)">Fixed Shift Rate (Day Rate)</option>
                </select>
              </div>
              {isEditingFixed ? (
                <div className="input-group mb-16">
                  <span className="input-label">FLAT RATE PER SHIFT (£)</span>
                  <input
                    type="number"
                    step="1.00"
                    className="input-field"
                    style={{ width: '100%' }}
                    value={editFixedRate}
                    onChange={(e) => setEditFixedRate(e.target.value)}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-8 mb-16">
                  <div className="input-group">
                    <span className="input-label">MON&ndash;FRI (£/HR)</span>
                    <input
                      type="number"
                      step="0.50"
                      className="input-field"
                      style={{ width: '100%' }}
                      value={editMonFriRate}
                      onChange={(e) => setEditMonFriRate(e.target.value)}
                    />
                  </div>
                  <div className="input-group">
                    <span className="input-label">SATURDAY (£/HR)</span>
                    <input
                      type="number"
                      step="0.50"
                      className="input-field"
                      style={{ width: '100%' }}
                      value={editSatRate}
                      onChange={(e) => setEditSatRate(e.target.value)}
                    />
                  </div>
                  <div className="input-group">
                    <span className="input-label">SUNDAY (£/HR)</span>
                    <input
                      type="number"
                      step="0.50"
                      className="input-field"
                      style={{ width: '100%' }}
                      value={editSunRate}
                      onChange={(e) => setEditSunRate(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {editEmployeeError && (
                <div className="login-notice login-notice--error">{editEmployeeError}</div>
              )}

              <div className="flex gap-12 justify-end" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingEmployee(null)}
                  disabled={isSavingEmployee}
                  style={{ padding: '6px 12px', borderRadius: '8px', fontWeight: 'bold' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn"
                  disabled={isSavingEmployee}
                  style={{ padding: '6px 12px', borderRadius: '8px', backgroundColor: 'var(--brand-red)', borderColor: 'var(--brand-red)', color: 'white', fontWeight: 'bold' }}
                >
                  {isSavingEmployee && <SaveIcon saving success={false} />}
                  {isSavingEmployee ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
        );
      })()}

      {/* Confirm dialog — replaces window.confirm() */}
      {confirmDialog && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 10001, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="modal-content glass-panel" style={{ width: '420px', padding: '28px', borderRadius: '16px', backgroundColor: 'var(--card-bg)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid var(--border-color)' }}>
            <div className="flex align-center gap-12 mb-16" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <span style={{ display: 'flex', width: '36px', height: '36px', borderRadius: '50%', backgroundColor: confirmDialog.tone === 'danger' ? '#FEE2E2' : '#EEEEEE', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <ShieldAlert size={18} color={confirmDialog.tone === 'danger' ? '#DC2626' : '#333333'} />
              </span>
              <h2 className="text-lg font-black text-primary m-0" style={{ margin: 0 }}>Please confirm</h2>
            </div>
            <p className="text-sm text-secondary mb-24" style={{ marginBottom: '24px', lineHeight: 1.5 }}>{confirmDialog.message}</p>
            <div className="flex gap-12 justify-end" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                className="payroll-pill-btn payroll-pill-btn--outline"
                onClick={() => setConfirmDialog(null)}
              >
                Cancel
              </button>
              <button
                className="payroll-pill-btn"
                onClick={() => {
                  const action = confirmDialog.onConfirm;
                  setConfirmDialog(null);
                  action();
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Compensation Summary -> Fill in the template */}
      {fillTemplateOpen && userRole === 'payroll_admin' && (
        <FillTemplateModal
          shifts={allPayrollShifts}
          rates={payrollRates}
          dateStart={reportDateStart}
          dateEnd={reportDateEnd}
          agency={reportAgencyFilter}
          longShiftHours={orgAlertSettings.longShiftFlagHours}
          organizationId={currentOrgId}
          notify={(m, kind) => showToast(m, kind === 'error' ? 'error' : 'success')}
          onClose={() => setFillTemplateOpen(false)}
          onShowInTable={(driverId) => {
            setShowOnlyNightOutRequested(false);
            setReportViewMode('detailed');
            setSummarySearch('');
            setReportEmployeeFilter(driverId);
            setFillTemplateOpen(false);
          }}
        />
      )}

      {/* Compensation Summary -> preview before Export CSV / Excel / Summary */}
      {exportPreview && userRole === 'payroll_admin' && (
        <ExportPreviewModal
          title={exportPreview.title}
          subtitle={exportPreview.subtitle}
          columns={exportPreview.columns}
          rows={exportPreview.rows}
          defaultFormat={exportPreview.defaultFormat}
          fileBase={exportPreview.fileBase}
          storageKey={exportPreview.storageKey}
          onClose={() => setExportPreview(null)}
          onDownloaded={() => flashExported(exportPreview.flash)}
        />
      )}

      {/* Edit Shift Time modal — replaces the two window.prompt() calls */}
      {editTimeModal && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 10001, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="modal-content glass-panel" style={{ width: '420px', padding: '28px', borderRadius: '16px', backgroundColor: 'var(--card-bg)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid var(--border-color)' }}>
            <h2 className="text-xl font-black text-primary mb-16" style={{ borderBottom: '2px solid #F3F4F6', paddingBottom: '12px', marginBottom: '16px' }}>
              <Clock size={18} style={{ verticalAlign: '-3px', marginRight: '8px' }} />
              Edit Shift Time
            </h2>

            <div className="form-group mb-16" style={{ marginBottom: '16px' }}>
              <label className="text-sm font-bold text-muted block mb-2" style={{ display: 'block', marginBottom: '6px' }}>Start date &amp; time</label>
              <input
                type="datetime-local"
                className="input-field"
                value={editTimeModal.startValue}
                onChange={(e) => setEditTimeModal({ ...editTimeModal, startValue: e.target.value })}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '14px', boxSizing: 'border-box' }}
              />
            </div>

            <div className="form-group mb-16" style={{ marginBottom: '16px' }}>
              <label className="text-sm font-bold text-muted block mb-2" style={{ display: 'block', marginBottom: '6px' }}>End date &amp; time</label>
              <input
                type="datetime-local"
                className="input-field"
                value={editTimeModal.endValue}
                disabled={editTimeModal.isOngoing}
                onChange={(e) => setEditTimeModal({ ...editTimeModal, endValue: e.target.value })}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '14px', boxSizing: 'border-box', opacity: editTimeModal.isOngoing ? 0.5 : 1 }}
              />
            </div>

            <label className="flex align-center gap-8 mb-24" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={editTimeModal.isOngoing}
                onChange={(e) => setEditTimeModal({ ...editTimeModal, isOngoing: e.target.checked })}
              />
              <span className="text-sm text-secondary">Shift is still active (no end time yet)</span>
            </label>

            <div className="flex gap-12 justify-end" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                className="payroll-pill-btn payroll-pill-btn--outline"
                onClick={() => setEditTimeModal(null)}
              >
                Cancel
              </button>
              <button className="payroll-pill-btn" onClick={performEditShiftTime}>
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Depot select modal — replaces the "type 1 or 2" window.prompt() */}
      {depotSelectModal && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 10001, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="modal-content glass-panel" style={{ width: '380px', padding: '28px', borderRadius: '16px', backgroundColor: 'var(--card-bg)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid var(--border-color)' }}>
            <h2 className="text-xl font-black text-primary mb-16" style={{ borderBottom: '2px solid #F3F4F6', paddingBottom: '12px', marginBottom: '16px' }}>
              <MapPinned size={18} style={{ verticalAlign: '-3px', marginRight: '8px' }} />
              Select start depot
            </h2>
            <div className="flex flex-col gap-8" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
              {depotSelectModal.depots.map(depot => (
                <button
                  key={depot.id}
                  className="payroll-pill-btn payroll-pill-btn--outline"
                  onClick={() => performManualClockIn(depotSelectModal.driverId, depot)}
                  style={{ justifyContent: 'flex-start', padding: '8px 14px' }}
                >
                  <MapPinned size={15} />
                  {depot.name}
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                className="payroll-pill-btn payroll-pill-btn--outline"
                onClick={() => setDepotSelectModal(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast — replaces window.alert() */}
      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 10002,
            maxWidth: '380px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            padding: '14px 16px',
            borderRadius: '10px',
            backgroundColor: toast.tone === 'error' ? '#FEF2F2' : toast.tone === 'success' ? '#F0FDF4' : '#F5F5F5',
            border: `1px solid ${toast.tone === 'error' ? '#FECACA' : toast.tone === 'success' ? '#BBF7D0' : '#DDDDDD'}`,
            boxShadow: '0 10px 30px -8px rgba(0, 0, 0, 0.25)',
          }}
        >
          {toast.tone === 'error' ? (
            <ShieldAlert size={18} color="#DC2626" style={{ flexShrink: 0, marginTop: '1px' }} />
          ) : toast.tone === 'success' ? (
            <Check size={18} color="#16A34A" style={{ flexShrink: 0, marginTop: '1px' }} />
          ) : (
            <Bell size={18} color="#333333" style={{ flexShrink: 0, marginTop: '1px' }} />
          )}
          <span
            className="text-sm"
            style={{
              flex: 1,
              whiteSpace: 'pre-line',
              color: toast.tone === 'error' ? '#7F1D1D' : toast.tone === 'success' ? '#14532D' : '#0C4A6E',
              lineHeight: 1.4,
            }}
          >
            {toast.message}
          </span>
          <button
            onClick={() => setToast(null)}
            aria-label="Dismiss"
            style={{ background: 'none', border: 0, cursor: 'pointer', color: 'inherit', opacity: 0.6, display: 'flex', flexShrink: 0 }}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
