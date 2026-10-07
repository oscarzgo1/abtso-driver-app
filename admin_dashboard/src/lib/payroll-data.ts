// Payroll figures for a period, in the shapes a payroll spreadsheet needs.
// Every number here comes straight from the shifts the database has already
// priced (total_pay, rate_breakdown, night out, extras, deductions): nothing
// is re-rated in the browser, so a filled sheet can never disagree with the
// Compensation Summary.

export interface PayrollShift {
  id: string;
  driver_id: string;
  driver_name: string;
  driver_code: string;
  agency: string;
  depot: string;
  rate_type: string;
  start_time: string;
  end_time: string | null;
  status: string | null;
  total_hours: number;
  /** what the database stored for the whole shift (wage + night out + extras - deductions) */
  total_pay: number;
  night_out: number;
  night_out_status: string | null;
  extras: number;
  deductions: number;
  vehicle: string;
  trailer: string;
  load_reference: string;
  rate_breakdown: { day?: string; hours?: number; amount?: number }[] | null;
}

export interface DayRates { mf: number; sat: number; sun: number }

export interface PayrollEmployee {
  driverId: string;
  name: string;
  code: string;
  agency: string;
  depot: string;
  rateType: string;
  shifts: number;
  hours: number;
  hoursByWeekday: Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', number>;
  hoursMonFri: number;
  hoursSat: number;
  hoursSun: number;
  payMonFri: number;
  paySat: number;
  paySun: number;
  rates: DayRates;
  basicPay: number;
  nightOut: number;
  extras: number;
  deductions: number;
  gross: number;
  /** shifts still running or without a clock-out: their hours are not final */
  openShifts: number;
}

export interface PayrollShiftRow {
  driverId: string;
  name: string;
  code: string;
  agency: string;
  depot: string;
  start: string;
  end: string | null;
  hours: number;
  rate: number;
  wage: number;
  pay: number;
  nightOut: number;
  extras: number;
  deductions: number;
  load: string;
  vehicle: string;
  trailer: string;
}

export interface PayrollPeriod { label: string; start: string; end: string }

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const londonParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function londonFields(ms: number) {
  const o: Record<string, number> = {};
  for (const p of londonParts.formatToParts(new Date(ms))) if (p.type !== 'literal') o[p.type] = Number(p.value);
  return o;
}

/** Offset of UK time from UTC at an instant, in ms (0 in winter, 1h in summer). */
function londonOffsetMs(ms: number): number {
  const f = londonFields(ms);
  return Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second) - Math.floor(ms / 1000) * 1000;
}

/** The first UK midnight strictly after `ms`. */
function nextLondonMidnight(ms: number): number {
  const f = londonFields(ms);
  const guess = Date.UTC(f.year, f.month - 1, f.day + 1, 0, 0, 0);
  let t = guess - londonOffsetMs(guess);
  t = guess - londonOffsetMs(t);
  return t;
}

function londonWeekday(ms: number): number {
  const f = londonFields(ms);
  return new Date(Date.UTC(f.year, f.month - 1, f.day)).getUTCDay();
}

/** 'YYYY-MM-DD' of an instant in UK time. */
export function londonDay(iso: string): string {
  const f = londonFields(new Date(iso).getTime());
  return `${f.year}-${String(f.month).padStart(2, '0')}-${String(f.day).padStart(2, '0')}`;
}

export const ukDate = (iso: string) => {
  const f = londonFields(new Date(iso).getTime());
  return `${String(f.day).padStart(2, '0')}/${String(f.month).padStart(2, '0')}/${f.year}`;
};
export const ukTime = (iso: string) => {
  const f = londonFields(new Date(iso).getTime());
  return `${String(f.hour).padStart(2, '0')}:${String(f.minute).padStart(2, '0')}`;
};
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const ukDayName = (iso: string) => DAY_NAMES[londonWeekday(new Date(iso).getTime())];

