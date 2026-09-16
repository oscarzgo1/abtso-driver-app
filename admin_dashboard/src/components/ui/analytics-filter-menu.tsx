import { useState } from 'react';
import type { ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { BarChart3, Check, LineChart as LineChartIcon, Filter } from 'lucide-react';

/** Replaces the earlier gooey/floating search pill (gooey-search-filter.tsx)
 * — that used a hand-rolled `position: absolute` results list with no
 * collision handling, which could end up floating over the KPI/chart card
 * below it and was hard to read. This rebuilds the same "search across
 * every filter type at once" behaviour on the Popover + Command (cmdk)
 * primitives already used elsewhere in this file for the Driver/Agency/
 * Period picker — a real anchored, portal-rendered, opaque panel with
 * proper stacking, which is the established "professional" pattern in
 * this codebase rather than a new one. The chart-type toggle lives at the
 * top of the same panel, per instruction to put it "inside the filter
 * button" instead of as a separate control. */

export interface FilterMenuOption {
  type: string;
  name: string;
  icon?: ReactNode;
}

interface AnalyticsFilterMenuProps {
  options: FilterMenuOption[];
  isSelected: (type: string, name: string) => boolean;
  onSelect: (type: string, name: string) => void;
  activeCount?: number;
  chartType: 'bar' | 'line';
  onChartTypeChange: (type: 'bar' | 'line') => void;
}

export function AnalyticsFilterMenu({ options, isSelected, onSelect, activeCount = 0, chartType, onChartTypeChange }: AnalyticsFilterMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/* Standardized to the same neutral bordered secondary button used
            across the rest of the app (.comp-edit-btn) — no longer a solid
            brand-red pill, which had made this look like a destructive/
            primary action rather than a routine filter toggle. */}
        <button type="button" className="comp-edit-btn">
          <Filter size={13} />
          Filters{activeCount > 0 ? ` (${activeCount})` : ''}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <div style={{ padding: '12px 12px 10px' }}>
          <p className="text-xs font-bold text-muted uppercase" style={{ letterSpacing: '0.08em', marginBottom: '8px' }}>Chart view</p>
          <div className="flex" style={{ gap: '6px' }}>
            {(['bar', 'line'] as const).map((type) => {
              const active = chartType === type;
              const Icon = type === 'bar' ? BarChart3 : LineChartIcon;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => onChartTypeChange(type)}
                  className="flex items-center justify-center"
                  style={{
                    flex: 1,
                    gap: '6px',
                    padding: '6px 0',
                    borderRadius: '6px',
                    border: active ? '1px solid var(--brand-red)' : '1px solid var(--border-color)',
                    background: active ? 'var(--brand-red-light)' : 'var(--card-bg)',
                    color: active ? 'var(--brand-red)' : 'var(--charcoal)',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  <Icon size={13} />
                  {type === 'bar' ? 'Bar' : 'Line'}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border-color)' }}>
          <Command>
            <CommandInput placeholder="Search drivers, depots, agencies…" className="h-9" />
            <CommandList style={{ maxHeight: '260px' }}>
              <CommandEmpty>No matches found.</CommandEmpty>
              <CommandGroup>
                {options.map((option) => {
                  const selected = isSelected(option.type, option.name);
                  return (
                    <CommandItem
                      key={`${option.type}:${option.name}`}
                      value={`${option.name} ${option.type}`}
                      onSelect={() => onSelect(option.type, option.name)}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="flex items-center gap-2" style={{ minWidth: 0 }}>
                        {option.icon}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{option.name}</span>
                      </span>
                      <span className="flex items-center" style={{ gap: '6px', flexShrink: 0 }}>
                        <span className="text-muted-foreground" style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {option.type}
                        </span>
                        {selected && <Check size={13} className="text-primary" />}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      </PopoverContent>
    </Popover>
  );
}
