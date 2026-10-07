// Driver profitability — which drivers make the company the most money
// and which the least, over a chosen time-frame.
//
// Pay is never re-derived here: every shift's pay comes from the same
// getShiftFinancials() that drives Compensation Summary (the rate assigned
// to the driver — hourly or fixed per shift — the hours and day worked,
// plus night-out and bonus, less deductions). Revenue is the rated loads
// on those shifts. Shown compactly as one progress bar per driver: bar
// length is the driver's profit against the top earner's.
import { useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { AnalyticsCard, SegmentedToggle } from './AnalyticsLayout';

export interface DriverShiftRow {
  id: string;
  driverId: string;
  driverName: string;
  start: string;
  loads: number;
  unratedLoads: number;
  revenue: number;
  /** Gross pay for the shift from getShiftFinancials() — base at the
   *  assigned rate + night-out + bonus − deductions. */
  pay: number;
}

type Frame = 'today' | 'week' | 'month' | 'period';

const money = (v: number) => `${v < 0 ? '−' : ''}£${Math.abs(v).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
const dayKey = (iso: string) => new Date(iso).toDateString();

export default function DriverProfitability({ shifts, periodStart, periodEnd, periodLabel }: {
  shifts: DriverShiftRow[];
  periodStart: Date;
  periodEnd: Date;
  periodLabel: string;
}) {
  const [frame, setFrame] = useState<Frame>('period');

  const frameWindow = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay()); // payroll week starts Sunday
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const now = new Date(Date.now() + 60_000);
    if (frame === 'today') return { start: today, end: now, label: 'today' };
    if (frame === 'week') return { start: weekStart, end: now, label: 'this week' };
    if (frame === 'month') return { start: monthStart, end: now, label: 'this month' };
    return { start: periodStart, end: periodEnd, label: periodLabel.toLowerCase() };
  }, [frame, periodStart, periodEnd, periodLabel]);

  const drivers = useMemo(() => {
    const inFrame = shifts.filter(s => {
      const t = new Date(s.start).getTime();
      return t >= frameWindow.start.getTime() && t < frameWindow.end.getTime();
    });
    const byDriver = new Map<string, { id: string; name: string; rows: DriverShiftRow[] }>();
    for (const s of inFrame) {
      const d = byDriver.get(s.driverId) ?? { id: s.driverId, name: s.driverName, rows: [] };
      d.rows.push(s);
      byDriver.set(s.driverId, d);
    }
    return Array.from(byDriver.values()).map(d => {
      const rows = [...d.rows].sort((a, b) => a.start.localeCompare(b.start));
      const total = (pick: (r: DriverShiftRow) => number) => rows.reduce((t, r) => t + pick(r), 0);
      const revenue = total(r => r.revenue);
      const pay = total(r => r.pay);
      const days = new Set(rows.map(r => dayKey(r.start))).size;
      return {
        ...d,
        rows,
        days,
        loads: total(r => r.loads),
        unratedLoads: total(r => r.unratedLoads),
        revenue,
        pay,
        profit: revenue - pay,
        margin: revenue > 0 ? ((revenue - pay) / revenue) * 100 : null,
        payPerDay: days > 0 ? pay / days : 0,
      };
    }).sort((a, b) => b.profit - a.profit);
  }, [shifts, frameWindow]);

  const maxProfit = Math.max(0, ...drivers.map(d => Math.abs(d.profit)));

  return (
    <AnalyticsCard
      title="Driver profitability"
      icon={<Users size={14} />}
      description="Load revenue minus pay (from Compensation Summary) for each driver, most profitable first."
      actions={
        <SegmentedToggle
          label="Time-frame"
          value={frame}
          onChange={setFrame}
          options={[
            { value: 'today', label: 'Today' },
            { value: 'week', label: 'This week' },
            { value: 'month', label: 'This month' },
            { value: 'period', label: periodLabel },
          ]}
        />
      }
    >
      {drivers.length === 0 ? (
        <p className="text-xs text-muted m-0">No completed shifts {frameWindow.label}.</p>
      ) : (
        <ol className="dp-bars">
          {drivers.map((d, i) => {
            const isMost = i === 0 && drivers.length > 1;
            const isLeast = i === drivers.length - 1 && drivers.length > 1;
            const fill = maxProfit > 0 ? Math.max(2, (Math.abs(d.profit) / maxProfit) * 100) : 0;
            return (
              <li key={d.id} className="dp-bar-row">
                <div className="dp-bar-head">
                  <span className="dp-bar-name">
                    <span className={`dp-rank ${isMost ? 'is-top' : ''} ${isLeast ? 'is-low' : ''}`}>{i + 1}</span>
                    {d.name}
                    {isMost && <span className="dp-tag dp-tag--most">Most</span>}
                    {isLeast && <span className="dp-tag dp-tag--least">Least</span>}
                  </span>
                  <span className="dp-bar-value" style={{ color: d.profit < 0 ? 'var(--brand-red)' : undefined }}>
                    {money(d.profit)}
                    <span className="dp-bar-margin">{d.margin === null ? '—' : `${Math.round(d.margin)}%`}</span>
                  </span>
                </div>
                <div className="dp-track" role="progressbar" aria-label={`${d.name} profit`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fill)}>
                  <div
                    className="dp-fill"
                    style={{ width: `${fill}%`, background: d.profit < 0 ? 'var(--brand-red)' : isMost ? '#10B981' : isLeast ? '#F59E0B' : 'var(--charcoal-light)' }}
                  />
                </div>
                <div className="dp-bar-meta">
                  {d.days} day{d.days === 1 ? '' : 's'} · {d.loads} load{d.loads === 1 ? '' : 's'}
                  {d.unratedLoads > 0 && <span className="dp-warn"> ({d.unratedLoads} unrated)</span>}
                  {' '}· {money(d.revenue)} revenue · {money(d.pay)} pay ({money(d.payPerDay)}/day)
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </AnalyticsCard>
  );
}
