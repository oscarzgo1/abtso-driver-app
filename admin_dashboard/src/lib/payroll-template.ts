import type { Workbook, Worksheet, Cell } from 'exceljs';
import Papa from 'papaparse';
import {
  resolveFieldDef, resolveShiftFieldDef, guessColumn, detectLayout,
  type PayrollEmployee, type PayrollShiftRow, type PayrollPeriod, type FieldKind, type SheetLayout, type ColumnGuess,
} from './payroll-data';

// Fills a company's own payroll spreadsheet (the one their accountant sends)
// from the figures in the admin panel. The sheet keeps its formatting,
// formulas and every other cell: only the columns the user has confirmed are
// written, only on the rows that belong to each employee (or to each shift).
//
// Three kinds of sheet are handled:
//   employee  one row per employee, totals for the period (optionally with a
//             Monday-Sunday hours column per day)
//   shift     one row per shift (date, clock-in, clock-out, hours...)
//   groups    several sheets, one per agency or depot, each of the above

export interface SheetMapping {
  sheetName: string;
  headerRow: number;
  /** sheet column number (1-based, as a string) -> payroll field key */
  columns: Record<string, string>;
}

export interface TemplateConfig {
  layout: SheetLayout;
  /** write employees that are not already listed in the sheet into free rows */
  appendMissing: boolean;
  /** several sheets: which employees belong on which sheet */
  groupBy: 'none' | 'agency' | 'depot';
  sheets: SheetMapping[];
}

export interface TemplateColumn {
  index: number;
  header: string;
  /** cells in this column below the heading that hold a formula (excluding the totals row) */
  formulaCells: number;
  /** what the accountant's sheet has under this heading, if anything */
  sample: string;
}

export interface LoadedTemplate {
  workbook: Workbook;
  isCsv: boolean;
  sheetNames: string[];
}

export async function loadTemplate(buffer: ArrayBuffer, fileName: string): Promise<LoadedTemplate> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const isCsv = /\.csv$/i.test(fileName);
  if (/\.xls$/i.test(fileName)) {
    throw new Error('Old .xls files are not supported. Open it in Excel, choose Save As, pick .xlsx, and drop that file instead.');
  }
  if (isCsv) {
    const text = new TextDecoder('utf-8').decode(buffer).replace(/^﻿/, '');
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: false });
    const ws = workbook.addWorksheet('Sheet1');
    parsed.data.forEach(row => ws.addRow(row.map(v => (v === '' ? null : v))));
  } else {
    await workbook.xlsx.load(buffer);
  }
  const sheetNames = workbook.worksheets.map(w => w.name);
  if (sheetNames.length === 0) throw new Error('That file has no sheets.');
  return { workbook, isCsv, sheetNames };
}

export function cellText(cell: Cell | undefined): string {
  if (!cell) return '';
  const v = cell.value as unknown;
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as { richText?: { text: string }[]; text?: string; result?: unknown; formula?: string };
    if (o.richText) return o.richText.map(t => t.text).join('').trim();
    if (o.result !== undefined && o.result !== null) return String(o.result).trim();
    if (typeof o.text === 'string') return o.text.trim();
  }
  return '';
}

export function isFormulaCell(cell: Cell | undefined): boolean {
  if (!cell) return false;
  const v = cell.value as unknown;
  return !!v && typeof v === 'object' && ('formula' in (v as object) || 'sharedFormula' in (v as object));
}

const isTotalLabel = (s: string) => /^(grand\s+)?(sub)?total\b|^sum\b/i.test(s.trim());

const columnCount = (ws: Worksheet) => Math.max(ws.columnCount, ws.actualColumnCount, 1);

/** The row that looks most like column headings: the one with the most text cells near the top. */
export function detectHeaderRow(ws: Worksheet): number {
  let best = 1;
  let bestCount = 0;
  const limit = Math.min(Math.max(ws.rowCount, 1), 30);
  const cols = columnCount(ws);
  for (let r = 1; r <= limit; r++) {
    let count = 0;
    for (let c = 1; c <= cols; c++) {
      const t = cellText(ws.getRow(r).getCell(c));
      if (t && Number.isNaN(Number(t.replace(/[£,]/g, '')))) count += 1;
    }
    if (count > bestCount) { bestCount = count; best = r; }
  }
  return best;
}

