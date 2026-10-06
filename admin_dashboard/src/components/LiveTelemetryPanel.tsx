import NoData from './ui/no-data';
import TableFilter from './ui/table-filter';
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, RefreshCw, Truck, Container, UserRound } from 'lucide-react';

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
  /** a trailer is coupled to this driver's tractor */
  hasTrailer: boolean;
  /** an assigned or in-progress load exists for this driver right now */
  hasLoad: boolean;
}

const STATUS_META: Record<TelemetryStatus, { label: string; color: string; soft: string; pulse: boolean }> = {
  moving: { label: 'Moving', color: '#16A34A', soft: 'rgba(22,163,74,0.12)', pulse: true },
  stationary: { label: 'Stationary', color: '#D97706', soft: 'rgba(217,119,6,0.12)', pulse: false },
  idle: { label: 'Idle', color: '#DC2626', soft: 'rgba(220,38,38,0.12)', pulse: true },
  no_signal: { label: 'No GPS signal', color: '#7C2D12', soft: 'rgba(124,45,18,0.14)', pulse: true },
  offline: { label: 'Off shift', color: '#888888', soft: 'rgba(136,136,136,0.14)', pulse: false },
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

/** Driver avatar: a person icon inside a ring in the driver's status colour. */
function DriverBadge({ status }: { status: TelemetryStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className="tp-avatar" style={{ borderColor: meta.color, background: meta.soft, color: meta.color }} title="Driver">
      {meta.pulse && (
        <motion.span
          className="tp-avatar-ring"
          style={{ borderColor: meta.color }}
          initial={{ scale: 1, opacity: 0.6 }}
          animate={{ scale: 1.5, opacity: 0 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
      <UserRound size={17} strokeWidth={2.2} />
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
  /** Every driver currently on shift with a GPS position. */
  liveLocations: LiveLoc[];
  shifts: ActiveShift[];
  /** driver id -> reference of the load assigned to them right now (office-assigned loads) */
  assignedLoads: Record<string, string>;
  depots: Depot[];
  /** Drivers on shift whose GPS has stopped (an open gps_offline_events row). */
  noSignalDriverIds: Set<string>;
  isRefreshing: boolean;
  onRefresh: () => void;
  onSelectDriver: (driverId: string) => void;
}

export default function LiveTelemetryPanel({ liveLocations, shifts, assignedLoads, depots, noSignalDriverIds, isRefreshing, onRefresh, onSelectDriver }: LiveTelemetryPanelProps) {
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
    const build = (loc: LiveLoc): Row => {
      const driverId = loc.driver_id;
      const sh = shiftFor(driverId);
      const load = sh?.load_reference || assignedLoads[driverId] || null;
      const base = {
        driver_id: driverId,
        driver_name: loc.driver_name,
        vehicle: sh?.vehicle_number ?? null,
        trailer: sh?.trailer_number ?? null,
        load,
        onShift: !!sh,
        hasTrailer: !!sh?.trailer_number,
        hasLoad: !!load,
      };
      return {
        ...base,
        latitude: loc.latitude,
        longitude: loc.longitude,
        speed_mph: loc.speed_mph,
        status: noSignalDriverIds.has(driverId) ? 'no_signal' : loc.status,
        last_ping: loc.last_ping,
      };
    };
    return liveLocations.map(build);
  }, [liveLocations, shifts, assignedLoads, noSignalDriverIds]);

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

      <div className="tp-filters">
        <TableFilter
          className="fg--block"
          groups={[
            {
              key: 'location', label: 'Location', single: true, neutral: 'all',
              options: [{ value: 'all', label: 'All locations' }, ...depots.map(d => ({ value: d.name, label: d.name }))],
              selected: [locationFilter],
              onChange: v => setLocationFilter(v[0] ?? 'all'),
            },
            {
              key: 'speed', label: 'Speed', single: true, neutral: 'all',
              options: [
                { value: 'all', label: 'All speeds' },
                { value: 'stationary', label: 'Stationary' },
                { value: 'moving', label: 'Under 40 mph' },
                { value: 'fast', label: '40 mph and over' },
              ],
              selected: [speedFilter],
              onChange: v => setSpeedFilter((v[0] ?? 'all') as typeof speedFilter),
            },
            {
              key: 'status', label: 'Status', single: true, neutral: 'all',
              options: [{ value: 'all', label: 'All statuses' }, ...SUMMARY_ORDER.map(s => ({ value: s, label: STATUS_META[s].label }))],
              selected: [statusFilter],
              onChange: v => setStatusFilter((v[0] ?? 'all') as typeof statusFilter),
            },
          ]}
          search={{ value: query, onChange: setQuery, placeholder: 'Search driver, unit, load' }}
        />
      </div>

      <div className="tp-list">
        {shown.length === 0 ? (
          <NoData />
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
                    <DriverBadge status={r.status} />
                    <div className="tp-driver-name">
                      <strong>{r.driver_name}</strong>
                      <span>{ago(r.last_ping, now)}</span>
                    </div>
                    <span className="tp-unit-icons">
                      {r.hasTrailer && (
                        <span className="tp-unit-icon tp-unit-icon--trailer" title={`Trailer attached: ${r.trailer}`}>
                          <Container size={15} />
                        </span>
                      )}
                      {!r.hasLoad && (
                        <span className="tp-unit-icon tp-unit-icon--solo" title="Solo unit: no load assigned right now">
                          <Truck size={15} />
                        </span>
                      )}
                    </span>
                    <span className="tp-badge" style={{ color: meta.color, background: meta.soft }}>{meta.label}</span>
                  </div>

                  <div className="tp-driver-grid">
                    <div>
                      <span className="tp-k">Speed</span>
                      <span className="tp-v">{r.speed_mph == null ? '-' : `${r.speed_mph.toFixed(0)} mph`}</span>
                    </div>
                    <div>
                      <span className="tp-k">Load</span>
                      <span className="tp-v tp-mono">{r.load ?? 'No load'}</span>
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

      <div className="tp-legend">
        <span><span className="tp-unit-icon tp-unit-icon--driver"><UserRound size={13} /></span> Driver</span>
        <span><span className="tp-unit-icon tp-unit-icon--trailer"><Container size={13} /></span> Trailer attached</span>
        <span><span className="tp-unit-icon tp-unit-icon--solo"><Truck size={13} /></span> Solo unit, no load</span>
      </div>
    </div>
  );
}
