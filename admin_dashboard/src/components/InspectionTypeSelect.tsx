import { useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { IconFor, type InspectionTypeDef } from '../lib/inspection-types';

// A dropdown for picking an inspection type — icon + name, no free typing.

export default function InspectionTypeSelect({ types, value, onChange, disabled, placeholder = 'Choose an inspection…' }: {
  types: InspectionTypeDef[];
  value: string;
  onChange: (key: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = types.find(t => t.key === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="input-field"
          style={{ width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', cursor: disabled ? 'not-allowed' : 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
        >
          <span className="flex align-center" style={{ gap: '8px', minWidth: 0, color: current ? 'var(--charcoal)' : 'var(--charcoal-light)', fontWeight: current ? 600 : 400 }}>
            {current ? <IconFor name={current.icon} size={15} /> : null}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current ? current.label : (value ? value : placeholder)}</span>
          </span>
          <ChevronDown size={14} style={{ flexShrink: 0, color: 'var(--charcoal-light)' }} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-1" style={{ width: 'var(--radix-popover-trigger-width, 260px)', minWidth: '230px', zIndex: 1100, maxHeight: '300px', overflowY: 'auto' }}>
        {types.map(t => (
          <button
            key={t.key}
            type="button"
            className="fg-item"
            onClick={() => { onChange(t.key); setOpen(false); }}
          >
            <span style={{ display: 'inline-flex', width: 18, color: 'var(--charcoal-mid)' }}><IconFor name={t.icon} size={15} /></span>
            <span style={{ flex: 1 }}>{t.label}</span>
            {t.key === value && <Check size={13} />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
