import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { Copy, Check, ChevronDown, Download, Lock, TrendingDown, TrendingUp, FileSpreadsheet, FileText, Link2, Mail, Trophy, LayoutGrid, List, Users, UserRound, Truck, Building2, Sigma, X } from 'lucide-react';
import { ActivityStatsCard, StatsCardRows, type ChartDataPoint } from '../ui/stats-card';
import { supabase, isMockMode } from '../../App';
import { computeBreakdowns, type BreakdownExtras, type BreakdownFuel, type BreakdownShift, type CustomerScore, type DriverScore, type VehicleScore } from '../../lib/analytics-breakdowns';
import type { AnalyticsSettings, OrgCost, TrueCostResult, VatMode } from '../../lib/true-cost';
import { buildReportHtml, type ReportSnapshot } from '../../lib/report-html';
import { ActionMenu, AnalyticsSection, SegmentedToggle, type ActionMenuItem } from './AnalyticsLayout';

// Performance by driver, vehicle and customer, plus the brief's outputs:
// Excel export, a printable PDF report, partner share links and the
// weekly email summary. Drivers, vehicles and customers are shown as
// 21st.dev stats cards (@kavikatiyar/stats-card): a summary card per
// dimension on top (doubling as the tab selector), then one scorecard per
// driver / vehicle / customer with this period vs the previous one.

interface Props {
  organizationId: string | null;
  companyName?: string | null;
  start: Date;
  end: Date;
  periodLabel: string;
  shifts: BreakdownShift[];
  fuel: BreakdownFuel[];
  costs: OrgCost[];
  settings: AnalyticsSettings;
  vatMode: VatMode;
  targetCheckMinutes: number;
  summary: TrueCostResult;
  previousProfit: number | null;
  lastYearProfit: number | null;
  /** Share links and the weekly email are payroll-admin only. */
  canManageReports: boolean;
  /** Reports & exports is a plan feature (migration 067). */
  canExport: boolean;
  /** Where the report buttons render (the page header); inline when null. */
  reportActionsTarget?: HTMLElement | null;
}

type DriverSortKey = 'profitPerHour' | 'profit' | 'avgWeeklyHours' | 'mpg' | 'walkaroundPct' | 'photosPct' | 'onTimePct' | 'idleAlerts' | 'defectsReported';

const money = (v: number | null) => (v === null ? '—' : `${v < 0 ? '−' : ''}£${Math.abs(v).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`);
const pct = (v: number | null) => (v === null ? '—' : `${v.toFixed(0)}%`);
const num = (v: number | null, d = 1) => (v === null ? '—' : v.toFixed(d));

const EMPTY_EXTRAS: BreakdownExtras = { milesByShift: {}, checks: [], idleAlerts: [], incidents: [] };

type Breakdowns = ReturnType<typeof computeBreakdowns>;
type Tab = 'drivers' | 'vehicles' | 'customers';

/** Scorecard chart resolution — the period is split into this many equal slices. */
const BUCKETS = 8;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** % change, or null when there's no meaningful base to compare with. */
const pctChange = (current: number, previous: number | null) =>
  previous === null || Math.abs(previous) < 0.5 ? null : ((current - previous) / Math.abs(previous)) * 100;
const sum = <T,>(rows: T[], pick: (r: T) => number) => rows.reduce((acc, r) => acc + pick(r), 0);
const initials = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '—';
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.slice(0, 3).map(w => w[0]).join('').toUpperCase();
};

