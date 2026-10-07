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
  /** the load's price (revenue) and where it came from */
  price: number | null;
  price_source: 'file' | 'manual' | null;
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

const gbp = (n: number | null | undefined) => (n == null ? '—' : `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export default function DispatchLoadsModal({ mode = 'assign', drivers, initialDriverId = '', onClose, onChanged, onOpenSettlement }: {
  /** 'assign' = pick a load for a driver; 'files' = Import Carrier (drop a file, see every load). */
  mode?: 'assign' | 'files';
  drivers: DriverOption[];
  initialDriverId?: string;
  onClose: () => void;
  onChanged?: () => void;
  /** Opens the carrier settlement (rates) import from the files view. */
  onOpenSettlement?: () => void;
}) {
  const [pool, setPool] = useState<PoolLoad[]>([]);
  const [dispatch, setDispatch] = useState<DispatchRow[]>([]);
  const [tab, setTab] = useState<PoolStatus>('waiting');
  const [driverId, setDriverId] = useState(initialDriverId);
  const [loadId, setLoadId] = useState('');
  const [trailer, setTrailer] = useState('');
  const [company, setCompany] = useState('');
  const [priceText, setPriceText] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (isMockMode || !supabase) return;
    const [p, d] = await Promise.all([
      supabase.from('carrier_loads').select('id, vrid, origin, destination, booking_cutoff_at, trailer_number, carrier_name, price, price_source, status').order('imported_at', { ascending: false }).limit(1000),
      supabase.from('dispatch_loads').select('id, driver_id, vrid, carrier_load_id, carrier_name, status, shipment_proofs(pod_type, photo_path), drivers(full_name)').not('carrier_load_id', 'is', null).in('status', ['assigned', 'in_progress', 'completed']).order('created_at', { ascending: false }).limit(1000),
    ]);
    if (p.error) return setError(describeError(p.error, 'Could not load the load list.'));
    setPool((p.data ?? []) as PoolLoad[]);
    setDispatch((d.data ?? []) as unknown as DispatchRow[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  const changed = () => { load(); onChanged?.(); };

  // ── Availability: the confirmed rota, approved holidays and who is clocked in ──
  const [rota, setRota] = useState<{ driver_id: string; work_date: string; day_off: boolean; start_time: string | null; end_time: string | null }[]>([]);
  const [holidays, setHolidays] = useState<{ driver_id: string; start_date: string; end_date: string }[]>([]);
  const [onShift, setOnShift] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (mode !== 'assign' || isMockMode || !supabase) return;
    const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const yesterday = ymd(new Date(Date.now() - 86_400_000));
    Promise.all([
      supabase.from('employee_rota').select('driver_id, work_date, day_off, start_time, end_time').eq('status', 'confirmed').gte('work_date', yesterday).limit(3000),
      supabase.from('employee_holidays').select('driver_id, start_date, end_date').eq('status', 'approved').gte('end_date', yesterday).limit(2000),
      supabase.from('shifts').select('driver_id').eq('status', 'active').is('end_time', null).limit(1000),
    ]).then(([r, h, sh]) => {
      setRota((r.data ?? []) as typeof rota);
      setHolidays((h.data ?? []) as typeof holidays);
      setOnShift(new Set(((sh.data ?? []) as { driver_id: string }[]).map(x => x.driver_id)));
    });
  }, [mode]);


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
      const r = data as { inserted: number; updated: number; skipped: number; priced?: number };
      const waiting = parsed.rows.filter(x => x.status === 'waiting').length;
      const skipped = r.skipped + parsed.skipped;
      setNotice(`${file.name}: ${r.inserted} new, ${r.updated} updated${skipped ? `, ${skipped} skipped` : ''} — ${waiting} waiting for delivery, ${parsed.rows.length - waiting} already completed. ${parsed.priceColumn ? `Prices read from the “${parsed.priceColumn}” column for ${r.priced ?? 0} load${r.priced === 1 ? '' : 's'}.` : 'No price column found in the file: prices can be added by hand.'}`);
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
  const attachedLoads = useMemo(() => pool.filter(l => l.status === 'assigned' || l.status === 'in_progress'), [pool]);
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

  // Saves a typed-in price on the load (kept even if a later file has another one).
  const savePrice = async (loadIdToPrice: string, text: string): Promise<boolean> => {
    if (isMockMode || !supabase) return false;
    const t = text.replace(/[£,\s]/g, '');
    if (t === '') {
      const { error: e } = await supabase.from('carrier_loads').update({ price: null, price_source: null }).eq('id', loadIdToPrice);
      if (e) { setError(describeError(e, 'Could not clear the price.')); return false; }
    } else {
      const n = Number(t);
      if (!Number.isFinite(n) || n < 0) { setError('Enter the price as a number, for example 250 or 1250.50.'); return false; }
      const { error: e } = await supabase.from('carrier_loads').update({ price: Math.round(n * 100) / 100, price_source: 'manual' }).eq('id', loadIdToPrice);
      if (e) { setError(describeError(e, 'Could not save the price.')); return false; }
    }
    changed();
    return true;
  };

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
    // A price typed in here is saved on the load before it is assigned (the driver's load takes it over).
    const typed = priceText.replace(/[£,\s]/g, '');
    const existing = chosen?.price == null ? '' : String(chosen.price);
    if (chosen && typed !== existing && !(await savePrice(chosen.id, priceText))) { setIsSaving(false); return; }
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
    setLoadId(''); setTrailer(''); setCompany(''); setPriceText('');
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

  // How well each driver fits the chosen load (or today, until a load is chosen):
  // rostered for that day and covering the cut-off time is the best; on holiday the worst.
  const ranked = useMemo(() => {
    const when = selectedLoad?.booking_cutoff_at ? new Date(selectedLoad.booking_cutoff_at) : new Date();
    const ymd = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}`;
    const mins = when.getHours() * 60 + when.getMinutes();
    const hm = (t: string | null) => (t ? t.slice(0, 5) : '');
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    const dayLabel = when.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    return drivers.filter(d => d.is_active).map(d => {
      const open = dispatch.find(x => x.driver_id === d.id && (x.status === 'assigned' || x.status === 'in_progress'));
      const hol = holidays.find(h => h.driver_id === d.id && h.start_date <= ymd && h.end_date >= ymd);
      const day = rota.find(r => r.driver_id === d.id && r.work_date === ymd);
      let score: number; let label: string; let detail: string; let tone: 'good' | 'warn' | 'bad';
      if (hol) {
        score = 0; label = 'On holiday'; tone = 'bad';
        detail = `Away until ${new Date(`${hol.end_date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`;
      } else if (day && !day.day_off && day.start_time && day.end_time) {
        const s0 = toMin(day.start_time); const e0 = toMin(day.end_time);
        const covers = !selectedLoad?.booking_cutoff_at || (e0 > s0 ? mins >= s0 && mins <= e0 : mins >= s0 || mins <= e0);
        score = covers ? 100 : 55; tone = covers ? 'good' : 'warn';
        label = covers ? 'Rostered' : 'Outside rota hours';
        detail = `${dayLabel}: ${hm(day.start_time)}–${hm(day.end_time)}${covers ? '' : ', the cut-off is outside these hours'}`;
      } else if (day?.day_off) {
        score = 25; label = 'Day off'; tone = 'bad'; detail = `${dayLabel}: marked as a day off`;
      } else {
        score = 40; label = 'No rota'; tone = 'warn'; detail = `No confirmed rota for ${dayLabel}`;
      }
      if (onShift.has(d.id) && score > 0) { score += 8; detail += ' · clocked in now'; }
      if (open && score > 0) { score -= 20; detail += ` · already has ${open.vrid ?? 'a load'}`; }
      return { driver: d, score, label, detail, tone };
    }).sort((a, b) => b.score - a.score || a.driver.full_name.localeCompare(b.driver.full_name));
  }, [drivers, dispatch, rota, holidays, onShift, selectedLoad]);

  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '40px 16px', overflowY: 'auto' }} onClick={onClose}>
      <div className="modal-content glass-panel" style={{ width: mode === 'assign' ? '640px' : '860px', maxWidth: '100%', minHeight: mode === 'files' ? 'min(900px, calc(100vh - 32px))' : undefined, padding: '24px', borderRadius: '16px', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex align-center justify-between mb-16">
          <div>
            <h3 className="text-md font-bold text-primary m-0">{mode === 'files' ? 'Import Carrier' : `Assign a load${drivers.find(d => d.id === driverId) ? ` to ${drivers.find(d => d.id === driverId)!.full_name}` : ''}`}</h3>
            <p className="text-xs text-muted m-0 mt-4">{mode === 'files' ? "Drop the carrier's load file. Every load, and where it is now, is listed below." : 'Choose one of the loads that are available. Loads already attached to a driver and not yet delivered are shown underneath.'}</p>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--charcoal-light)' }}><X size={18} /></button>
        </div>

        {error && <div className="login-notice login-notice--error mb-16">{error}</div>}
        {notice && <div className="login-notice login-notice--success mb-16">{notice}</div>}

        {mode === 'files' && (
          <>
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

        {onOpenSettlement && (
          <p className="text-xs text-muted" style={{ margin: '-8px 0 18px' }}>
            Need to import a carrier settlement with rates instead? <button type="button" className="comp-edit-btn" onClick={onOpenSettlement}>Open settlement import</button>
          </p>
        )}
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
              <tr><th>VRID</th><th>Route</th><th>Cutoff</th><th>Trailer</th><th>Price</th><th>Driver</th><th>Status</th>{tab === 'completed' && <th>Completion photos</th>}<th /></tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr><td colSpan={9} className="text-xs text-muted" style={{ padding: '16px' }}>Nothing here yet.</td></tr>
              ) : shown.map(l => {
                const d = driverByLoad.get(l.id);
                return (
                  <tr key={l.id}>
                    <td className="font-mono font-bold text-sm">{l.vrid}</td>
                    <td className="text-sm">{l.origin ?? '—'} → {l.destination ?? '—'}</td>
                    <td className="font-mono tabular-nums text-xs">{when(l.booking_cutoff_at)}</td>
                    <td className="font-mono text-sm">{l.trailer_number ?? '—'}</td>
                    <td>
                      <input
                        key={`${l.id}-${l.price ?? ''}`}
                        className="input-field"
                        inputMode="decimal"
                        style={{ width: '92px', padding: '4px 8px', fontSize: '12px' }}
                        defaultValue={l.price == null ? '' : l.price.toFixed(2)}
                        placeholder="£ price"
                        title={l.price_source === 'file' ? 'Read from the carrier file. Type a new price to change it.' : l.price_source === 'manual' ? 'Entered by hand' : 'No price yet: type one'}
                        onBlur={(e) => { const v = e.target.value; if (v.replace(/[£,\s]/g, '') !== (l.price == null ? '' : l.price.toFixed(2))) savePrice(l.id, v); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      />
                      {l.price_source && <span className="text-xs text-muted" style={{ display: 'block', marginTop: '2px' }}>{l.price_source === 'file' ? 'from file' : 'by hand'}</span>}
                    </td>
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
          </>
        )}
        {mode === 'assign' && (
          <>
        {/* ── Assign: the available loads, then the ones already attached ── */}
        <h4 className="font-bold text-xs text-muted mb-8" style={{ textTransform: 'uppercase', letterSpacing: '0.02em' }}>
          Driver {selectedLoad ? `· best match for ${selectedLoad.vrid} first` : '· availability today (pick a load to rank for it)'}
        </h4>
        <div className="dl-list" style={{ marginBottom: '16px' }}>
          {ranked.length === 0 ? (
            <p className="text-xs text-muted m-0" style={{ padding: '12px' }}>No active employees.</p>
          ) : ranked.map((r, i) => (
            <button key={r.driver.id} type="button" className={`dl-card ${driverId === r.driver.id ? 'dl-card--on' : ''}`} onClick={() => setDriverId(r.driver.id)}>
              <span className="dl-card-top">
                <span className="font-bold text-sm">{r.driver.full_name}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {i === 0 && r.tone === 'good' && <span className="badge badge-success">Best match</span>}
                  <span className={`badge ${r.tone === 'good' ? 'badge-success' : r.tone === 'warn' ? 'badge-warning' : 'badge-danger'}`}>{r.label}</span>
                </span>
              </span>
              <span className="text-xs text-muted">{r.detail}</span>
            </button>
          ))}
        </div>

        <h4 className="font-bold text-xs text-muted mb-8" style={{ textTransform: 'uppercase', letterSpacing: '0.02em' }}>Available loads ({waitingLoads.length})</h4>
        <div className="dl-list">
          {waitingLoads.length === 0 ? (
            <p className="text-xs text-muted m-0" style={{ padding: '12px' }}>No loads are waiting. Use Import Carrier to add some.</p>
          ) : waitingLoads.map(l => (
            <button key={l.id} type="button" className={`dl-card ${loadId === l.id ? 'dl-card--on' : ''}`} onClick={() => { setLoadId(l.id); setCompany(l.carrier_name?.trim() ?? ''); setPriceText(l.price == null ? '' : String(l.price)); }}>
              <span className="dl-card-top"><span className="font-mono font-bold text-sm">{l.vrid}</span><span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>{l.price != null && <strong className="text-sm">{gbp(l.price)}</strong>}<span className="badge badge-warning">Available</span></span></span>
              <span className="text-sm">{l.origin ?? '—'} → {l.destination ?? '—'}</span>
              <span className="text-xs text-muted">Cut-off {when(l.booking_cutoff_at)} · Trailer {l.trailer_number ?? '—'}{l.carrier_name ? ` · ${l.carrier_name}` : ''}</span>
            </button>
          ))}
        </div>

        <h4 className="font-bold text-xs text-muted mt-16 mb-8" style={{ textTransform: 'uppercase', letterSpacing: '0.02em' }}>Attached, not yet delivered ({attachedLoads.length})</h4>
        <div className="dl-list">
          {attachedLoads.length === 0 ? (
            <p className="text-xs text-muted m-0" style={{ padding: '12px' }}>Nothing is attached to a driver right now.</p>
          ) : attachedLoads.map(l => {
            const d = driverByLoad.get(l.id);
            return (
              <div key={l.id} className="dl-card dl-card--static">
                <span className="dl-card-top"><span className="font-mono font-bold text-sm">{l.vrid}</span><span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>{l.price != null && <strong className="text-sm">{gbp(l.price)}</strong>}<span className={`badge ${BADGE[l.status]}`}>{TABS.find(t => t.key === l.status)?.label}</span></span></span>
                <span className="text-sm">{l.origin ?? '—'} → {l.destination ?? '—'}</span>
                <span className="text-xs text-muted" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  Driver <strong>{d?.drivers?.full_name ?? '—'}</strong> · Cut-off {when(l.booking_cutoff_at)}
                  {l.status === 'assigned' && d && (
                    <button type="button" className="btn btn-secondary" style={{ padding: '3px 10px', fontSize: '11px', marginLeft: 'auto' }} disabled={busyId === d.id} onClick={() => cancel(d.id)}>Cancel</button>
                  )}
                </span>
              </div>
            );
          })}
        </div>

        {selectedLoad && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px 16px', alignItems: 'end', marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--border-color)' }}>
            {field('COMPANY (DELIVERING FOR)', (
              <>
                <input className="input-field" list="dispatch-companies" style={{ width: '100%', boxSizing: 'border-box' }} placeholder="e.g. Amazon, Katem" value={company} onChange={(e) => setCompany(e.target.value)} />
                <datalist id="dispatch-companies">{companies.map(c => <option key={c} value={c} />)}</datalist>
              </>
            ))}
            {field('TRAILER OVERRIDE (OPTIONAL)', <input className="input-field" style={{ width: '100%', boxSizing: 'border-box' }} placeholder={selectedLoad.trailer_number ?? 'Use the trailer from the file'} value={trailer} onChange={(e) => setTrailer(e.target.value)} />)}
            {field(`PRICE (£)${selectedLoad.price_source === 'file' && priceText === String(selectedLoad.price) ? ' — FROM THE FILE' : ''}`, <input className="input-field" inputMode="decimal" style={{ width: '100%', boxSizing: 'border-box' }} placeholder="Optional, e.g. 250.00" value={priceText} onChange={(e) => setPriceText(e.target.value)} />)}
            <div style={{ gridColumn: '1 / -1' }}>
              <button type="button" className="btn" disabled={isSaving || !driverId} style={{ backgroundColor: 'var(--brand-red)', color: '#fff', borderColor: 'var(--brand-red)', fontWeight: 700 }} onClick={assign}>
                {isSaving ? (current ? 'Switching…' : 'Assigning…') : `${current ? 'Switch to' : 'Assign'} ${selectedLoad.vrid}`}
              </button>
              {!driverId && <span className="text-xs text-muted" style={{ marginLeft: '10px' }}>Choose the driver first.</span>}
            </div>
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}
