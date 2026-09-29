// Per-driver, per-vehicle and per-customer breakdowns for the analytics
// brief (scorecards + league table, profit per vehicle, profit per
// customer). Pure functions over data the page already holds plus a few
// extra per-period datasets (walk-around checks, idle alerts, incidents,
// odometer miles). "Direct cost" = wages + employer on-cost + fuel;
// vehicle-specific ledger costs are charged to their vehicle; company-wide
// fixed costs stay in the True profit block rather than being guessed out.

import { costInRange, VAT_RATE, type AnalyticsSettings, type OrgCost, type VatMode } from './true-cost';

const LITRES_PER_UK_GALLON = 4.54609;

export interface BreakdownLoad {
  id: string;
  load_reference: string | null;
  carrier_name: string | null;
  revenue_amount: number | null;
  booked_delivery_at: string | null;
  delivered_at: string | null;
  delivery_paperwork_path: string | null;
  delivery_evidence_path: string | null;
}

export interface BreakdownShift {
  id: string;
  driver_id: string;
  driver_name?: string;
  vehicle_id?: string | null;
  vehicle_number?: string | null;
  start_time: string;
  total_hours?: number | null;
  total_pay?: number | null;
  revenue_amount?: number | null;
  loads?: BreakdownLoad[];
}

export interface BreakdownFuel {
  shift_id: string | null;
  status: string;
  liters: number | null;
  total_cost: number | null;
}

export interface BreakdownExtras {
  /** shift_id → odometer miles (walk-around start/end). */
  milesByShift: Record<string, number>;
  /** Submitted checks in the period. */
  checks: { shift_id: string | null; check_type: string; completed_at: string | null; duration_seconds: number | null }[];
  idleAlerts: { driver_id: string }[];
  incidents: { driver_id: string }[];
}

export interface DriverScore {
  driverId: string;
  name: string;
  shifts: number;
  hours: number;
  avgWeeklyHours: number;
  wtdBreach: boolean;
  revenue: number;
  directCost: number;
  profit: number;
  profitPerHour: number | null;
  miles: number;
  mpg: number | null;
  idleAlerts: number;
  defectsReported: number;
  checksDue: number;
  checksDone: number;
  checksRushed: number;
  walkaroundPct: number | null;
  loadsDelivered: number;
  loadsWithPhotos: number;
  photosPct: number | null;
  loadsBooked: number;
  loadsOnTime: number;
  onTimePct: number | null;
}

export interface VehicleScore {
  vehicleId: string;
  registration: string;
  shifts: number;
  daysUsed: number;
  miles: number;
  milesPerDay: number | null;
  revenue: number;
  directCost: number;
  vehicleCosts: number;
  profit: number;
  profitPerMile: number | null;
  revenuePerDay: number | null;
  mpg: number | null;
}

export interface CustomerScore {
  customer: string;
  loads: number;
  ratedLoads: number;
  revenue: number;
  allocatedCost: number;
  contribution: number;
  marginPct: number | null;
  avgRevenuePerLoad: number | null;
  onTimePct: number | null;
  bookedLoads: number;
}

