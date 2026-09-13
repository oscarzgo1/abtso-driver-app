import { useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';

/** Replaces the two separate native <input type="date"> Start/End Date
 * fields with one range-mode calendar, built on the "Calendar [React Day
 * Picker]" catalogue component (originui, "Appointment picker" demo) —
 * same grid/chevrons/today-dot/range-cell styling as the reference, just
 * in `mode="range"` rather than single+time-slots, since a report date
 * range is what this field actually needs (the reference's time-slot
 * list has no equivalent here). Still stores/emits the same 'YYYY-MM-DD'
 * strings the existing filteredShifts logic already expects, so nothing
 * downstream of this field had to change. */

interface EarningsDateRangePickerProps {
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
}

const toYMD = (d: Date) => format(d, 'yyyy-MM-dd');
const fromYMD = (s: string) => (s ? new Date(`${s}T00:00:00`) : undefined);

export function EarningsDateRangePicker({ startDate, endDate, onChange }: EarningsDateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const from = fromYMD(startDate);
  const to = fromYMD(endDate);
  const range: DateRange | undefined = from || to ? { from, to } : undefined;

  const label = !from && !to
    ? 'All dates'
    : from && to
    ? `${format(from, 'd MMM yyyy')} – ${format(to, 'd MMM yyyy')}`
    : from
    ? `From ${format(from, 'd MMM yyyy')}`
    : `Until ${format(to as Date, 'd MMM yyyy')}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="input-field flex items-center"
          style={{ width: '100%', textAlign: 'left', cursor: 'pointer', paddingLeft: '34px', position: 'relative' }}
        >
          <span style={{ position: 'absolute', left: '12px', color: 'var(--charcoal-light)', display: 'flex' }}>
            <CalendarIcon size={14} />
          </span>
          <span style={{ color: from || to ? 'var(--charcoal)' : 'var(--charcoal-light)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {label}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={range}
          defaultMonth={from ?? new Date()}
          onSelect={(next) => onChange(next?.from ? toYMD(next.from) : '', next?.to ? toYMD(next.to) : '')}
          numberOfMonths={2}
          className="p-3"
        />
        {(from || to) && (
          <div style={{ padding: '4px 12px 10px', borderTop: '1px solid var(--border-color)' }}>
            <button
              type="button"
              onClick={() => { onChange('', ''); setOpen(false); }}
              className="text-xs font-bold"
              style={{ color: 'var(--brand-red)', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0 0' }}
            >
              Clear dates
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
