import { Checkbox } from '@/components/ui/checkbox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { ListFilter, X } from 'lucide-react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

// Adapted from the "filters" catalogue component — a Linear-issue-tracker
// filter builder (Status/Assignee/Labels/Priority/due-date, all fake demo
// enums). Restructured for real Tachyo Analytics data: the filter *types*
// (Driver/Agency/Period below) and their option lists are supplied by the
// caller from real state (employees, agencies, a fixed set of real
// reporting windows) rather than hardcoded enums, since — unlike a Linear
// clone's fixed Status/Priority values — which drivers and agencies exist
// is genuinely dynamic per company. Imported from "motion/react" in the
// original; this app already has framer-motion (same library), so the
// import points there instead of installing a duplicate.

interface AnimateChangeInHeightProps {
  children: ReactNode;
  className?: string;
}

export const AnimateChangeInHeight: React.FC<AnimateChangeInHeightProps> = ({ children, className }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState<number | 'auto'>('auto');

  useEffect(() => {
    if (containerRef.current) {
      const resizeObserver = new ResizeObserver((entries) => {
        setHeight(entries[0].contentRect.height);
      });
      resizeObserver.observe(containerRef.current);
      return () => resizeObserver.disconnect();
    }
  }, []);

  return (
    <motion.div className={cn(className, 'overflow-hidden')} style={{ height }} animate={{ height }} transition={{ duration: 0.15, ease: 'easeInOut' }}>
      <div ref={containerRef}>{children}</div>
    </motion.div>
  );
};

// Plain const objects instead of TS `enum` — this project's tsconfig has
// erasableSyntaxOnly on, which real enums (unlike const objects) violate.
export const FilterType = {
  DRIVER: 'Driver',
  AGENCY: 'Agency',
  DEPOT: 'Depot',
  PERIOD: 'Period',
  CARRIER: 'Carrier',
} as const;
export type FilterType = (typeof FilterType)[keyof typeof FilterType];

export const FilterOperator = {
  IS: 'is',
  IS_NOT: 'is not',
  IS_ANY_OF: 'is any of',
} as const;
export type FilterOperator = (typeof FilterOperator)[keyof typeof FilterOperator];

export type FilterOption = { name: string; icon?: ReactNode };
export type Filter = { id: string; type: FilterType; operator: FilterOperator; value: string[] };

function filterOperators({ filterType, filterValues }: { filterType: FilterType; filterValues: string[] }): FilterOperator[] {
  if (filterType === FilterType.PERIOD) return [FilterOperator.IS];
  return filterValues.length > 1
    ? [FilterOperator.IS_ANY_OF, FilterOperator.IS_NOT]
    : [FilterOperator.IS, FilterOperator.IS_NOT];
}

