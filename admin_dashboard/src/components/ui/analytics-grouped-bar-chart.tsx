import { useId } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';

/** Compact monospace/tabular-nums axis tick — recharts' plain `tick={{...}}`
 * object only accepts SVG text attributes, not CSS classes, so matching
 * this app's font-mono tabular-nums convention on the axis labels needs a
 * real tick renderer. */
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

export interface GroupedBarChartPoint {
  label: string;
  revenue: number;
  cost: number;
  /** Optional second operating-cost segment (e.g. estimated fuel),
   * stacked onto `cost` to form one "Operating Cost" bar next to
   * Revenue rather than three separate bars. */
  fuel?: number;
  /** Optional dotted overlay — the £ operating-cost ceiling that day's
   * revenue would allow while still hitting a target margin. Only
   * rendered when at least one point provides it. */
  targetCostLine?: number;
}

interface AnalyticsGroupedBarChartProps {
  data: GroupedBarChartPoint[];
  revenueColor?: string;
  costColor?: string;
  fuelColor?: string;
  targetLineColor?: string;
  targetLineLabel?: string;
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
  fuelColor = '#F59E0B',
  targetLineColor = '#64748B',
  targetLineLabel = 'Target margin',
  formatValue,
  height = 240,
}: AnalyticsGroupedBarChartProps) {
  const revenueGlowId = useId();
  const costGlowId = useId();
  const hasFuel = data.some(d => d.fuel !== undefined);
  const hasTargetLine = data.some(d => d.targetCostLine !== undefined);
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
    const fuel = (payload.find(p => p.dataKey === 'fuel')?.value as number) ?? 0;
    const grossProfit = revenue - cost - fuel;
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
            Billed Revenue
          </span>
          <span style={{ fontWeight: 700, color: 'var(--charcoal)' }}>{format(revenue)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '3px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--charcoal-light)' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '2px', background: costColor, display: 'inline-block', flexShrink: 0 }} />
            Driver Wages
          </span>
          <span style={{ fontWeight: 700, color: 'var(--charcoal)' }}>{format(cost)}</span>
        </div>
        {hasFuel && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '6px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--charcoal-light)' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '2px', background: fuelColor, display: 'inline-block', flexShrink: 0 }} />
              Est. Fuel
            </span>
            <span style={{ fontWeight: 700, color: 'var(--charcoal)' }}>{format(fuel)}</span>
          </div>
        )}
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
            paddingTop: '5px', borderTop: '1px solid var(--border-color)',
          }}
        >
          <span style={{ color: 'var(--charcoal-light)' }}>Gross Profit</span>
          <span style={{ fontWeight: 800, color: grossProfit >= 0 ? '#10B981' : '#DC2626' }}>{format(grossProfit)}</span>
        </div>
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 4 }}>
        <defs>
          <filter id={revenueGlowId} x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor={revenueColor} floodOpacity="0.3" />
          </filter>
          <filter id={costGlowId} x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor={costColor} floodOpacity="0.35" />
          </filter>
        </defs>

        {/* Subtle dashed horizontal reference lines — no vertical clutter,
            dense-B2B financial-dashboard convention. */}
        <CartesianGrid horizontal vertical={false} stroke="#E2E8F0" strokeDasharray="3 3" />

        <XAxis
          dataKey="label"
          axisLine={false}
          tickLine={false}
          tick={<MonoTick />}
          tickMargin={8}
          interval="preserveStartEnd"
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={<MonoTick textAnchor="end" dy={4} />}
          tickFormatter={(v) => format(v as number)}
          width={52}
        />
        <Tooltip content={CustomTooltip} cursor={{ fill: 'var(--card-bg-hover)' }} />
        {/* isAnimationActive={false} on every shape below — Recharts
            3.10.1's default entry animation never resolves in this app's
            environment (confirmed by direct DOM inspection: the bar/pie
            <path> elements stay permanently unset while mid-animation,
            so nothing draws at all). Same fix applied to
            fleet-status-donut-chart.tsx's <Pie>. */}
        <Bar dataKey="revenue" name="Billed Revenue" fill={revenueColor} radius={[3, 3, 0, 0]} barSize={18} filter={`url(#${revenueGlowId})`} isAnimationActive={false} />
        {/* Operating cost is one visual bar, stacked: wages on the bottom,
            fuel on top — "cost" only gets rounded top corners when there's
            no fuel segment sitting above it. */}
        <Bar dataKey="cost" name="Driver Wages" stackId="opex" fill={costColor} radius={hasFuel ? [0, 0, 0, 0] : [3, 3, 0, 0]} barSize={18} filter={`url(#${costGlowId})`} isAnimationActive={false} />
        {hasFuel && <Bar dataKey="fuel" name="Est. Fuel" stackId="opex" fill={fuelColor} radius={[3, 3, 0, 0]} barSize={18} isAnimationActive={false} />}
        {hasTargetLine && (
          <Line
            type="monotone"
            dataKey="targetCostLine"
            name={targetLineLabel}
            stroke={targetLineColor}
            strokeWidth={1.5}
            strokeDasharray="5 4"
            dot={false}
            activeDot={false}
            legendType="none"
            isAnimationActive={false}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
