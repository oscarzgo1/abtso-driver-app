// Adapted from 21st.dev @sean0205/line-charts-6 — clickable metric tiles
// that switch which series the line chart plots, restyled to the admin
// panel's light tokens.
import { useState, type CSSProperties, type ReactNode } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import { BadgeDelta, type BadgeDeltaDirection, type BadgeDeltaTone } from './badge-delta';

export interface MetricTile {
  key: string;
  label: string;
  value: number;
  /** Same metric for the previous comparison window; null = no comparison. */
  previous: number | null;
  format: (value: number) => string;
  /** Short form for the Y axis (defaults to `format`). */
  axisFormat?: (value: number) => string;
  color: string;
  delta: { label: string; direction: BadgeDeltaDirection; tone: BadgeDeltaTone } | null;
  /** Shown under the value; falls back to "from <previous>" when absent.
   *  The previous value is also in the tile's hover title. */
  hint?: ReactNode;
}

interface MetricLineChartProps {
  metrics: MetricTile[];
  /** One row per x-axis point; `label` is the axis text, other keys match MetricTile.key. */
  data: Array<{ label: string } & Record<string, number | string>>;
  defaultKey?: string;
  height?: number;
  emptyText?: string;
  footer?: ReactNode;
  /** Rendered beside the chart (stacks under it on narrow screens). */
  aside?: ReactNode;
}

export function MetricLineChart({ metrics, data, defaultKey, height = 320, emptyText = 'No data for this period yet.', footer, aside }: MetricLineChartProps) {
  const [selectedKey, setSelectedKey] = useState(defaultKey ?? metrics[0]?.key);
  const selected = metrics.find(m => m.key === selectedKey) ?? metrics[0];

  const ChartTooltip = ({ active, payload, label }: TooltipContentProps) => {
    if (!active || !payload?.length || !selected) return null;
    return (
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 12px', boxShadow: '0 6px 16px rgba(0,0,0,0.1)', fontSize: '12px', minWidth: '130px' }}>
        <div style={{ color: 'var(--charcoal-light)', fontWeight: 700, marginBottom: '4px' }}>{label}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: selected.color }} />
          <span style={{ color: 'var(--charcoal-light)' }}>{selected.label}:</span>
          <span style={{ fontWeight: 800, color: 'var(--charcoal)' }}>{selected.format(Number(payload[0].value))}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="dash-panel">
      <div className="metric-tiles" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(170px, 1fr))` }}>
        {metrics.map(metric => (
          <button
            key={metric.key}
            type="button"
            onClick={() => setSelectedKey(metric.key)}
            className={`metric-tile ${metric.key === selected?.key ? 'is-active' : ''}`}
            style={{ '--tile-accent': metric.color } as CSSProperties}
            title={metric.previous !== null ? `${metric.label}: ${metric.format(metric.value)} · previous period ${metric.format(metric.previous)}` : undefined}
          >
            <span className="metric-tile-top">
              <span className="metric-tile-label">{metric.label}</span>
              {metric.delta && <BadgeDelta label={metric.delta.label} direction={metric.delta.direction} tone={metric.delta.tone} />}
            </span>
            <span className="metric-tile-value">{metric.format(metric.value)}</span>
            <span className="metric-tile-sub">
              {metric.hint ?? (metric.previous !== null ? `from ${metric.format(metric.previous)}` : null)}
            </span>
          </button>
        ))}
      </div>

      <div className={aside ? 'metric-chart-body metric-chart-body--aside' : 'metric-chart-body'}>
        <div className="metric-chart-area" style={{ height }}>
          {data.length < 2 || !selected ? (
            <div className="flex items-center justify-center text-sm text-muted" style={{ height: '100%' }}>{emptyText}</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 20, right: 24, left: 8, bottom: 8 }}>
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#888888' }} tickMargin={10} interval="preserveStartEnd" minTickGap={16} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#888888' }}
                  tickMargin={8}
                  tickCount={6}
                  width={64}
                  tickFormatter={v => (selected.axisFormat ?? selected.format)(Number(v))}
                />
                <Tooltip content={ChartTooltip} cursor={{ strokeDasharray: '3 3', stroke: '#BBBBBB' }} />
                {/* Recharts' entry animation never resolves in this app — see fleet-status-donut-chart.tsx. */}
                <Line
                  type="monotone"
                  dataKey={selected.key}
                  stroke={selected.color}
                  strokeWidth={2.25}
                  dot={false}
                  activeDot={{ r: 5, fill: selected.color, stroke: '#FFFFFF', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        {aside && <div className="metric-chart-aside">{aside}</div>}
      </div>

      {footer && <div className="metric-chart-footer">{footer}</div>}
    </div>
  );
}