const FilterOperatorDropdown = ({
  filterType,
  operator,
  filterValues,
  setOperator,
}: {
  filterType: FilterType;
  operator: FilterOperator;
  filterValues: string[];
  setOperator: (operator: FilterOperator) => void;
}) => {
  const operators = filterOperators({ filterType, filterValues });
  if (operators.length <= 1) {
    return <span className="bg-muted px-1.5 py-1 text-muted-foreground shrink-0">{operator}</span>;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="bg-muted hover:bg-muted/50 px-1.5 py-1 text-muted-foreground hover:text-foreground transition shrink-0">
        {operator}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-fit min-w-fit">
        {operators.map((op) => (
          <DropdownMenuItem key={op} onClick={() => setOperator(op)}>
            {op}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const FilterValueCombobox = ({
  options,
  filterValues,
  setFilterValues,
  multiple,
}: {
  options: FilterOption[];
  filterValues: string[];
  setFilterValues: (values: string[]) => void;
  multiple: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [commandInput, setCommandInput] = useState('');
  const commandInputRef = useRef<HTMLInputElement>(null);
  const nonSelected = options.filter((o) => !filterValues.includes(o.name));

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setTimeout(() => setCommandInput(''), 200);
      }}
    >
      <PopoverTrigger className="rounded-none px-1.5 py-1 bg-muted hover:bg-muted/50 transition text-muted-foreground hover:text-foreground shrink-0 max-w-[220px] truncate text-left">
        {filterValues.length === 1 ? filterValues[0] : `${filterValues.length} selected`}
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0">
        <AnimateChangeInHeight>
          <Command>
            <CommandInput placeholder="Search…" className="h-9" value={commandInput} onInputCapture={(e) => setCommandInput(e.currentTarget.value)} ref={commandInputRef} />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup>
                {filterValues.map((value) => (
                  <CommandItem
                    key={value}
                    className="group flex gap-2 items-center"
                    onSelect={() => {
                      if (!multiple) return;
                      setFilterValues(filterValues.filter((v) => v !== value));
                    }}
                  >
                    <Checkbox checked />
                    {value}
                  </CommandItem>
                ))}
              </CommandGroup>
              {nonSelected.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    {nonSelected.map((option) => (
                      <CommandItem
                        key={option.name}
                        value={option.name}
                        className="group flex gap-2 items-center"
                        onSelect={(currentValue) => {
                          setFilterValues(multiple ? [...filterValues, currentValue] : [currentValue]);
                          setTimeout(() => setCommandInput(''), 200);
                          if (!multiple) setOpen(false);
                        }}
                      >
                        <Checkbox checked={false} className="opacity-0 group-data-[selected=true]:opacity-100" />
                        {option.icon}
                        <span>{option.name}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </AnimateChangeInHeight>
      </PopoverContent>
    </Popover>
  );
};

export default function FilterBar({
  filters,
  setFilters,
  filterViewOptions,
  filterOptionsByType,
  typeIcons,
  showAddFilterButton = true,
}: {
  filters: Filter[];
  setFilters: Dispatch<SetStateAction<Filter[]>>;
  /** The types offered in the "+ Filter" menu, in display order. */
  filterViewOptions: FilterType[];
  /** Selectable values for each filter type, e.g. real driver names. */
  filterOptionsByType: Record<FilterType, FilterOption[]>;
  /** Small icon shown on each type's chip label and menu row. */
  typeIcons: Record<FilterType, ReactNode>;
  /** Set false to hide the "+ Filter" add-trigger entirely — for callers
   * that add filters through their own UI (e.g. a search bar) instead.
   * The active-filter chip row above it is unaffected either way. */
  showAddFilterButton?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selectedView, setSelectedView] = useState<FilterType | null>(null);
  const [commandInput, setCommandInput] = useState('');
  const commandInputRef = useRef<HTMLInputElement>(null);

  const activeFilters = filters.filter((f) => f.value?.length > 0);

  return (
    <div className="flex gap-2 flex-wrap items-center">
      {activeFilters.map((filter) => {
        const options = filterOptionsByType[filter.type] ?? [];
        const multiple = filter.type !== FilterType.PERIOD;
        return (
          <div key={filter.id} className="flex gap-[1px] items-center text-xs">
            <div className="flex gap-1.5 shrink-0 rounded-l bg-muted px-1.5 py-1 items-center text-foreground">
              {typeIcons[filter.type]}
              {filter.type}
            </div>
            <FilterOperatorDropdown
              filterType={filter.type}
              operator={filter.operator}
              filterValues={filter.value}
              setOperator={(operator) => setFilters((prev) => prev.map((f) => (f.id === filter.id ? { ...f, operator } : f)))}
            />
            <FilterValueCombobox
              options={options}
              filterValues={filter.value}
              multiple={multiple}
              setFilterValues={(value) => setFilters((prev) => prev.map((f) => (f.id === filter.id ? { ...f, value } : f)))}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setFilters((prev) => prev.filter((f) => f.id !== filter.id))}
              className="bg-muted rounded-l-none rounded-r-sm h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition shrink-0"
            >
              <X className="size-3" />
            </Button>
          </div>
        );
      })}

      {activeFilters.length > 0 && (
        <Button variant="outline" size="sm" className="h-6 text-xs items-center rounded-sm" onClick={() => setFilters([])}>
          Clear
        </Button>
      )}

      {showAddFilterButton && (
        <Popover
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) setTimeout(() => { setSelectedView(null); setCommandInput(''); }, 200);
          }}
        >
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className={cn('h-6 text-xs items-center rounded-sm flex gap-1.5', activeFilters.length > 0 && 'w-6 px-0')}>
              <ListFilter className="size-3 shrink-0 text-muted-foreground" />
              {activeFilters.length === 0 && 'Filter'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[220px] p-0">
            <AnimateChangeInHeight>
              <Command>
                <CommandInput placeholder={selectedView ?? 'Filter…'} className="h-9" value={commandInput} onInputCapture={(e) => setCommandInput(e.currentTarget.value)} ref={commandInputRef} />
                <CommandList>
                  <CommandEmpty>No results found.</CommandEmpty>
                  {selectedView ? (
                    <CommandGroup>
                      {(filterOptionsByType[selectedView] ?? []).map((option) => (
                        <CommandItem
                          key={option.name}
                          value={option.name}
                          className="group text-muted-foreground flex gap-2 items-center"
                          onSelect={(currentValue) => {
                            setFilters((prev) => [...prev, { id: crypto.randomUUID(), type: selectedView, operator: FilterOperator.IS, value: [currentValue] }]);
                            setTimeout(() => { setSelectedView(null); setCommandInput(''); }, 200);
                            setOpen(false);
                          }}
                        >
                          {option.icon}
                          <span className="text-foreground">{option.name}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ) : (
                    <CommandGroup>
                      {filterViewOptions.map((type) => (
                        <CommandItem
                          key={type}
                          value={type}
                          className="group text-muted-foreground flex gap-2 items-center"
                          onSelect={(currentValue) => {
                            setSelectedView(currentValue as FilterType);
                            setCommandInput('');
                            commandInputRef.current?.focus();
                          }}
                        >
                          {typeIcons[type]}
                          <span className="text-foreground">{type}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </AnimateChangeInHeight>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
