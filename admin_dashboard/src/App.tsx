import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  Users, 
  Map as MapIcon, 
  AlertTriangle, 
  FileSpreadsheet, 
  TrendingUp, 
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
  DollarSign
} from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import abtsoLogo from './assets/logo_transparent.png';

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

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('admin_session') === 'true';
  });
  const [userRole, setUserRole] = useState<UserRole>(() => {
    return (localStorage.getItem('admin_role') as UserRole) || 'payroll_admin';
  });
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [activeTab, setActiveTab] = useState<'live' | 'alerts' | 'drivers' | 'rates' | 'reports'>('live');

  // Route Guard: enforce that logistics role cannot access rates or reports tabs
  useEffect(() => {
    if (userRole === 'logistics' && (activeTab === 'rates' || activeTab === 'reports')) {
      setActiveTab('live');
    }
  }, [userRole, activeTab]);

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
  const [newEmployeePin, setNewEmployeePin] = useState('');
  const [crudError, setCrudError] = useState('');

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
  const [reportDateStart, setReportDateStart] = useState('');
  const [reportDateEnd, setReportDateEnd] = useState('');
  const [showOnlyNightOutRequested, setShowOnlyNightOutRequested] = useState(false);
  const [reportViewMode, setReportViewMode] = useState<'detailed' | 'summary'>('detailed');
  const [selectedShiftIds, setSelectedShiftIds] = useState<Set<string>>(new Set());

  // Leaflet Map Reference
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<{ [key: string]: L.Marker }>({});

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
      setEmployees(drvs || []);

      if (drvs && activeRole === 'payroll_admin') {
        const ratesMap: Record<string, EmployeeRate> = {};

        drvs.forEach((d: any) => {
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

          const mappedRate: EmployeeRate = {
            id: d.id,
            driver_id: d.id,
            rate_type: rateTypeVal,
            fixed_rate: fixedRateVal,
            mon_fri_rate: baseHourly,
            saturday_rate: satHourly,
            sunday_rate: sunHourly,
            sat_rate: satHourly,
            sun_rate: sunHourly,
            agency_name: d.agency_name || 'Direct',
          };
          ratesMap[d.id] = mappedRate;
          if (d.driver_id) {
            ratesMap[d.driver_id] = mappedRate;
          }
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
        for (const item of viewLocs) {
          // Check if driver has an active shift without end_time
          const drvLatestShift = (mappedShifts || []).find((s: any) => 
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

    const { data: { subscription } } = supabase!.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setIsAuthenticated(true);
        localStorage.setItem('admin_session', 'true');
      } else {
        setIsAuthenticated(false);
        localStorage.removeItem('admin_session');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

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
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    if (isMockMode) {
      if (loginEmail === 'logistics@abtso.co.uk' && loginPassword === 'logistics123') {
        setIsAuthenticated(true);
        setUserRole('logistics');
        localStorage.setItem('admin_session', 'true');
        localStorage.setItem('admin_role', 'logistics');
        setActiveTab('live');
      } else if (
        (loginEmail === 'payroll@abtso.co.uk' || loginEmail === 'admin@abtso.co.uk') && 
        (loginPassword === 'payroll123' || loginPassword === 'admin123')
      ) {
        setIsAuthenticated(true);
        setUserRole('payroll_admin');
        localStorage.setItem('admin_session', 'true');
        localStorage.setItem('admin_role', 'payroll_admin');
      } else {
        setLoginError('Invalid email or password. Use payroll@abtso.co.uk / payroll123 OR logistics@abtso.co.uk / logistics123');
      }
      return;
    }

    try {
      const { data: authData, error } = await supabase!.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });

      if (error) {
        setLoginError(error.message);
      } else {
        setIsAuthenticated(true);
        localStorage.setItem('admin_session', 'true');

        // Look up role from database
        let resolvedRole: UserRole = 'logistics';
        if (authData.user) {
          const { data: roleRes } = await supabase!
            .from('user_roles')
            .select('role')
            .eq('user_id', authData.user.id)
            .maybeSingle();

          if (roleRes?.role) {
            resolvedRole = roleRes.role as UserRole;
          } else if (loginEmail.includes('payroll') || loginEmail.includes('admin')) {
            resolvedRole = 'payroll_admin';
          }
        }

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

    const cleanCode = newEmployeeCode.trim().toUpperCase();
    const cleanName = newEmployeeName.trim();
    const cleanPhone = newEmployeePhone.trim();
    const cleanPin = newEmployeePin.trim();

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
        setNewEmployeePin('');
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

  const handleNightOutAmount = async (shiftId: string, currentAllowance: number | null | undefined) => {
    const defaultAmount = (currentAllowance && currentAllowance > 0) ? currentAllowance.toString() : "30";
    const userInput = window.prompt(
      "Enter the Night Out allowance amount (£) for this shift:\n(Enter 0 or leave empty to remove it)", 
      defaultAmount
    );

    if (userInput === null) return; // User cancelled

    const amount = parseFloat(userInput);
    let newAllowance: number | null = null;

    if (!isNaN(amount) && amount > 0) {
      newAllowance = amount;
    } // If 0 or invalid, it stays null (removes the allowance)

    const targetShift = shifts.find(s => s.id === shiftId);
    if (!targetShift) return;

    let calculatedGrossPay = 0;
    const hasStoredPay = targetShift.status === 'completed' && targetShift.total_pay !== null && targetShift.total_pay !== undefined;

    if (hasStoredPay) {
        // Pure Math: (Current Total) - (Old Allowance) + (New Allowance)
        const oldNoAmt = Number(targetShift.night_out_allowance ?? targetShift.night_out_amount) || 0;
        calculatedGrossPay = Number((Number(targetShift.total_pay) - oldNoAmt + (newAllowance || 0)).toFixed(2));
    } else {
        // For active shifts, let the engine calculate it
        const simulatedShift = { ...targetShift, night_out_allowance: newAllowance, night_out_amount: newAllowance };
        calculatedGrossPay = getShiftFinancials(simulatedShift as any).grossPay;
    }

    const updatePayload: any = {
      night_out_amount: newAllowance ?? 0,
      night_out_status: newAllowance ? 'approved' : 'none',
      total_pay: calculatedGrossPay
    };

    let { error } = await supabase!
      .from('shifts')
      .update(updatePayload)
      .eq('id', shiftId);

    if (!error) {
      // Safely try updating night_out_allowance column if migration 024 was executed
      try {
        await supabase!
          .from('shifts')
          .update({ night_out_allowance: newAllowance })
          .eq('id', shiftId);
      } catch (_) {}
    }

    if (error) {
      alert("Failed to update Night Out allowance: " + error.message);
    } else {
      await loadData(); // Refresh UI and recalculate payroll
    }
  };

  const handleEditExtras = async (shiftId: string, currentAmount: number | null, currentNote: string | null) => {
    const noteInput = window.prompt("Enter a note for this extra charge/bonus (e.g., 'Tolls', 'Damage'):", currentNote || "");
    if (noteInput === null) return; // Cancelled

    const amountInput = window.prompt("Enter the amount (£). Use negative numbers for deductions:", currentAmount?.toString() || "0");
    if (amountInput === null) return; // Cancelled

    const amount = parseFloat(amountInput);
    if (isNaN(amount)) {
       alert("Invalid amount.");
       return;
    }

    const targetShift = shifts.find(s => s.id === shiftId);
    if (!targetShift) return;

    let calculatedGrossPay = 0;
    const hasStoredPay = targetShift.status === 'completed' && targetShift.total_pay !== null && targetShift.total_pay !== undefined;

    if (hasStoredPay) {
        // Pure Math: (Current Total) - (Old Extras) + (New Extras)
        const oldExtras = Number(targetShift.extras_amount) || 0;
        calculatedGrossPay = Number((Number(targetShift.total_pay) - oldExtras + amount).toFixed(2));
    } else {
        // For active shifts, let the engine calculate it from scratch
        const simulatedShift = { ...targetShift, extras_amount: amount };
        calculatedGrossPay = getShiftFinancials(simulatedShift as any).grossPay;
    }

    const extrasPayload: any = {
      extras_amount: amount,
      extras_note: noteInput,
      total_pay: calculatedGrossPay
    };

    // Update DB
    const { error } = await supabase!
      .from('shifts')
      .update(extrasPayload)
      .eq('id', shiftId);

    if (error) {
       alert("Database Error saving extras: " + error.message);
    } else {
       await loadData(); // Hard refresh to sync UI perfectly
    }
  };

  const handleBulkNightOut = async () => {
    if (selectedShiftIds.size === 0) return;
    const userInput = window.prompt(`Apply Night Out allowance (£) to ${selectedShiftIds.size} shift(s):\n(Enter 0 to remove)`, "30");
    if (userInput === null) return;
    const amount = parseFloat(userInput);
    const newAllowance = (!isNaN(amount) && amount > 0) ? amount : null;

    for (const shiftId of Array.from(selectedShiftIds)) {
       const targetShift = shifts.find(s => s.id === shiftId);
       if (!targetShift) continue;
       
       let calculatedGrossPay = 0;
       const hasStoredPay = targetShift.status === 'completed' && targetShift.total_pay !== null && targetShift.total_pay !== undefined;

       if (hasStoredPay) {
           const oldNoAmt = Number(targetShift.night_out_allowance ?? targetShift.night_out_amount) || 0;
           calculatedGrossPay = Number((Number(targetShift.total_pay) - oldNoAmt + (newAllowance || 0)).toFixed(2));
       } else {
           const simulatedShift = { ...targetShift, night_out_allowance: newAllowance, night_out_amount: newAllowance };
           calculatedGrossPay = getShiftFinancials(simulatedShift as any).grossPay;
       }

       await supabase!.from('shifts').update({
         night_out_amount: newAllowance ?? 0,
         night_out_status: newAllowance ? 'approved' : 'none',
         total_pay: calculatedGrossPay
       }).eq('id', shiftId);
    }
    setSelectedShiftIds(new Set());
    await loadData();
  };

  const handleBulkExtras = async () => {
    if (selectedShiftIds.size === 0) return;
    const noteInput = window.prompt("Enter note for Extras/Deductions for ALL selected shifts:");
    if (noteInput === null) return;
    const amountInput = window.prompt("Enter amount (£) for ALL selected shifts (use negative for deduction):", "0");
    if (amountInput === null) return;
    const amount = parseFloat(amountInput);
    if (isNaN(amount)) { alert("Invalid amount."); return; }

    for (const shiftId of Array.from(selectedShiftIds)) {
       const targetShift = shifts.find(s => s.id === shiftId);
       if (!targetShift) continue;

       let calculatedGrossPay = 0;
       const hasStoredPay = targetShift.status === 'completed' && targetShift.total_pay !== null && targetShift.total_pay !== undefined;

       if (hasStoredPay) {
           const oldExtras = Number(targetShift.extras_amount) || 0;
           calculatedGrossPay = Number((Number(targetShift.total_pay) - oldExtras + amount).toFixed(2));
       } else {
           const simulatedShift = { ...targetShift, extras_amount: amount };
           calculatedGrossPay = getShiftFinancials(simulatedShift as any).grossPay;
       }

       await supabase!.from('shifts').update({
         extras_amount: amount,
         extras_note: noteInput,
         total_pay: calculatedGrossPay
       }).eq('id', shiftId);
    }
    setSelectedShiftIds(new Set());
    await loadData();
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

    // CRITICAL: Update drivers table. Keep hourly cols populated (non-null)
    // so the DB always has readable rate data regardless of schema cache state.
    const driverPayload: any = {
      rate_type: isFixed ? 'Fixed Shift Rate (Day Rate)' : 'Hourly',
      fixed_rate: isFixed ? parsedFixed : null,
      // Keep hourly fields populated always — display logic uses rate_type to decide rendering
      mon_fri_rate: parsedMonFri,
      saturday_rate: parsedSat,
      sunday_rate: parsedSun,
      hourly_rate: isFixed ? parsedFixed : parsedMonFri,
      agency_name: editAgencyName || 'Direct'
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
      agency_name: editAgencyName || 'Direct',
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
      agency_name: localDisplayRate.agency_name
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
    // 1. Determine if this shift has a LOCKED historical snapshot.
    // We only consider it historically locked if there's a custom explicit pay override, 
    // NOT just because it has a generic base rate which might be stale.
    const hasStoredPay = s.total_pay !== null && s.total_pay !== undefined;
    const hasHistoricalSnapshot = s.status === 'completed' && hasStoredPay;

    // 2. Resolve the Rate Source
    const drvRate = hasHistoricalSnapshot 
      ? null 
      : (employeeRates[s.driver_id] || (s as any).employee || (s as any).drivers || (s as any).driver);

    // Extract raw numbers safely
    const historicalTotalPay = hasStoredPay ? Number(s.total_pay) : null;
    const storedNoAmt = Number(s.night_out_allowance ?? s.night_out_amount) || 0;
    const storedExtras = Number(s.extras_amount) || 0;
    const historicalBasePay = historicalTotalPay !== null ? (historicalTotalPay - storedNoAmt - storedExtras) : null;

    // Determine historical rate by reverse math if total pay exists
    const reverseEngineeredRate = (historicalBasePay !== null && s.total_hours) ? (historicalBasePay / s.total_hours) : null;
    const historicalRateValue = reverseEngineeredRate || Number(s.effective_rate) || Number(s.base_hourly_rate) || 0;

    // SMART DETECTION: Is it fixed?
    const isHistoricallyFixed = hasHistoricalSnapshot && (
      (s as any).rate_type === 'Fixed Shift Rate (Day Rate)' || 
      (s as any).rate_type === 'Fixed' || 
      historicalRateValue > 35 ||
      (historicalBasePay !== null && s.total_hours && Math.abs(historicalBasePay - (Number(s.total_hours) * historicalRateValue)) > 5)
    );

    const isFixedRate = isHistoricallyFixed || Boolean(drvRate?.rate_type && (
      drvRate.rate_type.toLowerCase().includes('fixed') || 
      drvRate.rate_type.toLowerCase().includes('day') || 
      drvRate.rate_type.toLowerCase().includes('flat')
    ));

    const startObj = new Date(s.start_time);
    const endObj = s.end_time ? new Date(s.end_time) : null;
    
    const startDay = startObj.getDay();
    const endDay = endObj ? endObj.getDay() : startDay;

    // 3. Rate determination logic
    const getRateForDay = (day: number) => {
      // If historically fixed, return the flat pay, BUT if it's a split boundary, show the full original rate
      if (hasHistoricalSnapshot && isHistoricallyFixed) {
        if ((s as any).is_week_boundary) {
          return Number(s.effective_rate) || Number(s.base_hourly_rate) || 150.00;
        }
        return historicalBasePay !== null ? historicalBasePay : historicalRateValue;
      }

      // Use explicit profile rates based strictly on the day of the week
      if (drvRate) {
        if (isFixedRate) return Number(drvRate.fixed_rate) || Number((drvRate as any).hourly_rate) || Number(drvRate.mon_fri_rate) || 16.00;
        if (day === 0) return Number(drvRate.sunday_rate)   || Number(drvRate.sun_rate)  || Number(drvRate.mon_fri_rate) || 18.00;
        if (day === 6) return Number(drvRate.saturday_rate) || Number(drvRate.sat_rate)  || Number(drvRate.mon_fri_rate) || 17.00;
        return Number(drvRate.mon_fri_rate) || 16.00;
      }
      
      // Fallback to absolute DB values only if no profile exists
      return historicalRateValue || 16.00;
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
    } else {
      // If shift is completed and has a hardcoded total pay snapshot, use it (unless we are manually editing extras right now)
      if (hasHistoricalSnapshot && s.total_pay !== null && s.total_pay !== undefined && !isFixedRate) {
        const storedNoAmt = Number(s.night_out_allowance ?? s.night_out_amount) || 0;
        const storedExtras = Number(s.extras_amount) || 0;
        basePay = Number(s.total_pay) - storedNoAmt - storedExtras;
        
        if (basePay < 0) basePay = (s.total_hours || 0) * startRateVal;
      } else {
        basePay = s.end_time 
          ? calculateSplitShiftPay(s.start_time, s.end_time, drvRate)
          : (s.total_hours || 0) * startRateVal;
      }
    }

    const noAmt = Number(s.night_out_allowance ?? s.night_out_amount) || 0;
    const extrasAmt = Number(s.extras_amount) || 0;
    
    let grossPay = 0;
    if (hasHistoricalSnapshot && s.total_pay !== null && s.total_pay !== undefined) {
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
      agency: drvRate?.agency_name || 'Direct' 
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
      mapRef.current = L.map('live-dispatch-map').setView([53.5160, -1.0880], 11);

      // Always use bright CartoDB Positron tiles to match ABTSO brand
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; CartoDB',
        maxZoom: 20
      }).addTo(mapRef.current);

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
  if (!isAuthenticated) {
    return (
      <div className="flex align-center justify-center min-h-screen p-16" style={{ backgroundColor: '#FFFFFF' }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E0E0E0', borderRadius: '16px', padding: '40px', width: '100%', maxWidth: '420px' }}>
          <div className="text-center mb-24">
            {/* ABTSO Brand Logo Mark */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
              <img src={abtsoLogo} onError={(e) => { (e.target as HTMLImageElement).src = '/logo.png'; }} alt="ABTSO Logo" style={{ height: '54px', width: 'auto', objectFit: 'contain' }} />
            </div>
            <h1 className="text-2xl font-black m-0" style={{ color: '#333333', letterSpacing: '0.5px' }}>Dispatch Console</h1>
            <p className="text-sm mt-4" style={{ color: '#888888' }}>Administrator Access Only</p>
          </div>

          <form onSubmit={handleLogin}>
            <div className="input-group">
              <span className="input-label">ADMINISTRATOR EMAIL</span>
              <input
                type="email"
                className="input-field"
                placeholder="admin@abtso.co.uk"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                required
              />
            </div>

            <div className="input-group">
              <span className="input-label">PASSWORD</span>
              <input
                type="password"
                className="input-field"
                placeholder="••••••••"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
              />
            </div>

            {loginError && (
              <div className="text-error text-sm font-semibold mb-16 flex align-center gap-8">
                <ShieldAlert size={15} />
                {loginError}
              </div>
            )}

            <button type="submit" className="btn btn-primary w-full mt-8">
              SECURE AUTHORIZE
            </button>
          </form>

          {isMockMode && (
            <div className="mt-24 p-12 text-center text-xs text-muted" style={{ border: '1px dashed var(--border-color)', borderRadius: '6px' }}>
              ℹ️ Sandbox Mock Mode Active<br/>
              <b>Payroll Admin:</b> <span className="text-secondary font-mono">payroll@abtso.co.uk</span> / <span className="text-secondary font-mono">payroll123</span><br/>
              <b>Logistics:</b> <span className="text-secondary font-mono">logistics@abtso.co.uk</span> / <span className="text-secondary font-mono">logistics123</span>
            </div>
          )}
        </div>
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
      <div className="sidebar p-24 flex flex-col justify-between">
        <div>
          {/* ABTSO Brand Logo in sidebar */}
          <div className="flex align-center gap-12 mb-32">
            <img src={abtsoLogo} onError={(e) => { (e.target as HTMLImageElement).src = '/logo.png'; }} alt="ABTSO Logo" style={{ height: '32px', width: 'auto', objectFit: 'contain' }} />
            <div>
              <h2 className="text-md font-black m-0" style={{ color: '#333333', letterSpacing: '0.5px' }}>DISPATCH</h2>
              <span className="text-xs text-muted">
                {userRole === 'payroll_admin' ? 'PAYROLL ADMIN' : 'LOGISTICS'} CONSOLE
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-8">
            <div className={`nav-item ${activeTab === 'live' ? 'active' : ''}`} onClick={() => setActiveTab('live')}>
              <MapIcon size={18} /> Live Dispatch Board
            </div>
            
            <div className={`nav-item ${activeTab === 'alerts' ? 'active' : ''}`} onClick={() => setActiveTab('alerts')}>
              <AlertTriangle size={18} /> 
              Alert Monitors 
              {activeAlertsCount > 0 && (
                <span className="badge badge-danger text-xs px-8 ml-8" style={{ padding: '2px 6px', borderRadius: '8px' }}>
                  {activeAlertsCount}
                </span>
              )}
            </div>

            <div className={`nav-item ${activeTab === 'drivers' ? 'active' : ''}`} onClick={() => setActiveTab('drivers')}>
              <Users size={18} /> Driver Profiles
            </div>

            {userRole === 'payroll_admin' && (
              <>
                <div className={`nav-item ${activeTab === 'rates' ? 'active' : ''}`} onClick={() => setActiveTab('rates')}>
                  <DollarSign size={18} /> Rates & Agencies
                </div>

                <div className={`nav-item ${activeTab === 'reports' ? 'active' : ''}`} onClick={() => setActiveTab('reports')}>
                  <FileSpreadsheet size={18} /> Payroll Calculator
                  {pendingNightOutsCount > 0 && (
                    <span className="badge badge-warning text-xs px-8 ml-8" style={{ padding: '2px 6px', borderRadius: '8px', backgroundColor: '#F59E0B', color: '#FFFFFF' }}>
                      {pendingNightOutsCount} N/O
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div>
          <div className="p-12 text-center text-xs text-muted mb-16" style={{ border: '1px dashed rgba(255,255,255,0.08)', borderRadius: '10px' }}>
            <span className="font-bold uppercase" style={{ color: userRole === 'payroll_admin' ? '#10B981' : '#3B82F6' }}>
              {userRole === 'payroll_admin' ? '🛡️ Payroll Admin' : '🚚 Logistics Role'}
            </span>
          </div>

          <div className="nav-item text-error" onClick={handleLogout}>
            <LogOut size={18} /> Terminate Session
          </div>
        </div>
      </div>

      {/* ── Main Dashboard Content ─────────────────────────── */}
      <div className="p-32 flex flex-col overflow-auto" style={{ height: '100vh' }}>
        
        {/* Header Stats Row */}
        <div className="stats-grid">
          <div className="glass-card p-16">
            <div className="flex align-center justify-between">
              <span className="text-xs text-secondary font-bold" style={{ letterSpacing: '1px' }}>ACTIVE SHIFTS</span>
              <Clock size={16} className="text-accent" />
            </div>
            <h2 className="text-2xl font-black mt-8 text-primary">{activeEmployeeCount}</h2>
            <span className="text-xs text-muted">Employees logged in</span>
          </div>

          <div className="glass-card p-16">
            <div className="flex align-center justify-between">
              <span className="text-xs text-secondary font-bold" style={{ letterSpacing: '1px' }}>HGV IDLE ALERTS</span>
              <AlertTriangle size={16} className="text-error" />
            </div>
            <h2 className="text-2xl font-black mt-8 text-primary">{activeAlertsCount}</h2>
            <span className="text-xs text-muted">Stops &gt; 50 mins (Break)</span>
          </div>

          <div className="glass-card p-16">
            <div className="flex align-center justify-between">
              <span className="text-xs text-secondary font-bold" style={{ letterSpacing: '1px' }}>COMPLETED SHIFTS</span>
              <TrendingUp size={16} className="text-success" />
            </div>
            <h2 className="text-2xl font-black mt-8 text-primary">{completedShiftsCount}</h2>
            <span className="text-xs text-muted">Calculated shifts</span>
          </div>

          {userRole === 'payroll_admin' ? (
            <div className="glass-card p-16">
              <div className="flex align-center justify-between">
                <span className="text-xs text-secondary font-bold" style={{ letterSpacing: '1px' }}>GROSS PAYROLL</span>
                <FileSpreadsheet size={16} className="text-warning" />
              </div>
              <h2 className="text-2xl font-black mt-8 text-primary">£{(totalWeeklyPayout || 0).toFixed(2)}</h2>
              <span className="text-xs text-muted">Calculated gross pay</span>
            </div>
          ) : (
            <div className="glass-card p-16">
              <div className="flex align-center justify-between">
                <span className="text-xs text-secondary font-bold" style={{ letterSpacing: '1px' }}>ACTIVE DEPOTS</span>
                <Compass size={16} className="text-accent" />
              </div>
              <h2 className="text-2xl font-black mt-8 text-primary">2 STATIONS</h2>
              <span className="text-xs text-muted">Rossington & Wheatley</span>
            </div>
          )}
        </div>

        {/* ── TAB 1: Live Dispatch Board ───────────────────── */}
        {activeTab === 'live' && (
          <div className="flex-1 grid gap-24" style={{ gridTemplateRows: '1fr auto', minHeight: 0 }}>
            {/* Live map layout */}
            <div style={{ position: 'relative', height: '480px' }}>
              <div id="live-dispatch-map" className="h-full w-full"></div>
              
              {/* Floating Map Refresh Button */}
              <button
                className={`btn btn-secondary flex align-center gap-8 ${isRefreshing ? 'loading-pulse' : ''}`}
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  zIndex: 1000,
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                  borderRadius: '12px',
                  padding: '8px 16px',
                  backgroundColor: '#FFFFFF',
                  color: '#333333',
                  border: '1px solid #E2E8F0',
                  fontWeight: 900,
                  fontSize: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                }}
                onClick={handleMapRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw size={14} className={isRefreshing ? 'spin-animation' : ''} style={{ marginRight: '6px' }} />
                {isRefreshing ? 'REFRESHING...' : 'REFRESH POSITIONS'}
              </button>
            </div>

            {/* Live Telemetry lists */}
            <div className="glass-panel p-20" style={{ borderRadius: '16px' }}>
              <h3 className="text-md font-bold text-primary mb-12 flex align-center gap-8">
                <Compass size={18} className="text-accent" />
                Active Telemetry Feed
              </h3>
              
              <div className="table-container">
                <table className="data-table">
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
                      <tr>
                        <td colSpan={5} className="text-center text-muted">No employees currently logged into shifts</td>
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
                        onChange={(e) => setNewEmployeeName(e.target.value)}
                      />
                    </div>
                    <div className="input-group">
                      <span className="input-label">EMPLOYEE ID (CODE)</span>
                      <input 
                        type="text" 
                        className="input-field" 
                        placeholder="EMP-004"
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
                        type="password" 
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
                    // Find latest shift for time tracking
                    const driverShifts = shifts.filter(s => s.driver_id === drv.id || s.driver_id === drv.driver_id);
                    const latestShift = driverShifts.length > 0 ? driverShifts[0] : null;
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
                    const currentRate = employeeRates[emp.id] || employeeRates[emp.driver_id] || {
                      driver_id: emp.id,
                      rate_type: (emp as any).rate_type || 'Hourly',
                      mon_fri_rate: Number((emp as any).mon_fri_rate ?? emp.hourly_rate) || 16.00,
                      sat_rate: Number((emp as any).saturday_rate) || 17.00,
                      sun_rate: Number((emp as any).sunday_rate) || 18.00,
                      agency_name: (emp as any).agency_name || 'Direct',
                    };
                    const isEditing = editingRateDriverId === emp.id;
                    const isFixedRate = currentRate.rate_type === 'Fixed' || Boolean(currentRate.rate_type && currentRate.rate_type.toLowerCase().includes('fixed'));

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
                            <span className="badge badge-accent">{currentRate.agency_name}</span>
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
          const totalHours = filteredShifts.reduce((sum, s) => sum + (s.total_hours || 0), 0);
          const totalNightOutAmount = filteredShifts.reduce((sum, shift) => sum + (Number(shift.night_out_allowance ?? shift.night_out_amount) || 0), 0);
          const nightOutCount = filteredShifts.filter(shift => (Number(shift.night_out_allowance ?? shift.night_out_amount) || 0) > 0).length;

          // Collect unique agencies for filter dropdown
          const agencies = Array.from(new Set(Object.values(employeeRates).map(r => r.agency_name || 'Direct')));

          return (
            <div className="flex-1">
              <h2 className="text-xl font-black text-primary mb-4">AUTOMATED PAYROLL CALCULATOR</h2>
              <p className="text-xs text-muted mb-24">Aggregating telemetry shifts with employee rate profiles and Night Out allowances</p>

              {/* Filter controls panel */}
              <div className="glass-panel p-20 mb-24 flex flex-wrap align-center justify-between gap-16" style={{ borderRadius: '16px' }}>
                <div className="flex flex-wrap gap-16">
                  <div className="flex flex-col gap-6">
                    <span className="input-label">FILTER BY AGENCY</span>
                    <select 
                      className="select-field"
                      value={reportAgencyFilter}
                      onChange={(e) => setReportAgencyFilter(e.target.value)}
                    >
                      <option value="all">All Agencies</option>
                      {agencies.map(ag => (
                        <option key={ag} value={ag}>{ag}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-6">
                    <span className="input-label">FILTER BY EMPLOYEE</span>
                    <select 
                      className="select-field"
                      value={reportEmployeeFilter}
                      onChange={(e) => setReportEmployeeFilter(e.target.value)}
                    >
                      <option value="all">Show All Employees</option>
                      {employees.map(d => (
                        <option key={d.id} value={d.id}>{d.full_name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-6">
                    <span className="input-label">START DATE</span>
                    <input 
                      type="date" 
                      className="input-field" 
                      value={reportDateStart}
                      onChange={(e) => setReportDateStart(e.target.value)}
                    />
                  </div>

                  <div className="flex flex-col gap-6">
                    <span className="input-label">END DATE</span>
                    <input 
                      type="date" 
                      className="input-field" 
                      value={reportDateEnd}
                      onChange={(e) => setReportDateEnd(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-6 justify-end">
                    <button 
                      className="btn flex align-center gap-6"
                      style={{ 
                        height: '38px', 
                        backgroundColor: showOnlyNightOutRequested ? '#D97706' : 'transparent',
                        borderColor: '#F59E0B',
                        color: showOnlyNightOutRequested ? '#FFFFFF' : '#D97706',
                        fontWeight: 'bold',
                        fontSize: '12px',
                        border: '1px solid #F59E0B'
                      }}
                      onClick={() => setShowOnlyNightOutRequested(!showOnlyNightOutRequested)}
                    >
                      🌙 {showOnlyNightOutRequested ? 'SHOWING REQUESTS ONLY' : 'FILTER N/O REQUESTS'} 
                      {pendingNightOutsCount > 0 && (
                        <span style={{ backgroundColor: showOnlyNightOutRequested ? '#FFFFFF' : '#F59E0B', color: showOnlyNightOutRequested ? '#D97706' : '#FFFFFF', padding: '2px 6px', borderRadius: '10px', fontSize: '11px', marginLeft: '4px' }}>
                          {pendingNightOutsCount}
                        </span>
                      )}
                    </button>
                  </div>
                </div>

                {/* Download actions */}
                <div className="flex gap-8 mt-16">
                  <button className="btn btn-secondary" onClick={exportCSV}>
                    <Download size={16} /> Export CSV
                  </button>
                  <button className="btn btn-primary" onClick={exportExcel}>
                    <FileSpreadsheet size={16} /> Export Excel
                  </button>
                </div>
              </div>

              {/* View Toggle & Bulk Actions Bar */}
              <div className="glass-panel mb-16 flex align-center justify-between" style={{ padding: '12px 16px', borderRadius: '12px', marginTop: '16px' }}>
                 <div className="flex gap-8">
                    <button 
                       className={`btn ${reportViewMode === 'detailed' ? 'btn-primary' : 'btn-secondary'}`}
                       style={{ fontWeight: 'bold' }}
                       onClick={() => setReportViewMode('detailed')}
                    >
                       ☰ DETAILED VIEW
                    </button>
                    <button 
                       className={`btn ${reportViewMode === 'summary' ? 'btn-primary' : 'btn-secondary'}`}
                       style={{ fontWeight: 'bold' }}
                       onClick={() => setReportViewMode('summary')}
                    >
                       📊 WEEKLY SUMMARY
                    </button>
                 </div>
                 
                 {reportViewMode === 'detailed' && (
                   <div className="flex align-center gap-12">
                      {selectedShiftIds.size > 0 ? (
                        <>
                          <span className="text-sm font-black text-primary">{selectedShiftIds.size} SELECTED</span>
                          <button className="btn btn-outline" style={{ borderColor: '#10B981', color: '#047857' }} onClick={handleBulkNightOut}>🌙 BULK N/O</button>
                          <button className="btn btn-outline" style={{ borderColor: '#3B82F6', color: '#1D4ED8' }} onClick={handleBulkExtras}>✏️ BULK EXTRAS</button>
                          <button className="btn btn-secondary text-xs" onClick={() => setSelectedShiftIds(new Set())}>CANCEL</button>
                        </>
                      ) : (
                        <span className="text-xs text-muted">Use checkboxes to edit multiple shifts at once</span>
                      )}
                   </div>
                 )}
              </div>

              {/* Flagged Shifts & Night Out Alert Banners */}
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
                      <div className="alert-box alert-danger" style={{ marginBottom: '24px', backgroundColor: '#FEF2F2', border: '1px solid #F87171', color: '#B91C1C', padding: '16px', borderRadius: '8px' }}>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 'bold' }}>⚠️ Flags to review (Shifts &gt; 18 hours)</h3>
                        <ul style={{ margin: '0', paddingLeft: '20px', fontSize: '14px' }}>
                          {flaggedShifts.map(fs => (
                            <li key={fs.id} style={{ marginBottom: '4px' }}>
                              <strong>{fs.driver_name}</strong> - Shift started: {new Date(fs.start_time).toLocaleString()} - <em>Check clock-out time!</em>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Render the Night out suggestions box */}
                    {nightOutSuggestions.length > 0 && (
                      <div className="alert-box alert-warning" style={{ marginBottom: '24px', backgroundColor: '#FFFBEB', border: '1px solid #FCD34D', color: '#92400E', padding: '16px', borderRadius: '8px' }}>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 'bold' }}>🌙 Night outs detected (8-15h break between shifts)</h3>
                        <ul style={{ margin: '0', paddingLeft: '20px', fontSize: '14px' }}>
                          {nightOutSuggestions.map((no, idx) => (
                            <li key={idx} style={{ marginBottom: '4px' }}>
                              <strong>{no.driverName}</strong> - Break between {new Date(no.prevEnd).toLocaleDateString()} {new Date(no.prevEnd).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} and {new Date(no.nextStart).toLocaleDateString()} {new Date(no.nextStart).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} | <em>Duration: {no.gapHours}h</em>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Render the Week Boundary Splits box */}
                    {weekBoundaryAlerts.length > 0 && (
                      <div className="alert-box alert-warning" style={{ marginBottom: '24px', backgroundColor: '#FFFBEB', border: '1px solid #FCD34D', color: '#92400E', padding: '16px', borderRadius: '8px' }}>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 'bold' }}>✂️ Week Boundary Splits (Sunday ➝ Monday)</h3>
                        <ul style={{ margin: '0', paddingLeft: '20px', fontSize: '14px' }}>
                          {weekBoundaryAlerts.map(fs => (
                            <li key={fs.id} style={{ marginBottom: '4px' }}>
                              <strong>{fs.driver_name}</strong> - Shift crossed Sunday midnight. <em>Automatically split for payroll processing.</em>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Reports Payroll Data Table / Dual View */}
              {reportViewMode === 'summary' ? (
                <div className="table-container">
                  <table className="data-table">
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
                           const { grossPay, noAmt, extrasAmt } = getShiftFinancials(shift);
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
                           summaryData[id].total_hours += (shift.total_hours || 0);
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
                              <td><span className="badge badge-accent">{row.agency}</span></td>
                              <td className="font-semibold">{row.shift_count}</td>
                              <td>{row.total_hours.toFixed(2)} hrs</td>
                              <td>{row.total_night_outs > 0 ? <span className="text-success font-bold">+{row.total_night_outs} (N/O)</span> : '—'}</td>
                              <td>{row.total_extras !== 0 ? <span className="text-primary font-bold">£{row.total_extras.toFixed(2)}</span> : '—'}</td>
                              <td className="font-black text-success text-md">£{row.total_gross.toFixed(2)}</td>
                           </tr>
                        ));
                      })()}
                      {/* Global summary row */}
                      <tr style={{ backgroundColor: 'rgba(16, 185, 129, 0.05)', fontWeight: 'bold', borderTop: '2px solid rgba(16, 185, 129, 0.2)' }}>
                        <td colSpan={3} className="text-primary font-black" style={{ padding: '16px' }}>GRAND TOTAL</td>
                        <td className="text-primary font-bold">{(totalHours || 0).toFixed(2)} hrs</td>
                        <td className="text-success font-bold">{nightOutCount}</td>
                        <td></td>
                        <td className="text-success font-black" style={{ fontSize: '15px' }}>£{totalEarnings.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ width: '40px' }}>
                           <input 
                              type="checkbox" 
                              style={{ cursor: 'pointer', width: '16px', height: '16px' }}
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
                        <th>Employee</th>
                        <th>Agency</th>
                        <th>Shift Schedule</th>
                        <th>Hours</th>
                        <th>Hourly Rate</th>
                        <th>Night Out Allowance</th>
                        <th>Flags & Actions</th>
                        <th>Gross Pay</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredShifts.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="text-center text-muted">No completed shifts found matching active filters</td>
                        </tr>
                      ) : (
                        <>
                          {filteredShifts.map(shift => {
                            const { 
                              startRateVal, 
                              endRateVal, 
                              startDay, 
                              endDay, 
                              isFixedRate,
                              noAmt: noAmount, 
                              grossPay: shiftGrossPay, 
                              agency 
                            } = getShiftFinancials(shift);

                            const shiftEndMs = shift.end_time ? new Date(shift.end_time).getTime() : Date.now();
                            const shiftStartMs = new Date(shift.start_time).getTime();
                            const isFlagged = ((shiftEndMs - shiftStartMs) / (1000 * 60 * 60)) > 18;

                            const isRequested = 
                              shift.night_out_requested === true || 
                              (shift as any).has_requested_night_out === true || 
                              shift.night_out_status === 'pending';

                            const hasNightOut = noAmount > 0 || isRequested;
                            const hasExtras = Boolean(shift.extras_amount && shift.extras_amount !== 0);

                            // Determine row background color based on priority
                            let rowStyle: React.CSSProperties = {};
                            if (isFlagged) {
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
                                    style={{ cursor: 'pointer', width: '16px', height: '16px' }}
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
                                    <span>{shift.driver_name} ({shift.driver_code})</span>
                                    {isRequested && (
                                      <span className="badge text-xs font-bold" style={{ backgroundColor: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D', alignSelf: 'flex-start', padding: '2px 6px', fontSize: '10px' }}>
                                        🔔 N/O REQUESTED
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td>
                                  <span className="badge badge-accent">{agency}</span>
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
                                <td>{(shift.total_hours || 0).toFixed(2)} hrs</td>
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
                                        ✂️ SPLIT
                                      </span>
                                    )}
                                    {isFlagged && <span className="badge badge-danger text-xs" style={{ backgroundColor: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5' }}>⚠️ &gt;18h</span>}
                                    <button 
                                      className="btn btn-secondary flex align-center gap-2" 
                                      style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 'bold' }}
                                      onClick={() => handleEditShiftTime(shift.real_id || shift.id, shift.start_time, shift.end_time)}
                                    >
                                      ✏️ EDIT TIME
                                    </button>

                                    <button 
                                      className="btn btn-outline flex align-center gap-2" 
                                      style={{ 
                                        padding: '4px 8px', 
                                        fontSize: '11px', 
                                        fontWeight: 'bold', 
                                        borderColor: (shift.night_out_allowance ?? shift.night_out_amount) ? '#10B981' : '#D1D5DB',
                                        color: (shift.night_out_allowance ?? shift.night_out_amount) ? '#047857' : '#4B5563',
                                        backgroundColor: (shift.night_out_allowance ?? shift.night_out_amount) ? '#ECFDF5' : 'transparent'
                                      }}
                                      onClick={() => handleNightOutAmount(shift.real_id || shift.id, shift.night_out_allowance ?? shift.night_out_amount)}
                                    >
                                      {(shift.night_out_allowance ?? shift.night_out_amount) ? `🌙 N/O: £${Number(shift.night_out_allowance ?? shift.night_out_amount).toFixed(2)} (EDIT)` : `🌙 + ADD N/O (£30)`}
                                    </button>

                                    <button 
                                      className="btn btn-outline flex align-center gap-2" 
                                      style={{ 
                                        padding: '4px 8px', 
                                        fontSize: '11px', 
                                        fontWeight: 'bold', 
                                        borderColor: shift.extras_amount ? '#3B82F6' : '#D1D5DB',
                                        color: shift.extras_amount ? '#1D4ED8' : '#4B5563',
                                        backgroundColor: shift.extras_amount ? '#EFF6FF' : 'transparent'
                                      }}
                                      onClick={() => handleEditExtras(shift.real_id || shift.id, shift.extras_amount ?? null, shift.extras_note ?? null)}
                                    >
                                      ✏️ Edit Extras {shift.extras_amount ? `(£${Number(shift.extras_amount).toFixed(2)})` : ''}
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
                          })}
                          {/* Summary Row */}
                          <tr style={{ backgroundColor: 'rgba(16, 185, 129, 0.05)', fontWeight: 'bold', borderTop: '2px solid rgba(16, 185, 129, 0.2)' }}>
                            <td colSpan={4} className="text-primary font-black" style={{ padding: '16px' }}>
                              TOTALS FOR SELECTED PERIOD ({filteredShifts.length} completed shifts | {nightOutCount} Night Outs: £{totalNightOutAmount.toFixed(2)})
                            </td>
                            <td className="text-primary font-bold" style={{ padding: '16px' }}>
                              {(totalHours || 0).toFixed(2)} hrs
                            </td>
                            <td></td>
                            <td></td>
                            <td></td>
                            <td className="text-success font-black" style={{ padding: '16px', fontSize: '15px' }}>
                              £{totalEarnings.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })()}

      </div>
    </div>
  );
}