/** Every column with a heading in `headerRow`. */
export function readColumns(ws: Worksheet, headerRow: number): TemplateColumn[] {
  const cols: TemplateColumn[] = [];
  const lastRow = Math.min(ws.rowCount, headerRow + 200);
  const n = columnCount(ws);
  for (let index = 1; index <= n; index++) {
    const header = cellText(ws.getRow(headerRow).getCell(index));
    if (!header) continue;
    let formulaCells = 0;
    let sample = '';
    for (let r = headerRow + 1; r <= lastRow; r++) {
      const rowObj = ws.getRow(r);
      let firstText = '';
      for (let c = 1; c <= n && !firstText; c++) firstText = cellText(rowObj.getCell(c));
      if (firstText && isTotalLabel(firstText)) break;
      const c = rowObj.getCell(index);
      if (isFormulaCell(c)) formulaCells += 1;
      if (!sample) sample = cellText(c);
    }
    cols.push({ index, header, formulaCells, sample });
  }
  return cols;
}

export interface SheetAnalysis {
  headerRow: number;
  columns: TemplateColumn[];
  layout: SheetLayout;
  guesses: Record<string, ColumnGuess | null>;
}

/** Read a sheet's headings and work out what each column probably wants. */
export function analyseSheet(ws: Worksheet, forcedHeaderRow?: number, forcedLayout?: SheetLayout): SheetAnalysis {
  const headerRow = forcedHeaderRow ?? detectHeaderRow(ws);
  const columns = readColumns(ws, headerRow);
  const layout = forcedLayout ?? detectLayout(columns.map(c => c.header));
  const guesses: Record<string, ColumnGuess | null> = {};
  const used = new Set<string>();
  // High-confidence guesses claim a field first, so a second column with a
  // vaguer heading can't steal it.
  const ordered = [...columns].sort((a, b) => {
    const ga = guessColumn(a.header, layout)?.confidence === 'high' ? 0 : 1;
    const gb = guessColumn(b.header, layout)?.confidence === 'high' ? 0 : 1;
    return ga - gb || a.index - b.index;
  });
  for (const c of ordered) {
    const g = guessColumn(c.header, layout);
    if (g && !used.has(g.key)) { guesses[String(c.index)] = g; used.add(g.key); } else guesses[String(c.index)] = null;
  }
  return { headerRow, columns, layout, guesses };
}

// ── matching names ──────────────────────────────────────────
const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
/** "John Smith", "Smith John" and "Smith, John" all become the same key. */
const nameKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).sort().join('');

export interface PlannedRow {
  row: number;
  employee: PayrollEmployee;
  how: 'matched' | 'appended';
  /** a new row inserted above the totals row (it does not exist in the template yet) */
  inserted?: boolean;
}

export interface EmployeeSheetPlan {
  sheetName: string;
  kind: 'employee';
  nameColumn: number | null;
  rows: PlannedRow[];
  untouchedTemplateRows: { row: number; label: string }[];
  notPlaced: { employee: PayrollEmployee; reason: string }[];
  skippedFormulaColumns: { index: number; header: string }[];
  formulaCells: Set<string>;
  ambiguous: string[];
  totalsRow: number | null;
  /** rows that have to be inserted above the totals row to fit every employee */
  insertRows: number;
}

export interface ShiftSheetPlan {
  sheetName: string;
  kind: 'shift';
  startRow: number;
  rows: PayrollShiftRow[];
  totalsRow: number | null;
  /** rows that have to be inserted above the totals row to fit every shift */
  insertRows: number;
}

export type SheetPlan = EmployeeSheetPlan | ShiftSheetPlan;

/** Which employees belong on a sheet when the file has one sheet per agency or depot. */
export function employeesForSheet(cfg: TemplateConfig, sheetIndex: number, sheetName: string, employees: PayrollEmployee[]): PayrollEmployee[] {
  if (cfg.sheets.length <= 1 || cfg.groupBy === 'none') return sheetIndex === 0 ? employees : [];
  const key = normName(sheetName);
  return employees.filter(e => {
    const g = normName(cfg.groupBy === 'agency' ? e.agency : e.depot);
    return g !== '' && (g === key || key.includes(g) || g.includes(key));
  });
}

