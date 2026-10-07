import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';
import { requestSectionRefresh } from '@/lib/section-refresh';

// ============================================================
// NoData — the one empty state used wherever a screen has nothing to show
// yet (new companies in particular). The 21st.dev "Empty Background"
// component by uiable (@uiable/empty-background), unchanged apart from the
// title, which reads "No Data", and now shown compactly without the icon. Refresh spins while it checks and reloads
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

  // Compact on purpose: no icon, small text, so an empty table or panel
  // does not take up a lot of room. Vertical padding from callers is overridden.
  return (
    <div className={cn('flex w-full flex-col items-center justify-center gap-1 px-3 text-center', className, 'py-3')} data-slot="no-data">
      <p className="m-0 text-sm font-bold text-foreground">No Data</p>
      <p className="m-0 max-w-xs text-pretty text-xs text-muted-foreground">You&apos;re all caught up. New notifications will appear here.</p>
      <Button className="mt-1.5 h-7 gap-1 px-3 text-xs" onClick={refresh}>
        <RefreshCw className={cn('size-3', spinning ? 'nodata-spin' : undefined)} />
        Refresh
      </Button>
    </div>
  );
}

export { NoData };
