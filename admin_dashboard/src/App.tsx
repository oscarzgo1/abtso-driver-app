import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@maplibre/maplibre-gl-leaflet';
import { 
  Users,
  FileSpreadsheet, 
  Clock, 
  ShieldAlert, 
  LogOut, 
  UserPlus, 
  Download, 
  Check, 
  Volume2, 
  VolumeX,
  Compass,
  RefreshCw,
  DollarSign,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Shield,
  Bell,
  MapPinned,
  FileText,
  User,
  Briefcase,
  PoundSterling,
  ChevronUp,
  Activity,
  Search,
  X,
  ChevronDown,
  Upload,
  Wand2,
  ListChecks,
  BarChart3,
  AlertOctagon,
  Moon,
  Building2,
  Calendar,
  AlertTriangle
} from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import abtsoLogo from './assets/logo_transparent.png';

// "Remember Me" stores only the administrator's email address for prefill —
// never the password. Session persistence itself is handled by Supabase.
const REMEMBERED_EMAIL_KEY = 'admin_remembered_email';

// Placeholder fleet photo for the login branding panel.
// Swap for a self-hosted ABTSO fleet image when one is available.
const loginBrandImage =
  'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?q=80&w=1000&auto=format&fit=crop';

// L.N Haulage legal documents — same text as the driver app's Legal &
// Compliance screen (driver_app/lib/features/legal/presentation/
// legal_compliance_screen.dart). Kept in sync manually since the two apps
// don't share a content source; update both when the policy changes.
interface LegalSection {
  heading: string;
  body: string;
}

