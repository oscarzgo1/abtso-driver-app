import Papa from 'papaparse';
import * as XLSX from 'xlsx';

// Reads a carrier load file (CSV or XLSX) into the rows the load pool
// stores (migration 074). Headers are matched loosely by name — Amazon
// Relay's own export uses VRID / Origin / Destination style columns, and
// the aliases below also cover the common variants — so the same reader
// works for a future Amazon API feed mapped to the same shape.

export interface PoolLoadRow {
  vrid: string;
  origin: string | null;
  destination: string | null;
  booking_cutoff_at: string | null; // ISO
  trailer_number: string | null;
  carrier_name: string | null;
  status: 'waiting' | 'completed';
}

export interface ParsedLoadFile {
  rows: PoolLoadRow[];
  skipped: number;
  missingColumns: string[];
}

const ALIASES = {
  vrid: ['vrid', 'load id', 'load reference', 'load ref', 'reference', 'trip id', 'route'],
  origin: ['origin', 'pickup', 'pick up', 'pickup location', 'ship from', 'collection', 'from', 'origin facility'],
  destination: ['destination', 'dropoff', 'drop off', 'delivery location', 'ship to', 'delivery', 'to', 'destination facility'],
  cutoff: ['booking cutoff', 'booking cutoff time', 'cutoff', 'cut off', 'cutoff time', 'scheduled arrival', 'delivery by', 'due', 'due date'],
  trailer: ['trailer', 'trailer number', 'trailer id', 'trailer no', 'trailer #'],
  carrier: ['carrier', 'customer', 'customer / carrier', 'carrier name', 'shipper'],
  status: ['status', 'load status', 'trip status', 'delivery status', 'state'],
} as const;

const COMPLETED_WORDS = ['completed', 'complete', 'delivered', 'closed', 'done', 'finished', 'pod received'];

const norm = (h: string) => h.trim().toLowerCase().replace(/\s+/g, ' ');

function findKey(headers: string[], aliases: readonly string[]): string | null {
  const mapped = headers.map(h => ({ raw: h, n: norm(h) }));
  for (const a of aliases) {
    const hit = mapped.find(m => m.n === a);
    if (hit) return hit.raw;
  }
  return null;
}

function toIso(raw: unknown): string | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString();
  if (typeof raw === 'number' && raw > 20000 && raw < 80000) {
    // Excel serial date
    const ms = Math.round((raw - 25569) * 86400 * 1000);
    return new Date(ms).toISOString();
  }
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const uk = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (uk) {
    const [, d, m, y, hh = '0', mm = '0'] = uk;
    const year = y.length === 2 ? `20${y}` : y;
    const dt = new Date(Number(year), Number(m) - 1, Number(d), Number(hh), Number(mm));
    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  }
  const native = new Date(s);
  return Number.isNaN(native.getTime()) ? null : native.toISOString();
}

const text = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return s ? s : null;
};

export async function parseLoadFile(file: File): Promise<ParsedLoadFile> {
  let raw: Record<string, unknown>[];
  if (/\.xlsx?$/i.test(file.name)) {
    const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: true });
    raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }) as Record<string, unknown>[];
  } else {
    raw = Papa.parse<Record<string, unknown>>(await file.text(), { header: true, skipEmptyLines: true }).data;
  }
  if (raw.length === 0) return { rows: [], skipped: 0, missingColumns: [] };

  const headers = Object.keys(raw[0]);
  const key = {
    vrid: findKey(headers, ALIASES.vrid),
    origin: findKey(headers, ALIASES.origin),
    destination: findKey(headers, ALIASES.destination),
    cutoff: findKey(headers, ALIASES.cutoff),
    trailer: findKey(headers, ALIASES.trailer),
    carrier: findKey(headers, ALIASES.carrier),
    status: findKey(headers, ALIASES.status),
  };
  const missingColumns: string[] = [];
  if (!key.vrid) missingColumns.push('VRID / load reference');
  if (!key.status) missingColumns.push('Status');
  if (!key.vrid) return { rows: [], skipped: raw.length, missingColumns };

  const rows: PoolLoadRow[] = [];
  let skipped = 0;
  for (const r of raw) {
    const vrid = text(r[key.vrid]);
    if (!vrid) { skipped++; continue; }
    const statusText = key.status ? String(r[key.status] ?? '').trim().toLowerCase() : '';
    rows.push({
      vrid,
      origin: key.origin ? text(r[key.origin]) : null,
      destination: key.destination ? text(r[key.destination]) : null,
      booking_cutoff_at: key.cutoff ? toIso(r[key.cutoff]) : null,
      trailer_number: key.trailer ? text(r[key.trailer]) : null,
      carrier_name: key.carrier ? text(r[key.carrier]) : null,
      status: COMPLETED_WORDS.some(w => statusText === w || statusText.startsWith(w)) ? 'completed' : 'waiting',
    });
  }
  return { rows, skipped, missingColumns };
}
