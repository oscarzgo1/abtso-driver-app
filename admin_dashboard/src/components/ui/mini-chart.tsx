'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

export interface MiniChartDataPoint {
  /** Row label (e.g. a weekday abbreviation). */
  label: string;
  value: number;
  /** Longer label for the hover tooltip/header value, if different from `label`. */
  tooltipLabel?: string;
}

interface MiniChartProps {
  title: string;
  data: MiniChartDataPoint[];
  /** Appended after the value in the header and each row's value. */
  unit?: string;
  formatValue?: (value: number) => string;
  className?: string;
}

/** A vertical variant of the 21st.dev "Mini Chart" reference
 * (@jatin-yadav05/mini-chart) — same pulsing-dot header with a
 * hover-revealed value and the same hover-glow container, but the chart
 * itself is a stacked list of horizontal fill-bars (one row per data
 * point) instead of the reference's row of vertical bars, per request.
 * Each row's value is shown inline rather than behind a hover tooltip —
 * with every row already visible at once in a vertical list, hovering
 * each one individually for its number is more friction than it's worth.
 *
 * Bars scale off the largest magnitude in the set (not a plain max),
 * since Net Margin can be negative on a loss-making day — a negative
 * row still needs a visible bar, just in the same red already used for
 * negative margin elsewhere on this page, rather than clipping to
 * nothing. */
export function MiniChart({ title, data, unit = '', formatValue, className }: MiniChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const maxAbsValue = Math.max(...data.map(d => Math.abs(d.value)), 1);
  const format = formatValue ?? ((v: number) => v.toFixed(1));
  const hovered = hoveredIndex !== null ? data[hoveredIndex] : null;

  return (
    <div
      className={cn(
        'group relative w-72 p-6 rounded-2xl bg-foreground/[0.02] border border-foreground/[0.06] backdrop-blur-sm transition-all duration-500 hover:bg-foreground/[0.04] hover:border-foreground/[0.1] flex flex-col gap-4',
        className,
      )}
      onMouseLeave={() => setHoveredIndex(null)}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-medium text-muted-foreground tracking-wide uppercase">{title}</span>
        </div>
        <div className="relative h-7 flex items-center">
          <span
            className={cn(
              'text-lg font-semibold tabular-nums transition-all duration-300 ease-out',
              hovered !== null ? 'opacity-100 text-foreground' : 'opacity-50 text-muted-foreground',
            )}
          >
            {hovered !== null ? format(hovered.value) : ''}
            <span className={cn('text-xs font-normal text-muted-foreground ml-0.5 transition-opacity duration-300', hovered !== null ? 'opacity-100' : 'opacity-0')}>
              {unit}
            </span>
          </span>
        </div>
      </div>

      {/* Chart — one horizontal fill-bar row per data point */}
      <div className="flex flex-col gap-2.5">
        {data.map((item, index) => {
          const widthPct = Math.max((Math.abs(item.value) / maxAbsValue) * 100, 4);
          const isHovered = hoveredIndex === index;
          const isNegative = item.value < 0;

          return (
            <div
              key={`${item.label}-${index}`}
              className="flex items-center gap-3 cursor-pointer"
              onMouseEnter={() => setHoveredIndex(index)}
            >
              <span className={cn('text-[10px] font-medium w-8 flex-shrink-0 transition-colors duration-300', isHovered ? 'text-foreground' : 'text-muted-foreground/60')}>
                {item.label}
              </span>
              <div className="flex-1 h-2 rounded-full bg-foreground/10 overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-300 ease-out',
                    isNegative
                      ? isHovered ? 'bg-[var(--brand-red)]' : 'bg-[var(--brand-red)]/55'
                      : isHovered ? 'bg-foreground' : 'bg-foreground/40 group-hover:bg-foreground/50',
                  )}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              <span
                className={cn(
                  'text-[11px] font-semibold tabular-nums w-12 flex-shrink-0 text-right transition-colors duration-300',
                  isHovered ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {format(item.value)}
                {unit}
              </span>
            </div>
          );
        })}
      </div>

      {/* Subtle glow effect on hover */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-foreground/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
    </div>
  );
}
