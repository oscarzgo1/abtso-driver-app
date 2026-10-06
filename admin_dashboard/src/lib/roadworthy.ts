// ============================================================
// Which units/trailers cannot legally be on the road right now —
// the same rules the driver app uses to demand a signature (expired
// MOT / road tax / insurance, an overdue inspection) plus an open
// critical defect, as Compliance and Fleet Roadworthiness already
// treat it. Shared so Live Tracking, the Dashboard and the Alert Panel
// all agree. The fleet register stores one row per inspection type for
// the same registration, so rows are merged per registration.
// ============================================================

export interface RiskVehicleRow {
  id: string;
  vehicle_number: string;
  vehicle_type?: string | null;
  inspection_type?: string | null;
  inspection_due_date: string | null;
  mot_due_date?: string | null;
  tax_due_date?: string | null;
  insurance_expiry_date?: string | null;
  /** Grounded by hand (Unit Status Ledger, migration 097). */
  manual_vor?: boolean | null;
}

const INSPECTION_LABEL: Record<string, string> = {
  mot: 'MOT', pmi: 'PMI', tacho_calibration: 'Tacho calibration', roller_brake_test: 'Roller brake test', loler: 'LOLER',
  road_tax: 'Road tax', insurance: 'Insurance',
};
// Legal documents lapse ("expired"); inspections run late ("overdue").
const LEGAL = new Set(['mot', 'road_tax', 'insurance']);

export const unitKey = (n: string | null | undefined) => (n ?? '').trim().toUpperCase();

/** registration -> what is wrong with it (empty/absent = fine). */
export function riskIssuesByNumber(rows: RiskVehicleRow[], criticalVehicleIds: Set<string>): Record<string, string[]> {
  const today = new Date().toISOString().slice(0, 10);
  const out: Record<string, Set<string>> = {};
  for (const v of rows) {
    const key = unitKey(v.vehicle_number);
    if (!key) continue;
    const issues = (out[key] ??= new Set<string>());
    // Every MOT / tax / insurance / inspection is one register row now (migration 098).
    if (v.inspection_due_date && v.inspection_due_date < today) {
      const t = v.inspection_type ?? '';
      issues.add(`${INSPECTION_LABEL[t] ?? t ?? 'Inspection'} ${LEGAL.has(t) ? 'expired' : 'overdue'}`);
    }
    if (criticalVehicleIds.has(v.id)) issues.add('Open critical defect (VOR)');
    if (v.manual_vor) issues.add('Grounded manually (VOR)');
  }
  const result: Record<string, string[]> = {};
  for (const [k, set] of Object.entries(out)) if (set.size > 0) result[k] = [...set];
  return result;
}

export interface UnitInUse {
  shiftId: string;
  driverId: string;
  driverName: string;
  unit: string;
  kind: 'Unit' | 'Trailer';
  issues: string[];
  since: string;
}

/** Every unit/trailer on a shift that is still open and cannot be on the road. */
export function unroadworthyInUse(
  shifts: { id: string; driver_id: string; driver_name?: string; start_time: string; end_time: string | null; status: string; vehicle_number?: string | null; trailer_number?: string | null }[],
  risk: Record<string, string[]>,
): UnitInUse[] {
  const out: UnitInUse[] = [];
  for (const s of shifts) {
    if (s.end_time || s.status === 'completed') continue;
    for (const [kind, num] of [['Unit', s.vehicle_number], ['Trailer', s.trailer_number]] as const) {
      const issues = risk[unitKey(num)];
      if (num && issues) out.push({ shiftId: s.id, driverId: s.driver_id, driverName: s.driver_name ?? 'Employee', unit: num, kind, issues, since: s.start_time });
    }
  }
  return out;
}
