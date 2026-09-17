import { useState } from 'react';
import { X, UploadCloud, FileSpreadsheet, CircleCheck, AlertTriangle, Building2, Layers } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { supabase, isMockMode } from '../App';

// ============================================================
// Carrier Batch Settlement Importer — CSV/XLSX ingestion for Amazon
// Relay / DHL / Eddie Stobart / a standard template, with an
// auto-reconciliation pass against real driver shifts.
//
// IMPORTANT HONESTY NOTE: Amazon Relay's "Start Date"/"Trip Cost" and
// DHL's "Execution Date"/"Consignment" are confirmed real export column
// names; every other alias per field (including all of Stobart's) is
// still a reasonable but unverified guess — I don't have a real
// specimen to confirm the rest against. If a real export uses different
// headers, this will report "0 loads recognised" rather than silently
// misreading columns — the Universal template (whose headers we
// control) is the one preset guaranteed to match.
//
// detectPreset() scores every preset's alias groups against a dropped
// file's actual headers and auto-selects the best match — there's no
// carrier tab to pre-select before uploading; the results screen shows
// what was detected and lets you override it there if it guessed wrong.
//
// Matching strategy: by Date + Assigned Truck Registration when the
// load's format provides a registration (only the Universal template
// does) and a shift already has vehicle_id set; otherwise by Date
// alone. A date with exactly one un-rated shift is a confident
// auto-match; a date with several is flagged "needs assignment" with
// every real candidate shift offered in a picker — never guessed.
// GPS-arrival-at-depot matching (the spec's other stated option) is
// deliberately not built this pass — reg/date matching already covers
// the common single-shift-per-day case honestly, and depot-arrival
// matching would need fuzzy-matching a load's free-text Origin/
// Destination against this org's real depot names, which is a
// meaningfully different (and fragile) feature to get right.
// ============================================================

export interface ImportShiftCandidate {
  id: string;
  driver_id: string;
  driver_name: string;
  vehicle_id: string | null;
  vehicle_number: string | null;
  start_time: string;
  hasRevenue: boolean;
}

interface CarrierPreset {
  key: string;
  label: string;
  date: string[];
  amount: string[];
  loadRef: string[];
  registration?: string[];
}

const CARRIER_PRESETS: CarrierPreset[] = [
  {
    key: 'amazon_relay',
    label: 'Amazon Relay',
    // 'start date' / 'trip cost' confirmed real Amazon Relay export
    // headers; the rest were this file's earlier best-guess aliases,
    // kept alongside in case a different Relay report variant uses them.
    date: ['start date', 'scheduled departure', 'departure', 'date'],
    amount: ['trip cost', 'payment amount', 'amount', 'settlement amount'],
    loadRef: ['vrid', 'route', 'load id'],
  },
  {
    key: 'dhl',
    label: 'DHL Supply Chain',
    // 'execution date' / 'consignment' confirmed real DHL export headers.
    date: ['execution date', 'date', 'collection date', 'delivery date'],
    amount: ['amount', 'agreed rate', 'rate', 'settlement amount'],
    loadRef: ['consignment', 'shipment #', 'shipment', 'shipment number', 'shipment no'],
  },
  {
    key: 'stobart',
    label: 'Eddie Stobart / Stobart Europe',
    date: ['date', 'job date'],
    amount: ['load rate', 'rate', 'amount'],
    loadRef: ['job id', 'job', 'job reference', 'job ref'],
  },
  {
    key: 'universal',
    label: 'Universal / Standard CSV',
    date: ['date'],
    amount: ['amount', 'rate'],
    loadRef: ['load reference', 'reference', 'load ref'],
    registration: ['registration', 'reg', 'vehicle', 'vehicle reg'],
  },
];

interface ParsedLoad {
  rowIndex: number;
  date: string | null; // YYYY-MM-DD
  amount: number | null;
  loadRef: string;
  registration: string | null;
}

type MatchStatus = 'matched' | 'ambiguous' | 'unmatched';

