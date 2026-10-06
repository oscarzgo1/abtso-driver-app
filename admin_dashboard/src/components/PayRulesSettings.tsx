import { useEffect, useMemo, useState } from 'react';
import { supabase, isMockMode } from '../App';

// Settings -> Payroll. How a company's day rates (Mon-Fri / Saturday /
// Sunday) are turned into pay. The rule is applied by the database when a
// shift is completed (migration 083/084), so the admin panel, the exports
// and the driver's own history all show the same figure. The calculator
// below uses the same arithmetic so a company can check a rule against its
// own numbers before choosing it.

type Mode = 'shift_start_day' | 'split_by_day' | 'week_top_rate';
type WeekStart = 'monday' | 'sunday';

const MODES: { id: Mode; title: string; body: string }[] = [
  {
    id: 'split_by_day',
    title: 'Each day at its own rate',
    body: 'Friday hours are paid at the Friday rate, Saturday hours at the Saturday rate, Sunday hours at the Sunday rate. A shift that runs past midnight is split at midnight, so the hours after midnight are paid at the next day\'s rate.',
  },
  {
    id: 'shift_start_day',
    title: 'Day the shift started',
    body: 'The whole shift is paid at the rate of the day it started, even if it runs past midnight. This is how pay has been calculated until now.',
  },
  {
    id: 'week_top_rate',
    title: 'Highest rate worked in the week',
    body: 'The highest day rate worked in the pay week applies to every hour of that week. With a Sunday to Saturday week, working a Sunday pays the whole week from that Sunday at the Sunday rate. Earlier shifts in the week are raised automatically.',
  },
];

const money = (n: number) => `£${n.toFixed(2)}`;

