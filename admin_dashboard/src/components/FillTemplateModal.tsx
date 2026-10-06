import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UploadCloud, FileSpreadsheet, AlertTriangle, CheckCircle2, Download, X, ChevronDown, Eye, ChevronLeft } from 'lucide-react';
import { supabase, isMockMode } from '../App';
import {
  PAYROLL_FIELDS, SHIFT_FIELDS, buildPayrollEmployees, buildShiftRows, ukDate,
  resolveFieldDef, resolveShiftFieldDef,
  type PayrollShift, type DayRates, type PayrollPeriod, type SheetLayout,
} from '../lib/payroll-data';
import {
  loadTemplate, analyseSheet, planWorkbook, fillWorkbook, bufferToBase64, base64ToBuffer, cellText, isFormulaCell,
  type LoadedTemplate, type TemplateConfig, type SheetAnalysis,
} from '../lib/payroll-template';

// Compensation Summary -> "Fill in the template".
//
// The first time, the company drops the spreadsheet their accountant sends.
// Every column heading is read and matched to the hours and pay the admin
// panel already holds; only headings we are unsure of are asked about, one
// plain question at a time. The spreadsheet is then saved, so every time
// after that it is: click the button, check the total, download.
//
// The period is the Date Range chosen in the Compensation Summary (and its
// Agency filter, if one is set), so what the table shows is what goes in
// the file. The file is not offered while any hours are still open.

interface Props {
  shifts: PayrollShift[];
  rates: Record<string, DayRates>;
  dateStart: string;
  dateEnd: string;
  agency: string;
  longShiftHours: number;
  organizationId: string | null;
  notify: (message: string, kind?: 'success' | 'error') => void;
  onClose: () => void;
  /** Close the dialog and show one employee's shifts in the summary table. */
  onShowInTable: (driverId: string, driverName: string) => void;
}

interface SavedTemplate { id: string; name: string; file_name: string }
interface PayrollRecord { id: string; period_start: string; period_end: string; template_name: string; file_name: string; employee_count: number; total_gross: number; created_by: string | null; created_at: string }
interface Problem { key: string; driverId: string; driver: string; text: string; blocks: boolean }
interface Question { sheet: string; index: number; header: string; suggestion: string | null }
/** One sheet of the filled spreadsheet, as shown in the preview. */
interface FilledSheet { name: string; header: string[]; rows: { row: number; cells: string[]; filled: boolean[] }[] }

// Mock mode has no database, so the template lives here between openings.
let mockTemplate: { saved: SavedTemplate; buffer: ArrayBuffer; mapping: TemplateConfig } | null = null;