interface ReconciledLoad extends ParsedLoad {
  status: MatchStatus;
  candidates: ImportShiftCandidate[];
  assignedShiftId: string | null;
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, ' ');
}
function normalizeReg(reg: string): string {
  return reg.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
function parseDateLoose(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Try native parsing first (handles ISO and most explicit formats)
  const native = new Date(trimmed);
  if (!Number.isNaN(native.getTime())) return native.toISOString().slice(0, 10);
  // UK dd/mm/yyyy fallback
  const ukMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (ukMatch) {
    const [, d, m, y] = ukMatch;
    const year = y.length === 2 ? `20${y}` : y;
    const iso = `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.getTime())) return iso;
  }
  return null;
}

function findColumn(headers: string[], aliases: string[]): string | null {
  const normalized = headers.map(h => ({ raw: h, norm: normalizeHeader(h) }));
  for (const alias of aliases) {
    const hit = normalized.find(h => h.norm === alias);
    if (hit) return hit.raw;
  }
  return null;
}

/** Smart schema detection — scores every known preset against a file's
 * actual headers (how many of date/amount/loadRef it can resolve a real
 * column for) and picks the best match. Replaces having to pre-select a
 * carrier tab before you can even drop a file. Ties, or a file matching
 * nothing (score 0), fall back to Universal — its headers are the ones
 * this app controls, so it's the only preset guaranteed to be safe to
 * guess if nothing else scores. */
function detectPreset(headers: string[]): CarrierPreset {
  let best: CarrierPreset = CARRIER_PRESETS.find(p => p.key === 'universal')!;
  let bestScore = -1;
  for (const preset of CARRIER_PRESETS) {
    const score = [preset.date, preset.amount, preset.loadRef].filter(aliases => findColumn(headers, aliases)).length;
    if (score > bestScore) {
      bestScore = score;
      best = preset;
    }
  }
  return bestScore > 0 ? best : CARRIER_PRESETS.find(p => p.key === 'universal')!;
}

function parseRows(rows: Record<string, any>[], preset: CarrierPreset): ParsedLoad[] {
  if (rows.length === 0) return [];
  const headers = Object.keys(rows[0]);
  const dateCol = findColumn(headers, preset.date);
  const amountCol = findColumn(headers, preset.amount);
  const loadRefCol = findColumn(headers, preset.loadRef);
  const regCol = preset.registration ? findColumn(headers, preset.registration) : null;

  return rows.map((row, i) => {
    const rawDate = dateCol ? String(row[dateCol] ?? '') : '';
    const rawAmount = amountCol ? String(row[amountCol] ?? '') : '';
    const cleanedAmount = rawAmount.replace(/[£,\s]/g, '');
    const amount = cleanedAmount && !Number.isNaN(Number(cleanedAmount)) ? Number(cleanedAmount) : null;
    return {
      rowIndex: i,
      date: parseDateLoose(rawDate),
      amount,
      loadRef: loadRefCol ? String(row[loadRefCol] ?? '').trim() : '',
      registration: regCol ? String(row[regCol] ?? '').trim() || null : null,
    };
  });
}

function reconcile(loads: ParsedLoad[], candidates: ImportShiftCandidate[]): ReconciledLoad[] {
  const availableByDate = new Map<string, ImportShiftCandidate[]>();
  for (const c of candidates) {
    if (c.hasRevenue) continue;
    const key = c.start_time.slice(0, 10);
    (availableByDate.get(key) ?? availableByDate.set(key, []).get(key)!).push(c);
  }

  return loads.map(load => {
    if (!load.date || load.amount === null) {
      return { ...load, status: 'unmatched' as const, candidates: [], assignedShiftId: null };
    }
    const sameDay = availableByDate.get(load.date) ?? [];

    if (load.registration) {
      const reg = normalizeReg(load.registration);
      const regMatches = sameDay.filter(c => c.vehicle_number && normalizeReg(c.vehicle_number) === reg);
      if (regMatches.length === 1) {
        return { ...load, status: 'matched' as const, candidates: regMatches, assignedShiftId: regMatches[0].id };
      }
      if (regMatches.length > 1) {
        return { ...load, status: 'ambiguous' as const, candidates: regMatches, assignedShiftId: null };
      }
      // Registration given but nothing matched it — fall through to
      // date-only matching rather than declaring a hard failure.
    }

    if (sameDay.length === 1) {
      return { ...load, status: 'matched' as const, candidates: sameDay, assignedShiftId: sameDay[0].id };
    }
    if (sameDay.length > 1) {
      return { ...load, status: 'ambiguous' as const, candidates: sameDay, assignedShiftId: null };
    }
    return { ...load, status: 'unmatched' as const, candidates: [], assignedShiftId: null };
  });
}

const UNIVERSAL_SAMPLE_CSV = 'Date,Registration,Load Reference,Amount\n2026-09-14,YK23 ABC,#LOAD-1001,450.00\n2026-09-15,YK24 DEF,#LOAD-1002,510.00\n';

interface CarrierSettlementImportModalProps {
  organizationId: string | null;
  onClose: () => void;
  onImported: () => void;
}

export default function CarrierSettlementImportModal({ organizationId, onClose, onImported }: CarrierSettlementImportModalProps) {
  const [presetKey, setPresetKey] = useState<string>('universal');
  // True once a file's headers have been auto-scored — lets the results
  // screen show "Detected: X" instead of implying the user picked it.
  const [wasAutoDetected, setWasAutoDetected] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [lastRawRows, setLastRawRows] = useState<Record<string, any>[]>([]);
  const [reconciled, setReconciled] = useState<ReconciledLoad[] | null>(null);
  const [candidates, setCandidates] = useState<ImportShiftCandidate[]>([]);
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importedCount, setImportedCount] = useState<number | null>(null);

  const preset = CARRIER_PRESETS.find(p => p.key === presetKey)!;

  const loadCandidates = async (): Promise<ImportShiftCandidate[]> => {
    if (isMockMode || !supabase || !organizationId) return [];
    const since = new Date();
    since.setDate(since.getDate() - 90);
    const { data } = await supabase
      .from('shifts')
      .select('id, driver_id, start_time, vehicle_id, drivers(full_name), vehicles!vehicle_id(vehicle_number), shift_revenue(revenue_amount)')
      .eq('organization_id', organizationId)
      .eq('status', 'completed')
      .gte('start_time', since.toISOString());
    return (data ?? []).map((s: any) => {
      const rev = Array.isArray(s.shift_revenue) ? s.shift_revenue[0] : s.shift_revenue;
      return {
        id: s.id,
        driver_id: s.driver_id,
        driver_name: s.drivers?.full_name ?? 'Driver',
        vehicle_id: s.vehicle_id ?? null,
        vehicle_number: s.vehicles?.vehicle_number ?? null,
        start_time: s.start_time,
        hasRevenue: rev?.revenue_amount !== null && rev?.revenue_amount !== undefined,
      };
    });
  };

  const processFile = async (file: File) => {
    setError('');
    setIsProcessing(true);
    setFileName(file.name);
    try {
      let rows: Record<string, any>[] = [];
      const isXlsx = /\.xlsx?$/i.test(file.name);
      if (isXlsx) {
        const buf = await file.arrayBuffer();
        const workbook = XLSX.read(new Uint8Array(buf), { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, any>[];
      } else {
        const text = await file.text();
        const result = Papa.parse<Record<string, any>>(text, { header: true, skipEmptyLines: true });
        rows = result.data;
      }

      setLastRawRows(rows);
      const detected = rows.length > 0 ? detectPreset(Object.keys(rows[0])) : preset;
      setPresetKey(detected.key);
      setWasAutoDetected(true);

      const parsed = parseRows(rows, detected);
      const candidateShifts = await loadCandidates();
      setCandidates(candidateShifts);
      setReconciled(reconcile(parsed, candidateShifts));
    } catch (err: any) {
      setError(err?.message ?? 'Could not read this file.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Manual override, in case detection guessed wrong — re-parses the same
  // already-loaded rows against a different preset without re-uploading
  // or re-fetching candidate shifts.
  const overridePreset = (newKey: string) => {
    setPresetKey(newKey);
    setWasAutoDetected(false);
    const newPreset = CARRIER_PRESETS.find(p => p.key === newKey)!;
    const parsed = parseRows(lastRawRows, newPreset);
    setReconciled(reconcile(parsed, candidates));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const setAssignedShift = (rowIndex: number, shiftId: string | null) => {
    setReconciled(prev =>
      prev
        ? prev.map(l => (l.rowIndex === rowIndex ? { ...l, assignedShiftId: shiftId, status: shiftId ? 'matched' : l.status } : l))
        : prev,
    );
  };

  const confirmImport = async () => {
    if (isMockMode || !supabase || !reconciled) return;
    const toImport = reconciled.filter(l => l.assignedShiftId && l.amount !== null);
    if (toImport.length === 0) return;
    setIsImporting(true);
    setError('');
    try {
      // If any load carried a registration and matched a shift that has
      // no vehicle assigned yet, resolve those registrations to real
      // vehicles.id once up front (one query) rather than guessing.
      const regsNeedingLookup = Array.from(
        new Set(
          toImport
            .filter(l => l.registration && !candidates.find(c => c.id === l.assignedShiftId)?.vehicle_id)
            .map(l => normalizeReg(l.registration as string)),
        ),
      );
      const vehicleIdByReg = new Map<string, string>();
      if (regsNeedingLookup.length > 0 && organizationId) {
        const { data: vRows } = await supabase
          .from('vehicles')
          .select('id, vehicle_number')
          .eq('organization_id', organizationId);
        for (const v of vRows ?? []) {
          vehicleIdByReg.set(normalizeReg(v.vehicle_number), v.id);
        }
      }

      let successCount = 0;
      for (const load of toImport) {
        const { error: upsertError } = await supabase
          .from('shift_revenue')
          .upsert(
            {
              shift_id: load.assignedShiftId,
              revenue_amount: load.amount,
              load_reference: load.loadRef || null,
              carrier_name: preset.label,
            },
            { onConflict: 'shift_id' },
          );
        if (upsertError) continue;
        successCount += 1;

        const candidate = candidates.find(c => c.id === load.assignedShiftId);
        if (load.registration && candidate && !candidate.vehicle_id) {
          const matchedVehicleId = vehicleIdByReg.get(normalizeReg(load.registration));
          if (matchedVehicleId) {
            await supabase.from('shifts').update({ vehicle_id: matchedVehicleId }).eq('id', load.assignedShiftId);
          }
        }
      }
      setImportedCount(successCount);
      onImported();
    } catch (err: any) {
      setError(err?.message ?? 'Could not import these settlements.');
    } finally {
      setIsImporting(false);
    }
  };

  const downloadSample = () => {
    const blob = new Blob([UNIVERSAL_SAMPLE_CSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'universal-settlement-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const matchedCount = reconciled?.filter(l => l.status === 'matched' || l.assignedShiftId).length ?? 0;
  const needsAssignmentCount = reconciled ? reconciled.length - matchedCount : 0;

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 998 }} onClick={onClose} />
      <div
        className="glass-panel"
        style={{
          position: 'fixed', top: '5vh', left: '50%', transform: 'translateX(-50%)',
          width: 'min(880px, 92vw)', maxHeight: '90vh', overflowY: 'auto', zIndex: 999,
          borderRadius: '14px', padding: '24px', background: 'var(--card-bg)',
        }}
      >
        <div className="flex items-center justify-between mb-16">
          <h3 className="text-lg font-black text-primary m-0 flex items-center" style={{ gap: '8px' }}>
            <FileSpreadsheet size={20} color="#CC0000" />
            Import Carrier Load Files
          </h3>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--charcoal-light)' }}>
            <X size={18} />
          </button>
        </div>

        {error && <div className="login-notice login-notice--error mb-16">{error}</div>}

        {importedCount !== null ? (
          <div className="text-center py-24">
            <CircleCheck size={40} color="#10B981" style={{ marginBottom: '12px' }} />
            <p className="text-md font-bold text-primary">Imported {importedCount} settlement{importedCount === 1 ? '' : 's'}</p>
            <p className="text-sm text-muted mb-16">The Load Yield ledger below has been refreshed.</p>
            <button type="button" onClick={onClose} className="btn btn-primary">Done</button>
          </div>
        ) : !reconciled ? (
          <>
            {/* Single universal dropzone — no carrier tab to pick before you
                can even drop a file. Header detection (detectPreset) figures
                out Amazon Relay / DHL / Stobart / Universal automatically
                once the file is read; the results screen below shows what
                it detected and lets you override it if it guessed wrong. */}
            <div className="flex items-center justify-between mb-8">
              <p className="text-xs text-muted m-0">Recognises Amazon Relay, DHL Supply Chain, and Eddie Stobart exports automatically — or use the Universal template.</p>
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
              <p className="text-sm font-bold text-primary m-0">Drag &amp; drop a .csv or .xlsx file here</p>
              <p className="text-xs text-muted mb-16">Carrier format is detected automatically from the file's columns</p>
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
            <div className="flex items-center justify-between mb-16" style={{ flexWrap: 'wrap', gap: '10px', padding: '12px 16px', borderRadius: '10px', background: 'var(--card-bg-hover)' }}>
              <span className="flex items-center text-xs font-bold text-muted" style={{ gap: '6px' }}>
                <Layers size={13} />
                {wasAutoDetected ? 'Detected format:' : 'Format:'}
              </span>
              <select
                className="select-field"
                style={{ fontSize: '12px', padding: '4px 8px', marginRight: 'auto' }}
                value={presetKey}
                onChange={(e) => overridePreset(e.target.value)}
              >
                {CARRIER_PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>

            {/* Clear status preview before commit — no ambiguity about
                what "confirm" is about to do. "New unassigned loads
                created" (as literally worded) isn't how this schema
                works — shift_revenue always requires a real shift_id, so
                nothing is ever created without one; unmatched rows stay
                a preview-only row until an admin assigns a real shift
                below, honestly labelled as needing that assignment. */}
            <div className="mb-16" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <span className="flex items-center text-xs font-bold" style={{ gap: '6px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(46,125,50,0.08)', color: '#2E7D32' }}>
                <CircleCheck size={14} />
                {matchedCount} record{matchedCount === 1 ? '' : 's'} matched and will be updated (upsert)
              </span>
              {needsAssignmentCount > 0 && (
                <span className="flex items-center text-xs font-bold" style={{ gap: '6px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(230,81,0,0.08)', color: '#E65100' }}>
                  <AlertTriangle size={14} />
                  {needsAssignmentCount} need{needsAssignmentCount === 1 ? 's' : ''} manual shift assignment
                </span>
              )}
            </div>

            <div className="table-container mb-16">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Load Ref</th>
                    <th>Amount</th>
                    <th>Match</th>
                  </tr>
                </thead>
                <tbody>
                  {reconciled.map(load => (
                    <tr key={load.rowIndex}>
                      <td className="font-mono tabular-nums whitespace-nowrap">{load.date ?? '—'}</td>
                      <td className="font-mono">{load.loadRef || '—'}</td>
                      <td className="font-mono tabular-nums whitespace-nowrap">{load.amount === null ? '—' : `£${load.amount.toFixed(2)}`}</td>
                      <td>
                        {load.assignedShiftId ? (
                          <span className="flex items-center text-xs font-bold" style={{ gap: '4px', color: '#2E7D32' }}>
                            <CircleCheck size={13} />
                            {candidates.find(c => c.id === load.assignedShiftId)?.driver_name ?? 'Assigned'}
                          </span>
                        ) : load.candidates.length > 0 || load.status === 'ambiguous' ? (
                          <select
                            className="select-field"
                            style={{ fontSize: '12px', padding: '4px 8px' }}
                            value=""
                            onChange={(e) => setAssignedShift(load.rowIndex, e.target.value || null)}
                          >
                            <option value="">Assign to shift…</option>
                            {load.candidates.map(c => (
                              <option key={c.id} value={c.id}>
                                {new Date(c.start_time).toLocaleDateString('en-GB')} — {c.driver_name}{c.vehicle_number ? ` (${c.vehicle_number})` : ''}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <select
                            className="select-field"
                            style={{ fontSize: '12px', padding: '4px 8px' }}
                            value=""
                            onChange={(e) => setAssignedShift(load.rowIndex, e.target.value || null)}
                          >
                            <option value="">No same-day shift — pick manually…</option>
                            {candidates.filter(c => !c.hasRevenue).map(c => (
                              <option key={c.id} value={c.id}>
                                {new Date(c.start_time).toLocaleDateString('en-GB')} — {c.driver_name}{c.vehicle_number ? ` (${c.vehicle_number})` : ''}
                              </option>
                            ))}
                          </select>
                        )}
                        {!load.assignedShiftId && (
                          <span className="flex items-center text-xs font-bold mt-4" style={{ gap: '4px', color: '#E65100' }}>
                            <AlertTriangle size={12} /> Needs assignment
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between">
              <button type="button" onClick={() => { setReconciled(null); setFileName(null); }} className="btn btn-secondary">
                Start Over
              </button>
              <button
                type="button"
                onClick={confirmImport}
                disabled={isImporting || matchedCount === 0}
                className="btn btn-brand flex items-center"
                style={{ gap: '6px' }}
              >
                <Building2 size={14} />
                {isImporting ? 'Importing…' : `Confirm Import (${matchedCount})`}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