/** Hours per UK calendar weekday for a finished shift, scaled to its paid hours. */
export function hoursByWeekday(startIso: string, endIso: string, paidHours: number): Record<(typeof WEEKDAYS)[number], number> {
  const out = { sun: 0, mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0 };
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!(end > start) || paidHours <= 0) return out;
  const parts: { day: (typeof WEEKDAYS)[number]; ms: number }[] = [];
  let cursor = start;
  while (cursor < end) {
    const next = Math.min(end, nextLondonMidnight(cursor));
    parts.push({ day: WEEKDAYS[londonWeekday(cursor)], ms: next - cursor });
    cursor = next;
  }
  const total = parts.reduce((s, p) => s + p.ms, 0);
  let given = 0;
  parts.forEach((p, i) => {
    // The last part takes the remainder so the days always add up to the paid hours.
    const h = i === parts.length - 1 ? r2(paidHours - given) : r2((p.ms / total) * paidHours);
    out[p.day] = r2(out[p.day] + h);
    given = r2(given + h);
  });
  return out;
}

const dayTypeOf = (iso: string): 'mf' | 'sat' | 'sun' => {
  const d = londonWeekday(new Date(iso).getTime());
  return d === 0 ? 'sun' : d === 6 ? 'sat' : 'mf';
};

