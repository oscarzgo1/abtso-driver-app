import { Target, TrendingDown, TrendingUp, Minus, CalendarClock, PieChart, Receipt, Coins } from 'lucide-react';
import { COST_CATEGORY_LABEL, type AnalyticsSettings, type CostCategory, type TrueCostResult } from '../../lib/true-cost';
import { AnalyticsCard } from './AnalyticsLayout';

// "Where is my money leaking? What state are we in? Are we improving?" —
// the three questions from the analytics brief. The revenue → true-profit
// breakdown, where every £1 goes, per-shift unit economics and what isn't
// counted yet live in TrueProfitSection; targets and the month-end
// forecast are separate cards so the page can place them beside the
// overview trend they relate to. The VAT switch and "Costs & targets"
// live in the page header — they change every figure on the page.

interface TrueProfitSectionProps {
  current: TrueCostResult;
  previous: TrueCostResult | null;
  lastYear: TrueCostResult | null;
  settings: AnalyticsSettings;
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
    <span className="tp-delta" style={{ color: up ? 'var(--charcoal)' : down ? 'var(--brand-red)' : 'var(--charcoal-light)' }}>
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
      <div className="tp-target">
        <div className="tp-target-line">
          <span className="text-secondary">{label}</span>
          <span className="text-muted">No target set</span>
        </div>
      </div>
    );
  }
  const hit = actual !== null && actual >= target;
  const ratio = actual !== null && target > 0 ? Math.max(0, Math.min(1, actual / target)) : 0;
  return (
    <div className="tp-target">
      <div className="tp-target-line">
        <span className="text-secondary">{label}</span>
        <span>
          <strong style={{ color: hit ? 'var(--charcoal)' : 'var(--brand-red)' }}>{actual === null ? '—' : format(actual)}</strong>
          <span className="text-muted"> / {format(target)}</span>
        </span>
      </div>
      <div className="tp-target-track">
        <div style={{ width: `${ratio * 100}%`, background: hit ? '#10B981' : 'var(--brand-red)' }} />
      </div>
    </div>
  );
}

export function TrueProfitTargets({ current, settings }: { current: TrueCostResult; settings: AnalyticsSettings }) {
  return (
    <AnalyticsCard title="Targets" icon={<Target size={14} />} description="True profit against the targets set under Costs & targets.">
      <TargetRow label="Margin" actual={current.marginPct} target={settings.target_margin_percent} format={v => `${v.toFixed(1)}%`} />
      <TargetRow label="Revenue per truck per day" actual={current.revenuePerTruckDay} target={settings.target_revenue_per_truck_day} format={v => money(v)} />
      <TargetRow label="Profit per week" actual={current.weeklyProfit} target={settings.target_weekly_profit} format={v => money(v)} />
    </AnalyticsCard>
  );
}

export function TrueProfitForecast({ forecast }: { forecast: { projected: number; monthLabel: string; daysLeft: number } }) {
  return (
    <AnalyticsCard title={`${forecast.monthLabel} forecast`} icon={<CalendarClock size={14} />}>
      <p className="tp-figure" style={{ color: forecast.projected < 0 ? 'var(--brand-red)' : 'var(--charcoal)' }}>{money(forecast.projected)}</p>
      <p className="text-xs text-muted m-0">If the month continues at its current daily rate · {forecast.daysLeft} day{forecast.daysLeft === 1 ? '' : 's'} left</p>
    </AnalyticsCard>
  );
}

