import { useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

// ============================================================
// FilterGroup (exported as TableFilter) — the one filter control used in
// every section. Pattern from the 21st.dev "Search Bar with Category
// Filter" (@cnippet-dev/v-group-18): ONE joined control made of
//   [ category dropdown | value / search box | action button ].
//
// The category dropdown lists only what makes sense for the section it is
// placed in — each section passes its own `groups` (and optional text
// `search`), so this file never hardcodes a section's options.
//
//   • "Search" category  → free-text box (when the section supplies `search`)
//   • any other category → a value picker with that category's options
//   • action button      → clears every active filter (shows the count),
//                          or focuses the search box when nothing is active
//
// `single: true` on a group makes it pick one value (replaces a <select>);
// otherwise it is a multi-select checklist.
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
  /** One value at a time (behaves like a <select>). */
  single?: boolean;
  /** Value that means "no filter" for a single group, e.g. 'all'. It is hidden from the active count. */
  neutral?: string;
}

export interface TableFilterSearch {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

interface TableFilterProps {
  groups: TableFilterGroup[];
  search?: TableFilterSearch;
  /** Kept for older call sites; the joined bar no longer shows a title. */
  label?: string;
  className?: string;
}

const SEARCH_KEY = '__search';

const activeOf = (g: TableFilterGroup) =>
  g.neutral !== undefined ? g.selected.filter(v => v !== g.neutral) : g.selected;

export default function TableFilter({ groups, search, className }: TableFilterProps) {
  const [catOpen, setCatOpen] = useState(false);
  const [valOpen, setValOpen] = useState(false);
  const [active, setActive] = useState<string>(search ? SEARCH_KEY : groups[0]?.key ?? SEARCH_KEY);
  const inputRef = useRef<HTMLInputElement>(null);
  const [optQuery, setOptQuery] = useState('');

  const group = groups.find(g => g.key === active);
  const searching = !group && !!search;
  const groupActive = groups.reduce((n, g) => n + activeOf(g).length, 0);
  const activeCount = groupActive + (search?.value.trim() ? 1 : 0);

  const clearAll = () => {
    groups.forEach(g => g.onChange(g.neutral !== undefined ? [g.neutral] : []));
    search?.onChange('');
  };

  const toggle = (g: TableFilterGroup, value: string) => {
    if (g.single) {
      g.onChange([value]);
      setValOpen(false);
      return;
    }
    g.onChange(g.selected.includes(value) ? g.selected.filter(v => v !== value) : [...g.selected, value]);
  };

  const summary = (g: TableFilterGroup) => {
    const sel = activeOf(g);
    if (sel.length === 0) return 'All';
    if (sel.length === 1) return g.options.find(o => o.value === sel[0])?.label ?? sel[0];
    return `${sel.length} selected`;
  };

  const catLabel = group ? group.label : 'Search';

  return (
    <div className={`fg${className ? ` ${className}` : ''}`} role="group" aria-label="Filters">
      <Popover open={catOpen} onOpenChange={setCatOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="fg-seg fg-cat" aria-label="Filter by">
            {catLabel}
            <ChevronDown size={12} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="p-1" style={{ width: '190px', zIndex: 1100 }}>
          {search && (
            <button type="button" className="fg-item" onClick={() => { setActive(SEARCH_KEY); setCatOpen(false); setTimeout(() => inputRef.current?.focus(), 0); }}>
              <span>Search</span>
              {active === SEARCH_KEY && <Check size={13} />}
            </button>
          )}
          {groups.map(g => {
            const n = activeOf(g).length;
            return (
              <button key={g.key} type="button" className="fg-item" onClick={() => { setActive(g.key); setCatOpen(false); }}>
                <span>{g.label}</span>
                {n > 0 && <span className="fg-count">{n}</span>}
                {active === g.key && <Check size={13} />}
              </button>
            );
          })}
        </PopoverContent>
      </Popover>

      <span className="fg-sep" />

      {searching && search ? (
        <input
          ref={inputRef}
          className="fg-input"
          type="search"
          aria-label="Search"
          placeholder={search.placeholder ?? 'Search…'}
          value={search.value}
          onChange={e => search.onChange(e.target.value)}
        />
      ) : group ? (
        <Popover open={valOpen} onOpenChange={(o) => { setValOpen(o); if (!o) setOptQuery(''); }}>
          <PopoverTrigger asChild>
            <button type="button" className="fg-seg fg-val" aria-label={`${group.label} value`}>
              <span className="fg-val-text">{summary(group)}</span>
              <ChevronDown size={12} />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="p-1" style={{ width: '220px', zIndex: 1100, maxHeight: '320px', overflowY: 'auto' }}>
            {group.options.length > 8 && (
              <input className="fg-opt-search" type="search" placeholder={`Search ${group.label.toLowerCase()}…`} value={optQuery} onChange={e => setOptQuery(e.target.value)} />
            )}
            {!group.single && (
              <button type="button" className="fg-item" onClick={() => group.onChange([])}>
                <span className={`fg-box${group.selected.length === 0 ? ' fg-box--on' : ''}`}>{group.selected.length === 0 && <Check size={10} color="#fff" />}</span>
                <span>All</span>
              </button>
            )}
            {group.options.filter(o => !optQuery.trim() || o.label.toLowerCase().includes(optQuery.trim().toLowerCase())).map(opt => {
              const checked = group.selected.includes(opt.value);
              return (
                <button key={opt.value} type="button" className="fg-item" onClick={() => toggle(group, opt.value)}>
                  {group.single
                    ? <span className="fg-check">{checked && <Check size={13} />}</span>
                    : <span className={`fg-box${checked ? ' fg-box--on' : ''}`}>{checked && <Check size={10} color="#fff" />}</span>}
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </PopoverContent>
        </Popover>
      ) : null}

      <span className="fg-sep" />

      <button
        type="button"
        className="fg-seg fg-go"
        aria-label={activeCount > 0 ? 'Clear filters' : 'Search'}
        title={activeCount > 0 ? 'Clear all filters' : 'Search'}
        onClick={() => {
          if (activeCount > 0) clearAll();
          else if (searching) inputRef.current?.focus();
          else if (group) setValOpen(true);
        }}
      >
        {activeCount > 0 ? <X size={14} /> : <Search size={14} />}
        {activeCount > 0 && <span className="fg-badge">{activeCount}</span>}
      </button>
    </div>
  );
}

export { TableFilter };
