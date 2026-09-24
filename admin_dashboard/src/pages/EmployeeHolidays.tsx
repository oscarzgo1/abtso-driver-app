import { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Plus, X, Trash2, CalendarDays } from 'lucide-react';
import { supabase, isMockMode } from '../App';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '../components/ui/empty';

// ============================================================
// Employee Holidays — deliberately minimal per explicit scope: a
// read-only calendar of admin-logged holiday dates (migration 057).
// No request/approval workflow, no entitlement/balance tracking —
// just a driver, a date range, and an optional note. Sits as a
// sub-tab under the Driver Profiles accordion, next to Employee
// Database, same pattern as Compliance & Safety's sub-tabs.
// ============================================================

interface HolidayDriverLite {
  id: string;
  driver_id: string;
  full_name: string;
}

interface HolidayRow {
  id: string;
  driver_id: string;
  driver_name?: string;
  start_date: string;
  end_date: string;
  note: string | null;
}

const DRIVER_COLORS = ['#CC0000', '#2563EB', '#10B981', '#F59E0B', '#8B5CF6', '#0891B2', '#DB2777', '#65A30D'];

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

interface EmployeeHolidaysProps {
  organizationId: string | null;
  onBack?: () => void;
}

export default function EmployeeHolidays({ organizationId, onBack }: EmployeeHolidaysProps) {
  const [drivers, setDrivers] = useState<HolidayDriverLite[]>([]);
  const [holidays, setHolidays] = useState<HolidayRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(new Date()));
  const [isAddOpen, setIsAddOpen] = useState(false);

  const [formDriverId, setFormDriverId] = useState('');
  const [formStart, setFormStart] = useState('');
  const [formEnd, setFormEnd] = useState('');
  const [formNote, setFormNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    if (isMockMode || !supabase || !organizationId) return;
    setIsLoading(true);
    setError('');
    try {
      const [{ data: driverRows, error: drErr }, { data: holidayRows, error: hErr }] = await Promise.all([
        supabase.from('drivers').select('id, driver_id, full_name').eq('organization_id', organizationId).eq('is_active', true).order('full_name'),
        supabase.from('employee_holidays').select('id, driver_id, start_date, end_date, note, drivers(full_name)').eq('organization_id', organizationId).order('start_date', { ascending: false }),
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

  useEffect(() => {
    if (isMockMode || !supabase || !organizationId) return;
    const channel = supabase
      .channel('realtime_employee_holidays')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employee_holidays' }, () => load())
      .subscribe();
    return () => { supabase!.removeChannel(channel); };
  }, [organizationId, load]);

  const colorByDriver = useMemo(() => {
    const map: Record<string, string> = {};
    drivers.forEach((d, i) => { map[d.id] = DRIVER_COLORS[i % DRIVER_COLORS.length]; });
    return map;
  }, [drivers]);

  const weeks = useMemo(() => {
    const firstOfMonth = monthAnchor;
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(gridStart.getDate() - gridStart.getDay());
    const days: Date[] = Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(d.getDate() + i);
      return d;
    });
    const rows: Date[][] = [];
    for (let i = 0; i < 6; i++) rows.push(days.slice(i * 7, i * 7 + 7));
    return rows;
  }, [monthAnchor]);

  const holidaysForDay = useCallback((d: Date) => {
    const k = dateKey(d);
    return holidays.filter(h => h.start_date <= k && h.end_date >= k);
  }, [holidays]);

  const openAddModal = () => {
    setFormDriverId('');
    setFormStart('');
    setFormEnd('');
    setFormNote('');
    setFormError('');
    setIsAddOpen(true);
  };

  const handleSave = async () => {
    if (isMockMode || !supabase || !organizationId) return;
    setFormError('');
    if (!formDriverId) { setFormError('Select a driver.'); return; }
    if (!formStart || !formEnd) { setFormError('Enter a start and end date.'); return; }
    if (formEnd < formStart) { setFormError('End date must be on or after the start date.'); return; }

    setIsSaving(true);
    try {
      const { error: insertError } = await supabase.from('employee_holidays').insert({
        driver_id: formDriverId,
        start_date: formStart,
        end_date: formEnd,
        note: formNote.trim() || null,
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

  const monthLabel = monthAnchor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const today = new Date();
  const upcoming = useMemo(() => {
    const k = dateKey(today);
    return holidays.filter(h => h.end_date >= k).sort((a, b) => a.start_date.localeCompare(b.start_date)).slice(0, 8);
  }, [holidays]);

  return (
    <div className="flex-1">
      <div className="flex align-center justify-between mb-16">
        <div>
          <h2 className="text-xl font-black text-primary m-0">EMPLOYEE HOLIDAYS</h2>
          <p className="text-xs text-muted m-0 mt-4">A logged calendar of who's off and when — no requests, no approvals, just a record.</p>
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
          <button
            type="button"
            onClick={openAddModal}
            className="btn flex align-center"
            style={{ gap: '6px', padding: '10px 16px', fontSize: '13px', fontWeight: 800, backgroundColor: 'var(--brand-red)', color: '#FFFFFF', borderColor: 'var(--brand-red)' }}
          >
            <Plus size={15} /> Add Holiday
          </button>
        </div>
      </div>

      {error && <div className="login-notice login-notice--error mb-16">{error}</div>}

      <div className="grid grid-cols-3 gap-16" style={{ alignItems: 'start' }}>
        <div className="glass-card" style={{ gridColumn: 'span 2', padding: '16px', overflow: 'hidden' }}>
          <div className="flex align-center justify-between mb-16">
            <button type="button" onClick={() => setMonthAnchor(m => addMonths(m, -1))} style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '6px', cursor: 'pointer', color: 'var(--charcoal)' }}>
              <ChevronLeft size={16} />
            </button>
            <span className="font-black text-primary" style={{ fontSize: '15px' }}>{monthLabel}</span>
            <button type="button" onClick={() => setMonthAnchor(m => addMonths(m, 1))} style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '6px', cursor: 'pointer', color: 'var(--charcoal)' }}>
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-7" style={{ gap: '4px', marginBottom: '4px' }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="text-xs font-bold text-muted text-center" style={{ padding: '4px 0' }}>{d}</div>
            ))}
          </div>

          {isLoading ? (
            <p className="text-xs text-muted text-center py-24">Loading…</p>
          ) : (
            weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7" style={{ gap: '4px', marginBottom: '4px' }}>
                {week.map(day => {
                  const inMonth = day.getMonth() === monthAnchor.getMonth();
                  const isToday = dateKey(day) === dateKey(today);
                  const dayHolidays = holidaysForDay(day);
                  return (
                    <div
                      key={dateKey(day)}
                      style={{
                        minHeight: '68px', borderRadius: '8px', padding: '4px',
                        background: isToday ? 'var(--card-bg-hover)' : 'transparent',
                        border: isToday ? '1px solid var(--brand-red)' : '1px solid var(--border-color)',
                        opacity: inMonth ? 1 : 0.35,
                      }}
                    >
                      <span className="font-mono text-xs" style={{ color: 'var(--charcoal-light)' }}>{day.getDate()}</span>
                      <div className="flex flex-col" style={{ gap: '2px', marginTop: '2px' }}>
                        {dayHolidays.slice(0, 3).map(h => (
                          <span
                            key={h.id}
                            title={h.driver_name}
                            style={{
                              fontSize: '9.5px', fontWeight: 700, padding: '1px 4px', borderRadius: '3px',
                              background: `${colorByDriver[h.driver_id] ?? '#888'}22`, color: colorByDriver[h.driver_id] ?? '#888',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}
                          >
                            {h.driver_name ?? 'Driver'}
                          </span>
                        ))}
                        {dayHolidays.length > 3 && (
                          <span className="text-xs text-muted" style={{ fontSize: '9px' }}>+{dayHolidays.length - 3} more</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="glass-card" style={{ padding: '16px' }}>
          <p className="text-xs font-bold text-muted mb-12" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Upcoming &amp; Current</p>
          {upcoming.length === 0 ? (
            <Empty className="py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon"><CalendarDays /></EmptyMedia>
                <EmptyTitle>No Holidays Logged</EmptyTitle>
                <EmptyDescription>Add one to start building the calendar.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col" style={{ gap: '8px' }}>
              {upcoming.map(h => (
                <div key={h.id} className="flex align-center justify-between" style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div style={{ minWidth: 0 }}>
                    <p className="font-semibold text-primary m-0" style={{ fontSize: '12.5px' }}>{h.driver_name ?? 'Driver'}</p>
                    <p className="font-mono text-xs text-muted m-0">
                      {new Date(h.start_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                      {h.end_date !== h.start_date ? ` – ${new Date(h.end_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}` : ''}
                    </p>
                    {h.note && <p className="text-xs text-secondary m-0 mt-4">{h.note}</p>}
                  </div>
                  <button type="button" onClick={() => handleDelete(h.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--charcoal-light)', flexShrink: 0 }} title="Remove">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

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
              <span className="input-label">DRIVER</span>
              <select className="select-field" style={{ width: '100%' }} value={formDriverId} onChange={(e) => setFormDriverId(e.target.value)}>
                <option value="">Select a driver…</option>
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
