import { useState } from 'react';
import { X, UploadCloud, FileSpreadsheet, CircleCheck, AlertTriangle, KeyRound, Download } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { supabase, isMockMode } from '../App';

// ============================================================
// Driver Bulk Import — reads a company's existing driver
// spreadsheet (CSV/XLSX) and creates one real driver account per
// row via the same 'create-driver' Edge Function the single "Add
// Employee" form uses (so each row also gets a real Supabase Auth
// user, not just a bare drivers-table row).
//
// Column detection is alias-based, same approach as
// CarrierSettlementImportModal — the uploaded file's headers are
// matched case/whitespace-insensitively against a list of likely
// names per field, so "Name" / "Full Name" / "Employee Name" all
// resolve to the same thing without the admin picking a preset.
//
// IMPORTANT — activation codes, not PINs: since migration 065,
// admins can no longer set a driver's PIN directly (bulk import
// included — any PIN/password column in the uploaded file is
// ignored). create-driver instead issues a one-time activation
// code per row, exactly like the single Add Employee flow; the
// driver enters it in the app and picks their own 6-digit PIN.
// Codes are only ever returned once, in this response, so the
// results screen is the only place to see or export them —
// downloadable as a CSV and openable as a printable list in a new
// tab to hand to drivers.
// ============================================================

interface FieldAliases {
  full_name: string[];
  phone: string[];
  driver_id: string[];
  profession: string[];
  rate_type: string[];
  base_rate: string[];
  agency: string[];
}

const ALIASES: FieldAliases = {
  full_name: ['full name', 'name', 'employee name', 'driver name'],
  phone: ['phone', 'phone number', 'mobile', 'mobile number', 'contact number'],
  driver_id: ['driver id', 'driver_id', 'username', 'employee id', 'employee code', 'id', 'code'],
  profession: ['role', 'profession', 'position', 'job title'],
  rate_type: ['rate type'],
  base_rate: ['rate', 'base rate', 'hourly rate', 'pay rate', 'day rate'],
  agency: ['agency', 'supplier', 'agency name', 'agency / supplier'],
};

const VALID_PROFESSIONS = ['driver', 'mechanic', 'logistics'];

interface ParsedDriverRow {
  rowIndex: number;
  full_name: string;
  phone: string;
  driver_id: string;
  profession: string;
  rate_type: 'Hourly' | 'Fixed Shift Rate (Day Rate)';
  base_rate: number;
  agency_name: string;
}

interface ImportOutcome {
  driver_id: string;
  full_name: string;
  phone: string;
  activation_code: string | null;
  ok: boolean;
  reason?: string;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, ' ');
}

function findColumn(headers: string[], aliases: string[]): string | null {
  const normalized = headers.map(h => ({ raw: h, norm: normalizeHeader(h) }));
  for (const alias of aliases) {
    const hit = normalized.find(h => h.norm === alias);
    if (hit) return hit.raw;
  }
  return null;
}

// Same slugify rule the single Add Employee form uses for its
// auto-generated username, so a bulk-imported driver_id looks
// exactly like one a human typed in here by hand.
function slugifyDriverId(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9.]/g, '');
}

const SAMPLE_CSV =
  'Full Name,Phone,Role,Driver ID,Rate Type,Base Rate,Agency\n' +
  'John Jones,+44 7700 900100,driver,,Hourly,16.00,Direct\n' +
  'Maria Kowalski,+44 7700 900101,driver,,Hourly,16.50,Direct\n';

interface DriverBulkImportModalProps {
  existingDriverIds: string[];
  onClose: () => void;
  onImported: () => void;
}

