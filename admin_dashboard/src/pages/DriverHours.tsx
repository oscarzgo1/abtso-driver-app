import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CircleCheck, Phone, MapPin, MoreVertical, X, ChevronLeft, ChevronRight,
  Clock, Truck, Calendar, AlertTriangle, CheckCircle2, PauseCircle, ShieldAlert, TrendingUp,
} from 'lucide-react';
import { supabase, isMockMode } from '../App';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '../components/ui/empty';
import { SegmentedClockBar, clockTier } from '../components/ui/segmented-clock-bar';

// ============================================================
// Driver Hours & WTD — live dispatch cockpit + 7-day timesheet.
//
// Every figure here traces to real data. Things the source spec asked
// for that are still deliberately NOT shown, because this schema/
// telemetry stack has no honest way to produce them:
//   - No road/junction location names — see the Live Cockpit's
//     telemetry-status cell, unchanged from before.
//   - No standalone "ON BREAK" state: there's still no break/rest
//     table. A driver's live activity is Driving/Stationary/Idle, the
//     same three states the Live Telemetry feed already shows,
//     computed from the same `liveLocations` source.
//
// The two duty clocks remain an ADVISORY approximation from telematics
// GPS (speed + timestamps), not certified tachograph data — this app
// has no tachograph head fitted to any vehicle, which is exactly what
// the "Advisory Telematics Feed" badge discloses.
//
// THE FIX THIS REBUILD IS ABOUT: a shift's duty clock used to be a
// straight `Date.now() - start_time` with no ceiling. A driver who
// forgot to clock out (or whose phone died/lost signal) would show an
// ever-climbing, meaningless "45:05" WTD breach days later. Every duty
// figure on this page now goes through computeShiftDutyMinutes, which
// freezes the clock at the last real telemetry ping once a shift has
// gone >12h without one, and flags the row AUTO-SUSPENDED / STALE
// instead of letting it keep accumulating. Stale rows are excluded
// from every breach/break KPI so a dead phone can't manufacture a fake
// compliance emergency — the count of how many are stale is shown
// separately instead of hidden.
//
// "Week" boundaries match this schema's own definition (see the
// week_number/week_year trigger in migrations 003/007/008/009: it
// computes EXTRACT(WEEK FROM start_time + 1 day), i.e. weeks run
// Sunday→Saturday) — the 7-Day Timesheet uses that same Sunday start
// rather than inventing a different Monday-start week the payroll
// side of this app doesn't use.
// ============================================================

const DRIVING_SPEED_THRESHOLD = 0.5; // m/s — matches App.tsx's own moving/stationary cut
const BREAK_RESET_MINUTES = 15;
const MAX_PING_GAP_MINUTES = 30; // a bigger gap means "unknown", not "driving" or "a break"
const GPS_LOOKBACK_HOURS = 13; // must exceed STALE_GAP_MINUTES so a real recent ping is never missed

const DRIVING_MAX = 270; // 4h30 — EC561 continuous driving limit
const DRIVING_AMBER = 240; // 4h00
const DRIVING_RED = 265; // 4h25

const DUTY_MAX = 360; // 6h00 — WTD break trigger used by this cockpit
const DUTY_AMBER = 330; // 5h30

const SPAN_MAX = 900; // 15h — absolute daily duty span
const SPAN_AMBER = 780; // 13h — spreadover extension threshold

const STALE_GAP_MINUTES = 720; // 12h — no ping/motion beyond this auto-suspends the shift
const MAX_15H_EXTENSIONS = 3; // statutory cap on 13h->15h spreadover days per rolling week

const WEEKLY_DRIVING_MAX = 56 * 60; // 56h
const WEEKLY_DUTY_MAX = 60 * 60; // 60h
const WEEKLY_DRIVING_AMBER = Math.round(WEEKLY_DRIVING_MAX * 0.9);
const WEEKLY_DUTY_AMBER = Math.round(WEEKLY_DUTY_MAX * 0.9);

const DAILY_REST_MIN = 660; // 11h
const REDUCED_REST_MIN = 540; // 9h

interface LiveLocationLite {
  driver_id: string;
  speed_mph: number;
  last_ping: string;
  latitude: number;
  longitude: number;
  status: 'moving' | 'stationary' | 'idle';
}

interface DepotLite {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  geofence_radius_m: number;
}

interface ActiveShiftRow {
  id: string;
  driver_id: string;
  driver_name?: string;
  driver_code?: string;
  driver_phone?: string | null;
  start_time: string;
}

interface DriverLite {
  id: string;
  driver_id: string;
  full_name: string;
  phone: string | null;
}

interface WeekShiftRow {
  id: string;
  driver_id: string;
  start_time: string;
  end_time: string | null;
  status: 'active' | 'completed' | 'cancelled';
  total_hours: number | null;
  vehicle_id: string | null;
  trailer_id: string | null;
  vehicle_number?: string | null;
  trailer_number?: string | null;
}

interface GpsPing {
  speed: number | null;
  recorded_at: string;
}

function formatClock(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// "Xh Ym" — the Timesheet matrix's own format, distinct from the live
// cockpit's HH:MM clocks (spec calls for both, in different contexts).
// Never a raw decimal hour figure.
function formatHM(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h === 0) return `${mm}m`;
  if (mm === 0) return `${h}h`;
  return `${h}h ${mm}m`;
}

function minutesBetween(aIso: string, bIso: string): number {
  return (new Date(bIso).getTime() - new Date(aIso).getTime()) / 60000;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function isSameDay(a: Date, b: Date): boolean {
  return dateKey(a) === dateKey(b);
}
function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}
function startOfWeekSunday(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - copy.getDay());
  return copy;
}
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function formatDayHeader(d: Date): string {
  return `${WEEKDAY_LABELS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}`;
}
function formatWeekRange(start: Date): string {
  const end = addDays(start, 6);
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };
  return `${start.toLocaleDateString('en-GB', opts)} – ${end.toLocaleDateString('en-GB', opts)} ${end.getFullYear()}`;
}

// Continuous driving minutes since the last plausible (15m+) stationary
// break, walking backward from the most recent ping. Any single gap over
// MAX_PING_GAP_MINUTES halts the scan rather than assuming what happened.
function computeContinuousDrivingMinutes(pings: GpsPing[]): number {
  let minutes = 0;
  let stationaryRun = 0;
  for (let i = pings.length - 1; i >= 1; i--) {
    const gap = minutesBetween(pings[i - 1].recorded_at, pings[i].recorded_at);
    if (gap <= 0 || gap > MAX_PING_GAP_MINUTES) break;
    if ((pings[i].speed ?? 0) >= DRIVING_SPEED_THRESHOLD) {
      minutes += gap;
      stationaryRun = 0;
    } else {
      stationaryRun += gap;
      if (stationaryRun >= BREAK_RESET_MINUTES) break;
    }
  }
  return minutes;
}

