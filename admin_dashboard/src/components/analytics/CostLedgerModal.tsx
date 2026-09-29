import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { supabase, isMockMode } from '../../App';
import { COST_CATEGORY_LABEL, type AnalyticsSettings, type CostCategory, type CostFrequency, type OrgCost } from '../../lib/true-cost';

// Costs & targets (migration 062): the fixed/recurring costs that turn
// "gross" into true profit, plus employer on-costs and the targets
// Analytics measures against. Amounts are entered ex-VAT.

interface CostLedgerModalProps {
  costs: OrgCost[];
  settings: AnalyticsSettings;
  onClose: () => void;
  onChanged: () => void;
}

const FREQ_LABEL: Record<CostFrequency, string> = { monthly: 'per month', annual: 'per year', one_off: 'one-off' };
const today = () => new Date().toISOString().slice(0, 10);
const blank = () => ({
  id: '', category: 'vehicle_finance' as CostCategory, label: '', amount: '', vat_applicable: true,
  frequency: 'monthly' as CostFrequency, vehicle_id: '', start_date: today(), end_date: '', status: 'approved' as 'approved' | 'pending', note: '',
});

export default function CostLedgerModal({ costs, settings, onClose, onChanged }: CostLedgerModalProps) {
  const [vehicles, setVehicles] = useState<{ id: string; vehicle_number: string }[]>([]);
  const [form, setForm] = useState(blank());
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [targets, setTargets] = useState({
    oncost: String(settings.employer_oncost_percent ?? 0),
    margin: String(settings.target_margin_percent ?? 35),
    revTruckDay: settings.target_revenue_per_truck_day === null ? '' : String(settings.target_revenue_per_truck_day),
    weeklyProfit: settings.target_weekly_profit === null ? '' : String(settings.target_weekly_profit),
  });
  const [targetsSaved, setTargetsSaved] = useState(false);

  useEffect(() => {
    if (isMockMode || !supabase) return;
    supabase.from('vehicles').select('id, vehicle_number').eq('is_active', true).order('vehicle_number')
      .then(({ data }) => setVehicles((data ?? []) as { id: string; vehicle_number: string }[]));
  }, []);

  const vehicleName = (id: string | null) => vehicles.find(v => v.id === id)?.vehicle_number?.toUpperCase();
  const set = (patch: Partial<ReturnType<typeof blank>>) => setForm(f => ({ ...f, ...patch }));

  const saveCost = async () => {
    if (isMockMode || !supabase) return;
    setError('');
    const amount = Number(form.amount);
    if (!form.label.trim()) return setError('Give the cost a name, e.g. "DAF XF lease".');
    if (!Number.isFinite(amount) || amount < 0) return setError('Enter the amount in pounds.');
    if (form.end_date && form.end_date < form.start_date) return setError('The end date must be after the start date.');
    setBusy(true);
    const row = {
      category: form.category, label: form.label.trim(), amount, vat_applicable: form.vat_applicable,
      frequency: form.frequency, vehicle_id: form.vehicle_id || null, start_date: form.start_date,
      end_date: form.end_date || null, status: form.status, note: form.note.trim() || null,
    };
    const { error: dbError } = editing
      ? await supabase.from('org_costs').update(row).eq('id', form.id)
      : await supabase.from('org_costs').insert(row);
    setBusy(false);
    if (dbError) return setError(dbError.message);
    setForm(blank());
    setEditing(false);
    onChanged();
  };

  const removeCost = async (id: string) => {
    if (isMockMode || !supabase) return;
    const { error: dbError } = await supabase.from('org_costs').delete().eq('id', id);
    if (dbError) setError(dbError.message);
    else onChanged();
  };

  const saveTargets = async () => {
    if (isMockMode || !supabase) return;
    setError('');
    const num = (v: string) => (v.trim() === '' ? null : Number(v));
    const payload = {
      employer_oncost_percent: Number(targets.oncost) || 0,
      target_margin_percent: Number(targets.margin) || 0,
      target_revenue_per_truck_day: num(targets.revTruckDay),
      target_weekly_profit: num(targets.weeklyProfit),
      updated_at: new Date().toISOString(),
    };
    const { error: dbError } = await supabase.from('org_analytics_settings').upsert(payload);
    if (dbError) return setError(dbError.message);
    setTargetsSaved(true);
    setTimeout(() => setTargetsSaved(false), 1500);
    onChanged();
  };

  const monthlyEquivalent = costs
    .filter(c => c.status === 'approved' && c.frequency !== 'one_off' && (!c.end_date || c.end_date >= today()))
    .reduce((sum, c) => sum + (c.frequency === 'monthly' ? Number(c.amount) : Number(c.amount) / 12), 0);

  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '40px 16px', overflowY: 'auto' }} onClick={onClose}>
      <div className="modal-content glass-panel" style={{ width: '860px', maxWidth: '100%', padding: '24px', borderRadius: '16px', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-16">
          <div>
            <h3 className="text-md font-bold text-primary m-0">Costs &amp; targets</h3>
            <p className="text-xs text-muted m-0 mt-4">Everything the business pays beyond wages and fuel. Recurring costs are spread per day across whatever period Analytics shows.</p>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--charcoal-light)' }}><X size={18} /></button>
        </div>

        {error && <div className="login-notice login-notice--error mb-16">{error}</div>}

        {/* Targets + on-costs */}
        <div className="glass-card mb-16" style={{ padding: '14px 16px' }}>
          <p className="text-xs font-bold text-muted uppercase m-0 mb-12" style={{ letterSpacing: '0.08em' }}>On-costs &amp; targets</p>
          <div className="grid grid-cols-2 lg:grid-cols-4" style={{ gap: '12px' }}>
            {([
              ['oncost', 'Employer NI & pension (% of wages)', '13.8'],
              ['margin', 'Target margin %', '35'],
              ['revTruckDay', 'Target revenue / truck / day (£)', 'e.g. 650'],
              ['weeklyProfit', 'Target profit per week (£)', 'e.g. 3000'],
            ] as const).map(([key, label, ph]) => (
              <div key={key} className="input-group">
                <span className="input-label">{label.toUpperCase()}</span>
                <input type="number" className="input-field" style={{ width: '100%' }} placeholder={ph} value={targets[key]} onChange={e => setTargets(t => ({ ...t, [key]: e.target.value }))} />
              </div>
            ))}
          </div>
          <div className="flex items-center mt-8" style={{ gap: '10px' }}>
            <button type="button" className="btn btn-secondary" style={{ padding: '7px 14px', fontSize: '12px' }} onClick={saveTargets}>Save targets</button>
            {targetsSaved && <span className="text-xs text-muted">Saved</span>}
          </div>
        </div>

        {/* Add / edit cost */}
        <div className="glass-card mb-16" style={{ padding: '14px 16px' }}>
          <p className="text-xs font-bold text-muted uppercase m-0 mb-12" style={{ letterSpacing: '0.08em' }}>{editing ? 'Edit cost' : 'Add a cost'}</p>
          <div className="grid grid-cols-2 lg:grid-cols-4" style={{ gap: '12px' }}>
            <div className="input-group">
              <span className="input-label">CATEGORY</span>
              <select className="select-field" style={{ width: '100%' }} value={form.category} onChange={e => set({ category: e.target.value as CostCategory })}>
                {(Object.keys(COST_CATEGORY_LABEL) as CostCategory[]).map(c => <option key={c} value={c}>{COST_CATEGORY_LABEL[c]}</option>)}
              </select>
            </div>
            <div className="input-group">
              <span className="input-label">NAME</span>
              <input className="input-field" style={{ width: '100%' }} placeholder="e.g. DAF XF lease" value={form.label} onChange={e => set({ label: e.target.value })} />
            </div>
            <div className="input-group">
              <span className="input-label">AMOUNT £ (EX VAT)</span>
              <input type="number" min="0" step="0.01" className="input-field" style={{ width: '100%' }} value={form.amount} onChange={e => set({ amount: e.target.value })} />
            </div>
            <div className="input-group">
              <span className="input-label">HOW OFTEN</span>
              <select className="select-field" style={{ width: '100%' }} value={form.frequency} onChange={e => set({ frequency: e.target.value as CostFrequency })}>
                <option value="monthly">Monthly</option>
                <option value="annual">Annually</option>
                <option value="one_off">One-off</option>
              </select>
            </div>
            <div className="input-group">
              <span className="input-label">VEHICLE (OPTIONAL)</span>
              <select className="select-field" style={{ width: '100%' }} value={form.vehicle_id} onChange={e => set({ vehicle_id: e.target.value })}>
                <option value="">Whole company</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{v.vehicle_number.toUpperCase()}</option>)}
              </select>
            </div>
            <div className="input-group">
              <span className="input-label">{form.frequency === 'one_off' ? 'DATE' : 'FROM'}</span>
              <input type="date" className="input-field" style={{ width: '100%' }} value={form.start_date} onChange={e => set({ start_date: e.target.value })} />
            </div>
            {form.frequency !== 'one_off' && (
              <div className="input-group">
                <span className="input-label">UNTIL (OPTIONAL)</span>
                <input type="date" className="input-field" style={{ width: '100%' }} value={form.end_date} onChange={e => set({ end_date: e.target.value })} />
              </div>
            )}
            <div className="input-group">
              <span className="input-label">STATUS</span>
              <select className="select-field" style={{ width: '100%' }} value={form.status} onChange={e => set({ status: e.target.value as 'approved' | 'pending' })}>
                <option value="approved">Confirmed</option>
                <option value="pending">Pending (shown separately)</option>
              </select>
            </div>
          </div>
          <label className="flex items-center text-xs text-secondary mt-8" style={{ gap: '6px', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.vat_applicable} onChange={e => set({ vat_applicable: e.target.checked })} /> VAT is charged on this cost
          </label>
          <div className="flex items-center mt-12" style={{ gap: '8px' }}>
            <button type="button" className="btn flex items-center" disabled={busy} onClick={saveCost} style={{ gap: '6px', padding: '8px 14px', fontSize: '12.5px', fontWeight: 800, backgroundColor: 'var(--brand-red)', color: '#fff', borderColor: 'var(--brand-red)' }}>
              <Plus size={14} /> {busy ? 'Saving…' : editing ? 'Save changes' : 'Add cost'}
            </button>
            {editing && <button type="button" className="btn btn-secondary" style={{ padding: '8px 14px', fontSize: '12.5px' }} onClick={() => { setForm(blank()); setEditing(false); }}>Cancel</button>}
          </div>
        </div>

        {/* Ledger */}
        <div className="flex items-center justify-between mb-8">
          <p className="text-xs font-bold text-muted uppercase m-0" style={{ letterSpacing: '0.08em' }}>Cost ledger ({costs.length})</p>
          <span className="text-xs text-secondary">Running costs ≈ <strong className="text-primary">£{monthlyEquivalent.toLocaleString('en-GB', { maximumFractionDigits: 0 })}</strong> / month ex VAT</span>
        </div>
        {costs.length === 0 ? (
          <p className="text-xs text-muted">No costs yet. Start with the big ones: vehicle finance, insurance and trailer hire.</p>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead><tr><th>Cost</th><th>Category</th><th>Vehicle</th><th>Amount</th><th>Dates</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {costs.map(c => (
                  <tr key={c.id}>
                    <td className="font-bold text-primary">{c.label}</td>
                    <td className="text-xs text-secondary">{COST_CATEGORY_LABEL[c.category]}</td>
                    <td className="font-mono text-xs">{vehicleName(c.vehicle_id) ?? '—'}</td>
                    <td className="tabular-nums text-xs">£{Number(c.amount).toLocaleString('en-GB', { minimumFractionDigits: 2 })} {FREQ_LABEL[c.frequency]}{c.vat_applicable ? ' + VAT' : ''}</td>
                    <td className="text-xs text-secondary whitespace-nowrap">{c.start_date}{c.frequency !== 'one_off' ? ` → ${c.end_date ?? 'ongoing'}` : ''}</td>
                    <td><span className={`badge ${c.status === 'pending' ? 'badge-warning' : 'badge-success'}`}>{c.status === 'pending' ? 'Pending' : 'Confirmed'}</span></td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <button type="button" title="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--charcoal-light)' }} onClick={() => {
                        setEditing(true);
                        setForm({
                          id: c.id, category: c.category, label: c.label, amount: String(c.amount), vat_applicable: c.vat_applicable,
                          frequency: c.frequency, vehicle_id: c.vehicle_id ?? '', start_date: c.start_date, end_date: c.end_date ?? '', status: c.status, note: c.note ?? '',
                        });
                      }}><Pencil size={13} /></button>
                      <button type="button" title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--charcoal-light)' }} onClick={() => removeCost(c.id)}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
