import { useMemo, useState } from 'react';
import Papa from 'papaparse';
import { Download, X, RotateCcw, Eye, EyeOff, FileSpreadsheet, FileText } from 'lucide-react';

// Preview before export. Every Compensation Summary download (Export CSV,
// Export Excel, Export Summary) opens this first: the rows are shown the way
// the file will look, with the Tachyo header the Excel file carries, and the
// office can hide columns, rename headings, switch CSV/Excel and set the file
// name before anything is downloaded. Choices are remembered per export.
//
// Figures are read-only on purpose: pay is changed with Edit Payroll in the
// summary, so the file can never disagree with the system.

export type PreviewKind = 'text' | 'money' | 'hours' | 'number';

export interface PreviewColumn {
  key: string;
  label: string;
  kind?: PreviewKind;
}

export type PreviewRow = Record<string, string | number | null>;

interface Props {
  title: string;
  /** Period and filters, shown under the title and in the Excel header. */
  subtitle: string;
  columns: PreviewColumn[];
  rows: PreviewRow[];
  defaultFormat: 'csv' | 'xlsx';
  fileBase: string;
  /** Remembers hidden columns and renamed headings for this export. */
  storageKey: string;
  onClose: () => void;
  onDownloaded?: (format: 'csv' | 'xlsx') => void;
}

interface Saved { hidden: string[]; labels: Record<string, string>; totals: boolean }

const PREVIEW_LIMIT = 200;
const isNumeric = (k?: PreviewKind) => k === 'money' || k === 'hours' || k === 'number';
const summable = (k?: PreviewKind) => k === 'money' || k === 'hours';

function readSaved(key: string): Saved | null {
  try {
    const raw = localStorage.getItem(`tachyo.export.${key}`);
    return raw ? JSON.parse(raw) as Saved : null;
  } catch {
    return null;
  }
}
function writeSaved(key: string, value: Saved) {
  try { localStorage.setItem(`tachyo.export.${key}`, JSON.stringify(value)); } catch { /* private window: just not remembered */ }
}

