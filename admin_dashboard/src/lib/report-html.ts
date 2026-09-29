// One printable report, shared by "PDF report" (printed from a new
// window) and partner share links (rendered read-only). Built from a
// plain JSON snapshot so a share link shows exactly what was shared,
// frozen at the time it was created.

import type { CustomerScore, DriverScore, VehicleScore } from './analytics-breakdowns';

export interface ReportSnapshot {
  companyName?: string | null;
  periodLabel: string;
  generatedAt: string;
  vatMode: 'ex' | 'inc';
  summary: {
    revenue: number;
    payroll: number;
    oncost: number;
    fuel: number;
    fixed: number;
    fixedByCategory: Record<string, number>;
    profit: number;
    marginPct: number | null;
    shiftCount: number;
    unratedShifts: number;
    previousProfit: number | null;
    lastYearProfit: number | null;
  };
  drivers: DriverScore[];
  vehicles: VehicleScore[];
  customers: CustomerScore[];
}

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const money = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v < 0 ? '−' : ''}£${Math.abs(v).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`);
const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v.toFixed(0)}%`);
const num = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? '—' : v.toFixed(d));

export function buildReportHtml(r: ReportSnapshot): string {
  const s = r.summary;
  const costRows: [string, number][] = [
    ['Payroll', s.payroll],
    ...(s.oncost > 0 ? [['Employer NI & pension', s.oncost] as [string, number]] : []),
    ['Fuel & AdBlue', s.fuel],
    ...Object.entries(s.fixedByCategory),
  ];
  const delta = (prev: number | null) => (prev === null ? '—' : `${s.profit - prev >= 0 ? '+' : ''}${money(s.profit - prev)}`);

  return `<!doctype html><html><head><meta charset="utf-8"><title>Tachyo report · ${esc(r.periodLabel)}</title>
<style>
  *{box-sizing:border-box} body{font-family:Inter,Arial,sans-serif;color:#222;margin:0;padding:32px;font-size:12px}
  h1{font-size:22px;margin:0} h2{font-size:14px;margin:26px 0 8px;border-bottom:2px solid #222;padding-bottom:4px}
  .muted{color:#777} .red{color:#CC0000} .big{font-size:30px;font-weight:900;margin:6px 0}
  table{width:100%;border-collapse:collapse} th,td{text-align:left;padding:5px 6px;border-bottom:1px solid #e5e5e5}
  th{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#777} td.n{text-align:right;font-variant-numeric:tabular-nums}
  .grid{display:flex;gap:28px;flex-wrap:wrap} .brand{color:#CC0000;font-weight:900}
  @media print{body{padding:12mm} h2{break-after:avoid} tr{break-inside:avoid}}
</style></head><body>
<div class="grid" style="justify-content:space-between;align-items:flex-end">
  <div><div class="brand">tachyo.</div><h1>${esc(r.companyName || 'Fleet report')}</h1>
  <div class="muted">${esc(r.periodLabel)} · figures ${r.vatMode === 'inc' ? 'including' : 'excluding'} VAT · generated ${esc(new Date(r.generatedAt).toLocaleString('en-GB'))}</div></div>
</div>
<h2>True profit</h2>
<div class="grid">
  <div><div class="muted">After every cost</div><div class="big ${s.profit < 0 ? 'red' : ''}">${money(s.profit)}</div>
  <div>${s.marginPct === null ? 'No rated revenue' : `${s.marginPct.toFixed(1)}% margin`} · ${s.shiftCount} shifts${s.unratedShifts ? ` · <span class="red">${s.unratedShifts} awaiting a rate</span>` : ''}</div>
  <div class="muted" style="margin-top:6px">vs previous period: ${delta(s.previousProfit)} · vs last year: ${delta(s.lastYearProfit)}</div></div>
  <table style="max-width:360px"><tbody>
    <tr><td><strong>Revenue</strong></td><td class="n"><strong>${money(s.revenue)}</strong></td></tr>
    ${costRows.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n red">−${money(v).replace('−', '')}</td></tr>`).join('')}
    <tr><td><strong>True profit</strong></td><td class="n"><strong>${money(s.profit)}</strong></td></tr>
  </tbody></table>
</div>
<h2>Drivers</h2>
<table><thead><tr><th>Driver</th><th>Shifts</th><th>Hours/wk</th><th>Profit</th><th>£/hour</th><th>MPG</th><th>Walk-around</th><th>POD photos</th><th>On time</th><th>Idle alerts</th><th>Defects</th></tr></thead><tbody>
${r.drivers.map(d => `<tr><td>${esc(d.name)}</td><td class="n">${d.shifts}</td><td class="n ${d.wtdBreach ? 'red' : ''}">${num(d.avgWeeklyHours)}</td><td class="n">${money(d.profit)}</td><td class="n">${d.profitPerHour === null ? '—' : money(d.profitPerHour)}</td><td class="n">${num(d.mpg)}</td><td class="n">${pct(d.walkaroundPct)}</td><td class="n">${pct(d.photosPct)}</td><td class="n">${pct(d.onTimePct)}</td><td class="n">${d.idleAlerts}</td><td class="n">${d.defectsReported}</td></tr>`).join('') || '<tr><td colspan="11" class="muted">No shifts</td></tr>'}
</tbody></table>
<h2>Vehicles</h2>
<table><thead><tr><th>Vehicle</th><th>Days used</th><th>Miles</th><th>Revenue</th><th>Direct cost</th><th>Vehicle costs</th><th>Profit</th><th>£/mile</th><th>MPG</th></tr></thead><tbody>
${r.vehicles.map(v => `<tr><td>${esc(v.registration)}</td><td class="n">${v.daysUsed}</td><td class="n">${Math.round(v.miles)}</td><td class="n">${money(v.revenue)}</td><td class="n">${money(v.directCost)}</td><td class="n">${money(v.vehicleCosts)}</td><td class="n ${v.profit < 0 ? 'red' : ''}">${money(v.profit)}</td><td class="n">${v.profitPerMile === null ? '—' : `£${v.profitPerMile.toFixed(2)}`}</td><td class="n">${num(v.mpg)}</td></tr>`).join('') || '<tr><td colspan="9" class="muted">No vehicle data</td></tr>'}
</tbody></table>
<h2>Customers</h2>
<table><thead><tr><th>Customer</th><th>Loads</th><th>Revenue</th><th>Allocated cost</th><th>Contribution</th><th>Margin</th><th>Avg/load</th><th>On time</th></tr></thead><tbody>
${r.customers.map(c => `<tr><td>${esc(c.customer)}</td><td class="n">${c.loads}${c.ratedLoads < c.loads ? ` (${c.loads - c.ratedLoads} unrated)` : ''}</td><td class="n">${money(c.revenue)}</td><td class="n">${money(c.allocatedCost)}</td><td class="n ${c.contribution < 0 ? 'red' : ''}">${money(c.contribution)}</td><td class="n">${pct(c.marginPct)}</td><td class="n">${money(c.avgRevenuePerLoad)}</td><td class="n">${pct(c.onTimePct)}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">No loads</td></tr>'}
</tbody></table>
<p class="muted" style="margin-top:24px">Direct cost = wages + employer on-cost + fuel. Company-wide fixed costs appear only in True profit. Miles come from start- and end-of-shift walk-around odometer readings.</p>
</body></html>`;
}
