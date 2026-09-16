import { useState } from 'react';
import { Filter, Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

// ============================================================
// TableFilter — single source-of-truth filter popover, adapted from the
// 21st.dev "Filters" component (@andrewlu0/filters, already the base of
// this app's Analytics FilterBar) but deliberately simpler: that
// component is a dynamic Linear-style filter *builder* (add a filter
// type, then an operator, then values, from an open-ended type list) —
// overkill for a table that only ever needs a couple of small, fixed
// option groups. This is that same Popover-trigger-with-count-badge
// shape, with a plain static checklist body instead of the Command/
// operator-dropdown machinery.
//
// Fully generic — every table using this passes its own groups, so this
// file itself never hardcodes "Tractor Units" or "VOR Grounded" etc.
// ============================================================

export interface TableFilterOption {
  value: string;
  label: string;
}

export interface TableFilterGroup {
  key: string;
  label: string;
  options: TableFilterOption[];
  selected: string[];
  onChange: (values: string[]) => void;
}

interface TableFilterProps {
  groups: TableFilterGroup[];
  label?: string;
}

export default function TableFilter({ groups, label = 'Filters' }: TableFilterProps) {
  const [open, setOpen] = useState(false);
  const activeCount = groups.reduce((sum, g) => sum + g.selected.length, 0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center text-xs font-bold"
          style={{
            gap: '6px', padding: '8px 14px', borderRadius: '8px',
            border: activeCount > 0 ? '1px solid var(--charcoal)' : '1px solid var(--border-color)',
            background: activeCount > 0 ? 'var(--card-bg-hover)' : 'var(--card-bg)',
            color: 'var(--charcoal)', cursor: 'pointer',
          }}
        >
          <Filter size={14} />
          {label}
          {activeCount > 0 && (
            <span
              className="font-mono tabular-nums"
              style={{
                fontSize: '10px', fontWeight: 800, minWidth: '16px', textAlign: 'center',
                padding: '1px 5px', borderRadius: '999px', background: 'var(--brand-red)', color: '#fff',
              }}
            >
              {activeCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      {/* Same z-index override as calendar-picker.tsx — this reusable
          popover needs to out-rank any modal it might later open from. */}
      <PopoverContent align="start" className="p-0" style={{ width: '240px', zIndex: 1100 }}>
        {groups.map((group, i) => {
          const toggle = (value: string) => {
            group.onChange(
              group.selected.includes(value) ? group.selected.filter(v => v !== value) : [...group.selected, value],
            );
          };
          return (
            <div key={group.key} style={i > 0 ? { borderTop: '1px solid var(--border-color)' } : undefined}>
              <div
                className="text-xs font-bold text-muted"
                style={{ textTransform: 'uppercase', letterSpacing: '0.04em', padding: '10px 12px 4px' }}
              >
                {group.label}
              </div>
              <button
                type="button"
                onClick={() => group.onChange([])}
                className="flex items-center text-sm"
                style={{ gap: '8px', width: '100%', padding: '7px 12px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--charcoal)' }}
              >
                <span
                  style={{
                    width: '14px', height: '14px', borderRadius: '4px', flexShrink: 0,
                    border: group.selected.length === 0 ? '1px solid var(--charcoal)' : '1px solid var(--border-color)',
                    background: group.selected.length === 0 ? 'var(--charcoal)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {group.selected.length === 0 && <Check size={10} color="#fff" />}
                </span>
                All
              </button>
              {group.options.map(opt => {
                const checked = group.selected.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggle(opt.value)}
                    className="flex items-center text-sm"
                    style={{ gap: '8px', width: '100%', padding: '7px 12px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--charcoal)' }}
                  >
                    <span
                      style={{
                        width: '14px', height: '14px', borderRadius: '4px', flexShrink: 0,
                        border: checked ? '1px solid var(--charcoal)' : '1px solid var(--border-color)',
                        background: checked ? 'var(--charcoal)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {checked && <Check size={10} color="#fff" />}
                    </span>
                    {opt.label}
                  </button>
                );
              })}
            </div>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
