// "Stats Card" from 21st.dev (@kavikatiyar/stats-card): a header with an
// icon, title and arrow action; a headline figure with its change against
// the comparison period; and a paired bar chart (this period vs the
// previous one) whose bars grow in with a staggered framer-motion spring.
// Restyled to the admin panel's tokens (brand red instead of violet,
// --card-bg / --border-color surfaces) so it follows light and dark mode.
// Adapted for Analytics: raw values are normalised here (callers pass £,
// not percentages), negative values get a red stub instead of vanishing,
// and an optional footer carries per-entity detail rows.
import * as React from 'react';
import { motion, type Variants } from 'framer-motion';
import { ArrowRight, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export interface ChartDataPoint {
  label: string;
  /** Value for the primary bar (this period). Any unit — normalised per card. */
  currentValue: number;
  /** Value for the secondary bar (the previous period). */
  previousValue: number;
  /** Native tooltip for the pair, e.g. the full name or date range. */
  hint?: string;
}

export interface ActivityStatsCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: string;
  icon: React.ReactNode;
  /** The headline figure, already formatted (e.g. "£6,766"). */
  mainValue: string;
  /** Paints the headline red — for a loss. */
  negative?: boolean;
  /** Small line under the headline (e.g. "21 shifts · 212 h"). */
  subtitle?: React.ReactNode;
  /** Percentage change; null when there is nothing to compare against. */
  changeValue: number | null;
  changeDescription: string;
  /** Shown instead of the change when changeValue is null. */
  noChangeText?: string;
  chartData: ChartDataPoint[];
  onActionClick?: () => void;
  actionLabel?: string;
  /** Highlights the card (used when it doubles as a tab selector). */
  active?: boolean;
  primaryBarColor?: string;
  secondaryBarColor?: string;
  footer?: React.ReactNode;
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.15 } },
};

const barVariants: Variants = {
  hidden: { height: '0%', opacity: 0 },
  visible: (height: number) => ({
    height: `${height}%`,
    opacity: 1,
    transition: { type: 'spring', stiffness: 300, damping: 25 },
  }),
};

const ActivityStatsCard = React.forwardRef<HTMLDivElement, ActivityStatsCardProps>(
  (
    {
      className,
      style,
      title,
      icon,
      mainValue,
      negative,
      subtitle,
      changeValue,
      changeDescription,
      noChangeText = 'No previous period to compare',
      chartData,
      onActionClick,
      actionLabel = 'View details',
      active,
      primaryBarColor = 'var(--brand-red)',
      secondaryBarColor = 'var(--stats-bar-secondary)',
      footer,
      ...props
    },
    ref,
  ) => {
    const up = changeValue !== null && changeValue > 0.05;
    const down = changeValue !== null && changeValue < -0.05;
    const ChangeIndicator = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
    const changeColor = up ? '#10B981' : down ? 'var(--brand-red)' : 'var(--charcoal-light)';

    // Normalise to the card's own largest value so every card uses its
    // full chart height; a zero-only series renders as flat stubs.
    const max = Math.max(1e-9, ...chartData.flatMap(p => [p.currentValue, p.previousValue]));
    const heightOf = (v: number) => (v <= 0 ? 0 : Math.max(4, (v / max) * 100));
    // Re-run the grow-in when the underlying numbers change (new period).
    const chartKey = chartData.map(p => `${p.label}:${p.currentValue.toFixed(0)}:${p.previousValue.toFixed(0)}`).join('|');

    return (
      <Card
        ref={ref}
        className={cn('stats-card flex h-full w-full flex-col overflow-hidden', active && 'stats-card--active', className)}
        style={style}
        {...props}
      >
        <CardHeader className="stats-card-header">
          <div className="flex items-center justify-between" style={{ gap: '10px' }}>
            <div className="flex items-center" style={{ gap: '10px', minWidth: 0 }}>
              <span className="stats-card-icon">{icon}</span>
              <CardTitle className="stats-card-title" title={title}>{title}</CardTitle>
            </div>
            {onActionClick && (
              <button type="button" className="stats-card-action" onClick={onActionClick} aria-label={actionLabel} title={actionLabel}>
                <ArrowRight size={18} />
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="stats-card-content flex flex-1 flex-col">
          <p className="stats-card-value tabular-nums" style={{ color: negative ? 'var(--brand-red)' : undefined }}>{mainValue}</p>
          {subtitle && <p className="stats-card-subtitle">{subtitle}</p>}
          <div className="flex items-center text-xs" style={{ gap: '4px', color: changeColor, marginTop: '4px' }}>
            {changeValue === null ? (
              <span className="text-muted">{noChangeText}</span>
            ) : (
              <>
                <ChangeIndicator size={14} />
                <span className="font-bold">{Math.abs(changeValue).toFixed(1)}%</span>
                <span className="text-muted">{changeDescription}</span>
              </>
            )}
          </div>

          {/* Bar chart */}
          <div className="stats-card-chart">
            <motion.div
              key={chartKey}
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="flex h-full w-full items-end justify-between"
              style={{ gap: '8px' }}
            >
              {chartData.map((point, i) => (
                <div
                  key={`${point.label}-${i}`}
                  className="flex h-full flex-1 flex-col items-center justify-end"
                  style={{ gap: '6px', minWidth: 0 }}
                  title={point.hint}
                >
                  <div className="relative flex h-full w-full items-end justify-center" style={{ gap: '3px' }}>
                    <motion.div
                      custom={heightOf(point.currentValue)}
                      variants={barVariants}
                      className="stats-card-bar"
                      style={{ background: point.currentValue < 0 ? 'var(--charcoal)' : primaryBarColor, minHeight: point.currentValue < 0 ? '3px' : undefined }}
                      role="img"
                      aria-label={`${point.hint ?? point.label} — this period: ${point.currentValue.toFixed(0)}`}
                    />
                    <motion.div
                      custom={heightOf(point.previousValue)}
                      variants={barVariants}
                      className="stats-card-bar"
                      style={{ background: secondaryBarColor }}
                      role="img"
                      aria-label={`${point.hint ?? point.label} — previous period: ${point.previousValue.toFixed(0)}`}
                    />
                  </div>
                  <span className="stats-card-label">{point.label}</span>
                </div>
              ))}
            </motion.div>
          </div>

          {footer && <div className="stats-card-footer">{footer}</div>}
        </CardContent>
      </Card>
    );
  },
);
ActivityStatsCard.displayName = 'ActivityStatsCard';

/** Two-column label/value rows for a stats card footer. */
function StatsCardRows({ rows }: { rows: { label: string; value: React.ReactNode; bad?: boolean }[] }) {
  return (
    <div className="stats-card-rows">
      {rows.map(r => (
        <div key={r.label} className="stats-card-row">
          <span className="text-secondary">{r.label}</span>
          <span className="font-mono font-bold tabular-nums" style={{ color: r.bad ? 'var(--brand-red)' : 'var(--charcoal)' }}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export { ActivityStatsCard, StatsCardRows };
