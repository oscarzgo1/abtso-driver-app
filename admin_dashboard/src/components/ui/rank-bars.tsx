// Adapted from 21st.dev @eugeneshilow/rank-bars — horizontal ranking bars
// (label · bar · value) answering "who leads, and by how much?". Restyled
// to the admin panel's tokens; bars scale from zero on the largest
// absolute value so a negative row (a loss) still draws, in brand red.
import type { CSSProperties } from 'react';

export interface RankBarItem {
  key: string;
  label: string;
  value: number;
  valueLabel: string;
  /** Muted line under the label. */
  sub?: string;
  /** Right-aligned muted caption under the value. */
  meta?: string;
}

export function RankBars({ items, emptyText = 'Nothing to rank yet.' }: { items: RankBarItem[]; emptyText?: string }) {
  if (items.length === 0) return <p className="text-xs text-muted m-0" style={{ padding: '8px 0' }}>{emptyText}</p>;
  const max = Math.max(...items.map(i => Math.abs(i.value)), 1);
  return (
    <ol className="rank-bars">
      {items.map((item, index) => {
        const negative = item.value < 0;
        const width = Math.max(2, Math.round((Math.abs(item.value) / max) * 100));
        return (
          <li key={item.key} className="rank-bars-row" style={{ '--i': index } as CSSProperties}>
            <span className={`rank-bars-pos ${index === 0 ? 'is-top' : ''}`}>{index + 1}</span>
            <span className="rank-bars-label">
              <span className="rank-bars-name">{item.label}</span>
              {item.sub && <span className="rank-bars-sub">{item.sub}</span>}
            </span>
            <span className="rank-bars-track" title={`${item.label} · ${item.valueLabel}`}>
              <span
                className="rank-bars-fill"
                style={{ width: `${width}%`, background: negative ? 'var(--brand-red)' : index === 0 ? 'var(--charcoal)' : 'var(--charcoal-light)' }}
              />
            </span>
            <span className="rank-bars-value">
              <span style={{ color: negative ? 'var(--brand-red)' : 'var(--charcoal)' }}>{item.valueLabel}</span>
              {item.meta && <span className="rank-bars-sub">{item.meta}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
