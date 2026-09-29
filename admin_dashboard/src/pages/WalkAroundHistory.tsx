import { Fragment, useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, Clock, ClipboardCheck, AlertTriangle, Search, X, Users, CalendarDays, PenTool } from 'lucide-react';
import { supabase, isMockMode } from '../App';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '../components/ui/empty';
import TableFilter, { type TableFilterGroup } from '../components/ui/table-filter';
import { computeShiftCompliance, formatCheckDuration, type ComplianceShift, type WalkaroundCheckType } from '../lib/walkaround-compliance';

// ============================================================
// Walk-Around Checks — one page for every start-of-shift /
// end-of-shift walk-around (public.walkaround_checks, migration 052)
// and every check that should have happened but didn't.
//
//  • "By employee" summary: per person over the chosen period, how
//    many of their checks were done, missed or rushed. Click a row to
//    focus the log on that person.
//  • Check log: submitted checks AND missing checks (from the shifts
//    list) in one timeline, filterable by employee, period, type and
//    result, with a free-text search.
//
// Every profession does walk-around checks (drivers, mechanics and
// logistics) — there is no exempt role any more.
//
// "Target minutes" (org-configurable, default 15) is the admin's own
// benchmark for a rushed check — not a DVSA-mandated minimum.
// ============================================================

type CheckType = WalkaroundCheckType;
type CheckResult = 'pass' | 'defects_found';
type FieldType = 'photo' | 'checkbox' | 'passFail' | 'text';

interface WalkaroundItem {
  key: string;
  label: string;
  type: FieldType;
  value: boolean | string | null;
  section?: string;
}

interface WalkaroundRow {
  id: string;
  shift_id: string | null;
  driver_id: string;
  driver_name?: string;
  vehicle_id: string;
  vehicle_number?: string;
  trailer_id: string | null;
  trailer_number?: string;
  check_type: CheckType;
  started_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
  items: WalkaroundItem[];
  overall_result: CheckResult | null;
  defect_note: string | null;
}

/** A driver's signed acknowledgement that they took a unit/trailer out
 * despite it being VOR or having an expired MOT/tax/insurance/inspection
 * (public.vehicle_risk_acknowledgements, migration 063). Lives alongside
 * the Alert Panel's "Unroadworthy Sign-Offs" category — that shows only
 * the ones an admin hasn't reviewed yet; this is the full historical
 * record, filterable by the "Signature Sign Off" result option. */
interface RiskSignoff {
  id: string;
  driver_id: string;
  driver_name?: string;
  vehicle_number?: string;
  issues: string[];
  context: string;
  signer_name: string;
  signature_svg: string;
  acknowledged_at: string;
  reviewed_at: string | null;
}

/** One row of the merged log: a submitted/draft check, a missing one, or
 * a VOR/unroadworthy signature sign-off. */
type LogRow =
  | { kind: 'check'; key: string; at: string; driverId: string; driverName: string; check: WalkaroundRow }
  | { kind: 'missing'; key: string; at: string; driverId: string; driverName: string; shift: ComplianceShift; checkType: CheckType }
  | { kind: 'signoff'; key: string; at: string; driverId: string; driverName: string; signoff: RiskSignoff };

type RowStatus = 'pass' | 'defects_found' | 'rushed' | 'missing' | 'draft' | 'signoff';

