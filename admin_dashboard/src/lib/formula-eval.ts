import type { Cell, Worksheet } from 'exceljs';

// A small spreadsheet-formula calculator for the "Fill in the template"
// preview. A filled workbook holds formulas but not their results, so the
// preview works the numbers out itself and shows those instead of the formula
// text. It understands the formulas accountants' payroll sheets use (cell
// references, ranges, + - * / ^ & comparisons and the common functions); on
// anything else it gives up and the preview shows the cell's stored result,
// or nothing, but never the formula.

type Scalar = number | string | boolean | null;
type Value = Scalar | Scalar[];

class Unsupported extends Error {}

const colToNum = (c: string) => c.split('').reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0);

const TOKEN = /\s*(?:(\d+(?:\.\d+)?%?)|"((?:[^"]|"")*)"|((?:'[^']+'|[A-Za-z0-9_]+)!)?(\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?)(?![A-Za-z0-9_(])|([A-Za-z][A-Za-z0-9._]*)\(|(<=|>=|<>|[-+*/^&=<>(),]))/y;

interface Tok { t: 'num' | 'str' | 'ref' | 'fn' | 'op'; v: string; sheet?: string }

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  TOKEN.lastIndex = 0;
  let pos = 0;
  while (pos < src.length) {
    if (/^\s*$/.test(src.slice(pos))) break;
    TOKEN.lastIndex = pos;
    const m = TOKEN.exec(src);
    if (!m) throw new Unsupported('token');
    pos = TOKEN.lastIndex;
    if (m[1] !== undefined) out.push({ t: 'num', v: m[1] });
    else if (m[2] !== undefined) out.push({ t: 'str', v: m[2].replace(/""/g, '"') });
    else if (m[4] !== undefined) out.push({ t: 'ref', v: m[4].replace(/\$/g, ''), sheet: m[3] ? m[3].slice(0, -1).replace(/^'|'$/g, '') : undefined });
    else if (m[5] !== undefined) out.push({ t: 'fn', v: m[5].toUpperCase() });
    else out.push({ t: 'op', v: m[6] });
  }
  return out;
}

const num = (v: Value): number => {
  if (Array.isArray(v)) return num(v[0] ?? null);
  if (v === null || v === '') return 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[£,\s]/g, ''));
  if (!Number.isFinite(n)) throw new Unsupported('not a number');
  return n;
};
const text = (v: Value): string => (Array.isArray(v) ? text(v[0] ?? null) : v === null ? '' : String(v));
const flat = (args: Value[]): Scalar[] => args.flatMap(a => (Array.isArray(a) ? a : [a]));
const numbers = (args: Value[]): number[] =>
  flat(args).filter((x): x is number => typeof x === 'number' || (typeof x === 'string' && x.trim() !== '' && Number.isFinite(Number(x))))
    .map(x => Number(x));