const LEGAL_DOCUMENTS: Record<'privacy' | 'contract', { title: string; sections: LegalSection[] }> = {
  privacy: {
    title: 'L.N Haulage — App Privacy Notice',
    sections: [
      {
        heading: 'Last Updated: 01 September 2026\n\n1. Introduction & Status of the Parties',
        body: 'This Privacy Notice explains how L.N Haulage ("the Company", "we", "us", or "our") collects, uses, and protects personal data when you use our logistics mobile application ("the App").\n\nThis App is strictly designed for use by independent contractors, self-employed individuals, or representatives of Limited (LTD) companies ("Contractor", "you") providing transport and logistics services to the Company under a separate Contract for Services. You are not an employee of the Company, and nothing in this App or this Privacy Notice implies an employment or worker relationship.',
      },
      {
        heading: '2. Data Controller',
        body: 'For the purposes of the UK General Data Protection Regulation (UK GDPR) and the Data Protection Act 2018, the Data Controller is:\n\n• Company Name: L.N Haulage\n\n• Registered Office: Bankwood Lane, Rossington, Doncaster, United Kingdom\n\n• Contact Email: lnhaluage@gmail.com',
      },
      {
        heading: '3. The Data We Collect About You',
        body: 'To ensure the proper functioning of the App and to facilitate the logistics services you provide, we collect and process the following categories of data:\n\n• Identity & Account Data: Full name, login credentials, and internal identification numbers. Initial passwords are created and provided by our Accounting/Logistics departments.\n\n• Location Data (GPS): Real-time geographic location data. The App transmits a GPS signal to our servers at intervals of 2 to 10 minutes exclusively while you are logged into the App. The App will not function if location permissions are disabled. The App also registers timestamps and statuses when the device goes out of network coverage.\n\n• Time & Activity Data: Timestamps of when you "Clock In" and "Clock Out". The App actively monitors physical inactivity and generates an automated alert to the Company if the device remains stationary for 50 consecutive minutes during an active session.\n\n• Device & Technical Data (BYOD): Device status, IP address, and basic diagnostics necessary for the App to function securely on your personal device.',
      },
      {
        heading: '4. Purposes and Lawful Basis for Processing',
        body: 'We process the data listed above based on the following legal grounds under UK GDPR:\n\n• Performance of a Contract (Article 6(1)(b)): Processing Time & Activity Data to calculate fees owed to you and to verify the logistics services rendered.\n\n• Legitimate Interests (Article 6(1)(f)): Processing Location Data (GPS) and Inactivity Alerts is strictly necessary for our legitimate business interests, which include: ensuring cargo safety, optimizing routing, providing delivery estimates, and preventing fraud.',
      },
      {
        heading: '5. Data Retention and Storage',
        body: '• Storage Location: All data collected through the App is encrypted and securely stored on Supabase cloud servers located in West-Europe (London, UK). This ensures full compliance with UK data sovereignty laws.\n\n• Retention Period: We retain your GPS and Time & Activity Data for a strict maximum period of 6 months from the date of collection. After this period, the data is automatically and permanently deleted or fully anonymized, unless a longer retention period is required to resolve an ongoing legal dispute or payment query.',
      },
      {
        heading: '6. Data Security and BYOD Policy',
        body: '• Internal Access Only: Your data is strictly confidential. It is not shared with any third parties. Access is restricted exclusively to authorized internal personnel within the L.N Haulage Logistics and Accounting departments on a "need-to-know" basis.\n\n• Your Device (BYOD): As an independent contractor, you use your personal mobile phone to access the App. You are solely responsible for securing your device (e.g., using PIN codes, biometric locks) against unauthorized access. L.N Haulage accepts no liability for any data breaches, losses, or damages resulting from your personal device being lost, stolen, or compromised.\n\n• Account Security: You are responsible for keeping your App login credentials confidential. Any activity logged under your account (including "Clock In/Out" times) will be treated as performed by you.',
      },
      {
        heading: '7. Your Legal Rights',
        body: 'Under the UK GDPR, you have rights including:\n\n• The right to access: You can request copies of your personal data held by us.\n\n• The right to rectification: You can request that we correct any information you believe is inaccurate (e.g., requesting a correction to a "Clock Out" time if the App failed due to network loss).\n\n• The right to object: You can object to processing based on legitimate interests; however, given the nature of the transport contract, this may result in the termination of the Contract for Services, as the App cannot function without this data.',
      },
    ],
  },
  contract: {
    title: 'Contract for Services: Logistics and App Usage Terms',
    sections: [
      {
        heading: 'Between: L.N Haulage ("The Client") and [Contractor Name/LTD Company] ("The Contractor")\n\n1. Status of the Contractor',
        body: '1.1. The Contractor is engaged as an independent business entity (self-employed or LTD company) to provide logistics and transport services to L.N Haulage.\n\n1.2. Nothing in this Agreement shall create an employer-employee relationship, worker status, partnership, or joint venture between the parties. The Contractor is solely responsible for their own tax and National Insurance contributions (HMRC compliance).',
      },
      {
        heading: '2. Mandatory Use of the L.N Haulage App',
        body: '2.1. The provision of logistics services requires the mandatory use of the L.N Haulage mobile application ("the App").\n\n2.2. The Contractor agrees to provide their own mobile device (BYOD) and maintain an active mobile data connection at their own expense.\n\n2.3. The Contractor must ensure that Location Services (GPS) are enabled at all times while logged into the App. Failure to allow GPS tracking or intentionally disabling the App during a transport assignment will be deemed a material breach of this Agreement and may result in immediate termination of services or withholding of service fees for unverified routes.',
      },
      {
        heading: '3. Invoicing, Time Logging, and the 50-Minute Inactivity Rule',
        body: '3.1. The Contractor is responsible for accurately recording their service hours using the "Clock In" and "Clock Out" functions within the App.\n\n3.2. While routine breaks during transit are accounted for in the agreed service fees, the App continuously monitors vehicle movement for logistical efficiency and cargo security.\n\n3.3. Inactivity Alert: If the App registers that the Contractor\'s device has remained strictly stationary for 50 consecutive minutes during an active session ("Clocked In"), an automated alert is sent to L.N Haulage Administration.\n\n3.4. Fee Adjustments: Upon receiving an Inactivity Alert, the Client\'s logistics/accounting department reserves the right to review the Contractor\'s time logs. If the 50-minute inactivity period is deemed unauthorized or unjustified (e.g., not related to traffic, loading delays, or mandated legal driving breaks), the Client retains the right to manually modify the logged hours and adjust the final payment/invoice accordingly.\n\n3.5. Dispute Mechanism: If the Contractor\'s logged time is adjusted by the Client, the Contractor will be notified. The Contractor has 48 hours to provide a valid operational reason (e.g., breakdown, accident, road closure) to reinstate the deducted time.',
      },
      {
        heading: '4. Liability, Loss, and Insurance',
        body: '4.1. The Contractor accepts full responsibility and liability for the safety, security, and condition of the cargo from the moment of collection until the confirmed delivery ("Clock Out" at the destination).\n\n4.2. In the event of loss, theft, or damage to the cargo or Client property caused by the Contractor\'s negligence, the Client reserves the right to deduct the value of the loss from the Contractor\'s pending fees.\n\n4.3. The Contractor must hold and maintain valid operational insurances at their own expense, including but not limited to Commercial Vehicle Insurance, Goods in Transit Insurance, and Public Liability Insurance. Proof of such insurance must be uploaded to the App or provided to the Administration before commencing any work.',
      },
      {
        heading: '5. Confidentiality and Non-Compete',
        body: '5.1. The Contractor agrees to keep all information obtained through the App and during the provision of services strictly confidential. This includes, but is not limited to: delivery addresses, end-client data, routing logic, pricing, and internal App mechanics.\n\n5.2. The Contractor must not use this confidential information to directly solicit or conduct business with L.N Haulage\'s end-clients outside of this Agreement.',
      },
      {
        heading: '6. Termination of Agreement',
        body: '6.1. Either party may terminate this Agreement by providing 7 days\' written notice to the other party.\n\n6.2. L.N Haulage reserves the right to terminate this Agreement and revoke App access immediately and without notice in the event of a material breach by the Contractor. Material breaches include, but are not limited to:\n\n• Intentional manipulation, tampering, or unauthorized disabling of the App\'s GPS tracking.\n\n• Theft, severe damage to cargo, or gross negligence.\n\n• Driving under the influence of drugs or alcohol.\n\n• Sharing App login credentials with unauthorized third parties.',
      },
      {
        heading: '7. Governing Law and Jurisdiction',
        body: '7.1. This Agreement and any dispute or claim arising out of it shall be governed by and construed in accordance with the law of England and Wales.\n\n7.2. The courts of England and Wales shall have exclusive jurisdiction to settle any dispute or claim arising out of this Agreement.',
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

// -- KPI Sparkline (decorative) ----------------------------
// Hardcoded paths, not derived from real history: the dashboard has no
// stored time-series for these metrics to chart honestly. Purely a visual
// echo of the trend badge next to it.
const SPARKLINE_PATHS: Record<'up' | 'down' | 'flat', string> = {
  up: 'M1 21 L10 16 L19 18 L28 10 L37 12 L46 3',
  down: 'M1 5 L10 9 L19 7 L28 15 L37 13 L46 20',
  flat: 'M1 12 L10 10 L19 13 L28 11 L37 12 L46 10',
};

function KpiSparkline({ tone }: { tone: 'up' | 'down' | 'flat' }) {
  const stroke = tone === 'up' ? '#22C55E' : tone === 'down' ? '#EF4444' : '#94A3B8';
  return (
    <svg width="48" height="24" viewBox="0 0 48 24" fill="none" aria-hidden="true">
      <path d={SPARKLINE_PATHS[tone]} stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// -- KPI Trend Badge (decorative, same caveat as above) ----
function KpiTrend({ tone, label }: { tone: 'up' | 'down' | 'flat'; label: string }) {
  if (tone === 'flat') {
    return <span className="kpi-trend kpi-trend--flat">{label}</span>;
  }
  return (
    <span className={`kpi-trend ${tone === 'up' ? 'kpi-trend--up' : 'kpi-trend--down'}`}>
      {tone === 'up' ? '↗' : '↘'} {label}
    </span>
  );
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
  const [legalModalDoc, setLegalModalDoc] = useState<'privacy' | 'contract'>('privacy');
  const [rememberMe, setRememberMe] = useState(() => !!localStorage.getItem(REMEMBERED_EMAIL_KEY));

  // Department sign-up
  const [signupMode, setSignupMode] = useState(false);
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirm, setSignupConfirm] = useState('');
  const [signupRole, setSignupRole] = useState<UserRole>('logistics');
  const [signupCode, setSignupCode] = useState('');
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [signupError, setSignupError] = useState('');

  // Password reset / recovery
  const [resetNotice, setResetNotice] = useState<{ tone: 'info' | 'error' | 'success'; text: string } | null>(null);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const [activeTab, setActiveTab] = useState<'live' | 'alerts' | 'drivers' | 'rates' | 'reports'>('live');

  // Route Guard: enforce that logistics role cannot access rates or reports tabs
  useEffect(() => {
    if (userRole === 'logistics' && (activeTab === 'rates' || activeTab === 'reports')) {
      setActiveTab('live');
    }
  }, [userRole, activeTab]);

  /// Resolves the signed-in user's department from public.user_roles.
  /// Matched on email: the deployed table is keyed by email and has no
  /// user_id column, unlike the definition in migration 009.
  /// Least privilege: anything unrecognised resolves to 'logistics'.
  const resolveUserRole = useCallback(async (): Promise<UserRole> => {
    const { data: { user } } = await supabase!.auth.getUser();
    const email = (user?.email ?? '').toLowerCase().trim();
    if (!email) return 'logistics';

    const { data, error } = await supabase!
      .from('user_roles')
      .select('role')
      .eq('email', email)
      .limit(1);

    if (error) {
      console.warn('Role lookup failed, defaulting to logistics:', error.message);
      return 'logistics';
    }
    return data?.[0]?.role === 'payroll_admin' ? 'payroll_admin' : 'logistics';
  }, []);

  // Database States
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [alerts, setAlerts] = useState<IdleAlert[]>([]);
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

  // Rate Editing state
  const [editingRateDriverId, setEditingRateDriverId] = useState<string | null>(null);
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

  // Leaflet Map Reference
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<{ [key: string]: L.Marker }>({});
  const csvInputRef = useRef<HTMLInputElement | null>(null);

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
      
      // Setup initial mock alerts (simulating a driver going idle after 5 seconds)
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
        }
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

      // Fetch Shifts
      const { data: sfts } = await supabase!
        .from('shifts')
        .select('*, drivers(full_name, driver_id), depots(name)')
        .order('start_time', { ascending: false });

      const mappedShifts = (sfts || []).map((s: any) => ({
        ...s,
        driver_name: s.drivers?.full_name || s.employee?.name || s.driver?.name || s.driver_name || 'Driver',
        driver_code: s.drivers?.driver_id || s.driver_code || '',
        depot_name: s.depots?.name,
        extras_amount: s.extras_amount ?? null,
        extras_note: s.extras_note ?? null,
        total_pay: s.total_pay ?? null
      }));
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
          if (diffMinutes >= 50) {
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
            if (diffMinutes >= 50) {
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
              status: diffMinutes >= 50 ? 'idle' : 'stationary',
            });
          }
        }
      }

      setLiveLocations(Array.from(locsMap.values()));
    } catch (e) {
      console.error(e);
    }
  }, [isMockMode, userRole, clearedAlertIds]);

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
        setIsAuthenticated(true);
        localStorage.setItem('admin_session', 'true');

        // A provisioned or admin-reset account carries a temporary password —
        // divert to the same "set a new password" screen before anything else.
        if (session.user?.user_metadata?.must_change_password) {
          setRecoveryMode(true);
        }

        // Re-resolve the department from the database so an edited
        // localStorage value cannot widen the UI on reload.
        resolveUserRole().then(role => {
          setUserRole(role);
          localStorage.setItem('admin_role', role);
        });
      } else {
        setIsAuthenticated(false);
        localStorage.removeItem('admin_session');
      }
    });

    return () => subscription.unsubscribe();
  }, [resolveUserRole]);

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
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupError('');

    const email = signupEmail.trim().toLowerCase();
    if (!email.includes('@')) {
      setSignupError('Enter a valid email address.');
      return;
    }
    if (signupPassword.length < 8) {
      setSignupError('Password must be at least 8 characters.');
      return;
    }
    if (signupPassword !== signupConfirm) {
      setSignupError('Passwords do not match.');
      return;
    }
    if (!signupCode.trim()) {
      setSignupError('Enter the registration code for your department.');
      return;
    }
    if (isMockMode) {
      setSignupError('Sign-up is unavailable in sandbox mock mode.');
      return;
    }

    setIsSigningUp(true);
    try {
      const { data, error } = await supabase!.functions.invoke('admin-signup', {
        body: { email, password: signupPassword, role: signupRole, code: signupCode.trim() },
      });

      const failure = await readFunctionError(data, error);
      if (failure) {
        setSignupError(failure);
      } else {
        setSignupMode(false);
        setSignupPassword('');
        setSignupConfirm('');
        setSignupCode('');
        setLoginEmail(email);
        setResetNotice({
          tone: 'success',
          text: `Account created for ${email}. Sign in with your new password.`,
        });
      }
    } catch (_) {
      setSignupError('Could not reach the sign-up service.');
    } finally {
      setIsSigningUp(false);
    }
  };

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
      if (loginEmail === 'logistics@abtso.co.uk' && loginPassword === 'logistics123') {
        setIsAuthenticated(true);
        setUserRole('logistics');
        localStorage.setItem('admin_session', 'true');
        localStorage.setItem('admin_role', 'logistics');
        persistRememberedEmail(loginEmail);
        setActiveTab('live');
      } else if (
        (loginEmail === 'payroll@abtso.co.uk' || loginEmail === 'admin@abtso.co.uk') && 
        (loginPassword === 'payroll123' || loginPassword === 'admin123')
      ) {
        setIsAuthenticated(true);
        setUserRole('payroll_admin');
        localStorage.setItem('admin_session', 'true');
        localStorage.setItem('admin_role', 'payroll_admin');
        persistRememberedEmail(loginEmail);
      } else {
        setLoginError('Invalid email or password. Use payroll@abtso.co.uk / payroll123 OR logistics@abtso.co.uk / logistics123');
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
        const resolvedRole = await resolveUserRole();

        setUserRole(resolvedRole);
        localStorage.setItem('admin_role', resolvedRole);
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
  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setCrudError('');

    if (!newEmployeeName.trim() || !newEmployeeCode.trim() || !newEmployeePhone.trim() || !newEmployeePin.trim()) {
      setCrudError('Please fill in all employee fields.');
      return;
    }

    if (newEmployeePin.trim().length < 6) {
      setCrudError('PIN must be at least 6 characters.');
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

  const handleDeleteEmployee = async (employeeId: string) => {
    if (!window.confirm('Are you sure you want to permanently remove this employee profile? Historical shifts will remain intact, but the account will be deleted.')) {
      return;
    }

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
        alert('Failed to remove employee: ' + realMessage);
      } else if (data && data.error) {
        alert('Failed to remove employee: ' + data.error);
      } else {
        loadData();
      }
    } catch (e: any) {
      console.error(e);
      alert('Connection error: ' + (e?.message ?? 'Failed to remove employee.'));
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

    if (cleanPin && cleanPin.length < 4) {
      setEditEmployeeError('New PIN must be at least 4 characters if provided.');
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
      alert("Manual Clock In not supported in Mock Mode.");
      return;
    }

    let depotsList = [];
    try {
      const { data } = await supabase!.from('depots').select('*');
      depotsList = data || [];
    } catch (e) {
      console.error(e);
    }

    if (depotsList.length === 0) {
      alert("No depots found in database.");
      return;
    }

    const depotNames = depotsList.map((d, idx) => `${idx + 1}: ${d.name}`).join('\n');
    const choice = window.prompt(`Select start depot for driver:\n${depotNames}\n\nEnter number (1 or 2):`, "1");
    if (choice === null) return;

    const selectedIdx = parseInt(choice) - 1;
    if (isNaN(selectedIdx) || selectedIdx < 0 || selectedIdx >= depotsList.length) {
      alert("Invalid selection.");
      return;
    }

    const depot = depotsList[selectedIdx];

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
        alert("Failed to manual clock in: " + error.message);
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
        loadData();
      }
    } catch (e: any) {
      alert("Failed to manual clock in: " + e.message);
    }
  };


  const handleManualClockOut = async (driverId: string, shiftId: string) => {
    if (isMockMode) {
      alert("Manual Clock Out not supported in Mock Mode.");
      return;
    }

    const confirm = window.confirm("Are you sure you want to manually clock out this driver? This will end their shift immediately and log them out of the mobile app.");
    if (!confirm) return;

    try {
      // Get shift details to find depot coords
      const { data: shiftData } = await supabase!
        .from('shifts')
        .select('*, depots(*)')
        .eq('id', shiftId)
        .single();

      const lat = shiftData?.depots?.latitude ?? 53.481798;
      const lng = shiftData?.depots?.longitude ?? -1.086552;
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
        alert("Failed to manual clock out: " + error.message);
      } else {
        await loadData();
      }
    } catch (e: any) {
      alert("Failed to manual clock out: " + e.message);
    }
  };

  const handleEditShiftTime = async (shiftId: string, currentStartTime: string, currentEndTime: string | null) => {
    const formatForPrompt = (isoStr: string) => new Date(isoStr).toISOString().slice(0, 16).replace('T', ' ');

    // 1. Edit Start Time
    const defaultStart = formatForPrompt(currentStartTime);
    const newStartRaw = window.prompt("1/2: Edit START date and time (YYYY-MM-DD HH:mm):", defaultStart);
    if (!newStartRaw) return; // User cancelled

    // 2. Edit End Time (Allowing clearing for 'ongoing')
    const defaultEnd = currentEndTime ? formatForPrompt(currentEndTime) : "";
    const newEndRaw = window.prompt("2/2: Edit END date and time (YYYY-MM-DD HH:mm).\nTo leave the shift ACTIVE (ongoing), completely CLEAR this text box before clicking OK:", defaultEnd);
    
    if (newEndRaw === null) return; // User clicked Cancel

    const newStartTime = new Date(newStartRaw).toISOString();
    
    const targetShift = shifts.find(s => s.id === shiftId);
    if (!targetShift) return;

    let updatePayload: any = {
      start_time: newStartTime,
      status: 'completed'
    };

    if (newEndRaw.trim() === "") {
      updatePayload.end_time = null;
      updatePayload.status = 'active';
      updatePayload.total_pay = null;
      updatePayload.total_hours = null;
    } else {
      const newEndTime = new Date(newEndRaw).toISOString();
      if (new Date(newEndTime) <= new Date(newStartTime)) {
        alert("Error: End time must be strictly after the start time!");
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
      alert("Failed to update shift: " + error.message);
    } else {
      alert("Shift times updated successfully.");
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

  const handleImportCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);
        
        // Handle the "Note:" trap row
        let headerIdx = 0;
        if (lines[0].toLowerCase().startsWith('note:')) {
          headerIdx = 1;
        }
        
        const headers = lines[headerIdx].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
        const fnIdx = headers.indexOf('First Name');
        const lnIdx = headers.indexOf('Last Name');
        const ciDateIdx = headers.indexOf('Clock In Date');
        const ciTimeIdx = headers.indexOf('Clock In Time');
        const coDateIdx = headers.indexOf('Clock Out Date');
        const coTimeIdx = headers.indexOf('Clock Out Time');

        if (fnIdx === -1 || ciDateIdx === -1) {
          alert("Invalid CSV format. Missing required columns.");
          return;
        }

        const parsedShifts = [];
        let missingDrivers = new Set();

        for (let i = headerIdx + 1; i < lines.length; i++) {
          // Simple CSV split
          const cols = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
          if (cols.length < headers.length) continue;

          const fullName = `${cols[fnIdx].trim()} ${cols[lnIdx].trim()}`.trim();
          const driver = employees.find(emp => emp.full_name?.toLowerCase() === fullName.toLowerCase());
          
          if (!driver) {
            missingDrivers.add(fullName);
            continue;
          }

          const ciDate = cols[ciDateIdx].trim();
          const ciTime = cols[ciTimeIdx].trim();
          const coDate = cols[coDateIdx].trim();
          const coTime = cols[coTimeIdx].trim();

          if (!ciDate || !ciTime || !coDate || !coTime) continue;

          const startTime = new Date(`${ciDate}T${ciTime}`).toISOString();
          const endTime = new Date(`${coDate}T${coTime}`).toISOString();
          const totalHours = Number(((new Date(endTime).getTime() - new Date(startTime).getTime()) / (1000 * 60 * 60)).toFixed(2));

          parsedShifts.push({
            driver_id: driver.id || driver.driver_id,
            start_time: startTime,
            end_time: endTime,
            total_hours: totalHours,
            status: 'completed' as const,
            night_out_status: 'none' as const
          });
        }

        if (parsedShifts.length === 0) {
          alert("No valid shifts found to import. Check if driver names in CSV match the system exactly.");
          return;
        }

        // De-duplicate against existing database shifts (checking only driver_id)
        const newUploads = [];
        for (const pShift of parsedShifts) {
          const exists = shifts.some(existing => 
            existing.driver_id === pShift.driver_id && 
            new Date(existing.start_time).getTime() === new Date(pShift.start_time).getTime()
          );
          if (!exists) {
            newUploads.push(pShift);
          }
        }

        if (newUploads.length > 0) {
          const { error } = await supabase!.from('shifts').insert(newUploads);
          if (error) throw error;
          alert(`Successfully imported ${newUploads.length} new shift(s) from Blip!`);
          await loadData();
        } else {
          alert("All shifts in this CSV are already in the database. No duplicates were added.");
        }

        if (missingDrivers.size > 0) {
          console.warn("Drivers in CSV not found in system:", Array.from(missingDrivers));
        }
      } catch (err: any) {
        alert("Error parsing CSV: " + err.message);
      } finally {
        if (event.target) {
          event.target.value = '';
        }
      }
    };
    reader.readAsText(file);
  };

  const handleExportSummaryCSV = () => {
    const filteredShifts = getFilteredShifts();
    if (filteredShifts.length === 0) {
      alert("No data available to export.");
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
        alert(`Template Injection Complete!\nSuccessfully matched and injected data for ${matchCount} employees.`);

      } catch (error: any) {
        alert("Error processing Excel file: " + error.message);
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
      alert('Driver rate profile updated successfully (Mock Mode).');
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
        alert('Rate saved locally. Database sync notice: ' + error.message + '\n\nYour changes are visible but may need a page refresh after the database schema cache reloads (usually within 30 seconds).');
        await loadData();
        return;
      }

      if (!data || data.length === 0) {
        alert(`Error: No rows updated. Ensure driver ID (${primaryId} / ${driverCode}) is correct and RLS allows updating 'drivers' table.`);
        await loadData();
        return;
      }

      alert(`Profile updated successfully!\n\nRate Type: ${isFixed ? 'Fixed Shift Rate' : 'Hourly'} ${isFixed ? `(£${parsedFixed.toFixed(2)}/shift)` : ''}`);
      await loadData();
    } catch (e: any) {
      alert(`Rate save error: ${e?.message ?? 'Unknown error'}`);
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
    link.setAttribute('download', `ABTSO_Payroll_Report_${new Date().toISOString().split('T')[0]}.csv`);
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

    XLSX.writeFile(workbook, `ABTSO_Payroll_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // ── Leaflet Map Component Implementation ────────────────────
  useEffect(() => {
    if (!isAuthenticated || activeTab !== 'live') {
      // Clean up map instance when tab or auth changes
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      return;
    }

    // Initialize Leaflet map
    if (!mapRef.current) {
      mapRef.current = L.map('live-dispatch-map', { maxZoom: 20 }).setView([53.5160, -1.0880], 11);

      // OpenFreeMap Positron vector tiles — keyless, unmetered, commercial use permitted.
      // Rendered through MapLibre GL; all Leaflet overlays below stay on Leaflet panes.
      L.maplibreGL({
        style: 'https://tiles.openfreemap.org/styles/positron'
      }).addTo(mapRef.current);
      // Attribution (OpenFreeMap / OpenMapTiles / OSM) is required, and is supplied
      // automatically as linked text from the style itself — do not add it manually.

      // Draw Rossington Depot (53.481798, -1.086552)
      L.circle([53.481798, -1.086552], {
        color: '#CC0000',
        fillColor: '#CC0000',
        fillOpacity: 0.08,
        radius: 200,
        weight: 1.5
      }).addTo(mapRef.current).bindPopup('<b>Rossington Depot</b><br>Radius: 200m<br>Lat: 53.4818, Lng: -1.0866');

      L.marker([53.481798, -1.086552], {
        icon: L.divIcon({
          className: '',
          html: `<div style="background-color:#CC0000;width:8px;height:8px;border-radius:50%;border:2px solid #FFFFFF;box-shadow:0 1px 4px rgba(204,0,0,0.4);"></div>`
        })
      }).addTo(mapRef.current);

      // Draw Wheatley Depot (53.550248, -1.091061)
      L.circle([53.550248, -1.091061], {
        color: '#CC0000',
        fillColor: '#CC0000',
        fillOpacity: 0.08,
        radius: 200,
        weight: 1.5
      }).addTo(mapRef.current).bindPopup('<b>Wheatley Depot</b><br>Radius: 200m<br>Lat: 53.5502, Lng: -1.0911');

      L.marker([53.550248, -1.091061], {
        icon: L.divIcon({
          className: '',
          html: `<div style="background-color:#CC0000;width:8px;height:8px;border-radius:50%;border:2px solid #FFFFFF;box-shadow:0 1px 4px rgba(204,0,0,0.4);"></div>`
        })
      }).addTo(mapRef.current);
    }

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
          <div style="font-family:'Outfit',sans-serif;">
            <b style="font-size:13px;color:#333333;">${loc.driver_name} (${loc.driver_code})</b><br>
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
            <div style="font-family:'Outfit',sans-serif;">
              <b style="font-size:13px;color:#CC0000;">🚨 EMERGENCY SOS BREAKDOWN</b><br>
              <b style="font-size:12px;color:#333333;">${alert.driver_name} (${alert.driver_code})</b><br>
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

  }, [isAuthenticated, activeTab, liveLocations, alerts]);

  // ── Render login Page if Unauthenticated ───────────────────
  // ── Department Sign-Up ─────────────────────────────────────
  if (!isAuthenticated && signupMode) {
    return (
      <div className="login-shell">
        <div className="login-card login-card--single">
          <div className="login-form-col">
            <div className="text-center mb-24">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '18px' }}>
                <img src={abtsoLogo} onError={(e) => { (e.target as HTMLImageElement).src = '/logo.png'; }} alt="ABTSO Logo" style={{ height: '54px', width: 'auto', objectFit: 'contain' }} />
              </div>
              <h1 className="login-title">Register Access</h1>
              <p className="login-subtitle">Join a department with its registration code</p>
            </div>

            <form onSubmit={handleSignup}>
              <div className="input-group">
                <label className="input-label" htmlFor="signup-email">WORK EMAIL</label>
                <div className="login-field">
                  <span className="login-field-icon"><Mail size={16} /></span>
                  <input
                    id="signup-email"
                    type="email"
                    className="login-input"
                    placeholder="firstname.lastname@abtso.co.uk"
                    autoComplete="username"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="input-group">
                <label className="input-label" htmlFor="signup-role">DEPARTMENT</label>
                <select
                  id="signup-role"
                  className="select-field"
                  value={signupRole}
                  onChange={(e) => setSignupRole(e.target.value as UserRole)}
                >
                  <option value="logistics">Logistics</option>
                  <option value="payroll_admin">Payroll Admin</option>
                </select>
              </div>

              <div className="input-group">
                <label className="input-label" htmlFor="signup-code">DEPARTMENT REGISTRATION CODE</label>
                <div className="login-field">
                  <span className="login-field-icon"><Shield size={16} /></span>
                  <input
                    id="signup-code"
                    type="text"
                    className="login-input"
                    placeholder="Provided by your administrator"
                    value={signupCode}
                    onChange={(e) => setSignupCode(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="input-group">
                <label className="input-label" htmlFor="signup-password">PASSWORD</label>
                <div className="login-field">
                  <span className="login-field-icon"><Lock size={16} /></span>
                  <input
                    id="signup-password"
                    type={showSignupPassword ? 'text' : 'password'}
                    className="login-input login-input--with-toggle"
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="login-toggle"
                    onClick={() => setShowSignupPassword(v => !v)}
                    aria-label={showSignupPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showSignupPassword}
                  >
                    {showSignupPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="input-group">
                <label className="input-label" htmlFor="signup-confirm">CONFIRM PASSWORD</label>
                <div className="login-field">
                  <span className="login-field-icon"><Lock size={16} /></span>
                  <input
                    id="signup-confirm"
                    type={showSignupPassword ? 'text' : 'password'}
                    className="login-input"
                    placeholder="Re-enter password"
                    autoComplete="new-password"
                    value={signupConfirm}
                    onChange={(e) => setSignupConfirm(e.target.value)}
                    required
                  />
                </div>
              </div>

              {signupError && (
                <div className="login-notice login-notice--error">{signupError}</div>
              )}

              <button type="submit" className="login-submit" disabled={isSigningUp}>
                <Shield size={15} />
                {isSigningUp ? 'CREATING ACCOUNT…' : 'REGISTER ACCESS'}
              </button>
            </form>

            <div className="login-utils" style={{ marginTop: '16px', justifyContent: 'center' }}>
              <button
                type="button"
                className="login-forgot"
                onClick={() => { setSignupMode(false); setSignupError(''); }}
              >
                ← Back to sign in
              </button>
            </div>
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
                <img src={abtsoLogo} onError={(e) => { (e.target as HTMLImageElement).src = '/logo.png'; }} alt="ABTSO Logo" style={{ height: '54px', width: 'auto', objectFit: 'contain' }} />
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
                    {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
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
                <Shield size={15} />
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
      <div className="login-shell">
        <div className="login-card">
          {/* ── Left column: credentials ─────────────────────── */}
          <div className="login-form-col">
            <div className="text-center mb-24">
              {/* ABTSO Brand Logo Mark */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '18px' }}>
                <img src={abtsoLogo} onError={(e) => { (e.target as HTMLImageElement).src = '/logo.png'; }} alt="ABTSO Logo" style={{ height: '54px', width: 'auto', objectFit: 'contain' }} />
              </div>
              <h1 className="login-title">Dispatch Console</h1>
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
                    placeholder="admin@abtso.co.uk"
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
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
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

              <button type="submit" className="login-submit">
                <Shield size={15} />
                SECURE AUTHORIZE
              </button>
            </form>

            <div className="login-utils" style={{ marginTop: '14px', justifyContent: 'center' }}>
              <button
                type="button"
                className="login-forgot"
                onClick={() => { setSignupMode(true); setResetNotice(null); setLoginError(''); }}
              >
                Need access? Register with a department code
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
                Privacy Policy &amp; Contract for Services
              </button>
            </div>

            <p className="login-footnote">Multi-Factor Authentication enabled for enhanced security</p>

            {isMockMode && (
              <div className="mt-24 p-12 text-center text-xs text-muted" style={{ border: '1px dashed var(--border-color)', borderRadius: '6px' }}>
                ℹ️ Sandbox Mock Mode Active<br/>
                <b>Payroll Admin:</b> <span className="text-secondary font-mono">payroll@abtso.co.uk</span> / <span className="text-secondary font-mono">payroll123</span><br/>
                <b>Logistics:</b> <span className="text-secondary font-mono">logistics@abtso.co.uk</span> / <span className="text-secondary font-mono">logistics123</span>
              </div>
            )}
          </div>

          {/* ── Right column: fleet branding ─────────────────── */}
          <div
            className="login-brand"
            style={{ backgroundImage: `url(${loginBrandImage})` }}
            role="presentation"
          >
            <div className="login-brand-overlay" />
          </div>
        </div>

        {/* ── Legal & Compliance modal — viewable before login, no
             acceptance is required here: this is ABTSO staff signing in to
             the dispatch console, not a contractor accepting the terms
             that govern the driver app. ────────────────────────────── */}
        {legalModalOpen && (
          <div
            className="modal-overlay"
            style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}
            onClick={() => setLegalModalOpen(false)}
          >
            <div
              className="modal-content glass-panel"
              style={{ width: '620px', maxWidth: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', borderRadius: '16px', backgroundColor: '#FFFFFF', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid #E5E7EB', overflow: 'hidden' }}
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
                  className={`payroll-pill-btn ${legalModalDoc === 'contract' ? 'payroll-pill-btn--active' : 'payroll-pill-btn--outline'}`}
                  onClick={() => setLegalModalDoc('contract')}
                >
                  Contract for Services
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
  const activeEmployeeCount = liveLocations.length;
  const activeAlertsCount = alerts.filter(a => !a.acknowledged).length;
  const completedShiftsCount = shifts.filter(s => s.status === 'completed').length;
  const pendingNightOutsCount = shifts.filter(s => s.night_out_status === 'pending').length;
  const totalWeeklyPayout = shifts.reduce((sum, s) => sum + (s.total_pay || 0), 0);

  return (
    <div className="grid grid-sidebar min-h-screen">
      {/* ── Left Sidebar Navigation ────────────────────────── */}
      {/* No horizontal padding on the container: the active item's red border
          must sit flush against the sidebar's left edge, so each nav item
          owns its own inset instead. */}
      <div className="sidebar flex flex-col justify-between">
        <div>
          {/* Brand header */}
          <div className="text-center" style={{ padding: '28px 20px 24px' }}>
            <img
              src={abtsoLogo}
              onError={(e) => { (e.target as HTMLImageElement).src = '/logo.png'; }}
              alt="ABTSO Logo"
              style={{ height: '38px', width: 'auto', objectFit: 'contain', marginBottom: '12px' }}
            />
            <h2 className="sidebar-title">Dispatch &amp; Payroll Console</h2>
          </div>

          <nav className="flex flex-col" style={{ gap: '2px' }}>
            <div
              className={`nav-item ${activeTab === 'live' ? 'active' : ''}`}
              onClick={() => setActiveTab('live')}
            >
              <span className="nav-icon"><MapPinned size={18} /></span>
              Live Dispatch Board
            </div>

            <div
              className={`nav-item ${activeTab === 'alerts' ? 'active' : ''}`}
              onClick={() => setActiveTab('alerts')}
            >
              <span className="nav-icon">
                <Bell size={18} />
                {activeAlertsCount > 0 && (
                  <span
                    className="nav-dot"
                    aria-label={`${activeAlertsCount} unacknowledged alerts`}
                  />
                )}
              </span>
              Alert Monitors
            </div>

            <div
              className={`nav-item ${activeTab === 'drivers' ? 'active' : ''}`}
              onClick={() => setActiveTab('drivers')}
            >
              <span className="nav-icon"><Users size={18} /></span>
              Driver Profiles
            </div>

            {userRole === 'payroll_admin' && (
              <>
                <div
                  className={`nav-item ${activeTab === 'rates' ? 'active' : ''}`}
                  onClick={() => setActiveTab('rates')}
                >
                  <span className="nav-icon"><DollarSign size={18} /></span>
                  Rates &amp; Agencies
                </div>

                <div
                  className={`nav-item ${activeTab === 'reports' ? 'active' : ''}`}
                  onClick={() => setActiveTab('reports')}
                >
                  <span className="nav-icon"><FileText size={18} /></span>
                  Payroll Calculator
                  {pendingNightOutsCount > 0 && (
                    <span
                      className="badge text-xs ml-8"
                      style={{ padding: '2px 6px', borderRadius: '8px', backgroundColor: '#F59E0B', color: '#FFFFFF' }}
                    >
                      {pendingNightOutsCount} N/O
                    </span>
                  )}
                </div>
              </>
            )}
          </nav>
        </div>

        <div style={{ padding: '0 20px 20px' }}>
          <div className="p-12 text-center text-xs text-muted mb-16" style={{ border: '1px solid #E5E7EB', borderRadius: '10px' }}>
            <span className="font-bold uppercase" style={{ color: userRole === 'payroll_admin' ? '#10B981' : '#3B82F6' }}>
              {userRole === 'payroll_admin' ? 'Payroll Admin' : 'Logistics Role'}
            </span>
          </div>

          <div
            className="nav-item text-error"
            onClick={handleLogout}
            style={{ paddingLeft: '14px', borderLeft: 0, borderRadius: '8px' }}
          >
            <LogOut size={18} /> Terminate Session
          </div>
        </div>
      </div>

      {/* ── Main Dashboard Content ─────────────────────────── */}
      <div className="p-32 flex flex-col overflow-auto" style={{ height: '100vh' }}>
        
        {/* Header Stats Row */}
        <div className="kpi-grid">
          <div className="kpi-card">
            <span className="kpi-icon kpi-icon--red"><User size={18} /></span>
            <div className="kpi-body">
              <h2 className="kpi-value">{activeEmployeeCount}</h2>
              <span className="kpi-label">Employees logged in</span>
            </div>
            <div className="kpi-trend-col">
              <KpiTrend tone="down" label="0%" />
              <KpiSparkline tone="down" />
            </div>
          </div>

          <div className="kpi-card">
            <span className="kpi-icon kpi-icon--red"><Clock size={18} /></span>
            <div className="kpi-body">
              <h2 className="kpi-value">{activeAlertsCount}</h2>
              <span className="kpi-label">Stops &gt; 50 mins (Break)</span>
            </div>
            <div className="kpi-trend-col">
              <KpiTrend tone="down" label="0%" />
              <KpiSparkline tone="down" />
            </div>
          </div>

          <div className="kpi-card">
            <span className="kpi-icon kpi-icon--red"><Briefcase size={18} /></span>
            <div className="kpi-body">
              <h2 className="kpi-value">{completedShiftsCount}</h2>
              <span className="kpi-label">Calculated shifts</span>
            </div>
            <div className="kpi-trend-col">
              <KpiTrend tone="up" label="100%" />
              <KpiSparkline tone="up" />
            </div>
          </div>

          {userRole === 'payroll_admin' ? (
            <div className="kpi-card">
              <span className="kpi-icon kpi-icon--red"><PoundSterling size={18} /></span>
              <div className="kpi-body">
                <h2 className="kpi-value">£{(totalWeeklyPayout || 0).toFixed(2)}</h2>
                <span className="kpi-label">Calculated gross pay</span>
              </div>
              <div className="kpi-trend-col">
                <KpiTrend tone="up" label="12%" />
                <KpiSparkline tone="up" />
              </div>
            </div>
          ) : (
            <div className="kpi-card">
              <span className="kpi-icon kpi-icon--red"><Compass size={18} /></span>
              <div className="kpi-body">
                <h2 className="kpi-value">2</h2>
                <span className="kpi-label">Active depots (Rossington &amp; Wheatley)</span>
              </div>
              <div className="kpi-trend-col">
                {/* Station count has no meaningful up/down trend, unlike the
                    other three cards — shown as flat rather than a fake number. */}
                <KpiTrend tone="flat" label="STABLE" />
                <KpiSparkline tone="flat" />
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
            <div className="telemetry-card">
              <div className="telemetry-header">
                <span className="telemetry-header-icon"><Activity size={14} /></span>
                <h3 className="telemetry-title">Active Telemetry Feed</h3>
                <ChevronUp size={16} className="telemetry-chevron" />
              </div>

              <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
                <table className="data-table telemetry-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Last Ping Location</th>
                      <th>Speed</th>
                      <th>Telemetry Status</th>
                      <th>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liveLocations.length === 0 ? (
                      <tr className="telemetry-empty-row">
                        <td colSpan={5}>
                          <div className="telemetry-empty-box">No employees currently logged into shifts</div>
                        </td>
                      </tr>
                    ) : (
                      liveLocations.map(loc => (
                        <tr key={loc.driver_id}>
                          <td className="font-bold text-primary">{loc.driver_name} ({loc.driver_code})</td>
                           <td className="font-mono text-secondary text-sm">
                            <div className="flex align-center gap-8">
                              <span>{(loc.latitude || 0).toFixed(6)}, {(loc.longitude || 0).toFixed(6)}</span>
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
                          </td>
                          <td className="font-semibold">{loc.speed_mph.toFixed(0)} mph</td>
                          <td>
                            <span className={`badge ${loc.status === 'idle' ? 'badge-danger' : loc.status === 'moving' ? 'badge-success' : 'badge-warning'}`}>
                              {loc.status}
                            </span>
                          </td>
                          <td className="text-secondary text-sm">{new Date(loc.last_ping as string).toLocaleTimeString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
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
                  {isAudioMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
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

            <div className="flex flex-col gap-16">
              {alerts.length === 0 ? (
                <div className="glass-card p-32 text-center text-muted">
                  ✅ No active idle alerts found. All staff members are moving or on authorized short breaks.
                </div>
              ) : (
                alerts.map(alert => {
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

                  return (
                    <div 
                      key={alert.id} 
                      className={`glass-card p-24 flex align-center justify-between ${!alert.acknowledged ? 'alert-pulse-card' : ''}`}
                      style={{ borderLeft: alert.is_sos ? '6px solid #FF3333' : undefined }}
                    >
                      <div>
                        <div className="flex align-center gap-12">
                          {alert.is_sos ? (
                            <span className="badge badge-danger alert-pulse-card" style={{ backgroundColor: '#FF3333' }}>
                              🚨 EMERGENCY SOS
                            </span>
                          ) : (
                            <span className="badge badge-danger">
                              ⚠️ IDLE ALERT ({diffMins} MINS)
                            </span>
                          )}
                          <span className="text-xs text-muted">
                            {alert.is_sos ? 'Vehicle breakdown or employee emergency reported' : 'Stationary stop duration threshold exceeded'}
                          </span>
                        </div>
                        
                        <h3 className="text-lg font-bold text-primary mt-8 mb-4">
                          Employee: {alert.driver_name} ({alert.driver_code})
                        </h3>
                        
                        <p className="text-sm text-secondary m-0">
                          {alert.is_sos ? 'Reported at: ' : 'Stationary since: '}
                          <b>{displayTime}</b> ({diffMins} minutes ago)
                        </p>
                      
                      <p className="text-xs text-muted font-mono mt-8 mb-0 flex align-center gap-12">
                        <span>GPS Coordinate: {(alert.latitude || 0).toFixed(6)}, {(alert.longitude || 0).toFixed(6)}</span>
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${alert.latitude},${alert.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-secondary p-4"
                          style={{ display: 'inline-flex', padding: '4px 8px', fontSize: '10px', minHeight: 'auto', borderRadius: '4px', gap: '4px', textDecoration: 'none' }}
                          title="Open location in Google Maps"
                        >
                          🗺️ Open in Google Maps
                        </a>
                      </p>
                    </div>

                    <div className="flex align-center gap-12">
                      {!alert.acknowledged ? (
                        <button className="btn btn-primary" onClick={() => acknowledgeAlert(alert.id, alert.is_sos)}>
                          ACKNOWLEDGE
                        </button>
                      ) : (
                        <span className="text-success font-semibold flex align-center gap-4 text-xs">
                          <Check size={16} /> ACKNOWLEDGED
                        </span>
                      )}
                      <button 
                        className="btn btn-secondary" 
                        onClick={() => clearAlert(alert.id, alert.is_sos)}
                        style={{ color: '#CC0000', borderColor: '#FECDD3', padding: '6px 12px', fontSize: '11px', fontWeight: 800 }}
                      >
                        DISMISS / CLEAR
                      </button>
                    </div>
                  </div>
                );
              })
            )}
            </div>
          </div>
        )}

        {/* ── TAB 3: Employee Profiles Management ──────────────── */}
        {activeTab === 'drivers' && (
          <div className="flex-1">
            <div className="flex align-center justify-between mb-24">
              <h2 className="text-xl font-black text-primary m-0">EMPLOYEE DATABASE</h2>
              
              <button className="btn btn-primary" onClick={() => setIsAddingEmployee(!isAddingEmployee)}>
                <UserPlus size={16} /> ADD NEW EMPLOYEE
              </button>
            </div>

            {/* Add Employee Card form overlay */}
            {isAddingEmployee && (
              <div className="glass-panel p-24 mb-24" style={{ borderRadius: '16px' }}>
                <h3 className="text-md font-bold text-primary mb-16">Add New Employee Profile</h3>
                <form onSubmit={handleAddEmployee}>
                  <div className="grid grid-cols-5 gap-16">
                    <div className="input-group">
                      <span className="input-label">EMPLOYEE FULL NAME</span>
                      <input 
                        type="text" 
                        className="input-field" 
                        placeholder="John Jones"
                        value={newEmployeeName} 
                        onChange={handleNewEmployeeNameChange}
                      />
                    </div>
                    <div className="input-group">
                      <span className="input-label">USERNAME (AUTO-GENERATED)</span>
                      <input 
                        type="text" 
                        className="input-field" 
                        placeholder="john.jones"
                        value={newEmployeeCode} 
                        onChange={(e) => setNewEmployeeCode(e.target.value)}
                      />
                    </div>
                    <div className="input-group">
                      <span className="input-label">PHONE NUMBER</span>
                      <input 
                        type="text" 
                        className="input-field" 
                        placeholder="+44 7700 900100"
                        value={newEmployeePhone} 
                        onChange={(e) => setNewEmployeePhone(e.target.value)}
                      />
                    </div>
                    <div className="input-group">
                      <span className="input-label">DEFAULT PIN</span>
                      <input 
                        type="text" 
                        className="input-field" 
                        placeholder="6 digit PIN"
                        value={newEmployeePin} 
                        maxLength={6}
                        onChange={(e) => setNewEmployeePin(e.target.value)}
                      />
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

             {/* Employees list table */}
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee ID</th>
                    <th>Full Name</th>
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
                        <td className="text-secondary">{drv.phone}</td>
                        <td>
                          <span className={`badge ${drv.is_active ? 'badge-success' : 'badge-danger'}`}>
                            {drv.is_active ? 'active' : 'inactive'}
                          </span>
                        </td>
                        <td>
                          {latestShift ? (
                            <div className="flex flex-col gap-4">
                              {activeShift ? (
                                <span className="badge badge-success flex align-center gap-4" style={{ width: 'fit-content' }}>
                                  🟢 Active ({activeShift.depot_name || 'In Progress'})
                                </span>
                              ) : (
                                <span className="badge badge-secondary flex align-center gap-4" style={{ width: 'fit-content', backgroundColor: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>
                                  ⚪ Offline (Last Shift)
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
                          <div className="flex gap-8">
                            {activeShift ? (
                              <button 
                                className="btn btn-primary"
                                style={{ padding: '6px 12px', fontSize: '12px', backgroundColor: '#EF4444', color: '#FFFFFF', borderColor: '#EF4444' }}
                                onClick={() => handleManualClockOut(drv.id, activeShift.id)}
                              >
                                CLOCK OUT
                              </button>
                            ) : (
                              <button 
                                className="btn btn-secondary"
                                style={{ padding: '6px 12px', fontSize: '12px', color: '#10B981', borderColor: 'rgba(16, 185, 129, 0.2)' }}
                                onClick={() => handleManualClockIn(drv.id)}
                                disabled={!drv.is_active}
                              >
                                CLOCK IN
                              </button>
                            )}
                            <button 
                              className="btn btn-secondary"
                              style={{ padding: '6px 12px', fontSize: '12px', color: '#2563EB', borderColor: 'rgba(37, 99, 235, 0.3)', backgroundColor: '#EFF6FF', fontWeight: 'bold' }}
                              onClick={() => openEditEmployeeModal(drv)}
                            >
                              EDIT
                            </button>
                            <button 
                              className={`btn ${drv.is_active ? 'btn-danger' : 'btn-success'}`}
                              style={{ padding: '6px 12px', fontSize: '12px' }}
                              onClick={() => toggleEmployeeStatus(drv.id, drv.is_active)}
                            >
                              {drv.is_active ? 'DEACTIVATE' : 'ACTIVATE'}
                            </button>
                            <button 
                              className="btn btn-secondary"
                              style={{ padding: '6px 12px', fontSize: '12px', color: '#EF4444', borderColor: 'rgba(239, 68, 68, 0.2)' }}
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
            <div className="flex align-center justify-between mb-24">
              <div>
                <h2 className="text-xl font-black text-primary m-0">EMPLOYEES COMPENSATION PROFILES & AGENCIES</h2>
                <p className="text-xs text-muted mt-4">Assign rate structures, weekday/weekend pay, and agencies to drivers</p>
              </div>
            </div>

            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Driver Code & Name</th>
                    <th>Agency Name</th>
                    <th>Rate Type</th>
                    <th>Mon-Fri Rate</th>
                    <th>Saturday Rate</th>
                    <th>Sunday Rate</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map(emp => {
                    const currentRate = employeeRates[emp.id] || employeeRates[emp.driver_id] || ((emp as any).employee_id ? employeeRates[(emp as any).employee_id] : null) || {
                      driver_id: emp.id,
                      rate_type: (emp as any).rate_type || 'Hourly',
                      mon_fri_rate: Number((emp as any).mon_fri_rate ?? emp.hourly_rate) || 16.00,
                      sat_rate: Number((emp as any).saturday_rate) || 17.00,
                      sun_rate: Number((emp as any).sunday_rate) || 18.00,
                      agency_name: (emp as any).agency_name || (emp as any).agency || 'Direct',
                    };
                    const isEditing = editingRateDriverId === emp.id;
                    const isFixedRate = currentRate.rate_type === 'Fixed' || Boolean(currentRate.rate_type && currentRate.rate_type.toLowerCase().includes('fixed'));
                    const displayAgency = (emp as any).agency_name || (emp as any).agency || currentRate.agency_name || employeeRates[emp.id]?.agency_name || employeeRates[emp.driver_id]?.agency_name || 'Direct';

                    return (
                      <tr key={emp.id}>
                        <td className="font-bold text-primary">
                          {emp.full_name} ({emp.driver_id})
                        </td>
                        <td>
                          {isEditing ? (
                            <input
                              type="text"
                              className="input-field"
                              style={{ padding: '4px 8px', fontSize: '12px', width: '110px' }}
                              value={editAgencyName}
                              onChange={(e) => setEditAgencyName(e.target.value)}
                            />
                          ) : (
                            <span className="badge badge-accent">{displayAgency}</span>
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <select
                              className="select-field"
                              style={{ padding: '4px 8px', fontSize: '12px' }}
                              value={editRateType || 'Hourly'}
                              onChange={(e) => setEditRateType(e.target.value)}
                            >
                              <option value="Hourly">Hourly</option>
                              <option value="Fixed Shift Rate (Day Rate)">Fixed Shift Rate (Day Rate)</option>
                            </select>
                          ) : isFixedRate ? (
                            <span className="badge badge-primary text-xs font-bold" style={{ backgroundColor: '#E0E7FF', color: '#3730A3', border: '1px solid #C7D2FE', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>
                              FIXED SHIFT
                            </span>
                          ) : (
                            <span style={{ color: '#4B5563', fontSize: '13px', fontWeight: 'bold' }}>
                              HOURLY
                            </span>
                          )}
                        </td>
                        {isEditing ? (
                          (editRateType === 'Fixed' || editRateType === 'Fixed Shift Rate (Day Rate)') ? (
                            <td colSpan={3} style={{ padding: '8px 12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#4338CA', whiteSpace: 'nowrap' }}>Flat Rate per Shift (£):</label>
                                <input
                                  type="number"
                                  step="1.00"
                                  className="input-field"
                                  style={{ padding: '4px 8px', fontSize: '12px', width: '120px', fontWeight: 'bold', color: '#3730A3', borderColor: '#818CF8' }}
                                  value={editFixedRate}
                                  onChange={(e) => {
                                    setEditFixedRate(e.target.value);
                                  }}
                                />
                              </div>
                            </td>
                          ) : (
                            <>
                              <td>
                                <input
                                  type="number"
                                  step="0.50"
                                  className="input-field"
                                  style={{ padding: '4px 8px', fontSize: '12px', width: '80px' }}
                                  value={editMonFriRate}
                                  onChange={(e) => setEditMonFriRate(e.target.value)}
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  step="0.50"
                                  className="input-field"
                                  style={{ padding: '4px 8px', fontSize: '12px', width: '80px' }}
                                  value={editSatRate}
                                  onChange={(e) => setEditSatRate(e.target.value)}
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  step="0.50"
                                  className="input-field"
                                  style={{ padding: '4px 8px', fontSize: '12px', width: '80px' }}
                                  value={editSunRate}
                                  onChange={(e) => setEditSunRate(e.target.value)}
                                />
                              </td>
                            </>
                          )
                        ) : isFixedRate ? (
                          <td colSpan={3} className="text-center font-bold" style={{ textAlign: 'center', color: '#4338CA', fontWeight: 'bold', backgroundColor: '#EEF2FF', borderRadius: '6px' }}>
                            Flat Rate: £{Number(currentRate.fixed_rate || 0).toFixed(2)} / shift
                          </td>
                        ) : (
                          <>
                            <td>
                              <span className="font-bold text-primary">£{Number(currentRate?.mon_fri_rate || 16.00).toFixed(2)}/hr</span>
                            </td>
                            <td>
                              <span className="font-bold text-secondary">£{Number(currentRate?.saturday_rate ?? currentRate?.sat_rate ?? 17.00).toFixed(2)}/hr</span>
                            </td>
                            <td>
                              <span className="font-bold text-success">£{Number(currentRate?.sunday_rate ?? currentRate?.sun_rate ?? 18.00).toFixed(2)}/hr</span>
                            </td>
                          </>
                        )}
                        <td>
                          {isEditing ? (
                            <div className="flex gap-6">
                              <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: '11px' }} onClick={() => handleSaveRate(emp.id)}>
                                Save
                              </button>
                              <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '11px' }} onClick={() => setEditingRateDriverId(null)}>
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '4px 12px', fontSize: '11px' }}
                              onClick={() => {
                                setEditingRateDriverId(emp.id);
                                setEditMonFriRate(Number(currentRate.mon_fri_rate || 16.00).toString());
                                setEditSatRate(Number(currentRate.saturday_rate ?? currentRate.sat_rate ?? 17.00).toString());
                                setEditSunRate(Number(currentRate.sunday_rate ?? currentRate.sun_rate ?? 18.00).toString());
                                setEditFixedRate(Number(currentRate.fixed_rate || 150.00).toString());
                                setEditRateType(currentRate.rate_type || 'Hourly');
                                setEditAgencyName(currentRate.agency_name || 'Direct');
                              }}
                            >
                              Edit Profile
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 5: Automated Payroll Calculator (Payroll Admin Only) ─ */}
        {activeTab === 'reports' && userRole === 'payroll_admin' && (() => {
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
            <div className="flex-1">
              {/* -- Hero header ------------------------------------ */}
              <div className="payroll-hero" style={{ backgroundImage: `url(${loginBrandImage})` }}>
                <div className="payroll-hero-overlay" />
                <div className="payroll-hero-content">
                  <div>
                    <h2 className="payroll-hero-title">
                      EMPLOYEE PAYROLL DASHBOARD <span>Automated Shift &amp; Allowance Calculator</span>
                    </h2>
                    <p className="payroll-hero-tagline">
                      Aggregating telemetry data with driver rate profiles and Night Out allowances
                    </p>
                  </div>

                  <div className="payroll-hero-actions">
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
                    <button className="payroll-pill-btn" onClick={exportCSV}>
                      <Download size={13} /> Export CSV
                    </button>
                    <button className="payroll-pill-btn" onClick={exportExcel}>
                      <FileSpreadsheet size={13} /> Export Excel
                    </button>
                  </div>
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
                              {d.full_name} <span style={{ color: '#94A3B8' }}>({d.driver_id})</span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="payroll-filter-field">
                  <span className="input-label">Start Date</span>
                  <div className="payroll-input-wrap">
                    <span className="payroll-input-icon"><Calendar size={14} /></span>
                    <input
                      type="date"
                      className="input-field"
                      value={reportDateStart}
                      onChange={(e) => setReportDateStart(e.target.value)}
                    />
                  </div>
                </div>

                <div className="payroll-filter-field">
                  <span className="input-label">End Date</span>
                  <div className="payroll-input-wrap">
                    <span className="payroll-input-icon"><Calendar size={14} /></span>
                    <input
                      type="date"
                      className="input-field"
                      value={reportDateEnd}
                      onChange={(e) => setReportDateEnd(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* -- Action row: view toggle, exports, bulk edit ------ */}
              <div className="payroll-action-row">
                <div className="payroll-action-group">
                  <button
                    className={`payroll-pill-btn ${reportViewMode === 'detailed' ? 'payroll-pill-btn--active' : 'payroll-pill-btn--outline'}`}
                    onClick={() => setReportViewMode('detailed')}
                  >
                    <ListChecks size={13} /> Detailed View
                  </button>
                  <button
                    className={`payroll-pill-btn ${reportViewMode === 'summary' ? 'payroll-pill-btn--active' : 'payroll-pill-btn--outline'}`}
                    onClick={() => setReportViewMode('summary')}
                  >
                    <BarChart3 size={13} /> Weekly Summary
                  </button>
                  <button className="payroll-pill-btn" onClick={handleExportSummaryCSV}>
                    <Download size={13} /> Export Summary
                  </button>

                  <input
                    type="file"
                    accept=".csv"
                    ref={csvInputRef}
                    style={{ display: 'none' }}
                    onChange={handleImportCSV}
                  />
                  <button className="payroll-pill-btn payroll-pill-btn--outline" onClick={() => csvInputRef.current?.click()}>
                    <Upload size={13} /> Import Blip CSV
                  </button>

                  {/* EXCEL TEMPLATE INJECTION */}
                  <div style={{ position: 'relative', display: 'inline-flex' }}>
                    <input
                      type="file"
                      accept=".xlsx, .xls"
                      onChange={handleFillExcelTemplate}
                      style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', cursor: 'pointer', zIndex: 10, left: 0, top: 0 }}
                      title="Upload Payment Template (Step 2)"
                      onClick={(e) => { (e.target as HTMLInputElement).value = '' }}
                    />
                    <button className="payroll-pill-btn">
                      <Wand2 size={13} /> Fill Excel Template
                    </button>
                  </div>
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

              {/* -- Flagged Shifts & Night Out Alert Banners --------- */}
              {(() => {
                const flaggedShifts = filteredShifts.filter(shift => {
                  const end = shift.end_time ? new Date(shift.end_time).getTime() : Date.now();
                  const start = new Date(shift.start_time).getTime();
                  const durationHours = (end - start) / (1000 * 60 * 60);
                  return durationHours > 18;
                });

                // Night Out Detection Logic (8 to 15 hours gap)
                interface NightOutSuggestion {
                  driverName: string;
                  prevEnd: string;
                  nextStart: string;
                  gapHours: string;
                }

                const nightOutSuggestions: NightOutSuggestion[] = [];
                const employeeGroups: Record<string, typeof filteredShifts> = {};

                // Group shifts by driver
                filteredShifts.forEach(shift => {
                  if (!employeeGroups[shift.driver_id]) employeeGroups[shift.driver_id] = [];
                  employeeGroups[shift.driver_id].push(shift);
                });

                // Analyze gaps for each driver
                Object.keys(employeeGroups).forEach(driverId => {
                  const dShifts = employeeGroups[driverId].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

                  for (let i = 0; i < dShifts.length - 1; i++) {
                    const currentShift = dShifts[i];
                    const nextShift = dShifts[i+1];

                    if (currentShift.end_time && nextShift.start_time) {
                      const gapMs = new Date(nextShift.start_time).getTime() - new Date(currentShift.end_time).getTime();
                      const gapHours = gapMs / (1000 * 60 * 60);

                      if (gapHours >= 8 && gapHours <= 15) {
                        nightOutSuggestions.push({
                          driverName: currentShift.driver_name || 'Driver',
                          prevEnd: currentShift.end_time,
                          nextStart: nextShift.start_time,
                          gapHours: gapHours.toFixed(1)
                        });
                      }
                    }
                  }
                });

                const weekBoundaryAlerts = filteredShifts.filter(shift => shift.is_week_boundary && shift.boundary_label?.includes('Part 1'));

                return (
                  <>
                    {flaggedShifts.length > 0 && (
                      <div className="payroll-alert-banner payroll-alert-banner--danger">
                        <div className="payroll-alert-header">
                          <AlertOctagon size={16} />
                          Action Required &middot; Alert: Critical Shift Anomalies Detected (&gt;18h)
                        </div>
                        <ul className="payroll-alert-list">
                          {flaggedShifts.map(fs => (
                            <li key={fs.id}>
                              <strong>{fs.driver_name}</strong> ({fs.driver_code}) &mdash; Shift started {new Date(fs.start_time).toLocaleString()} &mdash; <em>Clock-out missing or invalid.</em>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Render the Night out suggestions box */}
                    {nightOutSuggestions.length > 0 && (
                      <div className="payroll-alert-banner payroll-alert-banner--warning">
                        <div className="payroll-alert-header">
                          <Moon size={15} />
                          Night Outs Detected (8&ndash;15h break between shifts)
                        </div>
                        <ul className="payroll-alert-list">
                          {nightOutSuggestions.map((no, idx) => (
                            <li key={idx}>
                              <strong>{no.driverName}</strong> &mdash; Break between {new Date(no.prevEnd).toLocaleDateString()} {new Date(no.prevEnd).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} and {new Date(no.nextStart).toLocaleDateString()} {new Date(no.nextStart).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} &mdash; <em>Duration: {no.gapHours}h</em>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Render the Week Boundary Splits box */}
                    {weekBoundaryAlerts.length > 0 && (
                      <div className="payroll-alert-banner payroll-alert-banner--warning">
                        <div className="payroll-alert-header">
                          <AlertTriangle size={15} />
                          Week Boundary Splits (Sunday &#10132; Monday)
                        </div>
                        <ul className="payroll-alert-list">
                          {weekBoundaryAlerts.map(fs => (
                            <li key={fs.id}>
                              <strong>{fs.driver_name}</strong> &mdash; Shift crossed Sunday midnight. <em>Automatically split for payroll processing.</em>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                );
              })()}

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
                          if (rows.length === 0) return <tr><td colSpan={7} className="text-center text-muted">No data available for summary</td></tr>;

                          return rows.map((row: any) => (
                             <tr key={row.driver_code}>
                                <td className="font-bold text-primary">{row.driver_name} ({row.driver_code})</td>
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
                  <div className="payroll-table-wrap">
                    <table className="payroll-table">
                      <thead>
                        <tr>
                          <th style={{ width: '36px' }}>
                             <input
                                type="checkbox"
                                style={{ cursor: 'pointer', width: '15px', height: '15px' }}
                                checked={filteredShifts.length > 0 && selectedShiftIds.size === new Set(filteredShifts.map(s => s.real_id || s.id)).size}
                                onChange={(e) => {
                                   if (e.target.checked) {
                                       setSelectedShiftIds(new Set(filteredShifts.map(s => s.real_id || s.id)));
                                   } else {
                                       setSelectedShiftIds(new Set());
                                   }
                                }}
                             />
                          </th>
                          <th>Driver Name &amp; ID</th>
                          <th>Fleet Agency</th>
                          <th>Shift Schedule</th>
                          <th>Hours</th>
                          <th>Hourly Rate</th>
                          <th>Night Out Allowance</th>
                          <th>Flags &amp; Actions</th>
                          <th>Gross Pay (£)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredShifts.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="text-center text-muted">No completed shifts found matching active filters</td>
                          </tr>
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
                            const isFlagged = ((shiftEndMs - shiftStartMs) / (1000 * 60 * 60)) > 18;

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
                                <td onClick={(e) => e.stopPropagation()}>
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
                                <td className="font-bold text-primary">
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <span>{shift.driver_name}</span>
                                    <span className="text-xs text-muted" style={{ fontWeight: 500 }}>{shift.driver_code}</span>
                                    {isRequested && (
                                      <span className="badge text-xs font-bold" style={{ backgroundColor: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D', alignSelf: 'flex-start', padding: '2px 6px', fontSize: '10px' }}>
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
                                          <span style={{ fontSize: '13px', fontWeight: '600' }}>
                                            {startDateStr} <span style={{ fontWeight: 'normal', color: '#6B7280' }}>{startTimeStr}</span>
                                          </span>
                                          <span style={{ fontSize: '13px', fontWeight: '600' }}>
                                            {endDateStr} <span style={{ fontWeight: 'normal', color: '#6B7280' }}>{endTimeStr}</span>
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
                                </td>
                                <td>
                                  {shift.end_time ? (
                                    `${(shift.total_hours || 0).toFixed(2)} hrs`
                                  ) : isStaleOrphan ? (
                                    <span className="font-bold" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#7C3AED' }}>
                                      <span style={{ width: '6px', height: '6px', backgroundColor: '#7C3AED', borderRadius: '50%', display: 'inline-block' }}></span>
                                      {liveHours.toFixed(2)} hrs (stuck)
                                    </span>
                                  ) : (
                                    <span className="text-success font-bold" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <span style={{ width: '6px', height: '6px', backgroundColor: '#10B981', borderRadius: '50%', display: 'inline-block', boxShadow: '0 0 6px #10B981' }}></span>
                                      {liveHours.toFixed(2)} hrs
                                    </span>
                                  )}
                                </td>
                                <td className="font-semibold">
                                  {isFixedRate ? (
                                    <span style={{ fontWeight: 'bold', color: '#4F46E5' }}>
                                      £{startRateVal.toFixed(2)} <span style={{ fontSize: '11px', fontWeight: 'normal', color: '#6B7280' }}>(Fixed/Shift)</span>
                                    </span>
                                  ) : startDay !== endDay && startRateVal !== endRateVal ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                       <span style={{ fontSize: '13px' }}>£{startRateVal.toFixed(2)}/hr</span>
                                       <span style={{ fontSize: '11px', color: '#6B7280' }}>→ £{endRateVal.toFixed(2)}/hr</span>
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
                                      <span className="badge text-xs" style={{ backgroundColor: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D', padding: '2px 6px', fontWeight: 'bold', marginRight: '6px' }}>
                                        SPLIT
                                      </span>
                                    )}
                                    {isFlagged && <span className="badge badge-danger text-xs" style={{ backgroundColor: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5' }}>&gt;18h</span>}
                                    {isStaleOrphan && (
                                      <span
                                        className="badge text-xs font-bold"
                                        style={{ backgroundColor: '#EDE9FE', color: '#6D28D9', border: '1px solid #C4B5FD' }}
                                        title="This driver has a newer shift — this one was never closed and is not actually in progress."
                                      >
                                        ⚠ STUCK — NEVER CLOCKED OUT
                                      </span>
                                    )}
                                    {!shift.end_time && (
                                      <button
                                        className="payroll-mini-btn"
                                        style={isStaleOrphan ? { borderColor: '#C4B5FD', color: '#6D28D9' } : undefined}
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
                                      <div className="text-xs text-gray-500 italic mt-1" style={{ fontSize: '11px', color: '#6B7280', fontStyle: 'italic', width: '100%' }}>
                                        Note: {shift.extras_note}
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="font-bold text-success">
                                  £{shiftGrossPay.toFixed(2)}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

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

      {/* Unified Edit Payroll Modal (N/O & Extras) */}
      {actionModal && actionModal.isOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="modal-content glass-panel" style={{ width: '450px', padding: '28px', borderRadius: '16px', backgroundColor: '#ffffff', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid #E5E7EB' }}>
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
      {/* Edit Employee Profile Modal */}
      {editingEmployee && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="modal-content glass-panel" style={{ width: '480px', padding: '28px', borderRadius: '16px', backgroundColor: '#ffffff', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid #E5E7EB' }}>
            <div className="flex justify-between align-center mb-6" style={{ borderBottom: '2px solid #F3F4F6', paddingBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 className="text-xl font-black text-primary m-0" style={{ margin: 0, fontSize: '18px', color: '#111827' }}>Edit Employee Profile</h2>
                <p className="text-xs text-muted mt-1" style={{ fontSize: '12px', color: '#6B7280', margin: '4px 0 0 0' }}>Update details or reset login PIN for {editingEmployee.full_name}</p>
              </div>
              <button 
                type="button" 
                onClick={() => setEditingEmployee(null)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#9CA3AF' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateEmployee}>
              <div className="form-group mb-4" style={{ marginBottom: '14px' }}>
                <label className="text-xs font-bold text-muted block mb-1" style={{ display: 'block', marginBottom: '4px', fontSize: '11px', color: '#4B5563', fontWeight: 'bold' }}>EMPLOYEE FULL NAME</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>

              <div className="form-group mb-4" style={{ marginBottom: '14px' }}>
                <label className="text-xs font-bold text-muted block mb-1" style={{ display: 'block', marginBottom: '4px', fontSize: '11px', color: '#4B5563', fontWeight: 'bold' }}>USERNAME / EMPLOYEE ID</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>

              <div className="form-group mb-4" style={{ marginBottom: '14px' }}>
                <label className="text-xs font-bold text-muted block mb-1" style={{ display: 'block', marginBottom: '4px', fontSize: '11px', color: '#4B5563', fontWeight: 'bold' }}>PHONE NUMBER</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="+44 7700 900100"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>

              <div className="form-group mb-6" style={{ marginBottom: '20px' }}>
                <label className="text-xs font-bold text-muted block mb-1" style={{ display: 'block', marginBottom: '4px', fontSize: '11px', color: '#4B5563', fontWeight: 'bold' }}>NEW PIN / PASSWORD (OPTIONAL)</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={editNewPin}
                  onChange={(e) => setEditNewPin(e.target.value)}
                  placeholder="Enter new PIN to reset, or leave blank to keep current"
                  maxLength={6}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '14px', boxSizing: 'border-box' }}
                />
                <p className="text-xs text-muted mt-1" style={{ color: '#6B7280', fontSize: '11px', marginTop: '4px' }}>Leave blank to keep existing PIN unchanged.</p>
              </div>

              {editEmployeeError && (
                <div className="text-error text-sm font-semibold mb-4" style={{ color: '#EF4444', marginBottom: '16px', fontSize: '13px' }}>
                  ⚠️ {editEmployeeError}
                </div>
              )}

              <div className="flex gap-12 justify-end" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
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
                  {isSavingEmployee ? 'SAVING...' : '💾 SAVE CHANGES'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
