import { AlertTriangle, Settings2, Target, TrendingDown, TrendingUp, Minus, CalendarClock } from 'lucide-react';
import { COST_CATEGORY_LABEL, type AnalyticsSettings, type CostCategory, type TrueCostResult, type VatMode } from '../../lib/true-cost';

// "Where is my money leaking? What state are we in? Are we improving?" —
// the three questions from the analytics brief, answered in one block:
// a revenue → true-profit breakdown, comparisons with the previous period
// and the same period last year, targets, and a month-end forecast.

interface TrueProfitSectionProps {
  periodLabel: string;
  current: TrueCostResult;
  previous: TrueCostResult | null;
  lastYear: TrueCostResult | null;
  forecast: { projected: number; monthLabel: string; daysLeft: number } | null;
  settings: AnalyticsSettings;
  hasCosts: boolean;
  vatMode: VatMode;
  onVatModeChange: (mode: VatMode) => void;
  /** Payroll admins only — logistics sees the figures read-only. */
  onManageCosts?: () => void;
}

const money = (v: number) => `${v < 0 ? '−' : ''}£${Math.abs(v).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;

function Delta({ current, previous, label }: { current: number; previous: number | null; label: string }) {
  if (previous === null) return null;
  const diff = current - previous;
  const pct = previous !== 0 ? (diff / Math.abs(previous)) * 100 : null;
  const up = diff > 0.5;
  const down = diff < -0.5;
  const Icon = up ? TrendingUp : down ? TrendingDown : Minus;
  return (
    <span className="flex items-center text-xs" style={{ gap: '5px', color: up ? 'var(--charcoal)' : down ? 'var(--brand-red)' : 'var(--charcoal-light)' }}>
      <Icon size={13} />
      <strong>{up ? '+' : ''}{money(diff)}</strong>
      {pct !== null && <span>({up ? '+' : ''}{pct.toFixed(0)}%)</span>}
      <span className="text-muted">{label}</span>
    </span>
  );
}

function TargetRow({ label, actual, target, format }: { label: string; actual: number | null; target: number | null; format: (v: number) => string }) {
  if (target === null) {
    return (
      <div className="flex items-center justify-between text-xs" style={{ padding: '8px 0', borderTop: '1px solid var(--border-color)' }}>
        <span className="text-secondary">{label}</span>
        <span className="text-muted">No target set</span>
      </div>
    );
  }
  const hit = actual !== null && actual >= target;
  const ratio = actual !== null && target > 0 ? Math.max(0, Math.min(1, actual / target)) : 0;
  return (
    <div style={{ padding: '8px 0', borderTop: '1px solid var(--border-color)' }}>
      <div className="flex items-center justify-between text-xs" style={{ marginBottom: '5px' }}>
        <span className="text-secondary">{label}</span>
        <span>
          <strong style={{ color: hit ? 'var(--charcoal)' : 'var(--brand-red)' }}>{actual === null ? '—' : format(actual)}</strong>
          <span className="text-muted"> / {format(target)}</span>
        </span>
      </div>
      <div style={{ height: '5px', borderRadius: '3px', background: 'var(--border-color)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${ratio * 100}%`, background: hit ? 'var(--charcoal)' : 'var(--brand-red)' }} />
      </div>
    </div>
  );
}