export function buildPayrollEmployees(shifts: PayrollShift[], rates: Record<string, DayRates>): PayrollEmployee[] {
  const byDriver = new Map<string, PayrollEmployee>();
  for (const s of shifts) {
    let e = byDriver.get(s.driver_id);
    if (!e) {
      e = {
        driverId: s.driver_id, name: s.driver_name, code: s.driver_code, agency: s.agency, depot: s.depot, rateType: s.rate_type,
        shifts: 0, hours: 0,
        hoursByWeekday: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 },
        hoursMonFri: 0, hoursSat: 0, hoursSun: 0, payMonFri: 0, paySat: 0, paySun: 0,
        rates: rates[s.driver_id] ?? { mf: 0, sat: 0, sun: 0 },
        basicPay: 0, nightOut: 0, extras: 0, deductions: 0, gross: 0, openShifts: 0,
      };
      byDriver.set(s.driver_id, e);
    }
    e.shifts += 1;
    const closed = !!s.end_time && s.status === 'completed';
    if (!closed) e.openShifts += 1;
    const hrs = Number(s.total_hours) || 0;
    e.hours = r2(e.hours + hrs);
    e.gross = r2(e.gross + s.total_pay);
    e.nightOut = r2(e.nightOut + s.night_out);
    e.extras = r2(e.extras + s.extras);
    e.deductions = r2(e.deductions + s.deductions);
    const wage = r2(s.total_pay - s.night_out - s.extras + s.deductions);
    e.basicPay = r2(e.basicPay + wage);

    const bd = s.rate_breakdown;
    if (bd && bd.length > 0) {
      for (const seg of bd) {
        const t = (seg.day === 'sun' || seg.day === 'sat') ? seg.day : 'mf';
        const h = Number(seg.hours) || 0;
        const a = Number(seg.amount) || 0;
        if (t === 'sun') { e.hoursSun = r2(e.hoursSun + h); e.paySun = r2(e.paySun + a); }
        else if (t === 'sat') { e.hoursSat = r2(e.hoursSat + h); e.paySat = r2(e.paySat + a); }
        else { e.hoursMonFri = r2(e.hoursMonFri + h); e.payMonFri = r2(e.payMonFri + a); }
      }
    } else {
      const t = dayTypeOf(s.start_time);
      if (t === 'sun') { e.hoursSun = r2(e.hoursSun + hrs); e.paySun = r2(e.paySun + wage); }
      else if (t === 'sat') { e.hoursSat = r2(e.hoursSat + hrs); e.paySat = r2(e.paySat + wage); }
      else { e.hoursMonFri = r2(e.hoursMonFri + hrs); e.payMonFri = r2(e.payMonFri + wage); }
    }

    if (s.end_time) {
      const w = hoursByWeekday(s.start_time, s.end_time, hrs);
      (Object.keys(w) as (keyof typeof w)[]).forEach(k => { e!.hoursByWeekday[k] = r2(e!.hoursByWeekday[k] + w[k]); });
    }
  }
  return [...byDriver.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** One row per shift, oldest first within each employee. */
export function buildShiftRows(shifts: PayrollShift[]): PayrollShiftRow[] {
  return shifts
    .map(s => {
      const hours = Number(s.total_hours) || 0;
      const wage = r2(s.total_pay - s.night_out - s.extras + s.deductions);
      return {
        driverId: s.driver_id, name: s.driver_name, code: s.driver_code, agency: s.agency, depot: s.depot,
        start: s.start_time, end: s.end_time, hours, rate: hours > 0 ? r2(wage / hours) : 0, wage, pay: r2(s.total_pay),
        nightOut: r2(s.night_out), extras: r2(s.extras), deductions: r2(s.deductions),
        load: s.load_reference, vehicle: s.vehicle, trailer: s.trailer,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.start.localeCompare(b.start));
}

// ── Fields a sheet column can be filled with ─────────────────
export type FieldKind = 'text' | 'hours' | 'money' | 'int';

export interface FieldDef {
  key: string;
  /** Plain wording shown to the person setting a sheet up */
  label: string;
  group: string;
  kind: FieldKind;
  get: (e: PayrollEmployee, p: PayrollPeriod) => string | number;
}

export interface ShiftFieldDef {
  key: string;
  label: string;
  group: string;
  kind: FieldKind;
  get: (r: PayrollShiftRow, p: PayrollPeriod) => string | number;
}

const day = (k: keyof PayrollEmployee['hoursByWeekday'], label: string): FieldDef => ({
  key: `hours_${k}`, label: `Hours worked on ${label}`, group: 'Hours by weekday', kind: 'hours', get: e => e.hoursByWeekday[k],
});

export const PAYROLL_FIELDS: FieldDef[] = [
  { key: 'name', label: 'Employee name', group: 'Employee', kind: 'text', get: e => e.name },
  { key: 'code', label: 'Employee ID / payroll number', group: 'Employee', kind: 'text', get: e => e.code },
  { key: 'agency', label: 'Agency', group: 'Employee', kind: 'text', get: e => e.agency },
  { key: 'depot', label: 'Depot', group: 'Employee', kind: 'text', get: e => e.depot },
  { key: 'rate_type', label: 'Pay type (hourly or fixed)', group: 'Employee', kind: 'text', get: e => e.rateType },
  { key: 'shifts', label: 'Number of shifts', group: 'Hours', kind: 'int', get: e => e.shifts },
  { key: 'hours', label: 'Hours worked (total)', group: 'Hours', kind: 'hours', get: e => e.hours },
  { key: 'hours_rate_mf', label: 'Hours paid at the Mon-Fri rate', group: 'Hours', kind: 'hours', get: e => e.hoursMonFri },
  { key: 'hours_rate_sat', label: 'Hours paid at the Saturday rate', group: 'Hours', kind: 'hours', get: e => e.hoursSat },
  { key: 'hours_rate_sun', label: 'Hours paid at the Sunday rate', group: 'Hours', kind: 'hours', get: e => e.hoursSun },
  day('mon', 'Monday'), day('tue', 'Tuesday'), day('wed', 'Wednesday'), day('thu', 'Thursday'),
  day('fri', 'Friday'), day('sat', 'Saturday'), day('sun', 'Sunday'),
  { key: 'rate_mf', label: 'Hourly rate Mon-Fri', group: 'Rates', kind: 'money', get: e => e.rates.mf },
  { key: 'rate_sat', label: 'Hourly rate Saturday', group: 'Rates', kind: 'money', get: e => e.rates.sat },
  { key: 'rate_sun', label: 'Hourly rate Sunday', group: 'Rates', kind: 'money', get: e => e.rates.sun },
  // The rate as set for the employee (Compensation), not a figure worked back from pay and hours,
  // which drifts (for example 15.90 when the rate is 16.00). Only when no rate is set is the average used.
  { key: 'avg_rate', label: 'Hourly rate (as set for the employee)', group: 'Rates', kind: 'money', get: e => (e.rates.mf > 0 ? e.rates.mf : e.hours > 0 ? r2(e.basicPay / e.hours) : 0) },
  { key: 'pay_mf', label: 'Pay for Mon-Fri hours', group: 'Pay', kind: 'money', get: e => e.payMonFri },
  { key: 'pay_sat', label: 'Pay for Saturday hours', group: 'Pay', kind: 'money', get: e => e.paySat },
  { key: 'pay_sun', label: 'Pay for Sunday hours', group: 'Pay', kind: 'money', get: e => e.paySun },
  { key: 'basic_pay', label: 'Basic pay (hours x rate)', group: 'Pay', kind: 'money', get: e => e.basicPay },
  { key: 'night_out', label: 'Night out allowance', group: 'Pay', kind: 'money', get: e => e.nightOut },
  { key: 'extras', label: 'Extras / bonus', group: 'Pay', kind: 'money', get: e => e.extras },
  { key: 'deductions', label: 'Deductions', group: 'Pay', kind: 'money', get: e => e.deductions },
  { key: 'gross', label: 'Total pay for the period (gross)', group: 'Pay', kind: 'money', get: e => e.gross },
  { key: 'period_start', label: 'Period start date', group: 'Period', kind: 'text', get: (_e, p) => p.start },
  { key: 'period_end', label: 'Period end date', group: 'Period', kind: 'text', get: (_e, p) => p.end },
];

export const SHIFT_FIELDS: ShiftFieldDef[] = [
  { key: 'sh_name', label: 'Employee name', group: 'Employee', kind: 'text', get: r => r.name },
  { key: 'sh_code', label: 'Employee ID / payroll number', group: 'Employee', kind: 'text', get: r => r.code },
  { key: 'sh_agency', label: 'Agency', group: 'Employee', kind: 'text', get: r => r.agency },
  { key: 'sh_depot', label: 'Depot', group: 'Employee', kind: 'text', get: r => r.depot },
  { key: 'sh_date', label: 'Date of the shift', group: 'Shift', kind: 'text', get: r => ukDate(r.start) },
  { key: 'sh_day', label: 'Day of the week', group: 'Shift', kind: 'text', get: r => ukDayName(r.start) },
  { key: 'sh_start', label: 'Clock-in time', group: 'Shift', kind: 'text', get: r => ukTime(r.start) },
  { key: 'sh_end', label: 'Clock-out time', group: 'Shift', kind: 'text', get: r => (r.end ? ukTime(r.end) : '') },
  { key: 'sh_hours', label: 'Hours worked', group: 'Shift', kind: 'hours', get: r => r.hours },
  { key: 'sh_load', label: 'Load reference', group: 'Shift', kind: 'text', get: r => r.load },
  { key: 'sh_vehicle', label: 'Tractor / vehicle', group: 'Shift', kind: 'text', get: r => r.vehicle },
  { key: 'sh_trailer', label: 'Trailer', group: 'Shift', kind: 'text', get: r => r.trailer },
  { key: 'sh_rate', label: 'Hourly rate', group: 'Pay', kind: 'money', get: r => r.rate },
  { key: 'sh_wage', label: 'Basic pay (hours x rate)', group: 'Pay', kind: 'money', get: r => r.wage },
  { key: 'sh_nightout', label: 'Night out allowance', group: 'Pay', kind: 'money', get: r => r.nightOut },
  { key: 'sh_extras', label: 'Extras / bonus', group: 'Pay', kind: 'money', get: r => r.extras },
  { key: 'sh_deductions', label: 'Deductions', group: 'Pay', kind: 'money', get: r => r.deductions },
  { key: 'sh_pay', label: 'Total pay for the shift', group: 'Pay', kind: 'money', get: r => r.pay },
];

export const FIELD_BY_KEY: Record<string, FieldDef> = Object.fromEntries(PAYROLL_FIELDS.map(f => [f.key, f]));
export const SHIFT_FIELD_BY_KEY: Record<string, ShiftFieldDef> = Object.fromEntries(SHIFT_FIELDS.map(f => [f.key, f]));
export const resolveFieldDef = (key: string): FieldDef | undefined => FIELD_BY_KEY[key];
export const resolveShiftFieldDef = (key: string): ShiftFieldDef | undefined => SHIFT_FIELD_BY_KEY[key];

// ── Reading headings ────────────────────────────────────────
export type SheetLayout = 'employee' | 'shift';
export interface ColumnGuess { key: string; confidence: 'high' | 'medium' }

const clean = (header: string) => header.toLowerCase().replace(/[£$()\[\]\/\\-]/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Does this set of headings describe one row per shift? */
export function detectLayout(headers: string[]): SheetLayout {
  const hs = headers.map(clean);
  const hasDate = hs.some(h => /^(shift )?date$|^day date$|^worked on$|^work date$/.test(h));
  const hasIn = hs.some(h => /^(start|start time|time in|clock in|in|in time|begin|from|shift start)$/.test(h));
  const hasOut = hs.some(h => /^(end|end time|time out|clock out|out|out time|finish|finish time|to|shift end)$/.test(h));
  return hasDate && (hasIn || hasOut) ? 'shift' : hasIn && hasOut ? 'shift' : 'employee';
}

/** Which payroll field does this column heading ask for? */
export function guessColumn(header: string, layout: SheetLayout): ColumnGuess | null {
  const h = clean(header);
  if (!h) return null;
  const is = (re: RegExp) => re.test(h);
  const hi = (key: string): ColumnGuess => ({ key, confidence: 'high' });
  const med = (key: string): ColumnGuess => ({ key, confidence: 'medium' });
  const p = layout === 'shift' ? 'sh_' : '';

  // The employee's identity
  if (is(/^(employee name|staff member|name|full name|driver name|driver|employee|staff|worker|operative)$/)) return hi(`${p}name`);
  if (is(/^(payroll no|payroll number|payroll id|employee id|employee no|employee number|emp no|emp id|staff id|staff no|driver id|driver number|clock number|clock no|ref|id)$/)) return hi(`${p}code`);
  if (is(/^agency( name)?$/)) return hi(`${p}agency`);
  if (is(/^(depot|site|location|branch)$/)) return hi(`${p}depot`);

  if (layout === 'shift') {
    if (is(/^(shift )?date$|^work date$|^date worked$|^worked on$/)) return hi('sh_date');
    if (is(/^(day|weekday|day of week)$/)) return hi('sh_day');
    if (is(/^(start|start time|time in|clock in|in|in time|begin|from|shift start|clocked in)$/)) return hi('sh_start');
    if (is(/^(end|end time|time out|clock out|out|out time|finish|finish time|to|shift end|clocked out)$/)) return hi('sh_end');
    if (is(/^(hours|hrs|hours worked|total hours|total hrs|duration|worked hours)$/)) return hi('sh_hours');
    if (is(/^(load|load ref|load reference|vrid|load no|job|job ref)$/)) return hi('sh_load');
    if (is(/^(vehicle|truck|tractor|tractor unit|reg|registration|vrm)$/)) return hi('sh_vehicle');
    if (is(/^(trailer|trailer no|trailer number)$/)) return hi('sh_trailer');
    if (is(/^(rate|hourly rate|pay rate|rate per hour|rate hr|rate £|£ hr|per hour)$/)) return hi('sh_rate');
    if (is(/^(basic|basic pay|wage|wages|hours pay|pay for hours)$/)) return hi('sh_wage');
    if (is(/^(night out|night outs|night allowance|night out allowance|subsistence|overnight)$/)) return hi('sh_nightout');
    if (is(/^(extras|extra|bonus|expenses|extras bonus)$/)) return hi('sh_extras');
    if (is(/^(deductions|deduction|less)$/)) return hi('sh_deductions');
    if (is(/^(pay|total|total pay|amount|gross|gross pay|total due|shift pay|earned)$/)) return hi('sh_pay');
    // looser wording
    if (is(/(^| )date( |$)/)) return med('sh_date');
    if (is(/start|time in|clock in/)) return med('sh_start');
    if (is(/finish|time out|clock out|(^| )end( |$)/)) return med('sh_end');
    if (is(/hours|hrs/)) return med('sh_hours');
    if (is(/rate/)) return med('sh_rate');
    if (is(/night|subsist/)) return med('sh_nightout');
    if (is(/extra|bonus/)) return med('sh_extras');
    if (is(/deduct/)) return med('sh_deductions');
    if (is(/gross|total|pay due|amount/)) return med('sh_pay');
    if (is(/name|employee|driver|staff/)) return med('sh_name');
    return null;
  }

  // One row per employee
  const weekday: [RegExp, string][] = [
    [/^(mon|monday)$/, 'hours_mon'], [/^(tue|tues|tuesday)$/, 'hours_tue'], [/^(wed|weds|wednesday)$/, 'hours_wed'],
    [/^(thu|thur|thurs|thursday)$/, 'hours_thu'], [/^(fri|friday)$/, 'hours_fri'], [/^(sat|saturday)$/, 'hours_sat'], [/^(sun|sunday)$/, 'hours_sun'],
  ];
  for (const [re, key] of weekday) if (is(re)) return hi(key);
  for (const [re, key] of weekday) {
    const m = re.source.replace(/\^|\$/g, '');
    if (new RegExp(`^(${m}) (hrs|hours)$|^(hrs|hours) (${m})$`).test(h)) return hi(key);
  }

  if (is(/^(hours|hrs|hours worked|total hours|total hrs|hrs worked|hours total|worked hours|actual hours|payable hours)$/)) return hi('hours');
  if (is(/^(shifts|no of shifts|number of shifts|days worked|days)$/)) return hi('shifts');
  if (is(/^(rate|hourly rate|pay rate|rate per hour|rate hr|per hour|ph|hourly)$/)) return hi('avg_rate');
  if (is(/^(basic|basic pay|basic wage|wage|wages|pay for hours|hours pay)$/)) return hi('basic_pay');
  if (is(/^(night out|night outs|night allowance|night out allowance|subsistence|overnight|night out pay)$/)) return hi('night_out');
  if (is(/^(extras|extra|bonus|expenses|extras bonus|bonus extras|bonus expenses|other pay)$/)) return hi('extras');
  if (is(/^(deductions|deduction|less|total deductions)$/)) return hi('deductions');
  if (is(/^(gross|gross pay|total pay|total due|total earnings|pay|amount|net pay due|pay due|total payable|total gbp|gross wages|total wages|total)$/)) return hi('gross');
  if (is(/^(period start|week start|from|start date|date from|period from)$/)) return hi('period_start');
  if (is(/^(period end|week end|week ending|to|end date|date to|period to|w e|we)$/)) return hi('period_end');
  if (is(/^(pay type|rate type|contract|contract type)$/)) return hi('rate_type');

  // looser wording
  if (is(/rate/) && is(/sun/)) return med('rate_sun');
  if (is(/rate/) && is(/sat/)) return med('rate_sat');
  if (is(/rate/) && is(/mon|week|fri/)) return med('rate_mf');
  if (is(/rate|per hour|hourly/)) return med('avg_rate');
  if (is(/hours|hrs/) && is(/sun/)) return med('hours_rate_sun');
  if (is(/hours|hrs/) && is(/sat/)) return med('hours_rate_sat');
  if (is(/total due|gross|total pay|pay due|payable|amount due/)) return med('gross');
  if (is(/night|subsist|overnight/)) return med('night_out');
  if (is(/deduct/)) return med('deductions');
  if (is(/extra|bonus|expenses/)) return med('extras');
  if (is(/basic|wage/)) return med('basic_pay');
  if (is(/total hours|hours worked|hrs worked|hours|hrs/)) return med('hours');
  if (is(/shift|days worked/)) return med('shifts');
  if (is(/agency/)) return med('agency');
  if (is(/depot|site/)) return med('depot');
  if (is(/payroll|emp(loyee)? ?(id|no|number|ref|code)|driver ?(id|no|number|code)|clock/)) return med('code');
  if (is(/name|employee|driver|staff|worker|operative/)) return med('name');
  return null;
}
