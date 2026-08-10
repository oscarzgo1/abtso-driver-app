import React, { useState, useEffect, useRef } from 'react';
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
import abtsoLogo from './assets/logo.jpg';

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

const isMockMode = 
  !supabaseUrl || 
  (!supabaseUrl.startsWith('http://') && !supabaseUrl.startsWith('https://')) ||
  supabaseUrl.includes('YOUR_PROJECT') || 
  supabaseUrl.includes('lewwfurlewlbgikzunsi');
let supabase: SupabaseClient | null = null;

if (!isMockMode) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
}

// Interfaces & Role Types
export type UserRole = 'logistics' | 'payroll_admin';

export interface EmployeeRate {
  id?: string;
  driver_id: string;
  rate_type: 'Hourly Sat/Sun separate' | 'Fixed weekly';
  mon_fri_rate: number;
  sat_rate: number;
  sun_rate: number;
  agency_name: string;
}

interface Employee {
  id: string;
  driver_id: string;
  full_name: string;
  phone: string;
  is_active: boolean;
  hourly_rate?: number;
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
  night_out_amount?: number;
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

  // Custom persistent local employees state
  const [customEmployees, setCustomEmployees] = useState<Employee[]>(() => {
    try {
      const saved = localStorage.getItem('custom_employees');
      return saved ? JSON.parse(saved) : [];
    } catch (_) {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('custom_employees', JSON.stringify(customEmployees));
    } catch (_) {}
  }, [customEmployees]);
  const [liveLocations, setLiveLocations] = useState<LiveLocation[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const mockProgressRef = useRef<{ [driverId: string]: { index: number; direction: 'forward' | 'backward'; waitTicks: number } }>({});

  // Audio Control
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const audioIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastSirenPlayRef = useRef<number>(0);

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
  const [editRateType, setEditRateType] = useState<'Hourly Sat/Sun separate' | 'Fixed weekly'>('Hourly Sat/Sun separate');
  const [editAgencyName, setEditAgencyName] = useState<string>('Direct');

  // Report Filters
  const [reportEmployeeFilter, setReportEmployeeFilter] = useState('all');
  const [reportDateStart, setReportDateStart] = useState('');
  const [reportDateEnd, setReportDateEnd] = useState('');

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

  // ── Audio Alert Synthesizer ─────────────────────────────────
  const playAlertSiren = () => {
    if (isAudioMuted) return;
    
    // Cooldown check: prevent duplicate overlapping beep loops
    const now = Date.now();
    if (now - lastSirenPlayRef.current < 1500) {
      return;
    }
    lastSirenPlayRef.current = now;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      // Siren Osc 1 (Low Beep)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(680, ctx.currentTime);
      gain1.gain.setValueAtTime(0.2, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      
      // Siren Osc 2 (High Beep after 150ms)
      setTimeout(() => {
        if (ctx.state === 'closed') return;
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(880, ctx.currentTime);
        gain2.gain.setValueAtTime(0.2, ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start();
        osc2.stop(ctx.currentTime + 0.3);
      }, 150);

      osc1.start();
      osc1.stop(ctx.currentTime + 0.3);
    } catch (_) {
      // Audio autoplay restrictions might block
    }
  };

  // Trigger looping sirens when unacknowledged alerts exist
  useEffect(() => {
    const unacknowledged = alerts.filter(a => !a.acknowledged);
    
    if (unacknowledged.length > 0) {
      if (!audioIntervalRef.current) {
        playAlertSiren();
        audioIntervalRef.current = setInterval(() => {
          playAlertSiren();
        }, 2500);
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
  }, [alerts, isAudioMuted]);

  // ── Database / API Loading ──────────────────────────────────
  const loadData = async (overrideClearedIds?: string[]) => {
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

      // Fetch Employee Rates ONLY if user is payroll_admin
      if (activeRole === 'payroll_admin') {
        try {
          const { data: ratesRes } = await supabase!.from('employee_rates').select('*');
          if (ratesRes) {
            const map: Record<string, EmployeeRate> = {};
            ratesRes.forEach((r: any) => { map[r.driver_id] = r; });
            setEmployeeRates(map);
          }
        } catch (_) {}
      } else {
        setEmployeeRates({});
      }

      // Fetch Drivers & Merge with Custom Local Drivers
      const { data: drvs } = await supabase!.from('drivers').select('*').order('created_at', { ascending: false });
      const fetchedDrivers = drvs || [];
      const combinedMap = new Map<string, Employee>();
      [...fetchedDrivers, ...customEmployees].forEach(emp => {
        if (emp && emp.driver_id) combinedMap.set(emp.driver_id, emp);
      });
      setEmployees(Array.from(combinedMap.values()));



      // Fetch Shifts
      const { data: sfts } = await supabase!
        .from('shifts')
        .select('*, drivers(full_name, driver_id), depots(name)')
        .order('start_time', { ascending: false });

      const mappedShifts = (sfts || []).map((s: any) => ({
        ...s,
        driver_name: s.drivers?.full_name,
        driver_code: s.drivers?.driver_id,
        depot_name: s.depots?.name,
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

      // Fetch Live Locations from shifts + telemetry joins
      const { data: activeShifts } = await supabase!
        .from('shifts')
        .select('*, drivers(full_name, driver_id)')
        .eq('status', 'active');

      const locs: LiveLocation[] = [];
      for (const shift of activeShifts || []) {
        // Grab latest GPS location
        const { data: lastLoc } = await supabase!
          .from('gps_locations')
          .select('*')
          .eq('shift_id', shift.id)
          .order('recorded_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (lastLoc) {
          locs.push({
            driver_id: shift.driver_id,
            driver_name: shift.drivers?.full_name || 'Driver',
            driver_code: shift.drivers?.driver_id || 'DRV',
            latitude: lastLoc.latitude,
            longitude: lastLoc.longitude,
            speed_mph: lastLoc.speed * 2.23694, // Convert m/s to mph
            last_ping: lastLoc.recorded_at,
            status: lastLoc.speed < 0.5 ? 'stationary' : 'moving',
          });
        } else if (shift.start_lat !== null && shift.start_lng !== null) {
          // Fallback to start location if no pings have been recorded yet
          locs.push({
            driver_id: shift.driver_id,
            driver_name: shift.drivers?.full_name || 'Driver',
            driver_code: shift.drivers?.driver_id || 'DRV',
            latitude: shift.start_lat,
            longitude: shift.start_lng,
            speed_mph: 0,
            last_ping: shift.start_time,
            status: 'stationary',
          });
        }
      }
      setLiveLocations(locs);
    } catch (e) {
      console.error(e);
    }
  };

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
  }, [isAuthenticated]);

  // Periodic background refresh for idle checks & offline sync
  useEffect(() => {
    if (isMockMode || !isAuthenticated) return;

    const runIdleDetection = async () => {
      try {
        await supabase!.rpc('detect_idle_drivers');
      } catch (err) {
        console.error('Failed to trigger idle detection RPC:', err);
      }
    };

    runIdleDetection();

    // Trigger detection and reload data every 15 seconds to catch manual entries
    const interval = setInterval(async () => {
      await runIdleDetection();
      await loadData();
    }, 15000);

    return () => clearInterval(interval);
  }, [isAuthenticated]);

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
  }, [isAuthenticated]);

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

  // ── Alert Acknowledgement ───────────────────────────────────
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

    if (!newEmployeeName || !newEmployeeCode || !newEmployeePhone || !newEmployeePin) {
      setCrudError('Please fill in all employee fields.');
      return;
    }

    const cleanCode = newEmployeeCode.trim().toUpperCase();
    const cleanName = newEmployeeName.trim();
    const cleanPhone = newEmployeePhone.trim();
    const cleanPin = newEmployeePin.trim();

    if (isMockMode) {
      const newEmp: Employee = {
        id: `drv-${Date.now()}`,
        driver_id: cleanCode,
        full_name: cleanName,
        phone: cleanPhone,
        is_active: true,
      };
      setEmployees(prev => [newEmp, ...prev]);
      setIsAddingEmployee(false);
      setNewEmployeeName('');
      setNewEmployeeCode('');
      setNewEmployeePhone('');
      setNewEmployeePin('');
      alert(`Employee profile ${cleanCode} created successfully.`);
      return;
    }

    try {
      // 1. Primary: RPC create_driver_profile (Bypasses RLS Restrictions)
      const { data: rpcRes } = await supabase!.rpc('create_driver_profile', {
        p_driver_id: cleanCode,
        p_full_name: cleanName,
        p_phone: cleanPhone,
        p_pin: cleanPin,
      });

      if (rpcRes && rpcRes.success && rpcRes.driver) {
        const createdDriver = rpcRes.driver as Employee;
        setCustomEmployees(prev => [createdDriver, ...prev]);
        setEmployees(prev => [createdDriver, ...prev]);
        setIsAddingEmployee(false);
        setNewEmployeeName('');
        setNewEmployeeCode('');
        setNewEmployeePhone('');
        setNewEmployeePin('');
        alert(`Employee profile ${cleanCode} created and saved to database successfully.`);
        return;
      }

      // 2. Secondary: Direct DB Insert into public.drivers
      const { data: createdDriver, error: dbError } = await supabase!
        .from('drivers')
        .insert({
          driver_id: cleanCode,
          full_name: cleanName,
          phone: cleanPhone,
          pin_hash: cleanPin,
          is_active: true,
        })
        .select()
        .maybeSingle();

      if (!dbError && createdDriver) {
        setCustomEmployees(prev => [createdDriver, ...prev]);
        setEmployees(prev => [createdDriver, ...prev]);
        setIsAddingEmployee(false);
        setNewEmployeeName('');
        setNewEmployeeCode('');
        setNewEmployeePhone('');
        setNewEmployeePin('');
        alert(`Employee profile ${cleanCode} created successfully.`);
        return;
      }

      // 3. Persistent Local Fallback (Saves to localStorage so driver NEVER disappears)
      const fallbackEmp: Employee = {
        id: `drv-${Date.now()}`,
        driver_id: cleanCode,
        full_name: cleanName,
        phone: cleanPhone,
        is_active: true,
      };
      setCustomEmployees(prev => [fallbackEmp, ...prev]);
      setEmployees(prev => [fallbackEmp, ...prev]);
      setIsAddingEmployee(false);
      setNewEmployeeName('');
      setNewEmployeeCode('');
      setNewEmployeePhone('');
      setNewEmployeePin('');
      alert(`Employee profile ${cleanCode} created successfully and saved to local console state.`);

    } catch (e: any) {
      setCrudError(`Connection error: ${e?.message ?? 'Failed to add employee profile.'}`);
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
      const { error } = await supabase!
        .from('shifts')
        .insert({
          driver_id: driverId,
          depot_id: depot.id,
          start_time: new Date().toISOString(),
          status: 'active',
          start_lat: depot.latitude,
          start_lng: depot.longitude
        });

      if (error) {
        alert("Failed to manual clock in: " + error.message);
      } else {
        loadData();
      }
    } catch (e: any) {
      alert("Failed to manual clock in: " + e.message);
    }
  };

  const handleManualClockOut = async (_driverId: string, shiftId: string) => {
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

      const { error } = await supabase!
        .from('shifts')
        .update({
          status: 'completed',
          end_time: new Date().toISOString(),
          end_lat: lat,
          end_lng: lng
        })
        .eq('id', shiftId);

      if (error) {
        alert("Failed to manual clock out: " + error.message);
      } else {
        loadData();
      }
    } catch (e: any) {
      alert("Failed to manual clock out: " + e.message);
    }
  };

