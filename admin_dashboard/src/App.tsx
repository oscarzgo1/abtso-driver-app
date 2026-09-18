import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@maplibre/maplibre-gl-leaflet';
import { FlowButton } from './components/ui/flow-button';
import { ImageLightbox } from './components/ui/image-lightbox';
import { Sidebar, SidebarBody, SidebarLink } from './components/ui/sidebar';
import { Switch as BillingCycleSwitch } from './components/ui/switch';
import { InteractivePricingCard } from './components/ui/interactive-pricing-card';
import { CreditCardForm, type CardState, type CardValidity } from './components/ui/credit-card-form';
import { Badge as PricingBadge } from './components/ui/badge';
import { Card as PricingCard, CardContent as PricingCardContent, CardDescription as PricingCardDescription, CardFooter as PricingCardFooter, CardHeader as PricingCardHeader, CardTitle as PricingCardTitle } from './components/ui/card';
import { Button as PricingButton } from './components/ui/button';
import confetti from 'canvas-confetti';
import {
  Users,
  FileSpreadsheet, 
  Clock, 
  ShieldAlert, 
  LogOut, 
  Download, 
  Check, 
  Volume2, 
  VolumeX,
  Compass,
  RefreshCw,
  Mail,
  Lock,
  Shield,
  Bell,
  MapPinned,
  FileText,
  User,
  Briefcase,
  PoundSterling,
  ChevronUp,
  ChevronLeft,
  Activity,
  Search,
  X,
  ChevronDown,
  Wand2,
  ListChecks,
  BarChart3,
  AlertOctagon,
  Moon,
  Building2,
  Calendar,
  AlertTriangle,
  CreditCard,
  TrendingUp,
  TrendingDown,
  Minus,
  LocateFixed,
  Radio,
  Gauge,
  Filter,
  ChevronsUpDown,
  SatelliteDish,
  Truck,
  IdCard,
  Settings,
  KeyRound,
  Palette,
  Warehouse,
  Wrench,
  Phone,
  Sparkles,
  CircleCheck,
  CircleX,
  ShieldCheck,
  UploadCloud,
  ChevronRight,
  Fuel,
  Scale,
  ExternalLink,
  BellOff,
  MapPin,
  CheckCircle2,
  Trash2,
  UserPlus,
  UserX,
  Pencil,
  MoreVertical,
  Receipt,
  Package
} from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { BrandLogo } from './components/ui/brand-logo';
import { useMetricHistory, getMetricTrend } from './hooks/useMetricHistory';
import { KpiSparkline } from './components/ui/kpi-sparkline';
import { AnalyticsGroupedBarChart } from './components/ui/analytics-grouped-bar-chart';
import { BadgeDelta, type BadgeDeltaDirection, type BadgeDeltaTone } from './components/ui/badge-delta';
import TableFilter, { type TableFilterGroup } from './components/ui/table-filter';
import { MarginTrendChart } from './components/ui/margin-trend-chart';
import { EarningsDateRangePicker } from './components/ui/earnings-date-range-picker';
import { NotificationIcon, EyeToggleIcon, VolumeIcon, SaveIcon, DownloadIcon } from './components/ui/animated-state-icons';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RevealOnMount } from './components/ui/reveal-on-mount';
import { TextRevealHeader } from './components/ui/text-reveal-header';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from './components/ui/empty';
import { Switch } from './components/ui/switch-button';
import { ThemeToggle } from './components/ui/theme-toggle';
import FilterBar, { FilterType, FilterOperator, AnimateChangeInHeight, type Filter as AnalyticsFilter, type FilterOption } from './components/ui/filters';
import Compliance from './pages/Compliance';
import ComplianceDefects from './pages/ComplianceDefects';
import FleetRoadworthiness from './pages/FleetRoadworthiness';
import DriverHours from './pages/DriverHours';
import CarrierSettlementImportModal from './pages/CarrierSettlementImportModal';
import PayrollDrawer, { type PayrollShiftContext, type PayrollDrawerSaveValues } from './pages/PayrollDrawer';

// "Remember Me" stores only the administrator's email address for prefill —
// never the password. Session persistence itself is handled by Supabase.
const REMEMBERED_EMAIL_KEY = 'admin_remembered_email';

// Billing plan display data. Prices and feature sets match what has_feature()
// enforces server-side (migration 032) — this is presentation only, not the
// source of truth for what a plan actually unlocks. View-only for now: there
// is no self-serve checkout/upgrade flow yet, that comes with the website.
const PLAN_LABELS: Record<'free' | 'standard' | 'premium', string> = {
  free: 'Free',
  standard: 'Standard',
  premium: 'Premium',
};

const BILLING_PLANS: Array<{
  id: 'free' | 'standard' | 'premium';
  label: string;
  // Free is a flat monthly price, not per-driver — monthlyPrice/annualPrice
  // are null for it and it ignores the monthly/annual toggle entirely.
  monthlyPrice: number | null;
  annualPrice: number | null;
  freeNote?: string;
  badge?: string;
  features: string[];
}> = [
  {
    id: 'free',
    label: 'Free',
    monthlyPrice: null,
    annualPrice: null,
    freeNote: 'Up to 5 drivers.',
    features: [
      'Clock in / clock out',
      'Live GPS tracking',
      'Driver profiles',
      'Live dispatch board',
      'Earnings',
    ],
  },
  {
    id: 'standard',
    label: 'Standard',
    monthlyPrice: 6.99,
    annualPrice: 69,
    badge: 'Most Popular',
    features: [
      'Everything in Free',
      'SOS alerts',
      'Idle detection',
      'Alert monitors',
      'Stuck-shift detection',
      'Multiple admin accounts (logistics + payroll roles)',
    ],
  },
  {
    id: 'premium',
    label: 'Premium',
    monthlyPrice: 12.99,
    annualPrice: 129,
    features: [
      'Everything in Standard',
      'Night-out allowance',
      'Fixed-rate payroll',
      'Agency grouping',
      'Excel template export',
      'Multi-depot support',
      'Self-service company sign-up',
    ],
  },
];

