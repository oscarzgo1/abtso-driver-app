import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { X, UploadCloud, Camera } from 'lucide-react';
import { supabase, isMockMode } from '../App';
import { parseLoadFile } from '../lib/load-file';

// Dispatch (migrations 073/074). The department drops the carrier's load
// file; every load in it goes into the load list as Waiting or Completed.
// Assigning is a dropdown of the loads still waiting for delivery — never
// free text — so a completed or already-assigned load can't be handed out.
// The list follows the driver's progress: Assigned → In progress → Completed.

type PoolStatus = 'waiting' | 'assigned' | 'in_progress' | 'completed';

interface PoolLoad {
  id: string;
  vrid: string;
  origin: string | null;
  destination: string | null;
  booking_cutoff_at: string | null;
  trailer_number: string | null;
  carrier_name: string | null;
  status: PoolStatus;
}

interface DispatchRow {
  id: string;
  carrier_load_id: string | null;
  carrier_name: string | null;
  driver_id: string;
  vrid: string | null;
  status: string;
  shipment_proofs: { pod_type: string; photo_path: string }[];
  drivers: { full_name: string } | null;
}

interface DriverOption { id: string; full_name: string; is_active: boolean }

const TABS: { key: PoolStatus; label: string }[] = [
  { key: 'waiting', label: 'Waiting for delivery' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'completed', label: 'Completed' },
];

const BADGE: Record<PoolStatus, string> = {
  waiting: 'badge-warning', assigned: 'badge-accent', in_progress: 'badge-accent', completed: 'badge-success',
};


// The proof photos a driver took to complete a load (migration 077),
// resolved from the private delivery-photos bucket to short-lived links.
// Full inspection (timestamps, GPS, notes) is in Shipments -> Delivery History.
const POD_LABEL: Record<string, string> = { solo_departure: 'Solo departure', empty_trailer: 'Empty trailer', paper_pod: 'Paper POD' };