export default function TrueProfitSection({
  periodLabel, current, previous, lastYear, forecast, settings, hasCosts, vatMode, onVatModeChange, onManageCosts,
}: TrueProfitSectionProps) {
  const rows: { label: string; value: number }[] = [
    { label: 'Payroll (wages)', value: current.payroll },
    ...(current.oncost > 0 ? [{ label: `Employer NI & pension (${settings.employer_oncost_percent}%)`, value: current.oncost }] : []),
    { label: 'Fuel & AdBlue', value: current.fuel },
    ...(Object.entries(current.fixedByCategory) as [CostCategory, number][])
      .sort((a, b) => b[1] - a[1])
      .map(([cat, value]) => ({ label: COST_CATEGORY_LABEL[cat], value })),
  ];
  const scale = Math.max(current.revenue, current.totalCost, 1);
  const biggestLeak = [...rows].sort((a, b) => b.value - a.value)[0];

  return (
    <div className="analytics-container">
      <div className="analytics-section-head">
        <p className="text-xs font-bold text-muted uppercase" style={{ letterSpacing: '0.16em', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '16px', height: '2px', background: 'var(--brand-red)', display: 'inline-block' }} />
          True profit · {periodLabel}
        </p>
        <div className="flex items-center" style={{ gap: '8px' }}>
          <div className="flex" style={{ border: '1px solid var(--border-color)', borderRadius: '999px', padding: '2px' }} role="group" aria-label="VAT">
            {(['ex', 'inc'] as VatMode[]).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => onVatModeChange(mode)}
                aria-pressed={vatMode === mode}
                style={{
                  border: 'none', cursor: 'pointer', borderRadius: '999px', padding: '5px 12px', fontSize: '11.5px', fontWeight: 700,
                  background: vatMode === mode ? 'var(--charcoal)' : 'transparent', color: vatMode === mode ? '#fff' : 'var(--charcoal-light)',
                }}
              >
                {mode === 'ex' ? 'Ex VAT' : 'Inc VAT'}
              </button>
            ))}
          </div>
          {onManageCosts && (
            <button type="button" className="btn btn-secondary flex items-center" style={{ gap: '6px', padding: '6px 12px', fontSize: '11px' }} onClick={onManageCosts}>
              <Settings2 size={14} /> Costs &amp; targets
            </button>
          )}
        </div>
      </div>

      {/* Both columns stretch to the same height (was alignItems: start,
          which left a blank block under whichever column was shorter). */}
      <div className="grid grid-cols-1 lg:grid-cols-12" style={{ gap: '16px', alignItems: 'stretch' }}>
        {/* Revenue → costs → true profit */}
        <div className="glass-card lg:col-span-8 flex flex-col" style={{ padding: '18px 20px' }}>
          <div className="flex items-end justify-between" style={{ gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
            <div>
              <p className="text-xs text-muted m-0">True profit after every cost</p>
              <p className="font-black m-0 tabular-nums" style={{ fontSize: '34px', lineHeight: 1.1, color: current.profit < 0 ? 'var(--brand-red)' : 'var(--charcoal)' }}>
                {money(current.profit)}
              </p>
              <p className="text-xs text-secondary m-0">
                {current.marginPct === null ? 'No rated revenue yet' : `${current.marginPct.toFixed(1)}% margin`} · {current.shiftCount} shifts
              </p>
            </div>
            <div className="flex flex-col" style={{ gap: '4px', alignItems: 'flex-end' }}>
              <Delta current={current.profit} previous={previous?.profit ?? null} label="vs previous period" />
              <Delta current={current.profit} previous={lastYear?.profit ?? null} label="vs same period last year" />
            </div>
          </div>

          <div className="flex flex-col" style={{ gap: '7px' }}>
            <BarRow label="Revenue" value={current.revenue} scale={scale} tone="ink" />
            {rows.map(r => <BarRow key={r.label} label={r.label} value={-r.value} scale={scale} tone="red" />)}
            <div style={{ borderTop: '2px solid var(--charcoal)', marginTop: '4px', paddingTop: '8px' }}>
              <BarRow label="True profit" value={current.profit} scale={scale} tone={current.profit < 0 ? 'red' : 'ink'} bold />
            </div>
          </div>

          {biggestLeak && biggestLeak.value > 0 && current.revenue > 0 && (
            <p className="text-xs text-secondary m-0 mt-12">
              Biggest cost: <strong className="text-primary">{biggestLeak.label}</strong> — {((biggestLeak.value / current.revenue) * 100).toFixed(0)}p of every £1 earned.
            </p>
          )}

          {/* Pinned to the bottom of the card so it fills the height the
              side column gives it instead of leaving empty space. */}
          <div style={{ marginTop: 'auto', paddingTop: '18px' }}>
            <PoundSplit current={current} />
            <UnitEconomics current={current} />
          </div>
        </div>

        <div className="lg:col-span-4 flex flex-col tp-side" style={{ gap: '16px' }}>
          <div className="glass-card" style={{ padding: '14px 16px' }}>
            <p className="flex items-center text-xs font-bold text-muted uppercase m-0 mb-8" style={{ gap: '6px', letterSpacing: '0.08em' }}>
              <Target size={13} /> Targets
            </p>
            <TargetRow label="Margin" actual={current.marginPct} target={settings.target_margin_percent} format={v => `${v.toFixed(1)}%`} />
            <TargetRow label="Revenue per truck per day" actual={current.revenuePerTruckDay} target={settings.target_revenue_per_truck_day} format={v => money(v)} />
            <TargetRow label="Profit per week" actual={current.weeklyProfit} target={settings.target_weekly_profit} format={v => money(v)} />
          </div>

          {forecast && (
            <div className="glass-card" style={{ padding: '14px 16px' }}>
              <p className="flex items-center text-xs font-bold text-muted uppercase m-0 mb-4" style={{ gap: '6px', letterSpacing: '0.08em' }}>
                <CalendarClock size={13} /> {forecast.monthLabel} forecast
              </p>
              <p className="font-black m-0 tabular-nums" style={{ fontSize: '22px', color: forecast.projected < 0 ? 'var(--brand-red)' : 'var(--charcoal)' }}>{money(forecast.projected)}</p>
              <p className="text-xs text-muted m-0">If the month continues at its current daily rate · {forecast.daysLeft} day{forecast.daysLeft === 1 ? '' : 's'} left</p>
            </div>
          )}

          {(current.unratedShifts > 0 || current.pendingFuel > 0 || current.pendingFixed > 0 || !hasCosts) && (
            <div className="glass-card" style={{ padding: '14px 16px', borderColor: 'var(--brand-red)' }}>
              <p className="flex items-center text-xs font-bold uppercase m-0 mb-8" style={{ gap: '6px', letterSpacing: '0.08em', color: 'var(--brand-red)' }}>
                <AlertTriangle size={13} /> Not in these figures yet
              </p>
              <ul className="text-xs text-secondary m-0" style={{ paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {current.unratedShifts > 0 && (
                  <li><strong className="text-primary">{current.unratedShifts} shift{current.unratedShifts === 1 ? '' : 's'}</strong> awaiting a load rate — their {money(current.unratedWages)} wages are counted, their revenue isn't yet.</li>
                )}
                {current.pendingFuel > 0 && <li><strong className="text-primary">{money(current.pendingFuel)}</strong> of fuel receipts awaiting approval.</li>}
                {current.pendingFixed > 0 && <li><strong className="text-primary">{money(current.pendingFixed)}</strong> of costs marked pending.</li>}
                {!hasCosts && <li>No fixed costs entered — add finance, insurance, overheads and more under <strong className="text-primary">Costs &amp; targets</strong>.</li>}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BarRow({ label, value, scale, tone, bold }: { label: string; value: number; scale: number; tone: 'ink' | 'red'; bold?: boolean }) {
  const width = Math.min(100, (Math.abs(value) / scale) * 100);
  return (
    <div className="grid items-center" style={{ gridTemplateColumns: 'minmax(120px, 190px) 1fr 90px', gap: '10px' }}>
      <span className={`text-xs ${bold ? 'font-black text-primary' : 'text-secondary'}`} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ height: bold ? '10px' : '8px', borderRadius: '4px', background: 'var(--card-bg-hover)', overflow: 'hidden' }}>
        <span style={{ display: 'block', height: '100%', width: `${width}%`, background: tone === 'ink' ? 'var(--charcoal)' : 'var(--brand-red)', opacity: bold ? 1 : 0.85 }} />
      </span>
      <span className={`text-xs tabular-nums ${bold ? 'font-black' : 'font-bold'}`} style={{ textAlign: 'right', color: value < 0 ? 'var(--brand-red)' : 'var(--charcoal)' }}>
        {money(value)}
      </span>
    </div>
  );
}

/** "Where every £1 goes" — the period's revenue split into each cost and
 *  what's left as profit, as one stacked bar with a pence-per-£1 legend. */
function PoundSplit({ current }: { current: TrueCostResult }) {
  if (current.revenue <= 0) {
    return (
      <p className="text-xs text-muted m-0" style={{ marginBottom: '12px' }}>
        Where every £1 goes appears once shifts in this period have a load rate.
      </p>
    );
  }
  const fixed = current.fixed;
  const parts = [
    { label: 'Wages', value: current.payroll, color: 'var(--brand-red)' },
    { label: 'NI & pension', value: current.oncost, color: 'rgba(204, 0, 0, 0.5)' },
    { label: 'Fuel', value: current.fuel, color: '#F59E0B' },
    { label: 'Fixed costs', value: fixed, color: 'var(--charcoal-light)' },
    { label: 'Profit', value: Math.max(0, current.profit), color: '#10B981' },
  ].filter(p => p.value > 0);
  const scale = Math.max(current.revenue, current.totalCost, 1);
  return (
    <div style={{ marginBottom: '12px' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: '6px', gap: '8px', flexWrap: 'wrap' }}>
        <span className="text-xs font-bold text-muted uppercase" style={{ letterSpacing: '0.08em' }}>Where every £1 goes</span>
        <span className="flex items-center text-xs text-secondary" style={{ gap: '10px', flexWrap: 'wrap' }}>
          {parts.map(p => (
            <span key={p.label} className="flex items-center" style={{ gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '999px', background: p.color, display: 'inline-block' }} />
              {p.label} <strong className="text-primary tabular-nums">{Math.round((p.value / current.revenue) * 100)}p</strong>
            </span>
          ))}
        </span>
      </div>
      <div className="pound-split" role="img" aria-label="Revenue split into costs and profit">
        {parts.map(p => (
          <span key={p.label} title={`${p.label}: ${money(p.value)}`} style={{ width: `${(p.value / scale) * 100}%`, background: p.color }} />
        ))}
      </div>
    </div>
  );
}

/** Per-shift and per-truck-day unit economics for the period. */
function UnitEconomics({ current }: { current: TrueCostResult }) {
  const perShift = (v: number) => (current.shiftCount > 0 ? money(v / current.shiftCount) : '—');
  const tiles = [
    { label: 'Revenue / shift', value: perShift(current.revenue) },
    { label: 'Cost / shift', value: perShift(current.totalCost) },
    { label: 'Profit / shift', value: perShift(current.profit), bad: current.profit < 0 },
    { label: 'Profit / truck-day', value: current.truckDays > 0 ? money(current.profit / current.truckDays) : '—', bad: current.profit < 0 },
  ];
  return (
    <div className="unit-econ">
      {tiles.map(t => (
        <div key={t.label}>
          <p className="text-xs text-muted m-0">{t.label}</p>
          <p className="font-black m-0 tabular-nums" style={{ fontSize: '17px', color: t.bad ? 'var(--brand-red)' : 'var(--charcoal)' }}>{t.value}</p>
        </div>
      ))}
    </div>
  );
}