// Derived once from the real plan data above, for the Billing modal's
// "Annual billing (Save X%)" headline — the popular plan's own saving,
// not a fabricated round number.
const billingHeadlinePlan = BILLING_PLANS.find(p => p.badge);
const BILLING_HEADLINE_SAVINGS_PERCENT = (billingHeadlinePlan?.monthlyPrice && billingHeadlinePlan?.annualPrice)
  ? Math.round((1 - billingHeadlinePlan.annualPrice / (billingHeadlinePlan.monthlyPrice * 12)) * 100)
  : null;

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
}
export const DEFAULT_ORG_ALERT_SETTINGS: OrgAlertSettings = {
  longShiftFlagHours: 18,
  idleAlertMinutes: 50,
  nightOutMinGapHours: 8,
  nightOutMaxGapHours: 15,
  complianceAlertLeadDays: 30,
  allowDriverNightOutRequests: false,
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
  /** Real (migration 045) — nullable until an admin assigns a vehicle to
   * this shift from the Profitability ledger or a settlement import
   * matches one by registration. */
  vehicle_id?: string | null;
  vehicle_number?: string | null;
  /** Real (migration 045) — set by the carrier settlement importer or
   * manually alongside load_reference; null for shifts never imported. */
  carrier_name?: string | null;
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

/** Display-only capitalisation — some real driver_name values are stored
 * all-lowercase; this never touches the underlying data, just how a name
 * renders in the Profitability ledger. */
function toTitleCase(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/** Up to 2 initials for an avatar badge — first + last word of the name,
 * not every word, so a three-part name doesn't overflow the circle. */
function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].charAt(0).toUpperCase();
  return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
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

  // Company (organization) sign-up — registers a brand-new tenant plus its
  // first payroll admin. Distinct from department sign-up above, which joins
  // an *existing* company using a code it already issued.
  const [companySignupMode, setCompanySignupMode] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [companySignupEmail, setCompanySignupEmail] = useState('');
  const [companySignupPassword, setCompanySignupPassword] = useState('');
  const [companySignupConfirm, setCompanySignupConfirm] = useState('');
  const [showCompanySignupPassword, setShowCompanySignupPassword] = useState(false);
  const [isRegisteringCompany, setIsRegisteringCompany] = useState(false);
  const [companySignupError, setCompanySignupError] = useState('');
  // First depot — optional at signup; can also be added later from Team &
  // Access, so none of these block submission if left blank.
  const [signupDepotName, setSignupDepotName] = useState('');
  const [signupDepotAddress, setSignupDepotAddress] = useState('');
  const [signupDepotLat, setSignupDepotLat] = useState('');
  const [signupDepotLng, setSignupDepotLng] = useState('');
  const [isLocatingSignupDepot, setIsLocatingSignupDepot] = useState(false);
  // Set once on success — the codes are only ever shown this one time.
  const [companyCodesResult, setCompanyCodesResult] = useState<{
    companySlug: string;
    logisticsCode: string;
    payrollCode: string;
    depotCreated: boolean;
  } | null>(null);

  // Password reset / recovery
  const [resetNotice, setResetNotice] = useState<{ tone: 'info' | 'error' | 'success'; text: string } | null>(null);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const [activeTab, setActiveTab] = useState<'live' | 'alerts' | 'drivers' | 'rates' | 'analytics' | 'shipments' | 'compliance' | 'fleet-roadworthiness' | 'driver-hours' | 'compliance-defects'>('live');
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
    if (userRole === 'logistics' && (activeTab === 'rates' || activeTab === 'analytics' || activeTab === 'shipments')) {
      setActiveTab('live');
    }
  }, [userRole, activeTab]);

  // Team & Access tab: the org's own driver company code + registration codes.
  const [teamOrgInfo, setTeamOrgInfo] = useState<{ id: string; name: string; slug: string; plan: 'free' | 'standard' | 'premium'; support_phone_1?: string | null; support_phone_2?: string | null } | null>(null);
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
  // No live payment gateway wired up yet — a paid plan's CTA opens the
  // card-details step below (checkoutPlan) instead of charging anything;
  // submitting it just confirms interest the same way Free's always has.
  const [buyNowPlan, setBuyNowPlan] = useState<'free' | 'standard' | 'premium' | null>(null);
  const [checkoutPlan, setCheckoutPlan] = useState<'standard' | 'premium' | null>(null);
  // Billing lives in a popup off the "Billing" button, not a nav tab — one
  // Monthly/Annual switch governs every paid plan's card at once.
  const [billingModalOpen, setBillingModalOpen] = useState(false);
  // Same popup pattern for Settings — off the "Settings" sidebar button,
  // not a nav tab.
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [activeSettingsSection, setActiveSettingsSection] = useState<'company' | 'access-codes' | 'depots' | 'alerts' | 'appearance' | 'legal'>('company');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const billingSwitchRef = useRef<HTMLButtonElement>(null);
  // Driver-count sliders on the Standard/Premium pricing cards — each plan
  // remembers its own count independently. Defaulting both to 5 anchors
  // them just past the Free plan's real stated cap ("Up to 5 drivers"),
  // rather than an arbitrary made-up starting point.
  const [pricingUnitsByPlan, setPricingUnitsByPlan] = useState<Record<'standard' | 'premium', number>>({ standard: 5, premium: 5 });

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
        .select('long_shift_flag_hours, idle_alert_minutes, night_out_min_gap_hours, night_out_max_gap_hours, compliance_alert_lead_days, allow_driver_night_out_requests')
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
      });
    } catch (_) {
      // Migration 038 likely not applied on this environment yet — keep defaults.
    }
  }, []);

  // Database States
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [alerts, setAlerts] = useState<IdleAlert[]>([]);
  const [alertCategoryFilter, setAlertCategoryFilter] = useState<'all' | 'sos' | 'idle50'>('all');
  const [depots, setDepots] = useState<Depot[]>([]);
  const [fleetVehicles, setFleetVehicles] = useState<FleetVehicle[]>([]);
  const [mileageByShift, setMileageByShift] = useState<Record<string, number>>({});
  const [fuelReceipts, setFuelReceipts] = useState<FuelReceipt[]>([]);
  const [fuelReceiptLightboxUrl, setFuelReceiptLightboxUrl] = useState<string | null>(null);
  const [reviewingFuelReceiptId, setReviewingFuelReceiptId] = useState<string | null>(null);
  // Fuel Receipts Audit modal — replaces the old full-width bottom
  // section; same data/handlers, just triggered from the toolbar now.
  const [analyticsTrendTab, setAnalyticsTrendTab] = useState<'margin' | 'revenue'>('margin');
  const [isFuelReceiptsModalOpen, setIsFuelReceiptsModalOpen] = useState(false);
  const [fuelModalDriverSearch, setFuelModalDriverSearch] = useState('');
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
  const [isLocatingDepot, setIsLocatingDepot] = useState(false);
  const [analyticsFilters, setAnalyticsFilters] = useState<AnalyticsFilter[]>([]);
  // Chart view — Bar (default) or Line, switchable from the Filters menu.
  // Ledger sort — 'date' (default, newest first) or 'margin' (lowest
  // margin first, so the worst-performing loads surface immediately).
  const [ledgerSort, setLedgerSort] = useState<'date' | 'margin'>('date');
  // Inline edits for the per-load revenue table, keyed by shift id, so
  // typing in one row's fields doesn't touch any other row's state.
  const [revenueEdits, setRevenueEdits] = useState<Record<string, { revenue: string; loadRef: string; carrier?: string }>>({});
  const [savingRevenueShiftId, setSavingRevenueShiftId] = useState<string | null>(null);
  const [revenueSaveError, setRevenueSaveError] = useState('');
  // Which row's Billed Revenue popover is open — at most one at a time,
  // replacing the old always-visible inline <input> in every row.
  const [revenuePopoverShiftId, setRevenuePopoverShiftId] = useState<string | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [vehicleAssignShiftId, setVehicleAssignShiftId] = useState<string | null>(null);
  const [clearedAlertIds, setClearedAlertIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('cleared_alerts');
      return saved ? JSON.parse(saved) : [];
    } catch (_) {
      return [];
    }
  });



  const [liveLocations, setLiveLocations] = useState<LiveLocation[]>([]);
  // Flips true once the first loadData() resolves — gates useMetricHistory
  // so the KPI trend/sparkline never mistakes "data just finished loading"
  // for a genuine change (see useMetricHistory.ts).
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Active Telemetry Feed panel (Live Dispatch Board) — view, search and
  // filter state. "All Activity" shows the full roster (including drivers
  // who aren't currently pinging in) rather than only the live subset.
  const [telemetryViewTab, setTelemetryViewTab] = useState<'live' | 'all'>('live');
  const [telemetrySearchQuery, setTelemetrySearchQuery] = useState('');
  const [telemetryStatusFilter, setTelemetryStatusFilter] = useState<'all' | 'moving' | 'idle' | 'stationary'>('all');
  const [telemetryLocationFilter, setTelemetryLocationFilter] = useState('all');
  const [telemetrySpeedFilter, setTelemetrySpeedFilter] = useState<'all' | 'stationary' | 'moving' | 'fast'>('all');
  const [telemetrySortBy, setTelemetrySortBy] = useState<'employee' | 'speed' | 'timestamp'>('timestamp');
  const [telemetrySortDir, setTelemetrySortDir] = useState<'asc' | 'desc'>('desc');
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
  const [newEmployeeName, setNewEmployeeName] = useState('');
  const [newEmployeeCode, setNewEmployeeCode] = useState('');
  const [newEmployeePhone, setNewEmployeePhone] = useState('');
  const [newEmployeePin, setNewEmployeePin] = useState('123456');
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
  // Driver search combo (visual text shown in the field vs. the underlying
  // filter, which stays keyed by driver id so filtering logic is unaffected).
  const [driverSearchQuery, setDriverSearchQuery] = useState('');
  const [isDriverSearchOpen, setIsDriverSearchOpen] = useState(false);
  const [reportDateStart, setReportDateStart] = useState('');
  const [reportDateEnd, setReportDateEnd] = useState('');
  const [showOnlyNightOutRequested, setShowOnlyNightOutRequested] = useState(false);
  const [reportViewMode, setReportViewMode] = useState<'detailed' | 'summary'>('detailed');
  const [summaryMenuOpen, setSummaryMenuOpen] = useState(false);
  const [flagsMenuOpen, setFlagsMenuOpen] = useState(false);
  const [selectedShiftIds, setSelectedShiftIds] = useState<Set<string>>(new Set());

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
        .select('id, vehicle_number, vehicle_type, is_active')
        .eq('is_active', true)
        .order('vehicle_number', { ascending: true });
      setFleetVehicles((fVehicles || []) as FleetVehicle[]);

      // Fetch Shifts. shift_revenue is a separate table (see migration 035)
      // so this embed only ever returns data to logistics/payroll_admin —
      // its RLS policy has no driver-facing rule at all, unlike columns on
      // shifts itself which the driver app's own select-star queries would
      // otherwise be able to read straight off their own shift row.
      const { data: sfts, error: shiftsError } = await supabase!
        .from('shifts')
        .select('*, drivers(full_name, driver_id), depots(name), vehicles!vehicle_id(vehicle_number), shift_revenue(revenue_amount, load_reference, carrier_name)')
        .order('start_time', { ascending: false });

      // A Postgrest-level error here (RLS denial, a bad embed, anything)
      // resolves normally with { data: null, error: {...} } rather than
      // throwing — the old code never checked this, so a failed shifts
      // fetch silently fell through to `sfts || []` and just looked like
      // "no active shifts" with zero indication anything actually broke.
      if (shiftsError) {
        console.error('loadData: shifts fetch failed:', shiftsError.message, shiftsError);
        showToast('Could not load shifts: ' + shiftsError.message, 'error');
      }

      const mappedShifts = (sfts || []).map((s: any) => {
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
          revenue_amount: revenueRow?.revenue_amount ?? null,
          load_reference: revenueRow?.load_reference ?? null,
          vehicle_id: s.vehicle_id ?? null,
          vehicle_number: s.vehicles?.vehicle_number ?? null,
          carrier_name: revenueRow?.carrier_name ?? null,
        };
      });
      setShifts(mappedShifts);

      // Fetch Active Idle Alerts — joined through to the vehicle assigned
      // to the shift this alert fired on (nullable: not every shift has
      // one), so the card can show a real VRM instead of fabricating one.
      const { data: alrts } = await supabase!
        .from('idle_alerts')
        .select('*, drivers(full_name, driver_id), shifts(vehicle_id, vehicles!vehicle_id(vehicle_number))')
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
        .filter((a: any) => !activeClearedIds.includes(a.id))
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
          if (diffMinutes >= orgAlertSettings.idleAlertMinutes) {
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
            if (diffMinutes >= orgAlertSettings.idleAlertMinutes) {
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
      loadData().finally(() => setInitialDataLoaded(true));
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
        resolveUserRole().then(({ role, blocked, companyName, organizationId }) => {
          if (blocked) {
            supabase!.auth.signOut();
            setIsAuthenticated(false);
            localStorage.removeItem('admin_session');
            localStorage.removeItem('admin_role');
            setLoginError(`Access for ${companyName ?? 'this company'} has ended. Contact support to reactivate.`);
            return;
          }
          setUserRole(role);
          localStorage.setItem('admin_role', role);
          if (organizationId) {
            setCurrentOrgId(organizationId);
            loadOrgAlertSettings(organizationId);
          }
        });
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
    const shiftChannel = supabase!
      .channel('realtime_shifts')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shifts' },
        () => {
          loadData();
        }
      )
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
  useEffect(() => {
    if (isMockMode || !supabase || !isAuthenticated) return;
    const completedIds = shifts.filter(s => s.status === 'completed').map(s => s.id);
    const missing = completedIds.filter(id => !(id in mileageByShift));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const updates: Record<string, number> = {};
      for (let i = 0; i < missing.length; i += 200) {
        const chunk = missing.slice(i, i + 200);
        const { data } = await supabase!.rpc('shift_mileages', { p_shift_ids: chunk });
        for (const row of (data ?? []) as { shift_id: string; miles: number }[]) {
          updates[row.shift_id] = Number(row.miles);
        }
      }
      if (!cancelled) setMileageByShift(prev => ({ ...prev, ...updates }));
    })();
    return () => { cancelled = true; };
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
      .select('id, driver_id, shift_id, vehicle_id, liters, total_cost, vendor, receipt_photo_path, status, created_at, drivers(full_name), vehicles!vehicle_id(vehicle_number)')
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

  /// Registers a new dashboard account against a department registration code.
  /// The department is granted by the edge function only if the code matches
  /// that department's server-side secret — never on the client's say-so.
  /// Same "use my current location" convenience as the Team & Access depot
  /// form, for the optional first-depot section on the company signup page.
  const handleUseCurrentLocationSignupDepot = async () => {
    setCompanySignupError('');
    setIsLocatingSignupDepot(true);
    try {
      const { lat, lng } = await getCurrentPosition();
      setSignupDepotLat(lat.toFixed(6));
      setSignupDepotLng(lng.toFixed(6));
      const address = await reverseGeocode(lat, lng);
      if (address && !signupDepotAddress.trim()) setSignupDepotAddress(address);
    } catch (err: any) {
      setCompanySignupError(err?.message ?? 'Could not get your current location.');
    } finally {
      setIsLocatingSignupDepot(false);
    }
  };

  /// Self-service tenant onboarding: registers a brand-new company plus its
  /// first payroll admin in one step. The returned codes are shown exactly
  /// once — after this, only their hashes exist server-side.
  const handleCompanySignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setCompanySignupError('');

    const email = companySignupEmail.trim().toLowerCase();
    if (!companyName.trim()) {
      setCompanySignupError('Enter your company name.');
      return;
    }
    if (!email.includes('@')) {
      setCompanySignupError('Enter a valid email address.');
      return;
    }
    if (companySignupPassword.length < 8) {
      setCompanySignupError('Password must be at least 8 characters.');
      return;
    }
    if (companySignupPassword !== companySignupConfirm) {
      setCompanySignupError('Passwords do not match.');
      return;
    }
    if (isMockMode) {
      setCompanySignupError('Company registration is unavailable in sandbox mock mode.');
      return;
    }

    // Depot is optional here — only validate coordinates if they actually
    // started naming one, so a blank depot section never blocks signup.
    let depotPayload: { name: string; address: string; latitude: number; longitude: number } | undefined;
    if (signupDepotName.trim()) {
      const lat = parseFloat(signupDepotLat);
      const lng = parseFloat(signupDepotLng);
      if (Number.isNaN(lat) || lat < -90 || lat > 90) {
        setCompanySignupError('Depot latitude must be a number between -90 and 90.');
        return;
      }
      if (Number.isNaN(lng) || lng < -180 || lng > 180) {
        setCompanySignupError('Depot longitude must be a number between -180 and 180.');
        return;
      }
      depotPayload = { name: signupDepotName.trim(), address: signupDepotAddress.trim(), latitude: lat, longitude: lng };
    }

    setIsRegisteringCompany(true);
    try {
      const { data, error } = await supabase!.functions.invoke('company-signup', {
        body: { companyName: companyName.trim(), email, password: companySignupPassword, depot: depotPayload },
      });

      const failure = await readFunctionError(data, error);
      if (failure) {
        setCompanySignupError(failure);
      } else {
        setCompanyCodesResult({
          companySlug: data.companySlug,
          logisticsCode: data.logisticsCode,
          payrollCode: data.payrollCode,
          depotCreated: Boolean(data.depotCreated),
        });
        setLoginEmail(email);
      }
    } catch (_) {
      setCompanySignupError('Could not reach the company registration service.');
    } finally {
      setIsRegisteringCompany(false);
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
        },
      });
      const failure = await readFunctionError(data, error);
      if (failure) {
        setAlertSettingsError(failure);
      } else {
        setOrgAlertSettings(prev => ({ ...prev, longShiftFlagHours, idleAlertMinutes, nightOutMinGapHours, nightOutMaxGapHours, complianceAlertLeadDays }));
        setAlertSettingsSuccess('Saved.');
        setTimeout(() => setAlertSettingsSuccess(''), 1800);
      }
    } catch (_) {
      setAlertSettingsError('Could not save alert settings.');
    } finally {
      setIsSavingAlertSettings(false);
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
          allowDriverNightOutRequests: nextValue,
        },
      });
      const failure = await readFunctionError(data, error);
      if (!failure) {
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

  /// Sets or updates the company revenue billed for one load/shift, from
  /// the Analytics → Load Revenue table. Writes to the separate
  /// shift_revenue table (migration 035) — never to shifts itself — so
  /// this stays invisible to the driver app regardless of what columns
  /// it selects. An empty amount clears the figure back to "Rate Pending"
  /// rather than writing 0, since £0 and "not entered yet" mean different
  /// things for margin reporting.
  const handleSaveRevenue = async (shiftId: string) => {
    if (isMockMode || !supabase) return;
    const edit = revenueEdits[shiftId];
    if (!edit) return;

    setRevenueSaveError('');
    const trimmedAmount = edit.revenue.trim();
    let revenueAmount: number | null = null;
    if (trimmedAmount) {
      const parsed = Number(trimmedAmount);
      if (Number.isNaN(parsed) || parsed < 0) {
        setRevenueSaveError('Enter a valid revenue amount (0 or more), or leave it blank.');
        return;
      }
      revenueAmount = Math.round(parsed * 100) / 100;
    }
    const loadReference = edit.loadRef.trim() || null;
    const carrierName = edit.carrier !== undefined ? (edit.carrier.trim() || null) : undefined;

    setSavingRevenueShiftId(shiftId);
    try {
      const { error } = await supabase
        .from('shift_revenue')
        .upsert(
          {
            shift_id: shiftId,
            revenue_amount: revenueAmount,
            load_reference: loadReference,
            ...(carrierName !== undefined ? { carrier_name: carrierName } : {}),
          },
          { onConflict: 'shift_id' },
        );

      if (error) {
        setRevenueSaveError(error.message || 'Could not save the revenue for this load.');
        return;
      }

      setShifts(prev => prev.map(s => s.id === shiftId ? { ...s, revenue_amount: revenueAmount, load_reference: loadReference, ...(carrierName !== undefined ? { carrier_name: carrierName } : {}) } : s));
      setRevenueEdits(prev => {
        const next = { ...prev };
        delete next[shiftId];
        return next;
      });
    } catch (_) {
      setRevenueSaveError('Could not reach the database to save this load.');
    } finally {
      setSavingRevenueShiftId(null);
    }
  };

  /// Assigns (or clears) which real fleet vehicle ran a shift — writes
  /// directly to shifts.vehicle_id (migration 045). Used both by the
  /// Profitability ledger's inline picker and by the carrier settlement
  /// importer when it auto-matches a load to a shift by registration.
  const handleAssignVehicle = async (shiftId: string, vehicleId: string | null) => {
    if (isMockMode || !supabase) return;
    const { error } = await supabase.from('shifts').update({ vehicle_id: vehicleId }).eq('id', shiftId);
    if (error) {
      setRevenueSaveError(error.message || 'Could not assign a vehicle to this shift.');
      return;
    }
    const vehicleNumber = vehicleId ? fleetVehicles.find(v => v.id === vehicleId)?.vehicle_number ?? null : null;
    setShifts(prev => prev.map(s => (s.id === shiftId ? { ...s, vehicle_id: vehicleId, vehicle_number: vehicleNumber } : s)));
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

    setIsSavingDepot(true);
    try {
      const { error } = await supabase!.from('depots').insert({
        organization_id: teamOrgInfo.id,
        name,
        address: newDepotAddress.trim() || null,
        latitude: lat,
        longitude: lng,
        geofence_radius_m: Number.isNaN(radius) || radius <= 0 ? 150 : radius,
      });
      if (error) throw error;

      setNewDepotName('');
      setNewDepotAddress('');
      setNewDepotLat('');
      setNewDepotLng('');
      setNewDepotRadius('150');
      showToast('Depot added.', 'success');
      await loadData();
    } catch (err: any) {
      setDepotFormError(err?.message ?? 'Failed to add depot.');
    } finally {
      setIsSavingDepot(false);
    }
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
    if (isAuthenticated && (settingsModalOpen || billingModalOpen)) {
      loadTeamInfo();
    }
  }, [isAuthenticated, settingsModalOpen, billingModalOpen, loadTeamInfo]);

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
        setActiveTab('live');
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
      } else {
        setIsAuthenticated(true);
        localStorage.setItem('admin_session', 'true');
        persistRememberedEmail(loginEmail);

        // Department comes solely from the user_roles table. The previous
        // email-pattern fallback let any address containing "admin" or
        // "payroll" self-assign the payroll department.
        const { role: resolvedRole, blocked, companyName, organizationId } = await resolveUserRole();

        if (blocked) {
          await supabase!.auth.signOut();
          setIsAuthenticated(false);
          localStorage.removeItem('admin_session');
          setLoginError(`Access for ${companyName ?? 'this company'} has ended. Contact support to reactivate.`);
          return;
        }

        setUserRole(resolvedRole);
        localStorage.setItem('admin_role', resolvedRole);
        if (organizationId) {
          setCurrentOrgId(organizationId);
          loadOrgAlertSettings(organizationId);
        }
        if (resolvedRole === 'logistics') {
          setActiveTab('live');
        }
      }
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
    setActiveTab('live');
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
      await supabase!
        .from('idle_alerts')
        .update({ acknowledged: true })
        .eq('acknowledged', false);

      await supabase!
        .from('sos_alerts')
        .update({ acknowledged: true })
        .eq('acknowledged', false);

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

    if (!newEmployeeName.trim() || !newEmployeeCode.trim() || !newEmployeePhone.trim() || !newEmployeePin.trim()) {
      setCrudError('Please fill in all employee fields.');
      return;
    }

    if (newEmployeePin.trim().length !== 6) {
      setCrudError('PIN must be exactly 6 digits.');
      return;
    }

    if (isMockMode || !supabase) {
      setCrudError('No Supabase connection. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.');
      return;
    }

    const cleanCode = newEmployeeCode.trim();
    const cleanName = newEmployeeName.trim();
    const cleanPhone = newEmployeePhone.trim() || 'N/A';
    const cleanPin = newEmployeePin.trim() || '123456';

    try {
      const { data, error } = await supabase.functions.invoke('create-driver', {
        body: {
          driver_id: cleanCode,
          full_name: cleanName,
          phone: cleanPhone,
          pin: cleanPin,
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
        setNewEmployeePin('123456');
        setNewEmployeeProfession('driver');
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

    const cleanName = editFullName.trim();
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

  // Bcrypt-hashed PINs can't be recovered, only reset — same rule as the
  // Edit modal's own "new PIN" field, just surfaced as a one-click action
  // in the row's overflow menu for the common "driver forgot their PIN"
  // case. The new PIN is shown once, here, since there's no other way for
  // the admin to relay it to the driver afterward.
  const handleResetPin = (emp: Employee) => {
    const newPin = generateRandomPin();
    requestConfirm(
      `Reset ${emp.full_name}'s PIN to ${newPin}? Their old PIN will stop working immediately — make sure you can tell them the new one.`,
      async () => {
        if (isMockMode || !supabase) {
          showToast(`New PIN for ${emp.full_name}: ${newPin} (Mock Mode)`, 'success');
          return;
        }
        try {
          const { error } = await supabase.functions.invoke('create-driver', {
            body: { action: 'update', id: emp.id, pin: newPin },
          });
          if (error) {
            showToast(`Failed to reset PIN: ${error.message}`, 'error');
            return;
          }
          showToast(`New PIN for ${emp.full_name}: ${newPin}`, 'success');
        } catch (err: any) {
          showToast(`Failed to reset PIN: ${err?.message ?? 'Unknown error'}`, 'error');
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

  const handleExportSummaryCSV = () => {
    const filteredShifts = getFilteredShifts();
    if (filteredShifts.length === 0) {
      showToast("No data available to export.", 'error');
      return;
    }

    // 1. Safely aggregate data (identical logic to the Weekly Summary UI)
    const summaryData: any = {};
    filteredShifts.forEach(shift => {
       const { grossPay, noAmt, extrasAmt, liveHours } = getShiftFinancials(shift);
       const id = shift.driver_id;
       if (!summaryData[id]) {
           summaryData[id] = {
               driver_name: shift.driver_name,
               agency: employeeRates[id]?.agency_name || 'Direct',
               total_hours: 0,
               total_gross: 0,
               total_night_outs: 0,
               total_extras: 0,
               shift_count: 0
           };
       }
       summaryData[id].total_hours += (liveHours || 0);
       summaryData[id].total_gross += grossPay;
       summaryData[id].total_extras += extrasAmt;
       summaryData[id].total_night_outs += (noAmt > 0 ? 1 : 0);
       
       if (!shift.is_week_boundary || shift.boundary_label?.includes('Part 1')) {
           summaryData[id].shift_count += 1;
       }
    });

    // 2. Construct CSV Content
    const headers = ["Employee Name", "Agency", "Shifts Logged", "Total Hours", "Night Outs", "Extras (£)", "Gross Pay (£)"];
    const rows = Object.values(summaryData).map((row: any) => [
       `"${row.driver_name}"`,
       `"${row.agency}"`,
       row.shift_count,
       row.total_hours.toFixed(2),
       row.total_night_outs,
       row.total_extras.toFixed(2),
       row.total_gross.toFixed(2)
    ]);

    const csvContent = [
       headers.join(","), 
       ...rows.map(r => r.join(","))
    ].join("\n");

    // 3. Trigger Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Payroll_Summary_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFillExcelTemplate = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const filteredShifts = getFilteredShifts();

    // 1. Build normalized summary dictionary
    const summaryData: any = {};
    filteredShifts.forEach(shift => {
       const { noAmt, extrasAmt, liveHours, rate } = getShiftFinancials(shift);
       const id = shift.driver_id;
       if (!summaryData[id]) {
           summaryData[id] = {
               driver_name: shift.driver_name || '',
               total_hours: 0,
               total_extras: 0,
               night_out_val: 0,
               shift_count: 0,
               rates: []
           };
       }
       
       const isOngoing = !shift.end_time && shift.status !== 'completed';
       const calculatedLiveHours = isOngoing ? ((Date.now() - new Date(shift.start_time).getTime()) / (1000 * 60 * 60)) : (shift.total_hours || 0);
       
       summaryData[id].total_hours += (liveHours ?? calculatedLiveHours);
       summaryData[id].total_extras += extrasAmt;
       summaryData[id].night_out_val += noAmt;
       
       const rateToUse = Number(shift.effective_rate) || Number(shift.base_hourly_rate) || Number(rate) || 0;
       if (rateToUse > 0) summaryData[id].rates.push(rateToUse);

       if (!shift.is_week_boundary || shift.boundary_label?.includes('Part 1')) {
           summaryData[id].shift_count += 1;
       }
    });

    // Helper function for flexible fuzzy name matching
    const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellStyles: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:Z200');
        let matchCount = 0;

        // Scan Column A (R0 to R_max)
        for (let R = range.s.r; R <= range.e.r; ++R) {
          const cellA_address = XLSX.utils.encode_cell({ r: R, c: 0 }); // Column A
          const cellA = worksheet[cellA_address];

          if (cellA && cellA.v && typeof cellA.v === 'string') {
            const rawCellVal = cellA.v.trim();
            const normCellVal = normalize(rawCellVal);

            if (!normCellVal) continue;

            // Search in calculated summary with flexible name check
            const matchedDriver: any = Object.values(summaryData).find((d: any) => {
               const normDriver = normalize(d.driver_name);
               if (normDriver === normCellVal) return true;
               
               // Check reversed First/Last order
               const parts = d.driver_name.trim().split(/\s+/);
               if (parts.length >= 2) {
                  const reversed = normalize(`${parts[parts.length - 1]} ${parts.slice(0, -1).join(' ')}`);
                  if (reversed === normCellVal) return true;
               }
               return false;
            });

            if (matchedDriver) {
               let avgRate = 0;
               if (matchedDriver.rates.length > 0) {
                  avgRate = Number((matchedDriver.rates.reduce((a: number, b: number) => a + b, 0) / matchedDriver.rates.length).toFixed(2));
               }

               const totalExtraMoney = Number((matchedDriver.total_extras + matchedDriver.night_out_val).toFixed(2));

               // Safely update specific cell values directly without breaking worksheet structure
               const updateCell = (cIdx: number, val: any) => {
                  const addr = XLSX.utils.encode_cell({ r: R, c: cIdx });
                  if (!worksheet[addr]) worksheet[addr] = { t: 'n', v: val };
                  else {
                     worksheet[addr].v = val;
                     worksheet[addr].t = typeof val === 'number' ? 'n' : 's';
                  }
               };

               updateCell(2, matchedDriver.shift_count); // Col C: Shifts
               updateCell(4, Number(matchedDriver.total_hours.toFixed(2))); // Col E: Hours
               if (avgRate > 0) updateCell(5, avgRate); // Col F: Rate
               if (totalExtraMoney !== 0) updateCell(6, totalExtraMoney); // Col G: Extra

               matchCount++;
            }
          }
        }

        XLSX.writeFile(workbook, `Filled_Payment_List_${new Date().toISOString().split('T')[0]}.xlsx`);
        showToast(`Template injection complete — matched and injected data for ${matchCount} employees.`, 'success');

      } catch (error: any) {
        showToast("Error processing Excel file: " + error.message, 'error');
      } finally {
        if (event.target) {
          event.target.value = '';
        }
      }
    };
    reader.readAsArrayBuffer(file);
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

  const exportCSV = () => {
    const filtered = getFilteredShifts();
    const exportData = filtered.map(s => {
      const { rate, isFixedRate, noAmt, extrasAmt, extrasNote, deductionAmt, deductionReason, grossPay, agency, hasRateSnapshot, rateSnapshotTimestamp, isMicroShift } = getShiftFinancials(s);
      return {
        'Employee Name': s.driver_name,
        'Employee ID': s.driver_code,
        'Agency': agency,
        'Base': s.depot_name || 'N/A',
        'Start Time': new Date(s.start_time).toLocaleString(),
        'End Time': s.end_time ? new Date(s.end_time).toLocaleString() : 'Active',
        'Hours Worked': (s.total_hours || 0).toFixed(2),
        'Effective Rate': isFixedRate ? `£${rate.toFixed(2)} (Fixed/Shift)` : `£${rate.toFixed(2)}/hr`,
        'Rate Locked': hasRateSnapshot && rateSnapshotTimestamp ? new Date(rateSnapshotTimestamp).toLocaleDateString('en-GB') : '',
        'Night Out Status': (s.night_out_status || 'none').toUpperCase(),
        'Night Out Allowance (£)': noAmt.toFixed(2),
        'Bonus (£)': extrasAmt.toFixed(2),
        'Bonus Note': extrasNote || '',
        'Deduction (£)': deductionAmt.toFixed(2),
        'Deduction Reason': deductionReason || '',
        'Ignored Test Shift': isMicroShift ? 'YES' : '',
        'Gross Pay (£)': grossPay.toFixed(2),
      };
    });

    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Payroll_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportExcel = () => {
    const filtered = getFilteredShifts();
    const exportData = filtered.map(s => {
      const { rate, isFixedRate, noAmt, extrasAmt, extrasNote, grossPay, agency } = getShiftFinancials(s);
      return {
        'Driver Name': s.driver_name,
        'Driver ID': s.driver_code,
        'Agency': agency,
        'Depot Location': s.depot_name || 'N/A',
        'Shift Start': new Date(s.start_time).toLocaleString(),
        'Shift End': s.end_time ? new Date(s.end_time).toLocaleString() : 'In Progress',
        'Hours': s.total_hours || 0,
        'Rate': isFixedRate ? `£${rate.toFixed(2)} (Fixed/Shift)` : `£${rate.toFixed(2)}/hr`,
        'Night Out Status': (s.night_out_status || 'none').toUpperCase(),
        'Night Out Allowance (£)': noAmt,
        'Extras (£)': extrasAmt,
        'Extras Note': extrasNote || '',
        'Gross Pay (£)': grossPay,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Payroll Shifts');
    
    // Auto-fit column widths
    const maxLen = exportData.reduce((w, row: any) => {
      Object.keys(row).forEach((key, i) => {
        const val = row[key]?.toString() || '';
        w[i] = Math.max(w[i] || 0, val.length, key.length);
      });
      return w;
    }, [] as number[]);
    worksheet['!cols'] = maxLen.map(len => ({ wch: len + 3 }));

    XLSX.writeFile(workbook, `Payroll_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // ── Leaflet Map Component Implementation ────────────────────
  useEffect(() => {
    if (!isAuthenticated || activeTab !== 'live') {
      // Clean up map instance when tab or auth changes
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
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
        radius: depot.geofence_radius_m,
        weight: 1.5
      }).addTo(mapRef.current!).bindPopup(
        `<b>${depot.name}</b><br>Radius: ${depot.geofence_radius_m}m<br>Lat: ${depot.latitude.toFixed(4)}, Lng: ${depot.longitude.toFixed(4)}`
      );
      const marker = L.marker([depot.latitude, depot.longitude], {
        icon: L.divIcon({
          className: '',
          html: `<div style="background-color:#CC0000;width:8px;height:8px;border-radius:50%;border:2px solid #FFFFFF;box-shadow:0 1px 4px rgba(204,0,0,0.4);"></div>`
        })
      }).addTo(mapRef.current!);
      depotLayersRef.current.push(circle, marker);
    });

    // Plot and update live driver markers dynamically
    liveLocations.forEach(loc => {
      // MAP MARKER OVERLAP FIX (JITTER): Apply microscopic random offset ONLY to map marker position
      const displayLat = loc.latitude + (Math.random() - 0.5) * 0.0002;
      const displayLng = loc.longitude + (Math.random() - 0.5) * 0.0002;
      const markerHtml = `<div class="${loc.status === 'idle' ? 'driver-idle-dot' : 'driver-live-dot'}"></div>`;

      if (markersRef.current[loc.driver_id]) {
        // Update position if marker already exists
        markersRef.current[loc.driver_id].setLatLng([displayLat, displayLng]);
      } else {
        // Create new marker
        const marker = L.marker([displayLat, displayLng], {
          icon: L.divIcon({
            className: '',
            html: markerHtml,
            iconSize: [12, 12]
          })
        }).addTo(mapRef.current!).bindPopup(`
          <div style="font-family:'Inter',sans-serif;">
            <b style="font-size:13px;color:#333333;">${loc.driver_name}</b><br>
            <span style="color:#888888;font-size:11px;">Speed: ${loc.speed_mph.toFixed(0)} mph</span><br>
            <span style="color:${loc.status === 'idle' ? '#CC0000' : '#2E7D32'};font-size:11px;font-weight:bold;">
              Status: ${loc.status.toUpperCase()}
            </span><br>
            <a href="https://www.google.com/maps/search/?api=1&query=${loc.latitude},${loc.longitude}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-top:6px;font-size:11px;color:#CC0000;font-weight:bold;text-decoration:none;">🗺️ View in Google Maps</a>
          </div>
        `);
        markersRef.current[loc.driver_id] = marker;
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
        if (!liveLocations.find(l => l.driver_id === id)) {
          markersRef.current[id].remove();
          delete markersRef.current[id];
        }
      }
    });

  }, [isAuthenticated, activeTab, liveLocations, alerts, depots]);

  // Quick-stats KPI values, hoisted above the login-screen early returns
  // below so their rolling-history hooks (real sampled values, not
  // fabricated demo data) obey the Rules of Hooks regardless of auth state.
  const kpiActiveEmployeeCount = liveLocations.length;
  const kpiIdleAlertsCount = alerts.filter(a => !a.acknowledged && !a.is_sos).length;
  const kpiCompletedShiftsCount = shifts.filter(s => s.status === 'completed').length;
  // Was summing total_pay across every shift regardless of status — an
  // orphaned/still-open shift (never clocked out, sometimes running for
  // days in seed/demo data) has a live-computed total_pay that kept
  // inflating this figure past what the Analytics tab's own payroll total
  // (scoped to completed shifts only) reported for the same period.
  // Filtering to completed shifts here, matching kpiCompletedShiftsCount
  // right above it, is what actually fixes the mismatch — no arbitrary
  // ">24h" cutoff needed, since a genuinely stuck shift is by definition
  // never completed.
  const kpiTotalWeeklyPayout = shifts.filter(s => s.status === 'completed').reduce((sum, s) => sum + (s.total_pay || 0), 0);
  const employeeHistory = useMetricHistory(kpiActiveEmployeeCount, initialDataLoaded);
  const idleAlertsHistory = useMetricHistory(kpiIdleAlertsCount, initialDataLoaded);
  const completedShiftsHistory = useMetricHistory(kpiCompletedShiftsCount, initialDataLoaded);
  const payoutHistory = useMetricHistory(Math.round(kpiTotalWeeklyPayout * 100) / 100, initialDataLoaded);

  // ── Render login Page if Unauthenticated ───────────────────
  // ── Department Sign-Up ─────────────────────────────────────
  // ── Company Sign-Up: register a brand-new tenant ────────────
  if (!isAuthenticated && companySignupMode && !companyCodesResult) {
    return (
      <div className="login-shell">
        <div className="login-card login-card--single">
          <div className="login-form-col">
            <div className="text-center mb-24">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '18px' }}>
                <BrandLogo transparentIcon iconSize={32} textSize={22} gap={7} fontFamily="'Plus Jakarta Sans', 'Inter', sans-serif" />
              </div>
              <h1 className="login-title">Register Your Company</h1>
              <p className="login-subtitle">Create your company's dispatch console and become its first admin</p>
            </div>

            <form onSubmit={handleCompanySignup}>
              <div className="input-group">
                <label className="input-label" htmlFor="company-name">COMPANY NAME</label>
                <div className="login-field">
                  <span className="login-field-icon"><Building2 size={16} /></span>
                  <input
                    id="company-name"
                    type="text"
                    className="login-input"
                    placeholder="Your Company Ltd"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="input-group">
                <label className="input-label" htmlFor="company-signup-email">YOUR EMAIL</label>
                <div className="login-field">
                  <span className="login-field-icon"><Mail size={16} /></span>
                  <input
                    id="company-signup-email"
                    type="email"
                    className="login-input"
                    placeholder="you@yourcompany.com"
                    autoComplete="username"
                    value={companySignupEmail}
                    onChange={(e) => setCompanySignupEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="input-group">
                <label className="input-label" htmlFor="company-signup-password">PASSWORD</label>
                <div className="login-field">
                  <span className="login-field-icon"><Lock size={16} /></span>
                  <input
                    id="company-signup-password"
                    type={showCompanySignupPassword ? 'text' : 'password'}
                    className="login-input login-input--with-toggle"
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    value={companySignupPassword}
                    onChange={(e) => setCompanySignupPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="login-toggle"
                    onClick={() => setShowCompanySignupPassword(v => !v)}
                    aria-label={showCompanySignupPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showCompanySignupPassword}
                  >
                    <EyeToggleIcon on={showCompanySignupPassword} size={16} />
                  </button>
                </div>
              </div>

              <div className="input-group">
                <label className="input-label" htmlFor="company-signup-confirm">CONFIRM PASSWORD</label>
                <div className="login-field">
                  <span className="login-field-icon"><Lock size={16} /></span>
                  <input
                    id="company-signup-confirm"
                    type={showCompanySignupPassword ? 'text' : 'password'}
                    className="login-input"
                    placeholder="Re-enter password"
                    autoComplete="new-password"
                    value={companySignupConfirm}
                    onChange={(e) => setCompanySignupConfirm(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border-color)', margin: '20px 0 16px', paddingTop: '16px' }}>
                <p className="text-xs text-muted mb-8" style={{ fontWeight: 700, letterSpacing: '0.4px' }}>
                  FIRST DEPOT <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional — add later from Team &amp; Access instead)</span>
                </p>

                <div className="input-group">
                  <label className="input-label" htmlFor="signup-depot-name">DEPOT NAME</label>
                  <div className="login-field">
                    <span className="login-field-icon"><Building2 size={16} /></span>
                    <input
                      id="signup-depot-name"
                      type="text"
                      className="login-input"
                      placeholder="e.g. Rossington Depot"
                      value={signupDepotName}
                      onChange={(e) => setSignupDepotName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="input-group">
                  <label className="input-label" htmlFor="signup-depot-address">ADDRESS (OPTIONAL)</label>
                  <div className="login-field">
                    <span className="login-field-icon"><MapPinned size={16} /></span>
                    <input
                      id="signup-depot-address"
                      type="text"
                      className="login-input"
                      placeholder="e.g. Great North Road, Rossington"
                      value={signupDepotAddress}
                      onChange={(e) => setSignupDepotAddress(e.target.value)}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  className="login-forgot"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}
                  onClick={handleUseCurrentLocationSignupDepot}
                  disabled={isLocatingSignupDepot}
                >
                  <LocateFixed size={14} />
                  {isLocatingSignupDepot ? 'Getting your location…' : 'Use My Current Location'}
                </button>

                <div className="flex" style={{ gap: '12px' }}>
                  <div className="input-group" style={{ flex: 1 }}>
                    <label className="input-label" htmlFor="signup-depot-lat">LATITUDE</label>
                    <input
                      id="signup-depot-lat"
                      type="text"
                      inputMode="decimal"
                      className="login-input"
                      style={{ padding: '10px 12px' }}
                      placeholder="53.4818"
                      value={signupDepotLat}
                      onChange={(e) => setSignupDepotLat(e.target.value)}
                    />
                  </div>
                  <div className="input-group" style={{ flex: 1 }}>
                    <label className="input-label" htmlFor="signup-depot-lng">LONGITUDE</label>
                    <input
                      id="signup-depot-lng"
                      type="text"
                      inputMode="decimal"
                      className="login-input"
                      style={{ padding: '10px 12px' }}
                      placeholder="-1.0866"
                      value={signupDepotLng}
                      onChange={(e) => setSignupDepotLng(e.target.value)}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted mt-4">
                  Tap "Use My Current Location" while standing at the depot, or find coordinates by
                  searching the address on Google Maps and copying the latitude/longitude shown for the pin.
                </p>
              </div>

              {companySignupError && (
                <div className="login-notice login-notice--error">{companySignupError}</div>
              )}

              <FlowButton
                type="submit"
                disabled={isRegisteringCompany}
                text={isRegisteringCompany ? 'CREATING COMPANY…' : 'REGISTER COMPANY'}
                hoverText="WELCOME ABOARD"
                className="w-full"
              />
            </form>

            <div className="login-utils" style={{ marginTop: '16px', justifyContent: 'center' }}>
              <button
                type="button"
                className="login-forgot"
                onClick={() => { setCompanySignupMode(false); setCompanySignupError(''); }}
              >
                ← Back to sign in
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Company Sign-Up: one-time reveal of the new company's codes ──
  if (!isAuthenticated && companySignupMode && companyCodesResult) {
    return (
      <div className="login-shell">
        <div className="login-card login-card--single">
          <div className="login-form-col">
            <div className="text-center mb-24">
              <Building2 size={40} style={{ color: 'var(--brand-red, #CC0000)', marginBottom: '12px' }} />
              <h1 className="login-title">Save These Codes</h1>
              <p className="login-subtitle">
                Shown once. Anyone who has the right code can join — logistics/payroll codes let staff
                register a dashboard account, and the driver company code lets your drivers sign in.
              </p>
            </div>

            <div className="input-group">
              <label className="input-label">DRIVER COMPANY CODE</label>
              <div className="login-field">
                <span className="login-field-icon"><Users size={16} /></span>
                <input readOnly className="login-input" value={companyCodesResult.companySlug} />
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">LOGISTICS REGISTRATION CODE</label>
              <div className="login-field">
                <span className="login-field-icon"><Shield size={16} /></span>
                <input readOnly className="login-input" value={companyCodesResult.logisticsCode} />
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">PAYROLL REGISTRATION CODE</label>
              <div className="login-field">
                <span className="login-field-icon"><Shield size={16} /></span>
                <input readOnly className="login-input" value={companyCodesResult.payrollCode} />
              </div>
            </div>

            <div className="login-notice login-notice--success">
              You can rotate the logistics/payroll codes any time from the Team &amp; Access tab once
              you're signed in — but this is the only time the driver company code will be shown here.
            </div>

            <div className={`login-notice ${companyCodesResult.depotCreated ? 'login-notice--success' : 'login-notice--info'}`}>
              {companyCodesResult.depotCreated
                ? 'Your first depot has been saved — drivers can clock in there once you sign in.'
                : 'No depot added yet. Add one from Team & Access before clocking any driver in.'}
            </div>

            <button
              type="button"
              className="login-submit"
              style={{ marginTop: '16px' }}
              onClick={() => {
                setCompanySignupMode(false);
                setCompanyCodesResult(null);
                setCompanyName('');
                setCompanySignupEmail('');
                setCompanySignupPassword('');
                setCompanySignupConfirm('');
                setSignupDepotName('');
                setSignupDepotAddress('');
                setSignupDepotLat('');
                setSignupDepotLng('');
                setResetNotice({ tone: 'success', text: 'Company registered. Sign in with your new password.' });
              }}
            >
              <Shield size={15} />
              CONTINUE TO SIGN IN
            </button>
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
                onClick={() => { setCompanySignupMode(true); setResetNotice(null); setLoginError(''); }}
              >
                New company? Register your company
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

  // Calculate quick stats
  const activeEmployeeCount = kpiActiveEmployeeCount;
  const activeAlertsCount = alerts.filter(a => !a.acknowledged).length;
  const idleAlertsCount = kpiIdleAlertsCount;
  const completedShiftsCount = kpiCompletedShiftsCount;
  const pendingNightOutsCount = shifts.filter(s => s.night_out_status === 'pending').length;
  const totalWeeklyPayout = kpiTotalWeeklyPayout;


  // Renders the trend pill + sparkline for a KPI card from its real sample
  // history. Returns null (no fabricated "flat" reading) until there are
  // at least two distinct samples to compare.
  const renderKpiTrend = (history: number[]) => {
    const trend = getMetricTrend(history);
    if (!trend) return null;
    const color = trend.direction === 'up' ? '#16A34A' : trend.direction === 'down' ? '#DC2626' : '#64748B';
    const TrendIcon = trend.direction === 'up' ? TrendingUp : trend.direction === 'down' ? TrendingDown : Minus;
    return (
      <div className="kpi-trend-col" title="Change across the most recent live updates">
        <span className={`kpi-trend kpi-trend--${trend.direction}`}>
          <TrendIcon size={11} />
          {trend.percent === null ? 'New' : `${trend.percent > 0 ? '+' : ''}${trend.percent.toFixed(0)}%`}
        </span>
        <KpiSparkline data={history} color={color} />
      </div>
    );
  };

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
              <SidebarLink
                link={{
                  label: 'Live Dispatch Board',
                  href: '#',
                  active: activeTab === 'live',
                  onClick: () => setActiveTab('live'),
                  icon: <span className="nav-icon"><Truck size={18} /></span>,
                }}
                className={`nav-item ${activeTab === 'live' ? 'active' : ''}`}
                labelClassName="text-inherit dark:text-inherit"
              />

              <SidebarLink
                link={{
                  label: 'Alert Monitors',
                  href: '#',
                  active: activeTab === 'alerts',
                  onClick: () => setActiveTab('alerts'),
                  icon: (
                    <span className="nav-icon">
                      <Bell size={18} />
                      {activeAlertsCount > 0 && (
                        <span className="nav-count-badge" title={`${activeAlertsCount} unacknowledged alert${activeAlertsCount === 1 ? '' : 's'}`}>
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
                  className={`nav-item ${(activeTab === 'drivers' || activeTab === 'rates') ? 'active' : ''}`}
                  style={{ width: '100%', borderTop: 'none', borderRight: 'none', borderBottom: 'none' }}
                >
                  <span className="nav-icon">
                    <IdCard size={18} />
                    {pendingNightOutsCount > 0 && (
                      <span className="nav-count-badge" title={`${pendingNightOutsCount} night out request${pendingNightOutsCount === 1 ? '' : 's'} pending`}>
                        {pendingNightOutsCount > 9 ? '9+' : pendingNightOutsCount}
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
                        ]).map(([tab, label, count]) => (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => setActiveTab(tab)}
                            className={`nav-subitem ${activeTab === tab ? 'active' : ''}`}
                          >
                            {label}
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
                  className={`nav-item ${(activeTab === 'compliance' || activeTab === 'fleet-roadworthiness' || activeTab === 'driver-hours' || activeTab === 'compliance-defects') ? 'active' : ''}`}
                  style={{ width: '100%', borderTop: 'none', borderRight: 'none', borderBottom: 'none' }}
                >
                  <span className="nav-icon">
                    <ShieldCheck size={18} />
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
                        ]).map(([tab, label, count]) => (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => setActiveTab(tab)}
                            className={`nav-subitem ${activeTab === tab ? 'active' : ''}`}
                          >
                            {label}
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

              {userRole === 'payroll_admin' && (
                <SidebarLink
                  link={{
                    label: 'Analytics',
                    href: '#',
                    active: activeTab === 'analytics',
                    onClick: () => setActiveTab('analytics'),
                    icon: (
                      <span className="nav-icon">
                        <BarChart3 size={18} />
                        {pendingFuelReceiptsCount > 0 && (
                          <span className="nav-count-badge" title={`${pendingFuelReceiptsCount} fuel receipt${pendingFuelReceiptsCount === 1 ? '' : 's'} awaiting review`}>
                            {pendingFuelReceiptsCount > 9 ? '9+' : pendingFuelReceiptsCount}
                          </span>
                        )}
                      </span>
                    ),
                  }}
                  className={`nav-item ${activeTab === 'analytics' ? 'active' : ''}`}
                  labelClassName="text-inherit dark:text-inherit"
                />
              )}

              {userRole === 'payroll_admin' && (
                <SidebarLink
                  link={{
                    label: 'Shipments',
                    href: '#',
                    active: activeTab === 'shipments',
                    onClick: () => setActiveTab('shipments'),
                    icon: (
                      <span className="nav-icon">
                        <Package size={18} />
                        {pendingLoadsCount > 0 && (
                          <span className="nav-count-badge" title={`${pendingLoadsCount} load${pendingLoadsCount === 1 ? '' : 's'} awaiting a rate`}>
                            {pendingLoadsCount > 9 ? '9+' : pendingLoadsCount}
                          </span>
                        )}
                      </span>
                    ),
                  }}
                  className={`nav-item ${activeTab === 'shipments' ? 'active' : ''}`}
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
                    icon: <span className="nav-icon"><Settings size={18} /></span>,
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

            {userRole === 'payroll_admin' && (
              <SidebarLink
                link={{
                  label: 'Billing',
                  href: '#',
                  active: billingModalOpen,
                  onClick: () => setBillingModalOpen(true),
                  icon: <span className="nav-icon"><CreditCard size={18} /></span>,
                }}
                className={`nav-item ${billingModalOpen ? 'active' : ''}`}
                labelClassName="text-inherit dark:text-inherit"
                style={{ paddingLeft: '14px', borderLeft: 0, borderRadius: '8px' }}
              />
            )}

            <SidebarLink
              link={{
                label: 'Log out',
                href: '#',
                onClick: handleLogout,
                icon: <span className="nav-icon"><LogOut size={18} /></span>,
              }}
              className="nav-item text-error"
              labelClassName="text-inherit dark:text-inherit"
              style={{ paddingLeft: '14px', borderLeft: 0, borderRadius: '8px' }}
            />
          </div>
        </SidebarBody>
      </Sidebar>

      {/* ── Main Dashboard Content ─────────────────────────── */}
      <div className="p-32 flex flex-col overflow-auto" style={{ height: '100vh', flex: 1, minWidth: 0 }}>
        
        {/* Header Stats Row — now shown on every tab, Analytics included,
            for consistency with the rest of the app (it used to skip
            Analytics on the reasoning that page already has its own
            dedicated financial KPI strip further down; that's still
            true, this row is a different, org-wide "who's on shift right
            now" summary, not a duplicate of it). */}
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-card-main">
              <span className="kpi-icon kpi-icon--red"><User size={18} /></span>
              <div className="kpi-body">
                <h2 className="kpi-value">{activeEmployeeCount}</h2>
                <span className="kpi-label">Employees logged in</span>
              </div>
            </div>
            {renderKpiTrend(employeeHistory)}
          </div>

          <div className="kpi-card">
            <div className="kpi-card-main">
              <span className="kpi-icon kpi-icon--red"><Clock size={18} /></span>
              <div className="kpi-body">
                <h2 className="kpi-value">{idleAlertsCount}</h2>
                <span className="kpi-label">Stops &gt; 50 mins (Break)</span>
              </div>
            </div>
            {renderKpiTrend(idleAlertsHistory)}
          </div>

          <div className="kpi-card">
            <div className="kpi-card-main">
              <span className="kpi-icon kpi-icon--red"><Briefcase size={18} /></span>
              <div className="kpi-body">
                <h2 className="kpi-value">{completedShiftsCount}</h2>
                <span className="kpi-label">Calculated shifts</span>
              </div>
            </div>
            {renderKpiTrend(completedShiftsHistory)}
          </div>

          {userRole === 'payroll_admin' ? (
            <div className="kpi-card">
              <div className="kpi-card-main">
                <span className="kpi-icon kpi-icon--red"><PoundSterling size={18} /></span>
                <div className="kpi-body">
                  <h2 className="kpi-value">£{(totalWeeklyPayout || 0).toFixed(2)}</h2>
                  <span className="kpi-label">Calculated gross pay</span>
                </div>
              </div>
              {renderKpiTrend(payoutHistory)}
            </div>
          ) : (
            <div className="kpi-card">
              <div className="kpi-card-main">
                <span className="kpi-icon kpi-icon--red"><Compass size={18} /></span>
                <div className="kpi-body">
                  <h2 className="kpi-value">{depots.length}</h2>
                  <span className="kpi-label">
                    {depots.length === 0
                      ? 'No depots configured yet'
                      : depots.length <= 2
                        ? `Active depot${depots.length === 1 ? '' : 's'} (${depots.map(d => d.name).join(' & ')})`
                        : `Active depots across ${depots.length} locations`}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* -- TAB 1: Live Dispatch Board ------------------- */}
        {activeTab === 'live' && (
          <div className="flex-1 grid gap-24" style={{ gridTemplateRows: '1fr auto', minHeight: 0 }}>
            {/* Live map layout */}
            <div className="map-shell">
              <div id="live-dispatch-map" className="h-full w-full"></div>

              {/* Floating Map Refresh Button */}
              <button
                className="map-refresh-btn"
                onClick={handleMapRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw size={14} className={isRefreshing ? 'spin-animation' : ''} />
                {isRefreshing ? 'REFRESHING…' : 'REFRESH POSITIONS'}
              </button>
            </div>

            {/* Live Telemetry lists */}
            {(() => {
              interface TelemetryRow {
                driver_id: string;
                driver_name: string;
                latitude: number | null;
                longitude: number | null;
                speed_mph: number | null;
                status: 'moving' | 'idle' | 'stationary' | 'offline';
                last_ping: string | null;
              }

              // Nearest depot to a coordinate — real geometry over the org's
              // own depots (see Team & Access), used to give the "Location"
              // filter genuine, non-fabricated options instead of a
              // meaningless placeholder list.
              const nearestDepotName = (lat: number | null, lng: number | null): string | null => {
                if (lat == null || lng == null || depots.length === 0) return null;
                let best = depots[0];
                let bestDist = Infinity;
                for (const d of depots) {
                  const dist = (d.latitude - lat) ** 2 + (d.longitude - lng) ** 2;
                  if (dist < bestDist) { bestDist = dist; best = d; }
                }
                return best.name;
              };

              const matchesEmployee = (emp: typeof employees[number], loc: LiveLocation) =>
                loc.driver_id === emp.id || loc.driver_code === emp.driver_id;

              const baseRows: TelemetryRow[] = telemetryViewTab === 'live'
                ? liveLocations.map(l => ({
                    driver_id: l.driver_id, driver_name: l.driver_name,
                    latitude: l.latitude, longitude: l.longitude,
                    speed_mph: l.speed_mph, status: l.status, last_ping: l.last_ping,
                  }))
                : employees.map(emp => {
                    const live = liveLocations.find(l => matchesEmployee(emp, l));
                    if (live) {
                      return {
                        driver_id: live.driver_id, driver_name: live.driver_name,
                        latitude: live.latitude, longitude: live.longitude,
                        speed_mph: live.speed_mph, status: live.status, last_ping: live.last_ping,
                      };
                    }
                    return {
                      driver_id: emp.id, driver_name: emp.full_name,
                      latitude: null, longitude: null, speed_mph: null,
                      status: 'offline' as const, last_ping: null,
                    };
                  });

              const query = telemetrySearchQuery.trim().toLowerCase();
              const filteredRows = baseRows.filter(row => {
                if (query && !row.driver_name.toLowerCase().includes(query)) return false;
                if (telemetryStatusFilter !== 'all' && row.status !== telemetryStatusFilter) return false;
                if (telemetryLocationFilter !== 'all') {
                  if (nearestDepotName(row.latitude, row.longitude) !== telemetryLocationFilter) return false;
                }
                if (telemetrySpeedFilter !== 'all') {
                  if (row.speed_mph == null) return false;
                  if (telemetrySpeedFilter === 'stationary' && row.speed_mph >= 0.5) return false;
                  if (telemetrySpeedFilter === 'moving' && (row.speed_mph < 0.5 || row.speed_mph >= 40)) return false;
                  if (telemetrySpeedFilter === 'fast' && row.speed_mph < 40) return false;
                }
                return true;
              });

              const sortDirMul = telemetrySortDir === 'asc' ? 1 : -1;
              const sortedRows = [...filteredRows].sort((a, b) => {
                if (telemetrySortBy === 'employee') return a.driver_name.localeCompare(b.driver_name) * sortDirMul;
                if (telemetrySortBy === 'speed') return ((a.speed_mph ?? -1) - (b.speed_mph ?? -1)) * sortDirMul;
                const at = a.last_ping ? new Date(a.last_ping).getTime() : 0;
                const bt = b.last_ping ? new Date(b.last_ping).getTime() : 0;
                return (at - bt) * sortDirMul;
              });

              const toggleSort = (col: 'employee' | 'speed' | 'timestamp') => {
                if (telemetrySortBy === col) {
                  setTelemetrySortDir(d => d === 'asc' ? 'desc' : 'asc');
                } else {
                  setTelemetrySortBy(col);
                  setTelemetrySortDir(col === 'employee' ? 'asc' : 'desc');
                }
              };

              const sortHeader = (col: 'employee' | 'speed' | 'timestamp', label: string) => (
                <th onClick={() => toggleSort(col)}>
                  <span className={`telemetry-sort-th ${telemetrySortBy === col ? 'telemetry-sort-th--active' : ''}`}>
                    {label}
                    <ChevronsUpDown size={11} />
                  </span>
                </th>
              );

              const hasActiveFilters = query || telemetryStatusFilter !== 'all' || telemetryLocationFilter !== 'all' || telemetrySpeedFilter !== 'all';

              return (
                <div className="telemetry-card">
                  <div className="telemetry-header">
                    <span className="telemetry-header-icon"><Activity size={14} /></span>
                    <h3 className="telemetry-title">Active Telemetry Feed</h3>
                    <ChevronUp size={16} className="telemetry-chevron" />
                  </div>

                  <div className="telemetry-tabs">
                    <button
                      type="button"
                      className={`telemetry-tab ${telemetryViewTab === 'live' ? 'telemetry-tab--active' : ''}`}
                      onClick={() => setTelemetryViewTab('live')}
                    >
                      <Radio size={13} /> Live Feed
                    </button>
                    <button
                      type="button"
                      className={`telemetry-tab ${telemetryViewTab === 'all' ? 'telemetry-tab--active' : ''}`}
                      onClick={() => setTelemetryViewTab('all')}
                    >
                      <Clock size={13} /> All Activity
                    </button>
                  </div>

                  <div className="telemetry-filter-bar">
                    <div className="telemetry-search-wrap">
                      <Search size={14} />
                      <input
                        type="text"
                        placeholder="Search employee..."
                        value={telemetrySearchQuery}
                        onChange={(e) => setTelemetrySearchQuery(e.target.value)}
                      />
                    </div>

                    <div className="telemetry-pill-select-wrap">
                      <span className="telemetry-pill-icon"><span className="telemetry-status-dot" /></span>
                      <select
                        className="telemetry-pill-select"
                        value={telemetryStatusFilter}
                        onChange={(e) => setTelemetryStatusFilter(e.target.value as any)}
                      >
                        <option value="all">All Status</option>
                        <option value="moving">Moving</option>
                        <option value="idle">Idle</option>
                        <option value="stationary">Stationary</option>
                      </select>
                      <ChevronDown size={12} className="telemetry-pill-chevron" />
                    </div>

                    <div className="telemetry-pill-select-wrap">
                      <span className="telemetry-pill-icon"><MapPinned size={13} color="#94A3B8" /></span>
                      <select
                        className="telemetry-pill-select"
                        value={telemetryLocationFilter}
                        onChange={(e) => setTelemetryLocationFilter(e.target.value)}
                      >
                        <option value="all">All Locations</option>
                        {depots.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                      </select>
                      <ChevronDown size={12} className="telemetry-pill-chevron" />
                    </div>

                    <div className="telemetry-pill-select-wrap">
                      <span className="telemetry-pill-icon"><Gauge size={13} color="#94A3B8" /></span>
                      <select
                        className="telemetry-pill-select"
                        value={telemetrySpeedFilter}
                        onChange={(e) => setTelemetrySpeedFilter(e.target.value as any)}
                      >
                        <option value="all">All Speeds</option>
                        <option value="stationary">Stationary</option>
                        <option value="moving">Moving (&lt;40mph)</option>
                        <option value="fast">Fast (40mph+)</option>
                      </select>
                      <ChevronDown size={12} className="telemetry-pill-chevron" />
                    </div>

                    <span className="telemetry-today-chip" title="This feed reflects live/current-day telemetry">
                      <Calendar size={13} /> Today
                    </span>

                    <button
                      type="button"
                      className="telemetry-filter-icon-btn"
                      onClick={() => {
                        setTelemetrySearchQuery('');
                        setTelemetryStatusFilter('all');
                        setTelemetryLocationFilter('all');
                        setTelemetrySpeedFilter('all');
                      }}
                      title="Clear filters"
                    >
                      <Filter size={14} />
                    </button>
                  </div>

                  <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
                    <table className="data-table telemetry-table">
                      <thead>
                        <tr>
                          {sortHeader('employee', 'Employee')}
                          <th>Last Ping Location</th>
                          {sortHeader('speed', 'Speed')}
                          <th>Telemetry Status</th>
                          {sortHeader('timestamp', 'Timestamp')}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedRows.length === 0 ? (
                          <tr>
                            <td colSpan={5}>
                              <Empty>
                                <EmptyHeader>
                                  <EmptyMedia variant="icon">
                                    <SatelliteDish />
                                  </EmptyMedia>
                                  <EmptyTitle>No Telemetry Data Yet</EmptyTitle>
                                  <EmptyDescription>
                                    {hasActiveFilters
                                      ? 'No employees match the current search/filters.'
                                      : 'No employees currently logged into shifts or no telemetry data available.'}
                                  </EmptyDescription>
                                </EmptyHeader>
                                <EmptyContent>
                                  <button type="button" className="btn btn-secondary" onClick={handleMapRefresh} disabled={isRefreshing}>
                                    <RefreshCw size={13} className={isRefreshing ? 'spin-animation' : ''} /> Refresh Feed
                                  </button>
                                </EmptyContent>
                              </Empty>
                            </td>
                          </tr>
                        ) : (
                          sortedRows.map(loc => (
                            <tr key={loc.driver_id}>
                              <td className="font-bold text-primary">{loc.driver_name}</td>
                              <td className="font-mono text-secondary text-sm">
                                {loc.latitude == null || loc.longitude == null ? (
                                  <span className="text-muted">No recent data</span>
                                ) : (
                                  <div className="flex align-center gap-8">
                                    <span>{loc.latitude.toFixed(6)}, {loc.longitude.toFixed(6)}</span>
                                    <a
                                      href={`https://www.google.com/maps/search/?api=1&query=${loc.latitude},${loc.longitude}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="btn btn-secondary p-4"
                                      style={{ display: 'inline-flex', padding: '4px 8px', fontSize: '10px', minHeight: 'auto', borderRadius: '4px', gap: '4px', textDecoration: 'none' }}
                                      title="Open in Google Maps"
                                    >
                                      🗺️ View Maps
                                    </a>
                                  </div>
                                )}
                              </td>
                              <td className="font-semibold">{loc.speed_mph == null ? '—' : `${loc.speed_mph.toFixed(0)} mph`}</td>
                              <td>
                                <span className={`badge ${loc.status === 'idle' ? 'badge-danger' : loc.status === 'moving' ? 'badge-success' : loc.status === 'offline' ? 'badge-accent' : 'badge-warning'}`}>
                                  {loc.status}
                                </span>
                              </td>
                              <td className="text-secondary text-sm">{loc.last_ping ? new Date(loc.last_ping).toLocaleTimeString() : '—'}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </div>
        )}


        {/* ── TAB 2: Idle Alert Center ─────────────────────── */}
        {activeTab === 'alerts' && (
          <div className="flex-1">
            <div className="flex align-center justify-between mb-16">
              <h2 className="text-xl font-black text-primary m-0">ACTIVE GEOFENCE & IDLE ALERTS</h2>

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

            {/* Category filter pills — quick segmentation instead of the
                old always-on solid-colour SOS/Idle group banners below.
                "Idle >50m" is a real threshold on real alert age, not an
                invented figure. There's no separate "Geofence" category in
                this schema — idle_alerts ARE the geofence/stationary
                alerts (this page's own title uses the word loosely); a
                4th pill duplicating "Idle" with no distinct backing data
                would just be a fake filter, so it's deliberately not here. */}
            <div className="flex gap-8 mb-16">
              {([
                ['all', 'All Alerts'],
                ['sos', 'Emergency SOS'],
                ['idle50', 'Idle >50m'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setAlertCategoryFilter(key)}
                  className={`payroll-pill-btn ${alertCategoryFilter === key ? 'payroll-pill-btn--active' : 'payroll-pill-btn--outline'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {(() => {
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
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <CircleCheck />
                      </EmptyMedia>
                      <EmptyTitle>No Active Alerts</EmptyTitle>
                      <EmptyDescription>
                        {alertCategoryFilter === 'all'
                          ? 'All staff members are moving or on authorized short breaks.'
                          : 'No alerts currently match this filter.'}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
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
              <button
                type="button"
                className="btn flex align-center"
                style={{ gap: '6px', padding: '10px 16px', fontSize: '13px', fontWeight: 800, backgroundColor: 'var(--brand-red)', color: '#FFFFFF', borderColor: 'var(--brand-red)' }}
                onClick={() => setIsAddingEmployee(!isAddingEmployee)}
              >
                <UserPlus size={15} /> Add Employee
              </button>
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
                      <div className="input-group">
                        <span className="input-label">DEFAULT PIN</span>
                        <div className="login-field">
                          <span className="login-field-icon"><Lock size={15} /></span>
                          <input
                            type="text"
                            className="login-input login-input--with-toggle"
                            placeholder="6 digit PIN"
                            value={newEmployeePin}
                            maxLength={6}
                            onChange={(e) => setNewEmployeePin(e.target.value)}
                          />
                          <button
                            type="button"
                            className="login-toggle"
                            title="Generate a random PIN"
                            onClick={() => setNewEmployeePin(generateRandomPin())}
                          >
                            <Sparkles size={15} />
                          </button>
                        </div>
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
            <div className="mb-24">
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
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map(drv => {
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
                          <div className="flex align-center" style={{ gap: '10px' }}>
                            <div
                              aria-hidden="true"
                              style={{
                                width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
                                background: 'var(--charcoal)', color: '#fff', fontSize: '11px', fontWeight: 600,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}
                            >
                              {getInitials(drv.full_name)}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <p className="font-semibold text-primary m-0" style={{ fontSize: '13px' }}>{toTitleCase(drv.full_name)}</p>
                              <p className="font-mono text-xs text-muted m-0">{drv.driver_id}</p>
                            </div>
                          </div>
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
                        <td style={{ position: 'relative', textAlign: 'right' }}>
                          <div className="flex align-center justify-end" style={{ gap: '8px' }}>
                            {activeShift ? (
                              <button
                                className="alert-ack-btn"
                                onClick={() => handleManualClockOut(drv.id, activeShift.id)}
                              >
                                <Clock size={12} /> Clock Out
                              </button>
                            ) : (
                              <button
                                className="comp-edit-btn"
                                onClick={() => handleManualClockIn(drv.id)}
                                disabled={!drv.is_active}
                                style={!drv.is_active ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                              >
                                <Clock size={12} /> Clock In
                              </button>
                            )}
                            <button className="comp-edit-btn" onClick={() => openEditEmployeeModal(drv)}>
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
        {activeTab === 'compliance-defects' && (
          <ComplianceDefects
            organizationId={currentOrgId}
            onBack={() => setActiveTab('compliance')}
          />
        )}

        {/* ── Fleet Roadworthiness — MOT/PMI/VOR asset register, reached
             via the Compliance & Safety hover flyout. ─────────────────── */}
        {activeTab === 'fleet-roadworthiness' && (
          <FleetRoadworthiness
            organizationId={currentOrgId}
            onAlertCountChange={setFleetAlertCount}
            thresholdDays={orgAlertSettings.complianceAlertLeadDays}
            onOpenAlertSettings={() => {
              setActiveSettingsSection('alerts');
              setSettingsModalOpen(true);
            }}
          />
        )}

        {/* ── Driver Hours & WTD — duty monitor, reached via the
             Compliance & Safety hover flyout. ──────────────────────── */}
        {activeTab === 'driver-hours' && (
          <DriverHours
            organizationId={currentOrgId}
            onAlertCountChange={setWtdAlertCount}
            liveLocations={liveLocations}
            depots={depots}
            onViewRouteHistory={() => setActiveTab('live')}
          />
        )}

        {isImportModalOpen && (
          <CarrierSettlementImportModal
            organizationId={currentOrgId}
            onClose={() => setIsImportModalOpen(false)}
            onImported={() => loadData()}
          />
        )}

        {/* ── TAB 4: Compensation Summary (Payroll Admin Only) ───── */}
        {activeTab === 'rates' && userRole === 'payroll_admin' && (
          <div className="flex-1">
            {/* Compensation Profiles is merged into Employee Database now
                (see the `drivers` tab) — this tab is purely the payroll-
                review route the task asked to keep standalone. Its own
                "Section header" below (Compensation Summary) already
                covers the page title, so there's no separate outer
                heading here anymore. */}
            <div>
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

          // Driver search combo: suggestions from the free-text query, capped
          // so the dropdown never becomes a second unscrollable page.
          const driverSuggestions = driverSearchQuery.trim()
            ? employees.filter(d => d.full_name.toLowerCase().includes(driverSearchQuery.trim().toLowerCase())).slice(0, 8)
            : employees.slice(0, 8);

          const selectDriver = (driverId: string, driverName: string) => {
            setReportEmployeeFilter(driverId);
            setDriverSearchQuery(driverName);
            setIsDriverSearchOpen(false);
          };

          const clearDriverFilter = () => {
            setReportEmployeeFilter('all');
            setDriverSearchQuery('');
          };

          return (
            <div>
              {/* -- Section header ---------------------------------- */}
              <div className="flex align-center justify-between mb-24" style={{ flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 className="text-xl font-black text-primary m-0">Compensation Summary</h2>
                  <p className="text-xs text-muted mt-4">Shift-by-shift earnings, Night Out allowances, and exports for the selected period</p>
                </div>

                <div className="flex align-center gap-8" style={{ flexWrap: 'wrap' }}>
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
                  <button
                    className={`payroll-pill-btn ${showOnlyNightOutRequested ? 'payroll-pill-btn--active' : 'payroll-pill-btn--outline'}`}
                    onClick={() => setShowOnlyNightOutRequested(!showOnlyNightOutRequested)}
                  >
                    <Moon size={13} />
                    {showOnlyNightOutRequested ? 'SHOWING N/O ONLY' : 'FILTER N/O REQUESTS'}
                    {pendingNightOutsCount > 0 && (
                      <span className="payroll-pill-badge">{pendingNightOutsCount}</span>
                    )}
                  </button>
                </div>
              </div>

              {/* -- Filter bar --------------------------------------- */}
              <div className="payroll-filter-bar">
                <div className="payroll-filter-field">
                  <span className="input-label">Agency</span>
                  <div className="payroll-input-wrap">
                    <span className="payroll-input-icon"><Building2 size={14} /></span>
                    <select
                      className="select-field"
                      style={{ width: '160px' }}
                      value={reportAgencyFilter}
                      onChange={(e) => setReportAgencyFilter(e.target.value)}
                    >
                      <option value="all">All Agencies</option>
                      {agencies.map(ag => (
                        <option key={ag} value={ag}>{ag}</option>
                      ))}
                    </select>
                    <ChevronDown size={13} className="payroll-input-chevron" />
                  </div>
                </div>

                <div className="payroll-filter-field">
                  <span className="input-label">Driver</span>
                  <div className="payroll-driver-search">
                    <div className="payroll-input-wrap">
                      <span className="payroll-input-icon"><Search size={14} /></span>
                      <input
                        type="text"
                        className="input-field"
                        style={{ width: '100%', paddingRight: '34px' }}
                        placeholder="Search/select driver"
                        value={driverSearchQuery}
                        onFocus={() => setIsDriverSearchOpen(true)}
                        onChange={(e) => {
                          setDriverSearchQuery(e.target.value);
                          setIsDriverSearchOpen(true);
                          if (reportEmployeeFilter !== 'all') setReportEmployeeFilter('all');
                        }}
                        onBlur={() => setTimeout(() => setIsDriverSearchOpen(false), 150)}
                      />
                      {(driverSearchQuery || reportEmployeeFilter !== 'all') && (
                        <button
                          type="button"
                          className="payroll-driver-clear"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={clearDriverFilter}
                          aria-label="Clear driver filter"
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>

                    {isDriverSearchOpen && (
                      <div className="payroll-driver-dropdown">
                        {driverSuggestions.length === 0 ? (
                          <div className="payroll-driver-empty">No drivers match "{driverSearchQuery}"</div>
                        ) : (
                          driverSuggestions.map(d => (
                            <div
                              key={d.id}
                              className={`payroll-driver-option ${reportEmployeeFilter === d.id ? 'payroll-driver-option--highlighted' : ''}`}
                              onMouseDown={(e) => { e.preventDefault(); selectDriver(d.id, d.full_name); }}
                            >
                              {d.full_name}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="payroll-filter-field" style={{ minWidth: '220px' }}>
                  <span className="input-label">Date Range</span>
                  <EarningsDateRangePicker
                    startDate={reportDateStart}
                    endDate={reportDateEnd}
                    onChange={(start, end) => { setReportDateStart(start); setReportDateEnd(end); }}
                  />
                </div>
              </div>

              {/* -- Action row: view toggle, exports, bulk edit ------ */}
              <div className="payroll-action-row">
                <div className="payroll-action-group">
                  {/* Detailed View / Weekly Summary / Export Summary used to
                      be three permanently-visible pills; consolidated into
                      one dropdown so the row doesn't eat so much width. */}
                  <Popover open={summaryMenuOpen} onOpenChange={setSummaryMenuOpen}>
                    <PopoverTrigger asChild>
                      <button type="button" className="payroll-pill-btn payroll-pill-btn--outline">
                        {reportViewMode === 'detailed' ? <ListChecks size={13} /> : <BarChart3 size={13} />}
                        {reportViewMode === 'detailed' ? 'Detailed View' : 'Weekly Summary'}
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
                        onClick={() => { setReportViewMode('summary'); setSummaryMenuOpen(false); }}
                        className="flex items-center gap-2 w-full text-sm"
                        style={{ padding: '8px 10px', borderRadius: '6px', border: 'none', background: reportViewMode === 'summary' ? 'var(--brand-red-light)' : 'transparent', color: reportViewMode === 'summary' ? 'var(--brand-red)' : 'var(--charcoal)', fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
                      >
                        <BarChart3 size={13} /> Weekly Summary
                      </button>
                      <div style={{ borderTop: '1px solid var(--border-color)', margin: '4px 0' }} />
                      <button
                        type="button"
                        onClick={() => { handleExportSummaryCSV(); setSummaryMenuOpen(false); }}
                        className="flex items-center gap-2 w-full text-sm"
                        style={{ padding: '8px 10px', borderRadius: '6px', border: 'none', background: 'transparent', color: 'var(--charcoal)', fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
                      >
                        <Download size={13} /> Export Summary
                      </button>
                      <div style={{ borderTop: '1px solid var(--border-color)', margin: '4px 0' }} />
                      {/* EXCEL TEMPLATE INJECTION — same invisible-file-input-
                          over-the-row trick as before, just sized to a menu
                          row instead of a pill. */}
                      <div style={{ position: 'relative' }}>
                        <input
                          type="file"
                          accept=".xlsx, .xls"
                          onChange={(e) => { handleFillExcelTemplate(e); setSummaryMenuOpen(false); }}
                          style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', cursor: 'pointer', zIndex: 10, left: 0, top: 0 }}
                          title="Upload Payment Template (Step 2)"
                          onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
                        />
                        <div
                          className="flex items-center gap-2 w-full text-sm"
                          style={{ padding: '8px 10px', borderRadius: '6px', color: 'var(--charcoal)', fontWeight: 600 }}
                        >
                          <Wand2 size={13} /> Fill Excel Template
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <button className="payroll-pill-btn" onClick={() => { exportCSV(); flashExported('csv'); }}>
                    <DownloadIcon done={justExported === 'csv'} /> Export CSV
                  </button>
                  <button className="payroll-pill-btn" onClick={() => { exportExcel(); flashExported('excel'); }}>
                    <FileSpreadsheet size={13} /> Export Excel
                  </button>
                </div>

                {reportViewMode === 'detailed' && (
                  <div className="payroll-bulk-bar">
                    {selectedShiftIds.size > 0 ? (
                      <>
                        <span className="text-sm font-black text-primary">{selectedShiftIds.size} SELECTED</span>
                        <button
                          className="payroll-pill-btn"
                          onClick={() => openActionModal('bulk', Array.from(selectedShiftIds), 'Bulk Update')}
                        >
                          Edit Selected
                        </button>
                        <button className="btn btn-secondary text-xs" onClick={() => setSelectedShiftIds(new Set())}>CANCEL</button>
                      </>
                    ) : (
                      <span className="text-xs text-muted">Use checkboxes to edit multiple shifts at once</span>
                    )}
                  </div>
                )}
              </div>

              {/* -- Reports Payroll Data Table / Dual View ----------- */}
              {reportViewMode === 'summary' ? (
                <>
                  <div className="payroll-table-wrap">
                    <table className="payroll-table">
                      <thead>
                        <tr>
                          <th>Employee</th>
                          <th>Agency</th>
                          <th>Shifts Logged</th>
                          <th>Total Hours</th>
                          <th>Night Outs</th>
                          <th>Total Extras</th>
                          <th>Total Gross Pay</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const summaryData: any = {};
                          filteredShifts.forEach(shift => {
                             const { grossPay, noAmt, extrasAmt, liveHours } = getShiftFinancials(shift);
                             const id = shift.driver_id;
                             if (!summaryData[id]) {
                                 summaryData[id] = {
                                     driver_name: shift.driver_name,
                                     driver_code: shift.driver_code,
                                     agency: employeeRates[id]?.agency_name || 'Direct',
                                     total_hours: 0,
                                     total_gross: 0,
                                     total_night_outs: 0,
                                     total_extras: 0,
                                     shift_count: 0
                                 };
                             }
                             summaryData[id].total_hours += liveHours;
                             summaryData[id].total_gross += grossPay;
                             summaryData[id].total_extras += extrasAmt;
                             summaryData[id].total_night_outs += (noAmt > 0 ? 1 : 0);
                             // Prevent double counting split shifts
                             if (!shift.is_week_boundary || shift.boundary_label?.includes('Part 1')) {
                                 summaryData[id].shift_count += 1;
                             }
                          });

                          const rows = Object.values(summaryData);
                          if (rows.length === 0) return (
                            <tr>
                              <td colSpan={7}>
                                <Empty className="py-16">
                                  <EmptyHeader>
                                    <EmptyMedia variant="icon">
                                      <BarChart3 />
                                    </EmptyMedia>
                                    <EmptyTitle>No Data for This Summary</EmptyTitle>
                                    <EmptyDescription>Completed shifts matching the current filters will be totalled here.</EmptyDescription>
                                  </EmptyHeader>
                                </Empty>
                              </td>
                            </tr>
                          );

                          return rows.map((row: any) => (
                             <tr key={row.driver_code}>
                                <td className="font-bold text-primary">{row.driver_name}</td>
                                <td><span className="payroll-agency-badge">{row.agency}</span></td>
                                <td className="font-semibold">{row.shift_count}</td>
                                <td>{row.total_hours.toFixed(2)} hrs</td>
                                <td>{row.total_night_outs > 0 ? <span className="text-success font-bold">+{row.total_night_outs} (N/O)</span> : '—'}</td>
                                <td>{row.total_extras !== 0 ? <span className="text-primary font-bold">£{row.total_extras.toFixed(2)}</span> : '—'}</td>
                                <td className="font-black text-success text-md">£{row.total_gross.toFixed(2)}</td>
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
                    const detailedGridCols = '36px 1.3fr 110px 1.2fr 90px 130px 110px 2fr 100px';
                    const allShiftsSelected = filteredShifts.length > 0 && selectedShiftIds.size === new Set(filteredShifts.map(s => s.real_id || s.id)).size;
                    return (
                  <div className="rounded-lg border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--card-bg)', overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                      <div style={{ minWidth: '1100px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: detailedGridCols, alignItems: 'center', padding: '10px 12px', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--charcoal-light)', background: 'var(--card-bg-hover)', borderBottom: '1px solid var(--border-color)' }}>
                          <div style={{ display: 'flex', justifyContent: 'center' }}>
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
                          </div>
                          <div>Driver Name</div>
                          <div>Fleet Agency</div>
                          <div>Shift Schedule</div>
                          <div>Hours</div>
                          <div>Hourly Rate</div>
                          <div>Night Out</div>
                          <div>Flags &amp; Actions</div>
                          <div style={{ textAlign: 'right' }}>Gross Pay (£)</div>
                        </div>

                        {filteredShifts.length === 0 ? (
                          <Empty className="py-24">
                            <EmptyHeader>
                              <EmptyMedia variant="icon">
                                <ListChecks />
                              </EmptyMedia>
                              <EmptyTitle>No Completed Shifts</EmptyTitle>
                              <EmptyDescription>No shifts match the currently active filters.</EmptyDescription>
                            </EmptyHeader>
                          </Empty>
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
                              <div key={shift.id} style={{ display: 'grid', gridTemplateColumns: detailedGridCols, alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid var(--border-color)', ...rowStyle }}>
                                <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', justifyContent: 'center' }}>
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
                                </div>
                                <div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <span className="font-medium text-primary" style={{ fontSize: '13px' }}>{shift.driver_name ? toTitleCase(shift.driver_name) : '—'}</span>
                                    {isRequested && (
                                      <span className="badge badge-warning text-xs font-bold" style={{ alignSelf: 'flex-start', padding: '2px 6px', fontSize: '10px' }}>
                                        N/O REQUESTED
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div>
                                  <span className="payroll-agency-badge">{agency}</span>
                                </div>
                                <div>
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
                                </div>
                                <div className="font-mono tabular-nums text-secondary" style={{ fontSize: '12px' }}>
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
                                </div>
                                <div className="font-mono tabular-nums" style={{ fontSize: '12.5px', color: 'var(--charcoal)' }}>
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
                                </div>
                                <div>
                                  {noAmount > 0 ? (
                                    <span className="badge badge-success font-bold">
                                      +£{noAmount.toFixed(2)} N/O
                                    </span>
                                  ) : (
                                    <span className="text-muted text-xs">—</span>
                                  )}
                                </div>
                                <div>
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
                                </div>
                                <div className="font-mono font-semibold tabular-nums" style={{ fontSize: '13.5px', textAlign: 'right', color: shiftGrossPay > 0 ? 'var(--charcoal)' : 'var(--charcoal-light)' }}>
                                  £{shiftGrossPay.toFixed(2)}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
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
          </div>
        )}

        {(activeTab === 'analytics' || activeTab === 'shipments') && userRole === 'payroll_admin' && (() => {
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
            'This Week': null, 'This Month': null,
            'Last 4 weeks': 4, 'Last 8 weeks': 8, 'Last 12 weeks': 12, 'All time': null,
          };
          const startOfTodayForPeriod = new Date();
          startOfTodayForPeriod.setHours(0, 0, 0, 0);
          const isoDayOfWeek = (startOfTodayForPeriod.getDay() + 6) % 7; // Mon=0..Sun=6
          const startOfThisWeek = new Date(startOfTodayForPeriod);
          startOfThisWeek.setDate(startOfTodayForPeriod.getDate() - isoDayOfWeek);
          const startOfThisMonth = new Date(startOfTodayForPeriod.getFullYear(), startOfTodayForPeriod.getMonth(), 1);
          const NAMED_PERIOD_CUTOFFS: Record<string, number> = {
            'This Week': startOfThisWeek.getTime(),
            'This Month': startOfThisMonth.getTime(),
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
          const periodFilter = analyticsFilters.find(f => f.type === FilterType.PERIOD && f.value.length > 0);
          const periodWeeks = periodFilter ? PERIOD_WEEKS[periodFilter.value[0]] ?? null : null;
          const periodCutoff = periodFilter
            ? NAMED_PERIOD_CUTOFFS[periodFilter.value[0]] ?? (periodWeeks ? Date.now() - periodWeeks * 7 * 24 * 60 * 60 * 1000 : null)
            : null;

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
            return true;
          };
          const matchesShiftFilters = (s: Shift) => {
            if (!matchesNonPeriodFilters(s)) return false;
            if (periodCutoff && new Date(s.start_time).getTime() < periodCutoff) return false;
            return true;
          };
          // Sub-15-minute shifts (a clock-in/out test, or an immediate
          // mis-tap) are excluded from every Profitability figure below —
          // a near-zero wage against a real or pending revenue figure
          // drags the reported margin toward 100% and misrepresents real
          // fleet performance. They still exist as real rows everywhere
          // else (Payroll, Live Dispatch); this filter is scoped to the
          // Profitability cockpit only.
          const completedShiftsForAnalytics = shifts.filter(s => s.status === 'completed' && (s.total_hours ?? 0) >= 0.25 && matchesShiftFilters(s));

          // Live wage accrual — deliberately kept OUT of totalDriverCost/
          // Net Profit/Margin above: those are computed only over
          // completed + rated shifts specifically so a batch of un-rated
          // loads can't drag the reported margin toward zero (see the
          // comment on shiftsWithRevenue below). An active shift has no
          // revenue yet by definition, so folding its accruing wage into
          // that same pool would reintroduce exactly the distortion that
          // invariant exists to prevent. Shown as its own supplementary
          // figure instead — getShiftFinancials() already computes a live
          // elapsed-time estimate for any shift with no end_time (see its
          // "CALCULATE LIVE HOURS FOR ONGOING SHIFTS" branch), and the
          // existing 15s loadData() polling loop re-renders this
          // component regularly, so recomputing it on every render is
          // enough to make it visibly tick up — no separate timer needed.
          const activeShiftsForAnalytics = shifts.filter(s => s.status === 'active' && matchesShiftFilters(s));
          const liveActiveWages = activeShiftsForAnalytics.reduce((sum, s) => sum + getShiftFinancials(s).grossPay, 0);

          // Profitability Cockpit — one unified view of company revenue vs.
          // operating cost. Every figure here (the KPI strip, the chart,
          // and the ledger's Gross Margin column) is computed only over
          // shifts that actually have a revenue figure set
          // (shiftsWithRevenue) — a batch of un-rated loads can't silently
          // drag the reported margin toward zero, and
          // Revenue − Wages − Fuel = Gross Profit holds exactly, every
          // time, instead of mixing totals from different shift sets.
          // Un-rated shifts still appear in the ledger below, flagged
          // "Pending Remittance", and flow into these totals the moment a
          // dispatcher sets their rate.
          //
          // This is deliberately labelled "Gross", not "Net" — it deducts
          // driver wages and an estimated fuel cost, but not overhead,
          // insurance, leasing, or other fixed costs this schema has no
          // record of. Calling it Net Profit would overstate real
          // profitability.
          const shiftsWithRevenue = completedShiftsForAnalytics.filter(s => s.revenue_amount !== null && s.revenue_amount !== undefined);

          const TARGET_MARGIN_PCT = 35;
          // GPS miles (mileageByShift, read directly where the ledger/CSV
          // display them) stay a separate, purely informational column —
          // migration 045's shift_mileages() RPC, no longer what fuel
          // cost is derived from.
          // Actual Fuel Cost — sum of a shift's admin-approved fuel
          // receipts (migration 047), replacing the old GPS-mileage ×
          // £/mile estimate. A shift with no approved receipts contributes
          // £0 here, which is an honest "not yet recorded", not a claim
          // that the shift used no fuel.
          const shiftFuelCost = (s: Shift) => approvedFuelCostByShift[s.id] ?? 0;
          // Single source of truth for a shift's own gross margin (£) —
          // reused by the ledger sort, the ledger's Gross Margin cell, and
          // the CSV export, so those three can never silently disagree.
          const shiftGrossMargin = (s: Shift): number | null => {
            if (s.revenue_amount === null || s.revenue_amount === undefined) return null;
            return s.revenue_amount - (s.total_pay || 0) - shiftFuelCost(s);
          };

          const totalRevenue = shiftsWithRevenue.reduce((sum, s) => sum + (s.revenue_amount || 0), 0);
          const totalDriverCost = shiftsWithRevenue.reduce((sum, s) => sum + (s.total_pay || 0), 0);
          // Deliberately NOT scoped to shiftsWithRevenue like Revenue/Payroll
          // above — an approved fuel receipt is a real, already-incurred
          // cost the moment an admin approves it, regardless of whether
          // that shift's load has been rated for revenue yet (or even
          // completed: an active shift's driver can refuel mid-shift and
          // have it approved). Still scoped to shifts matching the current
          // driver/agency/depot/period filters, just not to "rated" ones,
          // so approving a receipt shows up here immediately instead of
          // waiting on an unrelated dispatcher action.
          const allFilteredShiftIds = new Set(shifts.filter(matchesShiftFilters).map(s => s.id));
          const totalFuelCost = fuelReceipts.reduce((sum, r) => {
            if (r.status !== 'approved' || !r.shift_id || !allFilteredShiftIds.has(r.shift_id)) return sum;
            return sum + (r.total_cost ?? 0);
          }, 0);
          const grossProfit = totalRevenue - totalDriverCost - totalFuelCost;
          const grossMarginPct = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : null;
          const totalHours = shiftsWithRevenue.reduce((sum, s) => sum + (s.total_hours || 0), 0);
          const marginBenchmarkLabel: 'Healthy' | 'Caution' | 'Below Target' | null =
            grossMarginPct === null ? null
              : grossMarginPct >= TARGET_MARGIN_PCT ? 'Healthy'
              : grossMarginPct >= TARGET_MARGIN_PCT * 0.7 ? 'Caution'
              : 'Below Target';

          // Total litres — approved fuel_receipts rows only, scoped to the
          // same allFilteredShiftIds set the £ fuel total above uses, so
          // the P&L strip's "£X · Y litres" pairing is always the same
          // underlying receipts, not two different scopes.
          const totalFuelLiters = fuelReceipts.reduce((sum, r) => {
            if (r.status !== 'approved' || !r.shift_id || !allFilteredShiftIds.has(r.shift_id)) return sum;
            return sum + (r.liters ?? 0);
          }, 0);

          // Fleet Unit Economics — £/mile is ideally scoped to shifts that
          // have both a settled revenue figure and a real GPS mileage
          // reading. Early in a period (or a org that's just started
          // logging GPS), that set can be genuinely empty even though the
          // fleet has other completed, mileage-logged shifts — falling
          // back to fleet-wide logged miles for the period avoids a blank
          // "—" in that case, at the cost of the rate/mile figure then
          // being a blended estimate (real revenue ÷ a broader mileage
          // base than earned it) rather than an exact one; the UI marks it
          // "(fleet-wide)" whenever this fallback is actually used.
          const totalGpsMiles = shiftsWithRevenue.reduce((sum, s) => sum + (mileageByShift[s.id] ?? 0), 0);
          const totalFleetLoggedMiles = completedShiftsForAnalytics.reduce((sum, s) => sum + (mileageByShift[s.id] ?? 0), 0);
          const usingFleetWideMiles = totalGpsMiles <= 0 && totalFleetLoggedMiles > 0;
          const validMiles = totalGpsMiles > 0 ? totalGpsMiles : totalFleetLoggedMiles;
          const ratePerMile = validMiles > 0 ? totalRevenue / validMiles : null;
          const costPerMile = validMiles > 0 ? (totalDriverCost + totalFuelCost) / validMiles : null;
          const yieldPerMile = ratePerMile !== null && costPerMile !== null ? ratePerMile - costPerMile : null;
          const opCostTotal = totalDriverCost + totalFuelCost;
          const wagesSharePct = opCostTotal > 0 ? (totalDriverCost / opCostTotal) * 100 : 0;
          const fuelSharePct = opCostTotal > 0 ? 100 - wagesSharePct : 0;
          // Miles per litre — approved-fuel-scoped litres against the same
          // GPS mileage base as £/mile above, so the two per-mile figures
          // never silently disagree on which shifts they're counting.
          const milesPerLitre = totalFuelLiters > 0 && validMiles > 0 ? validMiles / totalFuelLiters : null;

          // Driver profitability leaderboard — the "who and what" view
          // that used to exist (per the comment above about the old
          // Driver Profitability card) and was removed with nothing put
          // back in its place. Summed gross margin per driver, over the
          // same shiftsWithRevenue set everything else in this cockpit
          // uses, so a driver's leaderboard figure always agrees with
          // what the ledger below would show for their own rows.
          const driverMarginMap = new Map<string, { name: string; margin: number; shifts: number }>();
          shiftsWithRevenue.forEach(s => {
            const m = shiftGrossMargin(s);
            if (m === null) return;
            const name = driverNameById.get(s.driver_id) || 'Unknown driver';
            const entry = driverMarginMap.get(s.driver_id) ?? { name, margin: 0, shifts: 0 };
            entry.margin += m;
            entry.shifts += 1;
            driverMarginMap.set(s.driver_id, entry);
          });
          const driverLeaderboard = Array.from(driverMarginMap.values()).sort((a, b) => b.margin - a.margin);
          const leaderboardTop = driverLeaderboard.slice(0, 3);
          const leaderboardBottom = driverLeaderboard.length > 6 ? driverLeaderboard.slice(-3) : [];
          const leaderboardMaxAbs = Math.max(1, ...driverLeaderboard.map(d => Math.abs(d.margin)));

          // Status strip — the things Compensation Summary's own "Flags &
          // Reviews" bell already tracks (see its comment elsewhere in
          // this file), but surfaced here too: this tab is meant to answer
          // "is the business healthy right now", and today it doesn't
          // show a single thing that needs a decision unless you already
          // know to check a different tab. A genuine loss-making shift
          // (not just "lowest margin of an otherwise fine set") is named
          // outright rather than left for someone to find in the ledger.
          const flaggedShiftsCount = completedShiftsForAnalytics.filter(
            s => (s.total_hours ?? 0) > orgAlertSettings.longShiftFlagHours,
          ).length;
          const lossMakingShifts = shiftsWithRevenue
            .map(s => ({ name: driverNameById.get(s.driver_id) || 'Unknown driver', margin: shiftGrossMargin(s) }))
            .filter((x): x is { name: string; margin: number } => x.margin !== null && x.margin < 0)
            .sort((a, b) => a.margin - b.margin);
          const worstLossShift = lossMakingShifts.length > 0 ? lossMakingShifts[0] : null;

          // Period-over-period deltas — only meaningful when a specific
          // "Last N weeks" window is selected (there's no natural "period
          // before All time" to compare against). The comparison window is
          // the same length, immediately before the current one, with the
          // same Driver/Agency/Depot filters applied — a like-with-like
          // comparison rather than a guess.
          const previousPeriodShiftsWithRevenue = (periodWeeks && periodCutoff)
            ? shifts.filter(s => {
                if (s.status !== 'completed' || !matchesNonPeriodFilters(s)) return false;
                if (s.revenue_amount === null || s.revenue_amount === undefined) return false;
                const t = new Date(s.start_time).getTime();
                const prevStart = periodCutoff - periodWeeks * 7 * 24 * 60 * 60 * 1000;
                return t >= prevStart && t < periodCutoff;
              })
            : [];
          const prevRevenue = previousPeriodShiftsWithRevenue.reduce((sum, s) => sum + (s.revenue_amount || 0), 0);
          const prevCost = previousPeriodShiftsWithRevenue.reduce((sum, s) => sum + (s.total_pay || 0), 0);
          const prevFuelCost = previousPeriodShiftsWithRevenue.reduce((sum, s) => sum + shiftFuelCost(s), 0);
          const prevProfit = prevRevenue - prevCost - prevFuelCost;
          const prevMargin = prevRevenue > 0 ? (prevProfit / prevRevenue) * 100 : null;
          const prevHours = previousPeriodShiftsWithRevenue.reduce((sum, s) => sum + (s.total_hours || 0), 0);

          const computeKpiDelta = (current: number | null, previous: number | null, asPercentagePoints = false): { direction: BadgeDeltaDirection; label: string } | null => {
            if (!periodWeeks || current === null || previous === null) return null;
            if (previous === 0 && current === 0) return null;
            if (previous === 0) {
              if (current === 0) return null;
              return { direction: current > 0 ? 'up' : 'down', label: 'New' };
            }
            const diff = asPercentagePoints ? current - previous : ((current - previous) / Math.abs(previous)) * 100;
            const direction: BadgeDeltaDirection = diff > 0.05 ? 'up' : diff < -0.05 ? 'down' : 'flat';
            const label = `${diff > 0 ? '+' : ''}${diff.toFixed(1)}${asPercentagePoints ? 'pp' : '%'}`;
            return { direction, label };
          };
          // Which direction is actually "good" per metric — an increase in
          // Driver Cost is bad, not good, so its badge can't just mirror
          // Load Revenue's colouring. Total Hours has no inherent good/bad
          // direction, so its badge stays neutral regardless of sign.
          const KPI_GOOD_DIRECTION: Record<'revenue' | 'cost' | 'fuel' | 'profit' | 'margin' | 'hours', BadgeDeltaDirection | null> = {
            revenue: 'up', cost: 'down', fuel: 'down', profit: 'up', margin: 'up', hours: null,
          };
          const kpiDeltaTone = (direction: BadgeDeltaDirection, key: keyof typeof KPI_GOOD_DIRECTION): BadgeDeltaTone => {
            const good = KPI_GOOD_DIRECTION[key];
            if (good === null || direction === 'flat') return 'neutral';
            return direction === good ? 'positive' : 'negative';
          };
          const kpiDeltas: Record<'revenue' | 'cost' | 'fuel' | 'profit' | 'margin' | 'hours', { direction: BadgeDeltaDirection; label: string } | null> = {
            revenue: computeKpiDelta(totalRevenue, prevRevenue),
            cost: computeKpiDelta(totalDriverCost, prevCost),
            fuel: computeKpiDelta(totalFuelCost, prevFuelCost),
            profit: computeKpiDelta(grossProfit, prevProfit),
            margin: computeKpiDelta(grossMarginPct, prevMargin, true),
            hours: computeKpiDelta(totalHours, prevHours),
          };

          // Daily bars, oldest first — grouped by calendar date rather than
          // ISO week, so even a short period shows real day-by-day movement
          // instead of being averaged into one bar. Built from every
          // completed shift in the period, not just rated ones — a day
          // with real driver activity but no rated load yet still gets a
          // bar (wages/fuel/hours are real regardless of rating status;
          // only revenue_amount is genuinely unknown, and (s.revenue_amount
          // || 0) already reports that as 0 rather than guessing).
          // Iterating shiftsWithRevenue only used to drop any day whose
          // shifts hadn't been rated yet, which read as a "missing day"
          // rather than an honest zero-revenue bar.
          const dayTotals = new Map<string, { date: Date; revenue: number; cost: number; fuel: number; hours: number }>();
          completedShiftsForAnalytics.forEach(s => {
            const d = new Date(s.start_time);
            const key = d.toISOString().slice(0, 10);
            const existing = dayTotals.get(key);
            dayTotals.set(key, {
              date: existing?.date ?? d,
              revenue: (existing?.revenue ?? 0) + (s.revenue_amount || 0),
              cost: (existing?.cost ?? 0) + (s.total_pay || 0),
              fuel: (existing?.fuel ?? 0) + shiftFuelCost(s),
              hours: (existing?.hours ?? 0) + (s.total_hours || 0),
            });
          });
          // Operating cost = wages + fuel, stacked as two segments of one
          // bar in the chart; targetCostLine is the £ ceiling that day's
          // revenue would allow while still hitting TARGET_MARGIN_PCT — a
          // dotted overlay a bar can visibly cross, not a flat number that
          // means nothing without knowing that day's revenue.
          const dailySeries = Array.from(dayTotals.values())
            .sort((a, b) => a.date.getTime() - b.date.getTime())
            .map(d => ({
              label: d.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
              dayLetter: d.date.toLocaleDateString('en-GB', { weekday: 'short' }),
              revenue: Math.round(d.revenue * 100) / 100,
              cost: Math.round(d.cost * 100) / 100,
              fuel: Math.round(d.fuel * 100) / 100,
              profit: Math.round((d.revenue - d.cost - d.fuel) * 100) / 100,
              hours: Math.round(d.hours * 100) / 100,
              margin: d.revenue > 0 ? ((d.revenue - d.cost - d.fuel) / d.revenue) * 100 : 0,
              targetCostLine: Math.round(d.revenue * (1 - TARGET_MARGIN_PCT / 100) * 100) / 100,
            }));


          // Carrier filter — same multi-select pattern as Driver/Agency/
          // Depot, over the real carrier_name values actually present on
          // rated loads in this org (never a hardcoded Amazon/DHL/Stobart
          // list — an org that's never imported from a given carrier
          // simply won't have it as an option yet).
          const carrierFilter = analyticsFilters.find(f => f.type === FilterType.CARRIER && f.value.length > 0);
          const matchesCarrierFilter = (s: Shift) => {
            if (!carrierFilter) return true;
            const included = !!s.carrier_name && carrierFilter.value.includes(s.carrier_name);
            return carrierFilter.operator === FilterOperator.IS_NOT ? !included : included;
          };

          // Shift Revenue / Load Yield — every completed shift in the
          // filtered period (not just rated ones). Default sort is most
          // recent first; clicking the Gross Margin header switches to
          // lowest margin first so problem loads surface immediately.
          // Pending-remittance rows (no margin yet) always sort to the
          // bottom in margin mode — an unrated load isn't "low margin",
          // it's unknown, and shouldn't be conflated with a real loss.
          const loadRevenueRowsAll = [...completedShiftsForAnalytics].filter(matchesCarrierFilter).sort((a, b) => {
            if (ledgerSort === 'date') return new Date(b.start_time).getTime() - new Date(a.start_time).getTime();
            const marginA = shiftGrossMargin(a);
            const marginB = shiftGrossMargin(b);
            if (marginA === null && marginB === null) return 0;
            if (marginA === null) return 1;
            if (marginB === null) return -1;
            return marginA - marginB;
          });
          const loadRevenueRows = loadRevenueRowsAll;

          const exportLedgerCsv = () => {
            const rows = loadRevenueRowsAll.map(s => {
              const isPending = s.revenue_amount === null || s.revenue_amount === undefined;
              const margin = shiftGrossMargin(s);
              const miles = mileageByShift[s.id];
              return {
                Date: new Date(s.start_time).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
                Driver: toTitleCase(s.driver_name ?? ''),
                'Assigned Vehicle': s.vehicle_number ?? '',
                'Base/Depot': s.depot_name ?? '',
                Carrier: s.carrier_name ?? '',
                'Load Reference': s.load_reference ?? '',
                Duration: formatHoursMinutes(s.total_hours ?? 0),
                'GPS Miles': miles === undefined ? '' : miles.toFixed(1),
                'Driver Wage (£)': (s.total_pay ?? 0).toFixed(2),
                'Actual Fuel Cost (£)': shiftFuelCost(s).toFixed(2),
                'Billed Revenue (£)': isPending ? 'Pending Remittance' : (s.revenue_amount as number).toFixed(2),
                'Gross Margin (£)': margin === null ? '' : margin.toFixed(2),
                'Gross Margin (%)': margin === null || !s.revenue_amount ? '' : ((margin / s.revenue_amount) * 100).toFixed(1),
              };
            });
            const csv = Papa.unparse(rows);
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `payroll-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
            link.click();
            URL.revokeObjectURL(url);
          };

          return (
            <>
            <div className="analytics-container">
              <div className="mb-16 flex items-center" style={{ gap: '10px', flexWrap: 'wrap' }}>
                {/* Standardized to TableFilter — the same filter button
                    used by Fleet Roadworthiness and Compliance Defects —
                    instead of the bespoke AnalyticsFilterMenu. FilterBar
                    below still renders the active selections as removable
                    chips, which the single-group tables don't need but
                    this one benefits from given five filterable
                    dimensions at once. */}
                <TableFilter groups={analyticsFilterGroups} />
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
                {/* Import Carrier Load Files lives on Shipments now (it's
                    load data entry, not an Analytics stat); Fuel Receipts
                    stays on Analytics, where the fuel P&L figure and its
                    "awaiting review" status pill already live. */}
                {activeTab === 'shipments' && (
                  <button
                    type="button"
                    onClick={() => setIsImportModalOpen(true)}
                    className="flex items-center text-xs font-bold"
                    style={{ gap: '6px', padding: '8px 14px', borderRadius: '8px', border: 'none', background: 'var(--brand-red)', color: '#fff', cursor: 'pointer' }}
                  >
                    <UploadCloud size={14} />
                    Import Carrier Load Files
                  </button>
                )}
                {activeTab === 'analytics' && (
                  <button
                    type="button"
                    onClick={() => setIsFuelReceiptsModalOpen(true)}
                    className="flex items-center text-xs font-semibold"
                    style={{ gap: '8px', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--charcoal)', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
                  >
                    <Receipt size={14} />
                    Fuel Receipts
                    {fuelReceipts.length > 0 && (
                      <span
                        className="font-mono tabular-nums"
                        style={{
                          fontSize: '10px', fontWeight: 800, minWidth: '17px', height: '17px', padding: '0 4px',
                          borderRadius: '999px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          background: fuelReceipts.some(r => r.status === 'pending') ? '#FEF3C7' : 'var(--card-bg-hover)',
                          color: fuelReceipts.some(r => r.status === 'pending') ? '#92400E' : 'var(--charcoal-light)',
                        }}
                      >
                        {fuelReceipts.length}
                      </span>
                    )}
                  </button>
                )}
              </div>
            </div>

            {activeTab === 'analytics' && (
            <>
            {/* ============================================================
                ZONE 1 — STATUS. The 3-second answer: is the business
                healthy right now, and does anything need a decision
                today. Net Profit + Margin get real visual weight as the
                hero instead of reading as one of six equal tiles;
                Revenue/Payroll/Fuel/Live drop to a smaller supporting
                row. The "needs attention" line surfaces the same kind of
                thing Compensation Summary's own Flags & Reviews bell
                tracks (pending fuel receipts, flagged long shifts, a
                genuine loss-making shift) so this tab actually answers
                "is anything wrong" instead of requiring you to already
                know to check a different tab.
               ============================================================ */}
            <div className="analytics-container">
              <p className="text-xs font-bold text-muted uppercase" style={{ letterSpacing: '0.16em', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '16px', height: '2px', background: 'var(--brand-red)', display: 'inline-block' }} />
                Overview
              </p>
              <RevealOnMount index={0} className="analytics-chart-card">
                <div className="flex items-center justify-between mb-16" style={{ flexWrap: 'wrap', gap: '8px' }}>
                  <span className="text-xs font-medium text-muted">Filtered period: {periodFilter ? periodFilter.value[0] : 'All time'}</span>
                </div>

                <div className="flex items-end" style={{ gap: '32px', flexWrap: 'wrap', borderBottom: '1px solid var(--border-color)', paddingBottom: '20px', marginBottom: '16px' }}>
                  <div>
                    <p className="text-xs font-bold text-muted uppercase" style={{ letterSpacing: '0.08em', marginBottom: '4px' }}>Net fleet profit</p>
                    <p className="font-mono font-bold" style={{ fontSize: '38px', margin: 0, lineHeight: 1, color: grossProfit >= 0 ? '#10B981' : '#DC2626' }}>
                      £{grossProfit.toLocaleString('en-GB', { maximumFractionDigits: 0 })}
                    </p>
                    <div className="flex items-center" style={{ gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                      <span
                        className="font-mono font-bold"
                        style={{
                          fontSize: '12px', padding: '3px 9px', borderRadius: '999px',
                          background: marginBenchmarkLabel === 'Healthy' ? '#D1FAE5' : marginBenchmarkLabel === 'Caution' ? '#FEF3C7' : marginBenchmarkLabel ? '#FEE2E2' : 'var(--card-bg-hover)',
                          color: marginBenchmarkLabel === 'Healthy' ? '#065F46' : marginBenchmarkLabel === 'Caution' ? '#92400E' : marginBenchmarkLabel ? '#991B1B' : 'var(--charcoal-light)',
                        }}
                      >
                        {grossMarginPct === null ? '—' : `${grossMarginPct.toFixed(1)}%`} margin
                      </span>
                      {kpiDeltas.profit && <BadgeDelta label={kpiDeltas.profit.label} direction={kpiDeltas.profit.direction} tone={kpiDeltaTone(kpiDeltas.profit.direction, 'profit')} />}
                      <span className="text-xs text-muted">Target &gt;{TARGET_MARGIN_PCT}%{marginBenchmarkLabel ? ` [${marginBenchmarkLabel}]` : ''}</span>
                    </div>
                  </div>

                  <div className="flex" style={{ gap: '24px', flexWrap: 'wrap' }}>
                    <div>
                      <p className="text-xs font-bold text-muted uppercase" style={{ letterSpacing: '0.08em', marginBottom: '4px' }}>Revenue</p>
                      <p className="font-mono font-bold" style={{ fontSize: '17px', margin: 0, color: 'var(--charcoal)' }}>£{totalRevenue.toLocaleString('en-GB', { maximumFractionDigits: 0 })}</p>
                      {/* No schema field distinguishes a CSV-confirmed rate from a
                          manually-entered spot rate — both write the same
                          shift_revenue.revenue_amount — so this sub-label is the
                          honest equivalent: how much of the period's revenue
                          figure is actually settled vs. still unrated. */}
                      <p className="text-xs text-muted" style={{ marginTop: '2px' }}>{shiftsWithRevenue.length} of {completedShiftsForAnalytics.length} rated</p>
                      {kpiDeltas.revenue && <div style={{ marginTop: '4px' }}><BadgeDelta label={kpiDeltas.revenue.label} direction={kpiDeltas.revenue.direction} tone={kpiDeltaTone(kpiDeltas.revenue.direction, 'revenue')} /></div>}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-muted uppercase" style={{ letterSpacing: '0.08em', marginBottom: '4px' }}>Payroll</p>
                      <p className="font-mono font-bold" style={{ fontSize: '17px', margin: 0, color: '#CC0000' }}>£{totalDriverCost.toLocaleString('en-GB', { maximumFractionDigits: 0 })}</p>
                      <p className="text-xs text-muted" style={{ marginTop: '2px' }}>{formatHoursMinutes(totalHours)} logged</p>
                      {kpiDeltas.cost && <div style={{ marginTop: '4px' }}><BadgeDelta label={kpiDeltas.cost.label} direction={kpiDeltas.cost.direction} tone={kpiDeltaTone(kpiDeltas.cost.direction, 'cost')} /></div>}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-muted uppercase" style={{ letterSpacing: '0.08em', marginBottom: '4px' }}>Fuel &amp; AdBlue</p>
                      <p className="font-mono font-bold" style={{ fontSize: '17px', margin: 0, color: '#B45309' }}>£{totalFuelCost.toLocaleString('en-GB', { maximumFractionDigits: 0 })}</p>
                      <p className="text-xs text-muted" style={{ marginTop: '2px' }}>{totalFuelLiters.toFixed(0)} litres</p>
                      {kpiDeltas.fuel && <div style={{ marginTop: '4px' }}><BadgeDelta label={kpiDeltas.fuel.label} direction={kpiDeltas.fuel.direction} tone={kpiDeltaTone(kpiDeltas.fuel.direction, 'fuel')} /></div>}
                    </div>
                    {activeShiftsForAnalytics.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-muted uppercase" style={{ letterSpacing: '0.08em', marginBottom: '4px' }}>
                          <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#10B981', marginRight: '5px' }} />
                          On shift now
                        </p>
                        <p className="font-mono font-bold" style={{ fontSize: '17px', margin: 0, color: 'var(--charcoal)' }}>£{liveActiveWages.toLocaleString('en-GB', { maximumFractionDigits: 2 })}</p>
                        <p className="text-xs text-muted" style={{ marginTop: '2px' }}>{activeShiftsForAnalytics.length} live — not yet in profit</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center" style={{ gap: '8px', flexWrap: 'wrap' }}>
                  {pendingFuelReceiptsCount === 0 && flaggedShiftsCount === 0 && !worstLossShift ? (
                    <span className="flex items-center text-xs font-semibold" style={{ gap: '6px', color: '#065F46' }}>
                      <CheckCircle2 size={14} />
                      Nothing needs attention for this period.
                    </span>
                  ) : (
                    <>
                      {pendingFuelReceiptsCount > 0 && (
                        <button type="button" onClick={() => setIsFuelReceiptsModalOpen(true)} className="text-xs font-bold" style={{ padding: '4px 10px', borderRadius: '999px', border: 'none', cursor: 'pointer', background: '#FEF3C7', color: '#92400E' }}>
                          {pendingFuelReceiptsCount} fuel receipt{pendingFuelReceiptsCount === 1 ? '' : 's'} awaiting review
                        </button>
                      )}
                      {flaggedShiftsCount > 0 && (
                        <span className="text-xs font-bold" style={{ padding: '4px 10px', borderRadius: '999px', background: '#FEE2E2', color: '#991B1B' }}>
                          {flaggedShiftsCount} shift{flaggedShiftsCount === 1 ? '' : 's'} over {orgAlertSettings.longShiftFlagHours}h
                        </span>
                      )}
                      {worstLossShift && (
                        <span className="text-xs font-bold" style={{ padding: '4px 10px', borderRadius: '999px', background: '#FEE2E2', color: '#991B1B' }}>
                          Loss-making shift — {toTitleCase(worstLossShift.name)} (£{worstLossShift.margin.toFixed(0)})
                        </span>
                      )}
                    </>
                  )}
                </div>
              </RevealOnMount>
            </div>

            {/* ============================================================
                ZONE 2 — TREND. One chart at a time: Margin (is it going
                up or down) is the default view; Revenue & Cost is a
                second tab for the breakdown — instead of forcing
                revenue, wages, fuel, and a target line into a single
                chart every time.
               ============================================================ */}
            <div className="analytics-container">
              <p className="text-xs font-bold text-muted uppercase" style={{ letterSpacing: '0.16em', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '16px', height: '2px', background: 'var(--brand-red)', display: 'inline-block' }} />
                Trend
              </p>
              <RevealOnMount index={1} className="analytics-chart-card">
                <div className="flex items-center justify-between mb-16" style={{ flexWrap: 'wrap', gap: '8px' }}>
                  <TextRevealHeader text={analyticsTrendTab === 'margin' ? 'MARGIN TREND' : 'REVENUE VS COST'} className="text-xs font-bold text-muted uppercase" style={{ letterSpacing: '0.12em' }} />
                  <div className="flex" style={{ gap: '4px', background: 'var(--card-bg-hover)', borderRadius: '8px', padding: '3px' }}>
                    {(['margin', 'revenue'] as const).map(tab => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setAnalyticsTrendTab(tab)}
                        className="text-xs font-bold"
                        style={{
                          padding: '5px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                          background: analyticsTrendTab === tab ? 'var(--card-bg)' : 'transparent',
                          color: analyticsTrendTab === tab ? 'var(--charcoal)' : 'var(--charcoal-light)',
                          boxShadow: analyticsTrendTab === tab ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                        }}
                      >
                        {tab === 'margin' ? 'Margin' : 'Revenue & cost'}
                      </button>
                    ))}
                  </div>
                </div>

                {analyticsTrendTab === 'margin' ? (
                  <MarginTrendChart data={dailySeries.map(d => ({ label: d.label, margin: d.margin }))} targetPct={TARGET_MARGIN_PCT} lineColor="#0F172A" />
                ) : (
                  <>
                    <div className="flex items-center" style={{ gap: '18px', marginBottom: '14px', flexWrap: 'wrap' }}>
                      <span className="flex items-center text-xs font-bold text-muted" style={{ gap: '6px' }}>
                        <span style={{ width: '9px', height: '9px', borderRadius: '2px', background: '#0F172A', display: 'inline-block' }} />
                        Billed Revenue
                      </span>
                      <span className="flex items-center text-xs font-bold text-muted" style={{ gap: '6px' }}>
                        <span style={{ width: '9px', height: '9px', borderRadius: '2px', background: '#CC0000', display: 'inline-block' }} />
                        Driver Wages
                      </span>
                      <span className="flex items-center text-xs font-bold text-muted" style={{ gap: '6px' }}>
                        <span style={{ width: '9px', height: '9px', borderRadius: '2px', background: '#F59E0B', display: 'inline-block' }} />
                        Actual Fuel
                      </span>
                      <span className="flex items-center text-xs font-bold text-muted" style={{ gap: '6px' }}>
                        <span style={{ width: '12px', height: '0', borderTop: '1.5px dashed #64748B', display: 'inline-block' }} />
                        {TARGET_MARGIN_PCT}% Target Margin
                      </span>
                    </div>
                    <AnalyticsGroupedBarChart
                      data={dailySeries.map(d => ({ label: d.label, revenue: d.revenue, cost: d.cost, fuel: d.fuel, targetCostLine: d.targetCostLine }))}
                      revenueColor="#0F172A"
                      costColor="#CC0000"
                      fuelColor="#F59E0B"
                      targetLineLabel={`${TARGET_MARGIN_PCT}% Target Margin`}
                    />
                  </>
                )}
              </RevealOnMount>
            </div>

            {/* ============================================================
                ZONE 3 — PERFORMANCE BREAKDOWN. Who and what: driver
                profitability (removed in an earlier pass, with nothing
                put back in its place — see the old comment this
                replaced), £/mile unit economics (unchanged), and fuel
                efficiency. The comparison zone — where a reader actually
                reasons about cause and effect instead of reading a
                total.
               ============================================================ */}
            <div className="analytics-container">
              <p className="text-xs font-bold text-muted uppercase" style={{ letterSpacing: '0.16em', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '16px', height: '2px', background: 'var(--brand-red)', display: 'inline-block' }} />
                Performance breakdown
              </p>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-16" style={{ alignItems: 'stretch' }}>
              <div className="lg:col-span-5" style={{ height: '100%' }}>
                <RevealOnMount index={2} className="analytics-chart-card" style={{ height: '100%', minHeight: '340px' }}>
                  <span className="flex items-center" style={{ gap: '8px', marginBottom: '4px' }}>
                    <Users size={14} color="var(--charcoal-light)" />
                    <TextRevealHeader text="DRIVER PROFITABILITY" className="text-xs font-bold text-muted uppercase" style={{ letterSpacing: '0.12em' }} />
                  </span>
                  <p className="text-xs font-medium text-muted mb-16">Gross margin contributed, rated shifts this period.</p>

                  {driverLeaderboard.length === 0 ? (
                    <p className="text-xs text-muted" style={{ padding: '8px 0' }}>No rated shifts yet for this period.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      {leaderboardTop.map(d => (
                        <div key={d.name} className="flex items-center" style={{ gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--border-color)' }}>
                          <span className="text-xs font-semibold" style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{toTitleCase(d.name)}</span>
                          <span className="font-mono font-bold text-xs" style={{ color: d.margin >= 0 ? '#065F46' : '#991B1B', flexShrink: 0 }}>
                            {d.margin >= 0 ? '+' : ''}£{d.margin.toFixed(0)}
                          </span>
                          <div style={{ width: '60px', height: '6px', borderRadius: '3px', background: d.margin >= 0 ? '#D1FAE5' : '#FEE2E2', flexShrink: 0 }}>
                            <div style={{ width: `${Math.min(100, (Math.abs(d.margin) / leaderboardMaxAbs) * 100)}%`, height: '100%', borderRadius: '3px', background: d.margin >= 0 ? '#10B981' : '#DC2626' }} />
                          </div>
                        </div>
                      ))}
                      {leaderboardBottom.length > 0 && (
                        <>
                          <p className="text-xs font-bold text-muted uppercase" style={{ letterSpacing: '0.06em', margin: '10px 0 2px' }}>Needs a look</p>
                          {leaderboardBottom.map(d => (
                            <div key={d.name} className="flex items-center" style={{ gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--border-color)' }}>
                              <span className="text-xs font-semibold" style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{toTitleCase(d.name)}</span>
                              <span className="font-mono font-bold text-xs" style={{ color: d.margin >= 0 ? '#065F46' : '#991B1B', flexShrink: 0 }}>
                                {d.margin >= 0 ? '+' : ''}£{d.margin.toFixed(0)}
                              </span>
                              <div style={{ width: '60px', height: '6px', borderRadius: '3px', background: d.margin >= 0 ? '#D1FAE5' : '#FEE2E2', flexShrink: 0 }}>
                                <div style={{ width: `${Math.min(100, (Math.abs(d.margin) / leaderboardMaxAbs) * 100)}%`, height: '100%', borderRadius: '3px', background: d.margin >= 0 ? '#10B981' : '#DC2626' }} />
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </RevealOnMount>
              </div>

              <div className="lg:col-span-4" style={{ height: '100%' }}>
                <RevealOnMount index={3} className="analytics-chart-card" style={{ height: '100%', minHeight: '340px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <span className="flex items-center" style={{ gap: '8px', marginBottom: '4px' }}>
                      <Gauge size={14} color="var(--charcoal-light)" />
                      <TextRevealHeader text="FLEET UNIT ECONOMICS" className="text-xs font-bold text-muted uppercase" style={{ letterSpacing: '0.12em' }} />
                    </span>
                    <p className="text-xs font-medium text-muted mb-16">Per-mile yield, from logged GPS mileage.</p>

                    {validMiles > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-muted uppercase" style={{ letterSpacing: '0.06em' }}>Avg Rate / Mile</span>
                          <span className="font-mono font-bold tabular-nums" style={{ fontSize: '15px', color: 'var(--charcoal)' }}>£{(ratePerMile ?? 0).toFixed(2)} / mi</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-muted uppercase" style={{ letterSpacing: '0.06em' }}>Operating Cost / Mile</span>
                          <span className="font-mono font-bold tabular-nums" style={{ fontSize: '15px', color: '#CC0000' }}>£{(costPerMile ?? 0).toFixed(2)} / mi</span>
                        </div>
                        <div className="flex items-center justify-between" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                          <span className="text-xs font-bold text-muted uppercase" style={{ letterSpacing: '0.06em' }}>Net Yield / Mile</span>
                          <span className="font-mono font-bold tabular-nums" style={{ fontSize: '16px', color: (yieldPerMile ?? 0) >= 0 ? '#10B981' : '#DC2626' }}>
                            {(yieldPerMile ?? 0) >= 0 ? '+' : ''}£{(yieldPerMile ?? 0).toFixed(2)} / mi
                          </span>
                        </div>
                        {usingFleetWideMiles && (
                          <p className="text-xs text-muted" style={{ margin: 0 }}>(fleet-wide — no rated shift has logged GPS mileage yet)</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted" style={{ padding: '8px 0' }}>Pending GPS sync — no mileage logged for this period yet.</p>
                    )}
                  </div>
                </RevealOnMount>
              </div>

              <div className="lg:col-span-3" style={{ height: '100%' }}>
                <RevealOnMount index={4} className="analytics-chart-card" style={{ height: '100%', minHeight: '340px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <span className="flex items-center" style={{ gap: '8px', marginBottom: '4px' }}>
                      <Fuel size={14} color="var(--charcoal-light)" />
                      <TextRevealHeader text="FUEL EFFICIENCY" className="text-xs font-bold text-muted uppercase" style={{ letterSpacing: '0.12em' }} />
                    </span>
                    <p className="text-xs font-medium text-muted mb-16">Approved litres against logged GPS miles.</p>
                    {milesPerLitre !== null ? (
                      <>
                        <p className="font-mono font-bold" style={{ fontSize: '26px', margin: 0, color: 'var(--charcoal)' }}>
                          {milesPerLitre.toFixed(2)}<span className="text-sm text-muted" style={{ fontWeight: 600 }}> mi/L</span>
                        </p>
                        <p className="text-xs text-muted" style={{ marginTop: '4px' }}>{totalFuelLiters.toFixed(0)}L over {validMiles.toFixed(0)} mi</p>
                      </>
                    ) : (
                      <p className="text-xs text-muted" style={{ padding: '8px 0' }}>Pending fuel or GPS data for this period.</p>
                    )}
                  </div>

                  <div style={{ marginTop: '20px' }}>
                    <p className="text-xs font-bold text-muted uppercase" style={{ letterSpacing: '0.06em', marginBottom: '8px' }}>Operating Cost Split</p>
                    {opCostTotal > 0 ? (
                      <>
                        <div className="flex" style={{ height: '10px', borderRadius: '999px', overflow: 'hidden', background: 'var(--card-bg-hover)' }}>
                          <div style={{ width: `${wagesSharePct}%`, background: '#1E293B' }} />
                          <div style={{ width: `${fuelSharePct}%`, background: '#F59E0B' }} />
                        </div>
                        <div className="flex items-center justify-between" style={{ marginTop: '6px' }}>
                          <span className="text-xs font-medium text-muted">Wages ({wagesSharePct.toFixed(0)}%)</span>
                          <span className="text-xs font-medium text-muted">Fuel ({fuelSharePct.toFixed(0)}%)</span>
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-muted">No operating cost recorded yet for this period.</p>
                    )}
                  </div>
                </RevealOnMount>
              </div>
            </div>
            </div>
            </>
            )}

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
                        <span className="badge badge-accent" style={{ fontSize: '10px' }}>OCR Scanned</span>
                        {pendingCount > 0 && <span className="badge badge-warning font-mono">{pendingCount} awaiting review</span>}
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
                      <div className="telemetry-search-wrap" style={{ minWidth: '200px' }}>
                        <Search size={14} />
                        <input
                          type="text"
                          placeholder="Search driver name…"
                          value={fuelModalDriverSearch}
                          onChange={(e) => setFuelModalDriverSearch(e.target.value)}
                        />
                      </div>
                      <select
                        className="select-field"
                        style={{ width: 'auto' }}
                        value={fuelModalVehicleFilter}
                        onChange={(e) => setFuelModalVehicleFilter(e.target.value)}
                      >
                        <option value="">All Vehicles</option>
                        {vehicleOptions.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                      <span className="flex items-center" style={{ gap: '6px' }}>
                        <Calendar size={13} className="text-muted" />
                        <input type="date" className="input-field" style={{ width: 'auto' }} value={fuelModalDateStart} onChange={(e) => setFuelModalDateStart(e.target.value)} />
                        <span className="text-xs text-muted">to</span>
                        <input type="date" className="input-field" style={{ width: 'auto' }} value={fuelModalDateEnd} onChange={(e) => setFuelModalDateEnd(e.target.value)} />
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
                      <Empty className="py-24">
                        <EmptyHeader>
                          <EmptyMedia variant="icon"><Fuel /></EmptyMedia>
                          <EmptyTitle>No Fuel Receipts Yet</EmptyTitle>
                          <EmptyDescription>Fuel receipts drivers photograph from the app will show up here for approval.</EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    ) : filteredReceipts.length === 0 ? (
                      <Empty className="py-24">
                        <EmptyHeader>
                          <EmptyMedia variant="icon"><Search /></EmptyMedia>
                          <EmptyTitle>No Matches</EmptyTitle>
                          <EmptyDescription>No receipts match the current search/filters.</EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    ) : (
                      <div className="table-container">
                        <table className="data-table data-table--nowrap">
                          <thead>
                            <tr>
                              <th>Receipt Photo</th>
                              <th>Driver Name</th>
                              <th>Vehicle Reg</th>
                              <th>Date &amp; Time</th>
                              <th>Volume (L)</th>
                              <th>Total Cost (£)</th>
                              <th>Station / Vendor</th>
                              <th>Status</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredReceipts.map(r => {
                              const thumbUrl = fuelReceiptThumbUrls[r.receipt_photo_path];
                              return (
                                <tr key={r.id}>
                                  <td>
                                    <button
                                      type="button"
                                      onClick={() => openFuelReceiptLightbox(r.receipt_photo_path)}
                                      style={{ position: 'relative', width: '40px', height: '40px', border: 'none', padding: 0, cursor: 'zoom-in', borderRadius: '6px', overflow: 'hidden', background: 'var(--card-bg-hover)' }}
                                      title="View receipt photo"
                                    >
                                      {thumbUrl ? (
                                        <img src={thumbUrl} alt="Fuel receipt" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                      ) : (
                                        <Fuel size={14} color="var(--charcoal-light)" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
                                      )}
                                    </button>
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
                                  <td className="font-mono tabular-nums font-semibold text-xs">{r.liters === null ? '—' : r.liters.toFixed(1)}</td>
                                  <td className="font-mono tabular-nums font-semibold">{r.total_cost === null ? '—' : `£${r.total_cost.toFixed(2)}`}</td>
                                  <td className="text-xs">{r.vendor ?? '—'}</td>
                                  <td>
                                    <span className={`badge ${r.status === 'approved' ? 'badge-success' : r.status === 'rejected' ? 'badge-danger' : 'badge-warning'}`}>
                                      {r.status === 'approved' ? 'Approved' : r.status === 'rejected' ? 'Rejected' : 'Pending'}
                                    </span>
                                  </td>
                                  <td className="whitespace-nowrap">
                                    {r.status === 'pending' && (
                                      <div className="flex items-center" style={{ gap: '6px' }}>
                                        <button
                                          type="button"
                                          disabled={reviewingFuelReceiptId === r.id}
                                          onClick={() => handleReviewFuelReceipt(r.id, 'approved')}
                                          title="Approve"
                                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#10B981' }}
                                        >
                                          <CircleCheck size={18} />
                                        </button>
                                        <button
                                          type="button"
                                          disabled={reviewingFuelReceiptId === r.id}
                                          onClick={() => handleReviewFuelReceipt(r.id, 'rejected')}
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

            <ImageLightbox url={fuelReceiptLightboxUrl} onClose={() => setFuelReceiptLightboxUrl(null)} alt="Fuel receipt, full size" />

            {activeTab === 'shipments' && (
            <>
            {/* Shipments — load import, revenue rating, and the itemized
                shift ledger. Moved out of Analytics entirely (was "Zone 4"
                there) so Analytics stays pure stats/trends and this stays
                the operational load-tracking workspace — sharing the same
                closure (and so the same shiftGrossMargin/mileageByShift/
                CSV-export helpers, revenue-edit state, etc.) as Analytics
                since both read the same underlying shift data, just
                presenting different slices of it. */}
            <div className="mt-16" style={{ maxWidth: '1600px', width: '100%' }}>
              <RevealOnMount index={1} className="analytics-chart-card">
                <div className="flex items-center justify-between mb-16" style={{ flexWrap: 'wrap', gap: '8px' }}>
                  <p className="text-xs font-bold text-muted uppercase" style={{ letterSpacing: '0.12em', margin: 0 }}>Reconciled Shift &amp; Load Yield</p>
                  <button
                    type="button"
                    onClick={() => { exportLedgerCsv(); flashExported('ledger'); }}
                    disabled={loadRevenueRowsAll.length === 0}
                    className="flex items-center text-xs font-bold"
                    style={{ gap: '6px', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--charcoal)', cursor: loadRevenueRowsAll.length === 0 ? 'default' : 'pointer', opacity: loadRevenueRowsAll.length === 0 ? 0.5 : 1 }}
                  >
                    <DownloadIcon done={justExported === 'ledger'} />
                    Export Payroll CSV
                  </button>
                </div>

                {revenueSaveError && <div className="login-notice login-notice--error mb-16">{revenueSaveError}</div>}

                {loadRevenueRows.length === 0 ? (
                  <Empty className="py-24">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <PoundSterling />
                      </EmptyMedia>
                      <EmptyTitle>No Completed Shifts Yet</EmptyTitle>
                      <EmptyDescription>
                        Completed shifts in this period will show up here once they exist.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <div className="table-container">
                    <table className="data-table data-table--lg">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Driver</th>
                          <th>Assigned Vehicle</th>
                          <th>Customer &amp; Load Ref</th>
                          <th>Duration &amp; GPS Distance</th>
                          <th>Driver Wage</th>
                          <th>Fuel Incurred</th>
                          <th>Billed Revenue</th>
                          <th>
                            <button
                              type="button"
                              onClick={() => setLedgerSort(prev => (prev === 'margin' ? 'date' : 'margin'))}
                              className="flex items-center"
                              style={{ gap: '4px', background: 'none', border: 'none', padding: 0, font: 'inherit', color: ledgerSort === 'margin' ? 'var(--brand-red)' : 'inherit', cursor: 'pointer' }}
                              title={ledgerSort === 'margin' ? 'Sorted lowest margin first — click to sort by date' : 'Click to sort lowest margin first'}
                            >
                              Gross Margin %
                              {ledgerSort === 'margin' ? <ChevronUp size={12} /> : <ChevronsUpDown size={12} style={{ opacity: 0.5 }} />}
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {loadRevenueRows.map(s => {
                          const edit = revenueEdits[s.id];
                          const revenueValue = edit ? edit.revenue : (s.revenue_amount === null || s.revenue_amount === undefined ? '' : String(s.revenue_amount));
                          const isPending = s.revenue_amount === null || s.revenue_amount === undefined;
                          const shiftMargin = shiftGrossMargin(s);
                          const marginPct = shiftMargin === null || !s.revenue_amount ? null : (shiftMargin / s.revenue_amount) * 100;
                          const marginTier: 'green' | 'amber' | 'red' | null = marginPct === null ? null : marginPct >= 35 ? 'green' : marginPct >= 20 ? 'amber' : 'red';
                          const marginBadgeClass = marginTier === 'green' ? 'badge-success' : marginTier === 'amber' ? 'badge-warning' : marginTier === 'red' ? 'badge-danger' : 'badge-accent';
                          const driverDisplayName = toTitleCase(s.driver_name ?? '');
                          const initials = driverDisplayName.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
                          const miles = mileageByShift[s.id];

                          const setRevenueField = (value: string) => {
                            setRevenueEdits(prev => ({
                              ...prev,
                              [s.id]: {
                                revenue: value,
                                loadRef: prev[s.id]?.loadRef ?? (s.load_reference ?? ''),
                                carrier: prev[s.id]?.carrier ?? (s.carrier_name ?? ''),
                              },
                            }));
                          };

                          return (
                            <tr key={s.id}>
                              <td className="whitespace-nowrap">{new Date(s.start_time).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                              <td>
                                <div className="flex items-center" style={{ gap: '8px' }}>
                                  <span
                                    className="flex items-center justify-center font-bold"
                                    style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'var(--charcoal)', color: '#fff', fontSize: '10px', flexShrink: 0 }}
                                  >
                                    {initials}
                                  </span>
                                  {driverDisplayName || '—'}
                                </div>
                              </td>
                              <td>
                                {vehicleAssignShiftId === s.id ? (
                                  <select
                                    className="select-field"
                                    style={{ fontSize: '12px', padding: '4px 8px' }}
                                    autoFocus
                                    value={s.vehicle_id ?? ''}
                                    onChange={(e) => { handleAssignVehicle(s.id, e.target.value || null); setVehicleAssignShiftId(null); }}
                                    onBlur={() => setVehicleAssignShiftId(null)}
                                  >
                                    <option value="">Unassigned</option>
                                    {fleetVehicles.map(v => (
                                      <option key={v.id} value={v.id}>{v.vehicle_number}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setVehicleAssignShiftId(s.id)}
                                    className="font-mono font-bold uppercase text-xs"
                                    style={{ background: 'var(--card-bg-hover)', border: 'none', cursor: 'pointer', padding: '3px 8px', borderRadius: '4px', letterSpacing: '0.02em', color: s.vehicle_number ? 'var(--charcoal)' : 'var(--charcoal-light)' }}
                                    title="Click to assign a vehicle"
                                  >
                                    {s.vehicle_number ?? '— assign —'}
                                  </button>
                                )}
                              </td>
                              <td>
                                {s.carrier_name && (
                                  <span className="badge badge-accent" style={{ marginBottom: '3px', display: 'inline-flex' }}>{s.carrier_name}</span>
                                )}
                                <div className="font-mono text-xs text-muted whitespace-nowrap">{s.load_reference ? `#${s.load_reference.replace(/^#/, '')}` : '—'}</div>
                              </td>
                              <td className="font-mono tabular-nums text-xs text-muted whitespace-nowrap">
                                {miles === undefined ? '— mi' : `${miles.toFixed(0)} mi`} • {formatHoursMinutes(s.total_hours ?? 0)}
                              </td>
                              <td className="font-mono tabular-nums text-sm text-muted whitespace-nowrap">£{(s.total_pay ?? 0).toFixed(2)}</td>
                              <td className="font-mono tabular-nums text-sm text-muted whitespace-nowrap">
                                {approvedFuelCostByShift[s.id] === undefined ? '—' : `£${approvedFuelCostByShift[s.id].toFixed(2)}`}
                              </td>
                              <td className="whitespace-nowrap">
                                <Popover open={revenuePopoverShiftId === s.id} onOpenChange={(open) => setRevenuePopoverShiftId(open ? s.id : null)}>
                                  <PopoverTrigger asChild>
                                    {isPending ? (
                                      <button
                                        type="button"
                                        className="font-mono font-medium text-xs"
                                        style={{ border: '1px solid #FDE68A', background: '#FFFBEB', color: '#92400E', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: '1px', lineHeight: 1.3 }}
                                      >
                                        <span className="flex items-center" style={{ gap: '4px' }}>+ Spot Rate</span>
                                        <span className="font-mono" style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 500 }}>Awaiting CSV</span>
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        className="flex items-center"
                                        style={{ gap: '6px', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                                        title="Click to adjust this rate"
                                      >
                                        <span className="font-mono font-bold tabular-nums" style={{ color: '#10B981', fontSize: '14px' }}>£{(s.revenue_amount as number).toFixed(2)}</span>
                                        <span className="text-xs font-bold" style={{ color: '#10B981' }}>Rated</span>
                                        <Pencil size={11} color="var(--charcoal-light)" />
                                      </button>
                                    )}
                                  </PopoverTrigger>
                                  <PopoverContent className="w-[290px] p-3" align="start">
                                    <p className="text-xs font-bold text-muted uppercase" style={{ letterSpacing: '0.06em', marginBottom: '8px' }}>Billed Amount (£)</p>
                                    <div className="flex items-center gap-4" style={{ marginBottom: '10px' }}>
                                      <span className="text-sm text-muted">£</span>
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        className="input-field font-mono tabular-nums"
                                        style={{ padding: '8px 10px', fontSize: '14px', fontWeight: 700, width: '100%' }}
                                        placeholder="0.00"
                                        autoFocus
                                        value={revenueValue}
                                        disabled={savingRevenueShiftId === s.id}
                                        onChange={(e) => setRevenueField(e.target.value)}
                                      />
                                    </div>
                                    <div className="flex items-center" style={{ gap: '8px' }}>
                                      <button
                                        type="button"
                                        onClick={async () => { await handleSaveRevenue(s.id); setRevenuePopoverShiftId(null); }}
                                        disabled={savingRevenueShiftId === s.id}
                                        className="font-bold"
                                        style={{ flex: 1, padding: '7px 4px', borderRadius: '6px', border: 'none', background: 'var(--brand-red)', color: '#fff', cursor: 'pointer', fontSize: '11px', lineHeight: 1.25 }}
                                      >
                                        {savingRevenueShiftId === s.id ? 'Saving…' : 'Apply & Recalculate Margin'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setRevenueEdits(prev => {
                                            const next = { ...prev };
                                            delete next[s.id];
                                            return next;
                                          });
                                          setRevenuePopoverShiftId(null);
                                        }}
                                        className="text-xs font-bold"
                                        style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--charcoal)', cursor: 'pointer' }}
                                      >
                                        {isPending ? 'Keep Awaiting CSV' : 'Cancel'}
                                      </button>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              </td>
                              <td className="whitespace-nowrap">
                                <span className={`badge ${marginBadgeClass} font-mono tabular-nums font-bold`}>
                                  {shiftMargin === null || marginPct === null ? '—' : `${shiftMargin >= 0 ? '+' : '−'}£${Math.abs(shiftMargin).toFixed(2)} (${marginPct.toFixed(1)}%)`}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </RevealOnMount>
            </div>
            </>
            )}

            </>
          );
        })()}

        <AnimatePresence>
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
                  ...(userRole === 'payroll_admin' ? [
                    { id: 'access-codes' as const, label: 'Access Codes', icon: KeyRound },
                    { id: 'depots' as const, label: 'Depots', icon: MapPinned },
                    { id: 'alerts' as const, label: 'Alerts', icon: Bell },
                  ] : []),
                  { id: 'appearance' as const, label: 'Appearance', icon: Palette },
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
                      <Empty className="py-24 mb-16">
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <Warehouse />
                          </EmptyMedia>
                          <EmptyTitle>No Depots Yet</EmptyTitle>
                          <EmptyDescription>Add your first one below.</EmptyDescription>
                        </EmptyHeader>
                      </Empty>
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
                                <td>{depot.geofence_radius_m}m</td>
                                <td>
                                  <button
                                    type="button"
                                    className="login-forgot"
                                    style={{ color: 'var(--error-color, #DC2626)' }}
                                    onClick={() => handleDeleteDepot(depot.id, depot.name)}
                                  >
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {depotFormError && <div className="login-notice login-notice--error mb-16">{depotFormError}</div>}

                    <form onSubmit={handleAddDepot}>
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
                      <p className="text-xs text-muted mt-4 mb-16">
                        Tap "Use My Current Location" while standing at the depot, or find coordinates by
                        searching the address on Google Maps and copying the latitude/longitude shown for the pin.
                      </p>
                      <button type="submit" className="btn btn-primary" disabled={isSavingDepot}>
                        {isSavingDepot && <SaveIcon saving success={false} />}
                        {isSavingDepot ? 'Adding…' : 'Add Depot'}
                      </button>
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
                      <label className="input-label" htmlFor="idle-alert-minutes">IDLE ALERT (MINUTES)</label>
                      <input
                        id="idle-alert-minutes"
                        type="number"
                        min="1"
                        step="1"
                        className="input-field"
                        value={alertSettingsForm.idleAlertMinutes}
                        onChange={(e) => setAlertSettingsForm(f => ({ ...f, idleAlertMinutes: e.target.value }))}
                      />
                      <p className="text-xs text-muted mt-4">
                        How long a driver can be stationary on an active shift before an idle alert fires.
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

                    <button type="button" className="btn btn-primary" disabled={isSavingAlertSettings} onClick={handleSaveAlertSettings}>
                      {(isSavingAlertSettings || alertSettingsSuccess) && <SaveIcon saving={isSavingAlertSettings} success={!!alertSettingsSuccess} />}
                      {isSavingAlertSettings ? 'Saving…' : alertSettingsSuccess ? 'Saved' : 'Save Thresholds'}
                    </button>
                  </div>
                )}

                {activeSettingsSection === 'appearance' && (
                  <div>
                    <div className="settings-panel-header">
                      <p>Appearance</p>
                      <p>Choose how the dashboard looks — light, dark, or system.</p>
                    </div>
                    <div className="flex align-center justify-between" style={{ padding: '14px 16px', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
                      <div>
                        <p className="font-bold text-sm text-primary" style={{ margin: '0 0 2px' }}>Theme</p>
                        <p className="text-xs text-muted" style={{ margin: 0 }}>
                          Light, dark, or match your device's setting.
                        </p>
                      </div>
                      <ThemeToggle />
                    </div>
                    <p className="text-xs text-muted mt-8">
                      Same control as the icon beside Settings in the sidebar — either one changes it everywhere.
                    </p>
                  </div>
                )}

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

      {/* ── Billing modal — opened from the sidebar's Billing button, not a
           tab. Each paid plan carries its own Monthly/Annual switch. ────── */}
      {billingModalOpen && userRole === 'payroll_admin' && (
        <div
          className="modal-overlay"
          style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}
          onClick={() => { setBillingModalOpen(false); setCheckoutPlan(null); }}
        >
          <div
            className="modal-content glass-panel"
            style={{ width: '1000px', maxWidth: '100%', maxHeight: '88vh', display: 'flex', flexDirection: 'column', borderRadius: '18px', backgroundColor: 'var(--card-bg)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)', border: '1px solid var(--border-color)', overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #E5E7EB' }}>
              <div>
                <span className="font-black text-primary" style={{ fontSize: '16px' }}>Billing</span>
                <p className="text-xs text-muted" style={{ margin: '4px 0 0' }}>
                  {teamOrgInfo
                    ? <>{teamOrgInfo.name} is currently on the <b>{PLAN_LABELS[teamOrgInfo.plan]}</b> plan.</>
                    : 'Loading your current plan…'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setBillingModalOpen(false); setCheckoutPlan(null); }}
                aria-label="Close"
                style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--charcoal-light)', display: 'flex' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '24px', overflowY: 'auto' }}>
              {teamError && <div className="login-notice login-notice--error mb-16">{teamError}</div>}

              {checkoutPlan ? (() => {
                // Payment step — replaces the pricing grid in-place once a
                // paid plan's CTA is clicked. There's no live payment
                // gateway wired into this app yet (see the buyNowPlan
                // comment above), so submitting a valid card here reuses
                // the exact same "we'll be in touch" confirmation Free
                // already used, rather than silently pretending to charge
                // a card that goes nowhere.
                const plan = BILLING_PLANS.find(p => p.id === checkoutPlan)!;
                const units = pricingUnitsByPlan[checkoutPlan];
                const pricePerUnit = billingCycle === 'monthly'
                  ? plan.monthlyPrice!
                  : Math.round((plan.annualPrice! / 12) * 100) / 100;
                const monthlyTotal = Math.round(pricePerUnit * units * 100) / 100;
                return (
                  <div>
                    <button
                      type="button"
                      onClick={() => setCheckoutPlan(null)}
                      className="flex align-center gap-4 text-sm font-bold text-muted"
                      style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0, marginBottom: '20px' }}
                    >
                      <ChevronLeft size={14} /> Back to plans
                    </button>

                    <div className="text-center" style={{ marginBottom: '24px' }}>
                      <h2 className="text-2xl font-black text-primary" style={{ margin: '0 0 6px', letterSpacing: '-0.01em' }}>
                        Upgrade to {plan.label}
                      </h2>
                      <p className="text-sm text-muted" style={{ margin: 0 }}>
                        {units} driver{units === 1 ? '' : 's'} · £{pricePerUnit.toFixed(2)}/driver/mo
                        {billingCycle === 'annual' ? ' (billed annually)' : ''} ·{' '}
                        <b className="text-primary">£{monthlyTotal.toFixed(2)}/mo</b>
                      </p>
                    </div>

                    <CreditCardForm
                      submitLabel={`Pay £${monthlyTotal.toFixed(2)}`}
                      onSubmit={(_state: CardState, validity: CardValidity) => {
                        if (!validity.allValid) return;
                        setBuyNowPlan(checkoutPlan);
                        setCheckoutPlan(null);
                      }}
                    />

                    <p className="text-xs text-muted text-center" style={{ marginTop: '18px', maxWidth: '480px', marginLeft: 'auto', marginRight: 'auto' }}>
                      No card is charged here yet — this confirms {teamOrgInfo?.name ?? 'your company'}'s upgrade request and our team will follow up to complete it.
                    </p>
                  </div>
                );
              })() : (
              <>
              <div className="text-center" style={{ marginBottom: '24px' }}>
                <h2 className="text-2xl font-black text-primary" style={{ margin: '0 0 6px', letterSpacing: '-0.01em' }}>
                  Pricing That Scales With Your Fleet
                </h2>
                <p className="text-sm text-muted" style={{ margin: 0 }}>
                  Drag the slider to see exactly what your team costs today — and what it'll cost as you grow. No hidden per-seat surprises.
                </p>
              </div>

              {/* Single global Annual switch + confetti burst — literal
                  structure of the 21st.dev "Pricing" reference (Codehagen),
                  not the segmented per-card toggle this replaces. The
                  reference's own confetti colours (`hsl(var(--primary))`
                  etc.) never resolve outside a stylesheet context — canvas
                  fillStyle needs a literal colour string — so real Tachyo
                  hex values are used here instead of reproducing that bug. */}
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', marginBottom: '28px' }}>
                <BillingCycleSwitch
                  ref={billingSwitchRef}
                  checked={billingCycle === 'annual'}
                  onCheckedChange={(checked: boolean) => {
                    setBillingCycle(checked ? 'annual' : 'monthly');
                    if (checked && billingSwitchRef.current) {
                      const rect = billingSwitchRef.current.getBoundingClientRect();
                      confetti({
                        particleCount: 50,
                        spread: 60,
                        origin: { x: (rect.left + rect.width / 2) / window.innerWidth, y: (rect.top + rect.height / 2) / window.innerHeight },
                        colors: ['#CC0000', '#FFFFFF', '#1a1a1a'],
                        ticks: 200,
                        gravity: 1.2,
                        decay: 0.94,
                        startVelocity: 30,
                        shapes: ['circle'],
                      });
                    }
                  }}
                />
                <span className="text-sm font-bold text-primary">
                  Annual billing{BILLING_HEADLINE_SAVINGS_PERCENT != null && <> (<span style={{ color: '#CC0000' }}>Save {BILLING_HEADLINE_SAVINGS_PERCENT}%</span>)</>}
                </span>
              </div>

              <div style={{ position: 'relative' }}>
                {/* Soft ambient glow behind the whole row — ties the three
                    cards together visually and gives the row some depth
                    instead of sitting flat on the modal background. */}
                <div
                  aria-hidden
                  style={{
                    position: 'absolute',
                    top: '-40px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '90%',
                    height: '260px',
                    background: 'radial-gradient(ellipse at center, rgba(204,0,0,0.14) 0%, rgba(204,0,0,0.05) 45%, transparent 75%)',
                    filter: 'blur(30px)',
                    pointerEvents: 'none',
                    zIndex: 0,
                  }}
                />
                <div style={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '20px', alignItems: 'stretch', justifyItems: 'center' }}>
                {/* Free — flat-rate and capped, not per-driver, so it keeps
                    the same Card shell but skips the slider entirely rather
                    than forcing it into a mechanic that doesn't apply to it. */}
                {(() => {
                  const freePlan = BILLING_PLANS.find(p => p.id === 'free')!;
                  const isCurrent = teamOrgInfo?.plan === 'free';
                  return (
                    <PricingCard
                      className="flex w-full max-w-[280px] flex-col"
                      style={{
                        ...(isCurrent ? { borderColor: '#CC0000', borderWidth: '2px' } : {}),
                        boxShadow: isCurrent
                          ? '0 12px 28px -8px rgba(204, 0, 0, 0.35), 0 4px 12px rgba(0, 0, 0, 0.12)'
                          : '0 6px 18px -6px rgba(0, 0, 0, 0.14)',
                      }}
                    >
                      <PricingCardHeader className="pb-2 pt-4 px-4">
                        <div className="flex items-center justify-between">
                          <PricingCardTitle className="text-lg">{freePlan.label}</PricingCardTitle>
                          {isCurrent && <PricingBadge variant="default">Current Plan</PricingBadge>}
                        </div>
                        <PricingCardDescription className="text-xs">For small fleets just getting started with dispatch and payroll.</PricingCardDescription>
                      </PricingCardHeader>
                      <PricingCardContent className="flex-1 px-4">
                        <div className="mb-3 text-center">
                          <span className="text-3xl font-bold">£0</span>
                          <span className="text-xs text-muted-foreground">/month</span>
                        </div>
                        <p className="mb-3 text-center text-xs text-muted-foreground">{freePlan.freeNote}</p>
                        <ul className="space-y-2 text-xs">
                          {freePlan.features.map((feature) => (
                            <li key={feature} className="flex items-center gap-2">
                              <Check className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                              <span className="text-muted-foreground">{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </PricingCardContent>
                      <PricingCardFooter className="flex-col items-stretch gap-2 px-4 pb-4">
                        <PricingButton
                          className="w-full"
                          size="default"
                          variant="outline"
                          disabled={isCurrent}
                          onClick={() => setBuyNowPlan('free')}
                        >
                          {isCurrent ? 'Current Plan' : 'Switch to Free'}
                        </PricingButton>
                        {!isCurrent && buyNowPlan === 'free' && (
                          <div className="login-notice login-notice--success text-xs" style={{ margin: 0 }}>
                            Thanks! We'll be in touch to get {teamOrgInfo?.name ?? 'your company'} switched to Free.
                          </div>
                        )}
                      </PricingCardFooter>
                    </PricingCard>
                  );
                })()}

                {/* Standard / Premium — literal InteractivePricingCard from
                    the 21st.dev reference (@lavikatiyar/pricing): a per-driver
                    slider drives the price live, real feature lists, a
                    "Popular"-style badge only for the highlighted plan. */}
                {(['standard', 'premium'] as const).map((planId) => {
                  const plan = BILLING_PLANS.find(p => p.id === planId)!;
                  const isCurrent = teamOrgInfo?.plan === planId;
                  const pricePerUnit = billingCycle === 'monthly'
                    ? plan.monthlyPrice!
                    : Math.round((plan.annualPrice! / 12) * 100) / 100;
                  return (
                    <InteractivePricingCard
                      key={planId}
                      planName={plan.label}
                      planDescription={
                        planId === 'standard'
                          ? 'For fleets ready for live alerts, idle detection, and multi-admin access.'
                          : 'For fleets that need full payroll automation and multi-depot control.'
                      }
                      pricePerUnit={pricePerUnit}
                      unitName="driver"
                      minUnits={1}
                      maxUnits={100}
                      initialUnits={pricingUnitsByPlan[planId]}
                      units={pricingUnitsByPlan[planId]}
                      onUnitsChange={(nextUnits) => setPricingUnitsByPlan((prev) => ({ ...prev, [planId]: nextUnits }))}
                      features={plan.features}
                      currency="£"
                      highlighted={isCurrent || !!plan.badge}
                      badgeLabel={isCurrent ? 'Current Plan' : plan.badge}
                      priceCaption={
                        billingCycle === 'annual'
                          ? `billed annually · £${plan.annualPrice}/driver/year`
                          : undefined
                      }
                      ctaText={isCurrent ? 'Current Plan' : plan.badge ? `Subscribe to ${plan.label}` : `Get Started with ${plan.label}`}
                      ctaDisabled={isCurrent}
                      onCtaClick={() => setCheckoutPlan(planId)}
                      footerNote={
                        !isCurrent && buyNowPlan === planId ? (
                          <div className="login-notice login-notice--success text-xs" style={{ margin: 0 }}>
                            Thanks! We'll be in touch to get {teamOrgInfo?.name ?? 'your company'} switched to {plan.label}.
                          </div>
                        ) : null
                      }
                    />
                  );
                })}
                </div>
              </div>
              </>
              )}
            </div>
          </div>
        </div>
      )}

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
                  style={{ padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn"
                  disabled={isSavingEmployee}
                  style={{ padding: '10px 20px', borderRadius: '8px', backgroundColor: 'var(--brand-red)', borderColor: 'var(--brand-red)', color: 'white', fontWeight: 'bold' }}
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
              <span style={{ display: 'flex', width: '36px', height: '36px', borderRadius: '50%', backgroundColor: confirmDialog.tone === 'danger' ? '#FEE2E2' : '#EFF6FF', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <ShieldAlert size={18} color={confirmDialog.tone === 'danger' ? '#DC2626' : '#2563EB'} />
              </span>
              <h2 className="text-lg font-black text-primary m-0" style={{ margin: 0 }}>Please confirm</h2>
            </div>
            <p className="text-sm text-secondary mb-24" style={{ marginBottom: '24px', lineHeight: 1.5 }}>{confirmDialog.message}</p>
            <div className="flex gap-12 justify-end" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setConfirmDialog(null)}
                style={{ padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold' }}
              >
                CANCEL
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  const action = confirmDialog.onConfirm;
                  setConfirmDialog(null);
                  action();
                }}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  backgroundColor: confirmDialog.tone === 'danger' ? '#DC2626' : '#4F46E5',
                  borderColor: confirmDialog.tone === 'danger' ? '#DC2626' : '#4F46E5',
                  color: 'white',
                }}
              >
                CONFIRM
              </button>
            </div>
          </div>
        </div>
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
                className="btn btn-secondary"
                onClick={() => setEditTimeModal(null)}
                style={{ padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold' }}
              >
                CANCEL
              </button>
              <button
                className="btn btn-primary"
                onClick={performEditShiftTime}
                style={{ padding: '10px 20px', borderRadius: '8px', backgroundColor: '#4F46E5', borderColor: '#4F46E5', color: 'white', fontWeight: 'bold' }}
              >
                SAVE CHANGES
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
                  className="btn btn-secondary"
                  onClick={() => performManualClockIn(depotSelectModal.driverId, depot)}
                  style={{ padding: '12px 16px', borderRadius: '8px', textAlign: 'left', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px' }}
                >
                  <MapPinned size={15} />
                  {depot.name}
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                className="btn btn-secondary"
                onClick={() => setDepotSelectModal(null)}
                style={{ padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold' }}
              >
                CANCEL
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
            backgroundColor: toast.tone === 'error' ? '#FEF2F2' : toast.tone === 'success' ? '#F0FDF4' : '#F0F9FF',
            border: `1px solid ${toast.tone === 'error' ? '#FECACA' : toast.tone === 'success' ? '#BBF7D0' : '#BAE6FD'}`,
            boxShadow: '0 10px 30px -8px rgba(0, 0, 0, 0.25)',
          }}
        >
          {toast.tone === 'error' ? (
            <ShieldAlert size={18} color="#DC2626" style={{ flexShrink: 0, marginTop: '1px' }} />
          ) : toast.tone === 'success' ? (
            <Check size={18} color="#16A34A" style={{ flexShrink: 0, marginTop: '1px' }} />
          ) : (
            <Bell size={18} color="#0284C7" style={{ flexShrink: 0, marginTop: '1px' }} />
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
