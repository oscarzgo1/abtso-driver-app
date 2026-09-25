// Half-circle variant of 21st.dev @designali-in/gauge.
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SemiGaugeProps {
  /** 0–100; values outside are clamped. */
  value: number;
  color?: string;
  trackColor?: string;
  strokeWidth?: number;
  className?: string;
  /** Rendered centred inside the arc. */
  children?: ReactNode;
}

const ARC = 'M 12 100 A 88 88 0 0 1 188 100';

export function SemiGauge({
  value,
  color = 'var(--brand-red)',
  trackColor = 'var(--card-bg-hover)',
  strokeWidth = 18,
  className,
  children,
}: SemiGaugeProps) {
  const pct = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));

  return (
    <div className={cn('relative w-full', className)}>
      <svg viewBox="0 0 200 108" className="block w-full" fill="none" aria-hidden="true">
        <path d={ARC} stroke={trackColor} strokeWidth={strokeWidth} strokeLinecap="round" pathLength={100} />
        <path
          d={ARC}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          pathLength={100}
          style={{ strokeDasharray: `${pct} 100`, transition: 'stroke-dasharray 900ms cubic-bezier(0.65, 0, 0.35, 1)' }}
          opacity={pct === 0 ? 0 : 1}
        />
      </svg>
      {children && (
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center text-center">{children}</div>
      )}
    </div>
  );
}