/** How many fixed-width columns fit in the scorecard grid right now. */
function useGridColumns(el: HTMLDivElement | null, minWidth = 300, max = 3) {
  const [cols, setCols] = useState(max);
  useEffect(() => {
    if (!el) return;
    const measure = (w: number) => setCols(Math.max(1, Math.min(max, Math.floor((w + 14) / (minWidth + 14)))));
    measure(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(entries => measure(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, minWidth, max]);
  return cols;
}

export default function AnalyticsBreakdowns(p: Props) {
  const [tab, setTab] = useState<Tab>('drivers');
  // Scorecards (stats cards) are the default view for all three tabs;
  // the table stays one click away.
  // Table first: compact and readable; scorecards stay one click away.
  const [view, setView] = useState<'cards' | 'table'>('table');
  // The information banner under the category selector.
  const [bannerOpen, setBannerOpen] = useState(true);
  const [gridEl, setGridEl] = useState<HTMLDivElement | null>(null);
  const detailRef = useRef<HTMLDivElement | null>(null);
  const [sortKey, setSortKey] = useState<DriverSortKey>('profitPerHour');
  const [extras, setExtras] = useState<BreakdownExtras>(EMPTY_EXTRAS);
  const [panel, setPanel] = useState<null | 'share' | 'email'>(null);

  // Query window rounded out to whole hours, so "now" as the end of the
  // period doesn't refetch on every render.
  const HOUR = 3_600_000;
  const startIso = new Date(Math.floor(p.start.getTime() / HOUR) * HOUR).toISOString();
  const endIso = new Date(Math.ceil(p.end.getTime() / HOUR) * HOUR).toISOString();

  useEffect(() => {
    if (isMockMode || !supabase || !p.organizationId) return;
    let cancelled = false;
    (async () => {
      const [miles, checks, idle, incidents] = await Promise.all([
        supabase.rpc('shift_odometer_miles', { p_from: startIso, p_to: endIso }),
        supabase.from('walkaround_checks').select('shift_id, check_type, completed_at, duration_seconds').eq('organization_id', p.organizationId).gte('started_at', startIso).lt('started_at', endIso),
        supabase.from('idle_alerts').select('driver_id').eq('organization_id', p.organizationId).gte('started_at', startIso).lt('started_at', endIso),
        supabase.from('incident_reports').select('driver_id').eq('organization_id', p.organizationId).gte('created_at', startIso).lt('created_at', endIso),
      ]);
      if (cancelled) return;
      const milesByShift: Record<string, number> = {};
      for (const r of (miles.data ?? []) as { shift_id: string; miles: number | null }[]) {
        if (r.miles !== null) milesByShift[r.shift_id] = Number(r.miles);
      }
      setExtras({
        milesByShift,
        checks: (checks.data ?? []) as BreakdownExtras['checks'],
        idleAlerts: (idle.data ?? []) as BreakdownExtras['idleAlerts'],
        incidents: (incidents.data ?? []) as BreakdownExtras['incidents'],
      });
    })();
    return () => { cancelled = true; };
  }, [p.organizationId, startIso, endIso]);

  const data = useMemo(() => computeBreakdowns({
    start: p.start, end: p.end, shifts: p.shifts, fuel: p.fuel, costs: p.costs, settings: p.settings,
    vatMode: p.vatMode, targetCheckSeconds: p.targetCheckMinutes * 60, extras,
  }), [p.start, p.end, p.shifts, p.fuel, p.costs, p.settings, p.vatMode, p.targetCheckMinutes, extras]);

  const sortedDrivers = useMemo(() => {
    const lowerIsBetter = sortKey === 'idleAlerts' || sortKey === 'avgWeeklyHours';
    return [...data.drivers].sort((a, b) => {
      const av = a[sortKey] as number | null;
      const bv = b[sortKey] as number | null;
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return lowerIsBetter ? av - bv : bv - av;
    });
  }, [data.drivers, sortKey]);

  const snapshot = (): ReportSnapshot => ({
    companyName: p.companyName,
    periodLabel: p.periodLabel,
    generatedAt: new Date().toISOString(),
    vatMode: p.vatMode,
    summary: {
      revenue: p.summary.revenue, payroll: p.summary.payroll, oncost: p.summary.oncost, fuel: p.summary.fuel,
      fixed: p.summary.fixed, fixedByCategory: p.summary.fixedByCategory as Record<string, number>,
      profit: p.summary.profit, marginPct: p.summary.marginPct, shiftCount: p.summary.shiftCount,
      unratedShifts: p.summary.unratedShifts, previousProfit: p.previousProfit, lastYearProfit: p.lastYearProfit,
    },
    drivers: data.drivers,
    vehicles: data.vehicles,
    customers: data.customers,
  });

  const exportExcel = () => {
    const s = p.summary;
    const wb = XLSX.utils.book_new();
    const summaryRows = [
      { Item: 'Period', Value: p.periodLabel },
      { Item: 'VAT', Value: p.vatMode === 'inc' ? 'Including VAT' : 'Excluding VAT' },
      { Item: 'Revenue', Value: s.revenue },
      { Item: 'Payroll', Value: s.payroll },
      { Item: 'Employer NI & pension', Value: s.oncost },
      { Item: 'Fuel & AdBlue', Value: s.fuel },
      ...Object.entries(s.fixedByCategory).map(([k, v]) => ({ Item: k, Value: v as number })),
      { Item: 'True profit', Value: s.profit },
      { Item: 'Margin %', Value: s.marginPct ?? '' },
      { Item: 'Shifts awaiting a rate', Value: s.unratedShifts },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.drivers.map(d => ({
      Driver: d.name, Shifts: d.shifts, Hours: +d.hours.toFixed(2), 'Avg hours/week': +d.avgWeeklyHours.toFixed(1), 'Over 48h WTD': d.wtdBreach ? 'Yes' : '',
      Revenue: +d.revenue.toFixed(2), 'Direct cost': +d.directCost.toFixed(2), Profit: +d.profit.toFixed(2), 'Profit/hour': d.profitPerHour === null ? '' : +d.profitPerHour.toFixed(2),
      Miles: Math.round(d.miles), MPG: d.mpg === null ? '' : +d.mpg.toFixed(1), 'Walk-around %': d.walkaroundPct === null ? '' : Math.round(d.walkaroundPct),
      'Rushed checks': d.checksRushed, 'POD photos %': d.photosPct === null ? '' : Math.round(d.photosPct), 'On time %': d.onTimePct === null ? '' : Math.round(d.onTimePct),
      'Idle alerts': d.idleAlerts, 'Defects reported': d.defectsReported,
    }))), 'Drivers');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.vehicles.map(v => ({
      Vehicle: v.registration, Shifts: v.shifts, 'Days used': v.daysUsed, Miles: Math.round(v.miles), 'Miles/day': v.milesPerDay === null ? '' : Math.round(v.milesPerDay),
      Revenue: +v.revenue.toFixed(2), 'Direct cost': +v.directCost.toFixed(2), 'Vehicle costs': +v.vehicleCosts.toFixed(2), Profit: +v.profit.toFixed(2),
      '£/mile': v.profitPerMile === null ? '' : +v.profitPerMile.toFixed(2), 'Revenue/day': v.revenuePerDay === null ? '' : +v.revenuePerDay.toFixed(2), MPG: v.mpg === null ? '' : +v.mpg.toFixed(1),
    }))), 'Vehicles');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.customers.map(c => ({
      Customer: c.customer, Loads: c.loads, 'Rated loads': c.ratedLoads, Revenue: +c.revenue.toFixed(2), 'Allocated cost': +c.allocatedCost.toFixed(2),
      Contribution: +c.contribution.toFixed(2), 'Margin %': c.marginPct === null ? '' : +c.marginPct.toFixed(1),
      'Avg revenue/load': c.avgRevenuePerLoad === null ? '' : +c.avgRevenuePerLoad.toFixed(2), 'On time %': c.onTimePct === null ? '' : Math.round(c.onTimePct),
    }))), 'Customers');
    XLSX.writeFile(wb, `tachyo-analytics-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const printPdf = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(buildReportHtml(snapshot()));
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  };

  const th = (label: string, key?: DriverSortKey) => (
    <th>
      {key ? (
        <button type="button" onClick={() => setSortKey(key)} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer', color: sortKey === key ? 'var(--brand-red)' : 'inherit' }}>
          {label}{sortKey === key ? ' ▾' : ''}
        </button>
      ) : label}
    </th>
  );

  const milesNote = data.shiftCount > 0
    ? `${data.shiftsWithMiles} of ${data.shiftCount} shifts have odometer readings from both walk-around checks.`
    : '';

  // ── Period-over-period series for the stats cards ─────────────
  // The current window is split into BUCKETS equal slices; each slice is
  // compared with the same slice of the window immediately before it.
  // Fixed-length periods only — "All time" has nothing before it.
  const comparing = p.previousProfit !== null;
  const roundedStart = Math.floor(p.start.getTime() / HOUR) * HOUR;
  const roundedEnd = Math.ceil(p.end.getTime() / HOUR) * HOUR;
  const trend = useMemo(() => {
    const span = Math.max(HOUR_MS, roundedEnd - roundedStart);
    const step = span / BUCKETS;
    const base = {
      shifts: p.shifts, fuel: p.fuel, costs: p.costs, settings: p.settings, vatMode: p.vatMode,
      targetCheckSeconds: p.targetCheckMinutes * 60, extras: EMPTY_EXTRAS,
    };
    const fmt = (d: Date) => (span <= 2 * DAY_MS
      ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }));
    const buckets = Array.from({ length: BUCKETS }, (_, i) => {
      const start = new Date(roundedStart + i * step);
      const end = new Date(roundedStart + (i + 1) * step);
      return {
        label: span <= 2 * DAY_MS ? `${String(start.getHours()).padStart(2, '0')}h` : `${start.getDate()}/${start.getMonth() + 1}`,
        range: `${fmt(start)} – ${fmt(new Date(end.getTime() - 1))}`,
        current: computeBreakdowns({ ...base, start, end }),
        previous: comparing ? computeBreakdowns({ ...base, start: new Date(start.getTime() - span), end: new Date(end.getTime() - span) }) : null,
      };
    });
    const previousTotal = comparing ? computeBreakdowns({ ...base, start: new Date(roundedStart - span), end: new Date(roundedStart) }) : null;
    return { buckets, previousTotal };
  }, [p.shifts, p.fuel, p.costs, p.settings, p.vatMode, p.targetCheckMinutes, roundedStart, roundedEnd, comparing]);

  const noChangeText = comparing ? 'Nothing in the previous period to compare' : 'Pick a period to compare with the one before';
  const changeDescription = 'vs previous period';

  /** One entity (or a total) across the time slices. */
  const seriesOf = (pick: (b: Breakdowns) => number | null): ChartDataPoint[] => trend.buckets.map(b => {
    const cur = pick(b.current) ?? 0;
    const prev = b.previous ? (pick(b.previous) ?? 0) : 0;
    return {
      label: b.label,
      currentValue: cur,
      previousValue: prev,
      hint: `${b.range}: ${money(cur)}${b.previous ? ` · previous period ${money(prev)}` : ''}`,
    };
  });
  const prevDriver = (id: string) => trend.previousTotal?.drivers.find(d => d.driverId === id) ?? null;
  const prevVehicle = (id: string) => trend.previousTotal?.vehicles.find(v => v.vehicleId === id) ?? null;
  const prevCustomer = (name: string) => trend.previousTotal?.customers.find(c => c.customer === name) ?? null;
  const prevOrZero = <T,>(row: T | null, pick: (r: T) => number) => (comparing ? (row ? pick(row) : 0) : null);

  // ── Category selector + information banner ──────────────────
  // Selecting a category switches the detail below and drops down a
  // banner with that category's exact figures; selecting the open
  // category again folds the banner away.
  const selectTab = (next: Tab) => {
    if (next === tab) { setBannerOpen(o => !o); return; }
    setTab(next);
    setBannerOpen(true);
  };
  const prev = trend.previousTotal;
  const driverProfit = sum(data.drivers, d => d.profit);
  const driverHours = sum(data.drivers, d => d.hours);
  const vehicleProfit = sum(data.vehicles, v => v.profit);
  const vehicleRevenue = sum(data.vehicles, v => v.revenue);
  const truckDays = sum(data.vehicles, v => v.daysUsed);
  const vehicleMiles = sum(data.vehicles, v => v.miles);
  const customerRevenue = sum(data.customers, c => c.revenue);
  const customerContribution = sum(data.customers, c => c.contribution);
  const customerLoads = sum(data.customers, c => c.loads);
  const customerRatedLoads = sum(data.customers, c => c.ratedLoads);
  const avgOf = (vals: (number | null)[]) => {
    const real = vals.filter((v): v is number => v !== null);
    return real.length > 0 ? real.reduce((t, v) => t + v, 0) / real.length : null;
  };

  const categories: { key: Tab; title: string; icon: React.ReactNode; metric: string; value: number; previous: number | null }[] = [
    { key: 'drivers', title: 'Drivers', icon: <Users size={16} />, metric: 'Profit before fixed costs', value: driverProfit, previous: prev ? sum(prev.drivers, d => d.profit) : null },
    { key: 'vehicles', title: 'Vehicles', icon: <Truck size={16} />, metric: 'Profit after vehicle costs', value: vehicleProfit, previous: prev ? sum(prev.vehicles, v => v.profit) : null },
    { key: 'customers', title: 'Customers', icon: <Building2 size={16} />, metric: 'Revenue', value: customerRevenue, previous: prev ? sum(prev.customers, c => c.revenue) : null },
  ];

  type Fact = { label: string; value: string; bad?: boolean };
  const banner: Record<Tab, { summary: string; facts: Fact[]; best: string | null; lowest: string | null }> = (() => {
    const topDriver = data.drivers.reduce<DriverScore | null>((t, d) => (t === null || (d.profitPerHour ?? -Infinity) > (t.profitPerHour ?? -Infinity) ? d : t), null);
    const lowDriver = data.drivers.reduce<DriverScore | null>((t, d) => (t === null || (d.profitPerHour ?? Infinity) < (t.profitPerHour ?? Infinity) ? d : t), null);
    const topVehicle = data.vehicles.reduce<VehicleScore | null>((t, v) => (t === null || v.profit > t.profit ? v : t), null);
    const lowVehicle = data.vehicles.reduce<VehicleScore | null>((t, v) => (t === null || v.profit < t.profit ? v : t), null);
    const topCustomer = data.customers.reduce<CustomerScore | null>((t, c) => (t === null || c.contribution > t.contribution ? c : t), null);
    const lowCustomer = data.customers.reduce<CustomerScore | null>((t, c) => (t === null || c.contribution < t.contribution ? c : t), null);
    const wtd = data.drivers.filter(d => d.wtdBreach).length;
    const many = data.drivers.length > 1;
    return {
      drivers: {
        summary: data.drivers.length === 0
          ? 'No completed shifts in this period.'
          : `${data.drivers.length} driver${data.drivers.length === 1 ? '' : 's'} worked ${driverHours.toFixed(1)} hours and made ${money(driverProfit)} after wages, NI & pension and fuel.`,
        facts: [
          { label: 'Profit', value: money(driverProfit), bad: driverProfit < 0 },
          { label: 'Profit / hour', value: driverHours > 0 ? money(driverProfit / driverHours) : '—', bad: driverProfit < 0 },
          { label: 'Hours', value: driverHours.toFixed(1) },
          { label: 'Avg hours / week', value: num(avgOf(data.drivers.map(d => d.avgWeeklyHours))) },
          { label: 'Over 48h (WTD)', value: String(wtd), bad: wtd > 0 },
          { label: 'Walk-around done', value: pct(avgOf(data.drivers.map(d => d.walkaroundPct))) },
          { label: 'On time', value: pct(avgOf(data.drivers.map(d => d.onTimePct))) },
          { label: 'Idle alerts', value: String(sum(data.drivers, d => d.idleAlerts)) },
        ],
        best: topDriver && many ? `${topDriver.name} · ${money(topDriver.profitPerHour)}/h` : null,
        lowest: lowDriver && many ? `${lowDriver.name} · ${money(lowDriver.profitPerHour)}/h` : null,
      },
      vehicles: {
        summary: data.vehicles.length === 0
          ? 'No shifts with an assigned vehicle in this period.'
          : `${data.vehicles.length} vehicle${data.vehicles.length === 1 ? '' : 's'} ran ${truckDays} truck-day${truckDays === 1 ? '' : 's'} and made ${money(vehicleProfit)} after direct and vehicle costs.`,
        facts: [
          { label: 'Profit', value: money(vehicleProfit), bad: vehicleProfit < 0 },
          { label: 'Revenue', value: money(vehicleRevenue) },
          { label: 'Truck-days', value: String(truckDays) },
          { label: 'Revenue / truck-day', value: truckDays > 0 ? money(vehicleRevenue / truckDays) : '—', bad: p.settings.target_revenue_per_truck_day !== null && truckDays > 0 && vehicleRevenue / truckDays < p.settings.target_revenue_per_truck_day },
          { label: 'Miles', value: Math.round(vehicleMiles).toLocaleString('en-GB') },
          { label: '£ / mile', value: vehicleMiles > 0 ? `£${(vehicleProfit / vehicleMiles).toFixed(2)}` : '—', bad: vehicleMiles > 0 && vehicleProfit < 0 },
        ],
        best: topVehicle && data.vehicles.length > 1 ? `${topVehicle.registration} · ${money(topVehicle.profit)}` : null,
        lowest: lowVehicle && data.vehicles.length > 1 ? `${lowVehicle.registration} · ${money(lowVehicle.profit)}` : null,
      },
      customers: {
        summary: data.customers.length === 0
          ? 'No loads attached to shifts in this period.'
          : `${data.customers.length} customer${data.customers.length === 1 ? '' : 's'} · ${customerLoads} load${customerLoads === 1 ? '' : 's'} worth ${money(customerRevenue)}, leaving ${money(customerContribution)} after each load's share of driver and fuel cost.`,
        facts: [
          { label: 'Revenue', value: money(customerRevenue) },
          { label: 'Contribution', value: money(customerContribution), bad: customerContribution < 0 },
          { label: 'Margin', value: customerRevenue > 0 ? pct((customerContribution / customerRevenue) * 100) : '—', bad: customerContribution < 0 },
          { label: 'Loads rated', value: `${customerRatedLoads} / ${customerLoads}`, bad: customerRatedLoads < customerLoads },
          { label: 'Avg / load', value: customerRatedLoads > 0 ? money(customerRevenue / customerRatedLoads) : '—' },
          { label: 'On time', value: pct(avgOf(data.customers.filter(c => c.bookedLoads > 0).map(c => c.onTimePct))) },
        ],
        best: topCustomer && data.customers.length > 1 ? `${topCustomer.customer} · ${money(topCustomer.contribution)}` : null,
        lowest: lowCustomer && data.customers.length > 1 ? `${lowCustomer.customer} · ${money(lowCustomer.contribution)}` : null,
      },
    };
  })();

  // ── Scorecard grid: one stats card per entity, plus an "average"
  // card that spans whatever is left of the last row so the grid never
  // ends with an empty gap. ─────────────────────────────────────────
  const cols = useGridColumns(gridEl);
  const renderGrid = <T,>(rows: T[], card: (r: T) => React.ReactNode, average: (span: number) => React.ReactNode) => {
    const remainder = rows.length % cols;
    const fillSpan = remainder === 0 ? 0 : cols - remainder;
    return (
      <div ref={setGridEl} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: '14px', padding: '14px' }}>
        {rows.map(card)}
        {fillSpan > 0 && average(fillSpan)}
      </div>
    );
  };
  const averageCard = (span: number, opts: { title: string; count: number; total: number; previousTotal: number | null; pick: (b: Breakdowns) => number; subtitle: string; rows: { label: string; value: React.ReactNode; bad?: boolean }[] }) => {
    const avg = opts.count > 0 ? opts.total / opts.count : 0;
    const prevAvg = opts.previousTotal === null ? null : opts.previousTotal / Math.max(1, opts.count);
    return (
      <ActivityStatsCard
        key="__average"
        style={{ gridColumn: `span ${span}` }}
        title={opts.title}
        icon={<Sigma size={18} />}
        mainValue={money(avg)}
        negative={avg < 0}
        subtitle={opts.subtitle}
        changeValue={pctChange(avg, prevAvg)}
        changeDescription={changeDescription}
        noChangeText={noChangeText}
        chartData={seriesOf(b => opts.pick(b) / Math.max(1, opts.count))}
        primaryBarColor="var(--charcoal)"
        secondaryBarColor="var(--border-color)"
        footer={<StatsCardRows rows={opts.rows} />}
      />
    );
  };

  const driverCard = (d: DriverScore) => (
    <ActivityStatsCard
      key={d.driverId}
      title={d.name}
      icon={<UserRound size={18} />}
      mainValue={money(d.profit)}
      negative={d.profit < 0}
      subtitle={`Profit · ${d.shifts} shift${d.shifts === 1 ? '' : 's'} · ${d.hours.toFixed(1)} h`}
      changeValue={pctChange(d.profit, prevOrZero(prevDriver(d.driverId), r => r.profit))}
      changeDescription={changeDescription}
      noChangeText={noChangeText}
      chartData={seriesOf(b => b.drivers.find(x => x.driverId === d.driverId)?.profit ?? null)}
      footer={<StatsCardRows rows={[
        { label: 'Profit / hour', value: money(d.profitPerHour), bad: (d.profitPerHour ?? 0) < 0 },
        { label: 'Hours / week', value: `${num(d.avgWeeklyHours)}${d.wtdBreach ? ' ⚠' : ''}`, bad: d.wtdBreach },
        { label: 'MPG', value: num(d.mpg) },
        { label: 'Walk-around', value: `${pct(d.walkaroundPct)}${d.checksRushed ? ` · ${d.checksRushed} rushed` : ''}`, bad: (d.walkaroundPct ?? 100) < 90 },
        { label: 'POD photos', value: pct(d.photosPct), bad: (d.photosPct ?? 100) < 100 },
        { label: 'On time', value: pct(d.onTimePct), bad: (d.onTimePct ?? 100) < 90 },
        { label: 'Idle alerts', value: String(d.idleAlerts), bad: d.idleAlerts > 0 },
        { label: 'Defects', value: String(d.defectsReported) },
      ]} />}
    />
  );

  const vehicleCard = (v: VehicleScore) => {
    const belowTarget = p.settings.target_revenue_per_truck_day !== null && v.revenuePerDay !== null && v.revenuePerDay < p.settings.target_revenue_per_truck_day;
    return (
      <ActivityStatsCard
        key={v.vehicleId}
        title={v.registration}
        icon={<Truck size={18} />}
        mainValue={money(v.profit)}
        negative={v.profit < 0}
        subtitle={`Profit · ${v.daysUsed} day${v.daysUsed === 1 ? '' : 's'} used · ${Math.round(v.miles).toLocaleString('en-GB')} mi`}
        changeValue={pctChange(v.profit, prevOrZero(prevVehicle(v.vehicleId), r => r.profit))}
        changeDescription={changeDescription}
        noChangeText={noChangeText}
        chartData={seriesOf(b => b.vehicles.find(x => x.vehicleId === v.vehicleId)?.profit ?? null)}
        footer={<StatsCardRows rows={[
          { label: 'Revenue / day', value: money(v.revenuePerDay), bad: belowTarget },
          { label: 'Miles / day', value: v.milesPerDay === null ? '—' : String(Math.round(v.milesPerDay)) },
          { label: 'Revenue', value: money(v.revenue) },
          { label: 'Direct cost', value: money(v.directCost) },
          { label: 'Vehicle costs', value: money(v.vehicleCosts) },
          { label: '£ / mile', value: v.profitPerMile === null ? '—' : `£${v.profitPerMile.toFixed(2)}`, bad: (v.profitPerMile ?? 0) < 0 },
        ]} />}
      />
    );
  };

  const customerCard = (c: CustomerScore) => (
    <ActivityStatsCard
      key={c.customer}
      title={c.customer}
      icon={<Building2 size={18} />}
      mainValue={money(c.contribution)}
      negative={c.contribution < 0}
      subtitle={`Contribution · ${c.loads} load${c.loads === 1 ? '' : 's'}${c.ratedLoads < c.loads ? ` · ${c.loads - c.ratedLoads} unrated` : ''}`}
      changeValue={pctChange(c.contribution, prevOrZero(prevCustomer(c.customer), r => r.contribution))}
      changeDescription={changeDescription}
      noChangeText={noChangeText}
      chartData={seriesOf(b => b.customers.find(x => x.customer === c.customer)?.contribution ?? null)}
      footer={<StatsCardRows rows={[
        { label: 'Revenue', value: money(c.revenue) },
        { label: 'Margin', value: pct(c.marginPct), bad: (c.marginPct ?? 0) < 0 },
        { label: 'Cost share', value: money(c.allocatedCost) },
        { label: 'Avg / load', value: money(c.avgRevenuePerLoad) },
        { label: 'On time', value: c.bookedLoads === 0 ? '—' : pct(c.onTimePct), bad: c.bookedLoads > 0 && (c.onTimePct ?? 100) < 90 },
        { label: 'Rated loads', value: `${c.ratedLoads} / ${c.loads}`, bad: c.ratedLoads < c.loads },
      ]} />}
    />
  );

  const best = <T,>(rows: T[], value: (r: T) => number) => rows.reduce<T | null>((top, r) => (top === null || value(r) > value(top) ? r : top), null);
  const worst = <T,>(rows: T[], value: (r: T) => number) => rows.reduce<T | null>((low, r) => (low === null || value(r) < value(low) ? r : low), null);

  const viewOptions = [
    ['cards', 'Scorecards', LayoutGrid],
    ['table', tab === 'drivers' ? 'League table' : 'Table', tab === 'drivers' ? Trophy : List],
  ] as const;

  const exportItems: ActionMenuItem[] = p.canExport ? [
    { key: 'excel', label: 'Excel', hint: 'Summary, drivers, vehicles and customers', icon: <FileSpreadsheet size={14} />, onSelect: exportExcel },
    { key: 'pdf', label: 'PDF report', hint: 'Printable report for this period', icon: <FileText size={14} />, onSelect: printPdf },
    ...(p.canManageReports ? [
      { key: 'share', label: 'Share link', hint: 'Read-only link for partners', icon: <Link2 size={14} />, onSelect: () => setPanel('share') },
      { key: 'email', label: 'Weekly email', hint: 'Sunday summary by email', icon: <Mail size={14} />, onSelect: () => setPanel('email') },
    ] : []),
  ] : [];
  const reportActions = (
    <ActionMenu
      label="Export"
      icon={<Download size={13} />}
      items={exportItems}
      emptyText={<><Lock size={12} /> Reports &amp; exports aren't in your plan</>}
    />
  );

  return (
    <AnalyticsSection
      title="Drivers, vehicles & customers"
      description="Pick a category to see its figures; the table below lists every driver, vehicle or customer."
      actions={(
        <>
          {comparing && view === 'cards' && (
            <span className="stats-card-legend">
              <span><i style={{ background: 'var(--brand-red)' }} />This period</span>
              <span><i style={{ background: 'var(--stats-bar-secondary)' }} />Previous period</span>
            </span>
          )}
          {!p.reportActionsTarget && reportActions}
        </>
      )}
    >
      {p.reportActionsTarget && createPortal(reportActions, p.reportActionsTarget)}

      {/* Category selector — compact; the selected category's figures
          drop down in an animated banner underneath. */}
      <div className="bd-selector" role="tablist" aria-label="Breakdown">
        {categories.map(c => {
          const change = pctChange(c.value, c.previous);
          const active = tab === c.key;
          return (
            <button
              key={c.key}
              type="button"
              role="tab"
              aria-selected={active}
              aria-expanded={active && bannerOpen}
              className={`bd-option ${active ? 'is-active' : ''}`}
              onClick={() => selectTab(c.key)}
            >
              <span className="bd-option-icon">{c.icon}</span>
              <span className="bd-option-text">
                <span className="bd-option-title">{c.title}</span>
                <span className="bd-option-metric">{c.metric}</span>
              </span>
              <span className="bd-option-value" style={{ color: c.value < 0 ? 'var(--brand-red)' : undefined }}>{money(c.value)}</span>
              {change !== null && (
                <span className={`bd-option-change ${change >= 0 ? 'is-up' : 'is-down'}`}>{change >= 0 ? '+' : ''}{change.toFixed(0)}%</span>
              )}
              <ChevronDown size={15} className="bd-option-chevron" style={{ transform: active && bannerOpen ? 'rotate(180deg)' : undefined }} />
            </button>
          );
        })}
      </div>

      <AnimatePresence initial={false} mode="wait">
        {bannerOpen && (
          <motion.div
            key={tab}
            initial={{ height: 0, opacity: 0, y: -6 }}
            animate={{ height: 'auto', opacity: 1, y: 0 }}
            exit={{ height: 0, opacity: 0, y: -6 }}
            transition={{ duration: 0.26, ease: [0.2, 0.7, 0.3, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="bd-banner" role="region" aria-label={`${categories.find(c => c.key === tab)?.title} summary`}>
              <p className="bd-banner-summary">{banner[tab].summary}</p>
              <div className="bd-banner-facts">
                {banner[tab].facts.map(f => (
                  <div key={f.label} className="bd-fact">
                    <span className="bd-fact-label">{f.label}</span>
                    <span className="bd-fact-value" style={{ color: f.bad ? 'var(--brand-red)' : undefined }}>{f.value}</span>
                  </div>
                ))}
              </div>
              {(banner[tab].best || banner[tab].lowest) && (
                <div className="bd-banner-extremes">
                  {banner[tab].best && <span className="bd-extreme bd-extreme--best"><TrendingUp size={13} /> Best: <strong>{banner[tab].best}</strong></span>}
                  {banner[tab].lowest && <span className="bd-extreme bd-extreme--low"><TrendingDown size={13} /> Lowest: <strong>{banner[tab].lowest}</strong></span>}
                </div>
              )}
              {comparing && (
                <p className="bd-banner-note">
                  {(() => {
                    const c = categories.find(x => x.key === tab)!;
                    const change = pctChange(c.value, c.previous);
                    return change === null ? noChangeText : `${c.metric} ${change >= 0 ? 'up' : 'down'} ${Math.abs(change).toFixed(0)}% on the previous period (${money(c.previous ?? 0)}).`;
                  })()}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div ref={detailRef} className="an-card an-card--flush" style={{ overflow: 'hidden', scrollMarginTop: '16px' }}>
        <div className="flex items-center justify-between" style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-color)', gap: '10px', flexWrap: 'wrap' }}>
          <p className="an-card-title" style={{ margin: 0 }}>
            {tab === 'drivers' ? <Users size={14} /> : tab === 'vehicles' ? <Truck size={14} /> : <Building2 size={14} />}
            {tab === 'drivers' ? 'Drivers' : tab === 'vehicles' ? 'Vehicles' : 'Customers'} in detail
          </p>
          <div className="flex items-center" style={{ gap: '8px', flexWrap: 'wrap' }}>
            {tab === 'drivers' && view === 'cards' && (
              <select className="select-field" aria-label="Sort drivers by" style={{ width: 'auto', padding: '5px 10px', fontSize: '11.5px' }} value={sortKey} onChange={e => setSortKey(e.target.value as DriverSortKey)}>
                <option value="profitPerHour">Sort: £ / hour</option>
                <option value="profit">Sort: Profit</option>
                <option value="onTimePct">Sort: On time</option>
                <option value="walkaroundPct">Sort: Walk-around</option>
                <option value="photosPct">Sort: POD photos</option>
                <option value="mpg">Sort: MPG</option>
                <option value="avgWeeklyHours">Sort: Hours / week</option>
                <option value="idleAlerts">Sort: Idle alerts</option>
              </select>
            )}
            <SegmentedToggle
              label="View"
              value={view}
              onChange={setView}
              options={viewOptions.map(([key, label, Icon]) => ({ value: key, label: <><Icon size={12} /> {label}</> }))}
            />
          </div>
        </div>

        {tab === 'drivers' && (data.drivers.length === 0 ? (
          <p className="text-xs text-muted" style={{ padding: '16px' }}>No completed shifts in this period.</p>
        ) : view === 'table' ? (
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table className="data-table">
              <thead><tr>
                <th>#</th>{th('Driver')}{th('£ / hour', 'profitPerHour')}{th('Profit', 'profit')}{th('Hrs / week', 'avgWeeklyHours')}{th('MPG', 'mpg')}
                {th('Walk-around', 'walkaroundPct')}{th('POD photos', 'photosPct')}{th('On time', 'onTimePct')}{th('Idle alerts', 'idleAlerts')}{th('Defects', 'defectsReported')}
              </tr></thead>
              <tbody>
                {sortedDrivers.map((d, i) => (
                  <tr key={d.driverId}>
                    <td className="font-mono text-xs" style={{ color: i < 3 ? 'var(--brand-red)' : 'var(--charcoal-light)', fontWeight: 800 }}>{i + 1}</td>
                    <td className="font-bold text-primary">{d.name}<div className="text-xs text-muted" style={{ fontWeight: 400 }}>{d.shifts} shifts · {d.hours.toFixed(1)} h</div></td>
                    <td className="font-mono tabular-nums">{money(d.profitPerHour)}</td>
                    <td className="font-mono tabular-nums" style={{ color: d.profit < 0 ? 'var(--brand-red)' : undefined }}>{money(d.profit)}</td>
                    <td className="font-mono tabular-nums" style={{ color: d.wtdBreach ? 'var(--brand-red)' : undefined, fontWeight: d.wtdBreach ? 800 : undefined }} title={d.wtdBreach ? 'Averaging over the 48-hour Working Time limit' : undefined}>{num(d.avgWeeklyHours)}{d.wtdBreach ? ' ⚠' : ''}</td>
                    <td className="font-mono tabular-nums">{num(d.mpg)}</td>
                    <td className="font-mono tabular-nums">{pct(d.walkaroundPct)}{d.checksRushed > 0 && <span className="text-xs" style={{ color: 'var(--brand-red)' }}> · {d.checksRushed} rushed</span>}</td>
                    <td className="font-mono tabular-nums">{pct(d.photosPct)}</td>
                    <td className="font-mono tabular-nums">{pct(d.onTimePct)}</td>
                    <td className="font-mono tabular-nums">{d.idleAlerts}</td>
                    <td className="font-mono tabular-nums">{d.defectsReported}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : renderGrid(sortedDrivers, driverCard, span => {
          const top = best(data.drivers, d => d.profitPerHour ?? -Infinity);
          const low = worst(data.drivers, d => d.profitPerHour ?? Infinity);
          return averageCard(span, {
            title: 'Driver average', count: data.drivers.length, total: driverProfit,
            previousTotal: prev ? sum(prev.drivers, d => d.profit) : null,
            pick: b => sum(b.drivers, d => d.profit),
            subtitle: `Profit per driver · ${data.drivers.length} drivers`,
            rows: [
              { label: 'Avg £ / hour', value: driverHours > 0 ? money(driverProfit / driverHours) : '—' },
              { label: 'Avg hrs / week', value: num(data.drivers.length ? sum(data.drivers, d => d.avgWeeklyHours) / data.drivers.length : null) },
              { label: 'Best', value: top ? `${top.name.split(' ')[0]} · ${money(top.profitPerHour)}` : '—' },
              { label: 'Lowest', value: low ? `${low.name.split(' ')[0]} · ${money(low.profitPerHour)}` : '—', bad: (low?.profitPerHour ?? 0) < 0 },
            ],
          });
        }))}

        {tab === 'vehicles' && (data.vehicles.length === 0 ? (
          <p className="text-xs text-muted" style={{ padding: '16px' }}>No shifts with an assigned vehicle in this period.</p>
        ) : view === 'table' ? (
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table className="data-table">
              <thead><tr><th>Vehicle</th><th>Days used</th><th>Miles</th><th>Miles / day</th><th>Revenue / day</th><th>Revenue</th><th>Direct cost</th><th>Vehicle costs</th><th>Profit</th><th>£ / mile</th><th>MPG</th></tr></thead>
              <tbody>
                {data.vehicles.map(v => (
                  <tr key={v.vehicleId}>
                    <td className="font-mono font-bold text-primary">{v.registration}</td>
                    <td className="font-mono tabular-nums">{v.daysUsed}</td>
                    <td className="font-mono tabular-nums">{Math.round(v.miles).toLocaleString('en-GB')}</td>
                    <td className="font-mono tabular-nums">{v.milesPerDay === null ? '—' : Math.round(v.milesPerDay)}</td>
                    <td className="font-mono tabular-nums" style={{ color: p.settings.target_revenue_per_truck_day !== null && v.revenuePerDay !== null && v.revenuePerDay < p.settings.target_revenue_per_truck_day ? 'var(--brand-red)' : undefined }}>{money(v.revenuePerDay)}</td>
                    <td className="font-mono tabular-nums">{money(v.revenue)}</td>
                    <td className="font-mono tabular-nums">{money(v.directCost)}</td>
                    <td className="font-mono tabular-nums">{money(v.vehicleCosts)}</td>
                    <td className="font-mono tabular-nums font-bold" style={{ color: v.profit < 0 ? 'var(--brand-red)' : undefined }}>{money(v.profit)}</td>
                    <td className="font-mono tabular-nums">{v.profitPerMile === null ? '—' : `£${v.profitPerMile.toFixed(2)}`}</td>
                    <td className="font-mono tabular-nums">{num(v.mpg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : renderGrid(data.vehicles, vehicleCard, span => {
          const top = best(data.vehicles, v => v.profit);
          const low = worst(data.vehicles, v => v.profit);
          return averageCard(span, {
            title: 'Fleet average', count: data.vehicles.length, total: vehicleProfit,
            previousTotal: prev ? sum(prev.vehicles, v => v.profit) : null,
            pick: b => sum(b.vehicles, v => v.profit),
            subtitle: `Profit per vehicle · ${data.vehicles.length} vehicles`,
            rows: [
              { label: 'Truck-days', value: String(sum(data.vehicles, v => v.daysUsed)) },
              { label: 'Avg rev / day', value: money(sum(data.vehicles, v => v.daysUsed) > 0 ? sum(data.vehicles, v => v.revenue) / sum(data.vehicles, v => v.daysUsed) : null) },
              { label: 'Best', value: top ? `${top.registration} · ${money(top.profit)}` : '—' },
              { label: 'Lowest', value: low ? `${low.registration} · ${money(low.profit)}` : '—', bad: (low?.profit ?? 0) < 0 },
            ],
          });
        }))}

        {tab === 'customers' && (data.customers.length === 0 ? (
          <p className="text-xs text-muted" style={{ padding: '16px' }}>No loads attached to shifts in this period.</p>
        ) : view === 'table' ? (
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table className="data-table">
              <thead><tr><th>Customer</th><th>Loads</th><th>Revenue</th><th>Allocated cost</th><th>Contribution</th><th>Margin</th><th>Avg / load</th><th>On time</th></tr></thead>
              <tbody>
                {data.customers.map(c => (
                  <tr key={c.customer}>
                    <td className="font-bold text-primary">{c.customer}</td>
                    <td className="font-mono tabular-nums">{c.loads}{c.ratedLoads < c.loads && <span className="text-xs" style={{ color: 'var(--brand-red)' }}> · {c.loads - c.ratedLoads} unrated</span>}</td>
                    <td className="font-mono tabular-nums">{money(c.revenue)}</td>
                    <td className="font-mono tabular-nums">{money(c.allocatedCost)}</td>
                    <td className="font-mono tabular-nums font-bold" style={{ color: c.contribution < 0 ? 'var(--brand-red)' : undefined }}>{money(c.contribution)}</td>
                    <td className="font-mono tabular-nums">{pct(c.marginPct)}</td>
                    <td className="font-mono tabular-nums">{money(c.avgRevenuePerLoad)}</td>
                    <td className="font-mono tabular-nums">{c.bookedLoads === 0 ? <span className="text-xs text-muted">No booking times</span> : pct(c.onTimePct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : renderGrid(data.customers, customerCard, span => {
          const top = best(data.customers, c => c.contribution);
          const low = worst(data.customers, c => c.contribution);
          const loads = sum(data.customers, c => c.loads);
          return averageCard(span, {
            title: 'Customer average', count: data.customers.length, total: customerContribution,
            previousTotal: prev ? sum(prev.customers, c => c.contribution) : null,
            pick: b => sum(b.customers, c => c.contribution),
            subtitle: `Contribution per customer · ${data.customers.length} customers`,
            rows: [
              { label: 'Loads', value: String(loads) },
              { label: 'Avg / load', value: money(loads > 0 ? customerRevenue / loads : null) },
              { label: 'Top', value: top ? `${initials(top.customer)} · ${money(top.contribution)}` : '—' },
              { label: 'Lowest', value: low ? `${initials(low.customer)} · ${money(low.contribution)}` : '—', bad: (low?.contribution ?? 0) < 0 },
            ],
          });
        }))}

        <p className="text-xs text-muted m-0" style={{ padding: '10px 14px', borderTop: '1px solid var(--border-color)' }}>
          {tab === 'customers'
            ? "Each shift's wages, on-cost and fuel are split evenly across its loads. Company-wide fixed costs stay in True profit. On time uses the booked delivery time entered on each load in Shipments."
            : `Direct cost = wages + employer on-cost + fuel. Miles come from walk-around odometer readings. ${milesNote}`}
          {view === 'cards' && ` Scorecard bars split the period into ${BUCKETS} equal slices${comparing ? ', each next to the same slice of the previous period' : ''}; hover a bar for its dates and value.`}
        </p>
      </div>

      {panel === 'share' && <SharePanel onClose={() => setPanel(null)} periodLabel={p.periodLabel} buildSnapshot={snapshot} />}
      {panel === 'email' && <WeeklyEmailPanel onClose={() => setPanel(null)} />}
    </AnalyticsSection>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} onClick={onClose}>
      <div className="glass-panel" style={{ width: '520px', maxWidth: '100%', padding: '22px', borderRadius: '16px', background: 'var(--card-bg)', border: '1px solid var(--border-color)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-12">
          <h3 className="text-md font-bold text-primary m-0">{title}</h3>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--charcoal-light)' }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SharePanel({ onClose, periodLabel, buildSnapshot }: { onClose: () => void; periodLabel: string; buildSnapshot: () => ReportSnapshot }) {
  const [links, setLinks] = useState<{ id: string; token: string; label: string; created_at: string; expires_at: string | null; revoked_at: string | null }[]>([]);
  const [label, setLabel] = useState(`Report · ${periodLabel}`);
  const [days, setDays] = useState('30');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const load = async () => {
    if (isMockMode || !supabase) return;
    const { data } = await supabase.from('analytics_share_links').select('id, token, label, created_at, expires_at, revoked_at').order('created_at', { ascending: false }).limit(20);
    setLinks(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const urlFor = (token: string) => `${window.location.origin}/?share=${token}`;
  const create = async () => {
    if (isMockMode || !supabase) return;
    setError('');
    const expires = Number(days) > 0 ? new Date(Date.now() + Number(days) * 86_400_000).toISOString() : null;
    const { data: { user } } = await supabase.auth.getUser();
    const { error: dbError } = await supabase.from('analytics_share_links').insert({
      label: label.trim() || 'Report', report: buildSnapshot(), expires_at: expires, created_by: user?.email ?? null,
    });
    if (dbError) return setError(dbError.message);
    load();
  };
  const revoke = async (id: string) => {
    if (isMockMode || !supabase) return;
    await supabase.from('analytics_share_links').update({ revoked_at: new Date().toISOString() }).eq('id', id);
    load();
  };
  const copy = async (token: string) => {
    try { await navigator.clipboard.writeText(urlFor(token)); setCopied(token); setTimeout(() => setCopied(null), 1500); } catch { /* clipboard blocked */ }
  };

  return (
    <Modal title="Share a read-only report" onClose={onClose}>
      <p className="text-xs text-muted m-0 mb-12">Creates a link to a snapshot of this report as it looks right now (this period, these filters). Anyone with the link can view it without logging in — nothing else in your account is exposed.</p>
      {error && <p className="text-xs m-0 mb-8" style={{ color: 'var(--brand-red)', fontWeight: 700 }}>{error}</p>}
      <div className="flex" style={{ gap: '8px', marginBottom: '14px' }}>
        <input className="input-field" style={{ flex: 1, padding: '8px 10px', fontSize: '12.5px' }} value={label} onChange={e => setLabel(e.target.value)} />
        <select className="select-field" style={{ padding: '8px 10px', fontSize: '12.5px' }} value={days} onChange={e => setDays(e.target.value)}>
          <option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="0">No expiry</option>
        </select>
        <button type="button" className="btn" style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 700, background: 'var(--brand-red)', color: '#fff', borderColor: 'var(--brand-red)' }} onClick={create}>Create link</button>
      </div>
      <div className="flex flex-col" style={{ gap: '8px', maxHeight: '260px', overflowY: 'auto' }}>
        {links.length === 0 && <p className="text-xs text-muted m-0">No share links yet.</p>}
        {links.map(l => {
          const dead = !!l.revoked_at || (l.expires_at !== null && new Date(l.expires_at) < new Date());
          return (
            <div key={l.id} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 10px', opacity: dead ? 0.55 : 1 }}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-primary">{l.label}</span>
                <span className="text-xs text-muted">{l.revoked_at ? 'Revoked' : l.expires_at ? `Expires ${new Date(l.expires_at).toLocaleDateString('en-GB')}` : 'No expiry'}</span>
              </div>
              {!dead && (
                <div className="flex items-center" style={{ gap: '6px', marginTop: '6px' }}>
                  <input readOnly className="input-field font-mono" style={{ flex: 1, padding: '5px 8px', fontSize: '11px' }} value={urlFor(l.token)} onFocus={e => e.currentTarget.select()} />
                  <button type="button" className="btn btn-secondary" style={{ padding: '5px 8px' }} onClick={() => copy(l.token)}>{copied === l.token ? <Check size={13} /> : <Copy size={13} />}</button>
                  <button type="button" className="btn btn-secondary" style={{ padding: '5px 8px', fontSize: '11px' }} onClick={() => revoke(l.id)}>Revoke</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

function WeeklyEmailPanel({ onClose }: { onClose: () => void }) {
  const [enabled, setEnabled] = useState(false);
  const [emails, setEmails] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (isMockMode || !supabase) return;
    supabase.from('org_analytics_settings').select('weekly_report_enabled, weekly_report_emails').maybeSingle().then(({ data }) => {
      if (!data) return;
      setEnabled(data.weekly_report_enabled === true);
      setEmails((data.weekly_report_emails ?? []).join(', '));
    });
  }, []);

  const save = async () => {
    if (isMockMode || !supabase) return;
    const list = emails.split(/[,\s;]+/).map(e => e.trim().toLowerCase()).filter(Boolean);
    const bad = list.find(e => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (bad) return setStatus(`"${bad}" isn't a valid email address.`);
    const { error } = await supabase.from('org_analytics_settings').upsert({ weekly_report_enabled: enabled, weekly_report_emails: list, updated_at: new Date().toISOString() });
    setStatus(error ? error.message : 'Saved.');
  };

  return (
    <Modal title="Weekly email summary" onClose={onClose}>
      <p className="text-xs text-muted m-0 mb-12">Every Sunday morning, a summary of the week just finished (Sunday to Saturday): true profit, revenue, costs, margin against target and the top and bottom drivers.</p>
      <label className="flex items-center text-sm font-bold text-primary" style={{ gap: '8px', cursor: 'pointer', marginBottom: '12px' }}>
        <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> Send the weekly summary
      </label>
      <div className="input-group mb-12">
        <span className="input-label">SEND TO (COMMA-SEPARATED)</span>
        <textarea className="input-field" style={{ width: '100%', minHeight: '60px' }} placeholder="you@company.co.uk, accountant@firm.co.uk" value={emails} onChange={e => setEmails(e.target.value)} />
      </div>
      <div className="flex items-center" style={{ gap: '10px' }}>
        <button type="button" className="btn" style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 700, background: 'var(--brand-red)', color: '#fff', borderColor: 'var(--brand-red)' }} onClick={save}>Save</button>
        {status && <span className="text-xs text-secondary">{status}</span>}
      </div>
    </Modal>
  );
}
