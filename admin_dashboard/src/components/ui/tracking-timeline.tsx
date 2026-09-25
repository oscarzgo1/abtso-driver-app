// Adapted from 21st.dev @kavikatiyar/tracker-card-1 (timeline only).
import { motion } from 'framer-motion';
import { CheckCircle2, CircleDot, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TimelineStepStatus = 'completed' | 'active' | 'pending';

export interface TimelineStep {
  title: string;
  detail?: string;
  time?: string;
  status: TimelineStepStatus;
}

// The app's own .text-success / brand red / .text-muted colours — its
// unlayered .text-primary would override Tailwind's, so colours go inline.
const STATUS_ATTRS: Record<TimelineStepStatus, { Icon: typeof Circle; color: string; line: string }> = {
  completed: { Icon: CheckCircle2, color: '#2E7D32', line: '#2E7D32' },
  active: { Icon: CircleDot, color: 'var(--brand-red)', line: 'var(--border-color)' },
  pending: { Icon: Circle, color: 'var(--charcoal-light)', line: 'var(--border-color)' },
};

const container = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.12 } } };
const item = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 120, damping: 14 } } };

export function TrackingTimeline({ steps, className }: { steps: TimelineStep[]; className?: string }) {
  return (
    <motion.ul
      // Re-run the entrance when a different shipment's steps come in.
      key={steps.map(s => s.title + s.status).join('|')}
      className={cn('relative m-0 list-none p-0', className)}
      variants={container}
      initial="hidden"
      animate="visible"
    >
      {steps.map((step, index) => {
        const { Icon, color, line } = STATUS_ATTRS[step.status];
        const isLast = index === steps.length - 1;
        return (
          <motion.li key={step.title} className="flex items-start gap-3" variants={item}>
            <div className="relative flex flex-col items-center">
              <div className="z-10 flex h-6 w-6 items-center justify-center rounded-full" style={{ background: 'var(--card-bg)' }}>
                <Icon size={16} color={color} />
              </div>
              {!isLast && <div className="absolute top-6 h-[calc(100%-0.5rem)] w-0.5" style={{ background: line }} />}
            </div>
            <div className="flex flex-1 items-start justify-between gap-3 pb-4">
              <div className="min-w-0">
                <p className="m-0 text-sm font-bold" style={{ color: step.status === 'pending' ? 'var(--charcoal-light)' : 'var(--charcoal)' }}>{step.title}</p>
                {step.detail && <p className="m-0 truncate text-xs text-muted">{step.detail}</p>}
              </div>
              <span className="shrink-0 font-mono text-xs text-muted" style={{ fontVariantNumeric: 'tabular-nums' }}>{step.time ?? '--:--'}</span>
            </div>
          </motion.li>
        );
      })}
    </motion.ul>
  );
}
