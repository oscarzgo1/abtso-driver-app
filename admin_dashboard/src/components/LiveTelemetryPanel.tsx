import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, Clock, Gauge, MapPinned, Radio, RefreshCw, Search, SignalZero, Truck, Container } from 'lucide-react';

// Live Map -> Telemetry status. Sits in the right-hand column beside the map.
// Every driver is a card with a pulsing status ring (the ring pattern comes
// from the 21st.dev "Pulse Loader" / "Tracker Card" components, rebuilt here
// with framer-motion + our own theme tokens), plus the same information the
// old telemetry table carried: last ping location, speed, status, active
// load and timestamp, with the assigned tractor and trailer added.

export type TelemetryStatus = 'moving' | 'stationary' | 'idle' | 'no_signal' | 'offline';

interface LiveLoc {
  driver_id: string;
  driver_name: string;
  driver_code: string;
  latitude: number;
  longitude: number;
  speed_mph: number;
  last_ping: string;
  status: 'moving' | 'stationary' | 'idle';
}

interface Employee { id: string; full_name: string; driver_id?: string | null }

interface ActiveShift {
  driver_id?: string | null;
  end_time?: string | null;
  status?: string | null;
  vehicle_number?: string | null;
  trailer_number?: string | null;
  load_reference?: string | null;
}

interface Depot { id: string; name: string; latitude: number; longitude: number }

interface Row {
  driver_id: string;
  driver_name: string;
  latitude: number | null;
  longitude: number | null;
  speed_mph: number | null;
  status: TelemetryStatus;
  last_ping: string | null;
  vehicle: string | null;
  trailer: string | null;
  load: string | null;
  onShift: boolean;
}

const STATUS_META: Record<TelemetryStatus, { label: string; color: string; soft: string; pulse: boolean }> = {
  moving: { label: 'Moving', color: '#16A34A', soft: 'rgba(22,163,74,0.12)', pulse: true },
  stationary: { label: 'Stationary', color: '#D97706', soft: 'rgba(217,119,6,0.12)', pulse: false },
  idle: { label: 'Idle', color: '#DC2626', soft: 'rgba(220,38,38,0.12)', pulse: true },
  no_signal: { label: 'No GPS signal', color: '#7C2D12', soft: 'rgba(124,45,18,0.14)', pulse: true },
  offline: { label: 'Off shift', color: '#94A3B8', soft: 'rgba(148,163,184,0.16)', pulse: false },
};

const SUMMARY_ORDER: TelemetryStatus[] = ['moving', 'stationary', 'idle', 'no_signal'];

function ago(iso: string | null, now: number): string {
  if (!iso) return 'No data';
  const t = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso.replace(' ', 'T')}Z`).getTime();
  if (!Number.isFinite(t)) return 'No data';
  const mins = Math.max(0, Math.round((now - t) / 60000));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h}h ${String(mins % 60).padStart(2, '0')}m ago` : `${Math.floor(h / 24)}d ago`;
}

/** Concentric rings that expand and fade around the status dot. */
function PulseDot({ status, size = 12 }: { status: TelemetryStatus; size?: number }) {
  const meta = STATUS_META[status];
  return (
    <span className="tp-pulse" style={{ width: size * 2.4, height: size * 2.4 }}>
      {meta.pulse && [0, 1].map(i => (
        <motion.span
          key={i}
          className="tp-pulse-ring"
          style={{ borderColor: meta.color }}
          initial={{ scale: 0.4, opacity: 0.7 }}
          animate={{ scale: 1.15, opacity: 0 }}
          transition={{ duration: 2.2, repeat: Infinity, delay: i * 1.1, ease: 'easeOut' }}
        />
      ))}
      <span className="tp-pulse-core" style={{ width: size, height: size, background: meta.color }} />
    </span>
  );
}

function SummaryTile({ status, count, active, onClick }: { status: TelemetryStatus; count: number; active: boolean; onClick: () => void }) {
  const meta = STATUS_META[status];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`tp-tile ${active ? 'tp-tile--active' : ''}`}
      style={active ? { borderColor: meta.color, background: meta.soft } : undefined}
    >
      <span className="tp-tile-top">
        <PulseDot status={count > 0 ? status : 'offline'} size={8} />
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={count}
            className="tp-tile-count"
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -8, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {count}
          </motion.span>
        </AnimatePresence>
      </span>
      <span className="tp-tile-label">{meta.label}</span>
    </button>
  );
}

