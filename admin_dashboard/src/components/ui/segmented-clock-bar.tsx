// ============================================================
// SegmentedClockBar — adapted from the 21st.dev "Circle Progress"
// component (@hihahihahoho/circle-progress): kept its core engineering
// (value/maxValue fill percentage, bucketed colour-threshold function,
// animated fill transition) but rendered linear rather than circular,
// and with the danger zones baked into the track itself as visible
// colour segments — the shape requirement 2 of the Driver Hours spec
// explicitly calls for ("Linear Segmented Progress Bars"), since a
// large circular gauge doesn't fit a dense table row. Palette is
// Tachyo's brand tokens (#10B981/#F59E0B/#CC0000), not the reference's
// own emerald/amber/red demo classes.
// ============================================================

interface SegmentedClockBarProps {
  valueMinutes: number;
  maxMinutes: number;
  amberAtMinutes: number;
  redAtMinutes: number;
  valueLabel: string;
  maxLabel: string;
  subtitle: string;
}

export type ClockTier = 'green' | 'amber' | 'red';

export function clockTier(minutes: number, amberAt: number, redAt: number): ClockTier {
  if (minutes >= redAt) return 'red';
  if (minutes >= amberAt) return 'amber';
  return 'green';
}

const TIER_COLOR: Record<ClockTier, string> = {
  green: '#10B981',
  amber: '#F59E0B',
  red: '#CC0000',
};

export function SegmentedClockBar({
  valueMinutes,
  maxMinutes,
  amberAtMinutes,
  redAtMinutes,
  valueLabel,
  maxLabel,
  subtitle,
}: SegmentedClockBarProps) {
  const pct = Math.max(0, Math.min(valueMinutes / maxMinutes, 1)) * 100;
  const amberPct = Math.max(0, Math.min(amberAtMinutes / maxMinutes, 1)) * 100;
  const redPct = Math.max(0, Math.min(redAtMinutes / maxMinutes, 1)) * 100;
  const tier = clockTier(valueMinutes, amberAtMinutes, redAtMinutes);
  const color = TIER_COLOR[tier];

  return (
    <div style={{ minWidth: '150px' }}>
      <div className="flex align-center" style={{ gap: '4px', marginBottom: '5px' }}>
        <span className="font-mono tabular-nums font-bold" style={{ fontSize: '12.5px', color }}>
          {valueLabel}
        </span>
        <span className="font-mono tabular-nums text-muted" style={{ fontSize: '12.5px' }}>
          / {maxLabel}
        </span>
      </div>
      <div
        style={{
          position: 'relative',
          height: '6px',
          borderRadius: '999px',
          overflow: 'hidden',
          background: `linear-gradient(to right,
            #E2E8F0 0%, #E2E8F0 ${amberPct}%,
            rgba(245, 158, 11, 0.28) ${amberPct}%, rgba(245, 158, 11, 0.28) ${redPct}%,
            rgba(204, 0, 0, 0.22) ${redPct}%, rgba(204, 0, 0, 0.22) 100%)`,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            width: `${pct}%`,
            background: color,
            borderRadius: '999px',
            transition: 'width 0.5s ease-out, background-color 0.3s ease-out',
          }}
        />
      </div>
      <p className="text-xs m-0" style={{ marginTop: '4px', color: tier === 'green' ? 'var(--charcoal-light)' : color, fontWeight: tier === 'green' ? 500 : 700 }}>
        {subtitle}
      </p>
    </div>
  );
}
