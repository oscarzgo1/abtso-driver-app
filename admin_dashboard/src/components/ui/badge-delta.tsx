import { ArrowUp, ArrowDown, ArrowRight } from 'lucide-react';

export type BadgeDeltaTone = 'positive' | 'negative' | 'neutral';
export type BadgeDeltaDirection = 'up' | 'down' | 'flat';

interface BadgeDeltaProps {
  label: string;
  direction: BadgeDeltaDirection;
  tone: BadgeDeltaTone;
}

const TONE_COLOR: Record<BadgeDeltaTone, string> = {
  positive: '#10B981',
  negative: 'var(--brand-red)',
  neutral: 'var(--charcoal-light)',
};

const DIRECTION_ICON = { up: ArrowUp, down: ArrowDown, flat: ArrowRight } as const;

/** The "Badge Delta" catalogue component (serafimcloud), outline variant —
 * a thin bordered pill with a directional arrow + change value. Re-skinned
 * from Tremor's emerald/red/gray palette to this app's own tokens (the
 * emerald already matches the Net Profit KPI color 1:1; red reuses the
 * brand red already standing for "cost/bad" throughout the cockpit) and
 * from @remixicon/react to the lucide-react set already used across the
 * app. `tone` is decided by the caller per metric — a Driver Cost increase
 * is `negative`, a Load Revenue increase is `positive`, so it can't be
 * inferred from `direction` alone. */
export function BadgeDelta({ label, direction, tone }: BadgeDeltaProps) {
  const Icon = DIRECTION_ICON[direction];
  return (
    <span
      className="inline-flex items-center"
      style={{
        gap: '3px',
        borderRadius: '6px',
        border: '1px solid var(--border-color)',
        padding: '2px 6px',
        fontSize: '11px',
        fontWeight: 700,
        color: TONE_COLOR[tone],
        lineHeight: 1.4,
      }}
    >
      <Icon size={11} strokeWidth={3} />
      {label}
    </span>
  );
}