export interface LiveTelemetryPanelProps {
  liveLocations: LiveLoc[];
  employees: Employee[];
  shifts: ActiveShift[];
  depots: Depot[];
  /** Drivers on shift whose GPS has stopped (an open gps_offline_events row). */
  noSignalDriverIds: Set<string>;
  isRefreshing: boolean;
  onRefresh: () => void;
  onSelectDriver: (driverId: string) => void;
}

export default function LiveTelemetryPanel({ liveLocations, employees, shifts, depots, noSignalDriverIds, isRefreshing, onRefresh, onSelectDriver }: LiveTelemetryPanelProps) {
  const [view, setView] = useState<'live' | 'all'>('live');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TelemetryStatus | 'all'>('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [speedFilter, setSpeedFilter] = useState<'all' | 'stationary' | 'moving' | 'fast'>('all');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const nearestDepotName = (lat: number | null, lng: number | null): string | null => {
    if (lat == null || lng == null || depots.length === 0) return null;
    let best = depots[0];
    let bestDist = Infinity;
    for (const d of depots) {
      const dist = (d.latitude - lat) ** 2 + (d.longitude - lng) ** 2;
      if (dist < bestDist) { bestDist = dist; best = d; }
    }
    return best.name;
  };

  const rows: Row[] = useMemo(() => {
    const shiftFor = (driverId: string) => shifts.find(s => s.driver_id === driverId && !s.end_time && s.status !== 'completed');
    const build = (driverId: string, name: string, loc: LiveLoc | undefined): Row => {
      const sh = shiftFor(driverId);
      const base = {
        driver_id: driverId,
        driver_name: name,
        vehicle: sh?.vehicle_number ?? null,
        trailer: sh?.trailer_number ?? null,
        load: sh?.load_reference ?? null,
        onShift: !!sh,
      };
      if (!loc) return { ...base, latitude: null, longitude: null, speed_mph: null, status: 'offline', last_ping: null };
      return {
        ...base,
        latitude: loc.latitude,
        longitude: loc.longitude,
        speed_mph: loc.speed_mph,
        status: noSignalDriverIds.has(driverId) ? 'no_signal' : loc.status,
        last_ping: loc.last_ping,
      };
    };
    if (view === 'live') return liveLocations.map(l => build(l.driver_id, l.driver_name, l));
    return employees.map(emp => {
      const live = liveLocations.find(l => l.driver_id === emp.id || l.driver_code === emp.driver_id);
      return build(live?.driver_id ?? emp.id, live?.driver_name ?? emp.full_name, live);
    });
  }, [view, liveLocations, employees, shifts, noSignalDriverIds]);

  const counts = useMemo(() => {
    const c: Record<TelemetryStatus, number> = { moving: 0, stationary: 0, idle: 0, no_signal: 0, offline: 0 };
    rows.forEach(r => { c[r.status] += 1; });
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter(r => {
        if (q && !`${r.driver_name} ${r.vehicle ?? ''} ${r.trailer ?? ''} ${r.load ?? ''}`.toLowerCase().includes(q)) return false;
        if (statusFilter !== 'all' && r.status !== statusFilter) return false;
        if (locationFilter !== 'all' && nearestDepotName(r.latitude, r.longitude) !== locationFilter) return false;
        if (speedFilter !== 'all') {
          if (r.speed_mph == null) return false;
          if (speedFilter === 'stationary' && r.speed_mph >= 0.5) return false;
          if (speedFilter === 'moving' && (r.speed_mph < 0.5 || r.speed_mph >= 40)) return false;
          if (speedFilter === 'fast' && r.speed_mph < 40) return false;
        }
        return true;
      })
      .sort((a, b) => (b.last_ping ? new Date(b.last_ping).getTime() : 0) - (a.last_ping ? new Date(a.last_ping).getTime() : 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, query, statusFilter, locationFilter, speedFilter, depots]);

  const filtersActive = query !== '' || statusFilter !== 'all' || locationFilter !== 'all' || speedFilter !== 'all';

  return (
    <div className="tp-card">
      <div className="tp-header">
        <span className="tp-header-icon"><Activity size={14} /></span>
        <h3 className="tp-title">Telemetry status</h3>
        <button type="button" className="tp-icon-btn" onClick={onRefresh} disabled={isRefreshing} title="Refresh feed">
          <RefreshCw size={13} className={isRefreshing ? 'spin-animation' : ''} />
        </button>
      </div>

      <div className="tp-summary">
        {SUMMARY_ORDER.map(s => (
          <SummaryTile key={s} status={s} count={counts[s]} active={statusFilter === s} onClick={() => setStatusFilter(f => (f === s ? 'all' : s))} />
        ))}
      </div>

      <div className="tp-tabs">
        <button type="button" className={`tp-tab ${view === 'live' ? 'tp-tab--active' : ''}`} onClick={() => setView('live')}>
          <Radio size={12} /> Live
        </button>
        <button type="button" className={`tp-tab ${view === 'all' ? 'tp-tab--active' : ''}`} onClick={() => setView('all')}>
          <Clock size={12} /> All drivers
        </button>
      </div>

      <div className="tp-filters">
        <div className="telemetry-search-wrap" style={{ minWidth: 0 }}>
          <Search size={14} />
          <input type="text" placeholder="Search driver, unit, load" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <div className="tp-select-row">
          <label className="tp-select">
            <MapPinned size={12} />
            <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)}>
              <option value="all">All locations</option>
              {depots.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
            </select>
          </label>
          <label className="tp-select">
            <Gauge size={12} />
            <select value={speedFilter} onChange={e => setSpeedFilter(e.target.value as typeof speedFilter)}>
              <option value="all">All speeds</option>
              <option value="stationary">Stationary</option>
              <option value="moving">Under 40 mph</option>
              <option value="fast">40 mph and over</option>
            </select>
          </label>
        </div>
        {filtersActive && (
          <button type="button" className="tp-clear" onClick={() => { setQuery(''); setStatusFilter('all'); setLocationFilter('all'); setSpeedFilter('all'); }}>
            Clear filters
          </button>
        )}
      </div>

      <div className="tp-list">
        {shown.length === 0 ? (
          <div className="tp-empty">
            <SignalZero size={22} />
            <strong>No telemetry yet</strong>
            <span>{filtersActive ? 'No drivers match the current filters.' : 'No drivers are on shift, or no GPS has been received.'}</span>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {shown.map(r => {
              const meta = STATUS_META[r.status];
              return (
                <motion.button
                  layout
                  key={r.driver_id}
                  type="button"
                  className="tp-driver"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  onClick={() => r.latitude != null && onSelectDriver(r.driver_id)}
                  disabled={r.latitude == null}
                >
                  <div className="tp-driver-top">
                    <PulseDot status={r.status} />
                    <div className="tp-driver-name">
                      <strong>{r.driver_name}</strong>
                      <span>{ago(r.last_ping, now)}</span>
                    </div>
                    <span className="tp-badge" style={{ color: meta.color, background: meta.soft }}>{meta.label}</span>
                  </div>

                  <div className="tp-driver-grid">
                    <div>
                      <span className="tp-k">Speed</span>
                      <span className="tp-v">{r.speed_mph == null ? '-' : `${r.speed_mph.toFixed(0)} mph`}</span>
                    </div>
                    <div>
                      <span className="tp-k">Load</span>
                      <span className="tp-v tp-mono">{r.load ?? (r.onShift ? 'No load' : '-')}</span>
                    </div>
                    <div>
                      <span className="tp-k">Tractor</span>
                      <span className="tp-v tp-chip"><Truck size={11} />{r.vehicle ?? '-'}</span>
                    </div>
                    <div>
                      <span className="tp-k">Trailer</span>
                      <span className="tp-v tp-chip"><Container size={11} />{r.trailer ?? '-'}</span>
                    </div>
                  </div>

                  <div className="tp-driver-foot">
                    {r.latitude == null || r.longitude == null ? (
                      <span className="tp-k">No recent data</span>
                    ) : (
                      <>
                        <span className="tp-mono tp-coords">{r.latitude.toFixed(5)}, {r.longitude.toFixed(5)}</span>
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${r.latitude},${r.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="tp-link"
                        >
                          Open in Maps
                        </a>
                      </>
                    )}
                  </div>
                </motion.button>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
