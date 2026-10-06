import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import L from 'leaflet';
import { Download, Printer, MapPin, Route, Navigation, Hourglass, OctagonX, SignalZero, Timer, ChevronDown, ChevronUp, UserRound, Container, Truck } from 'lucide-react';
import { EarningsDateRangePicker } from '../components/ui/earnings-date-range-picker';
import { supabase, isMockMode } from '../App';
import NoData from '../components/ui/no-data';
import { driverPinHtml, trailerPinHtml, escapeHtml, DRIVER_PIN_SIZE, DRIVER_PIN_ANCHOR, TRAILER_PIN_SIZE, TRAILER_PIN_ANCHOR } from '../lib/map-pins';
import {
  buildJourney, summarise, formatDuration, haversineM, LABEL_META, DEFAULT_JOURNEY_OPTIONS,
  type Ping, type Segment, type JourneyLabel,
} from '../lib/journey';

import { drawJourney } from '../lib/journey-map';
// Journey History: the full GPS trail of one shift, from clock-in, with
// every stretch labelled Moving / Stationary / Stopped / No signal. The
// pings are kept in the database, so a journey can be opened months later
// to show, for example, that a driver sat parked for four hours.

interface ShiftRow {
  id: string;
  driver_id: string;
  driver_name?: string;
  start_time: string;
  end_time?: string | null;
  status?: string | null;
  start_lat?: number | null;
  start_lng?: number | null;
  vehicle_number?: string | null;
  trailer_number?: string | null;
}
interface EmployeeRow { id: string; full_name: string }
interface DepotRow { id: string; name: string; latitude: number; longitude: number; geofence_radius_m: number }

interface Props {
  /** Rendered inside the Live Map page: the page already has its own title. */
  embedded?: boolean;
  shifts: ShiftRow[];
  employees: EmployeeRow[];
  depots: DepotRow[];
}

