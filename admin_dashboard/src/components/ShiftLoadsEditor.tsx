import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { supabase, isMockMode } from '../App';

// Every load a shift carried (migration 063's shift_loads): the office
// rates each one, and records the booked delivery time so punctuality can
// be measured. The shift's own revenue figure is the trigger-maintained
// sum once every load is rated.

export interface ShiftLoad {
  id: string;
  load_reference: string | null;
  carrier_name: string | null;
  revenue_amount: number | null;
  booked_departure_at: string | null;
  booked_delivery_at: string | null;
  delivered_at: string | null;
  delivery_paperwork_path: string | null;
  delivery_evidence_path: string | null;
  created_at: string;
}

const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

interface Draft { ref: string; carrier: string; rate: string; departure: string; arrival: string }

export default function ShiftLoadsEditor({ shiftId, loads, onChanged }: { shiftId: string; loads: ShiftLoad[]; onChanged: () => void }) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => Object.fromEntries(loads.map(l => [l.id, {
    ref: l.load_reference ?? '', carrier: l.carrier_name ?? '',
    rate: l.revenue_amount === null ? '' : String(l.revenue_amount),
    departure: toLocalInput(l.booked_departure_at), arrival: toLocalInput(l.booked_delivery_at),
  }])));
  const [newLoad, setNewLoad] = useState<Draft>({ ref: '', carrier: '', rate: '', departure: '', arrival: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const parseRate = (v: string): number | null | undefined => {
    if (!v.trim()) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : undefined;
  };

  const row = (d: Draft) => {
    const rate = parseRate(d.rate);
    if (rate === undefined) return null;
    return {
      load_reference: d.ref.trim() || null,
      carrier_name: d.carrier.trim() || null,
      revenue_amount: rate,
      booked_departure_at: d.departure ? new Date(d.departure).toISOString() : null,
      booked_delivery_at: d.arrival ? new Date(d.arrival).toISOString() : null,
    };
  };

  const save = async (id: string) => {
    if (isMockMode || !supabase) return;
    const data = row(drafts[id]);
    if (!data) return setError('Enter the rate as a number, or leave it blank.');
    setError('');
    setBusy(id);
    const { error: dbError } = await supabase.from('shift_loads').update(data).eq('id', id);
    setBusy(null);
    if (dbError) return setError(dbError.message);
    onChanged();
  };

  const add = async () => {
    if (isMockMode || !supabase) return;
    const data = row(newLoad);
    if (!data) return setError('Enter the rate as a number, or leave it blank.');
    if (!data.load_reference && data.revenue_amount === null) return setError('Enter a load reference or a rate.');
    setError('');
    setBusy('new');
    const { error: dbError } = await supabase.from('shift_loads').insert({ shift_id: shiftId, ...data });
    setBusy(null);
    if (dbError) return setError(dbError.message);
    setNewLoad({ ref: '', carrier: '', rate: '', departure: '', arrival: '' });
    onChanged();
  };

  const remove = async (id: string) => {
    if (isMockMode || !supabase) return;
    setBusy(id);
    const { error: dbError } = await supabase.from('shift_loads').delete().eq('id', id);
    setBusy(null);
    if (dbError) return setError(dbError.message);
    onChanged();
  };

  const fields = (d: Draft, set: (patch: Partial<Draft>) => void, disabled: boolean) => (
    <div className="grid grid-cols-2" style={{ gap: '6px' }}>
      <input className="input-field" style={{ padding: '6px 8px', fontSize: '12px' }} placeholder="Load ref" value={d.ref} disabled={disabled} onChange={e => set({ ref: e.target.value })} />
      <input className="input-field" style={{ padding: '6px 8px', fontSize: '12px' }} placeholder="Customer" value={d.carrier} disabled={disabled} onChange={e => set({ carrier: e.target.value })} />
      <input className="input-field font-mono" inputMode="decimal" style={{ padding: '6px 8px', fontSize: '12px' }} placeholder="Rate £ (blank = pending)" value={d.rate} disabled={disabled} onChange={e => set({ rate: e.target.value })} />
      <span />
      <label className="text-xs text-muted" style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        Booked departure
        <input type="datetime-local" className="input-field" style={{ padding: '6px 8px', fontSize: '12px' }} value={d.departure} disabled={disabled} onChange={e => set({ departure: e.target.value })} />
      </label>
      <label className="text-xs text-muted" style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        Booked arrival
        <input type="datetime-local" className="input-field" style={{ padding: '6px 8px', fontSize: '12px' }} value={d.arrival} disabled={disabled} onChange={e => set({ arrival: e.target.value })} />
      </label>
    </div>
  );

  return (
    <div className="flex flex-col" style={{ gap: '10px', maxHeight: '420px', overflowY: 'auto' }}>
      <p className="text-xs font-bold text-muted uppercase m-0" style={{ letterSpacing: '0.06em' }}>Loads on this shift ({loads.length})</p>
      {error && <p className="text-xs m-0" style={{ color: 'var(--brand-red)', fontWeight: 700 }}>{error}</p>}
      {loads.map((l, i) => {
        const d = drafts[l.id] ?? { ref: '', carrier: '', rate: '', booked: '' };
        const late = l.booked_delivery_at && l.delivered_at && new Date(l.delivered_at) > new Date(l.booked_delivery_at);
        return (
          <div key={l.id} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px' }}>
            <div className="flex items-center justify-between" style={{ marginBottom: '6px' }}>
              <span className="text-xs font-bold text-primary">Load {i + 1}</span>
              <span className="text-xs" style={{ color: late ? 'var(--brand-red)' : 'var(--charcoal-light)', fontWeight: late ? 700 : 400 }}>
                {l.delivered_at
                  ? `Delivered ${new Date(l.delivered_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}${late ? ' · LATE' : ''}`
                  : 'Not delivered yet'}
              </span>
            </div>
            {fields(d, patch => setDrafts(prev => ({ ...prev, [l.id]: { ...d, ...patch } })), busy === l.id)}
            <div className="flex items-center" style={{ gap: '6px', marginTop: '6px' }}>
              <button type="button" onClick={() => save(l.id)} disabled={busy === l.id} className="font-bold" style={{ flex: 1, padding: '6px', borderRadius: '6px', border: 'none', background: 'var(--brand-red)', color: '#fff', cursor: 'pointer', fontSize: '11px' }}>
                {busy === l.id ? 'Saving…' : 'Save load'}
              </button>
              <button type="button" onClick={() => remove(l.id)} disabled={busy === l.id} title="Remove load" style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', cursor: 'pointer', color: 'var(--charcoal-light)' }}>
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        );
      })}
      <div style={{ borderTop: '1px dashed var(--border-color)', paddingTop: '8px' }}>
        <p className="text-xs font-bold text-secondary m-0" style={{ marginBottom: '6px' }}>Add a load</p>
        {fields(newLoad, patch => setNewLoad(prev => ({ ...prev, ...patch })), busy === 'new')}
        <button type="button" onClick={add} disabled={busy === 'new'} className="flex items-center justify-center font-bold" style={{ gap: '4px', width: '100%', marginTop: '6px', padding: '6px', borderRadius: '6px', border: '1px solid var(--charcoal)', background: 'var(--card-bg)', color: 'var(--charcoal)', cursor: 'pointer', fontSize: '11px' }}>
          <Plus size={12} /> {busy === 'new' ? 'Adding…' : 'Add load'}
        </button>
      </div>
    </div>
  );
}
