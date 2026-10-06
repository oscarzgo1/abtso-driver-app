import { useCallback, useEffect, useState } from 'react';
import { Fuel } from 'lucide-react';
import { supabase, isMockMode } from '../App';

// Settings → Fuel Bonus. Configuration only — this decides WHO would
// qualify (an MPG range, checked against fuel_receipts.calculated_mpg
// from the fuel theft engine, migration 070/071) and HOW MUCH they'd
// get, but the bonus amount itself is always a plain number the admin
// types in here, never a formula this page computes. There is
// deliberately no "who qualified this week" report or payroll credit
// yet — that's a separate step once this configuration layer exists.

interface FuelBonusSettings {
  enabled: boolean;
  min_mpg: number;
  max_mpg: number | null;
  bonus_amount: number;
  period: 'weekly' | 'monthly';
}

const DEFAULTS: FuelBonusSettings = { enabled: false, min_mpg: 8.0, max_mpg: null, bonus_amount: 0, period: 'weekly' };

const describeError = (err: any, fallback: string) => err?.message ?? err?.error_description ?? fallback;

export default function FuelBonusSettings() {
  const [settings, setSettings] = useState<FuelBonusSettings>(DEFAULTS);
  const [form, setForm] = useState({ enabled: false, minMpg: '8.0', maxMpg: '', bonusAmount: '0', period: 'weekly' as 'weekly' | 'monthly' });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    if (isMockMode || !supabase) return;
    setIsLoading(true);
    const { data, error: err } = await supabase.from('org_fuel_bonus_settings').select('*').maybeSingle();
    setIsLoading(false);
    if (err) return setError(describeError(err, 'Could not load fuel bonus settings.'));
    const row = (data as FuelBonusSettings | null) ?? DEFAULTS;
    setSettings(row);
    setForm({
      enabled: row.enabled,
      minMpg: String(row.min_mpg),
      maxMpg: row.max_mpg === null ? '' : String(row.max_mpg),
      bonusAmount: String(row.bonus_amount),
      period: row.period,
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (isMockMode || !supabase) return;
    setError('');
    setSuccess('');

    const minMpg = parseFloat(form.minMpg);
    const maxMpg = form.maxMpg.trim() === '' ? null : parseFloat(form.maxMpg);
    const bonusAmount = parseFloat(form.bonusAmount);

    if (!Number.isFinite(minMpg) || minMpg <= 0) {
      setError('The minimum MPG must be a positive number.');
      return;
    }
    if (maxMpg !== null && (!Number.isFinite(maxMpg) || maxMpg <= minMpg)) {
      setError('The maximum MPG must be greater than the minimum, or left blank for no ceiling.');
      return;
    }
    if (!Number.isFinite(bonusAmount) || bonusAmount < 0) {
      setError('The bonus amount must be zero or a positive number.');
      return;
    }

    setIsSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { error: err } = await supabase.from('org_fuel_bonus_settings').upsert({
        enabled: form.enabled,
        min_mpg: minMpg,
        max_mpg: maxMpg,
        bonus_amount: bonusAmount,
        period: form.period,
        updated_at: new Date().toISOString(),
        updated_by: userData?.user?.email ?? null,
      });
      if (err) {
        setError(describeError(err, 'Could not save fuel bonus settings.'));
        return;
      }
      setSettings({ enabled: form.enabled, min_mpg: minMpg, max_mpg: maxMpg, bonus_amount: bonusAmount, period: form.period });
      setSuccess('Saved.');
      setTimeout(() => setSuccess(''), 1800);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      <div className="settings-panel-header">
        <p>Fuel Bonus</p>
        <p>Reward drivers whose fuel economy lands inside a qualifying range.</p>
      </div>

      <div className="flex align-center justify-between" style={{ padding: '14px 16px', border: '1px solid var(--border-color)', borderRadius: '12px', marginBottom: '16px' }}>
        <div className="flex align-center" style={{ gap: '10px' }}>
          <Fuel size={16} color="var(--brand-red)" />
          <div>
            <p className="font-bold text-sm text-primary" style={{ margin: '0 0 2px' }}>Fuel Efficiency Bonus</p>
            <p className="text-xs text-muted" style={{ margin: 0 }}>
              Off by default. When on, the qualifying range and amount below apply company-wide.
            </p>
          </div>
        </div>
        <label className="flex align-center text-xs font-bold" style={{ gap: '8px', cursor: 'pointer', color: 'var(--charcoal)' }}>
          <span>{form.enabled ? 'On' : 'Off'}</span>
          <input type="checkbox" checked={form.enabled} onChange={(e) => setForm(f => ({ ...f, enabled: e.target.checked }))} />
        </label>
      </div>

      {isLoading && <p className="text-xs text-muted mb-16">Loading…</p>}
      {error && <div className="login-notice login-notice--error mb-16">{error}</div>}
      {success && <div className="login-notice login-notice--success mb-16">{success}</div>}

      <h4 className="font-bold text-xs text-muted mt-8 mb-4" style={{ textTransform: 'uppercase', letterSpacing: '0.02em' }}>Qualifying Range</h4>
      <p className="text-xs text-muted mb-16">
        Checked against the same calculated MPG the Fuel &amp; AdBlue Receipts Audit already shows for each full-tank fill.
      </p>

      <div className="flex" style={{ gap: '12px' }}>
        <div className="input-group" style={{ flex: 1 }}>
          <label className="input-label" htmlFor="fb-min-mpg">MINIMUM MPG</label>
          <input
            id="fb-min-mpg"
            type="number"
            min="0.1"
            step="0.1"
            className="input-field"
            disabled={!form.enabled}
            value={form.minMpg}
            onChange={(e) => setForm(f => ({ ...f, minMpg: e.target.value }))}
          />
        </div>
        <div className="input-group" style={{ flex: 1 }}>
          <label className="input-label" htmlFor="fb-max-mpg">MAXIMUM MPG (OPTIONAL)</label>
          <input
            id="fb-max-mpg"
            type="number"
            min="0.1"
            step="0.1"
            className="input-field"
            placeholder="No ceiling"
            disabled={!form.enabled}
            value={form.maxMpg}
            onChange={(e) => setForm(f => ({ ...f, maxMpg: e.target.value }))}
          />
        </div>
      </div>
      <p className="text-xs text-muted mt-4 mb-16">
        Leave maximum blank for a floor only (e.g. "{form.minMpg || '8.0'} MPG or better").
      </p>

      <h4 className="font-bold text-xs text-muted mt-8 mb-4" style={{ textTransform: 'uppercase', letterSpacing: '0.02em' }}>Bonus Amount</h4>
      <p className="text-xs text-muted mb-16">
        A plain amount you set — not calculated from a formula. You decide what qualifying drivers are paid.
      </p>

      <div className="flex" style={{ gap: '12px' }}>
        <div className="input-group" style={{ flex: 1 }}>
          <label className="input-label" htmlFor="fb-bonus-amount">BONUS AMOUNT (£)</label>
          <input
            id="fb-bonus-amount"
            type="number"
            min="0"
            step="0.01"
            className="input-field"
            disabled={!form.enabled}
            value={form.bonusAmount}
            onChange={(e) => setForm(f => ({ ...f, bonusAmount: e.target.value }))}
          />
        </div>
        <div className="input-group" style={{ flex: 1 }}>
          <label className="input-label" htmlFor="fb-period">PER</label>
          <select
            id="fb-period"
            className="select-field"
            style={{ width: '100%' }}
            disabled={!form.enabled}
            value={form.period}
            onChange={(e) => setForm(f => ({ ...f, period: e.target.value as 'weekly' | 'monthly' }))}
          >
            <option value="weekly">Week</option>
            <option value="monthly">Month</option>
          </select>
        </div>
      </div>

      <div className="flex align-center mt-16" style={{ gap: '10px' }}>
        <button type="button" className="btn" disabled={isSaving} style={{ backgroundColor: 'var(--brand-red)', color: '#fff', borderColor: 'var(--brand-red)', fontWeight: 700 }} onClick={save}>
          {isSaving ? 'Saving…' : 'Save'}
        </button>
        {settings.enabled && (
          <span className="text-xs text-muted">
            Currently: £{settings.bonus_amount.toFixed(2)} per {settings.period === 'weekly' ? 'week' : 'month'} for {settings.min_mpg.toFixed(1)}{settings.max_mpg !== null ? `–${settings.max_mpg.toFixed(1)}` : '+'} MPG.
          </span>
        )}
      </div>

      <p className="text-xs text-muted mt-16" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
        This saves your preferences only. Working out which drivers qualified each period and adding it to their pay is a separate step, not yet built.
      </p>
    </div>
  );
}
