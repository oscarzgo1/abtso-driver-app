import { useId } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';

function MonoTick({ x, y, payload, textAnchor, dy }: any) {
  return (
    <text
      x={x}
      y={y}
      dy={dy ?? 0}
      textAnchor={textAnchor ?? 'middle'}
      fontSize={10}
      fill="var(--charcoal-light)"
      style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontVariantNumeric: 'tabular-nums' }}
    >
      {payload.value}
    </text>
  );
}

export interface MarginTrendPoint {
  label: string;
  margin: number;
}

interface MarginTrendChartProps {
  data: MarginTrendPoint[];
  targetPct?: number;
  lineColor?: string;
  height?: number;
}

/** Single-series margin % trend, deliberately separate from
 * AnalyticsGroupedBarChart's revenue/cost/fuel view rather than a second
 * y-axis bolted onto it — one chart answering "is margin going up or down"
 * reads faster than the same question buried under three other series. */
export function MarginTrendChart({ data, targetPct, lineColor = '#0F172A', height = 220 }: MarginTrendChartProps) {
  const glowId = useId();

  if (data.length === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="text-sm text-muted">
        No rated loads yet for this period.
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }: TooltipContentProps) => {
    if (!active || !payload?.length) return null;
    const margin = (payload.find(p => p.dataKey === 'margin')?.value as number) ?? 0;
    return (
      <div
        style={{
          background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '6px',
          padding: '8px 11px', boxShadow: '0 6px 16px rgba(0,0,0,0.2)', fontSize: '11px', minWidth: '110px',
        }}
      >
        <div style={{ color: 'var(--charcoal-light)', marginBottom: '4px', fontWeight: 700 }}>{label}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <span style={{ color: 'var(--charcoal-light)' }}>Margin</span>
          <span style={{ fontWeight: 800, color: targetPct !== undefined && margin < targetPct ? '#DC2626' : '#10B981' }}>{margin.toFixed(1)}%</span>
        </div>
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 4 }}>
        <defs>
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor={lineColor} floodOpacity="0.3" />
          </filter>
        </defs>
        <CartesianGrid horizontal vertical={false} stroke="#E2E8F0" strokeDasharray="3 3" />
        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={<MonoTick />} tickMargin={8} interval="preserveStartEnd" />
        <YAxis axisLine={false} tickLine={false} tick={<MonoTick textAnchor="end" dy={4} />} tickFormatter={(v) => `${v}%`} width={40} />
        <Tooltip content={CustomTooltip} cursor={{ stroke: 'var(--border-color)', strokeDasharray: '3 3' }} />
        {targetPct !== undefined && (
          <ReferenceLine y={targetPct} stroke="#64748B" strokeDasharray="5 4" strokeWidth={1.5} />
        )}
        <Line
          type="monotone"
          dataKey="margin"
          name="Margin"
          stroke={lineColor}
          strokeWidth={2}
          dot={{ r: 3, fill: lineColor, strokeWidth: 0 }}
          activeDot={{ r: 5 }}
          filter={`url(#${glowId})`}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
