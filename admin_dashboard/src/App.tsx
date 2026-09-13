import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@maplibre/maplibre-gl-leaflet';
import { FlowButton } from './components/ui/flow-button';
import { Sidebar, SidebarBody, SidebarLink } from './components/ui/sidebar';
import { Switch as BillingCycleSwitch } from './components/ui/switch';
import { InteractivePricingCard } from './components/ui/interactive-pricing-card';
import { CreditCardForm, type CardState, type CardValidity } from './components/ui/credit-card-form';
import { Badge as PricingBadge } from './components/ui/badge';
import { Card as PricingCard, CardContent as PricingCardContent, CardDescription as PricingCardDescription, CardFooter as PricingCardFooter, CardHeader as PricingCardHeader, CardTitle as PricingCardTitle } from './components/ui/card';
import { Button as PricingButton } from './components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './components/ui/dialog';
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
  Wallet,
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
  FlaskConical
} from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { BrandLogo } from './components/ui/brand-logo';
import { useMetricHistory, getMetricTrend } from './hooks/useMetricHistory';
import { KpiSparkline } from './components/ui/kpi-sparkline';
import { AnalyticsGroupedBarChart } from './components/ui/analytics-grouped-bar-chart';
import { MiniChart } from './components/ui/mini-chart';
import { BadgeDelta, type BadgeDeltaDirection, type BadgeDeltaTone } from './components/ui/badge-delta';
import { AnalyticsFilterMenu, type FilterMenuOption } from './components/ui/analytics-filter-menu';
import { EarningsDateRangePicker } from './components/ui/earnings-date-range-picker';
import { NotificationIcon, EyeToggleIcon, VolumeIcon, SaveIcon, DownloadIcon } from './components/ui/animated-state-icons';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RevealOnMount } from './components/ui/reveal-on-mount';
import { TextRevealHeader } from './components/ui/text-reveal-header';
import { Alert, AlertContent, AlertDescription, AlertIcon, AlertTitle, AlertToolbar } from './components/ui/alert-1';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from './components/ui/empty';
import { Switch } from './components/ui/switch-button';
import { ThemeToggle } from './components/ui/theme-toggle';
import FilterBar, { FilterType, FilterOperator, type Filter as AnalyticsFilter, type FilterOption } from './components/ui/filters';

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
const LEGAL_DOCUMENTS: Record<'privacy' | 'terms' | 'dpa', { title: string; sections: LegalSection[] }> = {
  privacy: {
    title: 'Tachyo — Privacy Policy',
    sections: [
      {
        heading: 'Two roles',
        body: 'Tachyo is the controller for admin account data and website visitors (Section A), and the processor for your drivers’ shift, location, and pay data, which you control (Section B). Your drivers see a separate, plain-language notice inside the Driver App explaining this.',
      },
      {
        heading: 'Section A — Where Tachyo is the controller',
        body: 'Who we are: [Company Name] Ltd, company number [Company Number], registered office [Registered Office Address], trading as Tachyo. Contact: [Contact Email].\n\nWe collect: admin account data (name, work email, hashed password, role, login activity) to provide and secure your account; and contact-form details if you get in touch. We use Supabase (EU West / London) and Vercel to run the platform, and never sell your data.',
      },
      {
        heading: 'Section B — Where Tachyo is the processor (your drivers’ data)',
        body: 'What the platform collects: driver identity (name, driver ID, phone), a PIN stored as a salted hash we cannot reverse, GPS location while clocked in on a shift, clock in/out times, automated idle alerts (50 minutes stationary) and SOS alerts, and the pay/rate data you enter.\n\nRetention: GPS and shift location history is kept for 12 months, to support payroll-dispute resolution and your own profitability reporting over time. Driver accounts and pay records are kept for the life of your account. See the Data Processing Addendum for what happens to this data if your account is suspended or closed.',
      },
      {
        heading: 'Security',
        body: 'Multi-factor authentication on admin accounts, driver PINs stored as salted hashes, and row-level database security so no other company using Tachyo can ever see your data — enforced at the database level, not just the app.',
      },
      {
        heading: 'Your rights, and your drivers’ rights',
        body: 'You can access, correct, or delete admin account data by contacting us. As the controller for your drivers’ data, requests from your drivers about their own data are yours to handle — we’ll assist you under the Data Processing Addendum. Either of you can also complain to the UK Information Commissioner’s Office (ico.org.uk).',
      },
    ],
  },
  terms: {
    title: 'Tachyo — Terms of Service',
    sections: [
      {
        heading: '1. What Tachyo is',
        body: 'Tachyo is a software platform — this admin dashboard and the Driver App — for road haulage dispatch, driver management, and payroll reconciliation. Tachyo does not employ, engage, dispatch, or insure your drivers, vehicles, or loads, and is not a party to your relationship with them.',
      },
      {
        heading: '2. Your account and your drivers',
        body: 'You’re the employer or engager of your own drivers, and solely responsible for complying with employment and data protection law toward them — including giving any notices required before enabling location tracking or timekeeping. Tachyo processes driver data only on your instructions (see the Data Processing Addendum). You’re responsible for all activity under your account and for deactivating access when it should end.',
      },
      {
        heading: '3. Acceptable use',
        body: 'Don’t use Tachyo unlawfully, try to access another company’s data, attempt to reverse-engineer the platform, or resell access outside your own organisation.',
      },
      {
        heading: '4. Fees and the free trial',
        body: 'New accounts currently get a free trial (180 days from registration). If it ends without converting to a paid plan, access is suspended, and data is permanently deleted 30 days after that unless you convert in the meantime. Paid plan pricing and billing terms will be set out separately when introduced.',
      },
      {
        heading: '5. Liability',
        body: 'Nothing here limits liability for death or personal injury from negligence, fraud, or anything else that can’t lawfully be limited. Subject to that, Tachyo’s liability is capped and excludes indirect losses — see the full Terms of Service for the exact wording. You’re responsible for decisions you make using data from the platform, including payroll calculations and responses to safety alerts — it’s a decision-support tool, not a substitute for your own judgement.',
      },
      {
        heading: '6. Governing law',
        body: 'These Terms are governed by the law of England and Wales.',
      },
    ],
  },
  dpa: {
    title: 'Tachyo — Data Processing Addendum',
    sections: [
      {
        heading: 'Roles',
        body: 'For your drivers’ personal data, you are the controller and Tachyo is the processor. You decide the purposes and means of processing (e.g. choosing to track location); Tachyo processes it only as instructed.',
      },
      {
        heading: 'What Tachyo commits to',
        body: 'Process data only on your instructions; keep it confidential; apply appropriate security (hashed credentials, row-level isolation, MFA); tell you before adding a new sub-processor; help you respond to your drivers’ data-subject requests and any data breach; and delete or return your data at the end of the relationship.',
      },
      {
        heading: 'Retention and deletion',
        body: 'GPS/location history: 12 months, for payroll-dispute and reporting purposes. If your trial ends without converting to paid, your account is suspended, then all driver, shift, rate, and location data is permanently deleted 30 days later unless you convert first. Your organisation record itself is kept afterward only as an inactive marker, with no operational or personal data.',
      },
      {
        heading: 'Sub-processors',
        body: 'Supabase (database, authentication, hosting — EU West/London) and Vercel (application hosting) are Tachyo’s current sub-processors, contractually restricted to using your data only to provide their service to Tachyo.',
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
const isMockMode =
  !supabaseUrl ||
  !supabaseUrl.startsWith('http') ||
  supabaseUrl.includes('YOUR_PROJECT');

let supabase: SupabaseClient | null = null;
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
}
export const DEFAULT_ORG_ALERT_SETTINGS: OrgAlertSettings = {
  longShiftFlagHours: 18,
  idleAlertMinutes: 50,
  nightOutMinGapHours: 8,
  nightOutMaxGapHours: 15,
};

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
}

interface Depot {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  geofence_radius_m: number;
  address: string | null;
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
  const [legalModalDoc, setLegalModalDoc] = useState<'privacy' | 'terms' | 'dpa'>('privacy');
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
  const [activeTab, setActiveTab] = useState<'live' | 'alerts' | 'drivers' | 'rates' | 'analytics'>('live');
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
    if (userRole === 'logistics' && (activeTab === 'rates' || activeTab === 'analytics')) {
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
  });
  const [isSavingAlertSettings, setIsSavingAlertSettings] = useState(false);
  const [alertSettingsError, setAlertSettingsError] = useState('');
  const [alertSettingsSuccess, setAlertSettingsSuccess] = useState('');
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
  const [activeSettingsSection, setActiveSettingsSection] = useState<'company' | 'access-codes' | 'depots' | 'alerts' | 'appearance'>('company');
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
        .select('long_shift_flag_hours, idle_alert_minutes, night_out_min_gap_hours, night_out_max_gap_hours')
        .eq('id', orgId)
        .maybeSingle();
      if (error || !data) return;
      setOrgAlertSettings({
        longShiftFlagHours: Number(data.long_shift_flag_hours) || DEFAULT_ORG_ALERT_SETTINGS.longShiftFlagHours,
        idleAlertMinutes: Number(data.idle_alert_minutes) || DEFAULT_ORG_ALERT_SETTINGS.idleAlertMinutes,
        nightOutMinGapHours: data.night_out_min_gap_hours != null ? Number(data.night_out_min_gap_hours) : DEFAULT_ORG_ALERT_SETTINGS.nightOutMinGapHours,
        nightOutMaxGapHours: data.night_out_max_gap_hours != null ? Number(data.night_out_max_gap_hours) : DEFAULT_ORG_ALERT_SETTINGS.nightOutMaxGapHours,
      });
    } catch (_) {
      // Migration 038 likely not applied on this environment yet — keep defaults.
    }
  }, []);

  // Database States
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [alerts, setAlerts] = useState<IdleAlert[]>([]);
  // Acknowledge state for the two constant sample alert cards in the Alert
  // Monitors tab (see render below) — local-only, never touches Supabase
  // or the `alerts` array itself, so real KPI counts stay untouched.
  const [sampleAlertsAck, setSampleAlertsAck] = useState<Record<string, boolean>>({
    'sample-emergency': false,
    'sample-idle': false,
  });
  const [depots, setDepots] = useState<Depot[]>([]);
  const [isSavingDepot, setIsSavingDepot] = useState(false);
  const [depotFormError, setDepotFormError] = useState('');
  const [newDepotName, setNewDepotName] = useState('');
  const [newDepotAddress, setNewDepotAddress] = useState('');
  const [newDepotLat, setNewDepotLat] = useState('');
  const [newDepotLng, setNewDepotLng] = useState('');
  const [newDepotRadius, setNewDepotRadius] = useState('150');
  const [isLocatingDepot, setIsLocatingDepot] = useState(false);
  const [analyticsFilters, setAnalyticsFilters] = useState<AnalyticsFilter[]>([]);
  // Analytics — which KPI tile is selected; drives both the bar chart and
  // the per-driver donut next to it.
  const [selectedKpi, setSelectedKpi] = useState<'revenue' | 'cost' | 'profit' | 'margin' | 'hours'>('revenue');
  // Chart view — Bar (default) or Line, switchable from the Filters menu.
  const [analyticsChartType, setAnalyticsChartType] = useState<'bar' | 'line'>('bar');
  // Ledger quick-filter — toggled from the "N shifts awaiting a rate"
  // badge so a dispatcher can jump straight to the rows that need action.
  const [showPendingOnly, setShowPendingOnly] = useState(false);
  // Ledger sort — 'date' (default, newest first) or 'margin' (lowest
  // margin first, so the worst-performing loads surface immediately).
  const [ledgerSort, setLedgerSort] = useState<'date' | 'margin'>('date');
  // Inline edits for the per-load revenue table, keyed by shift id, so
  // typing in one row's fields doesn't touch any other row's state.
  const [revenueEdits, setRevenueEdits] = useState<Record<string, { revenue: string; loadRef: string }>>({});
  const [savingRevenueShiftId, setSavingRevenueShiftId] = useState<string | null>(null);
  const [revenueSaveError, setRevenueSaveError] = useState('');
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

  // Rates & Agencies tab: two distinct workflows (setting pay rates vs.
  // running payroll for a period) were previously stacked on one long
  // scrolling page, sharing no visual boundary — a real sub-view switcher
  // keeps each screen focused instead of burying the calculator below a
  // full driver table.
  const [ratesSubView, setRatesSubView] = useState<'profiles' | 'calculator'>('profiles');

  // Rate Editing state
  const [editingRateDriverId, setEditingRateDriverId] = useState<string | null>(null);
  const [editMonFriRate, setEditMonFriRate] = useState<string>('16.00');
  const [editSatRate, setEditSatRate] = useState<string>('17.00');
  const [editSunRate, setEditSunRate] = useState<string>('18.00');
  const [editFixedRate, setEditFixedRate] = useState<string>('150.00');
  const [editRateType, setEditRateType] = useState<string>('Hourly');
  const [editAgencyName, setEditAgencyName] = useState<string>('Direct');

  // Compensation Profiles table — adapted from the 21st.dev "Contacts
  // Table With Modal" (isaiahbjork). Local UI state only (selection,
  // sort, filter, export menus, pagination, which row's "..." was
  // clicked); the actual edit form still reads/writes the state above
  // and handleSaveRate, unchanged — this is a new shell around the same
  // real save path, not a new one.
  const [compTableSelected, setCompTableSelected] = useState<string[]>([]);
  const [compTableSortField, setCompTableSortField] = useState<'name' | 'rateType' | 'rate' | null>(null);
  const [compTableSortOrder, setCompTableSortOrder] = useState<'asc' | 'desc'>('asc');
  const [compTableFilterAgency, setCompTableFilterAgency] = useState<string | null>(null);
  const [compTableShowFilterMenu, setCompTableShowFilterMenu] = useState(false);
  const [compTableShowSortMenu, setCompTableShowSortMenu] = useState(false);
  const [compTableShowExportMenu, setCompTableShowExportMenu] = useState(false);
  const [compTablePage, setCompTablePage] = useState(1);
  const [compTableDetailId, setCompTableDetailId] = useState<string | null>(null);

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

  // Unified Payroll Action Modal (N/O & Extras)
  const [actionModal, setActionModal] = useState<{
    isOpen: boolean;
    type: 'single' | 'bulk';
    shiftIds: string[];
    driverName: string;
    currentExtras: number;
    currentNote: string;
    currentNO: number;
  } | null>(null);

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

      // Fetch Shifts. shift_revenue is a separate table (see migration 035)
      // so this embed only ever returns data to logistics/payroll_admin —
      // its RLS policy has no driver-facing rule at all, unlike columns on
      // shifts itself which the driver app's own select-star queries would
      // otherwise be able to read straight off their own shift row.
      const { data: sfts } = await supabase!
        .from('shifts')
        .select('*, drivers(full_name, driver_id), depots(name), shift_revenue(revenue_amount, load_reference)')
        .order('start_time', { ascending: false });

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
        };
      });
      setShifts(mappedShifts);

      // Fetch Active Idle Alerts
      const { data: alrts } = await supabase!
        .from('idle_alerts')
        .select('*, drivers(full_name, driver_id)')
        .order('started_at', { ascending: false });

      const mappedIdle = (alrts || [])
        .filter((a: any) => !activeClearedIds.includes(a.id))
        .map((a: any) => ({
          ...a,
          driver_name: a.drivers?.full_name,
          driver_code: a.drivers?.driver_id,
          is_sos: false,
          timestamp: a.started_at,
        }));

      // Fetch Active SOS Alerts
      const { data: sosAlrts } = await supabase!
        .from('sos_alerts')
        .select('*, drivers(full_name, driver_id)')
        .order('created_at', { ascending: false });

      const mappedSOS = (sosAlrts || [])
        .filter((a: any) => !activeClearedIds.includes(a.id))
        .map((a: any) => ({
          ...a,
          driver_name: a.drivers?.full_name,
          driver_code: a.drivers?.driver_id,
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
    } catch (e) {
      console.error(e);
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
          if (organizationId) loadOrgAlertSettings(organizationId);
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
    });
  }, [orgAlertSettings]);

  /// Saves the four per-company alert thresholds via admin-users'
  /// update-alert-settings action (migration 038 + edge function deploy
  /// required — on an environment where either is still pending, this
  /// surfaces the real server error rather than pretending to succeed).
  const handleSaveAlertSettings = async () => {
    if (isMockMode || !supabase) return;
    const longShiftFlagHours = parseFloat(alertSettingsForm.longShiftFlagHours);
    const idleAlertMinutes = parseInt(alertSettingsForm.idleAlertMinutes, 10);
    const nightOutMinGapHours = parseFloat(alertSettingsForm.nightOutMinGapHours);
    const nightOutMaxGapHours = parseFloat(alertSettingsForm.nightOutMaxGapHours);

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

    setIsSavingAlertSettings(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: {
          action: 'update-alert-settings',
          longShiftFlagHours,
          idleAlertMinutes,
          nightOutMinGapHours,
          nightOutMaxGapHours,
        },
      });
      const failure = await readFunctionError(data, error);
      if (failure) {
        setAlertSettingsError(failure);
      } else {
        setOrgAlertSettings({ longShiftFlagHours, idleAlertMinutes, nightOutMinGapHours, nightOutMaxGapHours });
        setAlertSettingsSuccess('Saved.');
        setTimeout(() => setAlertSettingsSuccess(''), 1800);
      }
    } catch (_) {
      setAlertSettingsError('Could not save alert settings.');
    } finally {
      setIsSavingAlertSettings(false);
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

    setSavingRevenueShiftId(shiftId);
    try {
      const { error } = await supabase
        .from('shift_revenue')
        .upsert({ shift_id: shiftId, revenue_amount: revenueAmount, load_reference: loadReference }, { onConflict: 'shift_id' });

      if (error) {
        setRevenueSaveError(error.message || 'Could not save the revenue for this load.');
        return;
      }

      setShifts(prev => prev.map(s => s.id === shiftId ? { ...s, revenue_amount: revenueAmount, load_reference: loadReference } : s));
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
        if (organizationId) loadOrgAlertSettings(organizationId);
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


  const handleUpdateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;
    setEditEmployeeError('');
    setIsSavingEmployee(true);

    const cleanName = editFullName.trim();
    const cleanUsername = editUsername.trim();
    const cleanPhone = editPhone.trim();
    const cleanPin = editNewPin.trim();

    if (!cleanName || !cleanUsername) {
      setEditEmployeeError('Full Name and Username are required.');
      setIsSavingEmployee(false);
      return;
    }

    if (cleanPin && cleanPin.length !== 6) {
      // Must match the driver app's login screen exactly (6 digits) — a
      // shorter PIN here would leave the driver unable to ever log in.
      setEditEmployeeError('New PIN must be exactly 6 digits if provided.');
      setIsSavingEmployee(false);
      return;
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
      return;
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
        return;
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
    } catch (err: any) {
      setEditEmployeeError(`Update failed: ${err?.message ?? 'Unknown error'}`);
      setIsSavingEmployee(false);
    }
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

      // 1. Calculate new duration
      const newHours = (new Date(newEndTime).getTime() - new Date(newStartTime).getTime()) / (1000 * 60 * 60);
      updatePayload.total_hours = newHours;

      // 2. FORCE FRONTEND RECALCULATION
      // Create a mocked shift overriding the time and stripping the old total_pay so the engine calculates it fresh
      const simulatedShift = {
          ...targetShift,
          start_time: newStartTime,
          end_time: newEndTime,
          total_hours: newHours,
          status: 'completed',
          total_pay: null
      };

      // 3. Extract perfectly calculated gross pay from our master engine
      const { grossPay, isFixedRate: isSimulatedFixed } = getShiftFinancials(simulatedShift as any);

      // 4. Set the exact payload to bypass DB triggers AND STAMP HISTORY
      updatePayload.total_pay = grossPay;
      updatePayload.rate_type = isSimulatedFixed ? 'Fixed Shift Rate (Day Rate)' : 'Hourly';
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



  const openActionModal = (type: 'single' | 'bulk', shiftIds: string[], driverName: string, defaultExtras = 0, defaultNote = '', defaultNO = 0) => {
    setActionModal({
      isOpen: true,
      type,
      shiftIds,
      driverName: type === 'bulk' ? `${shiftIds.length} Selected Shifts` : driverName,
      currentExtras: defaultExtras,
      currentNote: defaultNote,
      currentNO: defaultNO
    });
  };

  const handleSaveModalAction = async (newNO: number, newExtras: number, newNote: string) => {
    if (!actionModal) return;
    
    for (const shiftId of actionModal.shiftIds) {
       const targetShift = shifts.find(s => s.id === shiftId || s.real_id === shiftId);
       if (!targetShift) continue;
       const realId = targetShift.real_id || targetShift.id;

       let calculatedGrossPay = 0;
       const hasStoredPay = targetShift.status === 'completed' && targetShift.total_pay !== null && targetShift.total_pay !== undefined;

       if (hasStoredPay) {
           const oldExtras = Number(targetShift.extras_amount) || 0;
           const oldNoAmt = Number(targetShift.night_out_allowance ?? targetShift.night_out_amount) || 0;
           
           // Mathematical precision: remove old modifiers, apply new ones
           calculatedGrossPay = Number((Number(targetShift.total_pay) - oldExtras - oldNoAmt + newExtras + newNO).toFixed(2));
       } else {
           const simulatedShift = { 
             ...targetShift, 
             extras_amount: newExtras, 
             night_out_allowance: newNO, 
             night_out_amount: newNO 
           };
           calculatedGrossPay = getShiftFinancials(simulatedShift as any).grossPay;
       }

       await supabase!.from('shifts').update({
         extras_amount: newExtras,
         extras_note: newNote,
         night_out_amount: newNO,
         night_out_status: newNO > 0 ? 'approved' : 'none',
         total_pay: calculatedGrossPay
       }).eq('id', realId);

       try {
         await supabase!
           .from('shifts')
           .update({ night_out_allowance: newNO })
           .eq('id', realId);
       } catch (_) {}
    }
    
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

    setEditingRateDriverId(null);

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
    const historicalBasePay = historicalTotalPay !== null ? (historicalTotalPay - storedNoAmt - storedExtras) : null;

    // Fixed vs Hourly is decided solely by the driver's current profile —
    // not by a rate_type string frozen on the shift row, and not by
    // guessing from the size of a stored number (a full 8-hour hourly
    // shift routinely totals well over any such threshold).
    const isFixedRate = Boolean(drvRate?.rate_type && (
      drvRate.rate_type.toLowerCase().includes('fixed') ||
      drvRate.rate_type.toLowerCase().includes('day') ||
      drvRate.rate_type.toLowerCase().includes('flat')
    ));

    const startDay = startObj.getDay();
    const endDay = endObj ? endObj.getDay() : startDay;

    // 3. Rate determination logic — always from the current profile.
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

    const startRateVal = getRateForDay(startDay);
    const endRateVal = getRateForDay(endDay);

    let basePay = 0;

    if (isFixedRate) {
      // FLAT rate per shift — NEVER multiply by hours.
      // Use hourly_rate as fallback if fixed_rate was not persisted by schema-cache tier-3 save.
      basePay = Number(drvRate?.fixed_rate)
        || Number((drvRate as any)?.hourly_rate)
        || startRateVal;
    } else if (hasHistoricalSnapshot) {
      // Trust the stored snapshot for completed shifts' base pay — this is
      // the money that was actually paid and must not move retroactively.
      basePay = historicalBasePay !== null ? historicalBasePay : (liveOrTotalHours * startRateVal);
      if (basePay < 0) basePay = liveOrTotalHours * startRateVal;
    } else {
      basePay = s.end_time
        ? calculateSplitShiftPay(s.start_time, s.end_time, drvRate)
        : liveOrTotalHours * startRateVal;
    }

    const noAmt = Number(s.night_out_allowance ?? s.night_out_amount) || 0;
    const extrasAmt = Number(s.extras_amount) || 0;

    let grossPay = 0;
    if (hasHistoricalSnapshot) {
        // Trust the database completely. The total_pay already includes all extras and allowances.
        grossPay = Number(s.total_pay);
    } else {
        grossPay = Number((basePay + noAmt + extrasAmt).toFixed(2));
    }

    return {
      rate: startRateVal,
      startRateVal,
      endRateVal,
      startDay,
      endDay,
      isFixedRate,
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
      const { rate, isFixedRate, noAmt, extrasAmt, extrasNote, grossPay, agency } = getShiftFinancials(s);
      return {
        'Employee Name': s.driver_name,
        'Employee ID': s.driver_code,
        'Agency': agency,
        'Base': s.depot_name || 'N/A',
        'Start Time': new Date(s.start_time).toLocaleString(),
        'End Time': s.end_time ? new Date(s.end_time).toLocaleString() : 'Active',
        'Hours Worked': (s.total_hours || 0).toFixed(2),
        'Effective Rate': isFixedRate ? `£${rate.toFixed(2)} (Fixed/Shift)` : `£${rate.toFixed(2)}/hr`,
        'Night Out Status': (s.night_out_status || 'none').toUpperCase(),
        'Night Out Allowance (£)': noAmt.toFixed(2),
        'Extras (£)': extrasAmt.toFixed(2),
        'Extras Note': extrasNote || '',
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
  const kpiTotalWeeklyPayout = shifts.reduce((sum, s) => sum + (s.total_pay || 0), 0);
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
                        <span className="nav-dot" aria-label={`${activeAlertsCount} unacknowledged alerts`} />
                      )}
                    </span>
                  ),
                }}
                className={`nav-item ${activeTab === 'alerts' ? 'active' : ''}`}
                labelClassName="text-inherit dark:text-inherit"
              />

              <SidebarLink
                link={{
                  label: 'Driver Profiles',
                  href: '#',
                  active: activeTab === 'drivers',
                  onClick: () => setActiveTab('drivers'),
                  icon: <span className="nav-icon"><IdCard size={18} /></span>,
                }}
                className={`nav-item ${activeTab === 'drivers' ? 'active' : ''}`}
                labelClassName="text-inherit dark:text-inherit"
              />

              {userRole === 'payroll_admin' && (
                <SidebarLink
                  link={{
                    label: 'Analytics',
                    href: '#',
                    active: activeTab === 'analytics',
                    onClick: () => setActiveTab('analytics'),
                    icon: <span className="nav-icon"><BarChart3 size={18} /></span>,
                  }}
                  className={`nav-item ${activeTab === 'analytics' ? 'active' : ''}`}
                  labelClassName="text-inherit dark:text-inherit"
                />
              )}

              {userRole === 'payroll_admin' && (
                <>
                  <SidebarLink
                    link={{
                      label: 'Rates & Agencies',
                      href: '#',
                      active: activeTab === 'rates',
                      onClick: () => setActiveTab('rates'),
                      icon: <span className="nav-icon"><Wallet size={18} /></span>,
                    }}
                    className={`nav-item ${activeTab === 'rates' ? 'active' : ''}`}
                    labelClassName="text-inherit dark:text-inherit"
                  />
                  {pendingNightOutsCount > 0 && railExpanded && (
                    <span
                      className="badge text-xs ml-8"
                      style={{ alignSelf: 'flex-start', marginLeft: '52px', marginTop: '-8px', padding: '2px 6px', borderRadius: '8px', backgroundColor: '#F59E0B', color: '#FFFFFF' }}
                    >
                      {pendingNightOutsCount} N/O
                    </span>
                  )}
                </>
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
        
        {/* Header Stats Row — hidden on Analytics, which builds its own
            dedicated stats layout instead of reusing this compact row. */}
        {activeTab !== 'analytics' && (
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
        )}

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
            <div className="flex align-center justify-between mb-24">
              <h2 className="text-xl font-black text-primary m-0">ACTIVE GEOFENCE & IDLE ALERTS</h2>
              
              <div className="flex gap-12">
                {/* Audio controller toggle */}
                <button className="btn btn-secondary" onClick={() => setIsAudioMuted(!isAudioMuted)}>
                  <VolumeIcon on={isAudioMuted} size={16} />
                  {isAudioMuted ? 'UNMUTE ALARM' : 'MUTE ALARM'}
                </button>

                {/* Clear all alerts button */}
                <button 
                  className="btn btn-primary" 
                  onClick={handleClearAllAlerts}
                  disabled={alerts.length === 0}
                  style={{
                    opacity: alerts.length === 0 ? 0.5 : 1,
                    cursor: alerts.length === 0 ? 'not-allowed' : 'pointer'
                  }}
                >
                  CLEAR ALERTS
                </button>
              </div>
            </div>

            {(() => {
              // Unacknowledged first within each group — that's the order
              // that actually needs eyes on it.
              const byUrgency = (a: IdleAlert, b: IdleAlert) =>
                Number(a.acknowledged) - Number(b.acknowledged);
              const sosAlerts = alerts.filter(a => a.is_sos).sort(byUrgency);
              const idleAlertsList = alerts.filter(a => !a.is_sos).sort(byUrgency);

              // Two constant sample alerts (one emergency, one idle) kept
              // out of the `alerts` state entirely — real KPI counts and
              // the group-header tallies above stay tied to real data.
              // Acknowledge/dismiss on these only ever touch local state,
              // never Supabase. For checking the idle/emergency colour
              // treatment without waiting on live data — remove once
              // colour iteration on this tab is done.
              const sampleEmergencyAlert: IdleAlert = {
                id: 'sample-emergency',
                driver_id: 'sample-driver-1',
                driver_name: 'Sample Driver',
                driver_code: 'TEST-SOS',
                shift_id: 'sample-shift-1',
                created_at: new Date().toISOString(),
                latitude: 53.4830,
                longitude: -1.0850,
                acknowledged: sampleAlertsAck['sample-emergency'],
                is_sos: true,
              };
              const sampleIdleAlert: IdleAlert = {
                id: 'sample-idle',
                driver_id: 'sample-driver-2',
                driver_name: 'Sample Driver',
                driver_code: 'TEST-IDLE',
                shift_id: 'sample-shift-2',
                started_at: new Date(Date.now() - 55 * 60 * 1000).toISOString(),
                latitude: 53.4830,
                longitude: -1.0850,
                acknowledged: sampleAlertsAck['sample-idle'],
                is_sos: false,
              };

              const renderAlertCard = (alert: IdleAlert) => {
                const isSample = alert.id.startsWith('sample-');
                const startedTimeMs = alert.started_at ? (
                  alert.started_at.toString().endsWith('Z') || alert.started_at.toString().includes('+')
                    ? new Date(alert.started_at).getTime()
                    : new Date(`${alert.started_at.toString().replace(' ', 'T')}Z`).getTime()
                ) : Date.now();
                const diffMins = Math.max(1, Math.round((Date.now() - startedTimeMs) / 60000));

                const displayTime = (() => {
                  const rawTs = alert.is_sos ? alert.created_at : alert.started_at;
                  if (!rawTs) return '--:--:--';
                  const str = rawTs.toString().trim();
                  const cleanStr = str.endsWith('Z') || str.includes('+') ? str : `${str.replace(' ', 'T')}Z`;
                  return new Date(cleanStr).toLocaleTimeString();
                })();

                // critical (SOS) is solid-red while it still needs eyes
                // on it, dropping to a muted neutral card once handled;
                // idle stays amber-light throughout — it was never a
                // solid-fill severity in this app to begin with.
                const variant: 'critical' | 'warning' | 'neutral' = alert.acknowledged
                  ? 'neutral'
                  : alert.is_sos ? 'critical' : 'warning';
                const appearance = !alert.acknowledged && alert.is_sos ? 'solid' : 'light';
                const linkStyle: React.CSSProperties = { background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer' };

                return (
                  <Alert
                    key={alert.id}
                    variant={variant}
                    appearance={appearance}
                    className={!alert.acknowledged && alert.is_sos ? 'alert-pulse-card' : ''}
                  >
                    <AlertIcon>
                      {alert.is_sos ? <ShieldAlert /> : <Clock />}
                    </AlertIcon>
                    <AlertContent>
                      <AlertTitle className="flex align-center gap-8">
                        <span>{alert.is_sos ? 'Emergency SOS' : `Idle Alert (${diffMins} mins)`} — {alert.driver_name}</span>
                        {isSample && (
                          <span
                            className="flex align-center gap-4"
                            style={{
                              fontSize: '10px', fontWeight: 800, letterSpacing: '0.5px',
                              padding: '2px 7px', borderRadius: '999px',
                              background: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.5)',
                            }}
                          >
                            <FlaskConical size={10} /> SAMPLE
                          </span>
                        )}
                      </AlertTitle>
                      <AlertDescription>
                        <div>
                          {alert.is_sos ? 'Vehicle breakdown or employee emergency reported. Reported at: ' : 'Stationary stop duration threshold exceeded. Stationary since: '}
                          <b>{displayTime}</b> ({diffMins} minutes ago)
                        </div>
                        <div className="font-mono">
                          GPS: {(alert.latitude || 0).toFixed(6)}, {(alert.longitude || 0).toFixed(6)}
                        </div>
                      </AlertDescription>
                      <AlertToolbar>
                        {!alert.acknowledged ? (
                          <button
                            type="button"
                            style={{ ...linkStyle, textDecoration: 'underline' }}
                            onClick={() => isSample
                              ? setSampleAlertsAck(prev => ({ ...prev, [alert.id]: true }))
                              : acknowledgeAlert(alert.id, alert.is_sos)}
                          >
                            Acknowledge
                          </button>
                        ) : (
                          <span className="flex align-center gap-4">
                            <Check size={12} /> Acknowledged
                          </span>
                        )}
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${alert.latitude},${alert.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'inherit' }}
                        >
                          Open in Maps
                        </a>
                        <button
                          type="button"
                          style={linkStyle}
                          onClick={() => isSample
                            ? setSampleAlertsAck(prev => ({ ...prev, [alert.id]: false }))
                            : clearAlert(alert.id, alert.is_sos)}
                        >
                          {isSample && alert.acknowledged ? 'Reset' : 'Dismiss'}
                        </button>
                      </AlertToolbar>
                    </AlertContent>
                  </Alert>
                );
              };

              return (
                <div className="flex flex-col gap-32">
                  {/* Two constant sample cards — always visible, real
                      severities and colours, clearly tagged "SAMPLE" so
                      they're never mistaken for a live alert. */}
                  <div className="flex flex-col gap-16">
                    <div
                      className="flex align-center gap-8"
                      style={{ backgroundColor: 'var(--card-bg-hover)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px 16px' }}
                    >
                      <FlaskConical size={16} className="text-muted" />
                      <span className="font-black text-muted" style={{ fontSize: '13px', letterSpacing: '0.4px' }}>
                        SAMPLE ALERTS — COLOUR REFERENCE
                      </span>
                    </div>
                    <div className="flex flex-col gap-16">
                      {renderAlertCard(sampleEmergencyAlert)}
                      {renderAlertCard(sampleIdleAlert)}
                    </div>
                  </div>

                  {alerts.length === 0 ? (
                    <div className="glass-card">
                      <Empty>
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <CircleCheck />
                          </EmptyMedia>
                          <EmptyTitle>No Active Alerts</EmptyTitle>
                          <EmptyDescription>
                            All staff members are moving or on authorized short breaks.
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    </div>
                  ) : (
                    <>
                      {sosAlerts.length > 0 && (
                        <div className="flex flex-col gap-16">
                          <div
                            className="flex align-center gap-8"
                            style={{ backgroundColor: '#FCEBEB', border: '1px solid #F5C4B3', borderRadius: '10px', padding: '10px 16px' }}
                          >
                            <ShieldAlert size={16} color="#791F1F" />
                            <span className="font-black" style={{ color: '#791F1F', fontSize: '13px', letterSpacing: '0.4px' }}>
                              {sosAlerts.length} EMERGENCY SOS {sosAlerts.length === 1 ? 'ALERT' : 'ALERTS'}
                            </span>
                          </div>
                          <div className="flex flex-col gap-16">
                            {sosAlerts.map(renderAlertCard)}
                          </div>
                        </div>
                      )}

                      {idleAlertsList.length > 0 && (
                        <div className="flex flex-col gap-16">
                          <div
                            className="flex align-center gap-8"
                            style={{ backgroundColor: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '10px', padding: '10px 16px' }}
                          >
                            <Clock size={16} color="#92400E" />
                            <span className="font-black" style={{ color: '#92400E', fontSize: '13px', letterSpacing: '0.4px' }}>
                              {idleAlertsList.length} IDLE {idleAlertsList.length === 1 ? 'ALERT' : 'ALERTS'}
                            </span>
                          </div>
                          <div className="flex flex-col gap-16">
                            {idleAlertsList.map(renderAlertCard)}
                          </div>
                        </div>
                      )}
                    </>
                  )}
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
                className="btn"
                style={{ padding: '10px 16px', fontSize: '13px', fontWeight: 800, backgroundColor: 'var(--brand-red)', color: '#FFFFFF', borderColor: 'var(--brand-red)' }}
                onClick={() => setIsAddingEmployee(!isAddingEmployee)}
              >
                + Add Employee
              </button>
            </div>

            {/* Add Employee Card form overlay — restyled onto the same
                icon-prefixed field look used at login and in Settings
                (.login-field/.login-field-icon/.login-input) instead of
                the bare unlabelled-icon input-field grid it had before,
                so it actually reads as part of the same application. */}
            {isAddingEmployee && (
              <div className="glass-panel p-24 mb-24" style={{ borderRadius: '16px' }}>
                <h3 className="text-md font-bold text-primary mb-16">Add New Employee Profile</h3>
                <form onSubmit={handleAddEmployee}>
                  <div className="grid grid-cols-5 gap-16">
                    <div className="input-group">
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

                  {crudError && (
                    <div className="text-error text-sm font-semibold mb-16">
                      ⚠️ {crudError}
                    </div>
                  )}

                  <div className="flex gap-8 mt-16">
                    <button type="submit" className="btn btn-primary">SAVE EMPLOYEE PROFILE</button>
                    <button type="button" className="btn btn-secondary" onClick={() => setIsAddingEmployee(false)}>CANCEL</button>
                  </div>
                </form>
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

             {/* Employees list table */}
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee ID</th>
                    <th>Full Name</th>
                    <th>Profession</th>
                    <th>Phone Contact</th>
                    <th>Account Status</th>
                    <th>Shift & Time Tracker</th>
                    <th>Actions</th>
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

                    const formatTime = (ts: string) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    const formatDate = (ts: string) => new Date(ts).toLocaleDateString([], { day: '2-digit', month: '2-digit' });

                    return (
                      <tr key={drv.id}>
                        <td className="font-mono font-bold text-accent">{drv.driver_id}</td>
                        <td className="font-bold text-primary">{drv.full_name}</td>
                        <td>
                          <select
                            className="input-field"
                            style={{ padding: '4px 8px', fontSize: '12px', width: 'auto' }}
                            value={drv.profession ?? 'driver'}
                            onChange={(e) => updateEmployeeProfession(drv.id, e.target.value as EmployeeProfession)}
                          >
                            <option value="driver">Driver</option>
                            <option value="mechanic">Mechanic</option>
                            <option value="logistics">Logistics</option>
                          </select>
                        </td>
                        <td className="text-secondary">{drv.phone}</td>
                        <td>
                          <span
                            className={`badge ${drv.is_active ? 'badge-success' : 'badge-danger'}`}
                            style={{ display: 'inline-flex', alignItems: 'center', padding: '4px' }}
                            title={drv.is_active ? 'Active' : 'Offline'}
                            aria-label={drv.is_active ? 'Active' : 'Offline'}
                          >
                            {drv.is_active ? <CircleCheck size={13} /> : <CircleX size={13} />}
                          </span>
                        </td>
                        <td>
                          {latestShift ? (
                            <div className="flex flex-col gap-4">
                              {activeShift ? (
                                <span className="badge badge-success" style={{ width: 'fit-content' }}>
                                  Active ({activeShift.depot_name || 'In Progress'})
                                </span>
                              ) : (
                                <span className="badge" style={{ width: 'fit-content', background: 'var(--card-bg-hover)', color: 'var(--charcoal-light)', border: '1px solid var(--border-color)' }}>
                                  Offline (Last Shift)
                                </span>
                              )}
                              <span className="text-xs text-secondary font-mono" style={{ fontWeight: 600 }}>
                                {formatDate(latestShift.start_time)} | {formatTime(latestShift.start_time)} - {latestShift.end_time ? formatTime(latestShift.end_time) : 'PRESENT'}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted text-sm">No shift history</span>
                          )}
                        </td>
                        <td>
                          {/* Strictly on-brand now — this app's palette is
                              Charcoal/Brand Red/White (see index.css), not
                              a generic green-success/blue-info scheme, so
                              green (Clock In, Activate) and blue (Edit) are
                              gone. Routine/neutral actions (Clock In, Edit,
                              Activate) share the same plain .btn-secondary
                              look; only the genuinely consequential actions
                              carry red, at two different weights so Remove
                              (permanent) still reads as more severe than
                              Deactivate (reversible) without needing a
                              second hue: a red tint/outline vs. a solid red
                              fill. */}
                          <div className="flex gap-8">
                            {activeShift ? (
                              <button
                                className="btn btn-primary"
                                style={{ padding: '6px 12px', fontSize: '12px' }}
                                onClick={() => handleManualClockOut(drv.id, activeShift.id)}
                              >
                                CLOCK OUT
                              </button>
                            ) : (
                              <button
                                className="btn btn-secondary"
                                style={{ padding: '6px 12px', fontSize: '12px' }}
                                onClick={() => handleManualClockIn(drv.id)}
                                disabled={!drv.is_active}
                              >
                                CLOCK IN
                              </button>
                            )}
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '6px 12px', fontSize: '12px' }}
                              onClick={() => openEditEmployeeModal(drv)}
                            >
                              EDIT
                            </button>
                            <button
                              className={`btn ${drv.is_active ? 'btn-danger' : 'btn-secondary'}`}
                              style={{ padding: '6px 12px', fontSize: '12px' }}
                              onClick={() => toggleEmployeeStatus(drv.id, drv.is_active)}
                            >
                              {drv.is_active ? 'DEACTIVATE' : 'ACTIVATE'}
                            </button>
                            <button
                              className="btn"
                              style={{ padding: '6px 12px', fontSize: '12px', backgroundColor: 'var(--brand-red)', color: '#FFFFFF', borderColor: 'var(--brand-red)' }}
                              onClick={() => handleDeleteEmployee(drv.id)}
                            >
                              REMOVE
                            </button>
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

        {/* ── TAB 4: Rates & Agencies (Payroll Admin Only) ───── */}
        {activeTab === 'rates' && userRole === 'payroll_admin' && (
          <div className="flex-1">
            <div className="flex align-center justify-between mb-16">
              <div>
                <h2 className="text-xl font-black text-primary m-0">Rates &amp; Agencies</h2>
                <p className="text-xs text-muted mt-4">Set driver pay rates, then run payroll for a period</p>
              </div>
            </div>

            {/* Two distinct workflows, one tab: setting a driver's rate
                structure vs. running payroll for a date range. Kept as a
                sub-view switcher (reusing the same pill-toggle pattern the
                calculator's own Detailed View / Weekly Summary buttons
                already use below) rather than one long page, so each gets
                a focused screen instead of the calculator being buried
                under a full driver table. */}
            <div className="flex gap-8 mb-24">
              <button
                className={`payroll-pill-btn ${ratesSubView === 'profiles' ? 'payroll-pill-btn--active' : 'payroll-pill-btn--outline'}`}
                onClick={() => setRatesSubView('profiles')}
              >
                <IdCard size={13} /> Compensation Profiles
              </button>
              <button
                className={`payroll-pill-btn ${ratesSubView === 'calculator' ? 'payroll-pill-btn--active' : 'payroll-pill-btn--outline'}`}
                onClick={() => setRatesSubView('calculator')}
              >
                <PoundSterling size={13} /> Earnings
              </button>
            </div>

            {ratesSubView === 'profiles' && (
            <>
            <div className="mb-16">
              <h3 className="text-sm font-black text-primary m-0">Employee Compensation Profiles</h3>
              <p className="text-xs text-muted mt-4">Assign rate structures, weekday/weekend pay, and agencies to drivers</p>
            </div>

            {/* Adapted from the 21st.dev "Contacts Table With Modal"
                reference (isaiahbjork) — same grid layout, checkbox/
                select-all column, Filter/Sort/Export toolbar, a "…"
                per row opening a detail panel, and Previous/Next
                pagination, all kept as in the reference. Real-data
                substitutions for columns with no literal equivalent:
                the reference's 4-level "Connection Strength" becomes
                Rate Type (this data only has 2 real categories —
                Hourly/Fixed — so it gets 2 badge colours, not 4
                invented ones); Twitter Followers becomes Rate;
                Email (a mailto link) becomes Agency (plain text, since
                agency isn't a link); Description becomes the real rate
                breakdown. The reference's decorative per-column header
                icons and the per-row identity icon are dropped — this
                table shouldn't carry icons that don't mean anything.
                The old agency-grouped-header-rows view is replaced by
                the reference's own mechanism for a categorical
                dimension — Agency is now the Filter field — and Sort
                covers the reference's 3-field shape (Name / Rate Type /
                Rate). The "…" detail panel's primary action opens the
                real, unchanged Edit Compensation dialog (same state and
                handleSaveRate as before) instead of the reference's
                "Send Email", which has no equivalent here. */}
            {(() => {
              const resolveAgency = (emp: typeof employees[number]) => {
                const currentRate = employeeRates[emp.id] || employeeRates[emp.driver_id];
                return (emp as any).agency_name || (emp as any).agency || currentRate?.agency_name || 'Direct';
              };
              const getCompRow = (emp: typeof employees[number]) => {
                const currentRate = employeeRates[emp.id] || employeeRates[emp.driver_id] || ((emp as any).employee_id ? employeeRates[(emp as any).employee_id] : null) || {
                  driver_id: emp.id,
                  rate_type: (emp as any).rate_type || 'Hourly',
                  mon_fri_rate: Number((emp as any).mon_fri_rate ?? emp.hourly_rate) || 16.00,
                  sat_rate: Number((emp as any).saturday_rate) || 17.00,
                  sun_rate: Number((emp as any).sunday_rate) || 18.00,
                  agency_name: (emp as any).agency_name || (emp as any).agency || 'Direct',
                };
                const isFixedRate = currentRate.rate_type === 'Fixed' || Boolean(currentRate.rate_type && currentRate.rate_type.toLowerCase().includes('fixed'));
                const agency = resolveAgency(emp);
                const rateValue = isFixedRate ? Number(currentRate.fixed_rate || 0) : Number(currentRate?.mon_fri_rate || 16.00);
                return { emp, currentRate, isFixedRate, agency, rateValue };
              };
              type CompRow = ReturnType<typeof getCompRow>;

              const allRows = employees.map(getCompRow);
              const agencyOptions = Array.from(new Set(allRows.map(r => r.agency))).sort((a, b) => {
                if (a === 'Direct') return -1;
                if (b === 'Direct') return 1;
                return a.localeCompare(b);
              });

              const filteredRows = compTableFilterAgency ? allRows.filter(r => r.agency === compTableFilterAgency) : allRows;
              const sortedRows = [...filteredRows];
              if (compTableSortField) {
                sortedRows.sort((a, b) => {
                  let av: string | number;
                  let bv: string | number;
                  if (compTableSortField === 'name') { av = a.emp.full_name; bv = b.emp.full_name; }
                  else if (compTableSortField === 'rateType') { av = a.isFixedRate ? 1 : 0; bv = b.isFixedRate ? 1 : 0; }
                  else { av = a.rateValue; bv = b.rateValue; }
                  if (av < bv) return compTableSortOrder === 'asc' ? -1 : 1;
                  if (av > bv) return compTableSortOrder === 'asc' ? 1 : -1;
                  return 0;
                });
              }

              const PAGE_SIZE = 10;
              const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
              const safePage = Math.min(compTablePage, totalPages);
              const pageRows = sortedRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
              const allOnPageSelected = pageRows.length > 0 && pageRows.every(r => compTableSelected.includes(r.emp.id));

              const toggleSelect = (id: string) => setCompTableSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
              const toggleSelectAll = () => setCompTableSelected(allOnPageSelected ? [] : pageRows.map(r => r.emp.id));

              const handleSort = (field: 'name' | 'rateType' | 'rate') => {
                if (compTableSortField === field) setCompTableSortOrder(o => o === 'asc' ? 'desc' : 'asc');
                else { setCompTableSortField(field); setCompTableSortOrder('asc'); }
                setCompTableShowSortMenu(false);
              };

              const rateBreakdown = (r: CompRow) => r.isFixedRate
                ? `£${Number(r.currentRate.fixed_rate || 0).toFixed(2)} per shift`
                : `Mon–Fri £${Number(r.currentRate.mon_fri_rate || 16).toFixed(2)} · Sat £${Number((r.currentRate as any).saturday_rate ?? (r.currentRate as any).sat_rate ?? 17).toFixed(2)} · Sun £${Number((r.currentRate as any).sunday_rate ?? (r.currentRate as any).sun_rate ?? 18).toFixed(2)}`;

              const exportRows = (rows: CompRow[]) => rows.map(r => ({
                'Employee ID': r.emp.driver_id,
                'Full Name': r.emp.full_name,
                Agency: r.agency,
                'Rate Type': r.isFixedRate ? 'Fixed Shift' : 'Hourly',
                'Rate (£)': r.rateValue.toFixed(2),
              }));
              const exportCompCSV = () => {
                const csv = Papa.unparse(exportRows(sortedRows));
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = `compensation-profiles-${new Date().toISOString().slice(0, 10)}.csv`;
                link.click();
              };
              const exportCompJSON = () => {
                const blob = new Blob([JSON.stringify(exportRows(sortedRows), null, 2)], { type: 'application/json;charset=utf-8;' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = `compensation-profiles-${new Date().toISOString().slice(0, 10)}.json`;
                link.click();
              };

              const openEditor = (row: CompRow) => {
                setEditingRateDriverId(row.emp.id);
                setEditMonFriRate(Number(row.currentRate.mon_fri_rate || 16.00).toString());
                setEditSatRate(Number((row.currentRate as any).saturday_rate ?? (row.currentRate as any).sat_rate ?? 17.00).toString());
                setEditSunRate(Number((row.currentRate as any).sunday_rate ?? (row.currentRate as any).sun_rate ?? 18.00).toString());
                setEditFixedRate(Number(row.currentRate.fixed_rate || 150.00).toString());
                setEditRateType(row.currentRate.rate_type || 'Hourly');
                setEditAgencyName(row.currentRate.agency_name || 'Direct');
                setCompTableDetailId(null);
              };

              const detailRow = compTableDetailId ? allRows.find(r => r.emp.id === compTableDetailId) : null;
              const editingRow = editingRateDriverId ? allRows.find(r => r.emp.id === editingRateDriverId) : null;
              const isEditingFixed = editRateType === 'Fixed' || editRateType === 'Fixed Shift Rate (Day Rate)';
              const gridCols = '40px 2fr 140px 120px 1fr 1.2fr 140px';

              return (
                <>
                  <div className="mb-16 flex items-center justify-end gap-8" style={{ flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative' }}>
                      <button type="button" onClick={() => setCompTableShowFilterMenu(v => !v)} className="payroll-pill-btn payroll-pill-btn--outline">
                        Filter
                        {compTableFilterAgency && <span className="payroll-pill-badge">1</span>}
                      </button>
                      {compTableShowFilterMenu && (
                        <>
                          <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setCompTableShowFilterMenu(false)} />
                          <div style={{ position: 'absolute', right: 0, marginTop: '4px', width: '200px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', boxShadow: '0 12px 32px rgba(0,0,0,0.16)', borderRadius: '8px', zIndex: 20, padding: '4px' }}>
                            <button type="button" onClick={() => { setCompTableFilterAgency(null); setCompTableShowFilterMenu(false); setCompTablePage(1); }} className="flags-review-item" style={{ fontWeight: !compTableFilterAgency ? 800 : 600 }}>
                              All Agencies
                            </button>
                            <div style={{ borderTop: '1px solid var(--border-color)', margin: '4px 0' }} />
                            {agencyOptions.map(ag => (
                              <button key={ag} type="button" onClick={() => { setCompTableFilterAgency(ag); setCompTableShowFilterMenu(false); setCompTablePage(1); }} className="flags-review-item" style={{ fontWeight: compTableFilterAgency === ag ? 800 : 600 }}>
                                {ag}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    <div style={{ position: 'relative' }}>
                      <button type="button" onClick={() => setCompTableShowSortMenu(v => !v)} className="payroll-pill-btn payroll-pill-btn--outline">
                        Sort
                        {compTableSortField && <span className="payroll-pill-badge">1</span>}
                        <ChevronDown size={13} />
                      </button>
                      {compTableShowSortMenu && (
                        <>
                          <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setCompTableShowSortMenu(false)} />
                          <div style={{ position: 'absolute', right: 0, marginTop: '4px', width: '200px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', boxShadow: '0 12px 32px rgba(0,0,0,0.16)', borderRadius: '8px', zIndex: 20, padding: '4px' }}>
                            <button type="button" onClick={() => handleSort('name')} className="flags-review-item" style={{ fontWeight: compTableSortField === 'name' ? 800 : 600 }}>
                              Name {compTableSortField === 'name' && (compTableSortOrder === 'asc' ? '(A–Z)' : '(Z–A)')}
                            </button>
                            <button type="button" onClick={() => handleSort('rateType')} className="flags-review-item" style={{ fontWeight: compTableSortField === 'rateType' ? 800 : 600 }}>
                              Rate Type {compTableSortField === 'rateType' && (compTableSortOrder === 'asc' ? '(↑)' : '(↓)')}
                            </button>
                            <button type="button" onClick={() => handleSort('rate')} className="flags-review-item" style={{ fontWeight: compTableSortField === 'rate' ? 800 : 600 }}>
                              Rate {compTableSortField === 'rate' && (compTableSortOrder === 'asc' ? '(↑)' : '(↓)')}
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    <div style={{ position: 'relative' }}>
                      <button type="button" onClick={() => setCompTableShowExportMenu(v => !v)} className="payroll-pill-btn payroll-pill-btn--outline">
                        <Download size={13} /> Export
                        <ChevronDown size={13} />
                      </button>
                      {compTableShowExportMenu && (
                        <>
                          <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setCompTableShowExportMenu(false)} />
                          <div style={{ position: 'absolute', right: 0, marginTop: '4px', width: '120px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', boxShadow: '0 12px 32px rgba(0,0,0,0.16)', borderRadius: '8px', zIndex: 20, padding: '4px' }}>
                            <button type="button" onClick={() => { exportCompCSV(); setCompTableShowExportMenu(false); }} className="flags-review-item">CSV</button>
                            <button type="button" onClick={() => { exportCompJSON(); setCompTableShowExportMenu(false); }} className="flags-review-item">JSON</button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--card-bg)', overflow: 'hidden', position: 'relative' }}>
                    <div style={{ overflowX: 'auto' }}>
                      <div style={{ minWidth: '900px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: gridCols, alignItems: 'center', padding: '10px 12px', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--charcoal-light)', background: 'var(--card-bg-hover)', borderBottom: '1px solid var(--border-color)' }}>
                          <div style={{ display: 'flex', justifyContent: 'center' }}>
                            <input type="checkbox" style={{ cursor: 'pointer' }} checked={allOnPageSelected} onChange={toggleSelectAll} />
                          </div>
                          <div>Employee</div>
                          <div>Rate Type</div>
                          <div>Rate</div>
                          <div>Agency</div>
                          <div>Breakdown</div>
                          <div style={{ textAlign: 'right' }}>Actions</div>
                        </div>

                        {pageRows.length === 0 ? (
                          <Empty className="py-24">
                            <EmptyHeader>
                              <EmptyMedia variant="icon">
                                <Users />
                              </EmptyMedia>
                              <EmptyTitle>No Employees Found</EmptyTitle>
                              <EmptyDescription>No employees match the current filter.</EmptyDescription>
                            </EmptyHeader>
                          </Empty>
                        ) : pageRows.map(row => (
                          <div
                            key={row.emp.id}
                            style={{ display: 'grid', gridTemplateColumns: gridCols, alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid var(--border-color)', background: compTableSelected.includes(row.emp.id) ? 'var(--card-bg-hover)' : 'transparent' }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                              <input type="checkbox" style={{ cursor: 'pointer' }} checked={compTableSelected.includes(row.emp.id)} onChange={() => toggleSelect(row.emp.id)} />
                            </div>
                            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                              <span className="font-bold text-primary" style={{ fontSize: '13px' }}>{row.emp.full_name}</span>
                              <span className="font-mono text-xs text-muted">{row.emp.driver_id}</span>
                            </div>
                            <div>
                              <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, background: row.isFixedRate ? 'rgba(139,92,246,0.1)' : 'rgba(59,130,246,0.1)', color: row.isFixedRate ? '#8B5CF6' : '#3B82F6' }}>
                                {row.isFixedRate ? 'Fixed Shift' : 'Hourly'}
                              </span>
                            </div>
                            <div className="text-sm font-bold text-primary" style={{ whiteSpace: 'nowrap' }}>
                              {row.isFixedRate ? `£${row.rateValue.toFixed(2)}/shift` : `£${row.rateValue.toFixed(2)}/hr`}
                            </div>
                            <div className="text-sm text-muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.agency}</div>
                            <div className="text-xs text-muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rateBreakdown(row)}</div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px' }}>
                              <button
                                type="button"
                                onClick={() => openEditor(row)}
                                className="text-xs font-bold"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand-red)', padding: 0 }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => setCompTableDetailId(row.emp.id)}
                                aria-label={`View ${row.emp.full_name}`}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--charcoal-light)', fontSize: '16px', lineHeight: 1, padding: '4px' }}
                              >
                                ⋯
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {detailRow && (
                      <div
                        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}
                        onClick={() => setCompTableDetailId(null)}
                      >
                        <div
                          style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '24px', margin: '0 24px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)', position: 'relative', maxWidth: '380px', width: '100%' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => setCompTableDetailId(null)}
                            style={{ position: 'absolute', top: '12px', right: '12px', width: '24px', height: '24px', borderRadius: '999px', background: 'var(--card-bg-hover)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <X size={13} style={{ color: 'var(--charcoal-light)' }} />
                          </button>

                          <h3 className="text-lg font-black text-primary" style={{ margin: 0 }}>{detailRow.emp.full_name}</h3>
                          <span style={{ display: 'inline-block', marginTop: '6px', padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, background: detailRow.isFixedRate ? 'rgba(139,92,246,0.1)' : 'rgba(59,130,246,0.1)', color: detailRow.isFixedRate ? '#8B5CF6' : '#3B82F6' }}>
                            {detailRow.isFixedRate ? 'Fixed Shift' : 'Hourly'}
                          </span>

                          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div>
                              <p className="text-xs text-muted uppercase" style={{ letterSpacing: '0.06em', margin: '0 0 2px' }}>Employee ID</p>
                              <p className="text-sm font-bold text-primary" style={{ margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>{detailRow.emp.driver_id}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted uppercase" style={{ letterSpacing: '0.06em', margin: '0 0 2px' }}>Agency</p>
                              <p className="text-sm font-bold text-primary" style={{ margin: 0 }}>{detailRow.agency}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted uppercase" style={{ letterSpacing: '0.06em', margin: '0 0 2px' }}>Rate Breakdown</p>
                              <p className="text-sm text-muted" style={{ margin: 0 }}>{rateBreakdown(detailRow)}</p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => openEditor(detailRow)}
                            className="btn btn-primary"
                            style={{ width: '100%', marginTop: '20px', padding: '10px', borderRadius: '8px', fontWeight: 'bold' }}
                          >
                            Edit Compensation
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-16 flex items-center justify-between">
                    <span className="text-xs text-muted">
                      Page {safePage} of {totalPages} · {sortedRows.length} employee{sortedRows.length === 1 ? '' : 's'}
                    </span>
                    {totalPages > 1 && (
                      <div className="flex gap-8">
                        <button type="button" disabled={safePage === 1} onClick={() => setCompTablePage(p => Math.max(1, p - 1))} className="payroll-pill-btn payroll-pill-btn--outline" style={{ opacity: safePage === 1 ? 0.5 : 1 }}>
                          Previous
                        </button>
                        <button type="button" disabled={safePage === totalPages} onClick={() => setCompTablePage(p => Math.min(totalPages, p + 1))} className="payroll-pill-btn payroll-pill-btn--outline" style={{ opacity: safePage === totalPages ? 0.5 : 1 }}>
                          Next
                        </button>
                      </div>
                    )}
                  </div>

                  {/* The real Edit Compensation dialog — same fields, state,
                      and handleSaveRate save path as before; only its entry
                      point changed (from a per-row button to the detail
                      panel's "Edit Compensation" action). */}
                  <Dialog open={!!editingRateDriverId} onOpenChange={(open) => { if (!open) setEditingRateDriverId(null); }}>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Edit Compensation</DialogTitle>
                        <DialogDescription>
                          Set the rate structure and agency for <span className="font-medium">{editingRow?.emp.full_name}</span>.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-3 text-sm">
                        <div>
                          <label className="text-xs font-bold text-muted block mb-4">Agency</label>
                          <input
                            type="text"
                            className="input-field"
                            style={{ width: '100%' }}
                            value={editAgencyName}
                            onChange={(e) => setEditAgencyName(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-muted block mb-4">Rate Type</label>
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
                          <div>
                            <label className="text-xs font-bold text-muted block mb-4">Flat Rate per Shift (£)</label>
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
                          <div className="flex gap-8">
                            <div style={{ flex: 1 }}>
                              <label className="text-xs font-bold text-muted block mb-4">Mon&ndash;Fri (£/hr)</label>
                              <input
                                type="number"
                                step="0.50"
                                className="input-field"
                                style={{ width: '100%' }}
                                value={editMonFriRate}
                                onChange={(e) => setEditMonFriRate(e.target.value)}
                              />
                            </div>
                            <div style={{ flex: 1 }}>
                              <label className="text-xs font-bold text-muted block mb-4">Saturday (£/hr)</label>
                              <input
                                type="number"
                                step="0.50"
                                className="input-field"
                                style={{ width: '100%' }}
                                value={editSatRate}
                                onChange={(e) => setEditSatRate(e.target.value)}
                              />
                            </div>
                            <div style={{ flex: 1 }}>
                              <label className="text-xs font-bold text-muted block mb-4">Sunday (£/hr)</label>
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
                      </div>
                      <DialogFooter>
                        <PricingButton variant="outline" onClick={() => setEditingRateDriverId(null)}>
                          Cancel
                        </PricingButton>
                        <PricingButton onClick={() => editingRateDriverId && handleSaveRate(editingRateDriverId)}>
                          Save Changes
                        </PricingButton>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </>
              );
            })()}
            </>
            )}

            {ratesSubView === 'calculator' && (
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
                  <h2 className="text-xl font-black text-primary m-0">Earnings</h2>
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
                              liveHours
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
                                <div className="font-bold text-primary">
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <span>{shift.driver_name}</span>
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
                                          <span style={{ fontSize: '13px', fontWeight: '600' }}>
                                            {startDateStr} <span style={{ fontWeight: 'normal', color: 'var(--charcoal-light)' }}>{startTimeStr}</span>
                                          </span>
                                          <span style={{ fontSize: '13px', fontWeight: '600' }}>
                                            {endDateStr} <span style={{ fontWeight: 'normal', color: 'var(--charcoal-light)' }}>{endTimeStr}</span>
                                          </span>
                                        </div>
                                      );
                                    } else {
                                      // Single-day format rendering
                                      return (
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                          <span style={{ fontWeight: 'bold' }}>{startDateStr}</span>
                                          <span className="text-xs text-muted">{startTimeStr} - {endTimeStr}</span>
                                        </div>
                                      );
                                    }
                                  })()}
                                </div>
                                <div>
                                  {shift.end_time ? (
                                    `${(shift.total_hours || 0).toFixed(2)} hrs`
                                  ) : isStaleOrphan ? (
                                    <span className="font-bold" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--brand-red)' }}>
                                      <span style={{ width: '6px', height: '6px', backgroundColor: 'var(--brand-red)', borderRadius: '50%', display: 'inline-block' }}></span>
                                      {liveHours.toFixed(2)} hrs (stuck)
                                    </span>
                                  ) : (
                                    <span className="text-success font-bold" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <span style={{ width: '6px', height: '6px', backgroundColor: '#2E7D32', borderRadius: '50%', display: 'inline-block', boxShadow: '0 0 6px rgba(46, 125, 50, 0.6)' }}></span>
                                      {liveHours.toFixed(2)} hrs
                                    </span>
                                  )}
                                </div>
                                <div className="font-semibold">
                                  {isFixedRate ? (
                                    <span style={{ fontWeight: 'bold', color: 'var(--charcoal)' }}>
                                      £{startRateVal.toFixed(2)} <span style={{ fontSize: '11px', fontWeight: 'normal', color: 'var(--charcoal-light)' }}>(Fixed/Shift)</span>
                                    </span>
                                  ) : startDay !== endDay && startRateVal !== endRateVal ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                       <span style={{ fontSize: '13px' }}>£{startRateVal.toFixed(2)}/hr</span>
                                       <span style={{ fontSize: '11px', color: 'var(--charcoal-light)' }}>→ £{endRateVal.toFixed(2)}/hr</span>
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
                                        Number(shift.night_out_allowance ?? shift.night_out_amount ?? 0)
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
                                <div className="font-bold text-success" style={{ textAlign: 'right' }}>
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
            )}
          </div>
        )}

        {activeTab === 'analytics' && userRole === 'payroll_admin' && (() => {
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
          const PERIOD_WEEKS: Record<string, number | null> = {
            'Last 4 weeks': 4, 'Last 8 weeks': 8, 'Last 12 weeks': 12, 'All time': null,
          };
          const periodFilterOptions: FilterOption[] = Object.keys(PERIOD_WEEKS).map(name => ({ name }));

          // One combined, searchable list across every filterable
          // dimension — this is what AnalyticsFilterMenu searches, replacing
          // the old "pick a type, then pick a value" two-step menu.
          const searchFilterOptions: FilterMenuOption[] = [
            ...driverFilterOptions.map(o => ({ type: FilterType.DRIVER, name: o.name, icon: <IdCard size={12} /> })),
            ...agencyFilterOptions.map(o => ({ type: FilterType.AGENCY, name: o.name, icon: <Building2 size={12} /> })),
            ...depotFilterOptions.map(o => ({ type: FilterType.DEPOT, name: o.name, icon: <Warehouse size={12} /> })),
            ...periodFilterOptions.map(o => ({ type: FilterType.PERIOD, name: o.name, icon: <Calendar size={12} /> })),
          ];
          // Period is single-select (replacing the active window, or
          // clearing it on a second click of the same one); every other
          // type toggles a value in/out of its filter's multi-select list.
          const handleSearchFilterSelect = (type: FilterType, name: string) => {
            setAnalyticsFilters(prev => {
              const existing = prev.find(f => f.type === type);
              if (type === FilterType.PERIOD) {
                if (existing?.value[0] === name) {
                  return prev.map(f => (f.id === existing.id ? { ...f, value: [] } : f));
                }
                if (existing) return prev.map(f => (f.id === existing.id ? { ...f, value: [name] } : f));
                return [...prev, { id: crypto.randomUUID(), type, operator: FilterOperator.IS, value: [name] }];
              }
              if (!existing) {
                return [...prev, { id: crypto.randomUUID(), type, operator: FilterOperator.IS, value: [name] }];
              }
              const nextValue = existing.value.includes(name)
                ? existing.value.filter(v => v !== name)
                : [...existing.value, name];
              return prev.map(f => (f.id === existing.id ? { ...f, value: nextValue } : f));
            });
          };

          const driverFilter = analyticsFilters.find(f => f.type === FilterType.DRIVER && f.value.length > 0);
          const agencyFilter = analyticsFilters.find(f => f.type === FilterType.AGENCY && f.value.length > 0);
          const depotFilter = analyticsFilters.find(f => f.type === FilterType.DEPOT && f.value.length > 0);
          const periodFilter = analyticsFilters.find(f => f.type === FilterType.PERIOD && f.value.length > 0);
          const periodWeeks = periodFilter ? PERIOD_WEEKS[periodFilter.value[0]] ?? null : null;
          const periodCutoff = periodWeeks ? Date.now() - periodWeeks * 7 * 24 * 60 * 60 * 1000 : null;

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
          const completedShiftsForAnalytics = shifts.filter(s => s.status === 'completed' && matchesShiftFilters(s));

          // Profitability Cockpit — one unified view of company revenue vs.
          // driver cost. Every figure here (the KPI strip, the chart, and
          // the ledger's Net Margin column) is computed only over shifts
          // that actually have a revenue figure set (shiftsWithRevenue) —
          // a batch of un-rated loads can't silently drag the reported
          // margin toward zero, and Revenue − Cost = Profit holds exactly,
          // every time, instead of mixing totals from different shift
          // sets. Un-rated shifts still appear in the ledger below,
          // flagged "Rate Pending", and flow into these totals the moment
          // a dispatcher sets their rate.
          const shiftsWithRevenue = completedShiftsForAnalytics.filter(s => s.revenue_amount !== null && s.revenue_amount !== undefined);
          const pendingRevenueCount = completedShiftsForAnalytics.length - shiftsWithRevenue.length;

          const totalRevenue = shiftsWithRevenue.reduce((sum, s) => sum + (s.revenue_amount || 0), 0);
          const totalDriverCost = shiftsWithRevenue.reduce((sum, s) => sum + (s.total_pay || 0), 0);
          const netProfit = totalRevenue - totalDriverCost;
          const netMarginPct = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : null;
          const totalHours = shiftsWithRevenue.reduce((sum, s) => sum + (s.total_hours || 0), 0);

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
          const prevProfit = prevRevenue - prevCost;
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
          const KPI_GOOD_DIRECTION: Record<'revenue' | 'cost' | 'profit' | 'margin' | 'hours', BadgeDeltaDirection | null> = {
            revenue: 'up', cost: 'down', profit: 'up', margin: 'up', hours: null,
          };
          const kpiDeltaTone = (direction: BadgeDeltaDirection, key: keyof typeof KPI_GOOD_DIRECTION): BadgeDeltaTone => {
            const good = KPI_GOOD_DIRECTION[key];
            if (good === null || direction === 'flat') return 'neutral';
            return direction === good ? 'positive' : 'negative';
          };
          const kpiDeltas: Record<'revenue' | 'cost' | 'profit' | 'margin' | 'hours', { direction: BadgeDeltaDirection; label: string } | null> = {
            revenue: computeKpiDelta(totalRevenue, prevRevenue),
            cost: computeKpiDelta(totalDriverCost, prevCost),
            profit: computeKpiDelta(netProfit, prevProfit),
            margin: computeKpiDelta(netMarginPct, prevMargin, true),
            hours: computeKpiDelta(totalHours, prevHours),
          };

          // Five KPIs, each clickable — the one selected picks what the bar
          // chart plots per day and what the donut breaks down by driver.
          // Margin isn't additive (it's a ratio, not a sum), so it drives
          // the bar chart same as the others but the donut explicitly
          // skips it rather than draw a fabricated per-driver split.
          const kpiConfig: Array<{
            key: 'revenue' | 'cost' | 'profit' | 'margin' | 'hours';
            label: string;
            color: string;
            value: number | null;
            format: (v: number) => string;
          }> = [
            // Load Revenue uses the theme's own "ink" tone rather than a
            // fixed dark literal — a near-black bar reads fine on the
            // light theme's white card but nearly disappears against the
            // dark theme's own near-black card. var(--charcoal) is dark
            // ink in light mode and light ink in dark mode, so the bar
            // stays high-contrast against its own card in both.
            { key: 'revenue', label: 'Load Revenue', color: 'var(--charcoal)', value: totalRevenue, format: (v) => `£${v.toLocaleString('en-GB', { maximumFractionDigits: 0 })}` },
            { key: 'cost', label: 'Driver Cost', color: '#CC0000', value: totalDriverCost, format: (v) => `£${v.toLocaleString('en-GB', { maximumFractionDigits: 0 })}` },
            { key: 'profit', label: 'Net Profit', color: '#10B981', value: netProfit, format: (v) => `£${v.toLocaleString('en-GB', { maximumFractionDigits: 0 })}` },
            { key: 'margin', label: 'Net Margin', color: '#3B82F6', value: netMarginPct, format: (v) => `${v.toFixed(1)}%` },
            { key: 'hours', label: 'Total Hours', color: '#8B5CF6', value: totalHours, format: (v) => `${v.toFixed(0)} hrs` },
          ];

          // Daily bars, oldest first — grouped by calendar date rather than
          // ISO week, so even a short period shows real day-by-day movement
          // instead of being averaged into one bar. Carries every metric so
          // switching the selected KPI just changes which field the chart
          // reads, not how the data is built.
          const dayTotals = new Map<string, { date: Date; revenue: number; cost: number; hours: number }>();
          shiftsWithRevenue.forEach(s => {
            const d = new Date(s.start_time);
            const key = d.toISOString().slice(0, 10);
            const existing = dayTotals.get(key);
            dayTotals.set(key, {
              date: existing?.date ?? d,
              revenue: (existing?.revenue ?? 0) + (s.revenue_amount || 0),
              cost: (existing?.cost ?? 0) + (s.total_pay || 0),
              hours: (existing?.hours ?? 0) + (s.total_hours || 0),
            });
          });
          const dailySeries = Array.from(dayTotals.values())
            .sort((a, b) => a.date.getTime() - b.date.getTime())
            .map(d => ({
              label: d.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
              dayLetter: d.date.toLocaleDateString('en-GB', { weekday: 'short' }),
              revenue: Math.round(d.revenue * 100) / 100,
              cost: Math.round(d.cost * 100) / 100,
              profit: Math.round((d.revenue - d.cost) * 100) / 100,
              hours: Math.round(d.hours * 100) / 100,
              margin: d.revenue > 0 ? ((d.revenue - d.cost) / d.revenue) * 100 : 0,
            }));

          // Performance mini chart beside the Breakdown card — same real
          // per-day margin figures as the main chart. Padded out to a full Mon–Sun
          // week with placeholder sample values wherever a day has no real
          // shift yet, at the user's explicit request to preview the full
          // 7-day layout before enough real days exist. Any day that DOES
          // have real data keeps its real figure — placeholders never
          // overwrite a real one. Swap this back to `dailySeries` alone
          // (dropping the placeholder branch) once real usage covers most
          // of a week.
          const WEEKDAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
          const PLACEHOLDER_MARGIN_BY_WEEKDAY: Record<string, number> = {
            Mon: 45.0, Tue: 62.5, Wed: -8.5, Thu: 70.0, Fri: 55.0, Sat: 66.9, Sun: 38.0,
          };
          const realByWeekday = new Map(dailySeries.slice(-7).map(d => [d.dayLetter, d]));
          const marginTrendData = WEEKDAY_ORDER.map(weekday => {
            const real = realByWeekday.get(weekday);
            return real
              ? { label: weekday, value: Math.round(real.margin * 10) / 10, tooltipLabel: `${real.label} (real)` }
              : { label: weekday, value: PLACEHOLDER_MARGIN_BY_WEEKDAY[weekday], tooltipLabel: `${weekday} (sample)` };
          });

          // Same selected metric, broken down by driver instead of by day —
          // "who's contributing" alongside the chart's "when it happened".
          const driverTotals = new Map<string, { revenue: number; cost: number; hours: number }>();
          shiftsWithRevenue.forEach(s => {
            const name = s.driver_name || 'Unknown';
            const existing = driverTotals.get(name);
            driverTotals.set(name, {
              revenue: (existing?.revenue ?? 0) + (s.revenue_amount || 0),
              cost: (existing?.cost ?? 0) + (s.total_pay || 0),
              hours: (existing?.hours ?? 0) + (s.total_hours || 0),
            });
          });

          // Deeper Analytics — Driver Profitability Leaderboard. Reuses
          // driverTotals (already the real per-driver revenue/cost/hours
          // for the filtered period) rather than recomputing it, and ranks
          // by margin — the donut above answers "who's contributing the
          // most £", this answers "who's most profitable per £ and per
          // hour", a different, genuinely additional question.
          const driverLeaderboard = Array.from(driverTotals.entries())
            .map(([name, t]) => {
              const profit = t.revenue - t.cost;
              return {
                name,
                revenue: t.revenue,
                profit,
                marginPct: t.revenue > 0 ? (profit / t.revenue) * 100 : null,
                profitPerHour: t.hours > 0 ? profit / t.hours : null,
              };
            })
            .sort((a, b) => (b.marginPct ?? -Infinity) - (a.marginPct ?? -Infinity));

          // Deeper Analytics — Depot Comparison. Deliberately ignores the
          // active Depot filter (skipDepot) — a "compare sites" view is
          // meaningless once narrowed to one site — but still respects
          // Driver/Agency/Period, so it answers "of the drivers/agencies/
          // period I'm looking at, which depot is performing best".
          const depotCompareShifts = shifts.filter(s =>
            s.status === 'completed' &&
            matchesNonPeriodFilters(s, { skipDepot: true }) &&
            (!periodCutoff || new Date(s.start_time).getTime() >= periodCutoff) &&
            s.revenue_amount !== null && s.revenue_amount !== undefined,
          );
          const depotTotals = new Map<string, { revenue: number; cost: number; hours: number; shiftCount: number }>();
          depotCompareShifts.forEach(s => {
            const name = s.depot_name || 'Unassigned';
            const existing = depotTotals.get(name);
            depotTotals.set(name, {
              revenue: (existing?.revenue ?? 0) + (s.revenue_amount || 0),
              cost: (existing?.cost ?? 0) + (s.total_pay || 0),
              hours: (existing?.hours ?? 0) + (s.total_hours || 0),
              shiftCount: (existing?.shiftCount ?? 0) + 1,
            });
          });
          const depotComparison = Array.from(depotTotals.entries())
            .map(([name, t]) => {
              const profit = t.revenue - t.cost;
              return { name, revenue: t.revenue, profit, shiftCount: t.shiftCount, marginPct: t.revenue > 0 ? (profit / t.revenue) * 100 : null };
            })
            .sort((a, b) => (b.marginPct ?? -Infinity) - (a.marginPct ?? -Infinity));

          // Shift Revenue — every completed shift in the filtered period
          // (not just rated ones). Default sort is most recent first;
          // clicking the Net Margin header switches to lowest margin first
          // so problem loads surface immediately. Rate-Pending rows (no
          // margin yet) always sort to the bottom in margin mode — an
          // unrated load isn't "low margin", it's unknown, and shouldn't
          // be conflated with a real loss.
          const loadRevenueRowsAll = [...completedShiftsForAnalytics].sort((a, b) => {
            if (ledgerSort === 'date') return new Date(b.start_time).getTime() - new Date(a.start_time).getTime();
            const marginA = a.revenue_amount === null || a.revenue_amount === undefined ? null : a.revenue_amount - (a.total_pay || 0);
            const marginB = b.revenue_amount === null || b.revenue_amount === undefined ? null : b.revenue_amount - (b.total_pay || 0);
            if (marginA === null && marginB === null) return 0;
            if (marginA === null) return 1;
            if (marginB === null) return -1;
            return marginA - marginB;
          });
          const loadRevenueRows = showPendingOnly
            ? loadRevenueRowsAll.filter(s => s.revenue_amount === null || s.revenue_amount === undefined)
            : loadRevenueRowsAll;

          const exportLedgerCsv = () => {
            const rows = loadRevenueRowsAll.map(s => {
              const isPending = s.revenue_amount === null || s.revenue_amount === undefined;
              const margin = isPending ? null : (s.revenue_amount as number) - (s.total_pay || 0);
              return {
                Date: new Date(s.start_time).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
                Driver: s.driver_name ?? '',
                'Base/Depot': s.depot_name ?? '',
                'Duration (hrs)': (s.total_hours ?? 0).toFixed(1),
                'Driver Pay (£)': (s.total_pay ?? 0).toFixed(2),
                'Load Revenue (£)': isPending ? 'Rate Pending' : (s.revenue_amount as number).toFixed(2),
                'Net Margin (£)': margin === null ? '' : margin.toFixed(2),
              };
            });
            const csv = Papa.unparse(rows);
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `shift-revenue-${new Date().toISOString().slice(0, 10)}.csv`;
            link.click();
            URL.revokeObjectURL(url);
          };

          return (
            <>
            <div className="analytics-container">
              <div className="mb-16 text-center">
                <TextRevealHeader text="PROFITABILITY & PAYROLL" className="text-xl font-black text-primary justify-center" />
                <p className="text-xs font-medium text-muted mt-4">
                  Operational margin, gross payroll, and shift revenue performance.
                </p>
              </div>

              <div className="mb-16 flex items-center" style={{ gap: '10px', flexWrap: 'wrap' }}>
                <FilterBar
                  filters={analyticsFilters}
                  setFilters={setAnalyticsFilters}
                  // The "+ Filter" add-trigger is hidden — AnalyticsFilterMenu
                  // below is the sole way to add any filter now, across all
                  // four types at once (plus the chart-type toggle).
                  // filterViewOptions is unused while it's hidden but stays
                  // typed; filterOptionsByType/typeIcons are still needed so
                  // an active chip (of any type) still renders and removes
                  // the normal way.
                  filterViewOptions={[]}
                  showAddFilterButton={false}
                  filterOptionsByType={{
                    [FilterType.DRIVER]: driverFilterOptions,
                    [FilterType.AGENCY]: agencyFilterOptions,
                    [FilterType.DEPOT]: depotFilterOptions,
                    [FilterType.PERIOD]: periodFilterOptions,
                  }}
                  typeIcons={{
                    [FilterType.DRIVER]: <IdCard className="size-3.5" />,
                    [FilterType.AGENCY]: <Building2 className="size-3.5" />,
                    [FilterType.DEPOT]: <Warehouse className="size-3.5" />,
                    [FilterType.PERIOD]: <Calendar className="size-3.5" />,
                  }}
                />
                <AnalyticsFilterMenu
                  options={searchFilterOptions}
                  activeCount={analyticsFilters.filter(f => f.value.length > 0).length}
                  isSelected={(type, name) => analyticsFilters.find(f => f.type === type)?.value.includes(name) ?? false}
                  onSelect={(type, name) => handleSearchFilterSelect(type as FilterType, name)}
                  chartType={analyticsChartType}
                  onChartTypeChange={setAnalyticsChartType}
                />
              </div>
            </div>

            {/* Load Revenue Breakdown keeps its own analytics-container
                (same 1152px cap, unaffected) but now shares a row with
                the Net Margin Trend mini chart in the space that used to
                sit empty next to it on a wide screen. */}
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div className="analytics-container" style={{ flex: '0 1 1152px' }}>
              <RevealOnMount index={0} className="analytics-chart-card">
                <div className="flex items-center justify-between mb-16" style={{ flexWrap: 'wrap', gap: '8px' }}>
                  <TextRevealHeader text="REVENUE VS COST OVERVIEW" className="text-xs font-bold text-muted uppercase" style={{ letterSpacing: '0.12em' }} />
                  <span className="text-xs font-medium text-muted">Filtered period: {periodFilter ? periodFilter.value[0] : 'All time'}</span>
                  {pendingRevenueCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowPendingOnly(true)}
                      className="text-xs font-bold"
                      style={{ backgroundColor: '#FEF3C7', color: '#92400E', padding: '4px 10px', borderRadius: '999px', border: 'none', cursor: 'pointer' }}
                    >
                      {pendingRevenueCount} shift{pendingRevenueCount === 1 ? '' : 's'} awaiting a rate — jump to them ↓
                    </button>
                  )}
                </div>

                <div className="cockpit-kpi-strip mb-16">
                  {kpiConfig.map(kpi => {
                    const isActive = kpi.key === selectedKpi;
                    const delta = kpiDeltas[kpi.key];
                    return (
                      <button
                        key={kpi.key}
                        type="button"
                        onClick={() => setSelectedKpi(kpi.key)}
                        className={`cockpit-kpi-tile ${isActive ? 'cockpit-kpi-tile--active' : ''}`}
                      >
                        <p className="analytics-kpi-label" style={{ margin: 0 }}>{kpi.label}</p>
                        <p className="analytics-kpi-value" style={{ fontSize: '18px', color: isActive ? kpi.color : undefined }}>
                          {kpi.value === null ? '—' : kpi.format(kpi.value)}
                        </p>
                        {delta && (
                          <div style={{ marginTop: '6px' }}>
                            <BadgeDelta label={delta.label} direction={delta.direction} tone={kpiDeltaTone(delta.direction, kpi.key)} />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Load Revenue vs Driver Cost, per day — replaces the
                    single-metric chart + "by driver" donut. The donut was
                    redundant with the driver breakdown already listed
                    elsewhere, and a direct revenue-vs-cost comparison is
                    more useful here than a per-KPI single series. Bar
                    chart now takes the full card width up to the
                    Performance card beside it (untouched). */}
                <div className="flex items-center" style={{ gap: '18px', marginBottom: '14px' }}>
                  <span className="flex items-center text-xs font-bold text-muted" style={{ gap: '6px' }}>
                    <span style={{ width: '9px', height: '9px', borderRadius: '2px', background: '#0F172A', display: 'inline-block' }} />
                    Load Revenue
                  </span>
                  <span className="flex items-center text-xs font-bold text-muted" style={{ gap: '6px' }}>
                    <span style={{ width: '9px', height: '9px', borderRadius: '2px', background: '#CC0000', display: 'inline-block' }} />
                    Driver Cost
                  </span>
                </div>
                <AnalyticsGroupedBarChart
                  data={dailySeries.map(d => ({ label: d.label, revenue: d.revenue, cost: d.cost }))}
                  revenueColor="#0F172A"
                  costColor="#CC0000"
                />
              </RevealOnMount>
            </div>

            {marginTrendData.length > 0 && (
              <div style={{ flex: '0 0 auto', display: 'flex', justifyContent: 'center' }}>
                <MiniChart
                  title="Performance"
                  data={marginTrendData}
                  unit="%"
                  formatValue={(v) => (v >= 0 ? '+' : '') + v.toFixed(1)}
                />
              </div>
            )}
            </div>

            {/* Shift Revenue deliberately breaks out of .analytics-container's
                1152px cap — it's the one card that benefits from the full
                width the main content pane actually has available, so it
                gets its own wider wrapper instead of widening the shared
                container (which would also stretch Load Revenue Breakdown
                and Deeper Analytics). */}
            <div className="mt-16" style={{ maxWidth: '1600px', width: '100%' }}>
              <RevealOnMount index={1} className="analytics-chart-card">
                <div className="flex items-center justify-between mb-16" style={{ flexWrap: 'wrap', gap: '8px' }}>
                  <p className="text-xs font-bold text-muted uppercase" style={{ letterSpacing: '0.12em', margin: 0 }}>Shift Revenue</p>
                  <button
                    type="button"
                    onClick={() => { exportLedgerCsv(); flashExported('ledger'); }}
                    disabled={loadRevenueRowsAll.length === 0}
                    className="flex items-center text-xs font-bold"
                    style={{ gap: '6px', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--charcoal)', cursor: loadRevenueRowsAll.length === 0 ? 'default' : 'pointer', opacity: loadRevenueRowsAll.length === 0 ? 0.5 : 1 }}
                  >
                    <DownloadIcon done={justExported === 'ledger'} />
                    Export CSV
                  </button>
                </div>

                {showPendingOnly && (
                  <div className="flex items-center justify-between mb-16" style={{ backgroundColor: '#FEF3C7', borderRadius: '8px', padding: '6px 12px' }}>
                    <span className="text-xs font-bold" style={{ color: '#92400E' }}>Showing only shifts awaiting a rate</span>
                    <button
                      type="button"
                      onClick={() => setShowPendingOnly(false)}
                      className="text-xs font-bold"
                      style={{ color: '#92400E', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer' }}
                    >
                      Show all
                    </button>
                  </div>
                )}

                {revenueSaveError && <div className="login-notice login-notice--error mb-16">{revenueSaveError}</div>}

                {loadRevenueRows.length === 0 ? (
                  <Empty className="py-24">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <PoundSterling />
                      </EmptyMedia>
                      <EmptyTitle>{showPendingOnly ? 'No Shifts Awaiting a Rate' : 'No Completed Shifts Yet'}</EmptyTitle>
                      <EmptyDescription>
                        {showPendingOnly ? 'Every rated shift in this period already has a load revenue figure.' : 'Completed shifts in this period will show up here once they exist.'}
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
                          <th>Base/Depot</th>
                          <th>Duration</th>
                          <th>Driver Pay</th>
                          <th>Load Revenue</th>
                          <th>
                            <button
                              type="button"
                              onClick={() => setLedgerSort(prev => (prev === 'margin' ? 'date' : 'margin'))}
                              className="flex items-center"
                              style={{ gap: '4px', background: 'none', border: 'none', padding: 0, font: 'inherit', color: ledgerSort === 'margin' ? 'var(--brand-red)' : 'inherit', cursor: 'pointer' }}
                              title={ledgerSort === 'margin' ? 'Sorted lowest margin first — click to sort by date' : 'Click to sort lowest margin first'}
                            >
                              Net Margin
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
                          const shiftMargin = isPending ? null : (s.revenue_amount as number) - (s.total_pay || 0);

                          const setRevenueField = (value: string) => {
                            setRevenueEdits(prev => ({
                              ...prev,
                              [s.id]: {
                                revenue: value,
                                // Load ref isn't shown in this ledger, but is
                                // preserved unchanged on save rather than
                                // silently cleared.
                                loadRef: prev[s.id]?.loadRef ?? (s.load_reference ?? ''),
                              },
                            }));
                          };

                          return (
                            <tr key={s.id}>
                              <td className="whitespace-nowrap">{new Date(s.start_time).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</td>
                              <td>{s.driver_name}</td>
                              <td>{s.depot_name || '—'}</td>
                              <td className="whitespace-nowrap">{(s.total_hours ?? 0).toFixed(1)}h</td>
                              <td className="text-sm text-muted whitespace-nowrap">£{(s.total_pay ?? 0).toFixed(2)}</td>
                              <td>
                                <div className="flex items-center gap-4">
                                  <span className="text-sm text-muted">£</span>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    className="input-field"
                                    style={{ padding: '8px 12px', fontSize: '14px', fontWeight: 700, width: '130px' }}
                                    placeholder="0.00"
                                    value={revenueValue}
                                    disabled={savingRevenueShiftId === s.id}
                                    onChange={(e) => setRevenueField(e.target.value)}
                                    onBlur={() => { if (revenueEdits[s.id]) handleSaveRevenue(s.id); }}
                                  />
                                  {savingRevenueShiftId === s.id ? (
                                    <span className="text-xs text-muted whitespace-nowrap">Saving…</span>
                                  ) : isPending && !edit ? (
                                    <span className="text-xs font-bold whitespace-nowrap" style={{ color: '#92400E', backgroundColor: '#FEF3C7', padding: '2px 8px', borderRadius: '999px' }}>
                                      Rate Pending
                                    </span>
                                  ) : null}
                                </div>
                              </td>
                              <td
                                className="text-sm font-bold whitespace-nowrap"
                                style={{ color: shiftMargin === null ? 'var(--charcoal-light)' : shiftMargin >= 0 ? '#10B981' : '#DC2626' }}
                              >
                                {shiftMargin === null ? '—' : `£${shiftMargin.toFixed(2)}`}
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

            <div className="analytics-container mt-16">
              <RevealOnMount index={2} className="analytics-chart-card">
                <TextRevealHeader text="PERFORMANCE BENCHMARKS" className="text-xs font-bold text-muted uppercase" style={{ letterSpacing: '0.12em', marginBottom: '4px' }} />
                <p className="text-xs font-medium text-muted mb-16">
                  Driver margin contribution and depot yield analysis.
                </p>

                {/* Side by side now that this card has the full row to
                    itself (it used to share the row with the Ledger, which
                    forced these two tables to stack instead). */}
                <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div style={{ flex: '1 1 340px', minWidth: 0 }}>
                    <p className="text-xs font-bold text-muted uppercase" style={{ letterSpacing: '0.1em', marginBottom: '4px' }}>Driver Profitability</p>
                    {driverLeaderboard.length === 0 ? (
                      <Empty className="py-16">
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <Users />
                          </EmptyMedia>
                          <EmptyTitle>No Rated Loads Yet</EmptyTitle>
                          <EmptyDescription>Driver profitability will rank here once loads in this period have a rate set.</EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    ) : (
                      <>
                        {driverLeaderboard.length >= 2 && (
                          <p className="text-xs text-muted" style={{ marginBottom: '8px' }}>
                            Best margin: <span className="font-bold text-primary">{driverLeaderboard[0].name}</span> ({driverLeaderboard[0].marginPct === null ? '—' : `${driverLeaderboard[0].marginPct.toFixed(1)}%`}) · Lowest: <span className="font-bold text-primary">{driverLeaderboard[driverLeaderboard.length - 1].name}</span> ({driverLeaderboard[driverLeaderboard.length - 1].marginPct === null ? '—' : `${driverLeaderboard[driverLeaderboard.length - 1].marginPct!.toFixed(1)}%`})
                          </p>
                        )}
                        <div className="table-container">
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th>Driver</th>
                                <th>Net Margin</th>
                                <th>Profit/hr</th>
                                <th>Net Profit</th>
                              </tr>
                            </thead>
                            <tbody>
                              {driverLeaderboard.map(d => (
                                <tr key={d.name}>
                                  <td>{d.name}</td>
                                  <td className="font-bold whitespace-nowrap" style={{ color: d.marginPct === null ? 'var(--charcoal-light)' : d.marginPct >= 0 ? '#10B981' : '#DC2626' }}>
                                    {d.marginPct === null ? '—' : `${d.marginPct.toFixed(1)}%`}
                                  </td>
                                  <td className="text-sm text-muted whitespace-nowrap">{d.profitPerHour === null ? '—' : `£${d.profitPerHour.toFixed(2)}`}</td>
                                  <td className="text-sm whitespace-nowrap">£{d.profit.toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>

                  <div style={{ flex: '1 1 340px', minWidth: 0, borderLeft: '1px solid var(--border-color)', paddingLeft: '24px' }}>
                    <p className="text-xs font-bold text-muted uppercase" style={{ letterSpacing: '0.1em', marginBottom: '4px' }}>Depot Comparison</p>
                    {depotComparison.length === 0 ? (
                      <Empty className="py-16">
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <Warehouse />
                          </EmptyMedia>
                          <EmptyTitle>No Rated Loads Yet</EmptyTitle>
                          <EmptyDescription>Depot comparison will appear here once loads in this period have a rate set.</EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    ) : depotComparison.length < 2 ? (
                      <p className="text-sm text-muted">
                        Single active depot recorded. Multi-depot comparison requires 2+ active operating sites.
                      </p>
                    ) : (
                      <div className="table-container">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Depot</th>
                              <th>Shifts</th>
                              <th>Net Margin</th>
                              <th>Net Profit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {depotComparison.map(d => (
                              <tr key={d.name}>
                                <td>{d.name}</td>
                                <td className="text-sm text-muted">{d.shiftCount}</td>
                                <td className="font-bold whitespace-nowrap" style={{ color: d.marginPct === null ? 'var(--charcoal-light)' : d.marginPct >= 0 ? '#10B981' : '#DC2626' }}>
                                  {d.marginPct === null ? '—' : `${d.marginPct.toFixed(1)}%`}
                                </td>
                                <td className="text-sm whitespace-nowrap">£{d.profit.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </RevealOnMount>
            </div>
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

      {/* Unified Edit Payroll Modal (N/O & Extras) */}
      {actionModal && actionModal.isOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="modal-content glass-panel" style={{ width: '450px', padding: '28px', borderRadius: '16px', backgroundColor: 'var(--card-bg)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid var(--border-color)' }}>
            <h2 className="text-xl font-black text-primary mb-6" style={{ borderBottom: '2px solid #F3F4F6', paddingBottom: '12px' }}>
              Edit Payroll - {actionModal.driverName}
            </h2>
            
            <div className="form-group mb-5" style={{ marginBottom: '16px' }}>
              <label className="text-sm font-bold text-muted block mb-2" style={{ display: 'block', marginBottom: '6px' }}>🌙 Night Out Allowance (£)</label>
              <input 
                type="number" 
                className="input-field" 
                defaultValue={actionModal.currentNO}
                id="modal-no-input"
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '15px' }}
              />
            </div>

            <div className="form-group mb-5" style={{ marginBottom: '16px' }}>
              <label className="text-sm font-bold text-muted block mb-2" style={{ display: 'block', marginBottom: '6px' }}>✏️ Extras / Deductions (£)</label>
              <input 
                type="number" 
                className="input-field" 
                defaultValue={actionModal.currentExtras}
                id="modal-extras-input"
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '15px' }}
              />
              <p className="text-xs text-muted mt-1" style={{ color: '#6B7280', fontSize: '12px', marginTop: '4px' }}>Use negative numbers for deductions (e.g., -20).</p>
            </div>

            <div className="form-group mb-8" style={{ marginBottom: '24px' }}>
              <label className="text-sm font-bold text-muted block mb-2" style={{ display: 'block', marginBottom: '6px' }}>📝 Note for Extras</label>
              <input 
                type="text" 
                className="input-field" 
                defaultValue={actionModal.currentNote}
                id="modal-note-input"
                placeholder="e.g., Tolls, Damages, Bonus..."
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '15px' }}
              />
            </div>

            <div className="flex gap-12 justify-end" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => setActionModal(null)}
                style={{ padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold' }}
              >
                CANCEL
              </button>
              <button 
                className="btn btn-primary" 
                style={{ padding: '10px 20px', borderRadius: '8px', backgroundColor: '#4F46E5', color: 'white', fontWeight: 'bold' }}
                onClick={() => {
                  const noVal = parseFloat((document.getElementById('modal-no-input') as HTMLInputElement)?.value) || 0;
                  const extrasVal = parseFloat((document.getElementById('modal-extras-input') as HTMLInputElement)?.value) || 0;
                  const noteVal = (document.getElementById('modal-note-input') as HTMLInputElement)?.value || '';
                  handleSaveModalAction(noVal, extrasVal, noteVal);
                }}
              >
                💾 SAVE CHANGES
              </button>
            </div>
          </div>
        </div>
      )}
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
      {editingEmployee && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="modal-content glass-panel" style={{ width: '480px', padding: '28px', borderRadius: '16px', backgroundColor: 'var(--card-bg)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid var(--border-color)' }}>
            <div className="flex justify-between align-center mb-6" style={{ borderBottom: '2px solid var(--border-color)', paddingBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 className="text-xl font-black text-primary m-0" style={{ margin: 0, fontSize: '18px' }}>Edit Employee Profile</h2>
                <p className="text-xs text-muted mt-1" style={{ fontSize: '12px', margin: '4px 0 0 0' }}>Update details or reset login PIN for {editingEmployee.full_name}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingEmployee(null)}
                style={{ background: 'none', border: 'none', display: 'flex', cursor: 'pointer', color: 'var(--charcoal-light)' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateEmployee}>
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

              <div className="input-group mb-16">
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

              {editEmployeeError && (
                <div className="login-notice login-notice--error">⚠️ {editEmployeeError}</div>
              )}

              <div className="flex gap-12 justify-end" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingEmployee(null)}
                  disabled={isSavingEmployee}
                  style={{ padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold' }}
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSavingEmployee}
                  style={{ padding: '10px 20px', borderRadius: '8px', backgroundColor: '#2563EB', borderColor: '#2563EB', color: 'white', fontWeight: 'bold' }}
                >
                  {isSavingEmployee && <SaveIcon saving success={false} />}
                  {isSavingEmployee ? 'SAVING...' : 'SAVE CHANGES'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
