import NoData from './ui/no-data';
import { useSectionRefresh } from '../lib/section-refresh';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, GripVertical } from 'lucide-react';
import { supabase, isMockMode } from '../App';
import { EarningsDateRangePicker } from './ui/earnings-date-range-picker';
import TableFilter from './ui/table-filter';

// ============================================================
// Weekly Rota — employees send the days and hours they want to work
// from the app (migration 094). Each submission waits on the right
// until the office confirms it: "Confirm" as requested, or drag it onto
// the employee's row in the schedule to start that week on another day
// (migration 095, confirm_rota_week). The schedule on the left, 3/4 of
// the screen, shows confirmed rota solid and still-pending requests
// dashed.
// ============================================================

interface RotaDriver { id: string; driver_id: string; full_name: string }
interface RotaRow {
  driver_id: string;
  work_date: string;
  day_off: boolean;
  start_time: string | null;
  end_time: string | null;
  note: string | null;
  status: 'pending' | 'confirmed';
}

const NAME_W = 150;
const COL_W = 92;
const ROW_H = 46;
const DAY_MS = 86_400_000;

const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseKey = (k: string) => new Date(`${k}T00:00:00`);
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '');
const sundayKey = (k: string) => { const d = parseKey(k); d.setDate(d.getDate() - d.getDay()); return dateKey(d); };
const addDaysKey = (k: string, n: number) => { const d = parseKey(k); d.setDate(d.getDate() + n); return dateKey(d); };
const shortDay = (k: string) => parseKey(k).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

function defaultRange() {
  const now = new Date();
  const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  const end = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + 20);
  return { from: dateKey(sunday), to: dateKey(end) };
}

interface Submission { key: string; driverId: string; weekStart: string; rows: RotaRow[] }

