import { Bell, RefreshCw } from 'lucide-react';
import { Button } from './button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from './empty';
import { cn } from '@/lib/utils';

// ============================================================
// NoData — the one empty state used wherever a screen has nothing to show
// yet (new companies in particular). The 21st.dev "Empty Background"
// component by uiable (@uiable/empty-background), unchanged apart from the
// title, which reads "No Data". Refresh re-loads the page's data; pass
// onRefresh to refresh just that screen instead.
// ============================================================

export default function NoData({ className, onRefresh }: { className?: string; onRefresh?: () => void }) {
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
        <Button className="gap-1" onClick={onRefresh ?? (() => window.location.reload())}>
          <RefreshCw />
          Refresh
        </Button>
      </EmptyContent>
    </Empty>
  );
}

export { NoData };