export function evaluateFormula(ws: Worksheet, formula: string, depth = 0): Scalar {
  if (depth > 40) throw new Unsupported('too deep');
  const toks = tokenize(formula.replace(/^=/, ''));
  let i = 0;
  const peek = () => toks[i];
  const take = () => toks[i++];
  const isOp = (v: string) => peek()?.t === 'op' && peek()!.v === v;

  const cellValue = (sheet: Worksheet, addr: string): Scalar => {
    const cell = sheet.getCell(addr);
    const raw = cell.value as unknown;
    if (raw && typeof raw === 'object' && ('formula' in raw || 'sharedFormula' in raw)) {
      const f = (cell as unknown as { formula?: string }).formula ?? (raw as { formula?: string }).formula;
      if (typeof f === 'string' && f) return evaluateFormula(sheet, f, depth + 1);
      const r = (raw as { result?: unknown }).result;
      return typeof r === 'number' || typeof r === 'string' || typeof r === 'boolean' ? r : null;
    }
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number' || typeof raw === 'string' || typeof raw === 'boolean') return raw;
    if (raw instanceof Date) return raw.getTime() / 86400000 + 25569;
    const o = raw as { richText?: { text: string }[]; text?: string; result?: unknown };
    if (o.richText) return o.richText.map(t => t.text).join('');
    if (typeof o.text === 'string') return o.text;
    return null;
  };

  const sheetFor = (name?: string): Worksheet => {
    if (!name) return ws;
    const other = ws.workbook.getWorksheet(name);
    if (!other) throw new Unsupported('sheet');
    return other;
  };

  const refValue = (tok: Tok): Value => {
    const sheet = sheetFor(tok.sheet);
    if (!tok.v.includes(':')) return cellValue(sheet, tok.v);
    const [a, b] = tok.v.split(':');
    const ma = /^([A-Z]+)(\d+)$/.exec(a)!;
    const mb = /^([A-Z]+)(\d+)$/.exec(b)!;
    const [c1, c2] = [colToNum(ma[1]), colToNum(mb[1])].sort((x, y) => x - y);
    const [r1, r2] = [Number(ma[2]), Number(mb[2])].sort((x, y) => x - y);
    if ((c2 - c1 + 1) * (r2 - r1 + 1) > 20000) throw new Unsupported('range too large');
    const out: Scalar[] = [];
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) out.push(sheet.getCell(r, c).value === null ? null : cellValue(sheet, sheet.getCell(r, c).address));
    return out;
  };

  const callFn = (name: string, args: Value[]): Value => {
    switch (name) {
      case 'SUM': return numbers(args).reduce((a, b) => a + b, 0);
      case 'AVERAGE': { const n = numbers(args); if (!n.length) throw new Unsupported('div0'); return n.reduce((a, b) => a + b, 0) / n.length; }
      case 'MIN': { const n = numbers(args); return n.length ? Math.min(...n) : 0; }
      case 'MAX': { const n = numbers(args); return n.length ? Math.max(...n) : 0; }
      case 'COUNT': return numbers(args).length;
      case 'COUNTA': return flat(args).filter(x => x !== null && x !== '').length;
      case 'ROUND': { const f = 10 ** num(args[1] ?? 0); return Math.round((num(args[0]) + Number.EPSILON) * f) / f; }
      case 'ROUNDUP': { const f = 10 ** num(args[1] ?? 0); return Math.ceil(num(args[0]) * f - 1e-9) / f; }
      case 'ROUNDDOWN': { const f = 10 ** num(args[1] ?? 0); return Math.floor(num(args[0]) * f + 1e-9) / f; }
      case 'ABS': return Math.abs(num(args[0]));
      case 'INT': return Math.floor(num(args[0]));
      case 'MOD': { const d = num(args[1]); if (d === 0) throw new Unsupported('div0'); const r = num(args[0]) % d; return r !== 0 && (r < 0) !== (d < 0) ? r + d : r; }
      case 'IF': return args[0] && (Array.isArray(args[0]) ? args[0][0] : args[0]) ? (args[1] ?? true) : (args[2] ?? false);
      case 'AND': return flat(args).every(Boolean);
      case 'OR': return flat(args).some(Boolean);
      case 'NOT': return !args[0];
      case 'CONCATENATE': case 'CONCAT': return args.map(text).join('');
      default: throw new Unsupported(name);
    }
  };

  const parseArgs = (): Value[] => {
    const args: Value[] = [];
    if (isOp(')')) { take(); return args; }
    for (;;) {
      args.push(compare());
      if (isOp(',')) { take(); continue; }
      if (isOp(')')) { take(); return args; }
      throw new Unsupported('args');
    }
  };

  const primary = (): Value => {
    const tk = take();
    if (!tk) throw new Unsupported('end');
    if (tk.t === 'num') return tk.v.endsWith('%') ? Number(tk.v.slice(0, -1)) / 100 : Number(tk.v);
    if (tk.t === 'str') return tk.v;
    if (tk.t === 'ref') return refValue(tk);
    if (tk.t === 'fn') {
      // IF only evaluates the branch it needs, but evaluating both is harmless for these sheets.
      return callFn(tk.v, parseArgs());
    }
    if (tk.v === '(') { const v = compare(); if (!isOp(')')) throw new Unsupported('paren'); take(); return v; }
    if (tk.v === '-') return -num(power());
    if (tk.v === '+') return num(power());
    throw new Unsupported('unexpected');
  };
  const power = (): Value => {
    let l = primary();
    while (isOp('^')) { take(); l = num(l) ** num(primary()); }
    return l;
  };
  const term = (): Value => {
    let l = power();
    while (isOp('*') || isOp('/')) {
      const op = take().v; const r = num(power());
      if (op === '/') { if (r === 0) throw new Unsupported('div0'); l = num(l) / r; } else l = num(l) * r;
    }
    return l;
  };
  const sum = (): Value => {
    let l = term();
    while (isOp('+') || isOp('-')) { const op = take().v; const r = num(term()); l = op === '+' ? num(l) + r : num(l) - r; }
    return l;
  };
  const concat = (): Value => {
    let l = sum();
    while (isOp('&')) { take(); l = text(l) + text(sum()); }
    return l;
  };
  const compare = (): Value => {
    const l = concat();
    const t = peek();
    if (t?.t === 'op' && ['=', '<', '>', '<=', '>=', '<>'].includes(t.v)) {
      take();
      const r = concat();
      const a = Array.isArray(l) ? l[0] ?? null : l; const b = Array.isArray(r) ? r[0] ?? null : r;
      const both = typeof a === 'number' && typeof b === 'number';
      const x = both ? a : text(a).toLowerCase(); const y = both ? b : text(b).toLowerCase();
      switch (t.v) { case '=': return x === y; case '<>': return x !== y; case '<': return x < y; case '>': return x > y; case '<=': return x <= y; default: return x >= y; }
    }
    return l;
  };

  const result = compare();
  if (i < toks.length) throw new Unsupported('trailing');
  const scalar = Array.isArray(result) ? result[0] ?? null : result;
  return scalar;
}

/** What to show in the preview for a formula cell: its worked-out value, never the formula. */
export function formulaDisplay(ws: Worksheet, cell: Cell, stored: string): string {
  const f = (cell as unknown as { formula?: string }).formula;
  if (typeof f === 'string' && f) {
    try {
      const v = evaluateFormula(ws, f);
      if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 100) / 100) : '';
      if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
      return v === null ? '' : String(v);
    } catch {
      /* fall through to the stored result */
    }
  }
  // A stored result that is itself formula-like or an error is not shown.
  return stored && !stored.startsWith('=') && !/^#/.test(stored) ? stored : '';
}
