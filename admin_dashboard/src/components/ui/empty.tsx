'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import type React from 'react';
import { cn } from '@/lib/utils';

/** The 21st.dev "Empty" reference (@cnippet-dev/cnippet-empty): a
 * composable empty-state block (Empty > EmptyHeader > EmptyMedia >
 * EmptyTitle/EmptyDescription, plus EmptyContent for actions) instead of
 * the one-off centered-text-with-an-emoji pattern this app had scattered
 * across every "no data" case. The reference's own dark-mode shadow
 * refinement (`not-dark:`/`dark:before:` Tailwind variants on the icon
 * chip) is dropped — this app's dark mode is a `[data-theme="dark"]`
 * attribute toggle, not Tailwind's own `dark:` class/media strategy, so
 * those variants would silently never activate here. Everything else —
 * the layered-cards-behind-the-icon treatment, the class structure — is
 * unchanged; the card/border colours already resolve through this app's
 * own theme tokens either way. */
const emptyMediaVariants = cva(
  "flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    defaultVariants: {
      variant: 'default',
    },
    variants: {
      variant: {
        default: 'bg-transparent',
        icon: "relative flex size-9 shrink-0 items-center justify-center rounded-md border bg-card text-foreground shadow-sm [&_svg:not([class*='size-'])]:size-4.5",
      },
    },
  },
);

export function Empty({ className, ...props }: React.ComponentProps<'div'>): React.ReactElement {
  return (
    <div
      className={cn('flex min-w-0 flex-1 flex-col items-center justify-center gap-6 text-balance px-6 py-12 text-center md:py-20', className)}
      data-slot="empty"
      {...props}
    />
  );
}

export function EmptyHeader({ className, ...props }: React.ComponentProps<'div'>): React.ReactElement {
  return (
    <div className={cn('flex max-w-sm flex-col items-center text-center', className)} data-slot="empty-header" {...props} />
  );
}

export function EmptyMedia({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof emptyMediaVariants>): React.ReactElement {
  return (
    <div className={cn('relative mb-6', className)} data-slot="empty-media" data-variant={variant ?? undefined}>
      {variant === 'icon' && (
        <>
          <div
            aria-hidden="true"
            className={cn(emptyMediaVariants({ variant }), 'pointer-events-none absolute bottom-px origin-bottom-left -translate-x-0.5 -rotate-10 scale-84 shadow-none')}
          />
          <div
            aria-hidden="true"
            className={cn(emptyMediaVariants({ variant }), 'pointer-events-none absolute bottom-px origin-bottom-right translate-x-0.5 rotate-10 scale-84 shadow-none')}
          />
        </>
      )}
      <div className={cn(emptyMediaVariants({ variant }), className)} {...props} />
    </div>
  );
}

export function EmptyTitle({ className, ...props }: React.ComponentProps<'div'>): React.ReactElement {
  return <div className={cn('font-semibold text-xl', className)} data-slot="empty-title" {...props} />;
}

export function EmptyDescription({ className, ...props }: React.ComponentProps<'p'>): React.ReactElement {
  return (
    <div
      className={cn(
        "text-muted-foreground text-sm [&>a:hover]:text-primary [&>a]:underline [&>a]:underline-offset-4 [[data-slot=empty-title]+&]:mt-1",
        className,
      )}
      data-slot="empty-description"
      {...props}
    />
  );
}

export function EmptyContent({ className, ...props }: React.ComponentProps<'div'>): React.ReactElement {
  return (
    <div className={cn('flex w-full min-w-0 max-w-sm flex-col items-center gap-4 text-balance text-sm', className)} data-slot="empty-content" {...props} />
  );
}

export default Empty;
