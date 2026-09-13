import * as React from 'react';
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

/** Adapted from the "Alert" catalogue component (sean0205/ReUI, "alert-1",
 * "actions" demo) — same card shape, slot structure (icon + title +
 * description, then a bottom toolbar row of inline text-link actions
 * instead of pill buttons) and solid/light appearance split as the
 * reference.
 *
 * Two real deviations from the literal source:
 * 1. The reference exposes 7 color variants (primary/destructive/success/
 *    info/mono/warning/secondary) across 4 appearances and 3 sizes — this
 *    app only ever needs three real severities (critical/warning/neutral)
 *    at one size, so the unused combinations were dropped rather than
 *    ported dead. `critical`/`neutral` map onto this app's existing
 *    --color-destructive/--color-muted theme tokens (auto brand-correct,
 *    zero manual override, same as every other shadcn copy in this repo);
 *    `warning` uses the exact amber (#FEF3C7/#92400E) already used
 *    elsewhere in this file for idle/pending states, not a new color.
 * 2. Dropped the reference's corner "×" AlertClose icon button — the
 *    "actions" demo this was modeled on puts dismissal in the text-link
 *    toolbar instead, which is what every call site here actually uses. */

const alertVariants = cva('flex items-start w-full gap-3 rounded-lg p-3.5 text-sm transition-opacity', {
  variants: {
    variant: {
      critical: '',
      warning: '',
      neutral: '',
    },
    appearance: {
      solid: '',
      light: '',
    },
  },
  compoundVariants: [
    { variant: 'critical', appearance: 'solid', className: 'bg-destructive text-destructive-foreground' },
    { variant: 'critical', appearance: 'light', className: 'bg-[#FCEBEB] border border-[#F5C4B3] text-[#791F1F]' },
    { variant: 'warning', appearance: 'solid', className: 'bg-[#F59E0B] text-white' },
    { variant: 'warning', appearance: 'light', className: 'bg-[#FEF3C7] border border-[#FDE68A] text-[#92400E]' },
    { variant: 'neutral', appearance: 'light', className: 'bg-muted border border-border text-muted-foreground' },
  ],
  defaultVariants: {
    variant: 'neutral',
    appearance: 'light',
  },
});

interface AlertProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {}

function Alert({ className, variant, appearance, children, ...props }: AlertProps) {
  return (
    <div data-slot="alert" role="alert" className={cn(alertVariants({ variant, appearance }), className)} {...props}>
      {children}
    </div>
  );
}

function AlertIcon({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div data-slot="alert-icon" className={cn('shrink-0 mt-0.5 [&>svg]:size-5', className)} {...props}>
      {children}
    </div>
  );
}

function AlertContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="alert-content" className={cn('flex-1 min-w-0 space-y-1', className)} {...props} />;
}

function AlertTitle({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="alert-title" className={cn('font-bold tracking-tight', className)} {...props} />;
}

function AlertDescription({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="alert-description" className={cn('text-xs opacity-90 space-y-1', className)} {...props} />;
}

/** Row of inline text-link actions under the description — underline on
 * the primary action, plain on the rest, exactly like the reference's
 * "Upgrade" / "Dismiss" pair, extended to as many real actions as a given
 * alert actually has. */
function AlertToolbar({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div data-slot="alert-toolbar" className={cn('flex items-center gap-4 pt-1 text-xs font-bold', className)} {...props}>
      {children}
    </div>
  );
}

export { Alert, AlertContent, AlertDescription, AlertIcon, AlertTitle, AlertToolbar };