const money = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fromYmd = (s: string) => new Date(`${s}T00:00:00`);
const dayLabel = (s: string) => fromYmd(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const nameKeyFor = (layout: SheetLayout) => (layout === 'shift' ? 'sh_name' : 'name');
const fieldLabel = (layout: SheetLayout, key: string) =>
  (layout === 'shift' ? resolveShiftFieldDef(key)?.label : resolveFieldDef(key)?.label) ?? key;

/** Put `key` in one column of one sheet. A field can only fill one column. */
function withColumn(c: TemplateConfig, sheetName: string, index: number, key: string): TemplateConfig {
  return {
    ...c,
    sheets: c.sheets.map(s => {
      if (s.sheetName !== sheetName) return s;
      const columns = { ...s.columns };
      if (key) for (const k of Object.keys(columns)) if (columns[k] === key && k !== String(index)) delete columns[k];
      if (key) columns[String(index)] = key; else delete columns[String(index)];
      return { ...s, columns };
    }),
  };
}

export default function FillTemplateModal({
  shifts, rates, dateStart, dateEnd, agency, longShiftHours, organizationId, notify, onClose, onShowInTable,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<SavedTemplate | null>(null);
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [loaded, setLoaded] = useState<LoadedTemplate | null>(null);
  const [cfg, setCfg] = useState<TemplateConfig | null>(null);
  const [analyses, setAnalyses] = useState<Record<string, SheetAnalysis>>({});
  const [fileName, setFileName] = useState('');
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [qIndex, setQIndex] = useState(0);
  const [qOther, setQOther] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [showRecords, setShowRecords] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ blob: Blob; outName: string; sheets: FilledSheet[] } | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  // ── the period, filtered exactly like the Compensation Summary table ──
  const hasPeriod = !!dateStart && !!dateEnd;
  const periodShifts = useMemo(() => {
    if (!hasPeriod) return [];
    const from = new Date(`${dateStart}T00:00:00`).getTime();
    const to = new Date(`${dateEnd}T23:59:59`).getTime();
    return shifts.filter(s => {
      const t = new Date(s.start_time).getTime();
      return t >= from && t <= to && (agency === 'all' || (s.agency || 'Direct') === agency);
    });
  }, [shifts, dateStart, dateEnd, agency, hasPeriod]);
  const employees = useMemo(() => buildPayrollEmployees(periodShifts, rates), [periodShifts, rates]);
  const shiftRows = useMemo(() => buildShiftRows(periodShifts), [periodShifts]);
  const period: PayrollPeriod = useMemo(() => {
    const s = hasPeriod ? ukDate(fromYmd(dateStart).toISOString()) : '';
    const e = hasPeriod ? ukDate(fromYmd(dateEnd).toISOString()) : '';
    return { label: `${s} to ${e}`, start: s, end: e };
  }, [dateStart, dateEnd, hasPeriod]);
  const totals = useMemo(() => ({
    hours: Math.round(employees.reduce((sum, e) => sum + e.hours, 0) * 100) / 100,
    gross: Math.round(employees.reduce((sum, e) => sum + e.gross, 0) * 100) / 100,
  }), [employees]);

  // Open hours, pending night outs and missing rates stop the file going out.
  // A very long shift is only pointed out: it can be genuine.
  const problems = useMemo<Problem[]>(() => {
    const out: Problem[] = [];
    for (const s of periodShifts) {
      const day = ukDate(s.start_time);
      if (!s.end_time || s.status !== 'completed') {
        out.push({ key: `open-${s.id}`, driverId: s.driver_id, driver: s.driver_name, text: `No clock-out for the shift on ${day}.`, blocks: true });
      } else if (s.total_hours > longShiftHours) {
        out.push({ key: `long-${s.id}`, driverId: s.driver_id, driver: s.driver_name, text: `Shift on ${day} is ${s.total_hours.toFixed(1)} hours. Check it is right.`, blocks: false });
      }
      if (s.night_out_status === 'pending') {
        out.push({ key: `no-${s.id}`, driverId: s.driver_id, driver: s.driver_name, text: `Night out on ${day} is waiting for approval.`, blocks: true });
      }
    }
    for (const e of employees) {
      if (e.rateType === 'Hourly' && e.rates.mf === 0) out.push({ key: `rate-${e.driverId}`, driverId: e.driverId, driver: e.name, text: 'No hourly rate is set, so their pay is £0.', blocks: true });
    }
    return out;
  }, [periodShifts, employees, longShiftHours]);
  const blocking = problems.filter(p => p.blocks);

  // ── opening a workbook ──────────────────────────────────────
  const applyWorkbook = useCallback((wb: LoadedTemplate, mapping?: TemplateConfig) => {
    const nextAnalyses: Record<string, SheetAnalysis> = {};
    const sheets = wb.sheetNames
      .map(name => {
        const ws = wb.workbook.getWorksheet(name)!;
        const savedSheet = mapping?.sheets.find(s => s.sheetName === name);
        const a = analyseSheet(ws, savedSheet?.headerRow, mapping?.layout);
        nextAnalyses[name] = a;
        const columns: Record<string, string> = savedSheet ? savedSheet.columns : Object.fromEntries(
          Object.entries(a.guesses).filter(([, g]) => g?.confidence === 'high').map(([i, g]) => [i, g!.key]),
        );
        const recognised = Object.values(a.guesses).filter(Boolean).length;
        return { sheetName: name, headerRow: a.headerRow, columns, recognised };
      })
      // a sheet with nothing recognisable is a cover page or notes
      .filter(s => s.recognised >= 2 || (mapping?.sheets.some(x => x.sheetName === s.sheetName) ?? false));
    if (sheets.length === 0) throw new Error('No column headings we recognise, such as Name, Hours or Pay, were found. Check this is the payroll sheet your accountant sends.');
    const next: TemplateConfig = mapping ?? {
      layout: nextAnalyses[sheets[0].sheetName].layout,
      appendMissing: true,
      groupBy: 'agency',
      sheets: sheets.map(({ sheetName, headerRow, columns }) => ({ sheetName, headerRow, columns })),
    };
    setAnalyses(nextAnalyses);
    setCfg(next);
    return { next, nextAnalyses };
  }, []);

  const refreshRecords = useCallback(async () => {
    if (isMockMode || !supabase) return;
    const { data } = await supabase.from('payroll_records')
      .select('id, period_start, period_end, template_name, file_name, employee_count, total_gross, created_by, created_at')
      .order('created_at', { ascending: false }).limit(20);
    setRecords((data ?? []) as PayrollRecord[]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let row: { saved: SavedTemplate; buffer: ArrayBuffer; mapping: TemplateConfig } | null = null;
        if (isMockMode || !supabase) {
          row = mockTemplate;
        } else {
          const { data } = await supabase.from('payroll_templates')
            .select('id, name, file_name, mapping, file_b64').order('updated_at', { ascending: false }).limit(1);
          const r = data?.[0] as { id: string; name: string; file_name: string; mapping: TemplateConfig; file_b64: string } | undefined;
          if (r && r.mapping && Array.isArray(r.mapping.sheets)) {
            row = { saved: { id: r.id, name: r.name, file_name: r.file_name }, buffer: base64ToBuffer(r.file_b64), mapping: r.mapping };
          }
        }
        if (row && !cancelled) {
          const wb = await loadTemplate(row.buffer.slice(0), row.saved.file_name);
          if (cancelled) return;
          applyWorkbook(wb, row.mapping);
          setLoaded(wb);
          setBuffer(row.buffer);
          setFileName(row.saved.file_name);
          setSaved(row.saved);
        }
      } catch {
        // a broken saved file just means the spreadsheet is dropped again
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    refreshRecords();
    return () => { cancelled = true; };
  }, [applyWorkbook, refreshRecords]);

  // ── saving ──────────────────────────────────────────────────
  const saveTemplate = async (mapping: TemplateConfig, buf: ArrayBuffer, name: string) => {
    const label = name.replace(/\.[^.]+$/, '');
    if (isMockMode || !supabase || !organizationId) {
      const s = { id: 'local', name: label, file_name: name };
      mockTemplate = { saved: s, buffer: buf, mapping };
      setSaved(s);
      return true;
    }
    const { data: auth } = await supabase.auth.getUser();
    const row = {
      organization_id: organizationId, name: label, file_name: name, file_b64: bufferToBase64(buf),
      mapping, created_by: auth.user?.email ?? null, updated_at: new Date().toISOString(),
    };
    // One spreadsheet per company: a new file replaces the old one.
    const res = saved
      ? await supabase.from('payroll_templates').update(row).eq('id', saved.id).select('id').single()
      : await supabase.from('payroll_templates').insert(row).select('id').single();
    if (res.error) { setError(`The spreadsheet could not be saved: ${res.error.message}`); return false; }
    setSaved({ id: res.data.id, name: label, file_name: name });
    return true;
  };

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return;
    setError('');
    if (file.size > 5 * 1024 * 1024) { setError('That file is over 5 MB. Remove extra images or sheets and try again.'); return; }
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = await loadTemplate(buf.slice(0), file.name);
      const { next, nextAnalyses } = applyWorkbook(wb);
      setBuffer(buf);
      setLoaded(wb);
      setFileName(file.name);
      setShowColumns(false);
      // Only columns we have a hunch about but are not sure of are asked.
      // Columns we know nothing about are left exactly as they are.
      const qs: Question[] = [];
      for (const sh of next.sheets) {
        if (!Object.values(sh.columns).includes(nameKeyFor(next.layout))) qs.push({ sheet: sh.sheetName, index: -1, header: '', suggestion: null });
        for (const c of nextAnalyses[sh.sheetName].columns) {
          const g = nextAnalyses[sh.sheetName].guesses[String(c.index)];
          if (g?.confidence === 'medium') qs.push({ sheet: sh.sheetName, index: c.index, header: c.header, suggestion: g.key });
        }
      }
      if (qs.length === 0) {
        if (await saveTemplate(next, buf, file.name)) { setReplacing(false); notify('Spreadsheet saved. From now on it is filled in with one click.', 'success'); }
      } else {
        setQuestions(qs);
        setQIndex(0);
        setQOther(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That file could not be read.');
    } finally {
      setBusy(false);
    }
  };

  const finishQuestions = async (final: TemplateConfig) => {
    setQuestions(null);
    if (buffer && await saveTemplate(final, buffer, fileName)) {
      setReplacing(false);
      notify('Spreadsheet saved. From now on it is filled in with one click.', 'success');
    }
  };

  const answer = (key: string, index?: number) => {
    if (!questions || !cfg) return;
    const q = questions[qIndex];
    const col = index ?? q.index;
    const next = col >= 0 ? withColumn(cfg, q.sheet, col, q.index === -1 ? nameKeyFor(cfg.layout) : key) : cfg;
    setCfg(next);
    setQOther(false);
    if (qIndex + 1 < questions.length) setQIndex(qIndex + 1);
    else finishQuestions(next);
  };

  /** Back out of setting up a new file: return to the saved one, if any. */
  const cancelSetup = async () => {
    setQuestions(null);
    setReplacing(false);
    setError('');
    if (!saved) { setLoaded(null); setCfg(null); setBuffer(null); setFileName(''); return; }
    setLoading(true);
    // reload the saved spreadsheet so a half-answered new one is dropped
    if (isMockMode || !supabase) {
      if (mockTemplate) {
        const wb = await loadTemplate(mockTemplate.buffer.slice(0), mockTemplate.saved.file_name);
        applyWorkbook(wb, mockTemplate.mapping); setLoaded(wb); setBuffer(mockTemplate.buffer); setFileName(mockTemplate.saved.file_name);
      }
    } else {
      const { data } = await supabase.from('payroll_templates').select('file_name, mapping, file_b64').eq('id', saved.id).maybeSingle();
      if (data) {
        const buf = base64ToBuffer(data.file_b64);
        const wb = await loadTemplate(buf.slice(0), data.file_name);
        applyWorkbook(wb, data.mapping as TemplateConfig); setLoaded(wb); setBuffer(buf); setFileName(data.file_name);
      }
    }
    setLoading(false);
  };

  // ── what the file will contain ──────────────────────────────
  const ready = !!saved && !!loaded && !!cfg && !questions && !replacing;
  const ctx = useMemo(() => ({ employees, shiftRows, period }), [employees, shiftRows, period]);
  const plans = useMemo(() => (ready && hasPeriod ? planWorkbook(loaded!, cfg!, ctx) : []), [ready, hasPeriod, loaded, cfg, ctx]);
  const missing = useMemo(() => {
    const out: string[] = [];
    plans.forEach(p => {
      if (p.kind !== 'employee') return;
      p.notPlaced.forEach(n => out.push(`${n.employee.name} (${money(n.employee.gross)})`));
      p.ambiguous.forEach(a => out.push(a));
    });
    return out;
  }, [plans]);

  // Gross pay written to the file, checked against the summary total.
  const written = useMemo(() => {
    if (!cfg || plans.length === 0) return null;
    let sum = 0; let found = false; let formula = false;
    cfg.sheets.forEach(sh => {
      const plan = plans.find(p => p.sheetName === sh.sheetName);
      if (!plan) return;
      if (plan.kind === 'employee') {
        const col = Object.keys(sh.columns).find(k => sh.columns[k] === 'gross');
        if (!col) return;
        found = true;
        plan.rows.forEach(r => { if (plan.formulaCells.has(`${r.row}:${col}`)) formula = true; else sum += r.employee.gross; });
      } else {
        if (!Object.values(sh.columns).includes('sh_pay')) return;
        found = true;
        plan.rows.forEach(r => { sum += r.pay; });
      }
    });
    return found ? { sum: Math.round(sum * 100) / 100, formula } : null;
  }, [cfg, plans]);
  const matches = written && !written.formula && Math.abs(written.sum - totals.gross) < 0.005;

  // Employees added as new rows, and names already in the spreadsheet that
  // nobody in Tachyo matched. Both together usually mean the same people are
  // spelled differently in the two places.
  const added = useMemo(() => plans.flatMap(p => (p.kind === 'employee' ? p.rows.filter(r => r.how === 'appended').map(r => r.employee.name) : [])), [plans]);
  const unmatchedInSheet = useMemo(() => plans.flatMap(p => (p.kind === 'employee' ? p.untouchedTemplateRows.map(r => r.label) : [])), [plans]);

  // Everything worth stopping for, in plain words. Shown as a pop-up the
  // moment it appears, and again whenever the list changes.
  const alerts = useMemo<{ tone: 'error' | 'warn'; title: string; text: string }[]>(() => {
    if (!ready || !hasPeriod || periodShifts.length === 0) return [];
    const list = (names: string[]) => (names.length > 4 ? `${names.slice(0, 4).join(', ')} and ${names.length - 4} more` : names.join(', '));
    const out: { tone: 'error' | 'warn'; title: string; text: string }[] = [];
    if (blocking.length > 0) {
      out.push({
        tone: 'error',
        title: `${blocking.length} thing${blocking.length === 1 ? '' : 's'} to fix before the file can be made`,
        text: `${blocking.slice(0, 3).map(b => `${b.driver}: ${b.text}`).join(' ')}${blocking.length > 3 ? ` And ${blocking.length - 3} more.` : ''} Use "Show in table" next to each one to fix it.`,
      });
    }
    if (missing.length > 0) {
      out.push({ tone: 'error', title: 'Some employees could not be put in the file', text: `${missing.join('; ')}. Their pay would be missing from the spreadsheet.` });
    }
    if (written && !written.formula && !matches) {
      out.push({ tone: 'error', title: "The file's total does not match the Compensation Summary", text: `The spreadsheet adds up to ${money(written.sum)}, but the Compensation Summary says ${money(totals.gross)} (${money(Math.abs(totals.gross - written.sum))} ${written.sum < totals.gross ? 'short' : 'over'}).` });
    }
    if (added.length > 0 && unmatchedInSheet.length > 0) {
      out.push({
        tone: 'warn',
        title: "Names in the spreadsheet don't match your employees",
        text: `${unmatchedInSheet.length} name${unmatchedInSheet.length === 1 ? '' : 's'} already in the spreadsheet (${list(unmatchedInSheet)}) ${unmatchedInSheet.length === 1 ? 'has' : 'have'} no shifts in Tachyo for this period, so ${unmatchedInSheet.length === 1 ? 'that row is' : 'those rows are'} left empty. ${added.length} employee${added.length === 1 ? '' : 's'} from Tachyo (${list(added)}) ${added.length === 1 ? 'was' : 'were'} added as new rows. If these are the same people, make the names match in the spreadsheet or in Employee Database.`,
      });
    }
    return out;
  }, [ready, hasPeriod, periodShifts.length, blocking, missing, written, matches, totals.gross, added, unmatchedInSheet]);
  const alertsKey = alerts.map(a => a.title + a.text).join('|');
  const [dismissedKey, setDismissedKey] = useState('');
  const showAlerts = alerts.length > 0 && alertsKey !== dismissedKey && !questions && !loading;

  // Fill a fresh copy and show it before anything is downloaded. The file
  // that is downloaded afterwards is exactly this one.
  const buildPreview = async () => {
    if (!buffer || !cfg || !saved) return;
    setBusy(true);
    setError('');
    try {
      const fresh = await loadTemplate(buffer.slice(0), saved.file_name);
      const { blob, extension, plans: filledPlans } = await fillWorkbook(fresh, cfg, ctx);
      const outName = `${saved.file_name.replace(/\.[^.]+$/, '')} - ${dateStart} to ${dateEnd}.${extension}`;
      const sheets: FilledSheet[] = filledPlans.map(plan => {
        const ws = fresh.workbook.getWorksheet(plan.sheetName)!;
        const sheet = cfg.sheets.find(x => x.sheetName === plan.sheetName)!;
        const mapped = new Set(Object.keys(sheet.columns).map(Number));
        const written = new Set<number>(plan.kind === 'employee'
          ? plan.rows.map(r => r.row)
          : plan.rows.map((_, i) => plan.startRow + i));
        const nCols = Math.min(Math.max(ws.columnCount, ws.actualColumnCount, 1), 30);
        const text = (r: number, c: number) => {
          const cell = ws.getRow(r).getCell(c);
          if (isFormulaCell(cell)) {
            const v = cell.value as { formula?: string; sharedFormula?: string };
            return `=${v.formula ?? v.sharedFormula ?? ''}`;
          }
          return cellText(cell);
        };
        const header = Array.from({ length: nCols }, (_, i) => text(sheet.headerRow, i + 1));
        const rows: FilledSheet['rows'] = [];
        for (let r = sheet.headerRow + 1; r <= ws.rowCount && rows.length < 300; r++) {
          const cells = Array.from({ length: nCols }, (_, i) => text(r, i + 1));
          if (cells.every(c => c === '')) continue;
          rows.push({ row: r, cells, filled: cells.map((_, i) => written.has(r) && mapped.has(i + 1)) });
        }
        return { name: plan.sheetName, header, rows };
      });
      setPreview({ blob, outName, sheets });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The template could not be filled in.');
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!preview || !saved) return;
    setBusy(true);
    setError('');
    try {
      const { blob, outName } = preview;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = outName;
      a.click();
      URL.revokeObjectURL(a.href);

      if (!isMockMode && supabase && organizationId) {
        const { data: auth } = await supabase.auth.getUser();
        const { error: err } = await supabase.from('payroll_records').insert({
          organization_id: organizationId,
          period_start: dateStart,
          period_end: dateEnd,
          template_name: saved.name,
          file_name: outName,
          file_b64: bufferToBase64(await blob.arrayBuffer()),
          employee_count: employees.length,
          total_hours: totals.hours,
          total_gross: totals.gross,
          created_by: auth.user?.email ?? null,
        });
        if (err) notify(`The file downloaded, but it could not be added to the history: ${err.message}`, 'error');
        else { notify('Template filled in and downloaded.', 'success'); refreshRecords(); }
      } else {
        notify('Template filled in and downloaded.', 'success');
      }
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The template could not be filled in.');
    } finally {
      setBusy(false);
    }
  };

  const downloadRecord = async (r: PayrollRecord) => {
    if (!supabase) return;
    const { data } = await supabase.from('payroll_records').select('file_b64').eq('id', r.id).maybeSingle();
    if (!data) return;
    const isCsv = /\.csv$/i.test(r.file_name);
    const blob = new Blob([base64ToBuffer(data.file_b64)], { type: isCsv ? 'text/csv;charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = r.file_name;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ── pieces ──────────────────────────────────────────────────
  const fieldOptions = (layout: SheetLayout) => {
    const defs = layout === 'shift' ? SHIFT_FIELDS : PAYROLL_FIELDS;
    return Array.from(new Set(defs.map(f => f.group))).map(g => (
      <optgroup key={g} label={g}>
        {defs.filter(f => f.group === g).map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
      </optgroup>
    ));
  };

  const fileInputEl = <input ref={fileInput} type="file" accept=".xlsx,.csv" style={{ display: 'none' }} onChange={e => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />;

  const dropZone = (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files?.[0]); }}
      onClick={() => fileInput.current?.click()}
      className={`ft-drop ${dragging ? 'ft-drop--on' : ''}`}
    >
      <UploadCloud size={28} />
      <strong>{busy ? 'Reading the spreadsheet…' : "Drop your accountant's spreadsheet here"}</strong>
      <span>Excel (.xlsx) or CSV. You only do this once: after that it is filled in with one click. Its layout, formatting and formulas stay as they are.</span>
    </div>
  );

  const q = questions?.[qIndex];
  const questionView = q && cfg && (
    <div>
      <p className="ft-kicker">Setting up {fileName} · question {qIndex + 1} of {questions!.length}</p>
      {q.index === -1 ? (
        <>
          <p className="ft-question">Which column has the employee's name?</p>
          <div className="ft-options">
            {(analyses[q.sheet]?.columns ?? []).map(c => (
              <button key={c.index} type="button" className="ft-option" onClick={() => answer('', c.index)}>
                {c.header}{c.sample && <span>e.g. {c.sample}</span>}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="ft-question">What goes in the column <strong>"{q.header}"</strong>?</p>
          <div className="ft-options">
            {q.suggestion && <button type="button" className="ft-option ft-option--main" onClick={() => answer(q.suggestion!)}>{fieldLabel(cfg.layout, q.suggestion)}</button>}
            <button type="button" className="ft-option" onClick={() => answer('')}>Leave it blank</button>
            {!qOther ? (
              <button type="button" className="ft-option" onClick={() => setQOther(true)}>Something else…</button>
            ) : (
              <select className="input-field ft-select" defaultValue="" onChange={e => e.target.value && answer(e.target.value)}>
                <option value="" disabled>Choose what goes here</option>
                {fieldOptions(cfg.layout)}
              </select>
            )}
          </div>
        </>
      )}
      <div className="ft-links">
        {qIndex > 0 && <button type="button" className="ft-link" onClick={() => { setQIndex(qIndex - 1); setQOther(false); }}>Back</button>}
        {q.index !== -1 && <button type="button" className="ft-link" onClick={() => finishQuestions(cfg)}>Leave the rest blank</button>}
        <button type="button" className="ft-link" onClick={cancelSetup}>Cancel</button>
      </div>
    </div>
  );

  const columnsView = ready && showColumns && (
    <div className="ft-columns">
      {cfg!.sheets.map(sh => (
        <div key={sh.sheetName}>
          {cfg!.sheets.length > 1 && <p className="ft-kicker" style={{ marginTop: '8px' }}>{sh.sheetName}</p>}
          {(analyses[sh.sheetName]?.columns ?? []).map(c => (
            <label key={c.index} className="ft-column-row">
              <span>{c.header}</span>
              <select className="input-field ft-select" value={sh.columns[String(c.index)] ?? ''} onChange={e => setCfg(x => x && withColumn(x, sh.sheetName, c.index, e.target.value))}>
                <option value="">Leave it blank</option>
                {fieldOptions(cfg!.layout)}
              </select>
            </label>
          ))}
        </div>
      ))}
      <div className="ft-links">
        <button type="button" className="btn btn-brand ft-btn-sm" onClick={async () => { if (cfg && buffer && saved && await saveTemplate(cfg, buffer, saved.file_name)) { setShowColumns(false); notify('Columns saved.', 'success'); } }}>Save columns</button>
        <button type="button" className="ft-link" onClick={() => setShowColumns(false)}>Close</button>
      </div>
    </div>
  );

  const nFilled = ready ? cfg!.sheets.reduce((n, s) => n + Object.keys(s.columns).length, 0) : 0;

  const readyView = ready && (
    <div>
      <div className="ft-file">
        <FileSpreadsheet size={16} />
        <div>
          <strong>{saved!.file_name}</strong>
          <span>{nFilled} column{nFilled === 1 ? '' : 's'} filled from the system · <button type="button" className="ft-link" onClick={() => setShowColumns(s => !s)}>{showColumns ? 'Hide columns' : 'Check columns'}</button> · <button type="button" className="ft-link" onClick={() => { setReplacing(true); setShowColumns(false); }}>Use a different file</button></span>
        </div>
      </div>
      {columnsView}

      {!hasPeriod ? (
        <div className="ft-block"><AlertTriangle size={15} /> Choose a Date Range in the Compensation Summary first, then press Fill in the template again.</div>
      ) : (
        <>
          <p className="ft-period">{dayLabel(dateStart)} to {dayLabel(dateEnd)}{agency !== 'all' ? ` · ${agency} only` : ''}</p>
          <div className="ft-totals">
            <div><span>Employees</span><strong>{employees.length}</strong></div>
            <div><span>Hours</span><strong>{totals.hours.toFixed(2)}</strong></div>
            <div><span>Gross pay</span><strong>{money(totals.gross)}</strong></div>
          </div>

          {periodShifts.length === 0 ? (
            <div className="ft-block"><AlertTriangle size={15} /> There are no shifts in this date range.</div>
          ) : (
            <>
              {matches && <div className="ft-ok"><CheckCircle2 size={15} /> The total in the file matches the Compensation Summary.</div>}
              {written && written.formula && <div className="ft-ok"><CheckCircle2 size={15} /> Hours and pay are filled in. Your spreadsheet calculates the totals itself.</div>}
              {written && !written.formula && !matches && (
                <div className="ft-block"><AlertTriangle size={15} /> The file adds up to {money(written.sum)}, {money(Math.abs(totals.gross - written.sum))} {written.sum < totals.gross ? 'less' : 'more'} than the Compensation Summary.</div>
              )}
              {added.length > 0 && unmatchedInSheet.length > 0 && (
                <div className="ft-warn"><AlertTriangle size={15} /> {added.length} employee{added.length === 1 ? '' : 's'} added as new rows; {unmatchedInSheet.length} name{unmatchedInSheet.length === 1 ? '' : 's'} in the spreadsheet left empty. <button type="button" className="ft-link" onClick={() => setDismissedKey('')}>Why?</button></div>
              )}
              {!written && <div className="ft-warn"><AlertTriangle size={15} /> No column in the spreadsheet holds the total pay, so the total cannot be checked.</div>}
              {missing.length > 0 && <div className="ft-block"><AlertTriangle size={15} /> Not in the file: {missing.join('; ')}.</div>}

              {problems.length > 0 && (
                <div className={blocking.length > 0 ? 'ft-problems' : 'ft-problems ft-problems--soft'}>
                  <p className="ft-problems-title">
                    <AlertTriangle size={15} />
                    {blocking.length > 0 ? `${blocking.length} thing${blocking.length === 1 ? '' : 's'} to fix before the file can be made` : 'Worth a look before sending'}
                  </p>
                  {problems.map(p => (
                    <div key={p.key} className="ft-problem">
                      <div><strong>{p.driver}</strong><span>{p.text}</span></div>
                      <button type="button" className="btn btn-secondary ft-btn-sm" onClick={() => onShowInTable(p.driverId, p.driver)}>Show in table</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {records.length > 0 && (
        <div style={{ marginTop: '14px' }}>
          <button type="button" className="ft-link ft-records-toggle" onClick={() => setShowRecords(r => !r)}>
            Previous files ({records.length}) <ChevronDown size={13} style={{ transform: showRecords ? 'rotate(180deg)' : undefined }} />
          </button>
          {showRecords && (
            <div className="ft-records">
              {records.map(r => (
                <div key={r.id} className="ft-record">
                  <span><strong>{dayLabel(r.period_start)} to {dayLabel(r.period_end)}</strong> · {r.employee_count} employees · {money(Number(r.total_gross))} · {when(r.created_at)}{r.created_by ? ` by ${r.created_by}` : ''}</span>
                  <button type="button" className="payroll-mini-btn" onClick={() => downloadRecord(r)}><Download size={11} /> Download</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const canDownload = ready && hasPeriod && periodShifts.length > 0 && blocking.length === 0 && !busy;

  const previewView = preview && (
    <div className="ep-doc">
      <div className="ep-doc-brand">
        <div className="ep-wordmark"><img src="/logo_mark.png" alt="" />tachyo<span>.</span></div>
        <div className="ep-doc-meta">
          <strong>{preview.outName}</strong>
          <span>{dayLabel(dateStart)} to {dayLabel(dateEnd)}{agency !== 'all' ? ` · ${agency} only` : ''} · {employees.length} employees · {money(totals.gross)}</span>
        </div>
      </div>
      <p className="ep-note">This is your accountant's spreadsheet with the figures filled in. <span className="ft-filled-key">Highlighted</span> cells were written by Tachyo; everything else is exactly as it was in the template.</p>
      {preview.sheets.map(sh => (
        <div key={sh.name} style={{ marginBottom: '12px' }}>
          {preview.sheets.length > 1 && <p className="ft-kicker" style={{ margin: '8px 0 4px' }}>{sh.name}</p>}
          <div className="ep-table-wrap">
            <table className="ep-table">
              <thead><tr><th className="ft-rownum" />{sh.header.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
              <tbody>
                {sh.rows.map(r => (
                  <tr key={r.row}>
                    <td className="ft-rownum">{r.row}</td>
                    {r.cells.map((c, i) => <td key={i} className={`${r.filled[i] ? 'ft-filled' : ''} ${c.startsWith('=') ? 'ft-formula' : ''}`}>{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 10001, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '16px' }} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal-content glass-panel ft-modal${preview ? ' ft-modal--wide' : ''}`} role="dialog" aria-modal="true" aria-label="Fill in the template">
        <div className="ft-head">
          <h2 className="text-xl font-black text-primary m-0"><FileSpreadsheet size={18} style={{ verticalAlign: '-3px', marginRight: '8px' }} />Fill in the template</h2>
          <button type="button" className="ft-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        {error && <div className="ft-block" style={{ marginBottom: '12px' }}><AlertTriangle size={15} /> {error}</div>}
        {fileInputEl}

        {loading ? (
          <p className="text-sm text-muted">Opening your spreadsheet…</p>
        ) : questions ? (
          questionView
        ) : !saved || replacing ? (
          <>
            {dropZone}
            {replacing && <div className="ft-links"><button type="button" className="ft-link" onClick={cancelSetup}>Keep using {saved?.file_name}</button></div>}
          </>
        ) : preview ? (
          previewView
        ) : (
          readyView
        )}

        {ready && !preview && (
          <div className="ft-foot">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
            <button type="button" className="btn btn-brand ft-download" disabled={!canDownload} onClick={buildPreview}>
              <Eye size={14} /> {busy ? 'Filling in…' : missing.length > 0 ? 'Preview anyway' : 'Preview filled spreadsheet'}
            </button>
          </div>
        )}
        {ready && preview && (
          <div className="ft-foot">
            <button type="button" className="btn btn-secondary" onClick={() => setPreview(null)}><ChevronLeft size={14} /> Back to make changes</button>
            <button type="button" className="btn btn-brand ft-download" disabled={busy} onClick={download}>
              <Download size={14} /> {busy ? 'Downloading…' : 'Download this file'}
            </button>
          </div>
        )}
      </div>

      {showAlerts && (
        <div className="ft-alert-overlay" onMouseDown={e => e.stopPropagation()}>
          <div className="ft-alert" role="alertdialog" aria-modal="true" aria-labelledby="ft-alert-title">
            <div className={`ft-alert-icon ${alerts.some(a => a.tone === 'error') ? 'ft-alert-icon--error' : ''}`}><AlertTriangle size={22} /></div>
            <h3 id="ft-alert-title">{alerts.some(a => a.tone === 'error') ? 'Please check before sending this file' : 'Worth knowing before you send this file'}</h3>
            <div className="ft-alert-list">
              {alerts.map(a => (
                <div key={a.title} className={`ft-alert-item ft-alert-item--${a.tone}`}>
                  <strong>{a.title}</strong>
                  <span>{a.text}</span>
                </div>
              ))}
            </div>
            <div className="ft-alert-actions">
              <button type="button" className="btn btn-brand" onClick={() => setDismissedKey(alertsKey)} autoFocus>OK, got it</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