export default function WeeklyRota({ organizationId, drivers }: { organizationId: string | null; drivers: RotaDriver[] }) {
  const [range, setRange] = useState(defaultRange);
  const [rows, setRows] = useState<RotaRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropIdx, setDropIdx] = useState<{ driverId: string; idx: number } | null>(null);

  const days = useMemo(() => {
    const out: string[] = [];
    const end = parseKey(range.to || range.from);
    for (const d = parseKey(range.from); d <= end && out.length < 62; d.setDate(d.getDate() + 1)) out.push(dateKey(d));
    return out;
  }, [range]);

  const load = useCallback(async () => {
    if (isMockMode || !supabase || !organizationId) return;
    setIsLoading(true);
    setError('');
    // Pending submissions are listed regardless of the range being viewed.
    const [inRange, pendingAll] = await Promise.all([
      supabase.from('employee_rota').select('driver_id, work_date, day_off, start_time, end_time, note, status')
        .eq('organization_id', organizationId).gte('work_date', range.from).lte('work_date', range.to || range.from),
      supabase.from('employee_rota').select('driver_id, work_date, day_off, start_time, end_time, note, status')
        .eq('organization_id', organizationId).eq('status', 'pending').gte('work_date', dateKey(new Date(Date.now() - 7 * DAY_MS))),
    ]);
    if (inRange.error || pendingAll.error) setError((inRange.error ?? pendingAll.error)!.message);
    else {
      const merged = new Map<string, RotaRow>();
      [...(inRange.data ?? []), ...(pendingAll.data ?? [])].forEach((r: any) => merged.set(`${r.driver_id}|${r.work_date}`, r as RotaRow));
      setRows([...merged.values()]);
    }
    setIsLoading(false);
  }, [organizationId, range]);

  useEffect(() => { load(); }, [load]);
  useSectionRefresh(load);

  useEffect(() => {
    if (isMockMode || !supabase || !organizationId) return;
    const channel = supabase
      .channel('realtime_employee_rota')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employee_rota' }, () => load())
      .subscribe();
    return () => { supabase!.removeChannel(channel); };
  }, [organizationId, load]);

  const byDriverDay = useMemo(() => {
    const m = new Map<string, RotaRow>();
    rows.forEach(r => m.set(`${r.driver_id}|${r.work_date}`, r));
    return m;
  }, [rows]);

  const nameOf = useMemo(() => new Map(drivers.map(d => [d.id, d])), [drivers]);

  const submissions = useMemo<Submission[]>(() => {
    const m = new Map<string, Submission>();
    rows.filter(r => r.status === 'pending').forEach(r => {
      const ws = sundayKey(r.work_date);
      const key = `${r.driver_id}|${ws}`;
      if (!m.has(key)) m.set(key, { key, driverId: r.driver_id, weekStart: ws, rows: [] });
      m.get(key)!.rows.push(r);
    });
    return [...m.values()]
      .map(s => ({ ...s, rows: s.rows.sort((a, b) => a.work_date.localeCompare(b.work_date)) }))
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart) || (nameOf.get(a.driverId)?.full_name ?? '').localeCompare(nameOf.get(b.driverId)?.full_name ?? ''));
  }, [rows, nameOf]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return drivers.filter(d => !q || `${d.full_name} ${d.driver_id}`.toLowerCase().includes(q));
  }, [drivers, search]);

  const dragged = submissions.find(s => s.key === dragKey) ?? null;

  const confirm = async (sub: Submission, newStart: string) => {
    if (isMockMode || !supabase) return;
    setBusyKey(sub.key);
    setError('');
    const { error: err } = await supabase.rpc('confirm_rota_week', { p_driver: sub.driverId, p_week_start: sub.weekStart, p_new_start: newStart });
    if (err) setError(err.message);
    setBusyKey(null);
    setDragKey(null);
    setDropIdx(null);
    await load();
  };

  const todayKey = dateKey(new Date());

  // The confirmed rotas on the calendar: for each employee, the days and hours they are
  // rostered to work, one card per week. This is the availability the system will use to
  // decide which driver a load can go to.
  const confirmedWeeks = useMemo(() => {
    const m = new Map<string, { key: string; driverId: string; weekStart: string; rows: RotaRow[] }>();
    rows.filter(r => r.status === 'confirmed' && !r.day_off && r.start_time && r.end_time).forEach(r => {
      const ws = sundayKey(r.work_date);
      const key = `${r.driver_id}|${ws}`;
      if (!m.has(key)) m.set(key, { key, driverId: r.driver_id, weekStart: ws, rows: [] });
      m.get(key)!.rows.push(r);
    });
    return [...m.values()]
      .map(w => ({ ...w, rows: w.rows.sort((a, b) => a.work_date.localeCompare(b.work_date)) }))
      .filter(w => !search.trim() || (nameOf.get(w.driverId)?.full_name ?? '').toLowerCase().includes(search.trim().toLowerCase()))
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart) || (nameOf.get(a.driverId)?.full_name ?? '').localeCompare(nameOf.get(b.driverId)?.full_name ?? ''));
  }, [rows, nameOf, search]);
  const trackW = days.length * COL_W;
  const cellText = (r: RotaRow) => (r.day_off ? 'Off' : `${hhmm(r.start_time)}–${hhmm(r.end_time)}`);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(230px, 1fr)', gap: '16px', alignItems: 'start' }}>
      {/* ── Schedule (3/4) ── */}
      <div className="glass-card" style={{ padding: '14px 16px', minWidth: 0 }}>
        <div className="flex align-center justify-between mb-12" style={{ gap: '10px', flexWrap: 'wrap' }}>
          <div className="flex align-center" style={{ gap: '8px', flexWrap: 'wrap' }}>
            <span>
              <EarningsDateRangePicker compact
                startDate={range.from}
                endDate={range.to}
                onChange={(from, to) => { if (from) setRange({ from, to: to || from }); }}
              />
            </span>
            <button type="button" className="comp-edit-btn" onClick={() => setRange(defaultRange())}>This week</button>
          </div>
          <TableFilter groups={[]} search={{ value: search, onChange: setSearch, placeholder: 'Search employee…' }} />
        </div>

        <div className="flex align-center text-xs text-secondary mb-12" style={{ gap: '16px', flexWrap: 'wrap' }}>
          <span className="flex align-center" style={{ gap: '6px' }}><i style={{ width: 14, height: 10, borderRadius: 3, background: 'var(--charcoal)', display: 'inline-block' }} /> Confirmed</span>
          <span className="flex align-center" style={{ gap: '6px' }}><i style={{ width: 14, height: 10, borderRadius: 3, border: '1.5px dashed var(--brand-red)', background: 'rgba(204,0,0,0.08)', display: 'inline-block' }} /> Requested</span>
        </div>

        {error && <div className="login-notice login-notice--error mb-12">{error}</div>}

        {isLoading && rows.length === 0 ? (
          <p className="text-xs text-muted text-center py-24">Loading…</p>
        ) : shown.length === 0 ? (
          <NoData />
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
            <div style={{ width: NAME_W + trackW }}>
              <div className="flex" style={{ background: 'var(--card-bg-hover)', borderBottom: '1px solid var(--border-color)' }}>
                <div className="text-xs font-bold text-primary" style={{ width: NAME_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 2, background: 'var(--card-bg-hover)', borderRight: '1px solid var(--border-color)', padding: '8px 12px' }}>Employees</div>
                {days.map(k => {
                  const d = parseKey(k);
                  return (
                    <div key={k} className="text-center" style={{ width: COL_W, flexShrink: 0, padding: '6px 0', borderRight: '1px solid var(--border-color)', background: d.getDay() === 0 || d.getDay() === 6 ? 'rgba(0,0,0,0.05)' : undefined }}>
                      <div className="text-xs font-bold" style={{ color: k === todayKey ? 'var(--brand-red)' : 'var(--charcoal)' }}>{d.toLocaleDateString('en-GB', { weekday: 'short' })}</div>
                      <div className="font-mono text-xs text-muted">{d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
                    </div>
                  );
                })}
              </div>

              {shown.map(d => {
                const isTarget = dragged?.driverId === d.id;
                const previewStart = isTarget && dropIdx?.driverId === d.id ? dropIdx.idx : null;
                return (
                  <div key={d.id} className="flex" style={{ borderBottom: '1px solid var(--border-color)', height: ROW_H, opacity: dragged && !isTarget ? 0.45 : 1 }}>
                    <div style={{ width: NAME_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 1, background: 'var(--card-bg)', borderRight: '1px solid var(--border-color)', padding: '6px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
                      <span className="font-bold text-primary" style={{ fontSize: '12.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.full_name}</span>
                      <span className="text-xs text-muted font-mono">{d.driver_id}</span>
                    </div>
                    <div
                      className="flex"
                      style={{ position: 'relative', width: trackW, backgroundColor: isTarget ? 'rgba(204,0,0,0.04)' : undefined }}
                      onDragOver={(e) => {
                        if (!isTarget) return;
                        e.preventDefault();
                        const rect = e.currentTarget.getBoundingClientRect();
                        const idx = Math.max(0, Math.min(days.length - 1, Math.floor((e.clientX - rect.left) / COL_W)));
                        if (!dropIdx || dropIdx.idx !== idx || dropIdx.driverId !== d.id) setDropIdx({ driverId: d.id, idx });
                      }}
                      onDrop={(e) => {
                        if (!isTarget || !dragged) return;
                        e.preventDefault();
                        const rect = e.currentTarget.getBoundingClientRect();
                        const idx = Math.max(0, Math.min(days.length - 1, Math.floor((e.clientX - rect.left) / COL_W)));
                        confirm(dragged, days[idx]);
                      }}
                    >
                      {days.map(k => {
                        const r = byDriverDay.get(`${d.id}|${k}`);
                        const pending = r?.status === 'pending';
                        return (
                          <div key={k} className="flex align-center justify-center" style={{ width: COL_W, flexShrink: 0, borderRight: '1px solid var(--border-color)', padding: '4px' }} title={r?.note ?? undefined}>
                            {!r ? (
                              <span className="text-xs text-muted">—</span>
                            ) : r.day_off ? (
                              <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', background: 'var(--card-bg-hover)', color: 'var(--charcoal-light)', border: pending ? '1px dashed var(--charcoal-light)' : '1px solid transparent' }}>Off</span>
                            ) : (
                              <span
                                className="font-mono"
                                style={{
                                  fontSize: '10.5px', fontWeight: 700, padding: '3px 6px', borderRadius: '6px', whiteSpace: 'nowrap',
                                  background: pending ? 'rgba(204,0,0,0.08)' : 'var(--charcoal)',
                                  color: pending ? 'var(--brand-red)' : '#fff',
                                  border: pending ? '1.5px dashed var(--brand-red)' : '1px solid var(--charcoal)',
                                }}
                              >
                                {cellText(r)}
                              </span>
                            )}
                          </div>
                        );
                      })}
                      {previewStart !== null && (
                        <div
                          style={{
                            position: 'absolute', top: 4, bottom: 4, left: previewStart * COL_W + 1,
                            width: Math.min(7, days.length - previewStart) * COL_W - 2,
                            border: '2px solid var(--charcoal)', borderRadius: 8, background: 'rgba(51,51,51,0.12)',
                            pointerEvents: 'none', zIndex: 2, display: 'flex', alignItems: 'center', padding: '0 10px',
                            fontSize: '11px', fontWeight: 800, color: 'var(--charcoal)', whiteSpace: 'nowrap', overflow: 'hidden',
                          }}
                        >
                          Week from {shortDay(days[previewStart])}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Right column: rotas requested, and the rotas live right now ── */}
      <div className="flex flex-col" style={{ gap: '16px', minWidth: 0 }}>
      <div className="glass-card" style={{ padding: '14px 16px', minWidth: 0 }}>
        <div className="flex align-center justify-between" style={{ marginBottom: '4px' }}>
          <p className="font-black text-primary m-0" style={{ fontSize: '14px' }}>Rotas Requested</p>
          <span className="text-xs text-muted">{submissions.length} waiting</span>
        </div>
        <p className="text-xs text-muted" style={{ margin: '0 0 12px' }}>
          The days and hours employees want to work. Confirm as requested, or drag onto their row to start that week on another day.
        </p>
        {submissions.length === 0 ? (
          <NoData />
        ) : (
          <div className="flex flex-col" style={{ gap: '10px' }}>
            {submissions.map(sub => {
              const drv = nameOf.get(sub.driverId);
              const busy = busyKey === sub.key;
              return (
                <div
                  key={sub.key}
                  draggable={!busy}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', sub.key);
                    setDragKey(sub.key);
                    // Bring the requested week into view.
                    const inView = days.includes(sub.weekStart);
                    if (!inView) setRange({ from: sub.weekStart, to: addDaysKey(sub.weekStart, 20) });
                  }}
                  onDragEnd={() => { setDragKey(null); setDropIdx(null); }}
                  style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', cursor: 'grab', opacity: dragKey === sub.key ? 0.5 : 1 }}
                >
                  <div className="flex align-start" style={{ gap: '8px' }}>
                    <GripVertical size={15} style={{ color: 'var(--charcoal-light)', marginTop: '2px', flexShrink: 0 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p className="font-semibold text-primary m-0" style={{ fontSize: '12.5px' }}>{drv?.full_name ?? 'Employee'}</p>
                      <p className="font-mono text-xs m-0" style={{ color: 'var(--charcoal)', fontWeight: 700 }}>
                        Week of {shortDay(sub.weekStart)}
                      </p>
                      <div style={{ marginTop: '6px', display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: '10px', rowGap: '2px' }}>
                        {sub.rows.map(r => (
                          <div key={r.work_date} style={{ display: 'contents' }}>
                            <span className="text-xs text-muted">{parseKey(r.work_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })}</span>
                            <span className="font-mono text-xs" style={{ fontWeight: 700, color: r.day_off ? 'var(--charcoal-light)' : 'var(--charcoal)' }}>{cellText(r)}</span>
                          </div>
                        ))}
                      </div>
                      <button type="button" className="alert-ack-btn" style={{ marginTop: '8px' }} disabled={busy} onClick={() => confirm(sub, sub.weekStart)}>
                        <CheckCircle2 size={12} /> {busy ? 'Confirming…' : 'Confirm'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Live rotas: the confirmed rotas on the calendar ── */}
      <div className="glass-card" style={{ padding: '14px 16px', minWidth: 0 }}>
        <div className="flex align-center justify-between" style={{ marginBottom: '4px' }}>
          <p className="font-black text-primary m-0" style={{ fontSize: '14px' }}>Live Rotas</p>
          <span className="text-xs text-muted">{confirmedWeeks.length} confirmed</span>
        </div>
        <p className="text-xs text-muted" style={{ margin: '0 0 12px' }}>The confirmed rotas shown on the calendar: when each employee is available to work.</p>
        {confirmedWeeks.length === 0 ? (
          <NoData />
        ) : (
          <div className="flex flex-col" style={{ gap: '10px', maxHeight: '520px', overflowY: 'auto', paddingRight: '2px' }}>
            {confirmedWeeks.map(w => (
              <div key={w.key} style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--card-bg)' }}>
                <p className="font-semibold text-primary m-0" style={{ fontSize: '12.5px' }}>{nameOf.get(w.driverId)?.full_name ?? 'Employee'}</p>
                <p className="font-mono text-xs m-0" style={{ color: 'var(--charcoal)', fontWeight: 700 }}>Week of {shortDay(w.weekStart)}</p>
                <div style={{ marginTop: '6px', display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: '10px', rowGap: '2px' }}>
                  {w.rows.map(r => (
                    <div key={r.work_date} style={{ display: 'contents' }}>
                      <span className="text-xs" style={{ color: r.work_date === todayKey ? 'var(--brand-red)' : 'var(--charcoal-light)', fontWeight: r.work_date === todayKey ? 800 : 400 }}>{parseKey(r.work_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })}</span>
                      <span className="font-mono text-xs" style={{ fontWeight: 700, color: 'var(--charcoal)' }}>{cellText(r)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
