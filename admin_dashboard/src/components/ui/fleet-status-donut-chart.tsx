import { useId, useLayoutEffect, useRef, useState } from 'react';
import { PieChart as PieChartIcon } from 'lucide-react';
import { Cell, Pie, PieChart, Tooltip, type TooltipContentProps } from 'recharts';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from './empty';

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

interface FleetStatusDonutChartProps {
  data: DonutSlice[];
  centerLabel?: string;
  height?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Fixed pixel radii rather than percentages of the container. A
   * percentage radius computes against whatever width/height
   * ResponsiveContainer last measured — if that measurement is ever 0
   * (a flex-item parent with the browser's default min-width:auto,
   * or a first paint before ResizeObserver has fired), the ring itself
   * collapses to 0 and nothing draws. Fixed numbers always draw at a
   * known size once the SVG has any area at all. Tuned for the default
   * height=220 card; pass your own for a different size. */
  innerRadius?: number;
  outerRadius?: number;
}

/** Donut chart with a centered total — same glow-filter language as
 * AnalyticsGroupedBarChart, adapted for a single-series proportion view
 * (fleet roadworthiness status, defect severity mix, etc.) instead of a
 * two-series comparison. */
export function FleetStatusDonutChart({
  data,
  centerLabel = 'Total',
  height = 220,
  emptyTitle = 'No Data Yet',
  emptyDescription = 'Nothing to show here yet.',
  innerRadius = 55,
  outerRadius = 75,
}: FleetStatusDonutChartProps) {
  const glowId = useId();
  // Recharts' own ResponsiveContainer measures via ResizeObserver too, but
  // under React 19 StrictMode's dev-only double-invoke that measurement
  // can race and briefly report a null/unmeasured size — Recharts then
  // renders Pie's SVG geometry (cx/cy/etc.) with that null, which React
  // logs as "Expected ... value to be of type number, but found null
  // instead" and the ring never recovers. Measuring the container
  // ourselves sidesteps that specific crash, but a first version of this
  // fix relied solely on ResizeObserver's own (async) callback for the
  // *initial* width too — StrictMode's mount/cleanup/remount cycle can
  // observe() -> disconnect() before that first callback is delivered,
  // silently losing it, so the ring stayed permanently blank inside
  // busier real layouts even though it worked in isolation. A synchronous
  // getBoundingClientRect() read in useLayoutEffect (guaranteed to run,
  // no async delivery to lose) seeds the initial value instead;
  // ResizeObserver is kept only for *subsequent* resizes (sidebar
  // toggle, window resize).
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setContainerWidth(w);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Defensive normalization — a slice with an undefined/NaN value (never
  // supposed to happen given DonutSlice's own type, but a bad upstream
  // computation should degrade to "counts as 0" here, not silently break
  // the whole chart) never reaches Pie's data array.
  const safeData = data.map(d => ({ ...d, value: Number.isFinite(d.value) ? d.value : 0 })).filter(d => d.value > 0);
  const total = safeData.reduce((sum, d) => sum + d.value, 0);

  if (total === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty className="py-0">
          <EmptyHeader>
            <EmptyMedia variant="icon"><PieChartIcon /></EmptyMedia>
            <EmptyTitle>{emptyTitle}</EmptyTitle>
            <EmptyDescription>{emptyDescription}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload }: TooltipContentProps) => {
    if (!active || !payload?.length) return null;
    const slice = payload[0];
    const value = (slice?.value as number) ?? 0;
    const pct = total > 0 ? ((value / total) * 100).toFixed(0) : '0';
    return (
      <div
        style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--border-color)',
          borderRadius: '6px',
          padding: '8px 11px',
          boxShadow: '0 6px 16px rgba(0,0,0,0.2)',
          fontSize: '11px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--charcoal)' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '2px', background: (slice?.payload as any)?.color, display: 'inline-block' }} />
          <span style={{ fontWeight: 700 }}>{slice?.name}</span>
        </div>
        <div style={{ marginTop: '2px', color: 'var(--charcoal-light)' }}>{value} ({pct}%)</div>
      </div>
    );
  };

  const chartHeight = height - 32;

  return (
    <div style={{ width: '100%' }}>
      {/* Explicit pixel height (not %/h-full), and PieChart only mounts
          once our own ResizeObserver reports a real measured width (see
          containerWidth above) rather than trusting Recharts'
          ResponsiveContainer to self-correct. min-width: 0 undoes the
          browser's default min-width: auto on a flex-item parent, the
          other classic cause of a 0-width (so invisible) chart. */}
      <div ref={containerRef} style={{ position: 'relative', height: chartHeight, minHeight: '140px', width: '100%', minWidth: 0 }}>
        {containerWidth > 0 && (
          <PieChart width={containerWidth} height={chartHeight}>
            <defs>
              <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#000000" floodOpacity="0.18" />
              </filter>
            </defs>
            <Pie
              data={safeData}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={innerRadius}
              outerRadius={outerRadius}
              paddingAngle={safeData.length > 1 ? 3 : 0}
              filter={`url(#${glowId})`}
              stroke="none"
              // Recharts 3.10.1's default entry animation (react-smooth's
              // JavascriptAnimation, driven by requestAnimationFrame) never
              // resolves in this app's environment — the sector <path>
              // elements stay permanently unset while animation state is
              // "in progress", so nothing ever draws. Confirmed by direct
              // DOM inspection: 0 <path> nodes with the default animated
              // Pie, 3 real paths the instant isAnimationActive is false.
              // Same root cause reproduced with a bare <Bar> too — this
              // isn't a Pie-specific or data-specific bug.
              isAnimationActive={false}
            >
              {safeData.map((slice, i) => (
                <Cell key={i} fill={slice.color} />
              ))}
            </Pie>
            <Tooltip content={CustomTooltip} />
          </PieChart>
        )}

        {/* Centered total, matching the reference donut's "total in the hole" layout */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--charcoal)', lineHeight: 1 }}>{total}</div>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--charcoal-light)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {centerLabel}
          </div>
        </div>
      </div>

      {/* Legend — normal flow below the chart, not overlaid */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap', marginTop: '10px' }}>
        {safeData.map((slice, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--charcoal-light)' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '2px', background: slice.color, display: 'inline-block' }} />
            {slice.label} ({slice.value})
          </span>
        ))}
      </div>
    </div>
  );
}