function show(v: string | number | null | undefined, kind?: PreviewKind): string {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') {
    if (kind === 'money') return `£${v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (kind === 'hours') return v.toFixed(2);
    return String(v);
  }
  return v;
}

export default function ExportPreviewModal({ title, subtitle, columns, rows, defaultFormat, fileBase, storageKey, onClose, onDownloaded }: Props) {
  const saved = useMemo(() => readSaved(storageKey), [storageKey]);
  const [format, setFormat] = useState<'csv' | 'xlsx'>(defaultFormat);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(saved?.hidden ?? []));
  const [labels, setLabels] = useState<Record<string, string>>(() => saved?.labels ?? {});
  const [totals, setTotals] = useState<boolean>(saved?.totals ?? true);
  const [fileName, setFileName] = useState(fileBase);
  const [busy, setBusy] = useState(false);
  const generated = useMemo(() => new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }), []);

  const visible = columns.filter(c => !hidden.has(c.key));
  const heading = (c: PreviewColumn) => (labels[c.key]?.trim() ? labels[c.key].trim() : c.label);
  const hasTotals = totals && visible.some(c => summable(c.kind));
  const totalsRow = useMemo(() => {
    const out: Record<string, number> = {};
    columns.forEach(c => {
      if (summable(c.kind)) out[c.key] = Math.round(rows.reduce((s, r) => s + (typeof r[c.key] === 'number' ? (r[c.key] as number) : 0), 0) * 100) / 100;
    });
    return out;
  }, [columns, rows]);

  const remember = (next: Partial<Saved>) => writeSaved(storageKey, { hidden: [...hidden], labels, totals, ...next });
  const toggle = (key: string) => {
    const n = new Set(hidden);
    if (n.has(key)) n.delete(key); else n.add(key);
    if (n.size >= columns.length) return; // keep at least one column
    setHidden(n);
    remember({ hidden: [...n] });
  };
  const rename = (key: string, value: string) => {
    const n = { ...labels, [key]: value };
    setLabels(n);
    remember({ labels: n });
  };
  const reset = () => {
    setHidden(new Set()); setLabels({}); setTotals(true);
    writeSaved(storageKey, { hidden: [], labels: {}, totals: true });
  };

  const safeName = (fileName.trim() || fileBase).replace(/[\\/:*?"<>|]+/g, '-');

  const save = (blob: Blob, name: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  };

  const downloadCsv = () => {
    const header = visible.map(heading);
    const body = rows.map(r => visible.map(c => {
      const v = r[c.key];
      if (typeof v === 'number') return isNumeric(c.kind) && c.kind !== 'number' ? v.toFixed(2) : String(v);
      return v ?? '';
    }));
    if (hasTotals) body.push(visible.map((c, i) => (i === 0 ? 'Total' : summable(c.kind) ? totalsRow[c.key].toFixed(2) : '')));
    // BOM so Excel opens £ signs and accents correctly
    const csv = '﻿' + Papa.unparse([header, ...body]);
    save(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${safeName}.csv`);
  };

  const downloadXlsx = async () => {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Tachyo';
    const ws = wb.addWorksheet(title.slice(0, 31).replace(/[\\/*?:[\]]/g, '-'), { views: [{ state: 'frozen', ySplit: 5 }] });
    const lastCol = Math.max(visible.length, 1);

    // Tachyo header
    ws.getCell(1, 1).value = { richText: [
      { text: 'tachyo', font: { bold: true, size: 20, color: { argb: 'FF1F1F1F' } } },
      { text: '.', font: { bold: true, size: 20, color: { argb: 'FFCC0000' } } },
    ] };
    ws.getRow(1).height = 28;
    ws.getCell(2, 1).value = title;
    ws.getCell(2, 1).font = { bold: true, size: 13 };
    ws.getCell(3, 1).value = `${subtitle} · ${rows.length} row${rows.length === 1 ? '' : 's'} · Generated ${generated}`;
    ws.getCell(3, 1).font = { size: 10, color: { argb: 'FF666666' } };
    for (let c = 1; c <= lastCol; c++) ws.getCell(1, c).border = { top: { style: 'thick', color: { argb: 'FFCC0000' } } };

    // Table
    const headerRow = ws.getRow(5);
    visible.forEach((c, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = heading(c);
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCC0000' } };
      cell.alignment = { vertical: 'middle', horizontal: isNumeric(c.kind) ? 'right' : 'left' };
    });
    headerRow.height = 20;
    rows.forEach((r, ri) => {
      const row = ws.getRow(6 + ri);
      visible.forEach((c, i) => {
        const v = r[c.key];
        row.getCell(i + 1).value = v === null || v === undefined ? '' : v;
      });
      if (ri % 2 === 1) visible.forEach((_, i) => { row.getCell(i + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F7F7' } }; });
    });
    let next = 6 + rows.length;
    if (hasTotals) {
      const row = ws.getRow(next);
      visible.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        cell.value = i === 0 ? 'Total' : summable(c.kind) ? totalsRow[c.key] : '';
        cell.font = { bold: true };
        cell.border = { top: { style: 'thin', color: { argb: 'FF1F1F1F' } } };
      });
      next += 1;
    }
    ws.getCell(next + 1, 1).value = 'Prepared with Tachyo · tachyo.co.uk';
    ws.getCell(next + 1, 1).font = { italic: true, size: 9, color: { argb: 'FF888888' } };

    visible.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      if (c.kind === 'money') col.numFmt = '£#,##0.00';
      if (c.kind === 'hours') col.numFmt = '0.00';
      const longest = Math.max(heading(c).length, ...rows.slice(0, 500).map(r => show(r[c.key], c.kind).length));
      col.width = Math.min(Math.max(longest + 3, 10), 45);
    });

    const buf = await wb.xlsx.writeBuffer();
    save(new Blob([buf as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${safeName}.xlsx`);
  };

  const download = async () => {
    setBusy(true);
    try {
      if (format === 'csv') downloadCsv(); else await downloadXlsx();
      onDownloaded?.(format);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const shown = rows.slice(0, PREVIEW_LIMIT);

  return (
    <div className="modal-overlay ep-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content ep-modal" role="dialog" aria-modal="true" aria-label={`Preview: ${title}`}>
        <div className="ep-head">
          <h2 className="text-xl font-black text-primary m-0"><Eye size={18} style={{ verticalAlign: '-3px', marginRight: '8px' }} />Preview before download</h2>
          <button type="button" className="ft-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="ep-body">
          {/* ── The file, as it will look ───────────────────── */}
          <div className="ep-doc">
            <div className="ep-doc-brand">
              <div className="ep-wordmark"><img src="/logo_mark.png" alt="" />tachyo<span>.</span></div>
              <div className="ep-doc-meta">
                <strong>{title}</strong>
                <span>{subtitle} · {rows.length} row{rows.length === 1 ? '' : 's'} · Generated {generated}</span>
              </div>
            </div>
            {format === 'csv' && (
              <p className="ep-note">CSV files hold plain data only, so the Tachyo header and colours appear in the Excel file. The rows and columns below are exactly what the CSV will contain.</p>
            )}
            <div className="ep-table-wrap">
              <table className="ep-table">
                <thead>
                  <tr>{visible.map(c => <th key={c.key} className={isNumeric(c.kind) ? 'num' : ''}>{heading(c)}</th>)}</tr>
                </thead>
                <tbody>
                  {shown.length === 0 && <tr><td colSpan={visible.length} className="ep-empty">Nothing matches the current filters.</td></tr>}
                  {shown.map((r, i) => (
                    <tr key={i}>{visible.map(c => <td key={c.key} className={isNumeric(c.kind) ? 'num' : ''}>{show(r[c.key], c.kind)}</td>)}</tr>
                  ))}
                </tbody>
                {hasTotals && rows.length > 0 && (
                  <tfoot>
                    <tr>{visible.map((c, i) => <td key={c.key} className={isNumeric(c.kind) ? 'num' : ''}>{i === 0 ? 'Total' : summable(c.kind) ? show(totalsRow[c.key], c.kind) : ''}</td>)}</tr>
                  </tfoot>
                )}
              </table>
            </div>
            {rows.length > PREVIEW_LIMIT && <p className="ep-note">Showing the first {PREVIEW_LIMIT} of {rows.length} rows. The file contains all of them.</p>}
            <p className="ep-doc-foot">Prepared with Tachyo · tachyo.co.uk</p>
          </div>

          {/* ── Changes ─────────────────────────────────────── */}
          <aside className="ep-side">
            <p className="ep-side-title">File type</p>
            <div className="ep-format">
              <button type="button" className={format === 'xlsx' ? 'on' : ''} onClick={() => setFormat('xlsx')}><FileSpreadsheet size={14} /> Excel</button>
              <button type="button" className={format === 'csv' ? 'on' : ''} onClick={() => setFormat('csv')}><FileText size={14} /> CSV</button>
            </div>

            <p className="ep-side-title">File name</p>
            <div className="ep-filename">
              <input className="input-field" value={fileName} onChange={e => setFileName(e.target.value)} />
              <span>.{format}</span>
            </div>

            <p className="ep-side-title">Columns <span>{visible.length} of {columns.length}</span></p>
            <p className="ep-side-hint">Untick to leave a column out. Click a heading to rename it.</p>
            <div className="ep-columns">
              {columns.map(c => {
                const off = hidden.has(c.key);
                return (
                  <div key={c.key} className={`ep-col ${off ? 'ep-col--off' : ''}`}>
                    <button type="button" className="ep-col-eye" onClick={() => toggle(c.key)} aria-label={off ? `Include ${c.label}` : `Leave out ${c.label}`} title={off ? 'Include' : 'Leave out'}>
                      {off ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <input className="ep-col-name" value={labels[c.key] ?? c.label} onChange={e => rename(c.key, e.target.value)} disabled={off} aria-label={`Heading for ${c.label}`} />
                  </div>
                );
              })}
            </div>

            <label className="ep-check">
              <input type="checkbox" checked={totals} onChange={e => { setTotals(e.target.checked); remember({ totals: e.target.checked }); }} />
              Add a totals row
            </label>
            <button type="button" className="ft-link ep-reset" onClick={reset}><RotateCcw size={12} /> Reset to the standard layout</button>
          </aside>
        </div>

        <div className="ft-foot">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-brand ft-download" disabled={busy || rows.length === 0} onClick={download}>
            <Download size={14} /> {busy ? 'Preparing…' : `Download ${format === 'csv' ? 'CSV' : 'Excel'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