const toUtcMs = (ts: string): number => {
  const str = ts.trim();
  return new Date(str.endsWith('Z') || /[+-]\d\d(:?\d\d)?$/.test(str) ? str : `${str.replace(' ', 'T')}Z`).getTime();
};
const hm = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const dayKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v: string) => v.replace(/[&<>"']/g, c => ESC[c]);

export default function JourneyHistory({ embedded = false, shifts, employees, depots }: Props) {
  const [driverId, setDriverId] = useState('');
  // Same range calendar as the Compensation Summary date range.
  const [rangeStart, setRangeStart] = useState(() => dayKey(Date.now()));
  const [rangeEnd, setRangeEnd] = useState(() => dayKey(Date.now()));
  const [overlayOpen, setOverlayOpen] = useState(true);
  const [shiftId, setShiftId] = useState('');
  const [stoppedMinutes, setStoppedMinutes] = useState(DEFAULT_JOURNEY_OPTIONS.stoppedMinutes);
  const [pings, setPings] = useState<Ping[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  // Shifts that started on the chosen day, for the chosen driver.
  const dayShifts = useMemo(
    () => shifts
      .filter(s => {
        if (s.driver_id !== driverId) return false;
        const k = dayKey(toUtcMs(s.start_time));
        const to = rangeEnd || rangeStart || '9999-12-31';
        return (!rangeStart || k >= rangeStart) && k <= to;
      })
      .sort((a, b) => toUtcMs(a.start_time) - toUtcMs(b.start_time)),
    [shifts, driverId, rangeStart, rangeEnd],
  );

  // Pick the latest shift of the day automatically.
  useEffect(() => {
    setShiftId(dayShifts.length ? dayShifts[dayShifts.length - 1].id : '');
    setSelected(null);
  }, [dayShifts]);

  const shift = dayShifts.find(s => s.id === shiftId) ?? null;
  const live = !!shift && !shift.end_time && shift.status !== 'completed';

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, [live]);

  // Load the shift's pings (paged — a long shift can pass 1000 rows).
  useEffect(() => {
    setPings([]);
    setError('');
    if (!shift || isMockMode || !supabase) return;
    let cancelled = false;
    const fetchAll = async () => {
      setLoading(true);
      const all: Ping[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error: err } = await supabase!
          .from('gps_locations')
          .select('latitude, longitude, speed, recorded_at')
          .eq('shift_id', shift.id)
          .order('recorded_at', { ascending: true })
          .range(from, from + 999);
        if (err) { if (!cancelled) setError(err.message); break; }
        for (const r of data ?? []) {
          if (r.latitude == null || r.longitude == null) continue;
          all.push({ lat: Number(r.latitude), lng: Number(r.longitude), speed: r.speed == null ? null : Number(r.speed), t: toUtcMs(r.recorded_at) });
        }
        if (!data || data.length < 1000) break;
      }
      if (!cancelled) { setPings(all); setLoading(false); }
    };
    fetchAll();
    return () => { cancelled = true; };
    // `now` re-fetches a live shift every minute
  }, [shift?.id, live ? now : 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const startMs = shift ? toUtcMs(shift.start_time) : 0;
  const endMs = shift ? (shift.end_time ? toUtcMs(shift.end_time) : now) : 0;

  const segments: Segment[] = useMemo(() => {
    if (!shift) return [];
    // The journey begins at clock-in: seed it with the clock-in position.
    const seeded: Ping[] = [...pings];
    if (shift.start_lat != null && shift.start_lng != null && (pings.length === 0 || pings[0].t > startMs)) {
      seeded.unshift({ lat: Number(shift.start_lat), lng: Number(shift.start_lng), speed: 0, t: startMs });
    }
    return buildJourney(seeded, Math.max(endMs, seeded.length ? seeded[seeded.length - 1].t : endMs), { ...DEFAULT_JOURNEY_OPTIONS, stoppedMinutes });
  }, [pings, shift, startMs, endMs, stoppedMinutes]);

  const summary = useMemo(() => summarise(segments), [segments]);

  const placeOf = (pt: { lat: number; lng: number }): string => {
    let best: DepotRow | null = null;
    let bestD = Infinity;
    for (const d of depots) {
      const dist = haversineM(pt, { lat: d.latitude, lng: d.longitude });
      if (dist <= Math.max(d.geofence_radius_m, 150) && dist < bestD) { best = d; bestD = dist; }
    }
    return best ? `At depot: ${best.name}` : `${pt.lat.toFixed(5)}, ${pt.lng.toFixed(5)}`;
  };

  // ── Map ───────────────────────────────────────────────────
  const hasShift = !!shift;
  useEffect(() => {
    if (!hasShift || !mapEl.current) return;
    if (!mapRef.current) {
      mapRef.current = L.map(mapEl.current, { maxZoom: 20 }).setView([53.516, -1.088], 9);
      mapRef.current.attributionControl.setPrefix(false);
      L.maplibreGL({ style: 'https://tiles.openfreemap.org/styles/liberty' }).addTo(mapRef.current);
      layerRef.current = L.layerGroup().addTo(mapRef.current);
    }
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [hasShift]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const bounds = drawJourney(layer, segments, { selected, onSelect: setSelected });
    // Where the journey ends (or the driver is now): their 3D avatar, and the coupled trailer.
    const lastSeg = segments[segments.length - 1];
    const end = lastSeg?.path[lastSeg.path.length - 1];
    if (end) {
      const who = employees.find(e => e.id === driverId)?.full_name ?? shift?.driver_name ?? 'Driver';
      const unit = shift?.vehicle_number ? escapeHtml(String(shift.vehicle_number)) : null;
      L.marker([end.lat, end.lng], {
        icon: L.divIcon({ className: '', html: driverPinHtml({ name: who, state: shift?.end_time ? 'still' : 'live', label: unit }), iconSize: DRIVER_PIN_SIZE, iconAnchor: DRIVER_PIN_ANCHOR }),
        zIndexOffset: 500,
      }).addTo(layer).bindTooltip(who, { direction: 'top', offset: [0, -44] });
      if (shift?.trailer_number) {
        L.marker([end.lat - 0.00018, end.lng + 0.00028], {
          icon: L.divIcon({ className: '', html: trailerPinHtml(String(shift.trailer_number)), iconSize: TRAILER_PIN_SIZE, iconAnchor: TRAILER_PIN_ANCHOR }),
          zIndexOffset: 400,
        }).addTo(layer);
      }
    }
    if (selected !== null && segments[selected]) {
      const sg = segments[selected];
      map.fitBounds(L.latLngBounds(sg.path.map(p => [p.lat, p.lng] as [number, number])).pad(0.6), { maxZoom: 16 });
    } else if (bounds.length) {
      map.fitBounds(L.latLngBounds(bounds).pad(0.15), { maxZoom: 15 });
    }
  }, [segments, selected, hasShift]);

  // ── Export ────────────────────────────────────────────────
  const reportRows = segments.map(s => ({
    label: LABEL_META[s.label].text,
    from: new Date(s.start).toLocaleString('en-GB'),
    to: new Date(s.end).toLocaleString('en-GB'),
    duration: formatDuration(s.durationMs),
    place: s.label === 'moving' || s.label === 'no_signal' ? `${placeOf(s.from)} to ${placeOf(s.to)}` : placeOf(s.from),
    km: s.label === 'moving' ? (s.distanceM / 1000).toFixed(1) : '',
  }));
  const driverName = employees.find(e => e.id === driverId)?.full_name ?? shift?.driver_name ?? '';

  const exportCsv = () => {
    const header = ['Status', 'From', 'To', 'Duration', 'Place', 'Distance km'];
    const lines = [header, ...reportRows.map(r => [r.label, r.from, r.to, r.duration, r.place, r.km])]
      .map(cols => cols.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `journey_${driverName.replace(/\s+/g, '_')}_${dayKey(startMs)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const printReport = () => {
    const w = window.open('', '_blank', 'width=900,height=1000');
    if (!w || !shift) return;
    const tile = (label: string, v: string) => `<td><div class="k">${label}</div><div class="v">${esc(v)}</div></td>`;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Journey ${esc(driverName)} ${esc(dayKey(startMs))}</title>
<style>body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:36px;font-size:13px}h1{font-size:19px;margin:0 0 4px}.sub{color:#666;margin-bottom:20px}
table.sum{border-collapse:collapse;width:100%;margin-bottom:22px}table.sum td{border:1px solid #ddd;padding:10px 12px}.k{font-size:10px;text-transform:uppercase;color:#666;letter-spacing:.4px}.v{font-size:17px;font-weight:700;margin-top:3px}
table.t{border-collapse:collapse;width:100%}table.t th,table.t td{border-bottom:1px solid #e3e3e3;padding:7px 6px;text-align:left;vertical-align:top}table.t th{font-size:10px;text-transform:uppercase;color:#666}
.b{display:inline-block;padding:2px 8px;border-radius:999px;font-weight:700;font-size:11px;color:#fff}.foot{margin-top:18px;color:#777;font-size:11px}</style></head><body>
<h1>Journey history: ${esc(driverName)}</h1>
<div class="sub">Clocked in ${esc(new Date(startMs).toLocaleString('en-GB'))}${shift.end_time ? `, clocked out ${esc(new Date(endMs).toLocaleString('en-GB'))}` : ', still on shift'}${shift.vehicle_number ? ` &middot; tractor ${esc(shift.vehicle_number)}` : ''}${shift.trailer_number ? ` &middot; trailer ${esc(shift.trailer_number)}` : ''}</div>
<table class="sum"><tr>${tile('Moving', formatDuration(summary.movingMs))}${tile('Stationary', formatDuration(summary.stationaryMs))}${tile('Stopped', formatDuration(summary.stoppedMs))}${tile('No signal', formatDuration(summary.noSignalMs))}${tile('Distance', `${(summary.distanceM / 1000).toFixed(1)} km`)}</tr></table>
<table class="t"><thead><tr><th>Status</th><th>From</th><th>To</th><th>Duration</th><th>Place</th></tr></thead><tbody>
${segments.map((s, i) => `<tr><td><span class="b" style="background:${LABEL_META[s.label].color}">${LABEL_META[s.label].text}</span></td><td>${esc(reportRows[i].from)}</td><td>${esc(reportRows[i].to)}</td><td>${esc(reportRows[i].duration)}</td><td>${esc(reportRows[i].place)}</td></tr>`).join('')}
</tbody></table>
<div class="foot">Stopped means parked for ${stoppedMinutes} minutes or longer. Stationary is a shorter pause. No signal means the phone sent no GPS for more than ${DEFAULT_JOURNEY_OPTIONS.maxGapMinutes} minutes. Source: GPS pings recorded by the Tachyo driver app.</div>
<script>window.onload=function(){setTimeout(function(){window.print();},300);};</script></body></html>`);
    w.document.close();
  };

  const stats: { label: string; value: string; color: string; icon: ReactNode }[] = [
    { label: 'Moving', value: formatDuration(summary.movingMs), color: LABEL_META.moving.color, icon: <Navigation size={15} /> },
    { label: 'Stationary', value: formatDuration(summary.stationaryMs), color: LABEL_META.stationary.color, icon: <Hourglass size={15} /> },
    { label: 'Stopped', value: formatDuration(summary.stoppedMs), color: LABEL_META.stopped.color, icon: <OctagonX size={15} /> },
    { label: 'No signal', value: formatDuration(summary.noSignalMs), color: LABEL_META.no_signal.color, icon: <SignalZero size={15} /> },
    { label: 'Distance', value: `${(summary.distanceM / 1000).toFixed(1)} km`, color: '#333333', icon: <Route size={15} /> },
    { label: 'Longest stop', value: summary.longestStopMs ? formatDuration(summary.longestStopMs) : '-', color: '#333333', icon: <Timer size={15} /> },
  ];

  const drivers = useMemo(() => [...employees].sort((a, b) => a.full_name.localeCompare(b.full_name)), [employees]);

  return (
    <div className="flex-1" style={{ minWidth: 0 }}>
      <div className="flex align-center justify-between mb-16" style={{ flexWrap: 'wrap', gap: '12px' }}>
        {embedded ? (
          <p className="text-xs text-muted m-0">The full GPS trail of a shift from clock-in, with every stretch labelled. Kept so you can come back to it.</p>
        ) : (
          <div>
            <h2 className="text-xl font-black text-primary m-0">JOURNEY HISTORY</h2>
            <p className="text-xs text-muted m-0 mt-4">The full GPS trail of a shift from clock-in, with every stretch labelled. Kept so you can come back to it.</p>
          </div>
        )}
        <div className="flex" style={{ gap: '8px' }}>
          <button type="button" className="btn btn-secondary flex align-center" style={{ gap: '6px' }} disabled={segments.length === 0} onClick={exportCsv}><Download size={14} /> Export CSV</button>
          <button type="button" className="btn btn-secondary flex align-center" style={{ gap: '6px' }} disabled={segments.length === 0} onClick={printReport}><Printer size={14} /> Print report</button>
        </div>
      </div>

      <div className="glass-card" style={{ padding: '14px 16px', marginBottom: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="input-group" style={{ margin: 0, minWidth: '220px', flex: '1 1 220px' }}>
          <label className="input-label" htmlFor="jh-driver">DRIVER</label>
          <select id="jh-driver" className="input-field" value={driverId} onChange={e => setDriverId(e.target.value)}>
            <option value="">Choose a driver</option>
            {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
          </select>
        </div>
        <div className="input-group" style={{ margin: 0, minWidth: '250px' }}>
          <label className="input-label">DATE RANGE</label>
          <EarningsDateRangePicker
            startDate={rangeStart}
            endDate={rangeEnd}
            onChange={(start, end) => { setRangeStart(start); setRangeEnd(end); }}
          />
        </div>
        <div className="input-group" style={{ margin: 0, minWidth: '200px' }}>
          <label className="input-label" htmlFor="jh-shift">SHIFT</label>
          <select id="jh-shift" className="input-field" value={shiftId} disabled={dayShifts.length === 0} onChange={e => { setShiftId(e.target.value); setSelected(null); }}>
            {dayShifts.length === 0 && <option value="">No shift in this range</option>}
            {dayShifts.map(s => (
              <option key={s.id} value={s.id}>{new Date(toUtcMs(s.start_time)).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}, {hm(toUtcMs(s.start_time))} to {s.end_time ? hm(toUtcMs(s.end_time)) : 'now (live)'}</option>
            ))}
          </select>
        </div>
        <div className="input-group" style={{ margin: 0 }}>
          <label className="input-label" htmlFor="jh-stopped">STOPPED AFTER</label>
          <select id="jh-stopped" className="input-field" value={stoppedMinutes} onChange={e => setStoppedMinutes(Number(e.target.value))}>
            {[10, 15, 30, 60].map(m => <option key={m} value={m}>{m} minutes still</option>)}
          </select>
        </div>
      </div>

      {error && <div className="login-notice login-notice--error mb-16">{error}</div>}

      {!shift ? (
        <div className="glass-card">
          <NoData />
        </div>
      ) : (
        <>
          <div className="jh-split">
            <div className="map-shell" style={{ height: '100%', minHeight: '520px' }}>
              <div ref={mapEl} className="h-full w-full" />
              {loading && <div className="map-refresh-btn" style={{ pointerEvents: 'none' }}>Loading journey</div>}

              {/* Journey summary on the map: icons for every stretch type, distance and longest stop */}
              <div className="jh-overlay">
                <button type="button" className="jh-overlay-head" onClick={() => setOverlayOpen(o => !o)} aria-expanded={overlayOpen}>
                  <span className="jh-overlay-avatar"><UserRound size={16} /></span>
                  <span className="jh-overlay-title">
                    <strong>{driverName || 'Driver'}</strong>
                    <span>
                      {new Date(startMs).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}, {hm(startMs)} to {shift?.end_time ? hm(endMs) : 'now'}
                    </span>
                  </span>
                  {overlayOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
                {overlayOpen && (
                  <>
                    <div className="jh-overlay-units">
                      <span><Truck size={12} /> {shift?.vehicle_number ?? 'No tractor'}</span>
                      <span><Container size={12} /> {shift?.trailer_number ?? 'No trailer'}</span>
                    </div>
                    <div className="jh-overlay-grid">
                      {stats.map(t => (
                        <div key={t.label} className="jh-stat" title={t.label}>
                          <span className="jh-stat-icon" style={{ color: t.color, background: `${t.color}1A` }}>{t.icon}</span>
                          <span className="jh-stat-text">
                            <span className="jh-stat-label">{t.label}</span>
                            <strong>{t.value}</strong>
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="tp-card" style={{ minHeight: 0 }}>
              <div className="tp-header">
                <span className="tp-header-icon"><Route size={14} /></span>
                <h3 className="tp-title">Timeline</h3>
                <span className="text-xs text-muted">{live ? 'Live' : 'Complete'}</span>
              </div>
              <div className="tp-list">
                {segments.length === 0 ? (
                  <div className="tp-empty">
                    <MapPin size={22} />
                    <strong>No GPS recorded</strong>
                    <span>{loading ? 'Loading.' : 'This shift has no GPS pings.'}</span>
                  </div>
                ) : segments.map((s, i) => {
                  const meta = LABEL_META[s.label as JourneyLabel];
                  return (
                    <button key={i} type="button" className="tp-driver" style={selected === i ? { borderColor: meta.color } : undefined} onClick={() => setSelected(selected === i ? null : i)}>
                      <div className="tp-driver-top">
                        <span className="tp-badge" style={{ color: meta.color, background: `${meta.color}1F` }}>{meta.text}</span>
                        <div className="tp-driver-name">
                          <strong className="tp-mono" style={{ fontSize: '12.5px' }}>{hm(s.start)} to {hm(s.end)}</strong>
                          <span>{formatDuration(s.durationMs)}{s.label === 'moving' ? ` · ${(s.distanceM / 1000).toFixed(1)} km` : ''}</span>
                        </div>
                      </div>
                      <div className="tp-driver-foot" style={{ marginTop: '10px', paddingTop: '8px' }}>
                        <span className="tp-coords" style={{ fontSize: '11.5px' }}>
                          {s.label === 'moving' || s.label === 'no_signal' ? `${placeOf(s.from)} to ${placeOf(s.to)}` : placeOf(s.from)}
                        </span>
                        <a
                          className="tp-link"
                          href={`https://www.google.com/maps/search/?api=1&query=${s.from.lat},${s.from.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                        >
                          Maps
                        </a>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
