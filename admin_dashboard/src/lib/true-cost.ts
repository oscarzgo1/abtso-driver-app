// True profit for a period (migration 062): revenue minus EVERYTHING the
// business pays — payroll, employer NI & pension on-cost, fuel, and the
// fixed/recurring costs in the cost ledger (spread per day across the
// period). One pure function so the headline, the comparisons and the
// month-end forecast can never disagree.

export type CostCategory =
  | 'vehicle_finance' | 'insurance' | 'maintenance' | 'tolls' | 'trailer_hire'
  | 'overheads' | 'agency_fees' | 'subcontractor' | 'other';

export const COST_CATEGORY_LABEL: Record<CostCategory, string> = {
  vehicle_finance: 'Vehicle finance / lease',
  insurance: 'Insurance',
  maintenance: 'Maintenance & tyres',
  tolls: 'Tolls, Dart & ferries',
  trailer_hire: 'Trailer hire',
  overheads: 'Office overheads',
  agency_fees: 'Agency fees',
  subcontractor: 'Subcontractors',
  other: 'Other costs',
};

export type CostFrequency = 'monthly' | 'annual' | 'one_off';

export interface OrgCost {
  id: string;
  category: CostCategory;
  label: string;
  amount: number;
  vat_applicable: boolean;
  frequency: CostFrequency;
  vehicle_id: string | null;
  start_date: string;
  end_date: string | null;
  status: 'approved' | 'pending';
  note: string | null;
}

export interface AnalyticsSettings {
  employer_oncost_percent: number;
  target_margin_percent: number;
  target_revenue_per_truck_day: number | null;
  target_weekly_profit: number | null;
}

export const DEFAULT_ANALYTICS_SETTINGS: AnalyticsSettings = {
  employer_oncost_percent: 0,
  target_margin_percent: 35,
  target_revenue_per_truck_day: null,
  target_weekly_profit: null,
};

export type VatMode = 'ex' | 'inc';
export const VAT_RATE = 0.2;
const DAY_MS = 86_400_000;

function parseDay(d: string): number {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).getTime();
}

/** Ex-VAT share of one cost falling inside [start, end). Monthly and
 *  annual costs accrue per day; a one-off counts on its start date. */
export function costInRange(cost: OrgCost, start: Date, end: Date): number {
  const cs = parseDay(cost.start_date);
  const ce = cost.end_date ? parseDay(cost.end_date) + DAY_MS : Infinity;
  if (cost.frequency === 'one_off') {
    return cs >= start.getTime() && cs < end.getTime() ? Number(cost.amount) : 0;
  }
  const from = Math.max(start.getTime(), cs);
  const to = Math.min(end.getTime(), ce);
  if (to <= from) return 0;
  const days = (to - from) / DAY_MS;
  const perDay = cost.frequency === 'monthly' ? (Number(cost.amount) * 12) / 365 : Number(cost.amount) / 365;
  return perDay * days;
}

export interface TrueCostShift {
  id: string;
  start_time: string;
  total_pay: number | null;
  total_hours?: number | null;
  revenue_amount?: number | null;
  vehicle_id?: string | null;
  /** Loads on this shift still waiting for a rate (see shiftRevenueFromLoads). */
  pending_loads?: number;
}

/** What a shift has actually earned so far: the sum of its rated loads.
 *  shift_revenue.revenue_amount (migration 063's roll-up) stays NULL until
 *  EVERY load on the shift is rated, which hid real, already-agreed rates
 *  on a shift with one rated and one unrated load. Falls back to the
 *  shift-level figure when no load carries a rate (rates entered before
 *  loads existed). pendingLoads counts loads still waiting for a rate. */
export function shiftRevenueFromLoads(s: { revenue_amount?: number | null; loads?: { revenue_amount: number | null }[] }): { revenue: number | null; pendingLoads: number } {
  const loads = s.loads ?? [];
  const rated = loads.filter(l => l.revenue_amount !== null && l.revenue_amount !== undefined);
  const pendingLoads = loads.length - rated.length;
  if (rated.length > 0) return { revenue: rated.reduce((t, l) => t + (Number(l.revenue_amount) || 0), 0), pendingLoads };
  const fallback = s.revenue_amount === null || s.revenue_amount === undefined ? null : Number(s.revenue_amount);
  return { revenue: fallback, pendingLoads: fallback === null ? pendingLoads : 0 };
}

export interface TrueCostFuelReceipt {
  shift_id: string | null;
  status: string;
  total_cost: number | null;
}

export interface TrueCostResult {
  start: Date;
  end: Date;
  days: number;
  revenue: number;
  payroll: number;
  oncost: number;
  fuel: number;
  fixed: number;
  fixedByCategory: Partial<Record<CostCategory, number>>;
  totalCost: number;
  profit: number;
  marginPct: number | null;
  /** Shown separately, never inside profit. */
  pendingFuel: number;
  pendingFixed: number;
  /** Shifts with no revenue yet, or with some loads still unrated. */
  unratedShifts: number;
  /** Wages on shifts with no revenue at all yet. */
  unratedWages: number;
  hours: number;
  shiftCount: number;
  truckDays: number;
  revenuePerTruckDay: number | null;
  weeklyProfit: number;
}

