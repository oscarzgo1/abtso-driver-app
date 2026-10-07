import NoData from './ui/no-data';
import { useMemo, useState } from 'react';
import { EarningsDateRangePicker } from './ui/earnings-date-range-picker';

// ============================================================
// Fleet expiry timeline — one row per registration, a marker at the EXACT
// date of each MOT / PMI / tacho / road tax / insurance expiry, labelled
// with that date. Same family as the Employees Schedule timeline:
// sticky name column, month + day header, a "today" line, and the shared
// date-range picker for the window.
// ============================================================

export type MarkerTier = 'red' | 'amber' | 'green' | 'unknown';

export interface FleetMarker {
  id: string;
  label: string;
  /** YYYY-MM-DD */
  date: string;
  tier: MarkerTier;
}

export interface FleetTimelineGroup {
  key: string;
  reg: string;
  typeLabel: string;
  markers: FleetMarker[];
}

const NAME_W = 160;
const DAY_W = 8;
const LANE_H = 24;
const LABEL_W = 132;

const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseKey = (k: string) => new Date(`${k}T00:00:00`);
const fmt = (k: string) => parseKey(k).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });

const TIER_STYLE: Record<MarkerTier, { bg: string; fg: string; border: string; dot: string }> = {
  red: { bg: 'rgba(204,0,0,0.10)', fg: '#B00000', border: 'rgba(204,0,0,0.45)', dot: '#CC0000' },
  amber: { bg: 'rgba(245,158,11,0.14)', fg: '#8A5A00', border: 'rgba(245,158,11,0.55)', dot: '#F59E0B' },
  green: { bg: 'rgba(16,185,129,0.10)', fg: '#0B6B4B', border: 'rgba(16,185,129,0.45)', dot: '#10B981' },
  unknown: { bg: 'var(--card-bg-hover)', fg: 'var(--charcoal-light)', border: 'var(--border-color)', dot: '#999' },
};

function defaultWindow() {
  const from = new Date();
  from.setDate(from.getDate() - 45);
  const to = new Date();
  to.setDate(to.getDate() + 180);
  return { from: dateKey(from), to: dateKey(to) };
}