export default function PayRulesSettings({ organizationId }: { organizationId: string | null }) {
  const [mode, setMode] = useState<Mode>('shift_start_day');
  const [weekStart, setWeekStart] = useState<WeekStart>('sunday');
  const [saved, setSaved] = useState<{ mode: Mode; weekStart: WeekStart } | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  // Calculator inputs
  const [rates, setRates] = useState({ mf: '17', sat: '18', sun: '19' });
  const [hours, setHours] = useState({ fri: '10', sat: '10', sun: '10' });

  useEffect(() => {
    if (isMockMode || !supabase || !organizationId) return;
    (async () => {
      const { data } = await supabase!
        .from('organizations')
        .select('pay_day_mode, pay_week_starts_on')
        .eq('id', organizationId)
        .maybeSingle();
      if (data) {
        const m = (data.pay_day_mode as Mode) ?? 'shift_start_day';
        const w = (data.pay_week_starts_on as WeekStart) ?? 'sunday';
        setMode(m);
        setWeekStart(w);
        setSaved({ mode: m, weekStart: w });
      }
    })();
  }, [organizationId]);

  const calc = useMemo(() => {
    const r = { mf: Number(rates.mf) || 0, sat: Number(rates.sat) || 0, sun: Number(rates.sun) || 0 };
    const h = { fri: Number(hours.fri) || 0, sat: Number(hours.sat) || 0, sun: Number(hours.sun) || 0 };
    const perDay = h.fri * r.mf + h.sat * r.sat + h.sun * r.sun;
    const worked = [h.fri > 0 ? r.mf : 0, h.sat > 0 ? r.sat : 0, h.sun > 0 ? r.sun : 0];
    const top = Math.max(...worked);
    const totalHours = h.fri + h.sat + h.sun;
    return {
      lines: [
        { label: 'Friday', hours: h.fri, rate: r.mf },
        { label: 'Saturday', hours: h.sat, rate: r.sat },
        { label: 'Sunday', hours: h.sun, rate: r.sun },
      ],
      byMode: { split_by_day: perDay, shift_start_day: perDay, week_top_rate: totalHours * top } as Record<Mode, number>,
      top,
      totalHours,
    };
  }, [rates, hours]);

  const dirty = !saved || saved.mode !== mode || saved.weekStart !== weekStart;

  const save = async () => {
    if (isMockMode || !supabase) return;
    setSaving(true);
    setMessage(null);
    const { error } = await supabase.rpc('set_pay_rules', { p_mode: mode, p_week_starts_on: weekStart });
    setSaving(false);
    if (error) {
      setMessage({ kind: 'error', text: error.message });
      return;
    }
    setSaved({ mode, weekStart });
    setMessage({ kind: 'success', text: 'Saved. It applies to shifts completed from now on.' });
    setTimeout(() => setMessage(null), 3500);
  };

  return (
    <div>
      <div className="settings-panel-header">
        <p>Payroll</p>
        <p>Choose how Monday to Friday, Saturday and Sunday rates are applied when pay is calculated.</p>
      </div>

      {message && <div className={`login-notice ${message.kind === 'error' ? 'login-notice--error' : 'login-notice--success'} mb-16`}>{message.text}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
        {MODES.map(m => {
          const active = mode === m.id;
          return (
            <label
              key={m.id}
              style={{ display: 'flex', gap: '12px', padding: '14px 16px', border: `1px solid ${active ? 'var(--charcoal)' : 'var(--border-color)'}`, borderRadius: '12px', cursor: 'pointer', background: active ? 'var(--card-bg-hover)' : 'var(--card-bg)' }}
            >
              <input type="radio" name="pay-day-mode" checked={active} onChange={() => setMode(m.id)} style={{ marginTop: '3px' }} />
              <div style={{ flex: 1 }}>
                <p className="font-bold text-sm text-primary" style={{ margin: '0 0 2px' }}>
                  {m.title}
                  {saved?.mode === m.id && <span className="text-xs text-muted" style={{ marginLeft: '8px', fontWeight: 600 }}>Current</span>}
                </p>
                <p className="text-xs text-muted" style={{ margin: 0, lineHeight: 1.5 }}>{m.body}</p>
              </div>
              <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <span className="input-label" style={{ display: 'block', margin: 0 }}>EXAMPLE TOTAL</span>
                <span className="font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>{money(calc.byMode[m.id])}</span>
              </div>
            </label>
          );
        })}
      </div>

      {mode === 'week_top_rate' && (
        <div className="input-group">
          <label className="input-label" htmlFor="pay-week-start">PAY WEEK STARTS ON</label>
          <select id="pay-week-start" className="input-field" value={weekStart} onChange={e => setWeekStart(e.target.value as WeekStart)}>
            <option value="sunday">Sunday (week runs Sunday to Saturday)</option>
            <option value="monday">Monday (week runs Monday to Sunday)</option>
          </select>
          <p className="text-xs text-muted mt-4">Decides which shifts count as the same week when the highest rate is applied.</p>
        </div>
      )}

      <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px' }}>
        <p className="font-bold text-sm text-primary" style={{ margin: '0 0 4px' }}>Check it with your own numbers</p>
        <p className="text-xs text-muted" style={{ margin: '0 0 12px' }}>Enter the rates and hours worked and compare what each rule pays. The same arithmetic is used when pay is calculated.</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '10px', marginBottom: '12px' }}>
          <div className="input-group" style={{ margin: 0 }}>
            <label className="input-label">MON-FRI £/HR</label>
            <input className="input-field" type="number" min="0" step="0.01" value={rates.mf} onChange={e => setRates(r => ({ ...r, mf: e.target.value }))} />
          </div>
          <div className="input-group" style={{ margin: 0 }}>
            <label className="input-label">SATURDAY £/HR</label>
            <input className="input-field" type="number" min="0" step="0.01" value={rates.sat} onChange={e => setRates(r => ({ ...r, sat: e.target.value }))} />
          </div>
          <div className="input-group" style={{ margin: 0 }}>
            <label className="input-label">SUNDAY £/HR</label>
            <input className="input-field" type="number" min="0" step="0.01" value={rates.sun} onChange={e => setRates(r => ({ ...r, sun: e.target.value }))} />
          </div>
          <div className="input-group" style={{ margin: 0 }}>
            <label className="input-label">FRIDAY HOURS</label>
            <input className="input-field" type="number" min="0" step="0.25" value={hours.fri} onChange={e => setHours(x => ({ ...x, fri: e.target.value }))} />
          </div>
          <div className="input-group" style={{ margin: 0 }}>
            <label className="input-label">SATURDAY HOURS</label>
            <input className="input-field" type="number" min="0" step="0.25" value={hours.sat} onChange={e => setHours(x => ({ ...x, sat: e.target.value }))} />
          </div>
          <div className="input-group" style={{ margin: 0 }}>
            <label className="input-label">SUNDAY HOURS</label>
            <input className="input-field" type="number" min="0" step="0.25" value={hours.sun} onChange={e => setHours(x => ({ ...x, sun: e.target.value }))} />
          </div>
        </div>

        <table className="data-table" style={{ width: '100%' }}>
          <thead>
            <tr><th>Day</th><th>Hours</th><th>Rate</th><th>{mode === 'week_top_rate' ? `Paid at ${money(calc.top)}` : 'Pay'}</th></tr>
          </thead>
          <tbody>
            {calc.lines.map(l => (
              <tr key={l.label}>
                <td>{l.label}</td>
                <td>{l.hours}</td>
                <td>{money(l.rate)}</td>
                <td>{money(l.hours * (mode === 'week_top_rate' ? (l.hours > 0 ? calc.top : 0) : l.rate))}</td>
              </tr>
            ))}
            <tr>
              <td><strong>Total</strong></td>
              <td><strong>{calc.totalHours}</strong></td>
              <td></td>
              <td><strong>{money(calc.byMode[mode])}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted" style={{ marginBottom: '16px', lineHeight: 1.5 }}>
        Applies to shifts completed after you save. Shifts already completed keep the pay they were locked with, so past payroll never changes. Employees on a fixed rate per shift are not affected. The day of the week is always read in UK time.
      </p>

      <button type="button" className="btn btn-primary" disabled={saving || !dirty} onClick={save}>
        {saving ? 'Saving…' : dirty ? 'Save payroll rules' : 'Saved'}
      </button>
    </div>
  );
}
