import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, X, MapPin, Camera, PenLine, Printer } from 'lucide-react';
import TableFilter, { type TableFilterGroup } from './ui/table-filter';
import { supabase, isMockMode } from '../App';

// Shipments -> Delivery History (proof of delivery). Every completed load,
// whether the office assigned it (dispatch_loads) or the driver attached it
// themselves (shift_loads), with the proof photos taken at delivery
// (migration 077). A row or any thumbnail opens the POD inspector: full-size
// photos, when each was taken, the GPS stamp and the driver's notes.
//
// Styling matches the rest of the app (telemetry-tabs/telemetry-search-wrap,
// the light card theme via --card-bg/--border-color/--charcoal, badge
// classes) rather than a bespoke dark palette.

type PodType = 'solo_departure' | 'empty_trailer' | 'paper_pod';

interface Proof {
  id: string;
  pod_type: PodType;
  photo_path: string;
  taken_at: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
}

interface Signature {
  first_name: string;
  last_name: string;
  svg: string;
  signed_at: string;
  gps_lat: number | null;
  gps_lng: number | null;
}

interface HistoryRow {
  key: string;
  kind: 'assigned' | 'manual';
  ref: string;
  driver: string;
  carrier: string;
  originFull: string | null;
  destinationFull: string | null;
  trailer: string | null;
  departure: string | null;
  delivered: string;
  notes: string | null;
  cargoPath: string | null;
  sealed: boolean;
  proofs: Proof[];
  signature: Signature | null;
}

const POD_LABEL: Record<PodType, string> = {
  solo_departure: 'Solo departure',
  empty_trailer: 'Empty trailer',
  paper_pod: 'Paper POD',
};

const PROOF_SELECT = 'shipment_proofs(id, pod_type, photo_path, taken_at, gps_lat, gps_lng), delivery_signatures(signer_first_name, signer_last_name, signature_svg, signed_at, gps_lat, gps_lng)';

/** The signature taken on the driver's phone when a photo was not possible. */
function signatureOf(r: Raw): Signature | null {
  const raw = Array.isArray(r.delivery_signatures) ? r.delivery_signatures[0] : r.delivery_signatures;
  if (!raw?.signature_svg) return null;
  return {
    first_name: raw.signer_first_name,
    last_name: raw.signer_last_name,
    svg: raw.signature_svg,
    signed_at: raw.signed_at,
    gps_lat: raw.gps_lat,
    gps_lng: raw.gps_lng,
  };
}

