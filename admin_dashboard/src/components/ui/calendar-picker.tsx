import { useState } from 'react';
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isAfter,
  isBefore,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

// ============================================================
// CalendarPicker — single source-of-truth date picker, adapted from the
// 21st.dev "Meeting Scheduler" (@kavikatiyar/meeting-scheduler): its
// month-grid engine (Mon-first week, eachDayOfInterval across the
// visible month, chevron month nav) is the literal borrowed part. The
// rest of that component — time inputs, an AI-notes toggle, a card
// header with a big title — was specific to scheduling a meeting and
// doesn't belong on a plain "Due Date" field, so it's dropped. Supports
// both a single date (`mode="single"`, default) and a start/end range
// (`mode="range"`) from one shared grid, so the same component covers
// due dates AND date-range filters per the "unified" requirement.
// ============================================================

interface SingleProps {
  mode?: 'single';
  value: Date | null;
  onChange: (date: Date | null) => void;
}

interface RangeProps {
  mode: 'range';
  value: { start: Date | null; end: Date | null };
  onChange: (range: { start: Date | null; end: Date | null }) => void;
}

type CalendarPickerProps = (SingleProps | RangeProps) & {
  placeholder?: string;
  disabled?: boolean;
  minDate?: Date;
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function CalendarPicker(props: CalendarPickerProps) {
  const { placeholder = 'Select date', disabled } = props;
  const [open, setOpen] = useState(false);
  const anchor = props.mode === 'range' ? props.value.start ?? new Date() : props.value ?? new Date();
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(anchor));

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 }),
  });

  const handleDayClick = (day: Date) => {
    if (props.minDate && isBefore(day, props.minDate)) return;
    if (props.mode === 'range') {
      const { start, end } = props.value;
      if (!start || (start && end)) {
        props.onChange({ start: day, end: null });
      } else if (isBefore(day, start)) {
        props.onChange({ start: day, end: null });
      } else {
        props.onChange({ start, end: day });
        setOpen(false);
      }
    } else {
      props.onChange(day);
      setOpen(false);
    }
  };

  const triggerLabel =
    props.mode === 'range'
      ? props.value.start
        ? props.value.end
          ? `${format(props.value.start, 'd MMM yyyy')} – ${format(props.value.end, 'd MMM yyyy')}`
          : format(props.value.start, 'd MMM yyyy')
        : placeholder
      : props.value
        ? format(props.value, 'd MMM yyyy')
        : placeholder;

  return (
    <Popover open={open} onOpenChange={(o) => { if (!disabled) setOpen(o); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="flex items-center justify-between font-mono tabular-nums text-sm"
          style={{
            width: '100%', gap: '8px', padding: '10px 12px', borderRadius: '8px',
            border: '1px solid var(--border-color)', background: disabled ? 'var(--card-bg-hover)' : 'var(--card-bg)',
            color: (props.mode === 'range' ? props.value.start : props.value) ? 'var(--charcoal)' : 'var(--charcoal-light)',
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        >
          <span style={{ flex: 1, textAlign: 'left' }}>{triggerLabel}</span>
          <CalendarIcon size={14} style={{ opacity: 0.6, flexShrink: 0 }} />
        </button>
      </PopoverTrigger>
      {/* Radix's default PopoverContent is z-50 — this app's own modals
          (AddAssetModal etc.) sit at z-index 998+, so without an
          explicit override here the calendar rendered UNDER the modal's
          backdrop: visible through the translucent overlay but every
          click was swallowed by the backdrop sitting on top of it,
          i.e. "there but not clickable". Portal-rendered popovers must
          always out-rank whatever modal they're opened from. */}
      <PopoverContent align="start" className="p-0" style={{ width: '280px', zIndex: 1100 }}>
        <div style={{ padding: '12px' }}>
          <div className="flex items-center justify-between mb-8">
            <button type="button" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} aria-label="Previous month" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--charcoal)', padding: '4px' }}>
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-bold text-primary">{format(currentMonth, 'MMMM yyyy')}</span>
            <button type="button" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} aria-label="Next month" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--charcoal)', padding: '4px' }}>
              <ChevronRight size={16} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center' }}>
            {WEEKDAYS.map(d => (
              <div key={d} className="text-xs text-muted" style={{ padding: '4px 0' }}>{d}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
            {days.map(day => {
              const rangeStart = props.mode === 'range' ? props.value.start : null;
              const rangeEnd = props.mode === 'range' ? props.value.end : null;
              const isSelected = props.mode === 'range'
                ? (rangeStart && isSameDay(day, rangeStart)) || (rangeEnd && isSameDay(day, rangeEnd))
                : props.value && isSameDay(day, props.value);
              const isInRange = props.mode === 'range' && rangeStart && rangeEnd && isAfter(day, rangeStart) && isBefore(day, rangeEnd);
              const isDisabled = props.minDate ? isBefore(day, props.minDate) : false;
              const inMonth = isSameMonth(day, currentMonth);

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => handleDayClick(day)}
                  className="font-mono tabular-nums text-sm"
                  style={{
                    height: '32px', borderRadius: isInRange ? '0' : '999px', border: 'none', cursor: isDisabled ? 'not-allowed' : 'pointer',
                    background: isSelected ? 'var(--brand-red)' : isInRange ? 'var(--brand-red-light)' : 'transparent',
                    color: isSelected ? '#fff' : isDisabled ? 'var(--border-color)' : !inMonth ? 'var(--charcoal-light)' : isSameDay(day, new Date()) ? 'var(--brand-red)' : 'var(--charcoal)',
                    fontWeight: isSameDay(day, new Date()) || isSelected ? 800 : 500,
                    opacity: isDisabled ? 0.4 : 1,
                  }}
                >
                  {format(day, 'd')}
                </button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
