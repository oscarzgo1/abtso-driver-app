import { useId } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';

export interface GroupedBarChartPoint {
  label: string;
  revenue: number;
  cost: number;
}

interface AnalyticsGroupedBarChartProps {
  data: GroupedBarChartPoint[];
  revenueColor?: string;
  costColor?: string;
  formatValue?: (value: number) => string;
  height?: number;
}

/** Two-series comparison — Load Revenue vs Driver Cost, per day — in the
 * same dotted-grid + per-series glow visual language as the single-metric
 * AnalyticsBarChart it sits alongside elsewhere in this file.
 *
 * Deliberately does NOT set a `barGap` prop on `<BarChart>`: combined with
 * a fixed `barSize` on multiple grouped `<Bar>` series, that combination
 * previously produced zero-dimension (silently invisible) bars in this
 * app's recharts version — explicit `barSize` with no `barGap` override
 * is the confirmed-working combination. */
export function AnalyticsGroupedBarChart({
  data,
  revenueColor = '#0F172A',
  costColor = '#CC0000',
  formatValue,
  height = 240,
}: AnalyticsGroupedBarChartProps) {
  const gridId = useId();
  const revenueGlowId = useId();
  const costGlowId = useId();
  const format = formatValue ?? ((v: number) => `£${v.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`);

  if (data.length === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="text-sm text-muted">
        No rated loads yet for this period.
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }: TooltipContentProps) => {
    if (!active || !payload?.length) return null;
    const revenue = (payload.find(p => p.dataKey === 'revenue')?.value as number) ?? 0;
    const cost = (payload.find(p => p.dataKey === 'cost')?.value as number) ?? 0;
    const netProfit = revenue - cost;
    return (
      <div
        style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--border-color)',
          borderRadius: '6px',
          padding: '8px 11px',
          boxShadow: '0 6px 16px rgba(0,0,0,0.2)',
          fontSize: '11px',
          minWidth: '150px',
        }}
      >
        <div style={{ color: 'var(--charcoal-light)', marginBottom: '6px', fontWeight: 700 }}>{label}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '3px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--charcoal-light)' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '2px', background: revenueColor, display: 'inline-block', flexShrink: 0 }} />
            Load Revenue
          </span>
          <span style={{ fontWeight: 700, color: 'var(--charcoal)' }}>{format(revenue)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '6px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--charcoal-light)' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '2px', background: costColor, display: 'inline-block', flexShrink: 0 }} />
            Driver Cost
          </span>
          <span style={{ fontWeight: 700, color: 'var(--charcoal)' }}>{format(cost)}</span>
        </div>
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
            paddingTop: '5px', borderTop: '1px solid var(--border-color)',
          }}
        >
          <span style={{ color: 'var(--charcoal-light)' }}>Net Profit</span>
          <span style={{ fontWeight: 800, color: netProfit >= 0 ? '#10B981' : '#DC2626' }}>{format(netProfit)}</span>
        </div>
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 4 }}>
        <defs>
          <pattern id={gridId} x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
            <circle cx="8" cy="8" r="0.9" fill="var(--border-color)" />
          </pattern>
          <filter id={revenueGlowId} x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor={revenueColor} floodOpacity="0.3" />
          </filter>
          <filter id={costGlowId} x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor={costColor} floodOpacity="0.35" />
          </filter>
        </defs>

        <rect x="0" y="0" width="100%" height="100%" fill={`url(#${gridId})`} style={{ pointerEvents: 'none' }} />

        <XAxis
          dataKey="label"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 10, fill: 'var(--charcoal-light)' }}
          tickMargin={8}
          interval="preserveStartEnd"
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 10, fill: 'var(--charcoal-light)' }}
          tickFormatter={(v) => format(v as number)}
          width={52}
        />
        <Tooltip content={CustomTooltip} cursor={{ fill: 'var(--card-bg-hover)' }} />
        <Bar dataKey="revenue" name="Load Revenue" fill={revenueColor} radius={[3, 3, 0, 0]} barSize={18} filter={`url(#${revenueGlowId})`} />
        <Bar dataKey="cost" name="Driver Cost" fill={costColor} radius={[3, 3, 0, 0]} barSize={18} filter={`url(#${costGlowId})`} />
      </BarChart>
    </ResponsiveContainer>
  );
}