export function planEmployeeSheet(ws: Worksheet, sheet: SheetMapping, employees: PayrollEmployee[], columns: TemplateColumn[], appendMissing: boolean): EmployeeSheetPlan {
  const nameCol = Number(Object.keys(sheet.columns).find(k => sheet.columns[k] === 'name')) || null;
  const codeCol = Number(Object.keys(sheet.columns).find(k => sheet.columns[k] === 'code')) || null;
  const plan: EmployeeSheetPlan = {
    sheetName: sheet.sheetName, kind: 'employee', nameColumn: nameCol, rows: [], untouchedTemplateRows: [], notPlaced: [],
    skippedFormulaColumns: [], formulaCells: new Set(), ambiguous: [], totalsRow: null, insertRows: 0,
  };
  const mappedIdx = Object.keys(sheet.columns).map(Number);
  const n = columnCount(ws);
  const identityCol = nameCol ?? codeCol;
  const lastRow = ws.rowCount;
  const dataRows: { row: number; name: string; code: string }[] = [];
  const blankRows: number[] = [];
  let totalsRow: number | null = null;

  if (identityCol) {
    for (let r = sheet.headerRow + 1; r <= lastRow; r++) {
      const row = ws.getRow(r);
      const idText = cellText(row.getCell(identityCol));
      let firstText = '';
      for (let c = 1; c <= n && !firstText; c++) firstText = cellText(row.getCell(c));
      if (firstText && isTotalLabel(firstText)) { totalsRow = r; break; }
      const anyMapped = mappedIdx.some(i => cellText(row.getCell(i)) !== '');
      if (idText) dataRows.push({ row: r, name: nameCol ? cellText(row.getCell(nameCol)) : '', code: codeCol ? cellText(row.getCell(codeCol)) : '' });
      else if (!anyMapped) blankRows.push(r);
    }
  } else {
    for (let r = sheet.headerRow + 1; r <= lastRow; r++) blankRows.push(r);
  }
  plan.totalsRow = totalsRow;

  const used = new Set<number>();
  const placed = new Set<string>();
  const byCode = new Map<string, number[]>();
  const byName = new Map<string, number[]>();
  dataRows.forEach(d => {
    if (d.code) { const k = normName(d.code); byCode.set(k, [...(byCode.get(k) ?? []), d.row]); }
    if (d.name) { const k = nameKey(d.name); byName.set(k, [...(byName.get(k) ?? []), d.row]); }
  });
  const employeesByName = new Map<string, number>();
  employees.forEach(e => { const k = nameKey(e.name); employeesByName.set(k, (employeesByName.get(k) ?? 0) + 1); });

  for (const e of employees) {
    // Employees are found by NAME; an ID column, when the sheet has one, only confirms or breaks a tie.
    let rows: number[] = byName.get(nameKey(e.name)) ?? [];
    if (rows.length === 0 && codeCol && e.code) rows = byCode.get(normName(e.code)) ?? [];
    if (rows.length === 0) continue;
    if (rows.length > 1) { plan.ambiguous.push(`${e.name} appears on ${rows.length} rows of the sheet`); continue; }
    if ((employeesByName.get(nameKey(e.name)) ?? 0) > 1) {
      plan.ambiguous.push(`${e.name}: two employees share this name, so it can't be matched by name`);
      continue;
    }
    if (used.has(rows[0])) { plan.ambiguous.push(`${e.name}: the sheet row is already used by another employee`); continue; }
    used.add(rows[0]);
    placed.add(e.driverId);
    plan.rows.push({ row: rows[0], employee: e, how: 'matched' });
  }

  plan.untouchedTemplateRows = dataRows.filter(d => !used.has(d.row)).map(d => ({ row: d.row, label: d.name || d.code }));

  const missing = employees.filter(e => !placed.has(e.driverId) && !plan.ambiguous.some(a => a.startsWith(e.name)));
  if (missing.length > 0) {
    if (!appendMissing) {
      missing.forEach(e => plan.notPlaced.push({ employee: e, reason: 'Not listed in the sheet and adding employees is switched off' }));
    } else {
      const free = [...blankRows];
      if (totalsRow === null) {
        const start = Math.max(lastRow, sheet.headerRow) + 1;
        for (let i = 0; i < missing.length; i++) free.push(start + i);
      }
      const freeSorted = [...new Set(free)].sort((a, b) => a - b).filter(r => !used.has(r));
      missing.forEach((e, i) => {
        const r = freeSorted[i];
        if (r !== undefined) { used.add(r); plan.rows.push({ row: r, employee: e, how: 'appended' }); return; }
        // No empty row left: a new row is inserted above the totals row, which
        // then moves down. Nobody is ever left out of the file.
        const at = (totalsRow ?? lastRow + 1) + plan.insertRows;
        plan.insertRows += 1;
        plan.rows.push({ row: at, employee: e, how: 'appended', inserted: true });
      });
    }
  }
  plan.rows.sort((a, b) => a.row - b.row);

  // A cell the sheet calculates itself is never overwritten.
  const skippedCols = new Set<number>();
  for (const pr of plan.rows) {
    if (pr.inserted) continue;
    for (const idx of mappedIdx) {
      if (isFormulaCell(ws.getRow(pr.row).getCell(idx))) {
        plan.formulaCells.add(`${pr.row}:${idx}`);
        skippedCols.add(idx);
      }
    }
  }
  plan.skippedFormulaColumns = [...skippedCols].map(index => ({ index, header: columns.find(c => c.index === index)?.header ?? `Column ${index}` }));
  return plan;
}

