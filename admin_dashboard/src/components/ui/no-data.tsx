import { useEffect, useRef, useState } from 'react';
import { Bell, RefreshCw } from 'lucide-react';
import { Button } from './button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from './empty';
import { cn } from '@/lib/utils';
import { requestSectionRefresh } from '@/lib/section-refresh';

// ============================================================
// NoData — the one empty state used wherever a screen has nothing to show
// yet (new companies in particular). The 21st.dev "Empty Background"
// component by uiable (@uiable/empty-background), unchanged apart from the
// title, which reads "No Data". Refresh spins while it checks and reloads
// only the section on screen (see lib/section-refresh); pass onRefresh to
// run something specific instead.
// ============================================================

export default function NoData({ className, onRefresh }: { className?: string; onRefresh?: () => void | Promise<unknown> }) {
  const [spinning, setSpinning] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const refresh = async () => {
    if (spinning) return;
    setSpinning(true);
    const started = Date.now();
    try {
      if (onRefresh) await onRefresh();
      else requestSectionRefresh();
    } finally {
      // Keep it turning long enough to be seen, even when the reload is instant.
      timer.current = setTimeout(() => setSpinning(false), Math.max(0, 900 - (Date.now() - started)));
    }
  };

  return (
    <Empty className={cn('bg-background h-full rounded-lg', className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Bell />
        </EmptyMedia>
        <EmptyTitle>No Data</EmptyTitle>
        <EmptyDescription className="max-w-xs text-pretty">
          You&apos;re all caught up. New notifications will appear here.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button className="gap-1" onClick={refresh}>
          <RefreshCw className={spinning ? 'nodata-spin' : undefined} />
          Refresh
        </Button>
      </EmptyContent>
    </Empty>
  );
}

export { NoData };
