// "Recent Activity" list from 21st.dev @lavikatiyar/list (built from the
// reference screenshot), restyled to the admin panel's light tokens.
import type { ReactNode } from 'react';

export interface ActivityListItem {
  key: string;
  title: string;
  subtitle?: string;
  /** Signed amount — drives the +/− prefix and green/red colour. */
  amount: number;
  formatAmount: (absolute: number) => string;
  meta?: string;
}

interface ActivityListProps {
  title: string;
  icon?: ReactNode;
  subtitle?: string;
  items: ActivityListItem[];
  emptyText?: string;
  maxHeight?: number;
}

export function ActivityList({ title, icon, subtitle, items, emptyText = 'Nothing to show yet.', maxHeight = 380 }: ActivityListProps) {
  return (
    <div className="activity-list">
      <div className="activity-list-header">
        <span className="activity-list-title">{icon}{title}</span>
        {subtitle && <span className="activity-list-subtitle">{subtitle}</span>}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted" style={{ padding: '12px 0', margin: 0 }}>{emptyText}</p>
      ) : (
        <ul className="activity-list-items" style={{ maxHeight }}>
          {items.map(item => {
            const positive = item.amount >= 0;
            return (
              <li key={item.key} className="activity-list-row">
                <span className="activity-list-main">
                  <span className="activity-list-name">{item.title}</span>
                  {item.subtitle && <span className="activity-list-desc">{item.subtitle}</span>}
                </span>
                <span className="activity-list-end">
                  <span className="activity-list-amount" style={{ color: positive ? '#10B981' : 'var(--brand-red)' }}>
                    {positive ? '+' : '−'} {item.formatAmount(Math.abs(item.amount))}
                  </span>
                  {item.meta && <span className="activity-list-meta">{item.meta}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