export function planShiftSheet(ws: Worksheet, sheet: SheetMapping, rows: PayrollShiftRow[]): ShiftSheetPlan {
  const n = columnCount(ws);
  const startRow = sheet.headerRow + 1;
  let totalsRow: number | null = null;
  for (let r = startRow; r <= ws.rowCount; r++) {
    let firstText = '';
    for (let c = 1; c <= n && !firstText; c++) firstText = cellText(ws.getRow(r).getCell(c));
    if (firstText && isTotalLabel(firstText)) { totalsRow = r; break; }
  }
  const available = totalsRow === null ? Infinity : totalsRow - startRow;
  return { sheetName: sheet.sheetName, kind: 'shift', startRow, rows, totalsRow, insertRows: totalsRow === null ? 0 : Math.max(0, rows.length - available) };
}

export function fieldValue(kind: FieldKind, v: string | number): string | number {
  if (typeof v === 'number') return kind === 'int' ? Math.round(v) : Math.round((v + Number.EPSILON) * 100) / 100;
  return v;
}

/** Make room for extra rows above the totals row (the totals row moves down). */
function insertAboveTotals(ws: Worksheet, totalsRow: number, extra: number) {
  if (extra <= 0 || totalsRow <= 0) return;
  ws.insertRows(totalsRow, Array.from({ length: extra }, () => []), 'i');
}

/**
 * Stretch every range in the totals row that covers the data rows so it
 * ends on the row just above the totals, e.g. SUM(B5:B12) -> SUM(B5:B21)
 * once employees have been written into rows 13 to 21. Without this the
 * sheet's own TOTAL would leave the added employees out.
 */
function extendTotals(ws: Worksheet, totalsRow: number, firstDataRow: number) {
  if (totalsRow <= firstDataRow) return;
  const lastData = totalsRow - 1;
  ws.getRow(totalsRow).eachCell({ includeEmpty: false }, cell => {
    const v = cell.value as unknown;
    if (!v || typeof v !== 'object' || !('formula' in (v as object))) return;
    const formula = String((v as { formula: string }).formula);
    const next = formula.replace(/(\$?[A-Z]+\$?)(\d+):(\$?[A-Z]+\$?)(\d+)/g, (m, c1: string, r1: string, c2: string, r2: string) => {
      const a = Number(r1); const b = Number(r2);
      return a >= firstDataRow && a <= lastData && b >= a && b < lastData ? `${c1}${r1}:${c2}${lastData}` : m;
    });
    if (next !== formula) cell.value = { formula: next } as never;
  });
}

export interface FillContext {
  employees: PayrollEmployee[];
  shiftRows: PayrollShiftRow[];
  period: PayrollPeriod;
}