// How long the driver has been continuously stationary right now (0 if
// the latest ping shows them moving).
function computeCurrentStationaryMinutes(pings: GpsPing[]): number {
  if (pings.length === 0) return 0;
  const latest = pings[pings.length - 1];
  if ((latest.speed ?? 0) >= DRIVING_SPEED_THRESHOLD) return 0;
  let minutes = 0;
  for (let i = pings.length - 1; i >= 1; i--) {
    const gap = minutesBetween(pings[i - 1].recorded_at, pings[i].recorded_at);
    if (gap <= 0 || gap > MAX_PING_GAP_MINUTES) break;
    if ((pings[i].speed ?? 0) >= DRIVING_SPEED_THRESHOLD) break;
    minutes += gap;
  }
  return minutes;
}

// Total driving minutes across a whole shift (unlike the "continuous"
// variant above, this never resets on a break — it's a full-day sum for
// the Timesheet matrix). Gaps over MAX_PING_GAP_MINUTES are skipped
// rather than assumed to be driving.
function computeShiftDrivingMinutes(pings: GpsPing[]): number {
  let minutes = 0;
  for (let i = 1; i < pings.length; i++) {
    const gap = minutesBetween(pings[i - 1].recorded_at, pings[i].recorded_at);
    if (gap <= 0 || gap > MAX_PING_GAP_MINUTES) continue;
    if ((pings[i].speed ?? 0) >= DRIVING_SPEED_THRESHOLD) minutes += gap;
  }
  return minutes;
}

interface ShiftDutyResult {
  minutes: number;
  stale: boolean;
  lastKnownIso: string;
}

// The one function every duty figure on this page routes through. A
// completed shift trusts the DB's own total_hours (set by the payroll
// trigger on clock-out — the authoritative figure, not re-derived here).
// An open shift is elapsed time since start_time, UNLESS more than
// STALE_GAP_MINUTES has passed since the last real telemetry ping (or
// since start_time, if there's never been one) — in which case the
// clock freezes at that last known moment instead of running forever.
function computeShiftDutyMinutes(
  startTime: string,
  endTime: string | null,
  totalHours: number | null,
  pings: GpsPing[],
  nowMs: number,
): ShiftDutyResult {
  if (endTime && totalHours != null) {
    return { minutes: totalHours * 60, stale: false, lastKnownIso: endTime };
  }
  const lastKnownIso = pings.length > 0 ? pings[pings.length - 1].recorded_at : startTime;
  const lastKnownMs = new Date(lastKnownIso).getTime();
  const stale = (nowMs - lastKnownMs) / 60000 > STALE_GAP_MINUTES;
  const endMs = stale ? lastKnownMs : nowMs;
  const minutes = Math.max(0, (endMs - new Date(startTime).getTime()) / 60000);
  return { minutes, stale, lastKnownIso };
}

// ── Daily Spreadover Budget dots — [● ● ○] style, real count only. ──
function ExtensionBudgetDots({ used, total }: { used: number; total: number }) {
  const overBudget = used > total;
  const color = overBudget ? '#CC0000' : used === total ? '#F59E0B' : '#10B981';
  return (
    <span className="flex align-center" style={{ gap: '3px' }}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          style={{
            width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
            background: i < used ? color : 'transparent',
            border: `1.5px solid ${i < used ? color : 'var(--border-color)'}`,
          }}
        />
      ))}
      {overBudget && <span className="font-mono font-bold" style={{ fontSize: '10px', color, marginLeft: '2px' }}>+{used - total}</span>}
    </span>
  );
}

function StaleBadge() {
  return (
    <div className="flex align-center" style={{ gap: '6px' }}>
      <ShieldAlert size={14} color="#CC0000" style={{ flexShrink: 0 }} />
      <div>
        <p className="font-bold m-0" style={{ fontSize: '12px', color: '#CC0000' }}>AUTO-SUSPENDED / STALE</p>
        <p className="text-xs text-muted m-0">Shift Auto-Closed (No ping for &gt;12h)</p>
      </div>
    </div>
  );
}

// ── 24h activity timeline — built from real ping/shift boundaries only. ──
type TimelineKind = 'driving' | 'other' | 'gap' | 'off';
interface TimelineSegment { kind: TimelineKind; startPct: number; widthPct: number }

function buildDayTimeline(day: Date, shiftStart: string | null, shiftEnd: string | null, pings: GpsPing[]): TimelineSegment[] {
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayStartMs = dayStart.getTime();
  const dayEndMs = dayStartMs + 24 * 3600000;
  const span = dayEndMs - dayStartMs;
  const clip = (ms: number) => Math.min(Math.max(ms, dayStartMs), dayEndMs);
  const segments: TimelineSegment[] = [];
  const push = (kind: TimelineKind, fromMs: number, toMs: number) => {
    const a = clip(fromMs);
    const b = clip(toMs);
    if (b <= a) return;
    segments.push({ kind, startPct: ((a - dayStartMs) / span) * 100, widthPct: ((b - a) / span) * 100 });
  };

  if (!shiftStart) {
    push('off', dayStartMs, dayEndMs);
    return segments;
  }
  const startMs = new Date(shiftStart).getTime();
  const endMs = shiftEnd ? new Date(shiftEnd).getTime() : Date.now();
  push('off', dayStartMs, startMs);
  push('off', endMs, dayEndMs);

  const sorted = [...pings].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  if (sorted.length === 0) {
    push('other', startMs, endMs);
  } else {
    push('other', startMs, new Date(sorted[0].recorded_at).getTime());
    for (let i = 1; i < sorted.length; i++) {
      const a = new Date(sorted[i - 1].recorded_at).getTime();
      const b = new Date(sorted[i].recorded_at).getTime();
      const gapMin = (b - a) / 60000;
      if (gapMin > MAX_PING_GAP_MINUTES) push('gap', a, b);
      else if ((sorted[i].speed ?? 0) >= DRIVING_SPEED_THRESHOLD) push('driving', a, b);
      else push('other', a, b);
    }
    push('other', new Date(sorted[sorted.length - 1].recorded_at).getTime(), endMs);
  }
  return segments;
}

const TIMELINE_COLOR: Record<TimelineKind, string> = {
  driving: '#10B981',
  other: '#F59E0B',
  gap: '#CBD5E1',
  off: '#F1F5F9',
};
const TIMELINE_LEGEND: { kind: TimelineKind; label: string }[] = [
  { kind: 'driving', label: 'Driving' },
  { kind: 'other', label: 'Other Work / Stationary' },
  { kind: 'gap', label: 'No Telemetry Signal' },
  { kind: 'off', label: 'Off Duty' },
];