// An <img> never runs scripts, so a stored signature is safe to show this way.
const signatureSrc = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v: string) => v.replace(/[&<>"']/g, c => ESC[c]);

/** Opens a clean one-page record of the signed delivery and prints it. */
function printSignature(row: HistoryRow) {
  const sig = row.signature;
  if (!sig) return;
  const w = window.open('', '_blank', 'width=820,height=900');
  if (!w) return;
  const route = [row.originFull, row.destinationFull].every(Boolean) ? `${row.originFull} to ${row.destinationFull}` : row.carrier;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Delivery signature ${esc(row.ref)}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:48px;}
h1{font-size:20px;margin:0 0 4px;} .sub{color:#666;font-size:13px;margin-bottom:28px;}
table{border-collapse:collapse;width:100%;font-size:14px;margin-bottom:28px;} td{padding:8px 0;border-bottom:1px solid #e3e3e3;vertical-align:top;} td:first-child{width:180px;color:#666;}
.sig{border:1px solid #bbb;border-radius:8px;padding:12px;height:190px;display:flex;align-items:center;justify-content:center;} .sig img{max-width:100%;max-height:100%;}
.foot{margin-top:18px;font-size:12px;color:#666;}
</style></head><body>
<h1>Proof of delivery: signature</h1><div class="sub">Load ${esc(row.ref)}</div>
<table>
<tr><td>Received by</td><td><strong>${esc(sig.first_name)} ${esc(sig.last_name)}</strong></td></tr>
<tr><td>Signed</td><td>${esc(fullDt(sig.signed_at))}</td></tr>
<tr><td>Driver</td><td>${esc(row.driver)}</td></tr>
<tr><td>Route</td><td>${esc(route)}</td></tr>
${row.trailer ? `<tr><td>Trailer</td><td>${esc(row.trailer)}</td></tr>` : ''}
<tr><td>Delivered</td><td>${esc(fullDt(row.delivered))}</td></tr>
${sig.gps_lat != null && sig.gps_lng != null ? `<tr><td>Location</td><td>${sig.gps_lat.toFixed(5)}, ${sig.gps_lng.toFixed(5)}</td></tr>` : ''}
${row.notes ? `<tr><td>Notes</td><td>${esc(row.notes)}</td></tr>` : ''}
</table>
<div class="sig"><img src="${signatureSrc(sig.svg)}" alt="Signature"></div>
<div class="foot">Signed on the driver's device through Tachyo. The signer confirmed receipt of this load.</div>
<script>window.onload=function(){setTimeout(function(){window.print();},250);};</script>
</body></html>`);
  w.document.close();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

const properName = (name: string | null | undefined): string =>
  (name ?? '').trim().toLowerCase().replace(/(^|[\s\-'])([a-z])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase()) || '—';

const initials = (name: string): string => {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0 || name === '—') return '?';
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
};

/** "Doncaster DN4 (DNE1)" -> { code: "DNE1", place: "Doncaster DN4" }. */
function splitStop(raw: string | null): { code: string | null; place: string | null } {
  if (!raw) return { code: null, place: null };
  const m = raw.match(/^(.*?)\s*\(([A-Za-z0-9]{2,6})\)\s*$/);
  if (m) return { code: m[2].toUpperCase(), place: m[1].trim() || null };
  return { code: null, place: raw.trim() };
}

const carrierPill = (raw: string | null | undefined): string => {
  const c = (raw ?? '').trim().toUpperCase();
  return c ? c.slice(0, 10) : 'SPOT';
};

const dateOnly = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--');
const fullDt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';

function duration(from: string | null, to: string): string {
  if (!from) return '—';
  const ms = new Date(to).getTime() - new Date(from).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const mins = Math.round(ms / 60000);
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m` : `${mins}m`;
}

function proofsOf(r: Raw, legacy: { paper?: string | null; evidence?: string | null }, takenAt: string): Proof[] {
  const real = ((r.shipment_proofs ?? []) as Proof[]).filter(p => p.photo_path);
  if (real.length > 0) return real;
  const out: Proof[] = [];
  if (legacy.paper) out.push({ id: `${r.id}-paper`, pod_type: 'paper_pod', photo_path: legacy.paper, taken_at: takenAt, gps_lat: null, gps_lng: null });
  if (legacy.evidence) out.push({ id: `${r.id}-evidence`, pod_type: 'empty_trailer', photo_path: legacy.evidence, taken_at: takenAt, gps_lat: null, gps_lng: null });
  return out;
}

export default function DeliveryHistory() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState<string[]>([]);
  const [podFilter, setPodFilter] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState<HistoryRow | null>(null);

  const load = useCallback(async () => {
    if (isMockMode || !supabase) return;
    setIsLoading(true);
    setError('');
    const [d, m] = await Promise.all([
      supabase
        .from('dispatch_loads')
        .select(`id, vrid, origin, destination, accepted_at, completed_at, delivery_notes, cargo_photo_path, trailer_sealed, trailer_number, drivers(full_name), carrier_name, carrier_loads(carrier_name), ${PROOF_SELECT}`)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(300),
      supabase
        .from('shift_loads')
        .select(`id, load_reference, carrier_name, booked_departure_at, delivered_at, created_at, delivery_notes, cargo_photo_path, trailer_sealed, delivery_paperwork_path, delivery_evidence_path, shifts(start_time, drivers(full_name), trailer:vehicles!trailer_id(vehicle_number)), ${PROOF_SELECT}`)
        .not('delivered_at', 'is', null)
        .order('delivered_at', { ascending: false })
        .limit(300),
    ]);
    setIsLoading(false);
    if (d.error || m.error) {
      setError((d.error ?? m.error)?.message ?? 'Could not load delivery history.');
      return;
    }
    const assigned: HistoryRow[] = ((d.data ?? []) as Raw[]).map(r => ({
      key: `a-${r.id}`,
      kind: 'assigned',
      ref: String(r.vrid ?? '').toUpperCase(),
      driver: properName(r.drivers?.full_name),
      carrier: carrierPill(r.carrier_name ?? r.carrier_loads?.carrier_name),
      originFull: r.origin,
      destinationFull: r.destination,
      trailer: r.trailer_number ?? null,
      departure: r.accepted_at,
      delivered: r.completed_at,
      notes: r.delivery_notes,
      cargoPath: r.cargo_photo_path,
      sealed: !!r.trailer_sealed,
      proofs: proofsOf(r, {}, r.completed_at),
      signature: signatureOf(r),
    }));
    const manual: HistoryRow[] = ((m.data ?? []) as Raw[]).map(r => ({
      key: `m-${r.id}`,
      kind: 'manual',
      ref: String(r.load_reference ?? '').toUpperCase(),
      driver: properName(r.shifts?.drivers?.full_name),
      carrier: carrierPill(r.carrier_name),
      originFull: null,
      destinationFull: null,
      trailer: r.shifts?.trailer?.vehicle_number ?? null,
      departure: r.booked_departure_at ?? r.created_at,
      delivered: r.delivered_at,
      notes: r.delivery_notes,
      cargoPath: r.cargo_photo_path,
      sealed: !!r.trailer_sealed,
      proofs: proofsOf(r, { paper: r.delivery_paperwork_path, evidence: r.delivery_evidence_path }, r.delivered_at),
      signature: signatureOf(r),
    }));
    setRows([...assigned, ...manual].sort((a, b) => b.delivered.localeCompare(a.delivered)));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Signed links for every photo shown (private bucket).
  useEffect(() => {
    if (isMockMode || !supabase) return;
    const paths = Array.from(new Set(rows.flatMap(r => [...r.proofs.map(p => p.photo_path), ...(r.cargoPath ? [r.cargoPath] : [])])));
    const missing = paths.filter(p => !(p in urls));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const next: Record<string, string> = {};
      for (let i = 0; i < missing.length; i += 100) {
        const chunk = missing.slice(i, i + 100);
        const { data } = await supabase!.storage.from('delivery-photos').createSignedUrls(chunk, 3600);
        data?.forEach((x, j) => { if (x.signedUrl) next[chunk[j]] = x.signedUrl; });
      }
      if (!cancelled) setUrls(prev => ({ ...prev, ...next }));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  // Company options come from the data, so a company entered when a load
  // is assigned shows up here without any change to the list.
  const companies = useMemo(() => Array.from(new Set(rows.map(r => r.carrier))).sort((a, b) => a.localeCompare(b)), [rows]);

  const filterGroups: TableFilterGroup[] = [
    {
      key: 'company',
      label: 'Company',
      options: companies.map(c => ({ value: c, label: c })),
      selected: companyFilter,
      onChange: setCompanyFilter,
    },
    {
      key: 'pod',
      label: 'Proof of delivery',
      options: [
        { value: 'missing', label: 'Missing POD' },
        { value: 'has', label: 'Has POD' },
      ],
      selected: podFilter,
      onChange: setPodFilter,
    },
  ];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (companyFilter.length > 0 && !companyFilter.includes(r.carrier)) return false;
      if (podFilter.length > 0 && !podFilter.includes(r.proofs.length === 0 && !r.signature ? 'missing' : 'has')) return false;
      return !q || `${r.ref} ${r.driver} ${r.carrier} ${r.originFull ?? ''} ${r.destinationFull ?? ''} ${r.trailer ?? ''}`.toLowerCase().includes(q);
    });
  }, [rows, search, companyFilter, podFilter]);

  return (
    <div className="mt-16" style={{ maxWidth: '1600px', width: '100%' }}>
      <div className="analytics-chart-card">
        <div className="flex align-center mb-16" style={{ gap: '10px', flexWrap: 'wrap' }}>
          <TableFilter groups={filterGroups} />
          <div className="telemetry-search-wrap" style={{ minWidth: '240px', flex: '1 1 240px', maxWidth: '360px' }}>
            <Search size={14} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search load, driver, route"
            />
          </div>
        </div>

        {error && <div className="login-notice login-notice--error mb-16">{error}</div>}

        <div className="table-container" style={{ overflowX: 'auto', maxWidth: '100%' }}>
          <table className="data-table data-table--nowrap">
            <thead>
              <tr>
                <th>Date</th>
                <th>Load / VRID</th>
                <th>Driver</th>
                <th>Carrier &amp; Route</th>
                <th>Departure</th>
                <th>Delivered</th>
                <th>Duration</th>
                <th>POD</th>
                <th>Photos</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-xs text-muted" style={{ padding: '18px' }}>{isLoading ? 'Loading' : 'No deliveries match.'}</td></tr>
              ) : filtered.map(r => {
                const from = splitStop(r.originFull);
                const to = splitStop(r.destinationFull);
                const codes = from.code && to.code ? `${from.code} → ${to.code}` : null;
                const places = from.place || to.place ? `${from.place ?? '—'} → ${to.place ?? '—'}` : null;
                const podTypes = Array.from(new Set(r.proofs.map(p => p.pod_type)));
                const shown = r.proofs.slice(0, 2);
                const extra = r.proofs.length - shown.length;
                return (
                  <tr key={r.key} onClick={() => setOpen(r)} style={{ cursor: 'pointer', height: '56px' }}>
                    <td className="whitespace-nowrap font-mono tabular-nums text-xs">{dateOnly(r.delivered)}</td>
                    <td>
                      <div className="flex flex-nowrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold uppercase tracking-wider">{r.ref}</span>
                        {r.kind === 'manual' && (
                          <span
                            className="text-[9px] font-semibold uppercase leading-none tracking-wider"
                            style={{ display: 'inline-flex', alignItems: 'center', height: '16px', padding: '0 4px', borderRadius: '3px', border: '1px solid var(--border-color)', color: 'var(--charcoal-light)' }}
                          >
                            Manual
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-nowrap items-center gap-2">
                        <span
                          className="text-[10px] font-semibold"
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: '999px', border: '1px solid var(--border-color)', background: 'var(--card-bg-hover)', color: 'var(--charcoal)', flexShrink: 0 }}
                        >
                          {initials(r.driver)}
                        </span>
                        <span className="text-sm font-medium">{r.driver}</span>
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-nowrap items-center gap-2.5">
                        <span
                          className="text-[10px] font-bold uppercase tracking-wider"
                          style={{ display: 'inline-flex', alignItems: 'center', height: '20px', padding: '0 6px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--card-bg-hover)', color: 'var(--charcoal)', flexShrink: 0 }}
                        >
                          {r.carrier}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          {codes ? (
                            <>
                              <p className="m-0 font-mono text-sm font-semibold tracking-wider">{codes}</p>
                              {places && <p className="m-0 text-[11px] text-muted">{places}</p>}
                            </>
                          ) : (
                            <p className="m-0 text-sm text-muted">{places ?? '—'}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="font-mono tabular-nums text-xs">{hhmm(r.departure)}</td>
                    <td className="font-mono tabular-nums text-xs">{hhmm(r.delivered)}</td>
                    <td>
                      <span
                        className="font-mono text-[11px] tabular-nums"
                        style={{ display: 'inline-flex', alignItems: 'center', height: '20px', padding: '0 8px', borderRadius: '999px', border: '1px solid var(--border-color)', background: 'var(--card-bg-hover)', color: 'var(--charcoal-light)' }}
                      >
                        {duration(r.departure, r.delivered)}
                      </span>
                    </td>
                    <td>
                      <div className="flex flex-row flex-nowrap items-center gap-1.5" style={{ height: '24px' }}>
                        {podTypes.length === 0 && !r.signature ? (
                          <span className="badge badge-warning" style={{ height: '20px', display: 'inline-flex', alignItems: 'center' }}>Missing POD</span>
                        ) : null}
                        {r.signature && (
                          <span
                            className="text-[10px] font-medium uppercase tracking-wider"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '20px', padding: '0 6px', borderRadius: '4px', border: '1px solid var(--border-color)', color: 'var(--charcoal-light)' }}
                          >
                            <PenLine size={11} />
                            Signature
                          </span>
                        )}
                        {podTypes.map(t => (
                          <span
                            key={t}
                            className="text-[10px] font-medium uppercase tracking-wider"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '20px', padding: '0 6px', borderRadius: '4px', border: '1px solid var(--border-color)', color: 'var(--charcoal-light)' }}
                          >
                            <span style={{ width: '6px', height: '6px', borderRadius: '999px', background: 'var(--charcoal-light)' }} />
                            {POD_LABEL[t]}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-row flex-nowrap items-center gap-1.5">
                        {shown.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setOpen(r); }}
                            title={POD_LABEL[p.pod_type]}
                            className="transition-colors"
                            style={{ display: 'flex', height: '36px', width: '36px', flexShrink: 0, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--card-bg-hover)', cursor: 'pointer' }}
                          >
                            {urls[p.photo_path]
                              ? <img src={urls[p.photo_path]} alt={POD_LABEL[p.pod_type]} className="h-full w-full object-cover" />
                              : <Camera size={13} color="var(--charcoal-light)" />}
                          </button>
                        ))}
                        {extra > 0 && (
                          <span
                            className="font-mono text-[11px] tabular-nums"
                            style={{ display: 'inline-flex', minWidth: '24px', height: '24px', alignItems: 'center', justifyContent: 'center', padding: '0 4px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--card-bg-hover)', color: 'var(--charcoal-light)' }}
                          >
                            +{extra}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {open && <PodInspector row={open} urls={urls} onClose={() => setOpen(null)} />}
    </div>
  );
}

function PodInspector({ row, urls, onClose }: { row: HistoryRow; urls: Record<string, string>; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const route = [row.originFull, row.destinationFull].every(Boolean) ? `${row.originFull} → ${row.destinationFull}` : row.carrier;

  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '32px 16px', overflowY: 'auto' }} onClick={onClose}>
      <div className="modal-content glass-panel" style={{ width: '1040px', maxWidth: '100%', padding: '24px', borderRadius: '16px', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex align-center justify-between mb-16">
          <div>
            <h3 className="text-md font-bold text-primary m-0">POD inspector <span className="font-mono tracking-wider">{row.ref}</span></h3>
            <p className="text-xs text-muted m-0 mt-4">{row.driver} &middot; {route}{row.trailer ? ` · trailer ${row.trailer}` : ''} &middot; delivered {fullDt(row.delivered)}</p>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--charcoal-light)' }}><X size={18} /></button>
        </div>

        {row.signature && (
          <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', background: 'var(--card-bg)', padding: '14px 16px', marginBottom: '16px', display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '8px', width: '300px', maxWidth: '100%' }}>
              <img src={signatureSrc(row.signature.svg)} alt="Signature" style={{ display: 'block', width: '100%', maxHeight: '170px', objectFit: 'contain' }} />
            </div>
            <div style={{ flex: '1 1 220px' }}>
              <span className="input-label" style={{ display: 'block' }}>SIGNED DELIVERY</span>
              <p className="text-md font-bold m-0 mt-4">{row.signature.first_name} {row.signature.last_name}</p>
              <p className="text-xs text-muted m-0 mt-4">Signed {fullDt(row.signature.signed_at)}</p>
              <p className="text-xs text-muted m-0 mt-4" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <MapPin size={12} />
                {row.signature.gps_lat != null && row.signature.gps_lng != null
                  ? <a href={`https://www.openstreetmap.org/?mlat=${row.signature.gps_lat}&mlon=${row.signature.gps_lng}#map=17/${row.signature.gps_lat}/${row.signature.gps_lng}`} target="_blank" rel="noreferrer" style={{ color: 'var(--brand-red)' }}>{row.signature.gps_lat.toFixed(5)}, {row.signature.gps_lng.toFixed(5)}</a>
                  : 'No GPS stamp'}
              </p>
              <button type="button" className="btn btn-secondary" style={{ marginTop: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }} onClick={() => printSignature(row)}>
                <Printer size={14} /> Print signature
              </button>
            </div>
          </div>
        )}

        {row.proofs.length === 0 ? (
          !row.signature && <p className="text-sm text-muted">No proof photos were recorded for this delivery.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
            {row.proofs.map(p => (
              <div key={p.id} style={{ border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden', background: 'var(--card-bg)' }}>
                <a href={urls[p.photo_path]} target="_blank" rel="noreferrer" style={{ display: 'block', background: 'var(--card-bg-hover)', minHeight: '200px', pointerEvents: urls[p.photo_path] ? 'auto' : 'none' }}>
                  {urls[p.photo_path]
                    ? <img src={urls[p.photo_path]} alt={POD_LABEL[p.pod_type]} style={{ width: '100%', maxHeight: '420px', objectFit: 'contain', display: 'block' }} />
                    : <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Camera size={22} color="var(--charcoal-light)" /></div>}
                </a>
                <div style={{ padding: '10px 12px' }}>
                  <span
                    className="text-[10px] font-medium uppercase tracking-wider"
                    style={{ display: 'inline-flex', alignItems: 'center', height: '20px', padding: '0 6px', borderRadius: '4px', border: '1px solid var(--border-color)', color: 'var(--charcoal-light)' }}
                  >
                    {POD_LABEL[p.pod_type]}
                  </span>
                  <p className="text-xs text-muted m-0 mt-8"><strong>Uploaded</strong> {fullDt(p.taken_at)}</p>
                  <p className="text-xs text-muted m-0 mt-4" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <MapPin size={12} />
                    {p.gps_lat != null && p.gps_lng != null
                      ? <a href={`https://www.openstreetmap.org/?mlat=${p.gps_lat}&mlon=${p.gps_lng}#map=17/${p.gps_lat}/${p.gps_lng}`} target="_blank" rel="noreferrer" style={{ color: 'var(--brand-red)' }}>{p.gps_lat.toFixed(5)}, {p.gps_lng.toFixed(5)}</a>
                      : 'No GPS stamp'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginTop: '20px' }}>
          <div>
            <span className="input-label">DELIVERY NOTES</span>
            <p className="text-sm m-0 mt-4">{row.notes || <span className="text-muted">No notes.</span>}</p>
          </div>
          <div>
            <span className="input-label" style={{ display: 'block' }}>AT LOAD START</span>
            {row.sealed ? (
              <p className="text-sm m-0 mt-4">Trailer sealed (plomba), photo not possible.</p>
            ) : row.cargoPath && urls[row.cargoPath] ? (
              <a href={urls[row.cargoPath]} target="_blank" rel="noreferrer" style={{ display: 'block', width: 'fit-content', marginTop: '6px' }}>
                <img src={urls[row.cargoPath]} alt="Cargo" style={{ display: 'block', maxHeight: '120px', borderRadius: '8px', border: '1px solid var(--border-color)' }} />
              </a>
            ) : (
              <p className="text-sm text-muted m-0 mt-4">No cargo photo taken.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
