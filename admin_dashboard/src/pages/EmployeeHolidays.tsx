import NoData from '../components/ui/no-data';
import { useSectionRefresh } from '../lib/section-refresh';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ChevronLeft, Plus, X, CheckCircle2, CircleX, GripVertical } from 'lucide-react';
import { supabase, isMockMode } from '../App';
import TableFilter from '../components/ui/table-filter';
import WeeklyRota from '../components/WeeklyRota';
import { EarningsDateRangePicker } from '../components/ui/earnings-date-range-picker';

// ============================================================
// Employee Holidays — a full-width timeline (employees down the side,
// one column per day) showing the exact dates of booked holidays
// (migration 057) and requests waiting for approval (migration 061).
// Requests employees send from the app show dashed until approved or
// declined; holidays an admin adds here are approved straight away.
// No entitlement/balance tracking. Sits under the Driver Profiles
// accordion.
// ============================================================

interface HolidayDriverLite {
  id: string;
  driver_id: string;
  full_name: string;
}

type HolidayStatus = 'pending' | 'approved' | 'declined' | 'cancelled';

interface HolidayRow {
  id: string;
  driver_id: string;
  driver_name?: string;
  start_date: string;
  end_date: string;
  note: string | null;
  status: HolidayStatus;
  leave_type: string;
  created_at: string;
  reviewed_at?: string | null;
}

const LEAVE_LABEL: Record<string, string> = { annual: 'Annual leave', unpaid: 'Unpaid leave', other: 'Other leave' };

function dayCount(start: string, end: string): number {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000) + 1;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

const NAME_W = 150;
// Holidays approved in the last week stand out in their own colour.
const NEW_COLOR = '#0F9D58';
const NEW_DAYS = 7;
const isNewlyApproved = (h: { status: string; reviewed_at?: string | null }) =>
  h.status === 'approved' && !!h.reviewed_at && Date.now() - new Date(h.reviewed_at).getTime() < NEW_DAYS * 86_400_000;
const ROW_H = 46;

interface EmployeeHolidaysProps {
  organizationId: string | null;
  /** App.tsx's shared approve/decline handler (also used by the Alert Panel). */
  onReviewRequest?: (id: string, decision: 'approved' | 'declined', note?: string) => Promise<void>;
  onBack?: () => void;
}