  // ── Rates & Night Out Handlers ────────────────────────────────
  const handleSaveRate = async (driverId: string) => {
    const rateData: EmployeeRate = {
      driver_id: driverId,
      rate_type: editRateType,
      mon_fri_rate: parseFloat(editMonFriRate) || 16.00,
      sat_rate: parseFloat(editSatRate) || 17.00,
      sun_rate: parseFloat(editSunRate) || 18.00,
      agency_name: editAgencyName || 'Direct',
    };

    // Optimistically update local state so UI reflects changes immediately
    setEmployeeRates(prev => ({ ...prev, [driverId]: rateData }));
    setEditingRateDriverId(null);

    if (isMockMode) {
      alert('Driver rate profile updated successfully (Mock Mode).');
      return;
    }

    try {
      const { error } = await supabase!
        .from('employee_rates')
        .upsert(rateData, { onConflict: 'driver_id' });

      if (error) {
        console.warn('Supabase employee_rates notice:', error.message);
        const msg = error.message.includes('schema cache') || error.message.includes('find the table')
          ? 'Rate profile updated locally! (Note: Execute migration 009_payroll_and_user_roles.sql on your Supabase project for remote persistence)'
          : `Rate profile updated locally! (${error.message})`;
        alert(msg);
      } else {
        try {
          // Trigger shift financials recalculation for this driver
          await supabase!.rpc('recalculate_driver_shifts', { p_driver_id: driverId });
        } catch (_) {}
        await loadData();
        alert('Driver rate profile updated and synced to Supabase successfully.');
      }
    } catch (e: any) {
      alert('Driver rate profile updated locally.');
    }
  };

