// Adapted from 21st.dev @makviesainte/progress-metric-card — headline
// figure with a curve/bars chart behind it, a period selector and a stats
// footer. Its metric-chart / metric-controls helpers weren't published, so
// the chart and controls are rebuilt here on Recharts and the app's tokens.
import { useId, useMemo, useState, type ReactNode } from 'react';
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, type TooltipContentProps } from 'recharts';
import { ArrowDown, ArrowRight, ArrowUp, BarChart3, ChevronDown, LineChart as LineChartIcon } from 'lucide-react';

export interface MetricPoint {
  /** Tooltip / axis label, e.g. "12 Sep". */
  date: string;
  value: number;
  [extra: string]: number | string;
}

export interface PeriodOption {
  label: string;
  /** Keep only the latest N points; omit for all. */
  points?: number;
}

export interface MetricSummary {
  headline: string;
  /** % change across the window; null hides the badge. */
  changePct: number | null;
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
}

interface ProgressMetricCardProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  data: MetricPoint[];
  periodOptions: PeriodOption[];
  /** Recomputed for whichever window the period selector shows. */
  summarize: (points: MetricPoint[]) => MetricSummary;
  valueFormatter: (value: number) => string;
  higherIsBetter?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  note?: ReactNode;
}

const UP = '#10B981';
const DOWN = '#CC0000';
const FLAT = '#888888';

export function ProgressMetricCard({
  title,
  subtitle,
  icon,
  data,
  periodOptions,
  summarize,
  valueFormatter,
  higherIsBetter = true,
  emptyTitle = 'No data yet',
  emptyDescription = 'Figures will appear once there is data for this period.',
  note,
}: ProgressMetricCardProps) {
  const gradientId = `pmc-${useId().replace(/:/g, '')}`;
  const [view, setView] = useState<'curve' | 'bars'>('curve');
  const [periodLabel, setPeriodLabel] = useState(periodOptions[periodOptions.length - 1]?.label ?? '');
  const period = periodOptions.find(p => p.label === periodLabel) ?? periodOptions[periodOptions.length - 1];

  const windowPoints = useMemo(
    () => (period?.points && period.points < data.length ? data.slice(-period.points) : data),
    [data, period],
  );
  const summary = summarize(windowPoints);

  const change = summary.changePct;
  const isFlat = change === null || Math.abs(change) < 0.5;
  const isGood = !isFlat && (change! > 0) === higherIsBetter;
  const color = isFlat ? FLAT : isGood ? UP : DOWN;
  const TrendIcon = isFlat ? ArrowRight : change! > 0 ? ArrowUp : ArrowDown;

  const values = windowPoints.map(p => p.value);
  const peak = values.length ? Math.max(...values) : 0;
  const low = values.length ? Math.min(...values) : 0;

  const ChartTooltip = ({ active, payload }: TooltipContentProps) => {
    if (!active || !payload?.length) return null;
    const point = payload[0].payload as MetricPoint;
    return (
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '7px 11px', boxShadow: '0 6px 16px rgba(0,0,0,0.1)', fontSize: '12px' }}>
        <div style={{ fontWeight: 800, color: 'var(--charcoal)' }}>{valueFormatter(point.value)}</div>
        <div style={{ color: 'var(--charcoal-light)' }}>{point.date}</div>
      </div>
    );
  };

  return (
    <div className="pmc-card">
      {windowPoints.length < 2 ? (
        <div className="pmc-body">
          <div className="pmc-header">
            <span className="pmc-title">{icon}{title}</span>
          </div>
          <div className="flex flex-col items-center justify-center text-center" style={{ flex: 1, padding: '40px 0', gap: '4px' }}>
            <span className="text-sm font-bold text-primary">{emptyTitle}</span>
            <span className="text-xs text-muted">{emptyDescription}</span>
          </div>
        </div>
      ) : (
        <>
          <div className="pmc-chart-region">
            <div className="pmc-chart-glow" style={{ background: `linear-gradient(to left, ${color}1f, transparent 75%)` }} />
            <div className="pmc-chart-dots" />
            <ResponsiveContainer width="100%" height="100%">
              {view === 'curve' ? (
                <AreaChart data={windowPoints} margin={{ top: 70, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" hide />
                  <Tooltip content={ChartTooltip} cursor={{ stroke: '#BBBBBB', strokeDasharray: '3 3' }} />
                  {/* Recharts' entry animation never resolves in this app — see fleet-status-donut-chart.tsx. */}
                  <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2.25} fill={`url(#${gradientId})`} activeDot={{ r: 5, fill: color, stroke: '#FFFFFF', strokeWidth: 2 }} isAnimationActive={false} />
                </AreaChart>
              ) : (
                <BarChart data={windowPoints} margin={{ top: 70, right: 8, left: 8, bottom: 0 }}>
                  <XAxis dataKey="date" hide />
                  <Tooltip content={ChartTooltip} cursor={{ fill: 'var(--card-bg-hover)' }} />
                  <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>

          <div className="pmc-body">
            <div className="pmc-header">
              <span className="pmc-title">
                {icon}
                {title}
                <span className="pmc-toggle">
                  <button type="button" className={view === 'curve' ? 'is-active' : ''} onClick={() => setView('curve')} aria-label="Curve view"><LineChartIcon size={13} /></button>
                  <button type="button" className={view === 'bars' ? 'is-active' : ''} onClick={() => setView('bars')} aria-label="Bar view"><BarChart3 size={13} /></button>
                </span>
              </span>
              <span className="flex items-center" style={{ gap: '12px' }}>
                {change !== null && (
                  <span className="flex items-center font-bold text-xs" style={{ gap: '3px', color }}>
                    <TrendIcon size={14} strokeWidth={2.5} />
                    {Math.abs(change).toFixed(1)}%
                  </span>
                )}
                <label className="pmc-period">
                  <select value={periodLabel} onChange={e => setPeriodLabel(e.target.value)}>
                    {periodOptions.map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
                  </select>
                  <ChevronDown size={12} />
                </label>
              </span>
            </div>
            {subtitle && <p className="pmc-subtitle">{subtitle}</p>}
            <div className="pmc-headline">{summary.headline}</div>
            {note && <p className="pmc-note">{note}</p>}
          </div>

          <div className="pmc-footer">
            <div>{summary.footerLeft}</div>
            <div className="flex items-center" style={{ gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {summary.footerRight}
              <span className="text-xs text-muted">
                <strong className="text-primary">{valueFormatter(peak)}</strong> peak · <strong className="text-primary">{valueFormatter(low)}</strong> low
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