export function computeBreakdowns(opts: {
  start: Date;
  end: Date;
  shifts: BreakdownShift[];
  fuel: BreakdownFuel[];
  costs: OrgCost[];
  settings: AnalyticsSettings;
  vatMode: VatMode;
  targetCheckSeconds: number;
  extras: BreakdownExtras;
}) {
  const { start, end, settings, vatMode, extras } = opts;
  const vatUp = (x: number) => (vatMode === 'inc' ? x * (1 + VAT_RATE) : x);
  const fuelAs = (gross: number) => (vatMode === 'inc' ? gross : gross / (1 + VAT_RATE));
  const oncostRate = (Number(settings.employer_oncost_percent) || 0) / 100;
  const weeks = Math.max(1, (end.getTime() - start.getTime()) / (7 * 86_400_000));

  const shifts = opts.shifts.filter(s => {
    const t = new Date(s.start_time).getTime();
    return t >= start.getTime() && t < end.getTime();
  });
  const shiftIds = new Set(shifts.map(s => s.id));

  const fuelCostByShift = new Map<string, number>();
  const litresByShift = new Map<string, number>();
  for (const r of opts.fuel) {
    if (r.status !== 'approved' || !r.shift_id || !shiftIds.has(r.shift_id)) continue;
    fuelCostByShift.set(r.shift_id, (fuelCostByShift.get(r.shift_id) ?? 0) + fuelAs(Number(r.total_cost) || 0));
    litresByShift.set(r.shift_id, (litresByShift.get(r.shift_id) ?? 0) + (Number(r.liters) || 0));
  }

  const shiftRevenue = (s: BreakdownShift) => (s.revenue_amount === null || s.revenue_amount === undefined ? 0 : vatUp(Number(s.revenue_amount)));
  const shiftDirectCost = (s: BreakdownShift) => {
    const pay = Number(s.total_pay) || 0;
    return pay + pay * oncostRate + (fuelCostByShift.get(s.id) ?? 0);
  };
  const mpgOf = (miles: number, litres: number) => (miles > 0 && litres > 0 ? miles / (litres / LITRES_PER_UK_GALLON) : null);

  // Walk-around compliance per shift: start check due always, end due
  // for every completed shift (these are all completed).
  const checksByShift = new Map<string, { start?: number | null; end?: number | null }>();
  for (const c of extras.checks) {
    if (!c.shift_id || !c.completed_at || !shiftIds.has(c.shift_id)) continue;
    const entry = checksByShift.get(c.shift_id) ?? {};
    if (c.check_type === 'start_of_shift') entry.start = Math.max(entry.start ?? 0, c.duration_seconds ?? 0);
    if (c.check_type === 'end_of_shift') entry.end = Math.max(entry.end ?? 0, c.duration_seconds ?? 0);
    checksByShift.set(c.shift_id, entry);
  }

  const idleByDriver = new Map<string, number>();
  extras.idleAlerts.forEach(a => idleByDriver.set(a.driver_id, (idleByDriver.get(a.driver_id) ?? 0) + 1));
  const incidentsByDriver = new Map<string, number>();
  extras.incidents.forEach(a => incidentsByDriver.set(a.driver_id, (incidentsByDriver.get(a.driver_id) ?? 0) + 1));

  // ── Drivers ────────────────────────────────────────────────
  const drivers = new Map<string, DriverScore>();
  for (const s of shifts) {
    const d = drivers.get(s.driver_id) ?? {
      driverId: s.driver_id, name: s.driver_name || 'Unknown', shifts: 0, hours: 0, avgWeeklyHours: 0, wtdBreach: false,
      revenue: 0, directCost: 0, profit: 0, profitPerHour: null, miles: 0, mpg: null,
      idleAlerts: idleByDriver.get(s.driver_id) ?? 0, defectsReported: incidentsByDriver.get(s.driver_id) ?? 0,
      checksDue: 0, checksDone: 0, checksRushed: 0, walkaroundPct: null,
      loadsDelivered: 0, loadsWithPhotos: 0, photosPct: null, loadsBooked: 0, loadsOnTime: 0, onTimePct: null,
    };
    d.shifts += 1;
    d.hours += Number(s.total_hours) || 0;
    d.revenue += shiftRevenue(s);
    d.directCost += shiftDirectCost(s);
    d.miles += extras.milesByShift[s.id] ?? 0;
    const chk = checksByShift.get(s.id);
    d.checksDue += 2;
    for (const dur of [chk?.start, chk?.end]) {
      if (dur === undefined || dur === null) continue;
      d.checksDone += 1;
      if (dur < opts.targetCheckSeconds) d.checksRushed += 1;
    }
    for (const l of s.loads ?? []) {
      if (l.delivered_at) {
        d.loadsDelivered += 1;
        if (l.delivery_paperwork_path && l.delivery_evidence_path) d.loadsWithPhotos += 1;
        if (l.booked_delivery_at) {
          d.loadsBooked += 1;
          if (new Date(l.delivered_at) <= new Date(l.booked_delivery_at)) d.loadsOnTime += 1;
        }
      }
    }
    drivers.set(s.driver_id, d);
  }
  const litresByDriver = new Map<string, number>();
  shifts.forEach(s => litresByDriver.set(s.driver_id, (litresByDriver.get(s.driver_id) ?? 0) + (litresByShift.get(s.id) ?? 0)));
  const driverScores = [...drivers.values()].map(d => ({
    ...d,
    profit: d.revenue - d.directCost,
    profitPerHour: d.hours > 0 ? (d.revenue - d.directCost) / d.hours : null,
    avgWeeklyHours: d.hours / weeks,
    wtdBreach: d.hours / weeks > 48,
    mpg: mpgOf(d.miles, litresByDriver.get(d.driverId) ?? 0),
    walkaroundPct: d.checksDue > 0 ? (d.checksDone / d.checksDue) * 100 : null,
    photosPct: d.loadsDelivered > 0 ? (d.loadsWithPhotos / d.loadsDelivered) * 100 : null,
    onTimePct: d.loadsBooked > 0 ? (d.loadsOnTime / d.loadsBooked) * 100 : null,
  }));

  // ── Vehicles ───────────────────────────────────────────────
  const vehicles = new Map<string, VehicleScore & { days: Set<string>; litres: number }>();
  for (const s of shifts) {
    if (!s.vehicle_id) continue;
    const v = vehicles.get(s.vehicle_id) ?? {
      vehicleId: s.vehicle_id, registration: (s.vehicle_number ?? '—').toUpperCase(), shifts: 0, daysUsed: 0, miles: 0, milesPerDay: null,
      revenue: 0, directCost: 0, vehicleCosts: 0, profit: 0, profitPerMile: null, revenuePerDay: null, mpg: null, days: new Set<string>(), litres: 0,
    };
    v.shifts += 1;
    v.days.add(new Date(s.start_time).toDateString());
    v.miles += extras.milesByShift[s.id] ?? 0;
    v.revenue += shiftRevenue(s);
    v.directCost += shiftDirectCost(s);
    v.litres += litresByShift.get(s.id) ?? 0;
    vehicles.set(s.vehicle_id, v);
  }
  for (const c of opts.costs) {
    if (!c.vehicle_id || c.status !== 'approved') continue;
    const v = vehicles.get(c.vehicle_id);
    if (!v) continue;
    const ex = costInRange(c, start, end);
    v.vehicleCosts += c.vat_applicable ? vatUp(ex) : ex;
  }
  const vehicleScores: VehicleScore[] = [...vehicles.values()].map(({ days, litres, ...v }) => {
    const profit = v.revenue - v.directCost - v.vehicleCosts;
    return {
      ...v,
      daysUsed: days.size,
      milesPerDay: days.size > 0 && v.miles > 0 ? v.miles / days.size : null,
      profit,
      profitPerMile: v.miles > 0 ? profit / v.miles : null,
      revenuePerDay: days.size > 0 ? v.revenue / days.size : null,
      mpg: mpgOf(v.miles, litres),
    };
  });

  // ── Customers ──────────────────────────────────────────────
  const customers = new Map<string, CustomerScore & { onTime: number }>();
  for (const s of shifts) {
    const loads = s.loads ?? [];
    if (loads.length === 0) continue;
    const costShare = shiftDirectCost(s) / loads.length;
    for (const l of loads) {
      const key = (l.carrier_name ?? '').trim() || 'No customer entered';
      const c = customers.get(key) ?? {
        customer: key, loads: 0, ratedLoads: 0, revenue: 0, allocatedCost: 0, contribution: 0,
        marginPct: null, avgRevenuePerLoad: null, onTimePct: null, bookedLoads: 0, onTime: 0,
      };
      c.loads += 1;
      c.allocatedCost += costShare;
      if (l.revenue_amount !== null && l.revenue_amount !== undefined) {
        c.ratedLoads += 1;
        c.revenue += vatUp(Number(l.revenue_amount));
      }
      if (l.booked_delivery_at && l.delivered_at) {
        c.bookedLoads += 1;
        if (new Date(l.delivered_at) <= new Date(l.booked_delivery_at)) c.onTime += 1;
      }
      customers.set(key, c);
    }
  }
  const customerScores: CustomerScore[] = [...customers.values()].map(({ onTime, ...c }) => ({
    ...c,
    contribution: c.revenue - c.allocatedCost,
    marginPct: c.revenue > 0 ? ((c.revenue - c.allocatedCost) / c.revenue) * 100 : null,
    avgRevenuePerLoad: c.ratedLoads > 0 ? c.revenue / c.ratedLoads : null,
    onTimePct: c.bookedLoads > 0 ? (onTime / c.bookedLoads) * 100 : null,
  }));

  return {
    drivers: driverScores.sort((a, b) => (b.profitPerHour ?? -Infinity) - (a.profitPerHour ?? -Infinity)),
    vehicles: vehicleScores.sort((a, b) => b.profit - a.profit),
    customers: customerScores.sort((a, b) => b.contribution - a.contribution),
    totalMiles: shifts.reduce((sum, s) => sum + (extras.milesByShift[s.id] ?? 0), 0),
    shiftsWithMiles: shifts.filter(s => extras.milesByShift[s.id] !== undefined).length,
    shiftCount: shifts.length,
  };
}