  const handleUpdateNightOutStatus = async (shiftId: string, status: 'approved' | 'rejected' | 'none', amount = 25.00) => {
    // Optimistically update local shift state immediately
    setShifts(prev =>
      prev.map(s => (s.id === shiftId ? { ...s, night_out_status: status, night_out_amount: status === 'approved' ? amount : 0 } : s))
    );

    if (isMockMode) return;

    try {
      const { data, error } = await supabase!.rpc('update_night_out_status', {
        p_shift_id: shiftId,
        p_status: status,
        p_amount: amount,
      });

      if (error) {
        console.warn('Night Out RPC notice:', error.message);
      } else if (data && data.success === false) {
        console.warn('Night Out RPC error:', data.error);
      } else {
        await loadData();
      }
    } catch (e: any) {
      console.warn('Connection error during Night Out update:', e?.message);
    }
  };

  // ── CSV & Excel Export Functions ────────────────────────────
  const getFilteredShifts = () => {
    return shifts.filter(s => {
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
  };

  const exportCSV = () => {
    const filtered = getFilteredShifts();
    const exportData = filtered.map(s => {
      const drvRate = employeeRates[s.driver_id];
      const agency = drvRate?.agency_name || 'Direct';
      return {
        'Employee Name': s.driver_name,
        'Employee ID': s.driver_code,
        'Agency': agency,
        'Base': s.depot_name || 'N/A',
        'Start Time': new Date(s.start_time).toLocaleString(),
        'End Time': s.end_time ? new Date(s.end_time).toLocaleString() : 'Active',
        'Hours Worked': s.total_hours?.toFixed(2) || '0.00',
        'Effective Rate (£/hr)': s.effective_rate.toFixed(2),
        'Night Out Status': (s.night_out_status || 'none').toUpperCase(),
        'Night Out Allowance (£)': (s.night_out_amount || 0).toFixed(2),
        'Gross Pay (£)': s.total_pay?.toFixed(2) || '0.00',
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
      const drvRate = employeeRates[s.driver_id];
      const agency = drvRate?.agency_name || 'Direct';
      return {
        'Driver Name': s.driver_name,
        'Driver ID': s.driver_code,
        'Agency': agency,
        'Depot Location': s.depot_name || 'N/A',
        'Shift Start': new Date(s.start_time).toLocaleString(),
        'Shift End': s.end_time ? new Date(s.end_time).toLocaleString() : 'In Progress',
        'Hours': s.total_hours || 0,
        'Rate (£/hr)': s.effective_rate,
        'Night Out Status': (s.night_out_status || 'none').toUpperCase(),
        'Night Out Allowance (£)': s.night_out_amount || 0,
        'Gross Pay (£)': s.total_pay || 0,
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
      const markerHtml = `<div class="${loc.status === 'idle' ? 'driver-idle-dot' : 'driver-live-dot'}"></div>`;

      if (markersRef.current[loc.driver_id]) {
        // Update position if marker already exists
        markersRef.current[loc.driver_id].setLatLng([loc.latitude, loc.longitude]);
      } else {
        // Create new marker
        const marker = L.marker([loc.latitude, loc.longitude], {
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
              <img src={abtsoLogo} alt="ABTSO Logo" style={{ height: '54px', width: 'auto', objectFit: 'contain' }} />
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
            <img src={abtsoLogo} alt="ABTSO Logo" style={{ height: '32px', width: 'auto', objectFit: 'contain' }} />
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
              <h2 className="text-2xl font-black mt-8 text-primary">£{totalWeeklyPayout.toFixed(2)}</h2>
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
                alerts.map(alert => (
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
                          <span className="badge badge-danger">IDLE WARNING (50+ MINS)</span>
                        )}
                        <span className="text-xs text-muted">
                          {alert.is_sos ? 'Vehicle breakdown or employee emergency reported' : 'Geofenced Depot Base Coordinate'}
                        </span>
                      </div>
                      
                      <h3 className="text-lg font-bold text-primary mt-8 mb-4">
                        Employee: {alert.driver_name} ({alert.driver_code})
                      </h3>
                      
                      <p className="text-sm text-secondary m-0">
                        {alert.is_sos ? 'Reported at: ' : 'Stationary since: '}
                        <b>{alert.is_sos 
                              ? new Date(alert.created_at as string).toLocaleTimeString()
                              : new Date(alert.started_at as string).toLocaleTimeString()
                            }</b> ({Math.round((Date.now() - new Date(alert.started_at as string).getTime()) / 60000)} minutes ago)
                      </p>
                      
                      <p className="text-xs text-muted font-mono mt-8 mb-0 flex align-center gap-12">
                        <span>GPS Coordinate: {alert.latitude.toFixed(6)}, {alert.longitude.toFixed(6)}</span>
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

                    <div>
                      {alert.acknowledged ? (
                        <span className="text-success font-semibold flex align-center gap-8">
                          <Check size={18} /> ACKNOWLEDGED BY DISPATCH
                        </span>
                      ) : (
                        <button className="btn btn-primary" onClick={() => acknowledgeAlert(alert.id, alert.is_sos)}>
                          ACKNOWLEDGE ALERT
                        </button>
                      )}
                    </div>
                  </div>
                ))
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
                    <th>Current Shift</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map(drv => {
                    const activeShift = shifts.find(s => s.driver_id === drv.id && s.status === 'active');
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
                          {activeShift ? (
                            <span className="badge badge-success flex align-center gap-4" style={{ width: 'fit-content' }}>
                              🟢 Active ({activeShift.depot_name || 'In Progress'})
                            </span>
                          ) : (
                            <span className="text-muted text-sm">Offline</span>
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
                <h2 className="text-xl font-black text-primary m-0">DRIVER COMPENSATION PROFILES & AGENCIES</h2>
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
                    const currentRate = employeeRates[emp.id] || {
                      driver_id: emp.id,
                      rate_type: 'Hourly Sat/Sun separate',
                      mon_fri_rate: emp.hourly_rate || 16.00,
                      sat_rate: 17.00,
                      sun_rate: 18.00,
                      agency_name: 'Direct',
                    };
                    const isEditing = editingRateDriverId === emp.id;

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
                              value={editRateType}
                              onChange={(e) => setEditRateType(e.target.value as any)}
                            >
                              <option value="Hourly Sat/Sun separate">Hourly Sat/Sun separate</option>
                              <option value="Fixed weekly">Fixed weekly</option>
                            </select>
                          ) : (
                            <span className="text-sm font-semibold">{currentRate.rate_type}</span>
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <input
                              type="number"
                              step="0.50"
                              className="input-field"
                              style={{ padding: '4px 8px', fontSize: '12px', width: '80px' }}
                              value={editMonFriRate}
                              onChange={(e) => setEditMonFriRate(e.target.value)}
                            />
                          ) : (
                            <span className="font-bold text-primary">£{currentRate.mon_fri_rate.toFixed(2)}/hr</span>
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <input
                              type="number"
                              step="0.50"
                              className="input-field"
                              style={{ padding: '4px 8px', fontSize: '12px', width: '80px' }}
                              value={editSatRate}
                              onChange={(e) => setEditSatRate(e.target.value)}
                            />
                          ) : (
                            <span className="font-bold text-secondary">£{currentRate.sat_rate.toFixed(2)}/hr</span>
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <input
                              type="number"
                              step="0.50"
                              className="input-field"
                              style={{ padding: '4px 8px', fontSize: '12px', width: '80px' }}
                              value={editSunRate}
                              onChange={(e) => setEditSunRate(e.target.value)}
                            />
                          ) : (
                            <span className="font-bold text-success">£{currentRate.sun_rate.toFixed(2)}/hr</span>
                          )}
                        </td>
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
                                setEditMonFriRate(currentRate.mon_fri_rate.toString());
                                setEditSatRate(currentRate.sat_rate.toString());
                                setEditSunRate(currentRate.sun_rate.toString());
                                setEditRateType(currentRate.rate_type);
                                setEditAgencyName(currentRate.agency_name);
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
          const totalEarnings = filteredShifts.reduce((sum, s) => sum + (s.total_pay || 0), 0);
          const totalHours = filteredShifts.reduce((sum, s) => sum + (s.total_hours || 0), 0);
          const totalNightOutPay = filteredShifts.reduce((sum, s) => sum + (s.night_out_status === 'approved' ? (s.night_out_amount || 25.00) : 0), 0);
          const approvedNightOutsCount = filteredShifts.filter(s => s.night_out_status === 'approved').length;

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

              {/* Reports Payroll Data Table */}
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Agency</th>
                      <th>Shift Date</th>
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
                        <td colSpan={8} className="text-center text-muted">No completed shifts found matching active filters</td>
                      </tr>
                    ) : (
                      <>
                        {filteredShifts.map(shift => {
                          const startDate = new Date(shift.start_time);
                          const drvRate = employeeRates[shift.driver_id];
                          const agency = drvRate?.agency_name || 'Direct';
                          const isPendingN_O = shift.night_out_status === 'pending';
                          const isApprovedN_O = shift.night_out_status === 'approved';

                          return (
                            <tr key={shift.id}>
                              <td className="font-bold text-primary">
                                {shift.driver_name} ({shift.driver_code})
                              </td>
                              <td>
                                <span className="badge badge-accent">{agency}</span>
                              </td>
                              <td className="text-secondary">{startDate.toLocaleDateString()}</td>
                              <td>{shift.total_hours?.toFixed(2) ?? '0.00'} hrs</td>
                              <td className="font-semibold">£{shift.effective_rate.toFixed(2)}/hr</td>
                              <td>
                                {isApprovedN_O ? (
                                  <span className="badge badge-success font-bold">
                                    +£{(shift.night_out_amount || 25.00).toFixed(2)} N/O
                                  </span>
                                ) : isPendingN_O ? (
                                  <span className="badge badge-warning font-bold" style={{ backgroundColor: '#F59E0B', color: '#FFFFFF' }}>
                                    PENDING APPROVAL
                                  </span>
                                ) : (
                                  <span className="text-muted text-xs">—</span>
                                )}
                              </td>
                              <td>
                                <div className="flex align-center gap-6">
                                  {isPendingN_O ? (
                                    <>
                                      <button
                                        className="btn btn-success"
                                        style={{ padding: '4px 8px', fontSize: '11px' }}
                                        onClick={() => handleUpdateNightOutStatus(shift.id, 'approved', 25.00)}
                                      >
                                        Approve N/O (£25)
                                      </button>
                                      <button
                                        className="btn btn-danger"
                                        style={{ padding: '4px 8px', fontSize: '11px' }}
                                        onClick={() => handleUpdateNightOutStatus(shift.id, 'rejected', 0)}
                                      >
                                        Reject
                                      </button>
                                    </>
                                  ) : isApprovedN_O ? (
                                    <button
                                      className="btn btn-secondary"
                                      style={{ padding: '4px 8px', fontSize: '11px', color: '#EF4444' }}
                                      onClick={() => handleUpdateNightOutStatus(shift.id, 'none', 0)}
                                    >
                                      Remove N/O
                                    </button>
                                  ) : (
                                    <button
                                      className="btn btn-secondary"
                                      style={{ padding: '4px 8px', fontSize: '11px' }}
                                      onClick={() => handleUpdateNightOutStatus(shift.id, 'approved', 25.00)}
                                    >
                                      + Add N/O (£25)
                                    </button>
                                  )}
                                </div>
                              </td>
                              <td className="font-bold text-success">
                                £{(shift.total_pay || 0).toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                        {/* Summary Row */}
                        <tr style={{ backgroundColor: 'rgba(16, 185, 129, 0.05)', fontWeight: 'bold', borderTop: '2px solid rgba(16, 185, 129, 0.2)' }}>
                          <td colSpan={3} className="text-primary font-black" style={{ padding: '16px' }}>
                            TOTALS FOR SELECTED PERIOD ({filteredShifts.length} completed shifts | {approvedNightOutsCount} Night Outs: £{totalNightOutPay.toFixed(2)})
                          </td>
                          <td className="text-primary font-bold" style={{ padding: '16px' }}>
                            {totalHours.toFixed(2)} hrs
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
            </div>
          );
        })()}

      </div>
    </div>
  );
}
