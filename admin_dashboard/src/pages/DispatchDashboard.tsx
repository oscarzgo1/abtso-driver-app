import { useMemo, useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import {
  Users, Radio, Route, Hourglass, PackageCheck, PackageOpen, Truck, Phone, MapPinned,
  Search, ChevronLeft, ChevronRight, BarChart3, PoundSterling, Gauge, UserRound, Activity, Clock, CircleCheck,
} from 'lucide-react';
import { SemiGauge } from '@/components/ui/semi-gauge';
import { TrackingTimeline, type TimelineStep } from '@/components/ui/tracking-timeline';
import { FleetStatusDonutChart } from '@/components/ui/fleet-status-donut-chart';
import { BadgeDelta } from '@/components/ui/badge-delta';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';

interface DashboardLiveLocation {
  driver_id: string;
  driver_code: string;
  driver_name: string;
  status: 'moving' | 'stationary' | 'idle';
  speed_mph: number;
  last_ping: string;
}

interface DashboardAlert {
  id: string;
  driver_id: string;
  driver_name?: string;
  acknowledged: boolean;
  is_sos?: boolean;
  started_at?: string;
  created_at?: string;
  timestamp?: string;
  vehicle_number?: string | null;
}

interface DashboardEmployee {
  id: string;
  driver_id: string;
  full_name: string;
  phone: string;
  is_active: boolean;
  created_at?: string;
}

interface DashboardShift {
  id: string;
  driver_id: string;
  driver_name?: string;
  start_time: string;
  end_time: string | null;
  status: 'active' | 'completed';
  total_pay: number | null;
  vehicle_number?: string | null;
  trailer_number?: string | null;
  load_reference?: string | null;
  load_delivered_at?: string | null;
  carrier_name?: string | null;
  revenue_amount?: number | null;
}

export type DashboardNavTarget = 'live' | 'alerts' | 'shipments' | 'analytics' | 'drivers';

interface DispatchDashboardProps {
  liveLocations: DashboardLiveLocation[];
  employees: DashboardEmployee[];
  shifts: DashboardShift[];
  alerts: DashboardAlert[];
  idleThresholdMinutes: number;
  fuelCostByShift: Record<string, number>;
  showFinancials: boolean;
  onNavigate: (target: DashboardNavTarget) => void;
}

interface IdleDriver {
  driverId: string;
  name: string;
  since: string;
  reason: string;
  unit: string;
}

type ShipmentStatus = 'awaiting_load' | 'in_transit' | 'delivered' | 'awaiting_rate' | 'completed';

const STATUS_META: Record<ShipmentStatus, { label: string; badge: string }> = {
  awaiting_load: { label: 'Awaiting load', badge: 'badge badge-danger' },
  in_transit: { label: 'In transit', badge: 'badge badge-accent' },
  delivered: { label: 'Delivered', badge: 'badge badge-success' },
  awaiting_rate: { label: 'Awaiting rate', badge: 'badge badge-warning' },
  completed: { label: 'Completed', badge: 'badge badge-dark' },
};

const isOpenStatus = (s: ShipmentStatus) => s === 'awaiting_load' || s === 'in_transit' || s === 'delivered';

// Same palette as Analytics: charcoal for volume, brand red for the
// second series, #10B981 / brand red for profit vs loss.
const CHARCOAL = '#333333';
const BRAND_RED = '#CC0000';
const PROFIT_GREEN = '#10B981';

const PAGE_SIZE = 8;

// ── helpers ───────────────────────────────────────────────────

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const startOfWeek = (d: Date) => { const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const inRange = (iso: string | null | undefined, from: Date, to: Date) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= from.getTime() && t < to.getTime();
};

const pounds = (v: number, dp = 0) => `£${v.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
const titleCase = (s: string) => s.toLowerCase().split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
const initials = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
};

function duration(fromIso: string, toIso?: string | null): string {
  const mins = Math.max(0, Math.floor(((toIso ? new Date(toIso).getTime() : Date.now()) - new Date(fromIso).getTime()) / 60000));
  const h = Math.floor(mins / 60);
  return h > 0 ? `${h}h ${mins % 60}m` : `${mins}m`;
}

// ── small presentational pieces ───────────────────────────────

function Panel({ icon, title, subtitle, action, className, bodyClassName, children }: {
  icon: ReactNode; title: string; subtitle?: string; action?: ReactNode; className?: string; bodyClassName?: string; children: ReactNode;
}) {
  return (
    <section className={`dash-panel ${className ?? ''}`}>
      <div className="dash-panel-header">
        <span className="telemetry-header-icon">{icon}</span>
        <div className="dash-panel-heading">
          <h3 className="telemetry-title">{title}</h3>
          {subtitle && <p className="dash-panel-subtitle">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className={bodyClassName ?? 'dash-panel-body'}>{children}</div>
    </section>
  );
}

/** Week-on-week change in the same BadgeDelta pill Analytics uses. */
function WeekChange({ current, previous, higherIsBetter = true }: { current: number; previous: number; higherIsBetter?: boolean }) {
  if (current === 0 && previous === 0) return <span>No change vs last week</span>;
  const direction = current === previous ? 'flat' : current > previous ? 'up' : 'down';
  const good = direction === 'flat' ? null : (direction === 'up') === higherIsBetter;
  const label = previous === 0 ? 'New' : `${((current - previous) / previous) * 100 > 0 ? '+' : ''}${(((current - previous) / previous) * 100).toFixed(1)}%`;
  return (
    <>
      <BadgeDelta label={label} direction={direction} tone={good === null ? 'neutral' : good ? 'positive' : 'negative'} />
      <span>vs last week</span>
    </>
  );
}

function StatTile({ icon, value, label, footer, onClick }: { icon: ReactNode; value: string | number; label: string; footer?: ReactNode; onClick?: () => void }) {
  const body = (
    <>
      <span className="kpi-icon kpi-icon--red">{icon}</span>
      <span style={{ minWidth: 0 }}>
        <span className="dash-stat-value">{value}</span>
        <span className="dash-stat-label">{label}</span>
        {footer && <span className="dash-stat-footer">{footer}</span>}
      </span>
    </>
  );
  return onClick
    ? <button type="button" className="dash-stat" onClick={onClick}>{body}</button>
    : <div className="dash-stat">{body}</div>;
}

// ── the page ──────────────────────────────────────────────────

export default function DispatchDashboard({ liveLocations, employees, shifts, alerts, idleThresholdMinutes, fuelCostByShift, showFinancials, onNavigate }: DispatchDashboardProps) {
  const [chartMode, setChartMode] = useState<'daily' | 'weekly'>('daily');
  const [tableTab, setTableTab] = useState<'all' | ShipmentStatus>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [trackedId, setTrackedId] = useState<string | null>(null);

  const todayMs = startOfDay(new Date()).getTime();
  const weekStart = startOfWeek(new Date(todayMs));
  const lastWeekStart = addDays(weekStart, -7);
  const weekEnd = addDays(weekStart, 7);

  // Without financial access revenue isn't visible, so "awaiting rate"
  // would be meaningless — every finished shipment reads as completed.
  const shipments = useMemo(() => {
    const statusOf = (s: DashboardShift): ShipmentStatus => {
      if (!s.end_time && s.status !== 'completed') {
        if (!s.load_reference) return 'awaiting_load';
        return s.load_delivered_at ? 'delivered' : 'in_transit';
      }
      if (showFinancials && (s.revenue_amount === null || s.revenue_amount === undefined)) return 'awaiting_rate';
      return 'completed';
    };
    return [...shifts]
      .sort((a, b) => b.start_time.localeCompare(a.start_time))
      .map(s => ({ ...s, driver_name: s.driver_name ? titleCase(s.driver_name) : undefined, shipmentStatus: statusOf(s) }));
  }, [shifts, showFinancials]);

  const counts = useMemo(() => {
    const c: Record<ShipmentStatus, number> = { awaiting_load: 0, in_transit: 0, delivered: 0, awaiting_rate: 0, completed: 0 };
    for (const s of shipments) c[s.shipmentStatus] += 1;
    return c;
  }, [shipments]);

  // ── employees ──
  const liveIds = useMemo(() => new Set(liveLocations.flatMap(l => [l.driver_id, l.driver_code])), [liveLocations]);
  const activeShiftDriverIds = useMemo(() => new Set(shipments.filter(s => isOpenStatus(s.shipmentStatus)).map(s => s.driver_id)), [shipments]);
  const onShiftCount = useMemo(
    () => new Set([...liveLocations.map(l => l.driver_id), ...activeShiftDriverIds]).size,
    [liveLocations, activeShiftDriverIds],
  );
  const activeEmployees = employees.filter(e => e.is_active);
  const newThisWeek = employees.filter(e => inRange(e.created_at, weekStart, weekEnd)).length;
  const availableCount = activeEmployees.filter(e => !liveIds.has(e.id) && !liveIds.has(e.driver_id) && !activeShiftDriverIds.has(e.id)).length;

  const movingCount = liveLocations.filter(l => l.status === 'moving').length;
  const stoppedCount = liveLocations.filter(l => l.status !== 'moving').length;

  // ── idle drivers ──
  // Read-only summary: acknowledging stays in the Alert Panel. One row per
  // driver, from either an open idle alert (stationary past the threshold)
  // or a live position with no ping for that long — earliest start wins.
  const idleDrivers = useMemo(() => {
    const unitFor = (driverId: string, fallback?: string | null) => {
      const shift = shifts.find(s => s.driver_id === driverId && !s.end_time && s.status !== 'completed');
      return [shift?.vehicle_number ?? fallback, shift?.trailer_number].filter(Boolean).join(' / ');
    };
    const ms = (iso: string) => new Date(iso).getTime();
    const byDriver = new Map<string, IdleDriver>();
    const add = (entry: IdleDriver) => {
      const existing = byDriver.get(entry.driverId);
      if (!existing || ms(entry.since) < ms(existing.since)) byDriver.set(entry.driverId, entry);
    };
    for (const a of alerts) {
      if (a.acknowledged || a.is_sos) continue;
      const since = a.started_at ?? a.created_at ?? a.timestamp;
      if (!since) continue;
      add({ driverId: a.driver_id, name: titleCase(a.driver_name || 'Driver'), since, reason: 'Stationary', unit: unitFor(a.driver_id, a.vehicle_number) });
    }
    for (const l of liveLocations) {
      if (l.status !== 'idle') continue;
      add({ driverId: l.driver_id, name: titleCase(l.driver_name), since: l.last_ping, reason: 'No GPS signal', unit: unitFor(l.driver_id) });
    }
    return [...byDriver.values()].sort((a, b) => ms(a.since) - ms(b.since));
  }, [alerts, liveLocations, shifts]);

  // ── week-on-week ──
  const completedIn = (from: Date, to: Date) => shifts.filter(s => s.status === 'completed' && inRange(s.end_time, from, to));
  const completedThisWeek = completedIn(weekStart, weekEnd);
  const completedLastWeek = completedIn(lastWeekStart, weekStart);

  const finance = (list: DashboardShift[]) => {
    const revenue = list.reduce((sum, s) => sum + (s.revenue_amount ?? 0), 0);
    const wages = list.reduce((sum, s) => sum + (s.total_pay ?? 0), 0);
    const fuel = list.reduce((sum, s) => sum + (fuelCostByShift[s.id] ?? 0), 0);
    return { revenue, wages, fuel, profit: revenue - wages - fuel };
  };
  const thisWeek = finance(completedThisWeek);
  const lastWeek = finance(completedLastWeek);
  const marginPct = thisWeek.revenue > 0 ? (thisWeek.profit / thisWeek.revenue) * 100 : 0;

  // ── shipments statistics chart ──
  const chartData = useMemo(() => {
    const today = new Date(todayMs);
    const thisWeekStart = startOfWeek(today);
    const buckets = chartMode === 'daily'
      ? Array.from({ length: 10 }, (_, i) => { const from = addDays(today, i - 9); return { from, to: addDays(from, 1), label: shortDate(from.toISOString()) }; })
      : Array.from({ length: 8 }, (_, i) => { const from = addDays(thisWeekStart, (i - 7) * 7); return { from, to: addDays(from, 7), label: shortDate(from.toISOString()) }; });
    return buckets.map(b => ({
      label: b.label,
      started: shifts.filter(s => inRange(s.start_time, b.from, b.to)).length,
      completed: shifts.filter(s => s.status === 'completed' && inRange(s.end_time, b.from, b.to)).length,
    }));
  }, [chartMode, shifts, todayMs]);
  const chartTotal = chartData.reduce((sum, d) => sum + d.started, 0);

  // ── vehicles ──
  const liveShipments = shipments.filter(s => isOpenStatus(s.shipmentStatus));
  const vehiclesOnRoad = new Set(liveShipments.map(s => s.vehicle_number).filter(Boolean)).size;
  const trailersCoupled = new Set(liveShipments.map(s => s.trailer_number).filter(Boolean)).size;
  const loadsAttached = counts.in_transit + counts.delivered;
  const loadsAttachedPct = liveShipments.length > 0 ? (loadsAttached / liveShipments.length) * 100 : 0;

  // ── tracking ──
  const tracked = (trackedId ? shipments.find(s => s.id === trackedId) : undefined)
    ?? liveShipments.find(s => s.load_reference) ?? liveShipments[0] ?? shipments[0] ?? null;

  const trackedLive = tracked ? liveLocations.find(l => l.driver_id === tracked.driver_id) : undefined;
  const trackedEmployee = tracked ? employees.find(e => e.id === tracked.driver_id) : undefined;
  const trackedName = tracked?.driver_name || (trackedEmployee ? titleCase(trackedEmployee.full_name) : 'Unknown driver');
  const trackingSteps: TimelineStep[] = tracked
    ? [
        { title: 'Clocked in', detail: [tracked.vehicle_number, tracked.trailer_number].filter(Boolean).join(' / ') || 'No unit assigned', time: time(tracked.start_time), status: 'completed' },
        {
          title: 'Load attached',
          detail: tracked.load_reference ? `${tracked.load_reference}${tracked.carrier_name ? ` · ${tracked.carrier_name}` : ''}` : 'Waiting for a load reference',
          status: tracked.load_reference ? 'completed' : tracked.end_time ? 'pending' : 'active',
        },
        {
          title: 'On the road',
          detail: tracked.end_time
            ? `Shift lasted ${duration(tracked.start_time, tracked.end_time)}`
            : trackedLive
              ? trackedLive.status === 'moving' ? `Moving at ${Math.round(trackedLive.speed_mph)} mph` : trackedLive.status === 'idle' ? 'Idle' : 'Stopped'
              : 'No live signal',
          status: tracked.end_time ? 'completed' : 'active',
        },
        {
          title: 'Load delivered',
          detail: tracked.load_delivered_at ? 'Confirmed by the driver' : tracked.load_reference ? 'Not confirmed yet' : 'No load attached',
          time: tracked.load_delivered_at ? time(tracked.load_delivered_at) : undefined,
          status: tracked.load_delivered_at ? 'completed' : tracked.load_reference && !tracked.end_time ? 'active' : 'pending',
        },
        { title: 'Clocked out', detail: tracked.end_time ? shortDate(tracked.end_time) : 'Still on shift', time: tracked.end_time ? time(tracked.end_time) : undefined, status: tracked.end_time ? 'completed' : 'pending' },
      ]
    : [];

  // ── table ──
  const query = search.trim().toLowerCase();
  const tableRows = shipments.filter(s => {
    if (tableTab !== 'all' && s.shipmentStatus !== tableTab) return false;
    if (!query) return true;
    return [s.driver_name, s.load_reference, s.carrier_name, s.vehicle_number].some(v => v?.toLowerCase().includes(query));
  });
  const pageCount = Math.max(1, Math.ceil(tableRows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = tableRows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const tabOptions: { value: 'all' | ShipmentStatus; label: string; count: number }[] = [
    { value: 'all', label: 'All Shipments', count: shipments.length },
    { value: 'awaiting_load', label: 'Awaiting Load', count: counts.awaiting_load },
    { value: 'in_transit', label: 'In Transit', count: counts.in_transit },
    { value: 'delivered', label: 'Delivered', count: counts.delivered },
    ...(showFinancials ? [{ value: 'awaiting_rate' as const, label: 'Awaiting Rate', count: counts.awaiting_rate }] : []),
    { value: 'completed', label: 'Completed', count: counts.completed },
  ];

  const ChartTooltip = ({ active, payload, label }: TooltipContentProps) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '8px 11px', boxShadow: '0 6px 16px rgba(0,0,0,0.12)', fontSize: '11px' }}>
        <div style={{ color: 'var(--charcoal-light)', fontWeight: 700, marginBottom: '4px' }}>{chartMode === 'daily' ? label : `Week of ${label}`}</div>
        {payload.map(p => (
          <div key={String(p.dataKey)} style={{ display: 'flex', justifyContent: 'space-between', gap: '14px', color: 'var(--charcoal-light)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '2px', background: p.dataKey === 'started' ? CHARCOAL : BRAND_RED }} />
              {p.dataKey === 'started' ? 'Started' : 'Completed'}
            </span>
            <span style={{ fontWeight: 700, color: 'var(--charcoal)' }}>{p.value as number}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col" style={{ gap: '24px' }}>
      <div className="flex align-center justify-between">
        <div>
          <h2 className="text-xl font-black text-primary m-0">DASHBOARD</h2>
          <p className="text-xs text-muted m-0 mt-4">Employees, shipments and this week's numbers at a glance.</p>
        </div>
        <span className="flex items-center text-xs font-bold text-muted" style={{ gap: '6px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          <span className="dash-live-dot" /> Live
        </span>
      </div>

      {/* ── Overview ── */}
      <div>
        <p className="dash-section-label">Overview</p>
        <div className="dash-panel dash-stat-strip">
          <StatTile
            icon={<Users size={18} />}
            value={employees.length}
            label="Registered employees"
            footer={<span>{activeEmployees.length} active{newThisWeek > 0 ? ` · +${newThisWeek} this week` : ''}</span>}
            onClick={() => onNavigate('drivers')}
          />
          <StatTile
            icon={<Radio size={18} />}
            value={onShiftCount}
            label="On shift now"
            footer={<span>{movingCount} moving · {stoppedCount} stopped</span>}
            onClick={() => onNavigate('live')}
          />
          <StatTile
            icon={<Clock size={18} />}
            value={idleDrivers.length}
            label="Idle drivers"
            footer={<span>Over {idleThresholdMinutes} mins without moving</span>}
            onClick={() => onNavigate('alerts')}
          />
          <StatTile icon={<Route size={18} />} value={counts.in_transit} label="In transit" footer={<span>Loads on the road</span>} />
          {showFinancials ? (
            <StatTile
              icon={<Hourglass size={18} />}
              value={counts.awaiting_rate}
              label="Awaiting rate"
              footer={<span>Finished, not yet billed</span>}
              onClick={() => onNavigate('shipments')}
            />
          ) : (
            <StatTile icon={<PackageOpen size={18} />} value={counts.awaiting_load} label="Awaiting load" footer={<span>On shift, no load yet</span>} />
          )}
          <StatTile
            icon={<PackageCheck size={18} />}
            value={completedThisWeek.length}
            label="Completed this week"
            footer={<WeekChange current={completedThisWeek.length} previous={completedLastWeek.length} />}
          />
        </div>
      </div>

      {/* ── Shipments & analytics ── */}
      <div>
        <p className="dash-section-label">Shipments &amp; Analytics</p>
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4" style={{ gap: '16px', alignItems: 'start' }}>
          <Panel
            className="lg:col-span-2"
            icon={<BarChart3 size={14} />}
            title="Shipments Statistics"
            subtitle={`${chartTotal} shipment${chartTotal === 1 ? '' : 's'} started in the last ${chartMode === 'daily' ? '10 days' : '8 weeks'}`}
            action={
              <div className="dash-segmented">
                {(['daily', 'weekly'] as const).map(mode => (
                  <button key={mode} type="button" className={chartMode === mode ? 'is-active' : ''} onClick={() => setChartMode(mode)}>
                    {mode === 'daily' ? 'Daily' : 'Weekly'}
                  </button>
                ))}
              </div>
            }
          >
            <div className="dash-legend">
              <span><i style={{ background: CHARCOAL }} />Started</span>
              <span><i style={{ background: BRAND_RED }} />Completed</span>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#E2E8F0" strokeDasharray="3 3" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#888888' }} tickMargin={8} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#888888' }} />
                <Tooltip content={ChartTooltip} cursor={{ fill: 'var(--card-bg-hover)' }} />
                {/* Recharts' entry animation never resolves in this app — see fleet-status-donut-chart.tsx. */}
                <Bar dataKey="started" fill={CHARCOAL} radius={[3, 3, 0, 0]} barSize={14} isAnimationActive={false} />
                <Bar dataKey="completed" fill={BRAND_RED} radius={[3, 3, 0, 0]} barSize={14} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>

          <div className="flex flex-col" style={{ gap: '16px' }}>
            {showFinancials ? (
              <Panel
                icon={<PoundSterling size={14} />}
                title="Revenue This Week"
                subtitle="Billed loads completed since Monday"
                action={<button type="button" className="btn btn-secondary" style={{ padding: '5px 10px', fontSize: '10px' }} onClick={() => onNavigate('analytics')}>Analytics</button>}
              >
                <SemiGauge value={marginPct} color={thisWeek.profit >= 0 ? PROFIT_GREEN : BRAND_RED} trackColor="#EEEEEE">
                  <span className="dash-figure">{pounds(thisWeek.revenue, 2)}</span>
                  <span className="dash-stat-footer" style={{ justifyContent: 'center' }}>
                    <WeekChange current={thisWeek.revenue} previous={lastWeek.revenue} />
                  </span>
                </SemiGauge>
                <dl className="dash-mini-stats">
                  <div><dt>Driver cost</dt><dd style={{ color: BRAND_RED }}>{pounds(thisWeek.wages)}</dd></div>
                  <div><dt>Fuel</dt><dd>{pounds(thisWeek.fuel)}</dd></div>
                  <div>
                    <dt>Margin</dt>
                    <dd style={{ color: thisWeek.revenue === 0 ? undefined : thisWeek.profit >= 0 ? PROFIT_GREEN : BRAND_RED }}>
                      {thisWeek.revenue > 0 ? `${marginPct.toFixed(1)}%` : '—'}
                    </dd>
                  </div>
                </dl>
              </Panel>
            ) : (
              <Panel icon={<Gauge size={14} />} title="Loads Attached" subtitle="Drivers on shift with a load reference">
                <SemiGauge value={loadsAttachedPct} color={CHARCOAL} trackColor="#EEEEEE">
                  <span className="dash-figure">{loadsAttached} of {liveShipments.length}</span>
                  <span className="dash-stat-footer" style={{ justifyContent: 'center' }}>shifts carrying a load</span>
                </SemiGauge>
              </Panel>
            )}

            <Panel icon={<Truck size={14} />} title="Vehicles On The Road" subtitle="Units assigned to open shifts">
              <div className="flex items-end justify-between" style={{ gap: '8px' }}>
                <div>
                  <span className="dash-figure" style={{ display: 'block' }}>{vehiclesOnRoad}</span>
                  <span className="text-xs text-muted">{trailersCoupled} trailer{trailersCoupled === 1 ? '' : 's'} coupled</span>
                  <span className="flex items-center text-xs font-bold" style={{ gap: '6px', marginTop: '10px', color: '#2E7D32' }}>
                    <span className="dash-live-dot" /> {movingCount} on route
                  </span>
                </div>
                <Truck size={60} strokeWidth={1.25} color="#DDDDDD" />
              </div>
            </Panel>
          </div>

          <Panel
            icon={<MapPinned size={14} />}
            title="Tracking"
            subtitle={trackedId ? 'Selected from Shipments Activity' : 'Most recent shipment on the road'}
            action={<button type="button" className="btn btn-secondary" style={{ padding: '5px 10px', fontSize: '10px' }} onClick={() => onNavigate('live')}>Live Map</button>}
          >
            {tracked ? (
              <>
                <div className="dash-tracking-ref">
                  <div style={{ minWidth: 0 }}>
                    <span className="input-label" style={{ display: 'block' }}>Load reference</span>
                    <span className="font-mono font-bold text-primary" style={{ fontSize: '13px' }}>{tracked.load_reference || '—'}</span>
                  </div>
                  <span className={STATUS_META[tracked.shipmentStatus].badge}>{STATUS_META[tracked.shipmentStatus].label}</span>
                </div>
                <TrackingTimeline steps={trackingSteps} />
                <div className="dash-driver-row">
                  <div className="flex items-center" style={{ gap: '10px', minWidth: 0 }}>
                    <span className="dash-avatar">{initials(trackedName)}</span>
                    <div style={{ minWidth: 0 }}>
                      <span className="input-label" style={{ display: 'block' }}>Driver</span>
                      <span className="font-bold text-primary text-sm">{trackedName}</span>
                    </div>
                  </div>
                  {trackedEmployee?.phone && (
                    <a href={`tel:${trackedEmployee.phone}`} title={`Call ${trackedEmployee.phone}`} className="telemetry-filter-icon-btn" style={{ borderRadius: '50%', color: 'var(--brand-red)' }}>
                      <Phone size={15} />
                    </a>
                  )}
                </div>
              </>
            ) : (
              <Empty className="py-10">
                <EmptyHeader>
                  <EmptyMedia variant="icon"><Truck /></EmptyMedia>
                  <EmptyTitle>Nothing To Track</EmptyTitle>
                  <EmptyDescription>Shipments appear here once a driver clocks in.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </Panel>
        </div>
      </div>

      {/* ── Activity & workforce ── */}
      <div>
        <p className="dash-section-label">Activity &amp; Workforce</p>
        <div className="grid grid-cols-1 xl:grid-cols-4" style={{ gap: '16px', alignItems: 'start' }}>
          <Panel
            className="xl:col-span-3"
            icon={<Activity size={14} />}
            title="Shipments Activity"
            subtitle="Click a row to follow it in Tracking"
            bodyClassName=""
            action={showFinancials ? (
              <button type="button" className="btn btn-secondary" style={{ padding: '5px 10px', fontSize: '10px' }} onClick={() => onNavigate('shipments')}>Open Shipments</button>
            ) : undefined}
          >
            <div className="telemetry-tabs">
              {tabOptions.map(o => (
                <button
                  key={o.value}
                  type="button"
                  className={`telemetry-tab ${tableTab === o.value ? 'telemetry-tab--active' : ''}`}
                  onClick={() => { setTableTab(o.value); setPage(0); }}
                >
                  {o.label}
                  <span className="text-xs" style={{ fontWeight: 800, opacity: 0.7 }}>{o.count}</span>
                </button>
              ))}
            </div>

            <div className="telemetry-filter-bar">
              <div className="telemetry-search-wrap">
                <Search size={14} />
                <input
                  type="text"
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(0); }}
                  placeholder="Search driver, load, customer..."
                />
              </div>
              <span className="text-xs text-muted font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {tableRows.length === 0 ? '0' : `${safePage * PAGE_SIZE + 1}–${Math.min((safePage + 1) * PAGE_SIZE, tableRows.length)}`} of {tableRows.length}
              </span>
              <button type="button" className="telemetry-filter-icon-btn" disabled={safePage === 0} onClick={() => setPage(safePage - 1)} aria-label="Previous page" style={{ opacity: safePage === 0 ? 0.4 : 1 }}>
                <ChevronLeft size={14} />
              </button>
              <button type="button" className="telemetry-filter-icon-btn" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)} aria-label="Next page" style={{ opacity: safePage >= pageCount - 1 ? 0.4 : 1 }}>
                <ChevronRight size={14} />
              </button>
            </div>

            <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
              <table className="data-table data-table--nowrap">
                <thead>
                  <tr>
                    <th>Load Ref</th>
                    <th>Driver</th>
                    <th>Customer</th>
                    <th>Unit</th>
                    <th>Started</th>
                    <th>Duration</th>
                    {showFinancials && <th>Revenue</th>}
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.length === 0 ? (
                    <tr>
                      <td colSpan={showFinancials ? 8 : 7}>
                        <Empty className="py-10">
                          <EmptyHeader>
                            <EmptyMedia variant="icon"><PackageOpen /></EmptyMedia>
                            <EmptyTitle>{query || tableTab !== 'all' ? 'No Matches' : 'No Shipments Yet'}</EmptyTitle>
                            <EmptyDescription>{query || tableTab !== 'all' ? 'No shipments match this view.' : 'Shipments appear here as drivers clock in.'}</EmptyDescription>
                          </EmptyHeader>
                        </Empty>
                      </td>
                    </tr>
                  ) : pageRows.map(s => (
                    <tr key={s.id} onClick={() => setTrackedId(s.id)} className={tracked?.id === s.id ? 'is-selected' : ''} style={{ cursor: 'pointer' }}>
                      <td className="font-mono font-bold text-sm">{s.load_reference || <span className="text-muted">—</span>}</td>
                      <td className="font-bold text-primary">{s.driver_name || 'Unknown driver'}</td>
                      <td className="text-secondary">{s.carrier_name || <span className="text-muted">—</span>}</td>
                      <td className="font-mono text-sm">{[s.vehicle_number, s.trailer_number].filter(Boolean).join(' / ') || <span className="text-muted">—</span>}</td>
                      <td className="text-secondary text-sm">{shortDate(s.start_time)}, {time(s.start_time)}</td>
                      <td className="text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>{duration(s.start_time, s.end_time)}</td>
                      {showFinancials && (
                        <td className="font-mono font-bold text-sm">
                          {s.revenue_amount != null ? pounds(s.revenue_amount, 2) : <span className="text-muted">—</span>}
                        </td>
                      )}
                      <td><span className={STATUS_META[s.shipmentStatus].badge}>{STATUS_META[s.shipmentStatus].label}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="flex flex-col" style={{ gap: '16px' }}>
          <Panel
            icon={<Clock size={14} />}
            title="Idle Drivers"
            subtitle={`On shift, not moving for over ${idleThresholdMinutes} mins`}
            bodyClassName=""
            action={<button type="button" className="btn btn-secondary" style={{ padding: '5px 10px', fontSize: '10px' }} onClick={() => onNavigate('alerts')}>Alert Panel</button>}
          >
            {idleDrivers.length === 0 ? (
              <Empty className="py-10">
                <EmptyHeader>
                  <EmptyMedia variant="icon"><CircleCheck /></EmptyMedia>
                  <EmptyTitle>No Idle Drivers</EmptyTitle>
                  <EmptyDescription>Everyone on shift is moving or has reported recently.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul className="m-0 list-none p-0" style={{ maxHeight: '320px', overflowY: 'auto' }}>
                {idleDrivers.map(d => (
                  <li key={d.driverId} className="flex items-center" style={{ gap: '10px', padding: '12px 20px', borderBottom: '1px solid var(--border-color)' }}>
                    <span className="dash-avatar">{initials(d.name)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span className="font-bold text-primary text-sm" style={{ display: 'block' }}>{d.name}</span>
                      <span className="text-xs text-muted" style={{ display: 'block' }}>
                        {d.reason}{d.unit ? ` · ${d.unit}` : ''} · since {time(d.since)}
                      </span>
                    </div>
                    <span className="badge badge-danger" style={{ fontVariantNumeric: 'tabular-nums' }}>{duration(d.since)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel icon={<UserRound size={14} />} title="Workforce" subtitle={`${employees.length} registered employee${employees.length === 1 ? '' : 's'}`}>
            <FleetStatusDonutChart
              data={[
                { label: 'On shift', value: onShiftCount, color: BRAND_RED },
                { label: 'Available', value: availableCount, color: CHARCOAL },
                { label: 'Inactive', value: employees.length - activeEmployees.length, color: '#DDDDDD' },
              ]}
              centerLabel="Employees"
              height={250}
              emptyTitle="No Employees Yet"
              emptyDescription="Add drivers in the Employee Database."
            />
          </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