/** What will be written, sheet by sheet, without touching the file. */
export function planWorkbook(loaded: LoadedTemplate, cfg: TemplateConfig, ctx: FillContext): SheetPlan[] {
  const plans: SheetPlan[] = [];
  cfg.sheets.forEach((sheet, i) => {
    const ws = loaded.workbook.getWorksheet(sheet.sheetName);
    if (!ws) return;
    const emps = employeesForSheet(cfg, i, sheet.sheetName, ctx.employees);
    if (cfg.layout === 'shift') {
      const ids = new Set(emps.map(e => e.driverId));
      plans.push(planShiftSheet(ws, sheet, ctx.shiftRows.filter(r => ids.has(r.driverId))));
    } else {
      plans.push(planEmployeeSheet(ws, sheet, emps, readColumns(ws, sheet.headerRow), cfg.appendMissing));
    }
  });
  return plans;
}

/** Write every planned value into the workbook and return the finished file. */
export async function fillWorkbook(
  loaded: LoadedTemplate,
  cfg: TemplateConfig,
  ctx: FillContext,
): Promise<{ blob: Blob; extension: 'xlsx' | 'csv'; plans: SheetPlan[] }> {
  const plans = planWorkbook(loaded, cfg, ctx);
  for (const plan of plans) {
    const sheet = cfg.sheets.find(s => s.sheetName === plan.sheetName)!;
    const ws = loaded.workbook.getWorksheet(plan.sheetName)!;
    if (plan.kind === 'employee') {
      if (plan.totalsRow !== null) insertAboveTotals(ws, plan.totalsRow, plan.insertRows);
      const styleSourceRow = plan.rows.find(r => r.how === 'matched')?.row ?? sheet.headerRow + 1;
      for (const pr of plan.rows) {
        const row = ws.getRow(pr.row);
        if (pr.how === 'appended' && pr.row > ws.rowCount - 1) {
          ws.getRow(styleSourceRow).eachCell({ includeEmpty: true }, (cell, col) => { row.getCell(col).style = { ...cell.style }; });
        }
        for (const [idxStr, key] of Object.entries(sheet.columns)) {
          const idx = Number(idxStr);
          if (plan.formulaCells.has(`${pr.row}:${idx}`)) continue;
          const def = resolveFieldDef(key);
          if (!def) continue;
          row.getCell(idx).value = fieldValue(def.kind, def.get(pr.employee, ctx.period));
        }
        row.commit?.();
      }
      if (plan.totalsRow !== null && plan.rows.some(r => r.how === 'appended')) {
        extendTotals(ws, plan.totalsRow + plan.insertRows, sheet.headerRow + 1);
      }
    } else {
      insertAboveTotals(ws, plan.totalsRow ?? 0, plan.insertRows);
      const template = ws.getRow(plan.startRow);
      plan.rows.forEach((sr, i) => {
        const rowNo = plan.startRow + i;
        const row = ws.getRow(rowNo);
        if (i > 0 && !row.hasValues) {
          template.eachCell({ includeEmpty: true }, (cell, col) => { row.getCell(col).style = { ...cell.style }; });
        }
        for (const [idxStr, key] of Object.entries(sheet.columns)) {
          const def = resolveShiftFieldDef(key);
          if (!def) continue;
          const cell = row.getCell(Number(idxStr));
          if (isFormulaCell(cell)) continue;
          cell.value = fieldValue(def.kind, def.get(sr, ctx.period));
        }
        row.commit?.();
      });
      if (plan.totalsRow !== null) extendTotals(ws, plan.totalsRow + plan.insertRows, plan.startRow);
    }
  }
  loaded.workbook.calcProperties = { ...(loaded.workbook.calcProperties ?? {}), fullCalcOnLoad: true };

  if (loaded.isCsv) {
    const buf = await loaded.workbook.csv.writeBuffer();
    return { blob: new Blob([buf as BlobPart], { type: 'text/csv;charset=utf-8' }), extension: 'csv', plans };
  }
  const buf = await loaded.workbook.xlsx.writeBuffer();
  return { blob: new Blob([buf as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), extension: 'xlsx', plans };
}

export const bufferToBase64 = (buf: ArrayBuffer): string => {
  let binary = '';
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
};

export const base64ToBuffer = (b64: string): ArrayBuffer => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
};
