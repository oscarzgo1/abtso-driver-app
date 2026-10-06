import { useEffect, useMemo, useState } from 'react';
import { X, ShieldCheck, Camera, CalendarClock } from 'lucide-react';
import { supabase, isMockMode } from '../App';
import SignaturePad from './SignaturePad';
import { EarningsDateRangePicker } from './ui/earnings-date-range-picker';
import { fullWhen } from '../lib/authorization';
import { IconFor, useInspectionTypes } from '../lib/inspection-types';

// ============================================================
// Authorise a unit/trailer for road use — a pop-up showing the unit's
// current state, asking WHEN the fix was made (automatic = now, or a
// date/time the department sets), a new expiry for anything that had
// lapsed (e.g. a Roller Brake Test), and the full name and drawn signature
// of the person authorising it. Confirming calls change_unit_status
// (migrations 097/099): renewals are applied, open critical defects are
// closed, the unit is cleared, and one signed entry is written to the
// permanent Authorization History. Date and time of the fix are stored with
// it; the moment of signing is always the server's.
// ============================================================

export interface AuthorizeDefect {
  id: string;
  categoryLabel: string;
  created_at: string;
  driver_name?: string;
  note: string | null;
  photoCount: number;
}

interface LapsedRow { id: string; type: string; due: string }

