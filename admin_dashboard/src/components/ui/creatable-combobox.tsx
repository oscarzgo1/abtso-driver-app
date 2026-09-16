import { useState } from 'react';

// ============================================================
// CreatableCombobox — a plain text input with a suggestion dropdown of
// standard choices, but never restricted to them: typing anything and
// moving on keeps the typed text as-is. Used for fields like Asset Type
// / Inspection Type where a handful of common values cover most real
// entries, but a genuinely custom one (a support vehicle type, a
// bespoke inspection name) must still be a real, savable value.
// ============================================================

interface CreatableComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
}

export default function CreatableCombobox({ value, onChange, options, placeholder }: CreatableComboboxProps) {
  const [open, setOpen] = useState(false);
  const query = value.trim().toLowerCase();
  const filtered = query ? options.filter(o => o.toLowerCase().includes(query)) : options;

  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text"
        className="login-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && filtered.length > 0 && (
        <div
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, marginTop: '4px',
            background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.14)', maxHeight: '180px', overflowY: 'auto',
          }}
        >
          {filtered.map(opt => (
            <button
              key={opt}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(opt); setOpen(false); }}
              className="text-sm"
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--charcoal)' }}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