export default function TrueProfitSection({ current, previous, lastYear, settings }: TrueProfitSectionProps) {
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
    <div className="an-stack-sm">
      <div className="an-grid an-grid--split">
        {/* Revenue → costs → true profit */}
        <AnalyticsCard
          title="Revenue to true profit"
          icon={<Receipt size={14} />}
          description="Every cost taken off this period's rated revenue."
          className="flex flex-col"
        >
          <div className="tp-headline">
            <div>
              <p className="tp-hero" style={{ color: current.profit < 0 ? 'var(--brand-red)' : 'var(--charcoal)' }}>{money(current.profit)}</p>
              <p className="text-xs text-secondary m-0">
                {current.marginPct === null ? 'No rated revenue yet' : `${current.marginPct.toFixed(1)}% margin`} · {current.shiftCount} shifts
              </p>
            </div>
            <div className="tp-deltas">
              <Delta current={current.profit} previous={previous?.profit ?? null} label="vs previous period" />
              <Delta current={current.profit} previous={lastYear?.profit ?? null} label="vs same period last year" />
            </div>
          </div>

          <div className="flex flex-col" style={{ gap: '9px', marginBottom: '16px' }}>
            <BarRow label="Revenue" value={current.revenue} scale={scale} tone="ink" />
            {rows.map(r => <BarRow key={r.label} label={r.label} value={-r.value} scale={scale} tone="red" />)}
            <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '4px', paddingTop: '10px' }}>
              <BarRow label="True profit" value={current.profit} scale={scale} tone={current.profit < 0 ? 'red' : 'green'} bold />
            </div>
          </div>

          {biggestLeak && biggestLeak.value > 0 && current.revenue > 0 && (
            <p className="tp-callout" style={{ marginTop: 'auto' }}>
              Biggest cost: <strong className="text-primary">{biggestLeak.label}</strong> — {((biggestLeak.value / current.revenue) * 100).toFixed(0)}p of every £1 earned.
            </p>
          )}
        </AnalyticsCard>

        <div className="an-stack-sm">
          <AnalyticsCard title="Where every £1 goes" icon={<PieChart size={14} />}>
            <PoundSplit current={current} />
          </AnalyticsCard>
          <AnalyticsCard title="Per shift" icon={<Coins size={14} />}>
            <UnitEconomics current={current} />
          </AnalyticsCard>
        </div>
      </div>
    </div>
  );
}

const BAR_TONE = { ink: 'var(--charcoal)', red: 'var(--brand-red)', green: '#10B981' } as const;

function BarRow({ label, value, scale, tone, bold }: { label: string; value: number; scale: number; tone: keyof typeof BAR_TONE; bold?: boolean }) {
  const width = Math.min(100, (Math.abs(value) / scale) * 100);
  return (
    <div className="tp-bar-row">
      <span className={`text-sm ${bold ? 'font-bold text-primary' : 'text-secondary'}`} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <span className="tp-bar-track" style={{ height: bold ? '10px' : '8px' }}>
        <span style={{ width: `${width}%`, background: BAR_TONE[tone], opacity: bold ? 1 : 0.85 }} />
      </span>
      <span className={`text-sm tabular-nums ${bold ? 'font-black' : 'font-bold'}`} style={{ textAlign: 'right', color: value < 0 ? 'var(--brand-red)' : 'var(--charcoal)' }}>
        {money(value)}
      </span>
    </div>
  );
}

/** "Where every £1 goes" — the period's revenue split into each cost and
 *  what's left as profit, as one stacked bar with a pence-per-£1 legend. */
function PoundSplit({ current }: { current: TrueCostResult }) {
  if (current.revenue <= 0) {
    return <p className="text-xs text-muted m-0">Appears once shifts in this period have a load rate.</p>;
  }
  const parts = [
    { label: 'Wages', value: current.payroll, color: 'var(--brand-red)' },
    { label: 'NI & pension', value: current.oncost, color: 'rgba(204, 0, 0, 0.5)' },
    { label: 'Fuel', value: current.fuel, color: '#F59E0B' },
    { label: 'Fixed costs', value: current.fixed, color: 'var(--charcoal-light)' },
    { label: 'Profit', value: Math.max(0, current.profit), color: '#10B981' },
  ].filter(p => p.value > 0);
  const scale = Math.max(current.revenue, current.totalCost, 1);
  return (
    <>
      <div className="pound-split" role="img" aria-label="Revenue split into costs and profit">
        {parts.map(p => (
          <span key={p.label} title={`${p.label}: ${money(p.value)}`} style={{ width: `${(p.value / scale) * 100}%`, background: p.color }} />
        ))}
      </div>
      <ul className="tp-legend">
        {parts.map(p => (
          <li key={p.label}>
            <span className="flex items-center" style={{ gap: '8px' }}>
              <span style={{ width: '9px', height: '9px', borderRadius: '3px', background: p.color, display: 'inline-block' }} />
              {p.label}
            </span>
            <span className="tabular-nums">
              <span className="text-muted">{money(p.value)}</span>
              <strong className="text-primary" style={{ display: 'inline-block', minWidth: '42px', textAlign: 'right' }}>{Math.round((p.value / current.revenue) * 100)}p</strong>
            </span>
          </li>
        ))}
      </ul>
    </>
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