export default function FleetTimeline({ groups, onOpen }: { groups: FleetTimelineGroup[]; onOpen: (key: string) => void }) {
  const [win, setWin] = useState(defaultWindow);

  const days = useMemo(() => {
    const out: Date[] = [];
    const end = parseKey(win.to || win.from);
    for (const d = parseKey(win.from); d <= end && out.length < 540; d.setDate(d.getDate() + 1)) out.push(new Date(d));
    return out;
  }, [win]);
  const startUtc = Date.UTC(parseKey(win.from).getFullYear(), parseKey(win.from).getMonth(), parseKey(win.from).getDate());
  const idxOf = (k: string) => {
    const [y, m, d] = k.split('-').map(Number);
    return Math.round((Date.UTC(y, m - 1, d) - startUtc) / 86_400_000);
  };

  const months = useMemo(() => {
    const segs: { label: string; days: number }[] = [];
    days.forEach(d => {
      const label = d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
      if (segs.length && segs[segs.length - 1].label === label) segs[segs.length - 1].days++;
      else segs.push({ label, days: 1 });
    });
    return segs;
  }, [days]);

  const todayKey = dateKey(new Date());
  const todayIdx = idxOf(todayKey);
  const trackW = days.length * DAY_W;

  // Lay each row's markers into lanes so labels never sit on top of each other.
  const rows = useMemo(() => groups.map(g => {
    const placed: { m: FleetMarker; left: number; lane: number; clamped: boolean }[] = [];
    const laneEnd: number[] = [];
    const sorted = [...g.markers].sort((a, b) => a.date.localeCompare(b.date));
    for (const m of sorted) {
      let i = idxOf(m.date);
      if (i >= days.length) continue;
      const clamped = i < 0;
      if (clamped) i = 0;
      const left = i * DAY_W;
      let lane = laneEnd.findIndex(end => end <= left);
      if (lane === -1) { lane = laneEnd.length; laneEnd.push(0); }
      laneEnd[lane] = left + LABEL_W + 6;
      placed.push({ m, left, lane, clamped });
    }
    return { g, placed, lanes: Math.max(1, laneEnd.length) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [groups, days.length, win.from]);

  return (
    <div className="glass-card" style={{ padding: '14px 16px', marginBottom: '16px', minWidth: 0 }}>
      <div className="flex align-center justify-between mb-12" style={{ gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h3 className="text-lg font-black text-primary m-0">Expiry Timeline</h3>
          <p className="text-xs text-muted m-0 mt-4">The exact date each inspection, MOT, road tax and insurance runs out. Click a unit to open it below.</p>
        </div>
        <div className="flex align-center" style={{ gap: '8px', flexWrap: 'wrap' }}>
          <span>
            <EarningsDateRangePicker compact startDate={win.from} endDate={win.to} onChange={(from, to) => { if (from) setWin({ from, to: to || from }); }} />
          </span>
          <button type="button" className="comp-edit-btn" onClick={() => setWin(defaultWindow())}>Today</button>
        </div>
      </div>

      <div className="flex align-center text-xs text-secondary mb-12" style={{ gap: '16px', flexWrap: 'wrap' }}>
        {([['red', 'Expired / VOR'], ['amber', 'Due soon'], ['green', 'Compliant']] as const).map(([t, l]) => (
          <span key={t} className="flex align-center" style={{ gap: '6px' }}><i style={{ width: 9, height: 9, borderRadius: '50%', background: TIER_STYLE[t].dot, display: 'inline-block' }} /> {l}</span>
        ))}
        <span className="flex align-center" style={{ gap: '6px' }}><i style={{ width: 2, height: 12, background: 'var(--brand-red)', display: 'inline-block' }} /> Today</span>
      </div>

      {rows.length === 0 ? (
        <NoData />
      ) : (
        <div style={{ overflowX: 'auto', maxHeight: '420px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
          <div style={{ width: NAME_W + trackW, position: 'relative' }}>
            <div className="flex" style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--card-bg-hover)', borderBottom: '1px solid var(--border-color)' }}>
              <div className="text-xs font-bold text-primary" style={{ width: NAME_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 6, background: 'var(--card-bg-hover)', borderRight: '1px solid var(--border-color)', padding: '8px 12px' }}>Units</div>
              <div className="flex">
                {months.map(seg => (
                  <div key={seg.label} className="text-xs font-bold text-primary" style={{ width: seg.days * DAY_W, padding: '8px', borderRight: '1px solid var(--border-color)', whiteSpace: 'nowrap', overflow: 'hidden' }}>{seg.label}</div>
                ))}
              </div>
            </div>

            {todayIdx >= 0 && todayIdx < days.length && (
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: NAME_W + todayIdx * DAY_W + DAY_W / 2, width: 2, background: 'var(--brand-red)', opacity: 0.5, zIndex: 3, pointerEvents: 'none' }} />
            )}

            {rows.map(({ g, placed, lanes }) => (
              <div key={g.key} className="flex" style={{ borderBottom: '1px solid var(--border-color)', minHeight: lanes * LANE_H + 12 }}>
                <button
                  type="button"
                  onClick={() => onOpen(g.key)}
                  title={`Open ${g.reg}`}
                  style={{ width: NAME_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 2, background: 'var(--card-bg)', borderRight: '1px solid var(--border-color)', borderTop: 'none', borderBottom: 'none', borderLeft: 'none', padding: '6px 12px', textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
                >
                  <span className="font-mono font-bold text-primary" style={{ fontSize: '12.5px', letterSpacing: '0.03em' }}>{g.reg}</span>
                  <span className="text-xs text-muted">{g.typeLabel}</span>
                </button>
                <div style={{ position: 'relative', width: trackW, flexShrink: 0 }}>
                  {placed.map(({ m, left, lane, clamped }) => {
                    const st = TIER_STYLE[m.tier];
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => onOpen(g.key)}
                        title={`${g.reg} — ${m.label}: ${fmt(m.date)}${clamped ? ' (before the visible range)' : ''}`}
                        style={{
                          position: 'absolute', top: 6 + lane * LANE_H, left, height: LANE_H - 4, width: LABEL_W,
                          display: 'flex', alignItems: 'center', gap: 5, padding: '0 7px', borderRadius: 999,
                          background: st.bg, color: st.fg, border: `1px solid ${st.border}`, cursor: 'pointer',
                          fontSize: '10.5px', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}
                      >
                        <i style={{ width: 7, height: 7, borderRadius: '50%', background: st.dot, flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{clamped ? '‹ ' : ''}{m.label} · {fmt(m.date)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
