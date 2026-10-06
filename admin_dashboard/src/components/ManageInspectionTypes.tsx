import { useState } from 'react';
import { X, Lock, Plus, Trash2 } from 'lucide-react';
import { supabase, isMockMode } from '../App';
import { ICONS, IconFor, STANDARD_TYPES, slugify } from '../lib/inspection-types';

// Add, rename or remove the company's own inspection types. The standard
// ones (MOT, PMI, tacho, brake test, LOLER, road tax, insurance) are fixed.
// A type that is still on a unit can't be removed.

interface Custom { id: string; key: string; label: string; icon: string }

export default function ManageInspectionTypes({ organizationId, custom, onClose, onChanged }: {
  organizationId: string | null;
  custom: Custom[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [label, setLabel] = useState('');
  const [icon, setIcon] = useState('calendar-check');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const add = async () => {
    if (isMockMode || !supabase || !organizationId) return;
    const name = label.trim();
    const key = slugify(name);
    if (!name || !key) { setError('Give the inspection a name.'); return; }
    if (STANDARD_TYPES.some(t => t.key === key) || custom.some(c => c.key === key)) { setError('That inspection already exists.'); return; }
    setBusy(true); setError('');
    const { error: err } = await supabase.from('inspection_types').insert({ organization_id: organizationId, key, label: name, icon });
    setBusy(false);
    if (err) { setError(err.message); return; }
    setLabel(''); setIcon('calendar-check');
    onChanged();
  };

  const rename = async (c: Custom, next: string) => {
    if (isMockMode || !supabase || !next.trim() || next.trim() === c.label) return;
    const { error: err } = await supabase.from('inspection_types').update({ label: next.trim() }).eq('id', c.id);
    if (err) setError(err.message); else onChanged();
  };

  const changeIcon = async (c: Custom, next: string) => {
    if (isMockMode || !supabase) return;
    const { error: err } = await supabase.from('inspection_types').update({ icon: next }).eq('id', c.id);
    if (err) setError(err.message); else onChanged();
  };

  const remove = async (c: Custom) => {
    if (isMockMode || !supabase || !organizationId) return;
    setError('');
    const { count } = await supabase.from('vehicles').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('is_active', true).eq('inspection_type', c.key);
    if ((count ?? 0) > 0) { setError(`"${c.label}" is still on ${count} unit${count === 1 ? '' : 's'} — remove it from them first.`); return; }
    if (!window.confirm(`Remove the inspection type "${c.label}"?`)) return;
    const { error: err } = await supabase.from('inspection_types').delete().eq('id', c.id);
    if (err) setError(err.message); else onChanged();
  };

  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 10002, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={onClose}>
      <div className="modal-content glass-panel" style={{ width: '520px', maxWidth: '100%', padding: '22px', borderRadius: '16px', background: 'var(--card-bg)', border: '1px solid var(--border-color)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex align-center justify-between mb-16">
          <h3 className="text-md font-bold text-primary m-0">Inspection types</h3>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--charcoal-light)', display: 'flex' }}><X size={18} /></button>
        </div>
        {error && <div className="login-notice login-notice--error mb-12">{error}</div>}

        <p className="text-xs font-bold text-muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 6px' }}>Standard</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px', marginBottom: '14px' }}>
          {STANDARD_TYPES.map(t => (
            <div key={t.key} className="flex align-center" style={{ gap: '8px', padding: '7px 10px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--card-bg-hover)', minWidth: 0 }}>
              <IconFor name={t.icon} size={14} />
              <span className="text-sm" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</span>
              <Lock size={11} style={{ color: 'var(--charcoal-light)', flexShrink: 0 }} />
            </div>
          ))}
        </div>

        <p className="text-xs font-bold text-muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 6px' }}>Your own</p>
        {custom.length === 0 ? (
          <p className="text-xs text-muted" style={{ margin: '0 0 12px' }}>None yet — add one below, e.g. "Tail-lift test" or "Fire extinguisher".</p>
        ) : (
          <div className="flex flex-col" style={{ gap: '6px', marginBottom: '12px' }}>
            {custom.map(c => (
              <div key={c.id} className="flex align-center" style={{ gap: '8px', padding: '6px 8px', border: '1px solid var(--border-color)', borderRadius: '8px', minWidth: 0 }}>
                <select aria-label="Icon" value={c.icon} onChange={(e) => changeIcon(c, e.target.value)} className="select-field" style={{ width: '58px', padding: '4px', flexShrink: 0 }}>
                  {Object.keys(ICONS).map(k => <option key={k} value={k}>{k}</option>)}
                </select>
                <input className="input-field" defaultValue={c.label} maxLength={40} style={{ flex: 1, minWidth: 0, padding: '5px 8px' }} onBlur={(e) => rename(c, e.target.value)} />
                <button type="button" onClick={() => remove(c)} aria-label={`Remove ${c.label}`} title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--charcoal-light)', display: 'flex', flexShrink: 0 }}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs font-bold text-muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 6px' }}>Add an inspection type</p>
        <div className="flex" style={{ gap: '8px', flexWrap: 'wrap' }}>
          <input className="input-field" placeholder="e.g. Tail-lift test" value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} style={{ flex: '1 1 180px', minWidth: 0 }} />
          <div className="flex align-center" style={{ gap: '4px', flexWrap: 'wrap' }}>
            {Object.keys(ICONS).map(k => (
              <button key={k} type="button" onClick={() => setIcon(k)} aria-label={k} title={k} style={{ width: 30, height: 30, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: `1.5px solid ${icon === k ? 'var(--charcoal)' : 'var(--border-color)'}`, background: icon === k ? 'var(--card-bg-hover)' : 'var(--card-bg)', color: 'var(--charcoal)' }}>
                <IconFor name={k} size={14} />
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-end" style={{ marginTop: '14px', gap: '8px' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Done</button>
          <button type="button" className="btn btn-primary" disabled={busy || !label.trim()} onClick={add}><Plus size={13} /> Add type</button>
        </div>
      </div>
    </div>
  );
}