/** Fuel receipts are gross (VAT included) at the pump; everything else in
 *  the ledger is stored ex-VAT. Payroll and on-costs never carry VAT. */
export interface TrueCostInput {
  start: Date;
  end: Date;
  shifts: TrueCostShift[];
  fuelReceipts: TrueCostFuelReceipt[];
  costs: OrgCost[];
  settings: AnalyticsSettings;
  vatMode: VatMode;
}

export function computeTrueCost(opts: TrueCostInput): TrueCostResult {
  const { start, end, costs, settings, vatMode } = opts;
  const vatUp = (exVat: number) => (vatMode === 'inc' ? exVat * (1 + VAT_RATE) : exVat);
  const fuelAs = (gross: number) => (vatMode === 'inc' ? gross : gross / (1 + VAT_RATE));

  const inWindow = opts.shifts.filter(s => {
    const t = new Date(s.start_time).getTime();
    return t >= start.getTime() && t < end.getTime();
  });
  const ids = new Set(inWindow.map(s => s.id));

  let revenueEx = 0;
  let payroll = 0;
  let unratedShifts = 0;
  let unratedWages = 0;
  const truckDaySet = new Set<string>();
  let hours = 0;
  for (const s of inWindow) {
    const pay = Number(s.total_pay) || 0;
    payroll += pay;
    hours += Number(s.total_hours) || 0;
    if (s.revenue_amount === null || s.revenue_amount === undefined) {
      unratedShifts += 1;
      unratedWages += pay;
    } else {
      revenueEx += Number(s.revenue_amount) || 0;
      if ((s.pending_loads ?? 0) > 0) unratedShifts += 1;
    }
    if (s.vehicle_id) truckDaySet.add(`${s.vehicle_id}:${new Date(s.start_time).toDateString()}`);
  }

  let fuelGross = 0;
  let pendingFuelGross = 0;
  for (const r of opts.fuelReceipts) {
    if (!r.shift_id || !ids.has(r.shift_id)) continue;
    if (r.status === 'approved') fuelGross += Number(r.total_cost) || 0;
    else if (r.status === 'pending') pendingFuelGross += Number(r.total_cost) || 0;
  }

  const fixedByCategory: Partial<Record<CostCategory, number>> = {};
  let fixed = 0;
  let pendingFixed = 0;
  for (const c of costs) {
    const ex = costInRange(c, start, end);
    if (ex <= 0) continue;
    const value = c.vat_applicable ? vatUp(ex) : ex;
    if (c.status === 'pending') {
      pendingFixed += value;
      continue;
    }
    fixed += value;
    fixedByCategory[c.category] = (fixedByCategory[c.category] ?? 0) + value;
  }

  const revenue = vatUp(revenueEx);
  const oncost = payroll * (Number(settings.employer_oncost_percent) || 0) / 100;
  const fuel = fuelAs(fuelGross);
  const totalCost = payroll + oncost + fuel + fixed;
  const profit = revenue - totalCost;
  const days = Math.max(1, (end.getTime() - start.getTime()) / DAY_MS);

  return {
    start,
    end,
    days,
    revenue,
    payroll,
    oncost,
    fuel,
    fixed,
    fixedByCategory,
    totalCost,
    profit,
    marginPct: revenue > 0 ? (profit / revenue) * 100 : null,
    pendingFuel: fuelAs(pendingFuelGross),
    pendingFixed,
    unratedShifts,
    unratedWages,
    hours,
    shiftCount: inWindow.length,
    truckDays: truckDaySet.size,
    revenuePerTruckDay: truckDaySet.size > 0 ? revenue / truckDaySet.size : null,
    weeklyProfit: (profit / days) * 7,
  };
}

/** The same true-cost figures split into consecutive slices of the
 *  window — daily up to ~3 months, weekly beyond — for the Overview
 *  chart. Every slice runs through computeTrueCost with the window
 *  clipped, so the slices add up exactly to the headline totals. */
export function computeTrueCostSeries(opts: TrueCostInput): { label: string; result: TrueCostResult }[] {
  const { start, end } = opts;
  if (end.getTime() <= start.getTime()) return [];
  const weekly = end.getTime() - start.getTime() > 92 * DAY_MS;
  const first = new Date(start);
  first.setHours(0, 0, 0, 0);
  const slices: { start: Date; end: Date }[] = [];
  for (let cursor = first; cursor.getTime() < end.getTime();) {
    const next = new Date(cursor);
    next.setDate(next.getDate() + (weekly ? 7 : 1));
    slices.push({
      start: new Date(Math.max(cursor.getTime(), start.getTime())),
      end: new Date(Math.min(next.getTime(), end.getTime())),
    });
    cursor = next;
  }
  const byIndex = new Map<number, TrueCostShift[]>();
  for (const s of opts.shifts) {
    const t = new Date(s.start_time).getTime();
    const i = slices.findIndex(sl => t >= sl.start.getTime() && t < sl.end.getTime());
    if (i < 0) continue;
    byIndex.set(i, [...(byIndex.get(i) ?? []), s]);
  }
  return slices.map((sl, i) => ({
    label: `${weekly ? 'w/c ' : ''}${sl.start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
    result: computeTrueCost({ ...opts, start: sl.start, end: sl.end, shifts: byIndex.get(i) ?? [] }),
  }));
}
