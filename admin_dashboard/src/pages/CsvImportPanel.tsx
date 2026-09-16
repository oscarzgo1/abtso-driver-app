import { useState, useRef } from 'react';
import Papa from 'papaparse';
import { UploadCloud, Download, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase, isMockMode } from '../App';

// ============================================================
// Drag-and-drop CSV asset importer — the "Batch CSV Import" tab body
// inside AddAssetModal (this file owns no overlay/panel of its own;
// the unified modal shell provides that, plus the header and Tab
// switcher, per the single-centered-modal requirement). Each CSV row
// can carry up to three inspection dates (PMI/MOT/Tacho) — the
// vehicles table models one inspection_type + one due date per row, so
// a row with multiple dates populated becomes multiple vehicle rows
// sharing the same registration, exactly like adding the same asset
// three times through the manual form with different inspection
// types. Nothing here is fabricated: only columns actually present and
// valid in the uploaded file are inserted.
// ============================================================

const TEMPLATE_HEADERS = ['registration', 'asset_type', 'make_model', 'last_pmi_date', 'mot_expiry', 'tacho_expiry'];

interface ParsedRow {
  raw: Record<string, string>;
  registration: string;
  vehicleType: 'truck' | 'trailer' | null;
  makeModel: string;
  dates: { inspectionType: 'pmi' | 'mot' | 'tacho_calibration'; dueDate: string }[];
  error: string | null;
}

function normalizeAssetType(value: string): 'truck' | 'trailer' | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (v.includes('trail')) return 'trailer';
  if (v.includes('trac') || v.includes('truck') || v.includes('hgv') || v.includes('tractor')) return 'truck';
  return null;
}

function isValidDate(value: string): boolean {
  if (!value.trim()) return true; // empty is fine, just not included
  const d = new Date(value.trim());
  return !isNaN(d.getTime());
}

function parseRow(raw: Record<string, string>): ParsedRow {
  const registration = (raw.registration ?? '').trim();
  const vehicleType = normalizeAssetType(raw.asset_type ?? '');
  const makeModel = (raw.make_model ?? '').trim();
  const pmi = (raw.last_pmi_date ?? '').trim();
  const mot = (raw.mot_expiry ?? '').trim();
  const tacho = (raw.tacho_expiry ?? '').trim();

  let error: string | null = null;
  if (!registration) error = 'Missing registration.';
  else if (!vehicleType) error = `Unrecognised asset_type "${raw.asset_type ?? ''}" — use "Tractor Unit" or "Trailer".`;
  else if (!isValidDate(pmi)) error = `Invalid last_pmi_date "${pmi}".`;
  else if (!isValidDate(mot)) error = `Invalid mot_expiry "${mot}".`;
  else if (!isValidDate(tacho)) error = `Invalid tacho_expiry "${tacho}".`;

  const dates: ParsedRow['dates'] = [];
  if (!error) {
    if (pmi) dates.push({ inspectionType: 'pmi', dueDate: pmi });
    if (mot) dates.push({ inspectionType: 'mot', dueDate: mot });
    if (tacho) dates.push({ inspectionType: 'tacho_calibration', dueDate: tacho });
    if (dates.length === 0) error = 'No inspection dates provided (need at least one of last_pmi_date/mot_expiry/tacho_expiry).';
  }

  return { raw, registration, vehicleType, makeModel, dates, error };
}

interface CsvImportPanelProps {
  organizationId: string | null;
  onImported: () => void;
}