const PAGE_SIZE = 20;
const PERIODS = [
  { value: '1', label: 'Today' },
  { value: '7', label: 'Last 7 days' },
  { value: '14', label: 'Last 14 days' },
  { value: '30', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
] as const;
type Period = typeof PERIODS[number]['value'];

const formatDuration = formatCheckDuration;
const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const typeLabel = (t: CheckType) => (t === 'start_of_shift' ? 'Start of shift' : 'End of shift');

function periodStart(period: Period): Date {
  if (period === 'all') return new Date(0);
  if (period === '1') {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return new Date(Date.now() - Number(period) * 24 * 60 * 60 * 1000);
}

interface WalkAroundHistoryProps {
  organizationId: string | null;
  // Org-configurable "does this look rushed" benchmark (migration 056,
  // Settings > Alerts), passed down from App.tsx's orgAlertSettings.
  targetMinutes: number;
  /** The app's already-loaded shifts — used to find missing checks. */
  shifts: ComplianceShift[];
  onBack?: () => void;
}

interface EmployeeSummary {
  driverId: string;
  name: string;
  shifts: number;
  due: number;
  done: number;
  missing: number;
  rushed: number;
  lastCheckAt: string | null;
}

export default function WalkAroundHistory({ organizationId, targetMinutes, shifts, onBack }: WalkAroundHistoryProps) {
  const [checks, setChecks] = useState<WalkaroundRow[]>([]);
  const [signoffs, setSignoffs] = useState<RiskSignoff[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  const [search, setSearch] = useState('');
  const [employeeId, setEmployeeId] = useState<string>('');
  const [period, setPeriod] = useState<Period>('14');
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);

  const loadChecks = useCallback(async () => {
    if (isMockMode || !supabase || !organizationId) return;
    setIsLoading(true);
    setError('');
    try {
      const { data, error: fetchError } = await supabase
        .from('walkaround_checks')
        .select('id, shift_id, driver_id, vehicle_id, trailer_id, custom_trailer_number, check_type, started_at, completed_at, duration_seconds, items, overall_result, defect_note, drivers(full_name), vehicle:vehicles!vehicle_id(vehicle_number), trailer:vehicles!trailer_id(vehicle_number)')
        .eq('organization_id', organizationId)
        .order('started_at', { ascending: false });
      if (fetchError) throw fetchError;
      setChecks((data ?? []).map((c: any) => ({
        ...c,
        driver_name: c.drivers?.full_name,
        vehicle_number: c.vehicle?.vehicle_number,
        trailer_number: c.trailer?.vehicle_number ?? c.custom_trailer_number ?? undefined,
        items: c.items ?? [],
      })) as WalkaroundRow[]);
    } catch (err: any) {
      setError(err?.message ?? 'Could not load walk-around checks.');
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  const loadSignoffs = useCallback(async () => {
    if (isMockMode || !supabase || !organizationId) return;
    const { data, error: fetchError } = await supabase
      .from('vehicle_risk_acknowledgements')
      .select('id, driver_id, issues, context, signer_name, signature_svg, acknowledged_at, reviewed_at, drivers(full_name), vehicle:vehicles!vehicle_id(vehicle_number)')
      .eq('organization_id', organizationId)
      .order('acknowledged_at', { ascending: false })
      .limit(300);
    if (fetchError) {
      console.error('loadSignoffs failed:', fetchError.message);
      return;
    }
    setSignoffs((data ?? []).map((r: any) => ({
      ...r,
      driver_name: r.drivers?.full_name,
      vehicle_number: r.vehicle?.vehicle_number,
      issues: r.issues ?? [],
    })) as RiskSignoff[]);
  }, [organizationId]);

  useEffect(() => { loadChecks(); }, [loadChecks]);
  useEffect(() => { loadSignoffs(); }, [loadSignoffs]);

  useEffect(() => {
    if (isMockMode || !supabase || !organizationId) return;
    const channel = supabase
      .channel('realtime_walkaround_history_signoffs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicle_risk_acknowledgements' }, () => loadSignoffs())
      .subscribe();
    return () => { supabase!.removeChannel(channel); };
  }, [organizationId, loadSignoffs]);

  // Photo values are private-bucket storage paths, not URLs — resolve
  // signed URLs lazily, only for whichever row is actually expanded.
  useEffect(() => {
    if (isMockMode || !supabase || !expandedId) return;
    const row = checks.find(c => c.id === expandedId);
    if (!row) return;
    const paths = row.items
      .filter(i => i.type === 'photo' && typeof i.value === 'string' && !photoUrls[i.value as string])
      .map(i => i.value as string);
    if (paths.length === 0) return;
    supabase.storage.from('walkaround-photos').createSignedUrls(paths, 3600).then(({ data }) => {
      if (!data) return;
      setPhotoUrls(prev => {
        const next = { ...prev };
        data.forEach((d, i) => { if (d.signedUrl) next[paths[i]] = d.signedUrl; });
        return next;
      });
    });
  }, [expandedId, checks, photoUrls]);

  useEffect(() => {
    if (isMockMode || !supabase || !organizationId) return;
    const channel = supabase
      .channel('realtime_walkaround_history')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'walkaround_checks' }, () => loadChecks())
      .subscribe();
    return () => { supabase!.removeChannel(channel); };
  }, [organizationId, loadChecks]);

  const targetSeconds = targetMinutes * 60;
  const since = useMemo(() => periodStart(period), [period]);

  const compliance = useMemo(
    () => computeShiftCompliance(shifts, checks, { targetMinutes, since, isFieldRole: () => true }),
    [shifts, checks, targetMinutes, since],
  );

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of shifts) if (s.driver_name) map.set(s.driver_id, s.driver_name);
    for (const c of checks) if (c.driver_name) map.set(c.driver_id, c.driver_name);
    for (const r of signoffs) if (r.driver_name) map.set(r.driver_id, r.driver_name);
    return map;
  }, [shifts, checks, signoffs]);

  const employeeOptions = useMemo(
    () => [...nameById.entries()].sort((a, b) => a[1].localeCompare(b[1])),
    [nameById],
  );

  // ── Merged timeline: checks in the period + missing checks ───────
  const allRows = useMemo<LogRow[]>(() => {
    const rows: LogRow[] = [];
    // Any raw check row for a shift+type — including an unfinished draft —
    // so a driver who started (but hasn't yet finished) their check isn't
    // ALSO listed as having done nothing: it shows once, as Draft, not as
    // a duplicate Draft + Missing pair.
    const hasRawCheck = new Set<string>();
    for (const c of checks) {
      if (new Date(c.started_at) < since) continue;
      rows.push({ kind: 'check', key: c.id, at: c.started_at, driverId: c.driver_id, driverName: c.driver_name ?? nameById.get(c.driver_id) ?? '—', check: c });
      if (c.shift_id) hasRawCheck.add(`${c.shift_id}:${c.check_type}`);
    }
    for (const { shift, start, end } of compliance) {
      for (const [type, state] of [['start_of_shift', start], ['end_of_shift', end]] as const) {
        if (state.status !== 'missing') continue;
        if (hasRawCheck.has(`${shift.id}:${type}`)) continue;
        rows.push({
          kind: 'missing',
          key: `${shift.id}:${type}`,
          at: type === 'start_of_shift' ? shift.start_time : (shift.end_time ?? shift.start_time),
          driverId: shift.driver_id,
          driverName: shift.driver_name ?? nameById.get(shift.driver_id) ?? '—',
          shift,
          checkType: type,
        });
      }
    }
    for (const r of signoffs) {
      if (new Date(r.acknowledged_at) < since) continue;
      rows.push({ kind: 'signoff', key: `signoff:${r.id}`, at: r.acknowledged_at, driverId: r.driver_id, driverName: r.driver_name ?? nameById.get(r.driver_id) ?? '—', signoff: r });
    }
    return rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [checks, compliance, since, nameById, signoffs]);

  const rowStatus = useCallback((row: LogRow): RowStatus => {
    if (row.kind === 'missing') return 'missing';
    if (row.kind === 'signoff') return 'signoff';
    const c = row.check;
    if (c.completed_at === null) return 'draft';
    if (c.overall_result === 'defects_found') return 'defects_found';
    if (c.duration_seconds !== null && c.duration_seconds < targetSeconds) return 'rushed';
    return 'pass';
  }, [targetSeconds]);

  const query = search.trim().toLowerCase();
  const matchesPerson = useCallback((driverId: string, driverName: string, extra: (string | undefined | null)[] = []) => {
    if (employeeId && driverId !== employeeId) return false;
    if (!query) return true;
    return [driverName, ...extra].some(v => v?.toLowerCase().includes(query));
  }, [employeeId, query]);

  const filteredRows = useMemo(() => allRows.filter(row => {
    // A sign-off isn't a start/end-of-shift check, so the Check Type
    // filter doesn't apply to it — only the Result filter (via
    // statusFilter, 'signoff') and search/employee do.
    if (row.kind !== 'signoff') {
      const type = row.kind === 'check' ? row.check.check_type : row.checkType;
      if (typeFilter.length > 0 && !typeFilter.includes(type)) return false;
    }
    if (statusFilter.length > 0 && !statusFilter.includes(rowStatus(row))) return false;
    const extra = row.kind === 'check'
      ? [row.check.vehicle_number, row.check.trailer_number]
      : row.kind === 'missing'
        ? [row.shift.vehicle_number]
        : [row.signoff.vehicle_number, row.signoff.signer_name];
    return matchesPerson(row.driverId, row.driverName, extra);
  }), [allRows, typeFilter, statusFilter, rowStatus, matchesPerson]);

  // ── Per-employee summary for the period ───────────────────────────
  const employeeSummaries = useMemo<EmployeeSummary[]>(() => {
    const map = new Map<string, EmployeeSummary>();
    const get = (driverId: string, name: string) => {
      let s = map.get(driverId);
      if (!s) {
        s = { driverId, name, shifts: 0, due: 0, done: 0, missing: 0, rushed: 0, lastCheckAt: null };
        map.set(driverId, s);
      }
      return s;
    };
    for (const { shift, start, end } of compliance) {
      const s = get(shift.driver_id, shift.driver_name ?? nameById.get(shift.driver_id) ?? '—');
      s.shifts += 1;
      for (const state of [start, end]) {
        if (state.status === 'not_due') continue;
        s.due += 1;
        if (state.status === 'missing') s.missing += 1;
        else s.done += 1;
        if (state.status === 'rushed') s.rushed += 1;
      }
    }
    for (const c of checks) {
      if (!c.completed_at || new Date(c.started_at) < since) continue;
      const s = map.get(c.driver_id);
      if (s && (!s.lastCheckAt || c.completed_at > s.lastCheckAt)) s.lastCheckAt = c.completed_at;
    }
    return [...map.values()]
      .filter(s => matchesPerson(s.driverId, s.name))
      // Most problems first, then alphabetical.
      .sort((a, b) => (b.missing + b.rushed) - (a.missing + a.rushed) || a.name.localeCompare(b.name));
  }, [compliance, checks, since, nameById, matchesPerson]);

  const totals = useMemo(() => employeeSummaries.reduce(
    (t, s) => ({ due: t.due + s.due, done: t.done + s.done, missing: t.missing + s.missing, rushed: t.rushed + s.rushed }),
    { due: 0, done: 0, missing: 0, rushed: 0 },
  ), [employeeSummaries]);

  const filterGroups: TableFilterGroup[] = [
    {
      key: 'type',
      label: 'Check Type',
      options: [
        { value: 'start_of_shift', label: 'Start of Shift' },
        { value: 'end_of_shift', label: 'End of Shift' },
      ],
      selected: typeFilter,
      onChange: (v) => { setTypeFilter(v); setPage(0); },
    },
    {
      key: 'status',
      label: 'Result',
      options: [
        { value: 'pass', label: 'Pass' },
        { value: 'defects_found', label: 'Defects Found' },
        { value: 'rushed', label: 'Rushed' },
        { value: 'missing', label: 'Missing' },
        { value: 'draft', label: 'Draft' },
        { value: 'signoff', label: 'Signature Sign Off' },
      ],
      selected: statusFilter,
      onChange: (v) => { setStatusFilter(v); setPage(0); },
    },
  ];

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageRows = filteredRows.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE);
  const selectedEmployeeName = employeeId ? nameById.get(employeeId) ?? 'Employee' : '';

  const focusEmployee = (driverId: string) => {
    setEmployeeId(prev => (prev === driverId ? '' : driverId));
    setPage(0);
    setExpandedId(null);
  };


  return (
    <div className="flex-1">
      <div className="flex align-center justify-between mb-16">
        <div>
          <h2 className="text-xl font-black text-primary m-0">WALK-AROUND CHECKS</h2>
          <p className="text-xs text-muted m-0 mt-4">
            Start- and end-of-shift vehicle checks for every employee. A check under {targetMinutes} min counts as rushed (set in Alert Settings).
          </p>
        </div>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex align-center text-xs font-bold"
            style={{ gap: '4px', background: 'none', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', color: 'var(--charcoal)' }}
          >
            <ChevronLeft size={14} /> Back to Overview
          </button>
        )}
      </div>

      {error && <div className="login-notice login-notice--error mb-16">{error}</div>}

      {/* ── Shared filters: who and when ───────────────────────────── */}
      <div className="flex align-center mb-16" style={{ gap: '10px', flexWrap: 'wrap' }}>
        <div className="telemetry-search-wrap" style={{ minWidth: '240px', flex: '1 1 240px', maxWidth: '360px' }}>
          <Search size={14} />
          <input
            type="text"
            placeholder="Search employee, tractor or trailer…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          />
        </div>
        <div className="telemetry-pill-select-wrap">
          <span className="telemetry-pill-icon"><Users size={13} color="#94A3B8" /></span>
          <select aria-label="Employee" className="telemetry-pill-select" value={employeeId} onChange={(e) => { setEmployeeId(e.target.value); setPage(0); }}>
            <option value="">All employees</option>
            {employeeOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <ChevronDown size={12} className="telemetry-pill-chevron" />
        </div>
        <div className="telemetry-pill-select-wrap">
          <span className="telemetry-pill-icon"><CalendarDays size={13} color="#94A3B8" /></span>
          <select aria-label="Period" className="telemetry-pill-select" value={period} onChange={(e) => { setPeriod(e.target.value as Period); setPage(0); }}>
            {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <ChevronDown size={12} className="telemetry-pill-chevron" />
        </div>
        {(employeeId || search) && (
          <button
            type="button"
            onClick={() => { setEmployeeId(''); setSearch(''); setPage(0); }}
            className="flex align-center text-xs font-bold"
            style={{ gap: '4px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand-red)', fontFamily: 'inherit' }}
          >
            <X size={13} /> Clear
          </button>
        )}
      </div>

      {/* ── By employee ─────────────────────────────────────────────── */}
      <div className="glass-card mb-16" style={{ overflow: 'hidden' }}>
        <div className="p-16 flex align-center justify-between" style={{ borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '10px' }}>
          <span className="flex align-center text-sm font-black text-primary" style={{ gap: '8px' }}>
            <Users size={15} /> By employee
          </span>
          <span className="text-xs text-secondary">
            <strong className="text-primary">{totals.done}</strong> of <strong className="text-primary">{totals.due}</strong> checks done
            {totals.missing > 0 && <> · <strong style={{ color: 'var(--brand-red)' }}>{totals.missing} missed</strong></>}
            {totals.rushed > 0 && <> · <strong style={{ color: 'var(--charcoal)' }}>{totals.rushed} rushed</strong></>}
          </span>
        </div>
        {employeeSummaries.length === 0 ? (
          <p className="text-xs text-muted p-16 m-0">No shifts in this period{employeeId || query ? ' for this search' : ''}.</p>
        ) : (
          <div className="table-container" style={{ border: 'none', borderRadius: 0, maxHeight: '320px', overflowY: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Shifts</th>
                  <th>Checks done</th>
                  <th>Issues</th>
                  <th>Last check</th>
                </tr>
              </thead>
              <tbody>
                {employeeSummaries.map(s => {
                  const pct = s.due > 0 ? Math.round((s.done / s.due) * 100) : 100;
                  const selected = employeeId === s.driverId;
                  return (
                    <tr
                      key={s.driverId}
                      onClick={() => focusEmployee(s.driverId)}
                      style={{ cursor: 'pointer', background: selected ? 'var(--card-bg-hover)' : undefined }}
                      title={selected ? 'Show everyone' : `Show only ${s.name}`}
                    >
                      <td className="font-bold text-primary">{s.name}</td>
                      <td className="font-mono tabular-nums text-secondary">{s.shifts}</td>
                      <td>
                        <span className="flex align-center" style={{ gap: '8px' }}>
                          <span className="font-mono tabular-nums text-xs font-bold text-primary" style={{ minWidth: '44px' }}>{s.done}/{s.due}</span>
                          <span style={{ width: '80px', height: '6px', borderRadius: '3px', background: 'var(--border-color)', overflow: 'hidden' }}>
                            <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: s.missing > 0 ? 'var(--brand-red)' : 'var(--charcoal)' }} />
                          </span>
                        </span>
                      </td>
                      <td>
                        {s.missing === 0 && s.rushed === 0 ? (
                          <span className="text-xs text-muted">None</span>
                        ) : (
                          <span className="flex align-center" style={{ gap: '6px' }}>
                            {s.missing > 0 && <span className="badge badge-danger">{s.missing} missed</span>}
                            {s.rushed > 0 && <span className="badge badge-warning">{s.rushed} rushed</span>}
                          </span>
                        )}
                      </td>
                      <td className="text-secondary font-mono tabular-nums text-xs whitespace-nowrap">
                        {s.lastCheckAt ? formatWhen(s.lastCheckAt) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Check log ───────────────────────────────────────────────── */}
      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <div className="p-16 flex align-center justify-between" style={{ borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '10px' }}>
          <span className="flex align-center" style={{ gap: '10px' }}>
            <span className="flex align-center text-sm font-black text-primary" style={{ gap: '8px' }}>
              <ClipboardCheck size={15} /> Check log{selectedEmployeeName ? ` — ${selectedEmployeeName}` : ''}
            </span>
            <TableFilter groups={filterGroups} />
          </span>
          <span className="text-xs text-muted">
            {isLoading ? 'Loading…' : `${filteredRows.length} ${filteredRows.length === 1 ? 'entry' : 'entries'}`}
          </span>
        </div>

        {pageRows.length === 0 ? (
          <Empty className="py-24">
            <EmptyHeader>
              <EmptyMedia variant="icon"><ClipboardCheck /></EmptyMedia>
              <EmptyTitle>No Walk-Around Checks</EmptyTitle>
              <EmptyDescription>
                {allRows.length === 0 ? 'Checks submitted from the app will show up here.' : 'Nothing matches the current search and filters.'}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Employee</th>
                    <th>Tractor</th>
                    <th>Trailer</th>
                    <th>Type</th>
                    <th>Duration</th>
                    <th>Result</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map(row => {
                    if (row.kind === 'missing') {
                      return (
                        <tr key={row.key}>
                          <td className="text-secondary font-mono tabular-nums text-xs whitespace-nowrap">{formatWhen(row.at)}</td>
                          <td className="font-bold text-primary">{row.driverName}</td>
                          <td className="font-mono text-accent">{row.shift.vehicle_number ?? '—'}</td>
                          <td className="text-muted">—</td>
                          <td className="text-secondary text-xs">{typeLabel(row.checkType)}</td>
                          <td className="text-muted">—</td>
                          <td><span className="badge badge-danger">Missing</span></td>
                          <td></td>
                        </tr>
                      );
                    }
                    if (row.kind === 'signoff') {
                      const r = row.signoff;
                      const isExpanded = expandedId === row.key;
                      return (
                        <Fragment key={row.key}>
                          <tr style={{ cursor: 'pointer' }} onClick={() => setExpandedId(isExpanded ? null : row.key)}>
                            <td className="text-secondary font-mono tabular-nums text-xs whitespace-nowrap">{formatWhen(r.acknowledged_at)}</td>
                            <td className="font-bold text-primary">{row.driverName}</td>
                            <td className="font-mono text-accent">{r.vehicle_number ?? '—'}</td>
                            <td className="text-muted">—</td>
                            <td className="text-secondary text-xs">Unroadworthy sign-off</td>
                            <td className="text-muted">—</td>
                            <td className="flex align-center" style={{ gap: '6px' }}>
                              <span className="badge badge-danger flex align-center" style={{ gap: '4px' }}><PenTool size={10} /> Signature Sign Off</span>
                              {!r.reviewed_at && <span className="badge" style={{ background: 'var(--card-bg-hover)', color: 'var(--charcoal-light)', border: '1px solid var(--border-color)' }}>Unreviewed</span>}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <ChevronDown size={14} style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', color: 'var(--charcoal-light)' }} />
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={8} style={{ background: 'var(--card-bg-hover)', padding: '14px 16px' }}>
                                <p className="text-xs font-bold mb-8" style={{ color: 'var(--brand-red)' }}>
                                  {r.context === 'coupling' ? 'Signed while coupling a trailer' : 'Signed during a walk-around check'} — took responsibility for:
                                </p>
                                <ul className="text-xs mb-8" style={{ margin: 0, paddingLeft: '18px', color: 'var(--charcoal)' }}>
                                  {r.issues.map(issue => <li key={issue}>{issue}</li>)}
                                </ul>
                                <p className="text-xs mb-8" style={{ color: 'var(--charcoal-light)' }}>
                                  Signed by <strong className="text-primary">{r.signer_name}</strong> at {formatWhen(r.acknowledged_at)}
                                  {r.reviewed_at ? <> · reviewed {formatWhen(r.reviewed_at)}</> : <> · not yet reviewed — see Alert Panel → Unroadworthy Sign-Offs</>}
                                </p>
                                <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px', maxWidth: '320px' }}>
                                  <img
                                    src={`data:image/svg+xml;utf8,${encodeURIComponent(r.signature_svg)}`}
                                    alt={`${r.signer_name}'s signature`}
                                    style={{ width: '100%', display: 'block' }}
                                  />
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    }
                    const c = row.check;
                    const status = rowStatus(row);
                    const isExpanded = expandedId === c.id;
                    const isRushed = c.duration_seconds !== null && c.duration_seconds < targetSeconds;
                    const isDraft = status === 'draft';
                    const failCount = c.items.filter(i => i.type === 'passFail' && i.value === 'fail').length;
                    return (
                      <Fragment key={row.key}>
                        <tr style={{ cursor: 'pointer' }} onClick={() => setExpandedId(isExpanded ? null : c.id)}>
                          <td className="text-secondary font-mono tabular-nums text-xs whitespace-nowrap">{formatWhen(c.started_at)}</td>
                          <td className="font-bold text-primary">{row.driverName}</td>
                          <td className="font-mono text-accent">{c.vehicle_number ?? '—'}</td>
                          <td className="font-mono text-accent">{c.trailer_number ?? '—'}</td>
                          <td className="text-secondary text-xs">{typeLabel(c.check_type)}</td>
                          <td>
                            <span className="flex align-center font-mono tabular-nums text-xs" style={{ gap: '4px', color: isRushed ? 'var(--brand-red)' : 'var(--charcoal-mid)' }}>
                              <Clock size={12} /> {formatDuration(c.duration_seconds)}
                              {isRushed && <AlertTriangle size={12} />}
                            </span>
                          </td>
                          <td>
                            {isDraft ? (
                              <span className="badge" style={{ background: 'var(--card-bg-hover)', color: 'var(--charcoal-light)', border: '1px solid var(--border-color)' }}>Draft</span>
                            ) : status === 'defects_found' ? (
                              <span className="badge badge-danger">{failCount > 0 ? `${failCount} Defect${failCount === 1 ? '' : 's'}` : 'Defects Found'}</span>
                            ) : status === 'rushed' ? (
                              <span className="badge badge-warning">Rushed</span>
                            ) : (
                              <span className="badge badge-success">Pass</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <ChevronDown size={14} style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', color: 'var(--charcoal-light)' }} />
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={8} style={{ background: 'var(--card-bg-hover)', padding: '14px 16px' }}>
                              {isDraft && (
                                <p className="text-xs font-bold mb-8" style={{ color: 'var(--charcoal-light)' }}>Saved as a draft — not yet submitted, does not count as a completed check.</p>
                              )}
                              {c.defect_note && (
                                <p className="text-xs font-bold mb-8" style={{ color: 'var(--brand-red)' }}>Defect details: {c.defect_note}</p>
                              )}
                              {(() => {
                                const photos = c.items.filter(i => i.type === 'photo' && typeof i.value === 'string' && i.value);
                                if (photos.length === 0) return null;
                                return (
                                  <div className="mb-16">
                                    <p className="text-xs font-bold mb-8" style={{ color: 'var(--charcoal)' }}>
                                      Photos ({photos.length}) — taken with the phone camera during the check
                                    </p>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
                                      {photos.map(photo => {
                                        const url = photoUrls[photo.value as string];
                                        return (
                                          <a
                                            key={photo.key}
                                            href={url}
                                            target="_blank"
                                            rel="noreferrer"
                                            style={{ display: 'block', textDecoration: 'none', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden', pointerEvents: url ? 'auto' : 'none' }}
                                          >
                                            {url ? (
                                              <img src={url} alt={photo.label} style={{ width: '100%', height: '110px', objectFit: 'cover', display: 'block' }} />
                                            ) : (
                                              <div className="text-xs text-muted flex align-center justify-center" style={{ height: '110px' }}>Loading…</div>
                                            )}
                                            <span className="text-xs text-secondary" style={{ display: 'block', padding: '6px 8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                              {photo.label}
                                            </span>
                                          </a>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })()}
                              <div className="flex flex-col" style={{ gap: '6px' }}>
                                {c.items.filter(item => item.type !== 'photo' || !item.value).map(item => (
                                  <div key={item.key}>
                                    {item.section && (
                                      <p className="text-xs font-bold mt-8 mb-4" style={{ color: 'var(--charcoal)' }}>{item.section}</p>
                                    )}
                                    <div className="flex align-center text-xs" style={{ gap: '8px' }}>
                                      <span className="text-secondary" style={{ minWidth: '260px' }}>{item.label}</span>
                                      {item.type === 'checkbox' && (
                                        <span className={`badge ${item.value ? 'badge-success' : ''}`} style={{ minWidth: '20px', textAlign: 'center', padding: '1px 6px', background: item.value ? undefined : 'var(--card-bg)', color: item.value ? undefined : 'var(--charcoal-light)', border: item.value ? undefined : '1px solid var(--border-color)' }}>
                                          {item.value ? '✓' : '—'}
                                        </span>
                                      )}
                                      {item.type === 'passFail' && (
                                        <span className={`badge ${item.value === 'fail' ? 'badge-danger' : item.value === 'pass' ? 'badge-success' : ''}`}>
                                          {item.value === 'fail' ? 'Fail' : item.value === 'pass' ? 'Pass' : 'Not answered'}
                                        </span>
                                      )}
                                      {item.type === 'text' && (
                                        <span className="font-mono text-secondary">{(item.value as string) || '—'}</span>
                                      )}
                                      {item.type === 'photo' && <span className="text-muted">No photo</span>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex align-center justify-between p-16" style={{ borderTop: '1px solid var(--border-color)' }}>
              <span className="text-xs text-muted">
                Page <span className="font-mono tabular-nums">{clampedPage + 1}</span> of <span className="font-mono tabular-nums">{pageCount}</span>
              </span>
              <div className="flex align-center" style={{ gap: '8px' }}>
                <button
                  type="button"
                  disabled={clampedPage === 0}
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  className="flex align-center text-xs font-bold"
                  style={{ gap: '4px', background: 'none', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '6px 10px', cursor: clampedPage === 0 ? 'default' : 'pointer', opacity: clampedPage === 0 ? 0.4 : 1, color: 'var(--charcoal)' }}
                >
                  <ChevronLeft size={13} /> Prev
                </button>
                <button
                  type="button"
                  disabled={clampedPage >= pageCount - 1}
                  onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
                  className="flex align-center text-xs font-bold"
                  style={{ gap: '4px', background: 'none', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '6px 10px', cursor: clampedPage >= pageCount - 1 ? 'default' : 'pointer', opacity: clampedPage >= pageCount - 1 ? 0.4 : 1, color: 'var(--charcoal)' }}
                >
                  Next <ChevronRight size={13} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
