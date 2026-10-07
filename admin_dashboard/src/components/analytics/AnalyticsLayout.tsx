// Page and section chrome for the Analytics tab. The page header follows
// 21st.dev @olewandowski1/page-header-2 (title + status badge on the left,
// actions on the right, a hairline underneath); section and card headers
// follow the Layro ChartCard from @uvain/revenue-charts-kpi (a readable
// title with a muted one-line description and an actions slot) — restyled
// to the admin panel's tokens.
import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

export function AnalyticsPageHeader({ title, badge, description, actions, actionsRef }: {
  title: string;
  badge?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Extra actions mounted from a child section (see AnalyticsBreakdowns' report buttons). */
  actionsRef?: (el: HTMLDivElement | null) => void;
}) {
  return (
    <header className="an-page-head">
      <div className="an-page-head-text">
        <div className="an-page-title-row">
          <h1 className="an-page-title">{title}</h1>
          {badge}
        </div>
        {description && <p className="an-page-desc">{description}</p>}
      </div>
      <div className="an-page-actions">
        {actions}
        <div ref={actionsRef} className="an-page-actions-slot" />
      </div>
    </header>
  );
}

export function AnalyticsSection({ title, description, actions, children }: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="an-section">
      <div className="an-section-head">
        <div>
          <h2 className="an-section-title">{title}</h2>
          {description && <p className="an-section-desc">{description}</p>}
        </div>
        {actions && <div className="an-section-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** A plain bordered card with an optional icon/title/description header. */
export function AnalyticsCard({ title, description, icon, actions, tone, className = '', children }: {
  title?: string;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  /** "alert" draws a brand-red border for items that need attention. */
  tone?: 'alert';
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`an-card ${tone === 'alert' ? 'an-card--alert' : ''} ${className}`}>
      {(title || actions) && (
        <div className="an-card-head">
          <div style={{ minWidth: 0 }}>
            {title && <p className="an-card-title">{icon}{title}</p>}
            {description && <p className="an-card-desc">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

/** Two-option pill switch (Ex/Inc VAT, Scorecards/Table). */
export function SegmentedToggle<T extends string>({ options, value, onChange, label, variant }: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  /** "brand" matches the red pill buttons beside it in the page header. */
  variant?: 'brand';
}) {
  return (
    <div className={`an-segmented ${variant === 'brand' ? 'an-segmented--brand' : ''}`} role="group" aria-label={label}>
      {options.map(o => (
        <button key={o.value} type="button" aria-pressed={value === o.value} className={value === o.value ? 'is-active' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export interface ActionMenuItem {
  key: string;
  label: string;
  icon: ReactNode;
  /** One muted line under the label. */
  hint?: string;
  onSelect: () => void;
}

/** A red pill that opens a short menu of actions — the same pill +
 *  popover pattern as Compensation Summary's view/export dropdown, used
 *  to group the page header's buttons into Import and Export. */
export function ActionMenu({ label, icon, items, emptyText }: {
  label: string;
  icon: ReactNode;
  items: ActionMenuItem[];
  /** Shown in the menu instead of items (e.g. a plan lock note). */
  emptyText?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="payroll-pill-btn" aria-haspopup="menu">
          {icon} {label} <ChevronDown size={13} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-1" align="end">
        <div role="menu" aria-label={label}>
          {items.length === 0 && emptyText && <div className="an-menu-empty">{emptyText}</div>}
          {items.map(item => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              className="an-menu-item"
              onClick={() => { setOpen(false); item.onSelect(); }}
            >
              <span className="an-menu-icon">{item.icon}</span>
              <span className="an-menu-text">
                <span>{item.label}</span>
                {item.hint && <span className="an-menu-hint">{item.hint}</span>}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