export default function CsvImportPanel({ organizationId, onImported }: CsvImportPanelProps) {
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadTemplate = () => {
    const csv = Papa.unparse({
      fields: TEMPLATE_HEADERS,
      data: [['YK23 ABC', 'Tractor Unit', 'DAF XF 480', '2026-11-01', '2026-10-15', '2026-09-30']],
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fleet-asset-import-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const parseFile = (file: File) => {
    setImportError('');
    setImportedCount(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setRows(results.data.map(parseRow));
      },
      error: (err) => setImportError(err.message ?? 'Could not read the CSV file.'),
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) parseFile(file);
  };

  const validRows = (rows ?? []).filter(r => !r.error);
  const errorRows = (rows ?? []).filter(r => r.error);

  const handleConfirmImport = async () => {
    if (isMockMode || !supabase || !organizationId || validRows.length === 0) return;
    setIsImporting(true);
    setImportError('');
    try {
      const inserts = validRows.flatMap(r =>
        r.dates.map(d => ({
          organization_id: organizationId,
          vehicle_number: r.registration,
          vehicle_type: r.vehicleType,
          inspection_type: d.inspectionType,
          inspection_due_date: d.dueDate,
          notes: r.makeModel ? `Make/Model: ${r.makeModel}` : null,
        }))
      );
      const { error: insertError } = await supabase.from('vehicles').insert(inserts);
      if (insertError) throw insertError;
      setImportedCount(validRows.length);
      onImported();
    } catch (err: any) {
      setImportError(err?.message ?? 'Could not import these assets.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div>
      <button
            type="button"
            onClick={handleDownloadTemplate}
            className="btn"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '12.5px', fontWeight: 700, marginBottom: '16px' }}
          >
            <Download size={14} /> Download CSV Template
          </button>

          {importError && <div className="login-notice login-notice--error mb-16">{importError}</div>}

          {importedCount !== null ? (
            <div className="flex align-center" style={{ gap: '8px', padding: '14px 16px', borderRadius: '10px', background: '#F0FDF4' }}>
              <CheckCircle2 size={18} color="#10B981" />
              <p className="text-sm m-0" style={{ color: '#166534' }}>
                Imported {importedCount} asset{importedCount === 1 ? '' : 's'}. You can close this window now.
              </p>
            </div>
          ) : !rows ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragActive(true); }}
              onDragLeave={() => setIsDragActive(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${isDragActive ? 'var(--brand-red)' : 'var(--border-color)'}`,
                borderRadius: '12px',
                padding: '40px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                background: isDragActive ? 'var(--card-bg-hover)' : 'transparent',
                transition: 'background-color 0.15s, border-color 0.15s',
              }}
            >
              <UploadCloud size={28} color={isDragActive ? 'var(--brand-red)' : 'var(--charcoal-light)'} style={{ margin: '0 auto 10px' }} />
              <p className="text-sm font-bold text-primary m-0">Drag and drop your CSV here, or click to browse</p>
              <p className="text-xs text-muted mt-4">Headers: registration, asset_type, make_model, last_pmi_date, mot_expiry, tacho_expiry</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) parseFile(f); }}
              />
            </div>
          ) : (
            <>
              <div className="flex align-center" style={{ gap: '16px', marginBottom: '12px' }}>
                <span className="flex align-center text-xs font-bold" style={{ gap: '4px', color: '#10B981' }}>
                  <CheckCircle2 size={14} /> {validRows.length} ready to import
                </span>
                {errorRows.length > 0 && (
                  <span className="flex align-center text-xs font-bold" style={{ gap: '4px', color: '#CC0000' }}>
                    <AlertTriangle size={14} /> {errorRows.length} need fixing
                  </span>
                )}
              </div>

              <div className="table-container mb-16" style={{ maxHeight: '260px', overflowY: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Registration</th>
                      <th>Type</th>
                      <th>Dates Found</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>
                        <td className="font-mono font-bold text-accent">{r.registration || '—'}</td>
                        <td className="text-secondary">{r.vehicleType === 'truck' ? 'Tractor Unit' : r.vehicleType === 'trailer' ? 'Trailer' : '—'}</td>
                        <td className="text-secondary text-xs">{r.dates.length > 0 ? r.dates.map(d => d.inspectionType).join(', ') : '—'}</td>
                        <td>
                          {r.error ? (
                            <span className="badge badge-danger" title={r.error}>{r.error}</span>
                          ) : (
                            <span className="badge badge-success">Valid</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex" style={{ gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={validRows.length === 0 || isImporting}
                  onClick={handleConfirmImport}
                >
                  {isImporting ? 'Importing…' : `Import ${validRows.length} Asset${validRows.length === 1 ? '' : 's'}`}
                </button>
                <button type="button" className="btn" onClick={() => setRows(null)}>Choose a Different File</button>
              </div>
            </>
          )}
    </div>
  );
}