export default function DriverBulkImportModal({ existingDriverIds, onClose, onImported }: DriverBulkImportModalProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedDriverRow[] | null>(null);
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [outcomes, setOutcomes] = useState<ImportOutcome[] | null>(null);

  const existingIdSet = new Set(existingDriverIds.map(id => id.toUpperCase()));

  const idIsTaken = (id: string, exceptRowIndex: number) =>
    existingIdSet.has(id.toUpperCase()) ||
    (rows?.some(r => r.rowIndex !== exceptRowIndex && r.driver_id.toUpperCase() === id.toUpperCase()) ?? false);

  const processFile = async (file: File) => {
    setError('');
    setIsProcessing(true);
    setFileName(file.name);
    try {
      let rawRows: Record<string, any>[] = [];
      const isXlsx = /\.xlsx?$/i.test(file.name);
      if (isXlsx) {
        const buf = await file.arrayBuffer();
        const workbook = XLSX.read(new Uint8Array(buf), { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, any>[];
      } else {
        const text = await file.text();
        const result = Papa.parse<Record<string, any>>(text, { header: true, skipEmptyLines: true });
        rawRows = result.data;
      }

      if (rawRows.length === 0) {
        setError('That file has no rows Claude could read.');
        setIsProcessing(false);
        return;
      }

      const headers = Object.keys(rawRows[0]);
      const nameCol = findColumn(headers, ALIASES.full_name);
      const phoneCol = findColumn(headers, ALIASES.phone);
      const idCol = findColumn(headers, ALIASES.driver_id);
      const professionCol = findColumn(headers, ALIASES.profession);
      const rateTypeCol = findColumn(headers, ALIASES.rate_type);
      const baseRateCol = findColumn(headers, ALIASES.base_rate);
      const agencyCol = findColumn(headers, ALIASES.agency);

      if (!nameCol) {
        setError("Couldn't find a name column — expected a header like \"Full Name\" or \"Name\".");
        setIsProcessing(false);
        return;
      }

      const usedIds = new Set<string>();
      const parsed: ParsedDriverRow[] = rawRows
        .map((row, i) => {
          const full_name = String(row[nameCol] ?? '').trim();
          if (!full_name) return null;

          const rawId = idCol ? String(row[idCol] ?? '').trim() : '';
          let driver_id = rawId ? slugifyDriverId(rawId) : slugifyDriverId(full_name);
          // A file can list the same name/ID twice, or the slug of two
          // different names can collide (e.g. "J Smith" x2) — number the
          // repeat rather than silently overwriting the first driver.
          let suffix = 2;
          const base = driver_id;
          while (usedIds.has(driver_id)) {
            driver_id = `${base}${suffix}`;
            suffix += 1;
          }
          usedIds.add(driver_id);

          const rawProfession = professionCol ? String(row[professionCol] ?? '').trim().toLowerCase() : 'driver';
          const profession = VALID_PROFESSIONS.includes(rawProfession) ? rawProfession : 'driver';

          const rawRateType = rateTypeCol ? String(row[rateTypeCol] ?? '').trim().toLowerCase() : '';
          const rate_type: ParsedDriverRow['rate_type'] = rawRateType.startsWith('fixed') ? 'Fixed Shift Rate (Day Rate)' : 'Hourly';

          const rawRate = baseRateCol ? String(row[baseRateCol] ?? '').replace(/[£,\s]/g, '') : '';
          const base_rate = rawRate && !Number.isNaN(Number(rawRate)) ? Number(rawRate) : (rate_type === 'Fixed Shift Rate (Day Rate)' ? 150 : 16);

          const agency_name = agencyCol ? String(row[agencyCol] ?? '').trim() || 'Direct' : 'Direct';

          return {
            rowIndex: i,
            full_name,
            phone: phoneCol ? String(row[phoneCol] ?? '').trim() : '',
            driver_id,
            profession,
            rate_type,
            base_rate,
            agency_name,
          };
        })
        .filter((r): r is ParsedDriverRow => r !== null);

      if (parsed.length === 0) {
        setError('No rows had a name Claude could read — check the file and try again.');
        setIsProcessing(false);
        return;
      }

      setRows(parsed);
    } catch (err: any) {
      setError(err?.message ?? 'Could not read this file.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const updateRow = (rowIndex: number, patch: Partial<ParsedDriverRow>) => {
    setRows(prev => prev ? prev.map(r => (r.rowIndex === rowIndex ? { ...r, ...patch } : r)) : prev);
  };

  const readyRows = (rows ?? []).filter(r => !idIsTaken(r.driver_id, r.rowIndex) && r.driver_id.length > 0);
  const blockedCount = (rows?.length ?? 0) - readyRows.length;

  const confirmImport = async () => {
    if (isMockMode || !supabase || !rows) return;
    setIsImporting(true);
    setError('');
    setImportProgress(0);
    const results: ImportOutcome[] = [];

    for (const row of readyRows) {
      try {
        const { data, error: fnError } = await supabase.functions.invoke('create-driver', {
          body: { driver_id: row.driver_id, full_name: row.full_name, phone: row.phone || 'N/A' },
        });

        if (fnError || data?.error) {
          let msg = data?.error ?? fnError?.message ?? 'Unknown error';
          try {
            const ctx = fnError as any;
            if (ctx?.context?.json) {
              const body = await ctx.context.json();
              if (body?.error) msg = body.error;
            }
          } catch (_) {}
          results.push({ driver_id: row.driver_id, full_name: row.full_name, phone: row.phone, activation_code: null, ok: false, reason: msg });
          setImportProgress(results.length);
          continue;
        }

        const createdDriver = data.driver;
        // The identity is created either way — a missing code here (rare:
        // issue_driver_activation_code itself failed) doesn't roll back
        // the driver, same as the single Add Employee form's handling;
        // it just means this row needs "Reset PIN" afterward instead.
        const activationCode: string | null = typeof data.activation_code === 'string' ? data.activation_code : null;
        // Best-effort compensation setup — same second write the single Add
        // Employee form does; identity is already saved regardless of this.
        try {
          const isFixed = row.rate_type === 'Fixed Shift Rate (Day Rate)';
          await supabase.from('drivers').update({
            profession: row.profession,
            agency_name: row.agency_name,
            rate_type: row.rate_type,
            fixed_rate: isFixed ? row.base_rate : null,
            mon_fri_rate: row.base_rate,
            saturday_rate: row.base_rate,
            sunday_rate: row.base_rate,
            hourly_rate: row.base_rate,
          }).eq('id', createdDriver.id);
        } catch (_) {
          // Non-fatal — identity already exists, rate can be fixed from Edit.
        }

        results.push({ driver_id: row.driver_id, full_name: row.full_name, phone: row.phone, activation_code: activationCode, ok: true, reason: activationCode ? undefined : 'Created, but no activation code was issued — use "Reset PIN" from the row menu.' });
      } catch (err: any) {
        results.push({ driver_id: row.driver_id, full_name: row.full_name, phone: row.phone, activation_code: null, ok: false, reason: err?.message ?? 'Connection error' });
      }
      setImportProgress(results.length);
    }

    setOutcomes(results);
    setIsImporting(false);
    if (results.some(r => r.ok)) onImported();
  };

  const downloadSample = () => {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'driver-import-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadCredentials = () => {
    if (!outcomes) return;
    const successes = outcomes.filter(o => o.ok);
    const csv = Papa.unparse(successes.map(o => ({
      'Driver ID': o.driver_id,
      'Full Name': o.full_name,
      'Phone': o.phone,
      'Activation Code': o.activation_code ?? '(use Reset PIN from the row menu)',
    })));
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `driver-activation-codes-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Opens a printable list in a new tab — for handing paper copies to
  // drivers who don't have their own device handy yet, alongside the
  // CSV download above. Same one-time-only codes; nothing is re-fetched.
  const openPrintableCodes = () => {
    if (!outcomes) return;
    const successes = outcomes.filter(o => o.ok);
    const win = window.open('', '_blank');
    if (!win) return;
    const rowsHtml = successes.map(o => `
      <tr>
        <td>${escapeHtml(o.full_name)}</td>
        <td style="font-family: monospace;">${escapeHtml(o.driver_id)}</td>
        <td style="font-family: monospace; font-weight: 700;">${escapeHtml(o.activation_code ?? 'Use Reset PIN')}</td>
      </tr>`).join('');
    win.document.write(`<!DOCTYPE html>
      <html><head><title>Driver activation codes — ${new Date().toLocaleDateString('en-GB')}</title>
      <style>
        body { font-family: -apple-system, Arial, sans-serif; padding: 32px; color: #111; }
        h1 { font-size: 18px; }
        p { color: #555; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #ddd; font-size: 13px; }
        th { text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em; color: #888; }
        @media print { body { padding: 0; } }
      </style></head>
      <body>
        <h1>Driver activation codes</h1>
        <p>Imported ${new Date().toLocaleString('en-GB')} — each code works once and expires in 48 hours. In the Tachyo app, a driver enters their Driver ID and this code, then picks their own 6-digit PIN.</p>
        <table><thead><tr><th>Name</th><th>Driver ID</th><th>Activation Code</th></tr></thead><tbody>${rowsHtml}</tbody></table>
        <script>window.onload = () => window.print();</script>
      </body></html>`);
    win.document.close();
  };

  const successCount = outcomes?.filter(o => o.ok).length ?? 0;
  const failCount = outcomes ? outcomes.length - successCount : 0;

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 998 }} onClick={onClose} />
      <div
        className="glass-panel"
        style={{
          position: 'fixed', top: '5vh', left: '50%', transform: 'translateX(-50%)',
          width: 'min(920px, 92vw)', maxHeight: '90vh', overflowY: 'auto', zIndex: 999,
          borderRadius: '14px', padding: '24px', background: 'var(--card-bg)',
        }}
      >
        <div className="flex items-center justify-between mb-16">
          <h3 className="text-lg font-black text-primary m-0 flex items-center" style={{ gap: '8px' }}>
            <FileSpreadsheet size={20} color="#CC0000" />
            Import Data
          </h3>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--charcoal-light)' }}>
            <X size={18} />
          </button>
        </div>

        {error && <div className="login-notice login-notice--error mb-16">{error}</div>}

        {outcomes ? (
          <div className="py-8">
            <div className="text-center mb-16">
              <CircleCheck size={40} color="#10B981" style={{ marginBottom: '12px' }} />
              <p className="text-md font-bold text-primary m-0">
                {successCount} driver{successCount === 1 ? '' : 's'} created{failCount > 0 ? `, ${failCount} failed` : ''}
              </p>
            </div>

            {successCount > 0 && (
              <div className="mb-16" style={{ padding: '14px 16px', borderRadius: '10px', background: 'rgba(204,0,0,0.06)', border: '1px solid rgba(204,0,0,0.2)' }}>
                <p className="text-sm font-bold text-primary mb-8 flex items-center" style={{ gap: '6px' }}>
                  <KeyRound size={14} color="#CC0000" /> Activation codes — this is the only time these can be shown
                </p>
                <p className="text-xs text-muted mb-12">
                  Each driver enters their Driver ID and this code in the Tachyo app, then picks their own 6-digit PIN. Codes expire in 48 hours and can't be viewed again after this screen closes — download or print them now, or reset an individual driver's from the row menu later.
                </p>
                <div className="table-container mb-12" style={{ maxHeight: '260px', overflowY: 'auto' }}>
                  <table className="data-table">
                    <thead><tr><th>Name</th><th>Driver ID</th><th>Activation Code</th></tr></thead>
                    <tbody>
                      {outcomes.filter(o => o.ok).map(o => (
                        <tr key={o.driver_id}>
                          <td className="text-sm">{o.full_name}</td>
                          <td className="font-mono text-xs">{o.driver_id}</td>
                          <td className="font-mono font-bold" style={{ color: o.activation_code ? '#CC0000' : '#E65100', letterSpacing: '0.08em' }}>
                            {o.activation_code ?? 'Use Reset PIN'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center" style={{ gap: '10px', flexWrap: 'wrap' }}>
                  <button type="button" onClick={downloadCredentials} className="btn btn-brand flex items-center" style={{ gap: '6px' }}>
                    <Download size={14} /> Download {successCount} Code{successCount === 1 ? '' : 's'} (.csv)
                  </button>
                  <button type="button" onClick={openPrintableCodes} className="btn btn-secondary flex items-center" style={{ gap: '6px' }}>
                    <FileSpreadsheet size={14} /> Open Printable List (new tab)
                  </button>
                </div>
              </div>
            )}

            {failCount > 0 && (
              <div className="table-container mb-16">
                <table className="data-table">
                  <thead><tr><th>Driver ID</th><th>Name</th><th>Reason</th></tr></thead>
                  <tbody>
                    {outcomes.filter(o => !o.ok).map(o => (
                      <tr key={o.driver_id}>
                        <td className="font-mono">{o.driver_id}</td>
                        <td>{o.full_name}</td>
                        <td className="text-xs" style={{ color: '#E65100' }}>{o.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end">
              <button type="button" onClick={onClose} className="btn btn-primary">Done</button>
            </div>
          </div>
        ) : !rows ? (
          <>
            <div className="flex items-center justify-between mb-8">
              <p className="text-xs text-muted m-0">Reads any spreadsheet with a name column — phone, role, driver ID and pay rate are all optional and auto-filled if missing. Each driver gets a one-time activation code after import; they pick their own PIN in the app.</p>
              <button type="button" onClick={downloadSample} className="text-xs font-bold" style={{ background: 'none', border: 'none', color: 'var(--brand-red)', cursor: 'pointer', padding: 0, whiteSpace: 'nowrap' }}>
                Download sample CSV
              </button>
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              style={{
                border: `2px dashed ${isDragOver ? 'var(--brand-red)' : 'var(--border-color)'}`,
                borderRadius: '12px', padding: '40px 20px', textAlign: 'center',
                background: isDragOver ? 'var(--brand-red-light)' : 'transparent',
              }}
            >
              <UploadCloud size={32} color={isDragOver ? '#CC0000' : '#94A3B8'} style={{ marginBottom: '10px' }} />
              <p className="text-sm font-bold text-primary m-0">Drag &amp; drop your driver list here</p>
              <p className="text-xs text-muted mb-16">.csv or .xlsx — export it from wherever your driver database lives today</p>
              <label className="btn btn-secondary" style={{ cursor: 'pointer', display: 'inline-flex' }}>
                {isProcessing ? 'Reading…' : 'Choose File'}
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  hidden
                  disabled={isProcessing}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }}
                />
              </label>
              {fileName && <p className="text-xs text-muted mt-8">{fileName}</p>}
            </div>
          </>
        ) : (
          <>
            <div className="mb-16" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <span className="flex items-center text-xs font-bold" style={{ gap: '6px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(46,125,50,0.08)', color: '#2E7D32' }}>
                <CircleCheck size={14} />
                {readyRows.length} ready to import
              </span>
              {blockedCount > 0 && (
                <span className="flex items-center text-xs font-bold" style={{ gap: '6px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(230,81,0,0.08)', color: '#E65100' }}>
                  <AlertTriangle size={14} />
                  {blockedCount} need{blockedCount === 1 ? 's' : ''} a different Driver ID before import
                </span>
              )}
            </div>

            <div className="table-container mb-16">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Driver ID</th>
                    <th>Phone</th>
                    <th>Role</th>
                    <th>Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => {
                    const taken = idIsTaken(row.driver_id, row.rowIndex);
                    return (
                      <tr key={row.rowIndex}>
                        <td className="text-sm">{row.full_name}</td>
                        <td>
                          <input
                            className="input-field font-mono"
                            style={{ width: '140px', fontSize: '12px', padding: '4px 8px', borderColor: taken ? '#E65100' : undefined }}
                            value={row.driver_id}
                            onChange={(e) => updateRow(row.rowIndex, { driver_id: slugifyDriverId(e.target.value) })}
                          />
                          {taken && (
                            <span className="flex items-center text-xs font-bold mt-4" style={{ gap: '4px', color: '#E65100' }}>
                              <AlertTriangle size={12} /> Already in use
                            </span>
                          )}
                        </td>
                        <td className="font-mono text-xs">{row.phone || '—'}</td>
                        <td className="text-xs">{PROFESSION_DISPLAY(row.profession)}</td>
                        <td className="font-mono text-xs">
                          {row.rate_type === 'Fixed Shift Rate (Day Rate)' ? `£${row.base_rate.toFixed(2)}/shift` : `£${row.base_rate.toFixed(2)}/hr`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {isImporting && (
              <p className="text-xs text-muted mb-8">Creating driver {importProgress} of {readyRows.length}…</p>
            )}

            <div className="flex items-center justify-between">
              <button type="button" onClick={() => { setRows(null); setFileName(null); }} className="btn btn-secondary" disabled={isImporting}>
                Start Over
              </button>
              <button
                type="button"
                onClick={confirmImport}
                disabled={isImporting || readyRows.length === 0}
                className="btn btn-brand flex items-center"
                style={{ gap: '6px' }}
              >
                {isImporting ? 'Creating drivers…' : `Confirm Import (${readyRows.length})`}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function PROFESSION_DISPLAY(p: string): string {
  if (p === 'mechanic') return 'Mechanic';
  if (p === 'logistics') return 'Dispatcher / Logistics';
  return 'Driver';
}