function CompletionPhotos({ row }: { row: DispatchRow }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const items = row.shipment_proofs ?? [];
  const key = items.map(i => i.photo_path).join('|');
  useEffect(() => {
    const paths = items.map(i => i.photo_path);
    if (isMockMode || !supabase || paths.length === 0) return;
    let cancelled = false;
    supabase.storage.from('delivery-photos').createSignedUrls(paths, 3600).then(({ data }) => {
      if (cancelled || !data) return;
      const next: Record<string, string> = {};
      data.forEach((d, i) => { if (d.signedUrl) next[paths[i]] = d.signedUrl; });
      setUrls(next);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (items.length === 0) return <span className="text-xs text-muted">No photos</span>;
  return (
    <div className="flex" style={{ gap: '6px' }}>
      {items.map(i => {
        const url = urls[i.photo_path];
        return (
          <a
            key={i.photo_path}
            href={url}
            target="_blank"
            rel="noreferrer"
            title={`${POD_LABEL[i.pod_type] ?? i.pod_type} — open full size`}
            style={{ width: 44, height: 44, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border-color)', background: 'var(--card-bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: url ? 'auto' : 'none' }}
          >
            {url ? <img src={url} alt={POD_LABEL[i.pod_type] ?? i.pod_type} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Camera size={14} color="var(--charcoal-light)" />}
          </a>
        );
      })}
    </div>
  );
}

const describeError = (err: unknown, fallback: string): string =>
  (err as { message?: string } | null)?.message ?? fallback;

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export default function DispatchLoadsModal({ drivers, initialDriverId = '', onClose, onChanged }: {
  drivers: DriverOption[];
  initialDriverId?: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [pool, setPool] = useState<PoolLoad[]>([]);
  const [dispatch, setDispatch] = useState<DispatchRow[]>([]);
  const [tab, setTab] = useState<PoolStatus>('waiting');
  const [driverId, setDriverId] = useState(initialDriverId);
  const [loadId, setLoadId] = useState('');
  const [trailer, setTrailer] = useState('');
  const [company, setCompany] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (isMockMode || !supabase) return;
    const [p, d] = await Promise.all([
      supabase.from('carrier_loads').select('id, vrid, origin, destination, booking_cutoff_at, trailer_number, carrier_name, status').order('imported_at', { ascending: false }).limit(1000),
      supabase.from('dispatch_loads').select('id, driver_id, vrid, carrier_load_id, carrier_name, status, shipment_proofs(pod_type, photo_path), drivers(full_name)').not('carrier_load_id', 'is', null).in('status', ['assigned', 'in_progress', 'completed']).order('created_at', { ascending: false }).limit(1000),
    ]);
    if (p.error) return setError(describeError(p.error, 'Could not load the load list.'));
    setPool((p.data ?? []) as PoolLoad[]);
    setDispatch((d.data ?? []) as unknown as DispatchRow[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  const changed = () => { load(); onChanged?.(); };

  const importFile = async (file: File) => {
    if (isMockMode || !supabase) return;
    setError(''); setNotice(''); setIsReading(true);
    try {
      const parsed = await parseLoadFile(file);
      if (parsed.rows.length === 0) {
        setError(parsed.missingColumns.length
          ? `No loads found — the file needs a ${parsed.missingColumns.join(' and ')} column.`
          : 'No loads found in that file.');
        return;
      }
      const { data, error: err } = await supabase.rpc('import_carrier_loads', { p_rows: parsed.rows, p_source_file: file.name });
      if (err) return setError(describeError(err, 'Could not import the file.'));
      const r = data as { inserted: number; updated: number; skipped: number };
      const waiting = parsed.rows.filter(x => x.status === 'waiting').length;
      const skipped = r.skipped + parsed.skipped;
      setNotice(`${file.name}: ${r.inserted} new, ${r.updated} updated${skipped ? `, ${skipped} skipped` : ''} — ${waiting} waiting for delivery, ${parsed.rows.length - waiting} already completed.`);
      changed();
    } catch (e) {
      setError(describeError(e, 'Could not read that file.'));
    } finally {
      setIsReading(false);
    }
  };

  const waitingLoads = useMemo(() => pool.filter(l => l.status === 'waiting'), [pool]);
  const driverByLoad = useMemo(() => {
    const m = new Map<string, DispatchRow>();
    for (const d of dispatch) if (d.carrier_load_id && !m.has(d.carrier_load_id)) m.set(d.carrier_load_id, d);
    return m;
  }, [dispatch]);
  const counts = useMemo(() => {
    const c: Record<PoolStatus, number> = { waiting: 0, assigned: 0, in_progress: 0, completed: 0 };
    for (const l of pool) c[l.status]++;
    return c;
  }, [pool]);
  const shown = pool.filter(l => l.status === tab);
  // Companies already used (pool files and earlier assignments), so the
  // department picks an existing one or types a new one that then joins the
  // Delivery History filter on its own.
  const companies = useMemo(() => {
    const seen = new Map<string, string>();
    for (const n of [...pool.map(l => l.carrier_name), ...dispatch.map(d => d.carrier_name)]) {
      const t = n?.trim();
      if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
    }
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
  }, [pool, dispatch]);

  // The driver's open load, if any — assigning another one switches to it.
  const current = useMemo(() => dispatch.find(d => d.driver_id === driverId && (d.status === 'assigned' || d.status === 'in_progress')), [dispatch, driverId]);

  const assign = async () => {
    if (isMockMode || !supabase) return;
    setError(''); setNotice('');
    if (!driverId) return setError('Choose the driver.');
    if (!loadId) return setError('Choose a load that is waiting for delivery.');
    const chosen = pool.find(x => x.id === loadId);
    const companyName = (company.trim() || chosen?.carrier_name?.trim() || '');
    if (!companyName) return setError('Enter the company this delivery is for.');
    // Reuse the spelling of a company that already exists.
    const known = companies.find(c => c.toLowerCase() === companyName.toLowerCase()) ?? companyName;
    setIsSaving(true);
    // One step on the server: whatever the driver has open is cancelled
    // (its load goes back to waiting) and the new load is assigned, or
    // nothing changes at all.
    const { error: err } = await supabase.rpc('assign_dispatch_load', {
      p_driver: driverId,
      p_carrier_load_id: loadId,
      p_trailer: trailer.trim().toUpperCase() || null,
      p_carrier_name: known,
    });
    setIsSaving(false);
    if (err) return setError(describeError(err, 'Could not assign the load.'));
    const l = pool.find(x => x.id === loadId);
    setNotice(`${l?.vrid ?? 'Load'} ${current ? `now replaces ${current.vrid ?? 'the earlier load'} for` : 'assigned to'} ${drivers.find(d => d.id === driverId)?.full_name ?? 'the driver'}.`);
    setLoadId(''); setTrailer(''); setCompany('');
    changed();
  };

  const cancel = async (dispatchId: string) => {
    if (isMockMode || !supabase) return;
    setBusyId(dispatchId);
    const { error: err } = await supabase.from('dispatch_loads').update({ status: 'cancelled' }).eq('id', dispatchId).eq('status', 'assigned');
    setBusyId(null);
    if (err) return setError(describeError(err, 'Could not cancel the assignment.'));
    changed();
  };

  const field = (label: string, node: ReactNode) => (
    <div className="input-group" style={{ minWidth: 0, margin: 0 }}>
      <span className="input-label">{label}</span>
      {node}
    </div>
  );

  const selectedLoad = pool.find(l => l.id === loadId);

  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '40px 16px', overflowY: 'auto' }} onClick={onClose}>
      <div className="modal-content glass-panel" style={{ width: '720px', maxWidth: '100%', minHeight: 'min(900px, calc(100vh - 32px))', padding: '24px', borderRadius: '16px', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex align-center justify-between mb-16">
          <div>
            <h3 className="text-md font-bold text-primary m-0">Loads &amp; assignment</h3>
            <p className="text-xs text-muted m-0 mt-4">Drop the carrier's load file, then assign a waiting load to a driver.</p>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--charcoal-light)' }}><X size={18} /></button>
        </div>

        {error && <div className="login-notice login-notice--error mb-16">{error}</div>}
        {notice && <div className="login-notice login-notice--success mb-16">{notice}</div>}

        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) importFile(f); }}
          style={{ border: `2px dashed ${isDragOver ? 'var(--brand-red)' : 'var(--border-color)'}`, borderRadius: '12px', padding: '18px', textAlign: 'center', background: isDragOver ? 'var(--brand-red-light)' : 'transparent', marginBottom: '20px' }}
        >
          <UploadCloud size={22} color={isDragOver ? '#CC0000' : '#94A3B8'} />
          <p className="text-sm font-bold text-primary m-0 mt-4">Drag &amp; drop the load file (.csv / .xlsx)</p>
          <p className="text-xs text-muted m-0">Needs a VRID column and a Status column (waiting / completed). Origin, destination, trailer and cutoff are read if present.</p>
          <label className="btn btn-secondary" style={{ cursor: 'pointer', display: 'inline-flex', marginTop: '10px' }}>
            {isReading ? 'Reading…' : 'Choose file'}
            <input type="file" accept=".csv,.xlsx,.xls" hidden disabled={isReading} onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} />
          </label>
        </div>

        <h4 className="font-bold text-xs text-muted mb-8" style={{ textTransform: 'uppercase', letterSpacing: '0.02em' }}>Assign a load</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px 16px', marginBottom: '12px' }}>
          {field('DRIVER', (
            <select className="select-field" style={{ width: '100%', boxSizing: 'border-box' }} value={driverId} onChange={(e) => setDriverId(e.target.value)}>
              <option value="">Select driver…</option>
              {drivers.filter(d => d.is_active).map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
            </select>
          ))}
          {field(`LOAD (${waitingLoads.length} WAITING FOR DELIVERY)`, (
            <select className="select-field" style={{ width: '100%', boxSizing: 'border-box' }} value={loadId} onChange={(e) => { setLoadId(e.target.value); setCompany(pool.find(x => x.id === e.target.value)?.carrier_name?.trim() ?? ''); }}>
              <option value="">{waitingLoads.length === 0 ? 'No waiting loads — import a file' : 'Select load…'}</option>
              {waitingLoads.map(l => <option key={l.id} value={l.id}>{l.vrid}{l.origin || l.destination ? ` — ${l.origin ?? '?'} → ${l.destination ?? '?'}` : ''}</option>)}
            </select>
          ))}
        </div>
        {current && (
          <p className="text-xs" style={{ margin: '0 0 12px', color: 'var(--brand-red)', fontWeight: 700 }}>
            {drivers.find(d => d.id === driverId)?.full_name ?? 'This driver'} already has <span className="font-mono">{current.vrid ?? 'a load'}</span> ({current.status === 'in_progress' ? 'in progress' : 'assigned'}). Assigning another load switches them to it and puts the earlier load back on the waiting list.
          </p>
        )}
        {selectedLoad && (
          <p className="text-xs text-muted" style={{ margin: '0 0 12px' }}>
            Pickup <strong>{selectedLoad.origin ?? '—'}</strong> · Dropoff <strong>{selectedLoad.destination ?? '—'}</strong> · Cutoff <strong>{when(selectedLoad.booking_cutoff_at)}</strong> · Trailer <strong>{selectedLoad.trailer_number ?? '—'}</strong>
          </p>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px 16px', alignItems: 'end' }}>
          {field('COMPANY (DELIVERING FOR)', (
            <>
              <input className="input-field" list="dispatch-companies" style={{ width: '100%', boxSizing: 'border-box' }} placeholder="e.g. Amazon, Katem" value={company} onChange={(e) => setCompany(e.target.value)} />
              <datalist id="dispatch-companies">{companies.map(c => <option key={c} value={c} />)}</datalist>
            </>
          ))}
          {field('TRAILER OVERRIDE (OPTIONAL)', <input className="input-field" style={{ width: '100%', boxSizing: 'border-box' }} placeholder={selectedLoad?.trailer_number ?? 'Use the trailer from the file'} value={trailer} onChange={(e) => setTrailer(e.target.value)} />)}
          <div style={{ gridColumn: '1 / -1' }}>
            <button type="button" className="btn" disabled={isSaving} style={{ backgroundColor: 'var(--brand-red)', color: '#fff', borderColor: 'var(--brand-red)', fontWeight: 700 }} onClick={assign}>
              {isSaving ? (current ? 'Switching…' : 'Assigning…') : (current ? 'Switch load' : 'Assign load')}
            </button>
          </div>
        </div>

        <h4 className="font-bold text-xs text-muted mt-24 mb-8" style={{ textTransform: 'uppercase', letterSpacing: '0.02em' }}>Load list</h4>
        <div className="telemetry-tabs" style={{ marginBottom: '8px' }}>
          {TABS.map(t => (
            <button key={t.key} type="button" className={`telemetry-tab ${tab === t.key ? 'telemetry-tab--active' : ''}`} onClick={() => setTab(t.key)}>
              {t.label}<span className="text-xs" style={{ fontWeight: 800, opacity: 0.7 }}>{counts[t.key]}</span>
            </button>
          ))}
        </div>
        <div className="table-container" style={{ overflowX: 'auto', maxWidth: '100%', maxHeight: 'max(320px, 42vh)', overflowY: 'auto' }}>
          <table className="data-table data-table--nowrap">
            <thead>
              <tr><th>VRID</th><th>Route</th><th>Cutoff</th><th>Trailer</th><th>Driver</th><th>Status</th>{tab === 'completed' && <th>Completion photos</th>}<th /></tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr><td colSpan={8} className="text-xs text-muted" style={{ padding: '16px' }}>Nothing here yet.</td></tr>
              ) : shown.map(l => {
                const d = driverByLoad.get(l.id);
                return (
                  <tr key={l.id}>
                    <td className="font-mono font-bold text-sm">{l.vrid}</td>
                    <td className="text-sm">{l.origin ?? '—'} → {l.destination ?? '—'}</td>
                    <td className="font-mono tabular-nums text-xs">{when(l.booking_cutoff_at)}</td>
                    <td className="font-mono text-sm">{l.trailer_number ?? '—'}</td>
                    <td>{d?.drivers?.full_name ?? '—'}</td>
                    <td><span className={`badge ${BADGE[l.status]}`}>{TABS.find(t => t.key === l.status)?.label}</span></td>
                    {tab === 'completed' && <td>{d ? <CompletionPhotos row={d} /> : <span className="text-xs text-muted">—</span>}</td>}
                    <td>
                      {l.status === 'assigned' && d && (
                        <button type="button" className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '11px' }} disabled={busyId === d.id} onClick={() => cancel(d.id)}>Cancel</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