const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const toYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export default function AuthorizeUnitModal({ organizationId, vehicleId, registration, defects, onClose, onDone }: {
  organizationId: string | null;
  vehicleId: string;
  registration: string;
  defects: AuthorizeDefect[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { types } = useInspectionTypes(organizationId);
  const [reason, setReason] = useState('');
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [svg, setSvg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => new Date());

  const [fixMode, setFixMode] = useState<'auto' | 'manual'>('auto');
  const [fixLocal, setFixLocal] = useState(() => toLocalInput(new Date()));

  const [lapsed, setLapsed] = useState<LapsedRow[]>([]);
  const [renewals, setRenewals] = useState<Record<string, { from: string; to: string }>>({});

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Inspections of this unit that have already run out.
  useEffect(() => {
    if (isMockMode || !supabase || !organizationId) return;
    let cancelled = false;
    supabase
      .from('vehicles')
      .select('id, vehicle_number, vehicle_type, inspection_type, inspection_due_date, is_active')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const today = toYmd(new Date());
        const target = (data as any[]).find(r => r.id === vehicleId);
        const reg = (target?.vehicle_number ?? registration).trim().toUpperCase();
        setLapsed((data as any[])
          .filter(r => r.vehicle_number.trim().toUpperCase() === reg && r.vehicle_type === target?.vehicle_type && r.inspection_due_date && r.inspection_due_date < today)
          .map(r => ({ id: r.id, type: r.inspection_type, due: r.inspection_due_date })));
      });
    return () => { cancelled = true; };
  }, [organizationId, vehicleId, registration]);

  const fixedAt = useMemo(() => (fixMode === 'auto' ? now : new Date(fixLocal)), [fixMode, fixLocal, now]);
  const fixValid = fixMode === 'auto' || (!Number.isNaN(fixedAt.getTime()) && fixedAt.getTime() <= Date.now() + 60_000);
  const renewalsComplete = lapsed.every(l => renewals[l.id]?.to);
  const canSubmit = !saving && fixValid && renewalsComplete && reason.trim().length >= 3 && first.trim() && last.trim() && svg;

  const submit = async () => {
    if (isMockMode || !supabase || !svg) return;
    setSaving(true);
    setError('');
    const fixDay = toYmd(fixedAt);
    const { error: err } = await supabase.rpc('change_unit_status', {
      p_vehicle_id: vehicleId, p_action: 'return_to_service', p_reason: reason.trim(),
      p_first_name: first.trim(), p_last_name: last.trim(), p_signature_svg: svg,
      p_fixed_at: fixMode === 'manual' ? fixedAt.toISOString() : null,
      p_renewals: lapsed.map(l => ({ vehicle_id: l.id, start: renewals[l.id]?.from || fixDay, due: renewals[l.id]?.to })),
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    onDone();
  };

  const label = (t: string) => <span className="input-label">{t}</span>;
  const typeLabel = (k: string) => types.find(t => t.key === k)?.label ?? k;
  const typeIcon = (k: string) => types.find(t => t.key === k)?.icon ?? 'calendar-check';
  const sectionTitle = (t: string) => <p className="text-xs font-bold text-muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 6px' }}>{t}</p>;

  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} onClick={saving ? undefined : onClose}>
      <div className="modal-content glass-panel" style={{ width: '640px', maxWidth: '100%', padding: '22px', borderRadius: '16px', background: 'var(--card-bg)', border: '1px solid var(--border-color)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex align-center justify-between" style={{ marginBottom: '14px', gap: '10px' }}>
          <h3 className="text-md font-bold text-primary m-0 flex align-center" style={{ gap: '8px', minWidth: 0 }}>
            <ShieldCheck size={18} style={{ flexShrink: 0 }} /> Authorise for road use
          </h3>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--charcoal-light)', display: 'flex', flexShrink: 0 }}><X size={18} /></button>
        </div>

        {error && <div className="login-notice login-notice--error" style={{ marginBottom: '12px' }}>{error}</div>}

        {/* Current data */}
        <div style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px', background: 'var(--card-bg-hover)', marginBottom: '14px' }}>
          <div className="flex align-center justify-between" style={{ gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
            <span className="font-mono font-bold text-primary" style={{ fontSize: '15px', letterSpacing: '0.03em' }}>{registration}</span>
            <span className="badge badge-danger">Currently off the road</span>
          </div>
          {sectionTitle(`Open critical defects (${defects.length})`)}
          {defects.length === 0 ? (
            <p className="text-xs text-muted m-0">No open critical defects are recorded — it is being held for another reason.</p>
          ) : (
            <div className="flex flex-col" style={{ gap: '8px', maxHeight: '150px', overflowY: 'auto' }}>
              {defects.map(d => (
                <div key={d.id} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 10px', background: 'var(--card-bg)', minWidth: 0 }}>
                  <div className="flex align-center justify-between" style={{ gap: '8px', flexWrap: 'wrap' }}>
                    <span className="font-bold text-primary text-sm">{d.categoryLabel}</span>
                    <span className="font-mono text-xs text-muted">{fullWhen(d.created_at)}</span>
                  </div>
                  <p className="text-xs m-0 mt-4" style={{ overflowWrap: 'anywhere' }}>
                    Reported by <strong>{d.driver_name ?? 'unknown'}</strong>
                    {d.photoCount > 0 && <span className="text-muted"> · <Camera size={11} style={{ verticalAlign: '-1px' }} /> {d.photoCount} photo{d.photoCount === 1 ? '' : 's'}</span>}
                  </p>
                  {d.note && <p className="text-xs text-secondary m-0 mt-4" style={{ overflowWrap: 'anywhere' }}>“{d.note}”</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* When the fix was made */}
        <div style={{ marginBottom: '14px' }}>
          {sectionTitle('When the fix was made')}
          <div className="flex" style={{ gap: '8px', flexWrap: 'wrap' }}>
            {([['auto', 'Automatic — now'], ['manual', 'Set date & time']] as const).map(([m, l]) => (
              <button
                key={m}
                type="button"
                onClick={() => setFixMode(m)}
                disabled={saving}
                className="flex align-center"
                style={{ gap: '6px', padding: '8px 12px', borderRadius: '8px', fontWeight: 700, fontSize: '12px', cursor: 'pointer', border: `1.5px solid ${fixMode === m ? 'var(--charcoal)' : 'var(--border-color)'}`, background: fixMode === m ? 'var(--card-bg-hover)' : 'var(--card-bg)', color: 'var(--charcoal)', fontFamily: 'inherit' }}
              >
                <CalendarClock size={13} /> {l}
              </button>
            ))}
          </div>
          {fixMode === 'auto' ? (
            <p className="text-xs text-muted" style={{ margin: '8px 0 0' }}>Recorded as <strong className="font-mono text-primary">{fullWhen(now.toISOString())}</strong>.</p>
          ) : (
            <div style={{ marginTop: '8px' }}>
              <input
                type="datetime-local"
                className="input-field"
                value={fixLocal}
                max={toLocalInput(new Date())}
                disabled={saving}
                onChange={(e) => setFixLocal(e.target.value)}
                style={{ width: '100%', maxWidth: '260px', boxSizing: 'border-box' }}
              />
              {!fixValid && <p className="text-xs" style={{ margin: '6px 0 0', color: 'var(--brand-red)', fontWeight: 700 }}>Choose a date and time that is not in the future.</p>}
            </div>
          )}
        </div>

        {/* New expiry for what had lapsed */}
        {lapsed.length > 0 && (
          <div style={{ marginBottom: '14px' }}>
            {sectionTitle('Set a new expiry for what has lapsed')}
            <div className="flex flex-col" style={{ gap: '8px' }}>
              {lapsed.map(l => (
                <div key={l.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.3fr)', gap: '10px', alignItems: 'center', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px', background: 'var(--card-bg)' }}>
                  <div style={{ minWidth: 0 }}>
                    <span className="flex align-center font-bold text-primary text-sm" style={{ gap: '6px' }}><IconFor name={typeIcon(l.type)} size={14} /> {typeLabel(l.type)}</span>
                    <span className="text-xs" style={{ color: 'var(--brand-red)', fontWeight: 700 }}>expired {new Date(`${l.due}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <EarningsDateRangePicker
                      startDate={renewals[l.id]?.from ?? toYmd(fixedAt)}
                      endDate={renewals[l.id]?.to ?? ''}
                      onChange={(from, to) => setRenewals(r => ({ ...r, [l.id]: { from, to } }))}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted" style={{ margin: '6px 0 0' }}>Pick the start and the new expiry date. These are saved on the unit and recorded in the history.</p>
          </div>
        )}

        <div className="input-group" style={{ margin: '0 0 12px' }}>
          {label('WHAT WAS DONE — WHY IT IS SAFE')}
          <textarea className="input-field" rows={3} maxLength={1000} disabled={saving} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Brake pads replaced and road-tested by the workshop" style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px', marginBottom: '12px' }}>
          <div className="input-group" style={{ margin: 0, minWidth: 0 }}>
            {label('FIRST NAME')}
            <input className="input-field" maxLength={60} disabled={saving} value={first} onChange={(e) => setFirst(e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} />
          </div>
          <div className="input-group" style={{ margin: 0, minWidth: 0 }}>
            {label('LAST NAME')}
            <input className="input-field" maxLength={60} disabled={saving} value={last} onChange={(e) => setLast(e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} />
          </div>
        </div>

        {label('SIGNATURE OF THE PERSON AUTHORISING')}
        <SignaturePad onChange={setSvg} disabled={saving} />

        <p className="text-xs text-muted" style={{ margin: '12px 0 0' }}>
          The moment of signing is set by the server when you confirm. This entry is permanent and cannot be edited or removed.
        </p>

        <div className="flex justify-end" style={{ gap: '8px', marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="btn" disabled={!canSubmit} onClick={submit} style={{ backgroundColor: 'var(--charcoal)', color: '#fff', borderColor: 'var(--charcoal)', opacity: canSubmit ? 1 : 0.5 }}>
            {saving ? 'Recording…' : 'Sign & authorise for road use'}
          </button>
        </div>
      </div>
    </div>
  );
}