export default function EmployeeHolidays({ organizationId, onReviewRequest, onBack }: EmployeeHolidaysProps) {
  const [drivers, setDrivers] = useState<HolidayDriverLite[]>([]);
  const [holidays, setHolidays] = useState<HolidayRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  // Visible window of the timeline, chosen with the shared date-range picker.
  const defaultWindow = () => {
    const from = startOfMonth(new Date());
    const to = new Date(addMonths(from, 3).getTime() - 86_400_000);
    return { from: dateKey(from), to: dateKey(to) };
  };
  const [win, setWin] = useState(defaultWindow);
  const monthAnchor = useMemo(() => new Date(`${win.from}T00:00:00`), [win.from]);
  const setMonthAnchor = (d: Date) => {
    const to = new Date(addMonths(startOfMonth(d), 3).getTime() - 86_400_000);
    setWin({ from: dateKey(d), to: dateKey(to) });
  };
  const [isAddOpen, setIsAddOpen] = useState(false);

  const [formDriverId, setFormDriverId] = useState('');
  const [formStart, setFormStart] = useState('');
  const [formEnd, setFormEnd] = useState('');
  const [formNote, setFormNote] = useState('');
  const [formLeaveType, setFormLeaveType] = useState('annual');
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [declineNote, setDeclineNote] = useState('');
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const [zoom, setZoom] = useState(32);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [subTab, setSubTab] = useState<'bookings' | 'rota'>('bookings');
  // Drag & drop of a waiting request onto the timeline.
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ driverId: string; idx: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (isMockMode || !supabase || !organizationId) return;
    setIsLoading(true);
    setError('');
    try {
      const [{ data: driverRows, error: drErr }, { data: holidayRows, error: hErr }] = await Promise.all([
        supabase.from('drivers').select('id, driver_id, full_name').eq('organization_id', organizationId).eq('is_active', true).order('full_name'),
        supabase.from('employee_holidays').select('id, driver_id, start_date, end_date, note, status, leave_type, created_at, reviewed_at, drivers(full_name)').eq('organization_id', organizationId).in('status', ['pending', 'approved']).order('start_date', { ascending: false }),
      ]);
      if (drErr || hErr) throw drErr ?? hErr;
      setDrivers((driverRows ?? []) as HolidayDriverLite[]);
      setHolidays((holidayRows ?? []).map((h: any) => ({ ...h, driver_name: h.drivers?.full_name })) as HolidayRow[]);
    } catch (err: any) {
      setError(err?.message ?? 'Could not load employee holidays.');
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);
  useSectionRefresh(load);

  useEffect(() => {
    if (isMockMode || !supabase || !organizationId) return;
    const channel = supabase
      .channel('realtime_employee_holidays')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employee_holidays' }, () => load())
      .subscribe();
    return () => { supabase!.removeChannel(channel); };
  }, [organizationId, load]);

  // Three months from the anchor, one column per day.
  const windowDays = useMemo(() => {
    const out: Date[] = [];
    const end = new Date(`${win.to || win.from}T00:00:00`);
    for (const d = new Date(monthAnchor); d <= end && out.length < 400; d.setDate(d.getDate() + 1)) out.push(new Date(d));
    return out;
  }, [monthAnchor, win.to, win.from]);
  const winStartUtc = Date.UTC(monthAnchor.getFullYear(), monthAnchor.getMonth(), monthAnchor.getDate());
  const idxOf = (k: string) => {
    const [y, m, d] = k.split('-').map(Number);
    return Math.round((Date.UTC(y, m - 1, d) - winStartUtc) / 86_400_000);
  };

  const monthSegments = useMemo(() => {
    const segs: { label: string; days: number }[] = [];
    windowDays.forEach(d => {
      const label = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      if (segs.length && segs[segs.length - 1].label === label) segs[segs.length - 1].days++;
      else segs.push({ label, days: 1 });
    });
    return segs;
  }, [windowDays]);

  // Jump to today whenever the visible months change.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const i = idxOf(dateKey(new Date()));
    el.scrollLeft = i >= 0 && i < windowDays.length ? Math.max(0, i * zoom - 120) : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.from, isLoading]);

  const openAddModal = () => {
    setFormDriverId('');
    setFormStart('');
    setFormEnd('');
    setFormNote('');
    setFormLeaveType('annual');
    setFormError('');
    setIsAddOpen(true);
  };

  const handleSave = async () => {
    if (isMockMode || !supabase || !organizationId) return;
    setFormError('');
    if (!formDriverId) { setFormError('Select an employee.'); return; }
    if (!formStart || !formEnd) { setFormError('Enter a start and end date.'); return; }
    if (formEnd < formStart) { setFormError('End date must be on or after the start date.'); return; }

    setIsSaving(true);
    try {
      const { error: insertError } = await supabase.from('employee_holidays').insert({
        driver_id: formDriverId,
        start_date: formStart,
        end_date: formEnd,
        note: formNote.trim() || null,
        leave_type: formLeaveType,
        status: 'approved',
      });
      if (insertError) throw insertError;
      setIsAddOpen(false);
      load();
    } catch (err: any) {
      setFormError(err?.message ?? 'Could not save this holiday.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (isMockMode || !supabase) return;
    try {
      await supabase.from('employee_holidays').delete().eq('id', id);
      setHolidays(prev => prev.filter(h => h.id !== id));
    } catch (err: any) {
      setError(err?.message ?? 'Could not remove this holiday.');
    }
  };

  const review = async (id: string, decision: 'approved' | 'declined', note?: string) => {
    if (!onReviewRequest) return;
    setReviewingId(id);
    try {
      await onReviewRequest(id, decision, note);
      setDecliningId(null);
      setDeclineNote('');
      await load();
    } finally {
      setReviewingId(null);
    }
  };

  const todayKey = dateKey(new Date());
  const todayIdx = idxOf(todayKey);
  const pendingRequests = useMemo(
    () => holidays.filter(h => h.status === 'pending').sort((a, b) => a.start_date.localeCompare(b.start_date)),
    [holidays],
  );
  const fmt = (k: string) => new Date(k + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const range = (h: { start_date: string; end_date: string }) => (h.end_date !== h.start_date ? `${fmt(h.start_date)} – ${fmt(h.end_date)}` : fmt(h.start_date));
  const plural = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
  const addDaysKey = (k: string, n: number) => {
    const [y, m, d] = k.split('-').map(Number);
    return dateKey(new Date(y, m - 1, d + n));
  };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return drivers
      .filter(d => !q || `${d.full_name} ${d.driver_id}`.toLowerCase().includes(q))
      .map(d => ({
        driver: d,
        items: holidays.filter(h => h.driver_id === d.id && (statusFilter.length === 0 || statusFilter.includes(h.status))),
      }))
      .filter(r => statusFilter.length === 0 || r.items.length > 0 || (dragId !== null && holidays.find(h => h.id === dragId)?.driver_id === r.driver.id));
  }, [drivers, holidays, search, statusFilter, dragId]);

  const dragged = holidays.find(h => h.id === dragId) ?? null;
  const trackW = windowDays.length * zoom;

  // Dropping a waiting request on its employee's row confirms it from the
  // dropped day, keeping the number of days they asked for.
  const confirmDrop = async (h: HolidayRow, dayIdx: number) => {
    if (isMockMode || !supabase) return;
    const length = dayCount(h.start_date, h.end_date);
    const start = dateKey(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), monthAnchor.getDate() + dayIdx));
    const end = addDaysKey(start, length - 1);
    setReviewingId(h.id);
    try {
      const { error: upErr } = await supabase.from('employee_holidays').update({ start_date: start, end_date: end }).eq('id', h.id);
      if (upErr) throw upErr;
      await review(h.id, 'approved');
    } catch (err: any) {
      setError(err?.message ?? 'Could not confirm these dates.');
    } finally {
      setReviewingId(null);
      setDragId(null);
      setDrop(null);
    }
  };

  const removeHoliday = (h: HolidayRow) => {
    if (window.confirm(`Remove ${h.driver_name ?? 'this employee'}'s holiday (${range(h)})?`)) handleDelete(h.id);
  };

  const reviewButtons = (h: HolidayRow) => {
    const busy = reviewingId === h.id;
    if (decliningId === h.id) {
      return (
        <div className="flex flex-col" style={{ gap: '6px' }}>
          <input
            type="text"
            className="input-field"
            style={{ width: '100%', padding: '6px 8px', fontSize: '12px' }}
            placeholder="Reason (optional) — the employee sees this"
            value={declineNote}
            onChange={(e) => setDeclineNote(e.target.value)}
            autoFocus
          />
          <div className="flex" style={{ gap: '6px' }}>
            <button type="button" className="alert-ack-btn" disabled={busy} onClick={() => review(h.id, 'declined', declineNote)}>
              <CircleX size={12} /> {busy ? 'Declining…' : 'Confirm'}
            </button>
            <button type="button" className="alert-dismiss-btn" disabled={busy} onClick={() => { setDecliningId(null); setDeclineNote(''); }}>Cancel</button>
          </div>
        </div>
      );
    }
    return (
      <div className="flex" style={{ gap: '6px', flexWrap: 'wrap' }}>
        <button type="button" className="alert-ack-btn" disabled={busy || !onReviewRequest} onClick={() => review(h.id, 'approved')}>
          <CheckCircle2 size={12} /> {busy ? 'Approving…' : 'Approve'}
        </button>
        <button type="button" className="alert-dismiss-btn" disabled={busy || !onReviewRequest} onClick={() => { setDecliningId(h.id); setDeclineNote(''); }}>
          <CircleX size={12} /> Decline
        </button>
      </div>
    );
  };


  return (
    <div className="flex-1" style={{ minWidth: 0 }}>
      <div className="flex align-center justify-between mb-16">
        <div>
          <h2 className="text-xl font-black text-primary m-0">EMPLOYEES SCHEDULE</h2>
          <p className="text-xs text-muted m-0 mt-4">Holiday bookings and the weekly rota.</p>
        </div>
        <div className="flex align-center" style={{ gap: '8px' }}>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="flex align-center text-xs font-bold"
              style={{ gap: '4px', background: 'none', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', color: 'var(--charcoal)' }}
            >
              <ChevronLeft size={14} /> Back
            </button>
          )}
          {subTab === 'bookings' && (
            <button
              type="button"
              onClick={openAddModal}
              className="btn flex align-center"
              style={{ gap: '6px', padding: '6px 12px', fontSize: '11px', fontWeight: 700, backgroundColor: 'var(--brand-red)', color: '#FFFFFF', borderColor: 'var(--brand-red)' }}
            >
              <Plus size={15} /> Add Holiday
            </button>
          )}
        </div>
      </div>

      <div className="live-subtabs" role="tablist" style={{ marginTop: 0, marginBottom: '16px' }}>
        <button type="button" role="tab" aria-selected={subTab === 'bookings'} className={`live-subtab${subTab === 'bookings' ? ' live-subtab--active' : ''}`} onClick={() => setSubTab('bookings')}>
          Holidays Bookings{pendingRequests.length > 0 ? ` (${pendingRequests.length})` : ''}
        </button>
        <button type="button" role="tab" aria-selected={subTab === 'rota'} className={`live-subtab${subTab === 'rota' ? ' live-subtab--active' : ''}`} onClick={() => setSubTab('rota')}>
          Weekly Rota
        </button>
      </div>

      {error && <div className="login-notice login-notice--error mb-16">{error}</div>}

      {subTab === 'rota' && <WeeklyRota organizationId={organizationId} drivers={drivers} />}

      {subTab === 'bookings' && (
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(230px, 1fr)', gap: '16px', alignItems: 'start' }}>
        {/* ── Timeline (left half) ── */}
        <div className="glass-card" style={{ padding: '14px 16px', minWidth: 0 }}>
          <div className="flex align-center justify-between mb-12" style={{ gap: '10px', flexWrap: 'wrap' }}>
            <div className="flex align-center" style={{ gap: '8px' }}>
              <span style={{ minWidth: '250px' }}>
                <EarningsDateRangePicker
                  startDate={win.from}
                  endDate={win.to}
                  onChange={(from, to) => { if (from) setWin({ from, to: to || from }); }}
                />
              </span>
              <button type="button" className="comp-edit-btn" onClick={() => setWin(defaultWindow())}>Today</button>
            </div>
            <label className="flex align-center text-xs font-bold text-secondary" style={{ gap: '8px' }}>
              Zoom
              <input type="range" min={16} max={72} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} style={{ width: '100px', accentColor: 'var(--charcoal)' }} />
            </label>
          </div>
          <div className="mb-12">
            <TableFilter
              groups={[{
                key: 'status', label: 'Status',
                options: [{ value: 'approved', label: 'Booked' }, { value: 'pending', label: 'Awaiting approval' }],
                selected: statusFilter,
                onChange: setStatusFilter,
              }]}
              search={{ value: search, onChange: setSearch, placeholder: 'Search employee…' }}
            />
          </div>

          <div className="flex align-center text-xs text-secondary mb-12" style={{ gap: '16px', flexWrap: 'wrap' }}>
            <span className="flex align-center" style={{ gap: '6px' }}><i style={{ width: 14, height: 10, borderRadius: 3, background: 'var(--charcoal)', display: 'inline-block' }} /> Booked</span>
            <span className="flex align-center" style={{ gap: '6px' }}><i style={{ width: 14, height: 10, borderRadius: 3, background: NEW_COLOR, display: 'inline-block' }} /> Newly approved</span>
            <span className="flex align-center" style={{ gap: '6px' }}><i style={{ width: 14, height: 10, borderRadius: 3, border: '1.5px dashed var(--brand-red)', background: 'rgba(204,0,0,0.08)', display: 'inline-block' }} /> Awaiting approval</span>
            <span className="flex align-center" style={{ gap: '6px' }}><i style={{ width: 2, height: 12, background: 'var(--brand-red)', display: 'inline-block' }} /> Today</span>
          </div>

          {isLoading ? (
            <p className="text-xs text-muted text-center py-24">Loading…</p>
          ) : rows.length === 0 ? (
            <NoData />
          ) : (
            <div ref={scrollRef} style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
              <div style={{ width: NAME_W + trackW, position: 'relative' }}>
                {/* Header: months, then days */}
                <div className="flex" style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--card-bg-hover)' }}>
                  <div className="text-xs font-bold text-primary" style={{ width: NAME_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 4, background: 'var(--card-bg-hover)', borderRight: '1px solid var(--border-color)', padding: '8px 12px' }}>Employees</div>
                  <div>
                    <div className="flex">
                      {monthSegments.map(seg => (
                        <div key={seg.label} className="text-xs font-bold text-primary" style={{ width: seg.days * zoom, padding: '6px 8px', borderRight: '1px solid var(--border-color)', whiteSpace: 'nowrap', overflow: 'hidden' }}>{seg.label}</div>
                      ))}
                    </div>
                    <div className="flex">
                      {windowDays.map(d => {
                        const k = dateKey(d);
                        const weekend = d.getDay() === 0 || d.getDay() === 6;
                        return (
                          <div key={k} className="font-mono text-center" style={{ width: zoom, flexShrink: 0, fontSize: '10px', padding: '3px 0', color: k === todayKey ? 'var(--brand-red)' : 'var(--charcoal-light)', fontWeight: k === todayKey ? 800 : 500, background: weekend ? 'rgba(0,0,0,0.05)' : undefined, borderRight: '1px solid var(--border-color)' }}>
                            {zoom >= 26 && <div>{d.toLocaleDateString('en-GB', { weekday: 'narrow' })}</div>}
                            <div>{d.getDate()}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Today marker */}
                {todayIdx >= 0 && todayIdx < windowDays.length && (
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: NAME_W + todayIdx * zoom + zoom / 2 - 1, width: 2, background: 'var(--brand-red)', opacity: 0.55, zIndex: 3, pointerEvents: 'none' }} />
                )}

                {rows.map(({ driver, items }) => {
                  const isTarget = dragged?.driver_id === driver.id;
                  const preview = isTarget && drop?.driverId === driver.id && dragged ? drop.idx : null;
                  const previewLen = dragged ? dayCount(dragged.start_date, dragged.end_date) : 0;
                  return (
                    <div key={driver.id} className="flex" style={{ height: ROW_H, borderBottom: '1px solid var(--border-color)', opacity: dragged && !isTarget ? 0.45 : 1 }}>
                      <div style={{ width: NAME_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 2, background: 'var(--card-bg)', borderRight: '1px solid var(--border-color)', padding: '6px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
                        <span className="font-bold text-primary" style={{ fontSize: '12.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{driver.full_name}</span>
                        <span className="text-xs text-muted font-mono">{driver.driver_id}</span>
                      </div>
                      <div
                        style={{
                          position: 'relative', width: trackW,
                          backgroundColor: isTarget ? 'rgba(204,0,0,0.04)' : undefined,
                          backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent ${zoom - 1}px, var(--border-color) ${zoom - 1}px, var(--border-color) ${zoom}px)`,
                        }}
                        onDragOver={(e) => {
                          if (!isTarget) return;
                          e.preventDefault();
                          const rect = e.currentTarget.getBoundingClientRect();
                          const idx = Math.max(0, Math.min(windowDays.length - 1, Math.floor((e.clientX - rect.left) / zoom)));
                          if (!drop || drop.idx !== idx || drop.driverId !== driver.id) setDrop({ driverId: driver.id, idx });
                        }}
                        onDrop={(e) => {
                          if (!isTarget || !dragged) return;
                          e.preventDefault();
                          const rect = e.currentTarget.getBoundingClientRect();
                          const idx = Math.max(0, Math.min(windowDays.length - 1, Math.floor((e.clientX - rect.left) / zoom)));
                          confirmDrop(dragged, idx);
                        }}
                      >
                        {items.map(h => {
                          const s0 = Math.max(0, idxOf(h.start_date));
                          const e0 = Math.min(windowDays.length - 1, idxOf(h.end_date));
                          if (e0 < 0 || s0 > windowDays.length - 1) return null;
                          const pending = h.status === 'pending';
                          const fresh = isNewlyApproved(h);
                          const days = dayCount(h.start_date, h.end_date);
                          const width = (e0 - s0 + 1) * zoom - 2;
                          const label = width > 150 ? `${range(h)} · ${plural(days)}` : width > 80 ? range(h) : width > 40 ? `${days}d` : '';
                          return (
                            <div
                              key={h.id}
                              title={`${driver.full_name}: ${range(h)} (${plural(days)})${pending ? ' — awaiting approval' : fresh ? ' — newly approved' : ''}`}
                              style={{
                                position: 'absolute', top: 8, height: ROW_H - 16, left: s0 * zoom + 1, width,
                                borderRadius: 6, padding: '0 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
                                fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden',
                                background: pending ? 'rgba(204,0,0,0.08)' : fresh ? NEW_COLOR : 'var(--charcoal)',
                                color: pending ? 'var(--brand-red)' : '#fff',
                                border: pending ? '1.5px dashed var(--brand-red)' : `1px solid ${fresh ? NEW_COLOR : 'var(--charcoal)'}`,
                                pointerEvents: dragged ? 'none' : 'auto',
                              }}
                            >
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
                              {!pending && width > 60 && (
                                <button type="button" aria-label="Remove holiday" title="Remove" onClick={() => removeHoliday(h)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, display: 'flex', opacity: 0.75 }}>
                                  <X size={12} />
                                </button>
                              )}
                            </div>
                          );
                        })}
                        {preview !== null && (
                          <div
                            style={{
                              position: 'absolute', top: 8, height: ROW_H - 16, left: preview * zoom + 1,
                              width: Math.min(previewLen, windowDays.length - preview) * zoom - 2,
                              borderRadius: 6, border: '2px solid var(--charcoal)', background: 'rgba(51,51,51,0.15)',
                              display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: '11px', fontWeight: 800, color: 'var(--charcoal)',
                              pointerEvents: 'none', whiteSpace: 'nowrap', overflow: 'hidden', zIndex: 2,
                            }}
                          >
                            {fmt(dateKey(windowDays[preview]))} – {fmt(addDaysKey(dateKey(windowDays[preview]), previewLen - 1))}
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

        {/* ── Holiday bookings waiting for approval (right half) ── */}
        <div className="glass-card" style={{ padding: '14px 16px', minWidth: 0 }}>
          <div className="flex align-center justify-between" style={{ marginBottom: '4px' }}>
            <p className="font-black text-primary m-0" style={{ fontSize: '14px' }}>Holidays Bookings</p>
            <span className="text-xs text-muted">{pendingRequests.length} waiting</span>
          </div>
          <p className="text-xs text-muted" style={{ margin: '0 0 12px' }}>
            Approve, or drag a booking onto its employee&apos;s row to set the exact dates.
          </p>
          {pendingRequests.length === 0 ? (
            <NoData />
          ) : (
            <div className="flex flex-col" style={{ gap: '10px' }}>
              {pendingRequests.map(h => (
                <div
                  key={h.id}
                  draggable={decliningId !== h.id && reviewingId !== h.id}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', h.id);
                    setDragId(h.id);
                    // Open the months the employee asked for so the drop target is visible.
                    const s = new Date(h.start_date + 'T00:00:00');
                    setMonthAnchor(startOfMonth(s));
                  }}
                  onDragEnd={() => { setDragId(null); setDrop(null); }}
                  style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', cursor: 'grab', opacity: dragId === h.id ? 0.5 : 1 }}
                >
                  <div className="flex align-start" style={{ gap: '8px' }}>
                    <GripVertical size={15} style={{ color: 'var(--charcoal-light)', marginTop: '2px', flexShrink: 0 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p className="font-semibold text-primary m-0" style={{ fontSize: '12.5px' }}>{h.driver_name ?? 'Employee'}</p>
                      <p className="font-mono text-xs m-0" style={{ color: 'var(--charcoal)', fontWeight: 700 }}>
                        {range(h)} · {plural(dayCount(h.start_date, h.end_date))}
                      </p>
                      <p className="text-xs text-secondary m-0 mt-4">{LEAVE_LABEL[h.leave_type] ?? 'Leave'}{h.note ? ` — ${h.note}` : ''}</p>
                      <div className="mt-8">{reviewButtons(h)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      )}

      {isAddOpen && (
        <div
          className="modal-overlay"
          style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}
          onClick={() => setIsAddOpen(false)}
        >
          <div
            className="modal-content glass-panel"
            style={{ width: '420px', maxWidth: '100%', padding: '24px', borderRadius: '16px', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex align-center justify-between mb-16">
              <h3 className="text-md font-bold text-primary m-0">Add Holiday</h3>
              <button type="button" onClick={() => setIsAddOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--charcoal-light)' }}>
                <X size={18} />
              </button>
            </div>

            <div className="input-group mb-16">
              <span className="input-label">EMPLOYEE</span>
              <select className="select-field" style={{ width: '100%' }} value={formDriverId} onChange={(e) => setFormDriverId(e.target.value)}>
                <option value="">Select an employee…</option>
                {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-16 mb-16">
              <div className="input-group">
                <span className="input-label">START DATE</span>
                <input type="date" className="input-field" style={{ width: '100%' }} value={formStart} onChange={(e) => setFormStart(e.target.value)} />
              </div>
              <div className="input-group">
                <span className="input-label">END DATE</span>
                <input type="date" className="input-field" style={{ width: '100%' }} value={formEnd} onChange={(e) => setFormEnd(e.target.value)} />
              </div>
            </div>

            <div className="input-group mb-16">
              <span className="input-label">LEAVE TYPE</span>
              <select className="select-field" style={{ width: '100%' }} value={formLeaveType} onChange={(e) => setFormLeaveType(e.target.value)}>
                <option value="annual">Annual leave</option>
                <option value="other">Other leave</option>
              </select>
            </div>

            <div className="input-group mb-16">
              <span className="input-label">NOTE (OPTIONAL)</span>
              <input type="text" className="input-field" style={{ width: '100%' }} placeholder="e.g. Annual leave" value={formNote} onChange={(e) => setFormNote(e.target.value)} />
            </div>

            {formError && <div className="text-error text-sm font-semibold mb-16">{formError}</div>}

            <div className="flex gap-8 justify-end" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setIsAddOpen(false)}>Cancel</button>
              <button type="button" className="btn" disabled={isSaving} style={{ backgroundColor: 'var(--brand-red)', color: '#fff', borderColor: 'var(--brand-red)' }} onClick={handleSave}>
                {isSaving ? 'Saving…' : 'Save Holiday'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
