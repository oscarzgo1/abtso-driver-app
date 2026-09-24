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
// IMPORTANT — PIN visibility: a driver's PIN is bcrypt-hashed the
// moment it's saved (same trigger the single Add Employee form
// relies on) and can never be read back afterward. The only PINs
// this modal can ever show or export are the ones it generates
// itself, in this browser session, for the rows it just created —
// shown once on the results screen, exactly like the existing
// single-driver "Reset PIN" flow.
// ============================================================

interface FieldAliases {
  full_name: string[];
  phone: string[];
  driver_id: string[];
  pin: string[];
  profession: string[];
  rate_type: string[];
  base_rate: string[];
  agency: string[];
}

const ALIASES: FieldAliases = {
  full_name: ['full name', 'name', 'employee name', 'driver name'],
  phone: ['phone', 'phone number', 'mobile', 'mobile number', 'contact number'],
  driver_id: ['driver id', 'driver_id', 'username', 'employee id', 'employee code', 'id', 'code'],
  pin: ['pin', 'password', 'default pin', 'pin code'],
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
  pin: string;
  profession: string;
  rate_type: 'Hourly' | 'Fixed Shift Rate (Day Rate)';
  base_rate: number;
  agency_name: string;
}

interface ImportOutcome {
  driver_id: string;
  full_name: string;
  phone: string;
  pin: string;
  ok: boolean;
  reason?: string;
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

function generateRandomPin(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

const SAMPLE_CSV =
  'Full Name,Phone,Role,Driver ID,PIN,Rate Type,Base Rate,Agency\n' +
  'John Jones,+44 7700 900100,driver,,,Hourly,16.00,Direct\n' +
  'Maria Kowalski,+44 7700 900101,driver,,,Hourly,16.50,Direct\n';

interface DriverBulkImportModalProps {
  organizationId: string | null;
  existingDriverIds: string[];
  onClose: () => void;
  onImported: () => void;
}

export default function DriverBulkImportModal({ organizationId, existingDriverIds, onClose, onImported }: DriverBulkImportModalProps) {
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
      const pinCol = findColumn(headers, ALIASES.pin);
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

          const rawPin = pinCol ? String(row[pinCol] ?? '').trim() : '';
          const pin = /^\d{6}$/.test(rawPin) ? rawPin : generateRandomPin();

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
            pin,
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
          body: { driver_id: row.driver_id, full_name: row.full_name, phone: row.phone || 'N/A', pin: row.pin },
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
          results.push({ driver_id: row.driver_id, full_name: row.full_name, phone: row.phone, pin: row.pin, ok: false, reason: msg });
          setImportProgress(results.length);
          continue;
        }

        const createdDriver = data.driver;
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

        results.push({ driver_id: row.driver_id, full_name: row.full_name, phone: row.phone, pin: row.pin, ok: true });
      } catch (err: any) {
        results.push({ driver_id: row.driver_id, full_name: row.full_name, phone: row.phone, pin: row.pin, ok: false, reason: err?.message ?? 'Connection error' });
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
      'PIN': o.pin,
    })));
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `driver-credentials-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
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
            Bulk Import Drivers
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
                  <KeyRound size={14} color="#CC0000" /> Download credentials now — this is the only time these PINs can be shown
                </p>
                <p className="text-xs text-muted mb-12">
                  PINs are bcrypt-hashed the moment they're saved and can never be read back after this screen closes. Download this file and hand each driver their login, or the code is gone for good — you'd have to reset it later instead.
                </p>
                <button type="button" onClick={downloadCredentials} className="btn btn-brand flex items-center" style={{ gap: '6px' }}>
                  <Download size={14} /> Download {successCount} Credential{successCount === 1 ? '' : 's'} (.csv)
                </button>
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
              <p className="text-xs text-muted m-0">Reads any spreadsheet with a name column — phone, role, driver ID, PIN and pay rate are all optional and auto-filled if missing.</p>
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
                    <th>PIN</th>
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
                        <td className="font-mono text-xs">{row.pin}</td>
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