interface DayCell {
  dateKey: string;
  dateLabel: string;
  date: Date;
  hasShift: boolean;
  drivingMinutes: number;
  dutyMinutes: number;
  isToday: boolean;
  isOpen: boolean;
  stale: boolean;
  extension: boolean;
  breach: boolean;
  restMinutesBefore: number | null;
  shiftIds: string[];
  pings: GpsPing[];
  shiftStart: string | null;
  shiftEnd: string | null;
  vehicleNumber: string | null;
  trailerNumber: string | null;
}

interface DriverWeekRow {
  driver: DriverLite;
  days: DayCell[];
  weekDrivingMinutes: number;
  weekDutyMinutes: number;
  extensionsUsed: number;
}

interface DayDetailDrawerProps {
  driverName: string;
  cell: DayCell;
  onClose: () => void;
}
function DayDetailDrawer({ driverName, cell, onClose }: DayDetailDrawerProps) {
  const segments = useMemo(
    () => buildDayTimeline(cell.date, cell.shiftStart, cell.shiftEnd, cell.pings),
    [cell]
  );
  const restLabel = cell.restMinutesBefore == null
    ? '—'
    : cell.restMinutesBefore >= DAILY_REST_MIN
      ? `Daily Rest ${formatHM(cell.restMinutesBefore)}`
      : cell.restMinutesBefore >= REDUCED_REST_MIN
        ? `Reduced Rest ${formatHM(cell.restMinutesBefore)}`
        : `Rest Breach ${formatHM(cell.restMinutesBefore)}`;
  const restColor = cell.restMinutesBefore == null
    ? 'var(--charcoal-light)'
    : cell.restMinutesBefore >= DAILY_REST_MIN ? '#10B981' : cell.restMinutesBefore >= REDUCED_REST_MIN ? '#F59E0B' : '#CC0000';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <div
        className="glass-panel"
        style={{ width: '460px', maxWidth: '100%', height: '100%', overflowY: 'auto', borderRadius: 0, background: 'var(--card-bg)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex align-center justify-between p-16" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <div>
            <p className="font-black text-primary m-0" style={{ fontSize: '15px' }}>{driverName}</p>
            <p className="text-xs text-muted m-0 mt-4">{cell.date.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--charcoal-light)' }}>
            <X size={18} />
          </button>
        </div>

        {!cell.hasShift ? (
          <div className="p-16">
            <p className="text-sm text-muted">No shift logged for this driver on this day.</p>
          </div>
        ) : (
          <div className="p-16">
            {(cell.vehicleNumber || cell.trailerNumber) && (
              <div className="flex align-center mb-16" style={{ gap: '8px', flexWrap: 'wrap' }}>
                {cell.vehicleNumber && (
                  <span className="flex align-center font-mono font-bold" style={{ gap: '5px', fontSize: '11px', textTransform: 'uppercase', background: 'var(--card-bg-hover)', color: 'var(--charcoal)', padding: '4px 10px', borderRadius: '6px' }}>
                    <Truck size={12} /> {cell.vehicleNumber}
                  </span>
                )}
                {cell.trailerNumber && (
                  <span className="font-mono font-bold" style={{ fontSize: '11px', textTransform: 'uppercase', background: 'var(--card-bg-hover)', color: 'var(--charcoal)', padding: '4px 10px', borderRadius: '6px' }}>
                    {cell.trailerNumber}
                  </span>
                )}
              </div>
            )}
            {cell.stale && (
              <div className="mb-16" style={{ padding: '10px', borderRadius: '8px', background: 'rgba(204,0,0,0.07)', border: '1px solid rgba(204,0,0,0.2)' }}>
                <StaleBadge />
              </div>
            )}

            <div className="grid grid-cols-3 gap-16 mb-16">
              <div>
                <p className="text-xs font-bold text-muted mb-4" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Driving</p>
                <p className="font-mono font-black text-primary tabular-nums m-0">{formatHM(cell.drivingMinutes)}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-muted mb-4" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Duty Span</p>
                <p className="font-mono font-black tabular-nums m-0" style={{ color: cell.breach ? '#CC0000' : cell.extension ? '#F59E0B' : 'var(--charcoal)' }}>
                  {formatHM(cell.dutyMinutes)}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-muted mb-4" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Rest Before</p>
                <p className="font-mono font-bold tabular-nums m-0" style={{ color: restColor, fontSize: '13px' }}>{restLabel}</p>
              </div>
            </div>

            <p className="text-xs font-bold text-muted mb-8" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>24h Activity</p>
            <div style={{ position: 'relative', height: '28px', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
              {segments.map((s, i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute', top: 0, bottom: 0, left: `${s.startPct}%`, width: `${s.widthPct}%`,
                    background: TIMELINE_COLOR[s.kind],
                  }}
                />
              ))}
            </div>
            <div className="flex align-center justify-between mt-4" style={{ fontSize: '10px' }}>
              {['00', '04', '08', '12', '16', '20', '24'].map(h => (
                <span key={h} className="font-mono text-muted tabular-nums">{h}</span>
              ))}
            </div>

            <div className="flex" style={{ gap: '14px', flexWrap: 'wrap', marginTop: '12px' }}>
              {TIMELINE_LEGEND.map(l => (
                <span key={l.kind} className="flex align-center text-xs text-secondary" style={{ gap: '5px' }}>
                  <span style={{ width: '9px', height: '9px', borderRadius: '2px', background: TIMELINE_COLOR[l.kind], flexShrink: 0 }} />
                  {l.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface DriverHoursProps {
  organizationId: string | null;
  onAlertCountChange?: (count: number) => void;
  liveLocations?: LiveLocationLite[];
  depots?: DepotLite[];
  onViewRouteHistory?: (driverId: string) => void;
}

type KpiFilter = 'all' | 'breakDue' | 'extensions' | 'breaches';

export default function DriverHours({ organizationId, onAlertCountChange, liveLocations = [], depots = [], onViewRouteHistory }: DriverHoursProps) {
  const [view, setView] = useState<'cockpit' | 'timesheet'>('cockpit');
  const [driverSearch, setDriverSearch] = useState('');
  const [kpiFilter, setKpiFilter] = useState<KpiFilter>('all');

  // ── Live Cockpit data ──
  const [activeShifts, setActiveShifts] = useState<ActiveShiftRow[]>([]);
  const [pingsByShift, setPingsByShift] = useState<Record<string, GpsPing[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [, forceTick] = useState(0);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // ── 7-Day Timesheet data ──
  const [weekAnchor, setWeekAnchor] = useState(() => new Date());
  const [weekDrivers, setWeekDrivers] = useState<DriverLite[]>([]);
  const [weekShifts, setWeekShifts] = useState<WeekShiftRow[]>([]);
  const [weekPingsByShift, setWeekPingsByShift] = useState<Record<string, GpsPing[]>>({});
  const [isWeekLoading, setIsWeekLoading] = useState(false);
  const [weekError, setWeekError] = useState('');
  const [drawerCell, setDrawerCell] = useState<{ driverName: string; cell: DayCell } | null>(null);

  const loadShifts = useCallback(async () => {
    if (isMockMode || !supabase || !organizationId) return;
    setIsLoading(true);
    setError('');
    try {
      const { data, error: fetchError } = await supabase
        .from('shifts')
        .select('id, driver_id, start_time, drivers(full_name, driver_id, phone)')
        .eq('organization_id', organizationId)
        .eq('status', 'active')
        .is('end_time', null);
      if (fetchError) throw fetchError;
      const shiftRows: ActiveShiftRow[] = (data ?? []).map((r: any) => ({
        id: r.id,
        driver_id: r.driver_id,
        start_time: r.start_time,
        driver_name: r.drivers?.full_name,
        driver_code: r.drivers?.driver_id,
        driver_phone: r.drivers?.phone,
      }));
      setActiveShifts(shiftRows);

      const shiftIds = shiftRows.map(s => s.id);
      if (shiftIds.length > 0) {
        const lookbackIso = new Date(Date.now() - GPS_LOOKBACK_HOURS * 3600000).toISOString();
        const { data: pingRows, error: pingError } = await supabase
          .from('gps_locations')
          .select('shift_id, speed, recorded_at')
          .in('shift_id', shiftIds)
          .gte('recorded_at', lookbackIso)
          .order('recorded_at', { ascending: true });
        if (pingError) throw pingError;
        const grouped: Record<string, GpsPing[]> = {};
        for (const p of pingRows ?? []) {
          (grouped[p.shift_id] ??= []).push({ speed: p.speed, recorded_at: p.recorded_at });
        }
        setPingsByShift(grouped);
      } else {
        setPingsByShift({});
      }
    } catch (err: any) {
      setError(err?.message ?? 'Could not load active shifts.');
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadShifts();
    const refresh = setInterval(loadShifts, 60000); // a live cockpit needs fresher-than-5min telemetry
    return () => clearInterval(refresh);
  }, [loadShifts]);

  useEffect(() => {
    const t = setInterval(() => forceTick(n => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  // Week's driver/shift/ping data — powers both the Timesheet matrix and
  // the Cockpit's Daily Spreadover budget (which needs "extensions used
  // this week" regardless of which tab is showing).
  const loadWeekData = useCallback(async () => {
    if (isMockMode || !supabase || !organizationId) return;
    setIsWeekLoading(true);
    setWeekError('');
    try {
      const weekStart = startOfWeekSunday(weekAnchor);
      const weekEndExclusive = addDays(weekStart, 7);
      const lookbackStart = addDays(weekStart, -3); // enough slack to find the prior shift for day-1 rest

      const [{ data: driverRows, error: drErr }, { data: shiftRows, error: shErr }] = await Promise.all([
        supabase.from('drivers').select('id, driver_id, full_name, phone').eq('organization_id', organizationId).eq('is_active', true).order('full_name', { ascending: true }),
        supabase
          .from('shifts')
          .select('id, driver_id, start_time, end_time, status, total_hours, vehicle_id, trailer_id, vehicle:vehicles!vehicle_id(vehicle_number), trailer:vehicles!trailer_id(vehicle_number)')
          .eq('organization_id', organizationId)
          .gte('start_time', lookbackStart.toISOString())
          .lt('start_time', weekEndExclusive.toISOString())
          .order('start_time', { ascending: true }),
      ]);
      if (drErr || shErr) throw drErr ?? shErr;
      setWeekDrivers((driverRows ?? []) as DriverLite[]);
      // Which tractor/trailer the driver was actually in that day — see
      // the module header note; shifts.vehicle_id/trailer_id (migrations
      // 045/049) have been real for a while, just never surfaced here.
      const shifts = ((shiftRows ?? []) as any[]).map(r => ({
        ...r,
        vehicle_number: r.vehicle?.vehicle_number ?? null,
        trailer_number: r.trailer?.vehicle_number ?? null,
      })) as WeekShiftRow[];
      setWeekShifts(shifts);

      const shiftIds = shifts.map(s => s.id);
      if (shiftIds.length > 0) {
        const { data: pingRows, error: pingErr } = await supabase
          .from('gps_locations')
          .select('shift_id, speed, recorded_at')
          .in('shift_id', shiftIds)
          .order('recorded_at', { ascending: true });
        if (pingErr) throw pingErr;
        const grouped: Record<string, GpsPing[]> = {};
        for (const p of pingRows ?? []) {
          (grouped[p.shift_id] ??= []).push({ speed: p.speed, recorded_at: p.recorded_at });
        }
        setWeekPingsByShift(grouped);
      } else {
        setWeekPingsByShift({});
      }
    } catch (err: any) {
      setWeekError(err?.message ?? 'Could not load the weekly timesheet.');
    } finally {
      setIsWeekLoading(false);
    }
  }, [organizationId, weekAnchor]);

  useEffect(() => {
    loadWeekData();
  }, [loadWeekData]);

  // Realtime: a driver clocking in/out or a fresh GPS ping should reach
  // both the cockpit and the timesheet without waiting for the next poll.
  useEffect(() => {
    if (isMockMode || !supabase || !organizationId) return;
    const shiftsChannel = supabase
      .channel('realtime_driver_hours_shifts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, () => { loadShifts(); loadWeekData(); })
      .subscribe();
    return () => { supabase!.removeChannel(shiftsChannel); };
  }, [organizationId, loadShifts, loadWeekData]);

  const weekStart = useMemo(() => startOfWeekSunday(weekAnchor), [weekAnchor]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const weeklyRows: DriverWeekRow[] = useMemo(() => {
    const nowMs = Date.now();
    const shiftsByDriver: Record<string, WeekShiftRow[]> = {};
    for (const s of weekShifts) (shiftsByDriver[s.driver_id] ??= []).push(s);
    for (const list of Object.values(shiftsByDriver)) {
      list.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    }

    return weekDrivers.map(driver => {
      const driverShifts = shiftsByDriver[driver.id] ?? [];
      const days: DayCell[] = weekDays.map(date => {
        const dKey = dateKey(date);
        const dayShifts = driverShifts.filter(s => dateKey(new Date(s.start_time)) === dKey);
        if (dayShifts.length === 0) {
          return {
            dateKey: dKey, dateLabel: formatDayHeader(date), date, hasShift: false,
            drivingMinutes: 0, dutyMinutes: 0, isToday: isSameDay(date, new Date()),
            isOpen: false, stale: false, extension: false, breach: false,
            restMinutesBefore: null, shiftIds: [], pings: [], shiftStart: null, shiftEnd: null,
            vehicleNumber: null, trailerNumber: null,
          };
        }

        let drivingMinutes = 0;
        let dutyMinutes = 0;
        let stale = false;
        let isOpen = false;
        const shiftIds: string[] = [];
        const pings: GpsPing[] = [];
        let earliestStart: string | null = null;
        let latestEnd: string | null = null;

        for (const s of dayShifts) {
          shiftIds.push(s.id);
          const sPings = weekPingsByShift[s.id] ?? [];
          pings.push(...sPings);
          drivingMinutes += computeShiftDrivingMinutes(sPings);
          const duty = computeShiftDutyMinutes(s.start_time, s.end_time, s.total_hours, sPings, nowMs);
          dutyMinutes += duty.minutes;
          if (duty.stale) stale = true;
          if (!s.end_time) isOpen = true;
          if (!earliestStart || s.start_time < earliestStart) earliestStart = s.start_time;
          if (s.end_time && (!latestEnd || s.end_time > latestEnd)) latestEnd = s.end_time;
        }

        const firstShift = dayShifts[0];
        const idxInAll = driverShifts.indexOf(firstShift);
        const prevShift = idxInAll > 0 ? driverShifts[idxInAll - 1] : null;
        const restMinutesBefore = prevShift?.end_time ? minutesBetween(prevShift.end_time, firstShift.start_time) : null;
        // The most recent shift of the day is the unit the driver actually
        // ended up in — relevant if they swapped tractors mid-day.
        const lastShift = dayShifts[dayShifts.length - 1];

        return {
          dateKey: dKey, dateLabel: formatDayHeader(date), date, hasShift: true,
          drivingMinutes, dutyMinutes, isToday: isSameDay(date, new Date()),
          isOpen, stale, extension: dutyMinutes > SPAN_AMBER, breach: dutyMinutes > SPAN_MAX,
          restMinutesBefore, shiftIds, pings, shiftStart: earliestStart, shiftEnd: latestEnd,
          vehicleNumber: lastShift.vehicle_number ?? null, trailerNumber: lastShift.trailer_number ?? null,
        };
      });

      const weekDrivingMinutes = days.reduce((sum, d) => sum + d.drivingMinutes, 0);
      const weekDutyMinutes = days.reduce((sum, d) => sum + d.dutyMinutes, 0);
      const extensionsUsed = days.filter(d => d.extension).length;

      return { driver, days, weekDrivingMinutes, weekDutyMinutes, extensionsUsed };
    });
  }, [weekDrivers, weekShifts, weekPingsByShift, weekDays]);

  const extensionsUsedByDriver = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of weeklyRows) map[row.driver.id] = row.extensionsUsed;
    return map;
  }, [weeklyRows]);

  const searchLower = driverSearch.trim().toLowerCase();
  const matchesSearch = useCallback((name?: string, code?: string) => {
    if (!searchLower) return true;
    return (name ?? '').toLowerCase().includes(searchLower) || (code ?? '').toLowerCase().includes(searchLower);
  }, [searchLower]);

  const rows = useMemo(() => {
    const nowMs = Date.now();
    return activeShifts
      .filter(s => matchesSearch(s.driver_name, s.driver_code))
      .map(s => {
        const pings = pingsByShift[s.id] ?? [];
        const duty = computeShiftDutyMinutes(s.start_time, null, null, pings, nowMs);
        const drivingMinutes = computeContinuousDrivingMinutes(pings);
        const currentStationaryMinutes = computeCurrentStationaryMinutes(pings);
        const live = liveLocations.find(l => l.driver_id === s.driver_id);

        let depotName: string | null = null;
        if (live && live.status === 'stationary') {
          let best: DepotLite | null = null;
          let bestDist = Infinity;
          for (const d of depots) {
            const dist = haversineMeters(live.latitude, live.longitude, d.latitude, d.longitude);
            if (dist <= d.geofence_radius_m && dist < bestDist) {
              bestDist = dist;
              best = d;
            }
          }
          depotName = best?.name ?? null;
        }

        return {
          ...s,
          dutyMinutes: duty.minutes,
          stale: duty.stale,
          drivingMinutes,
          currentStationaryMinutes,
          liveStatus: live?.status ?? 'none' as 'moving' | 'stationary' | 'idle' | 'none',
          speedMph: live?.speed_mph ?? null,
          depotName,
          extensionsUsed: extensionsUsedByDriver[s.driver_id] ?? 0,
        };
      })
      .sort((a, b) => Math.max(b.dutyMinutes, b.drivingMinutes) - Math.max(a.dutyMinutes, a.drivingMinutes));
  }, [activeShifts, pingsByShift, liveLocations, depots, extensionsUsedByDriver, matchesSearch]);

  type CockpitRow = (typeof rows)[number];
  // Single source of truth for both the KPI counts and the row filter
  // triggered by clicking a KPI card — a card's number and what clicking
  // it shows can never drift apart.
  const isBreakDue = (r: CockpitRow) => !r.stale && (clockTier(r.drivingMinutes, DRIVING_AMBER, DRIVING_RED) === 'amber' || clockTier(r.dutyMinutes, DUTY_AMBER, DUTY_MAX) === 'amber');
  const isExtensionActive = (r: CockpitRow) => !r.stale && r.dutyMinutes >= SPAN_AMBER && r.dutyMinutes < SPAN_MAX;
  const isBreach = (r: CockpitRow) => !r.stale && clockTier(r.dutyMinutes, DUTY_AMBER, DUTY_MAX) === 'red';

  const staleCount = rows.filter(r => r.stale).length;
  const drivingCount = rows.filter(r => r.liveStatus === 'moving').length;
  const stationaryCount = rows.filter(r => r.liveStatus === 'stationary').length;
  const idleCount = rows.filter(r => r.liveStatus === 'idle' || r.liveStatus === 'none').length;

  const breakRequiredCount = rows.filter(isBreakDue).length;
  const wtdBreachCount = rows.filter(isBreach).length;
  const extensionsActiveCount = rows.filter(isExtensionActive).length;

  useEffect(() => {
    onAlertCountChange?.(breakRequiredCount + wtdBreachCount);
  }, [breakRequiredCount, wtdBreachCount, onAlertCountChange]);

  const visibleRows = useMemo(() => {
    switch (kpiFilter) {
      case 'breakDue': return rows.filter(isBreakDue);
      case 'extensions': return rows.filter(isExtensionActive);
      case 'breaches': return rows.filter(isBreach);
      default: return rows;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, kpiFilter]);

  const handleKpiClick = (filter: KpiFilter) => {
    setView('cockpit');
    setKpiFilter(prev => (prev === filter ? 'all' : filter));
  };

  const KPI_LABEL: Record<Exclude<KpiFilter, 'all'>, string> = {
    breakDue: 'Break Due (<30m)',
    extensions: '15h Extensions Active',
    breaches: 'WTD Breaches',
  };

  const filteredWeeklyRows = useMemo(
    () => weeklyRows.filter(r => matchesSearch(r.driver.full_name, r.driver.driver_id)),
    [weeklyRows, matchesSearch]
  );

  return (
    <div className="flex-1" onClick={() => setOpenMenuId(null)}>
      <div className="flex align-center justify-between mb-16" style={{ flexWrap: 'wrap', gap: '10px' }}>
        <h2 className="text-xl font-black text-primary m-0">DRIVER HOURS &amp; WTD</h2>

        {/* ── View switcher — icon-only, labelled via title/aria-label. ── */}
        <div className="flex align-center" style={{ gap: '2px', padding: '3px', borderRadius: '10px', background: 'var(--card-bg-hover)', border: '1px solid var(--border-color)' }}>
          {([
            ['cockpit', 'Live Shift Cockpit', Truck],
            ['timesheet', '7-Day Timesheet & Calendar', Calendar],
          ] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              title={label}
              aria-label={label}
              aria-pressed={view === key}
              className="flex align-center justify-center"
              style={{
                width: '30px', height: '30px', borderRadius: '7px', border: 'none', cursor: 'pointer',
                background: view === key ? 'var(--brand-red)' : 'transparent',
                color: view === key ? '#FFFFFF' : 'var(--charcoal)',
              }}
            >
              <Icon size={15} />
            </button>
          ))}
        </div>
      </div>

      {error && <div className="login-notice login-notice--error mb-16">{error}</div>}
      {weekError && <div className="login-notice login-notice--error mb-16">{weekError}</div>}

      {/* ── Sanitized top KPI strip — clickable: each card filters the
           Live Cockpit table below to the drivers behind that number. ── */}
      <div className="flex align-center mb-16" style={{ gap: '12px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => { setView('cockpit'); setKpiFilter('all'); }}
          className="glass-card p-16"
          style={{ minWidth: '190px', textAlign: 'left', font: 'inherit', cursor: 'pointer', border: kpiFilter === 'all' ? '1.5px solid var(--brand-red)' : undefined }}
        >
          <p className="text-xs font-bold text-muted m-0 mb-4" style={{ textTransform: 'uppercase', letterSpacing: '0.03em', fontSize: '10px' }}>Active On Duty</p>
          <p className="font-mono font-black text-primary m-0 tabular-nums" style={{ fontSize: '22px' }}>
            {rows.length} <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--charcoal-light)' }}>On Shift</span>
          </p>
          <p className="text-xs text-muted m-0" style={{ marginTop: '4px' }}>
            {drivingCount} Driving, {stationaryCount} Stationary, {idleCount} Idle
            {staleCount > 0 && <span style={{ color: '#CC0000', fontWeight: 700 }}> &bull; {staleCount} auto-suspended</span>}
          </p>
        </button>

        <button
          type="button"
          onClick={() => handleKpiClick('breakDue')}
          className="glass-card p-16"
          style={{
            minWidth: '170px', textAlign: 'left', font: 'inherit', cursor: 'pointer',
            border: kpiFilter === 'breakDue' ? '1.5px solid #F59E0B' : undefined,
            borderLeft: kpiFilter !== 'breakDue' && breakRequiredCount > 0 ? '3px solid #F59E0B' : undefined,
          }}
        >
          <p className="text-xs font-bold text-muted m-0 mb-4" style={{ textTransform: 'uppercase', letterSpacing: '0.03em', fontSize: '10px' }}>Break Due (&lt;30m)</p>
          <p className="font-mono font-black m-0 tabular-nums" style={{ fontSize: '22px', color: breakRequiredCount > 0 ? '#E65100' : 'var(--charcoal)' }}>{breakRequiredCount}</p>
          <p className="text-xs text-muted m-0" style={{ marginTop: '4px' }}>approaching 4.5h driving or 6h duty</p>
        </button>

        <button
          type="button"
          onClick={() => handleKpiClick('extensions')}
          className="glass-card p-16"
          style={{ minWidth: '170px', textAlign: 'left', font: 'inherit', cursor: 'pointer', border: kpiFilter === 'extensions' ? '1.5px solid #F59E0B' : undefined }}
        >
          <p className="text-xs font-bold text-muted m-0 mb-4" style={{ textTransform: 'uppercase', letterSpacing: '0.03em', fontSize: '10px' }}>15h Extensions Active</p>
          <p className="font-mono font-black m-0 tabular-nums" style={{ fontSize: '22px', color: extensionsActiveCount > 0 ? '#F59E0B' : 'var(--charcoal)' }}>{extensionsActiveCount}</p>
          <p className="text-xs text-muted m-0" style={{ marginTop: '4px' }}>in the 13h–15h spreadover window today</p>
        </button>

        <button
          type="button"
          onClick={() => handleKpiClick('breaches')}
          className="glass-card p-16"
          style={{
            minWidth: '170px', textAlign: 'left', font: 'inherit', cursor: 'pointer',
            border: kpiFilter === 'breaches' ? '1.5px solid #CC0000' : undefined,
            borderLeft: kpiFilter !== 'breaches' && wtdBreachCount > 0 ? '3px solid #CC0000' : undefined,
          }}
        >
          <p className="text-xs font-bold text-muted m-0 mb-4" style={{ textTransform: 'uppercase', letterSpacing: '0.03em', fontSize: '10px' }}>WTD Breaches</p>
          <p className="font-mono font-black m-0 tabular-nums" style={{ fontSize: '22px', color: wtdBreachCount > 0 ? '#CC0000' : 'var(--charcoal)' }}>{wtdBreachCount}</p>
          <p className="text-xs text-muted m-0" style={{ marginTop: '4px' }}>legitimate active breaches, stale shifts excluded</p>
        </button>
      </div>

      {/* ── Shared search filter — persists across both views. ────── */}
      <div className="flex align-center mb-16" style={{ gap: '10px', flexWrap: 'wrap' }}>
        <div className="telemetry-search-wrap" style={{ minWidth: '220px' }}>
          <input
            type="text"
            placeholder="Filter by driver name or employee code…"
            value={driverSearch}
            onChange={(e) => setDriverSearch(e.target.value)}
          />
        </div>

        {view === 'timesheet' && (
          <div className="flex align-center" style={{ gap: '8px', marginLeft: 'auto' }}>
            <button
              type="button"
              onClick={() => setWeekAnchor(prev => addDays(prev, -7))}
              aria-label="Previous week"
              style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '8px', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--charcoal)' }}
            >
              <ChevronLeft size={14} />
            </button>
            <span className="flex align-center font-mono font-bold text-primary text-sm" style={{ gap: '6px', minWidth: '190px', justifyContent: 'center' }}>
              <Calendar size={13} /> {formatWeekRange(weekStart)}
            </span>
            <button
              type="button"
              onClick={() => setWeekAnchor(prev => addDays(prev, 7))}
              aria-label="Next week"
              style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '8px', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--charcoal)' }}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      {view === 'cockpit' && kpiFilter !== 'all' && (
        <div className="flex align-center mb-16" style={{ gap: '8px' }}>
          <span className="text-xs text-secondary">
            Showing <span className="font-mono font-bold tabular-nums">{visibleRows.length}</span> of {rows.length} — filtered by <strong>{KPI_LABEL[kpiFilter]}</strong>
          </span>
          <button
            type="button"
            onClick={() => setKpiFilter('all')}
            className="flex align-center text-xs font-bold"
            style={{ gap: '4px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--charcoal-light)' }}
          >
            <X size={12} /> Clear filter
          </button>
        </div>
      )}

      {isLoading && view === 'cockpit' && <p className="text-sm text-muted mb-16">Loading…</p>}
      {isWeekLoading && view === 'timesheet' && <p className="text-sm text-muted mb-16">Loading…</p>}

      {/* ── TAB 1: Live Shift Cockpit ────────────────────────────── */}
      {view === 'cockpit' && (
        rows.length === 0 && !isLoading ? (
          <div className="glass-card">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><CircleCheck /></EmptyMedia>
                <EmptyTitle>No Active Shifts</EmptyTitle>
                <EmptyDescription>Duty status appears here once a driver clocks in.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="glass-card">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><CheckCircle2 /></EmptyMedia>
                <EmptyTitle>Nothing Matches {KPI_LABEL[kpiFilter as Exclude<KpiFilter, 'all'>]}</EmptyTitle>
                <EmptyDescription>No driver currently on shift meets this condition.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>Live Activity State</th>
                  <th><span className="flex align-center" style={{ gap: '4px' }}><Clock size={11} /> Continuous Driving (Max 4.5h)</span></th>
                  <th><span className="flex align-center" style={{ gap: '4px' }}><Clock size={11} /> WTD Continuous Duty (Max 6h)</span></th>
                  <th>Daily Spreadover (13h / 15h Budget)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(r => {
                  const hardCapped = r.extensionsUsed >= MAX_15H_EXTENSIONS;
                  const spreadMax = hardCapped ? SPAN_AMBER : SPAN_MAX;
                  const spreadAmber = hardCapped ? Math.round(SPAN_AMBER * 0.9) : SPAN_AMBER;
                  return (
                    <tr key={r.id}>
                      <td>
                        <p className="font-bold text-primary m-0">{r.driver_name ?? '—'}</p>
                        {r.driver_code && <p className="font-mono uppercase text-muted m-0" style={{ fontSize: '11px' }}>{r.driver_code}</p>}
                      </td>
                      <td>
                        {r.stale ? (
                          <StaleBadge />
                        ) : r.liveStatus === 'moving' ? (
                          <div className="flex align-center" style={{ gap: '7px' }}>
                            <span className="telemetry-status-dot telemetry-status-dot--driving" />
                            <div>
                              <p className="font-bold m-0" style={{ fontSize: '12.5px', color: '#10B981' }}>DRIVING</p>
                              <p className="font-mono tabular-nums text-muted m-0" style={{ fontSize: '11px' }}>{Math.round(r.speedMph ?? 0)} mph</p>
                            </div>
                          </div>
                        ) : r.liveStatus === 'stationary' ? (
                          <div className="flex align-center" style={{ gap: '7px' }}>
                            <span className="telemetry-status-dot telemetry-status-dot--stationary" />
                            <div>
                              <p className="font-bold m-0" style={{ fontSize: '12.5px', color: '#F59E0B' }}>OTHER WORK / IDLE</p>
                              <p className="font-mono tabular-nums text-muted m-0" style={{ fontSize: '11px' }}>
                                {formatClock(r.currentStationaryMinutes).replace(/^00:/, '')}m{r.depotName ? ` • ${r.depotName}` : ''}
                              </p>
                            </div>
                          </div>
                        ) : r.liveStatus === 'idle' ? (
                          <div className="flex align-center" style={{ gap: '7px' }}>
                            <span className="telemetry-status-dot telemetry-status-dot--idle" />
                            <p className="font-bold text-secondary m-0" style={{ fontSize: '12.5px' }}>OFF DUTY &bull; no recent signal</p>
                          </div>
                        ) : (
                          <div className="flex align-center" style={{ gap: '7px' }}>
                            <span className="telemetry-status-dot telemetry-status-dot--none" />
                            <p className="text-muted m-0" style={{ fontSize: '12.5px' }}>No telemetry yet</p>
                          </div>
                        )}
                      </td>
                      <td>
                        <SegmentedClockBar
                          valueMinutes={r.drivingMinutes}
                          maxMinutes={DRIVING_MAX}
                          amberAtMinutes={DRIVING_AMBER}
                          redAtMinutes={DRIVING_RED}
                          valueLabel={formatClock(r.drivingMinutes)}
                          maxLabel="04:30"
                          subtitle={
                            clockTier(r.drivingMinutes, DRIVING_AMBER, DRIVING_RED) === 'red'
                              ? '4h30 limit imminent'
                              : `${formatClock(Math.max(0, DRIVING_MAX - r.drivingMinutes))} remaining`
                          }
                        />
                      </td>
                      <td>
                        <SegmentedClockBar
                          valueMinutes={r.dutyMinutes}
                          maxMinutes={DUTY_MAX}
                          amberAtMinutes={DUTY_AMBER}
                          redAtMinutes={DUTY_MAX}
                          valueLabel={formatClock(r.dutyMinutes)}
                          maxLabel="06:00"
                          subtitle={
                            r.stale
                              ? 'Clock frozen at last known ping'
                              : clockTier(r.dutyMinutes, DUTY_AMBER, DUTY_MAX) !== 'green'
                                ? '15m Break Required'
                                : `${formatClock(Math.max(0, DUTY_MAX - r.dutyMinutes))} until break due`
                          }
                        />
                      </td>
                      <td>
                        <div className="mb-4"><ExtensionBudgetDots used={r.extensionsUsed} total={MAX_15H_EXTENSIONS} /></div>
                        <SegmentedClockBar
                          valueMinutes={r.dutyMinutes}
                          maxMinutes={spreadMax}
                          amberAtMinutes={spreadAmber}
                          redAtMinutes={spreadMax}
                          valueLabel={formatClock(r.dutyMinutes)}
                          maxLabel={hardCapped ? '13:00' : '15:00'}
                          subtitle={
                            hardCapped && r.dutyMinutes >= spreadAmber
                              ? '13h Hard Limit — Return to Base'
                              : `${r.extensionsUsed} / ${MAX_15H_EXTENSIONS} Used this week`
                          }
                        />
                      </td>
                      <td style={{ position: 'relative', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setOpenMenuId(prev => (prev === r.id ? null : r.id)); }}
                          aria-label="Actions"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--charcoal-light)', padding: '4px' }}
                        >
                          <MoreVertical size={16} />
                        </button>
                        {openMenuId === r.id && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="glass-panel"
                            style={{
                              position: 'absolute', right: 0, top: '32px', zIndex: 20, minWidth: '190px',
                              borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden',
                            }}
                          >
                            {r.driver_phone ? (
                              <a
                                href={`tel:${r.driver_phone}`}
                                className="flex align-center text-sm text-primary"
                                style={{ gap: '8px', padding: '10px 14px', textDecoration: 'none' }}
                              >
                                <Phone size={13} /> Call Driver
                              </a>
                            ) : (
                              <div className="flex align-center text-sm text-muted" style={{ gap: '8px', padding: '10px 14px' }}>
                                <Phone size={13} /> No phone on file
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => { setOpenMenuId(null); onViewRouteHistory?.(r.driver_id); }}
                              className="flex align-center text-sm text-primary"
                              style={{ gap: '8px', padding: '10px 14px', background: 'none', border: 'none', borderTop: '1px solid var(--border-color)', width: '100%', cursor: 'pointer', textAlign: 'left' }}
                            >
                              <MapPin size={13} /> View Route History
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
        )
      )}

      {/* ── TAB 2: 7-Day Timesheet & Calendar Matrix ────────────── */}
      {view === 'timesheet' && (
        filteredWeeklyRows.length === 0 && !isWeekLoading ? (
          <div className="glass-card">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><Calendar /></EmptyMedia>
                <EmptyTitle>No Drivers Found</EmptyTitle>
                <EmptyDescription>Active drivers will appear here once added under Driver Profiles.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table" style={{ tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th style={{ width: '140px' }}>Driver</th>
                  {weekDays.map(d => (
                    <th key={dateKey(d)} style={{ width: '108px', color: isSameDay(d, new Date()) ? 'var(--brand-red)' : undefined }}>
                      {formatDayHeader(d)}
                    </th>
                  ))}
                  <th style={{ width: '130px' }}><span className="flex align-center" style={{ gap: '4px' }}><TrendingUp size={11} /> Week Driving</span></th>
                  <th style={{ width: '130px' }}>Week WTD Duty</th>
                  <th style={{ width: '110px' }}>15h Ext.</th>
                </tr>
              </thead>
              <tbody>
                {filteredWeeklyRows.map(row => {
                  const drivingTier = clockTier(row.weekDrivingMinutes, WEEKLY_DRIVING_AMBER, WEEKLY_DRIVING_MAX);
                  const dutyTier = clockTier(row.weekDutyMinutes, WEEKLY_DUTY_AMBER, WEEKLY_DUTY_MAX);
                  const tierColor = { green: 'var(--charcoal)', amber: '#F59E0B', red: '#CC0000' } as const;
                  return (
                    <tr key={row.driver.id}>
                      <td>
                        <p className="font-bold text-primary m-0" style={{ fontSize: '12.5px' }}>{row.driver.full_name}</p>
                        <p className="font-mono uppercase text-muted m-0" style={{ fontSize: '10.5px' }}>{row.driver.driver_id}</p>
                      </td>
                      {row.days.map(cell => (
                        <td
                          key={cell.dateKey}
                          onClick={() => cell.hasShift && setDrawerCell({ driverName: row.driver.full_name, cell })}
                          style={{ cursor: cell.hasShift ? 'pointer' : 'default', background: cell.isToday ? 'var(--card-bg-hover)' : undefined, verticalAlign: 'top' }}
                        >
                          {!cell.hasShift ? (
                            <span className="text-xs text-muted">—</span>
                          ) : (
                            <div>
                              <p className="font-mono font-bold tabular-nums m-0" style={{ fontSize: '11.5px', color: '#10B981' }}>{formatHM(cell.drivingMinutes)}</p>
                              <p className="font-mono tabular-nums m-0" style={{ fontSize: '10.5px', color: cell.breach ? '#CC0000' : cell.extension ? '#F59E0B' : 'var(--charcoal-mid)' }}>
                                {formatHM(cell.dutyMinutes)} <span style={{ fontWeight: 700 }}>[{cell.breach ? '15h BREACH' : cell.extension ? '15h EXT' : '13h OK'}]</span>
                              </p>
                              {(cell.vehicleNumber || cell.trailerNumber) && (
                                <p className="font-mono m-0" style={{ fontSize: '9.5px', color: 'var(--charcoal-light)', textTransform: 'uppercase' }}>
                                  {[cell.vehicleNumber, cell.trailerNumber].filter(Boolean).join(' / ')}
                                </p>
                              )}
                              {cell.stale && <p className="m-0" style={{ fontSize: '9.5px', color: '#CC0000', fontWeight: 700 }}>STALE</p>}
                              {cell.restMinutesBefore != null && (
                                <p className="flex align-center m-0" style={{ fontSize: '10px', gap: '3px', color: cell.restMinutesBefore >= DAILY_REST_MIN ? 'var(--charcoal-light)' : cell.restMinutesBefore >= REDUCED_REST_MIN ? '#F59E0B' : '#CC0000' }}>
                                  <PauseCircle size={10} />
                                  {cell.restMinutesBefore >= DAILY_REST_MIN ? `Rest ${formatHM(cell.restMinutesBefore)}` : cell.restMinutesBefore >= REDUCED_REST_MIN ? `Reduced ${formatHM(cell.restMinutesBefore)}` : `Breach ${formatHM(cell.restMinutesBefore)}`}
                                </p>
                              )}
                            </div>
                          )}
                        </td>
                      ))}
                      <td>
                        <p className="font-mono font-bold tabular-nums m-0" style={{ color: tierColor[drivingTier] }}>{formatHM(row.weekDrivingMinutes)} / 56h</p>
                      </td>
                      <td>
                        <p className="font-mono font-bold tabular-nums m-0" style={{ color: tierColor[dutyTier] }}>{formatHM(row.weekDutyMinutes)} / 60h</p>
                      </td>
                      <td>
                        <span className={`badge ${row.extensionsUsed > MAX_15H_EXTENSIONS ? 'badge-danger' : row.extensionsUsed === MAX_15H_EXTENSIONS ? 'badge-warning' : 'badge-accent'}`}>
                          {row.extensionsUsed > MAX_15H_EXTENSIONS
                            ? <AlertTriangle size={10} style={{ marginRight: '3px' }} />
                            : <CheckCircle2 size={10} style={{ marginRight: '3px' }} />}
                          {row.extensionsUsed} / {MAX_15H_EXTENSIONS} used
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {drawerCell && (
        <DayDetailDrawer
          driverName={drawerCell.driverName}
          cell={drawerCell.cell}
          onClose={() => setDrawerCell(null)}
        />
      )}
    </div>
  );
}
