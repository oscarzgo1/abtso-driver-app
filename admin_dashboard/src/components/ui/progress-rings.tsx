import { useEffect, useState } from 'react';
import NoData from './no-data';

export interface RingSlice {
  label: string;
  value: number;
  color: string;
}

interface ProgressRingsProps {
  /** One ring per state, outermost first. A state with no assets still gets its (empty) ring. */
  data: RingSlice[];
  centerLabel?: string;
  /** Pixel size of the square the rings are drawn in. */
  size?: number;
}

/**
 * Concentric progress rings: each ring is one state and fills to that state's
 * share of the total (so a ring that is three-quarters round means three
 * quarters of the assets are in that state). The total sits in the middle and
 * a legend below spells out each count and percentage.
 */
export function ProgressRings({ data, centerLabel = 'Total', size = 190 }: ProgressRingsProps) {
  const total = data.reduce((sum, d) => sum + (Number.isFinite(d.value) ? d.value : 0), 0);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(t);
  }, []);

  if (total <= 0) {
    return (
      <div style={{ minHeight: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <NoData className="py-0" />
      </div>
    );
  }

  const stroke = 13;
  const gap = 6;
  const c = size / 2;
  const outer = c - stroke / 2 - 2;

  return (
    <div style={{ width: '100%' }}>
      <div style={{ position: 'relative', width: size, height: size, margin: '0 auto', maxWidth: '100%' }}>
        <svg viewBox={`0 0 ${size} ${size}`} width="100%" height="100%" role="img" aria-label={`${total} ${centerLabel}: ${data.map(d => `${d.label} ${d.value}`).join(', ')}`}>
          {data.map((d, i) => {
            const r = outer - i * (stroke + gap);
            if (r <= 4) return null;
            const circ = 2 * Math.PI * r;
            const share = Math.max(0, Math.min(1, d.value / total));
            return (
              <g key={d.label} transform={`rotate(-90 ${c} ${c})`}>
                <circle cx={c} cy={c} r={r} fill="none" stroke={d.color} strokeOpacity={0.14} strokeWidth={stroke} />
                <circle
                  cx={c}
                  cy={c}
                  r={r}
                  fill="none"
                  stroke={d.color}
                  strokeWidth={stroke}
                  strokeLinecap="round"
                  strokeDasharray={`${drawn ? circ * share : 0} ${circ}`}
                  style={{ transition: `stroke-dasharray 0.9s cubic-bezier(.4,0,.2,1) ${i * 0.12}s` }}
                >
                  <title>{`${d.label}: ${d.value} of ${total} (${Math.round(share * 100)}%)`}</title>
                </circle>
              </g>
            );
          })}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--charcoal)', lineHeight: 1 }}>{total}</div>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--charcoal-light)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{centerLabel}</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '14px' }}>
        {data.map(d => (
          <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--charcoal)' }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>{d.label}</span>
            <strong className="tabular-nums">{d.value}</strong>
            <span className="tabular-nums" style={{ width: '38px', textAlign: 'right', color: 'var(--charcoal-light)' }}>{Math.round((d.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
