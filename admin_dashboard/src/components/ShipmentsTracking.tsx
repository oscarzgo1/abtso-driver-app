import NoData from './ui/no-data';
import { MemberAvatar } from './ui/member-cell';
import { driverPinHtml, trailerPinHtml, escapeHtml, DRIVER_PIN_SIZE, DRIVER_PIN_ANCHOR, TRAILER_PIN_SIZE, TRAILER_PIN_ANCHOR } from '../lib/map-pins';
import { useSectionRefresh } from '../lib/section-refresh';
import { buildJourney, type Ping } from '../lib/journey';
import { drawJourney } from '../lib/journey-map';
import TableFilter from './ui/table-filter';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import '@maplibre/maplibre-gl-leaflet';
import { Package, Clock, ChevronDown, Phone, Truck, Camera, MapPin, PackageCheck, Timer, ShieldCheck, X, Route, ListChecks, Flag, ShieldAlert } from 'lucide-react';
import { supabase, isMockMode } from '../App';
import type { TimelineStep } from './ui/tracking-timeline';
import ShipmentStages from './ShipmentStages';

// Shipments → Live Tracking: the tracking list on the left, KPI cards, the
// live map with the selected shipment's driver and route so far, a delivery
// timeline, shipment info and proof of delivery. Shipments are loads:
// office-assigned (dispatch_loads), driver-attached (shift_loads), plus a
// card for each driver on shift who has no load yet so they can be assigned
// one straight from here.

type SStatus = 'awaiting' | 'assigned' | 'in_transit' | 'completed';
type PodType = 'solo_departure' | 'empty_trailer' | 'paper_pod';

interface Proof { id: string; pod_type: PodType; photo_path: string; taken_at: string | null; gps_lat: number | null; gps_lng: number | null }

interface Shipment {
  key: string;
  kind: 'assigned' | 'manual' | 'awaiting';
  ref: string;
  driverId: string;
  driver: string;
  status: SStatus;
  progress: number;
  typeLabel: string;
  origin: string | null;
  destination: string | null;
  cutoff: string | null;
  carrier: string | null;
  trailer: string | null;
  unit: string | null;
  createdAt: string;
  departure: string | null;
  delivered: string | null;
  shiftStart: string | null;
  shiftEnd: string | null;
  odoStart: number | null;
  odoEnd: number | null;
  /** when the driver marked loading started / finished (migration 092) */
  loadingStart: string | null;
  loadingEnd: string | null;
  notes: string | null;
  cargoPath: string | null;
  sealed: boolean;
  proofs: Proof[];
  /** On-phone signature taken at delivery (delivery_signatures, migration 081). */
  signature: { name: string; svg: string; signedAt: string; lat: number | null; lng: number | null } | null;
  sortTime: number;
}

export interface TrackingShift {
  id: string;
  driver_id: string;
  driver_name?: string;
  start_time: string;
  end_time: string | null;
  status: string;
  vehicle_number?: string | null;
  trailer_number?: string | null;
  load_reference?: string | null;
}
interface TrackingLive { driver_id: string; latitude: number; longitude: number; speed_mph: number; status: string; last_ping: string }
interface TrackingDepot { id: string; name: string; latitude: number; longitude: number; geofence_radius_m: number }
interface TrackingEmployee { id: string; full_name: string; phone?: string | null }

const STATUS_META: Record<SStatus, { label: string; badge: string }> = {
  awaiting: { label: 'Awaiting load', badge: 'badge-danger' },
  assigned: { label: 'Assigned', badge: 'badge-warning' },
  in_transit: { label: 'In transit', badge: 'badge-accent' },
  completed: { label: 'Completed', badge: 'badge-success' },
};

const POD_LABEL: Record<PodType, string> = { solo_departure: 'Solo departure', empty_trailer: 'Empty trailer', paper_pod: 'Paper POD' };

const PROOF_SELECT = 'shipment_proofs(id, pod_type, photo_path, taken_at, gps_lat, gps_lng), delivery_signatures(signer_first_name, signer_last_name, signature_svg, signed_at, gps_lat, gps_lng)';

function signatureOf(r: Raw): Shipment['signature'] {
  const raw = Array.isArray(r.delivery_signatures) ? r.delivery_signatures[0] : r.delivery_signatures;
  if (!raw?.signature_svg) return null;
  return { name: `${raw.signer_first_name ?? ''} ${raw.signer_last_name ?? ''}`.trim(), svg: raw.signature_svg, signedAt: raw.signed_at, lat: raw.gps_lat ?? null, lng: raw.gps_lng ?? null };
}
// An <img> never runs scripts, so a stored signature is safe to show this way.
const signatureSrc = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const dtShort = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' — ' + new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—';
const timeOnly = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : undefined);

function span(from: string | null, to: string | null): string {
  if (!from || !to) return '—';
  const ms = new Date(to).getTime() - new Date(from).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

function proofsOf(r: Raw, legacy: { paper?: string | null; evidence?: string | null }, at: string): Proof[] {
  const real = ((r.shipment_proofs ?? []) as Proof[]).filter(p => p.photo_path);
  if (real.length > 0) return real;
  const out: Proof[] = [];
  if (legacy.paper) out.push({ id: `${r.id}-p`, pod_type: 'paper_pod', photo_path: legacy.paper, taken_at: at, gps_lat: null, gps_lng: null });
  if (legacy.evidence) out.push({ id: `${r.id}-e`, pod_type: 'empty_trailer', photo_path: legacy.evidence, taken_at: at, gps_lat: null, gps_lng: null });
  return out;
}

const minsText = (m: number) => {
  const a = Math.abs(Math.round(m));
  return a >= 60 ? `${Math.floor(a / 60)}h ${String(a % 60).padStart(2, '0')}m` : `${a} min`;
};

/** The three stages the list card's bar shows, and how far each has got (0-100). */
const BAR_STAGES = [
  { key: 'loading', label: 'Loading', color: 'var(--brand-red)', weight: 30 },
  { key: 'transit', label: 'In transit', color: '#E8908A', weight: 50 },
  { key: 'delivered', label: 'Delivered', color: '#2E7D32', weight: 20 },
] as const;

function barFill(s: Shipment): Record<'loading' | 'transit' | 'delivered', number> {
  if (s.kind === 'awaiting') return { loading: 0, transit: 0, delivered: 0 };
  const loaded = !!s.loadingEnd || s.status === 'completed';
  const loading = loaded ? 100 : s.loadingStart ? 50 : 0;
  const loadingNow = !!s.loadingStart && !loaded;
  const transit = s.status === 'completed' ? 100 : s.status === 'in_transit' ? (loadingNow ? 0 : loaded ? 55 : 30) : 0;
  return { loading, transit, delivered: s.status === 'completed' ? 100 : 0 };
}

/** none = not started, loading = being loaded right now, loaded = loading finished. */
type LoadingState = 'none' | 'loading' | 'loaded';
function loadingStateOf(s: Shipment): LoadingState {
  if (s.kind === 'awaiting') return 'none';
  if (s.loadingEnd || s.status === 'completed') return 'loaded';
  return s.loadingStart ? 'loading' : 'none';
}

function LoadingChip({ s }: { s: Shipment }) {
  const st = loadingStateOf(s);
  if (st === 'none') return null;
  return (
    <span className={`si-live si-live--${st}`}>
      {st === 'loading' ? <><i className="si-live-dot" /> Loading now</> : <>Loaded{s.loadingEnd ? ` ${timeOnly(s.loadingEnd)}` : ''}</>}
    </span>
  );
}

/** "12 min ahead" / "20 min late" against the booking cut-off. */
function scheduleOf(s: Shipment): { text: string; late: boolean } {
  if (!s.cutoff) return { text: '—', late: false };
  const cut = new Date(s.cutoff).getTime();
  if (s.status === 'completed' && s.delivered) {
    const diff = (new Date(s.delivered).getTime() - cut) / 60000;
    return diff <= 0 ? { text: `${minsText(diff)} ahead`, late: false } : { text: `${minsText(diff)} late`, late: true };
  }
  const left = (cut - Date.now()) / 60000;
  return left >= 0 ? { text: `${minsText(left)} to cut-off`, late: false } : { text: `Cut-off passed ${minsText(left)} ago`, late: true };
}

/** "2 completed · 3 remaining" */
function stagesOf(s: Shipment): string {
  if (s.kind === 'awaiting') return 'Waiting for a load';
  const done = s.status === 'completed';
  const loaded = !!s.loadingEnd || done;
  const flags = s.kind === 'assigned'
    ? [true, !!s.departure, loaded, done || (s.status === 'in_transit' && loaded), done]
    : [true, loaded, done || (s.status === 'in_transit' && loaded), done];
  const completed = flags.filter(Boolean).length;
  return `${completed} completed · ${flags.length - completed} remaining`;
}

function Delta({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return <span style={{ color: 'var(--charcoal-light)' }}>{current === 0 ? '—' : 'New'}</span>;
  const pct = ((current - previous) / previous) * 100;
  const up = pct >= 0;
  return <span style={{ color: up ? '#2E7D32' : 'var(--brand-red)', fontWeight: 800 }}>{up ? '+' : ''}{pct.toFixed(1)}%</span>;
}

export default function ShipmentsTracking({ mode = 'live', shifts, unitRisk = {}, liveLocations, depots, employees, onAssign, onOpenFleet }: {
  /** 'live' = open work; 'history' = completed deliveries and their proof. */
  mode?: 'live' | 'history';
  shifts: TrackingShift[];
  /** registration -> reasons it cannot be on the road (lib/roadworthy). */
  unitRisk?: Record<string, string[]>;
  liveLocations: TrackingLive[];
  depots: TrackingDepot[];
  employees: TrackingEmployee[];
  onAssign: (driverId: string) => void;
  /** Opens Fleet Roadworthiness (the icon on a not-roadworthy unit). */
  onOpenFleet?: (unit: string) => void;
}) {
  const [dispatchRows, setDispatchRows] = useState<Raw[]>([]);
  const [manualRows, setManualRows] = useState<Raw[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | SStatus>('all');
  const [period, setPeriod] = useState<'7' | '30' | '90'>('30');
  const [lightbox, setLightbox] = useState<string | null>(null);
  const history = mode === 'history';
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [trail, setTrail] = useState<Ping[]>([]);

  const load = useCallback(async () => {
    if (isMockMode || !supabase) return;
    const since = new Date(Date.now() - 90 * 86400000).toISOString();
    const [d, m] = await Promise.all([
      supabase
        .from('dispatch_loads')
        .select(`id, driver_id, vrid, origin, destination, booking_cutoff_at, trailer_number, status, odometer_start, odometer_end, created_at, accepted_at, completed_at, loading_started_at, loading_completed_at, delivery_notes, cargo_photo_path, trailer_sealed, drivers(full_name), ${PROOF_SELECT}`)
        .neq('status', 'cancelled')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(400),
      supabase
        .from('shift_loads')
        .select(`id, load_reference, carrier_name, booked_departure_at, booked_delivery_at, delivered_at, created_at, loading_started_at, loading_completed_at, delivery_notes, cargo_photo_path, trailer_sealed, delivery_paperwork_path, delivery_evidence_path, shifts(driver_id, start_time, end_time, vehicle:vehicles!vehicle_id(vehicle_number), trailer:vehicles!trailer_id(vehicle_number), drivers(full_name)), ${PROOF_SELECT}`)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(400),
    ]);
    if (!d.error) setDispatchRows((d.data ?? []) as Raw[]);
    if (!m.error) setManualRows((m.data ?? []) as Raw[]);
  }, []);

  useEffect(() => { load(); }, [load]);
  useSectionRefresh(load);

  // Any change to loads or proofs refreshes the list.
  useEffect(() => {
    if (isMockMode || !supabase) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => { clearTimeout(timer); timer = setTimeout(load, 400); };
    const channel = supabase
      .channel('realtime_shipments_tracking')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatch_loads' }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_loads' }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shipment_proofs' }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_signatures' }, soon)
      .subscribe();
    return () => { clearTimeout(timer); supabase!.removeChannel(channel); };
  }, [load]);

  const shipments = useMemo<Shipment[]>(() => {
    const out: Shipment[] = [];
    const openShiftByDriver = new Map<string, TrackingShift>();
    for (const s of shifts) if (!s.end_time && s.status !== 'completed') openShiftByDriver.set(s.driver_id, s);

    for (const r of dispatchRows) {
      const status: SStatus = r.status === 'assigned' ? 'assigned' : r.status === 'in_progress' ? 'in_transit' : 'completed';
      const sh = shifts.filter(s => s.driver_id === r.driver_id && new Date(s.start_time) <= new Date(r.completed_at ?? Date.now())).sort((a, b) => b.start_time.localeCompare(a.start_time))[0];
      out.push({
        key: `a-${r.id}`, kind: 'assigned', ref: r.vrid, driverId: r.driver_id, driver: r.drivers?.full_name ?? '—', status,
        progress: status === 'assigned' ? 25 : status === 'in_transit' ? 60 : 100, typeLabel: 'Assigned load',
        origin: r.origin, destination: r.destination, cutoff: r.booking_cutoff_at, carrier: null, trailer: r.trailer_number,
        unit: sh?.vehicle_number ?? null, createdAt: r.created_at, departure: r.accepted_at, delivered: r.completed_at,
        shiftStart: sh?.start_time ?? null, shiftEnd: sh?.end_time ?? null, odoStart: r.odometer_start, odoEnd: r.odometer_end,
        loadingStart: r.loading_started_at ?? null, loadingEnd: r.loading_completed_at ?? null,
        notes: r.delivery_notes, cargoPath: r.cargo_photo_path, sealed: !!r.trailer_sealed, proofs: proofsOf(r, {}, r.completed_at ?? r.created_at), signature: signatureOf(r),
        sortTime: new Date(r.completed_at ?? r.accepted_at ?? r.created_at).getTime(),
      });
    }
    for (const r of manualRows) {
      const done = !!r.delivered_at;
      // A manual load only counts as on the road while its own shift is still open.
      const shiftOpen = !r.shifts?.end_time;
      out.push({
        key: `m-${r.id}`, kind: 'manual', ref: r.load_reference, driverId: r.shifts?.driver_id ?? '', driver: r.shifts?.drivers?.full_name ?? '—',
        status: done || !shiftOpen ? 'completed' : 'in_transit', progress: done || !shiftOpen ? 100 : 55, typeLabel: 'Manual load',
        origin: null, destination: null, cutoff: r.booked_delivery_at, carrier: r.carrier_name, trailer: r.shifts?.trailer?.vehicle_number ?? null,
        unit: r.shifts?.vehicle?.vehicle_number ?? null, createdAt: r.created_at, departure: r.booked_departure_at ?? r.created_at, delivered: r.delivered_at,
        shiftStart: r.shifts?.start_time ?? null, shiftEnd: r.shifts?.end_time ?? null, odoStart: null, odoEnd: null,
        loadingStart: r.loading_started_at ?? null, loadingEnd: r.loading_completed_at ?? null,
        notes: r.delivery_notes, cargoPath: r.cargo_photo_path, sealed: !!r.trailer_sealed,
        proofs: proofsOf(r, { paper: r.delivery_paperwork_path, evidence: r.delivery_evidence_path }, r.delivered_at ?? r.created_at), signature: signatureOf(r),
        sortTime: new Date(r.delivered_at ?? r.created_at).getTime(),
      });
    }
    // Drivers on shift with nothing to carry yet.
    const busy = new Set(out.filter(x => x.status === 'assigned' || x.status === 'in_transit').map(x => x.driverId));
    for (const [driverId, s] of openShiftByDriver) {
      if (busy.has(driverId) || s.load_reference) continue;
      out.push({
        key: `w-${s.id}`, kind: 'awaiting', ref: `Shift ${new Date(s.start_time).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`, driverId, driver: s.driver_name ?? '—',
        status: 'awaiting', progress: 10, typeLabel: 'No load yet', origin: null, destination: null, cutoff: null, carrier: null,
        trailer: s.trailer_number ?? null, unit: s.vehicle_number ?? null, createdAt: s.start_time, departure: null, delivered: null,
        shiftStart: s.start_time, shiftEnd: null, odoStart: null, odoEnd: null, loadingStart: null, loadingEnd: null, notes: null, cargoPath: null, sealed: false, proofs: [], signature: null,
        sortTime: new Date(s.start_time).getTime(),
      });
    }
    // Open work first, then newest.
    const rank = (x: Shipment) => (x.status === 'completed' ? 1 : 0);
    return out.sort((a, b) => rank(a) - rank(b) || b.sortTime - a.sortTime);
  }, [dispatchRows, manualRows, shifts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cutoff = Date.now() - Number(period) * 86400000;
    return shipments.filter(s =>
      (history ? s.status === 'completed' && new Date(s.delivered ?? s.createdAt).getTime() >= cutoff : statusFilter === 'all' || s.status === statusFilter) &&
      (!q || `${s.ref} ${s.driver} ${s.origin ?? ''} ${s.destination ?? ''} ${s.trailer ?? ''} ${s.carrier ?? ''}`.toLowerCase().includes(q)));
  }, [shipments, search, statusFilter, history, period]);

  const selected = useMemo(() => shipments.find(s => s.key === selectedKey) ?? filtered[0] ?? null, [shipments, filtered, selectedKey]);

  // KPI cards — this month against last month.
  const kpi = useMemo(() => {
    const now = new Date();
    const thisStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    const loads = shipments.filter(s => s.kind !== 'awaiting');
    const created = (from: number, to: number) => loads.filter(s => { const t = new Date(s.createdAt).getTime(); return t >= from && t < to; }).length;
    const completed = (from: number, to: number) => loads.filter(s => { const t = s.delivered ? new Date(s.delivered).getTime() : 0; return s.status === 'completed' && t >= from && t < to; }).length;
    return {
      total: created(thisStart, Infinity), totalPrev: created(lastStart, thisStart),
      inTransit: shipments.filter(s => s.status === 'in_transit').length,
      awaiting: shipments.filter(s => s.status === 'awaiting' || s.status === 'assigned').length,
      done: completed(thisStart, Infinity), donePrev: completed(lastStart, thisStart),
    };
  }, [shipments]);

  // History cards: over the chosen period.
  const histKpi = useMemo(() => {
    const items = filtered;
    const durations = items
      .map(x => (x.departure && x.delivered ? (new Date(x.delivered).getTime() - new Date(x.departure).getTime()) / 60000 : null))
      .filter((v): v is number => v != null && v >= 0);
    const avg = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;
    const withProof = items.filter(x => x.proofs.length > 0).length;
    return { count: items.length, avg, proofPct: items.length ? Math.round((withProof / items.length) * 100) : 0, photos: items.reduce((n, x) => n + x.proofs.length, 0) };
  }, [filtered]);

  // Signed links for the selected shipment's photos.
  useEffect(() => {
    if (isMockMode || !supabase || !selected) return;
    const paths = [...selected.proofs.map(p => p.photo_path), ...(selected.cargoPath ? [selected.cargoPath] : [])].filter(p => !(p in urls));
    if (paths.length === 0) return;
    let cancelled = false;
    supabase.storage.from('delivery-photos').createSignedUrls(paths, 3600).then(({ data }) => {
      if (cancelled || !data) return;
      const next: Record<string, string> = {};
      data.forEach((x, i) => { if (x.signedUrl) next[paths[i]] = x.signedUrl; });
      setUrls(prev => ({ ...prev, ...next }));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.key, selected?.proofs.length]);

  // The driver's route so far for the selected shipment.
  useEffect(() => {
    setTrail([]);
    if (isMockMode || !supabase || !selected || !selected.driverId) return;
    const from = selected.departure ?? selected.shiftStart ?? selected.createdAt;
    const to = selected.delivered ?? new Date().toISOString();
    let cancelled = false;
    supabase
      .from('gps_locations')
      .select('latitude, longitude, speed, recorded_at')
      .eq('driver_id', selected.driverId)
      .gte('recorded_at', from)
      .lte('recorded_at', to)
      .order('recorded_at', { ascending: true })
      .limit(700)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const toMs = (ts: string) => new Date(/Z$|[+-]\d\d(:?\d\d)?$/.test(String(ts).trim()) ? String(ts).trim() : `${String(ts).trim().replace(' ', 'T')}Z`).getTime();
        setTrail((data as Raw[]).filter(p => p.latitude != null && p.longitude != null).map(p => ({
          lat: Number(p.latitude), lng: Number(p.longitude), speed: p.speed == null ? null : Number(p.speed), t: toMs(p.recorded_at as string),
        })));
      });
    return () => { cancelled = true; };
  }, [selected?.key, selected?.driverId, selected?.departure, selected?.delivered, selected?.shiftStart, selected?.createdAt]);

  // ── map ──
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = L.map(mapEl.current, { zoomControl: true, attributionControl: true }).setView([53.5, -1.1], 9);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (L as any).maplibreGL({ style: 'https://tiles.openfreemap.org/styles/liberty' }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 200);
    return () => { map.remove(); mapRef.current = null; layerRef.current = null; };
  }, []);

  const live = selected ? liveLocations.find(l => l.driver_id === selected.driverId) : undefined;

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const bounds: L.LatLngExpression[] = [];
    for (const d of depots) {
      L.circle([d.latitude, d.longitude], { radius: d.geofence_radius_m >= 1_000_000 ? 300 : d.geofence_radius_m, color: '#CC0000', weight: 2, fillColor: '#CC0000', fillOpacity: 0.08 }).addTo(layer);
      L.circleMarker([d.latitude, d.longitude], { radius: 6, color: '#fff', weight: 2, fillColor: '#CC0000', fillOpacity: 1 }).bindTooltip(d.name).addTo(layer);
    }
    // The route as dots (one per recorded position) with the stops marked,
    // the same as Journey History.
    if (trail.length > 0) {
      const endMs = selected?.delivered ? new Date(selected.delivered).getTime() : Date.now();
      drawJourney(layer, buildJourney(trail, Math.max(endMs, trail[trail.length - 1].t))).forEach(p => bounds.push(p));
      L.circleMarker([trail[0].lat, trail[0].lng], { radius: 6, color: '#fff', weight: 2, fillColor: '#111', fillOpacity: 1 }).bindTooltip('Departed').addTo(layer);
    }
    // Where each proof photo was taken (GPS stamped by the driver's phone).
    for (const pr of selected?.proofs ?? []) {
      if (pr.gps_lat != null && pr.gps_lng != null) {
        L.circleMarker([pr.gps_lat, pr.gps_lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#2E7D32', fillOpacity: 1 })
          .bindTooltip(`${POD_LABEL[pr.pod_type]} photo`)
          .addTo(layer);
        bounds.push([pr.gps_lat, pr.gps_lng]);
      }
    }
    if (live && selected?.status !== 'completed') {
      const unitLabel = [selected?.unit, selected?.trailer].filter(Boolean).map(x => escapeHtml(String(x))).join(' <span>+</span> ');
      L.marker([live.latitude, live.longitude], {
        icon: L.divIcon({
          className: '',
          html: driverPinHtml({ name: selected?.driver ?? 'Driver', state: live.status === 'idle' ? 'idle' : 'live', label: unitLabel || null }),
          iconSize: DRIVER_PIN_SIZE,
          iconAnchor: DRIVER_PIN_ANCHOR,
        }),
        zIndexOffset: 500,
      })
        .bindTooltip(`${selected?.driver ?? 'Driver'} · ${live.status === 'moving' ? `${Math.round(live.speed_mph)} mph` : live.status}`, { permanent: false, direction: 'top', offset: [0, -44] })
        .addTo(layer);
      if (selected?.trailer) {
        L.marker([live.latitude - 0.00018, live.longitude + 0.00028], {
          icon: L.divIcon({ className: '', html: trailerPinHtml(String(selected.trailer)), iconSize: TRAILER_PIN_SIZE, iconAnchor: TRAILER_PIN_ANCHOR }),
          zIndexOffset: 400,
        }).addTo(layer);
      }
      bounds.push([live.latitude, live.longitude]);
    }
    if (bounds.length > 0) map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 15 });
    else if (depots.length > 0) map.fitBounds(L.latLngBounds(depots.map(d => [d.latitude, d.longitude] as [number, number])), { padding: [60, 60], maxZoom: 12 });
  }, [trail, live?.latitude, live?.longitude, depots, selected?.key, selected?.status, selected?.driver]);

  // ── timeline ──
  const steps: TimelineStep[] = useMemo(() => {
    if (!selected) return [];
    const s = selected;
    const list: TimelineStep[] = [];
    list.push({ title: 'Clocked in', detail: [s.unit, s.trailer].filter(Boolean).join(' / ') || 'No unit recorded', time: timeOnly(s.shiftStart), status: s.shiftStart ? 'completed' : 'pending' });
    // One stage at a time for the load: "Loading" while the driver is being
    // loaded, then "Load attached" (immediately, if no loading was tracked).
    const loaded = !!s.loadingEnd || s.status === 'completed';
    const loadingNow = !!s.loadingStart && !loaded && s.kind !== 'awaiting';
    if (s.kind === 'awaiting') {
      list.push({ title: 'Load', detail: 'Waiting for a load — assign one', status: 'active' });
    } else if (loadingNow) {
      list.push({ title: 'Loading', detail: `${s.ref} · in progress since ${timeOnly(s.loadingStart)}`, time: timeOnly(s.loadingStart), status: 'active' });
    } else {
      const bits = [s.ref, s.kind === 'assigned' ? `${s.origin ?? '—'} → ${s.destination ?? '—'}` : s.carrier].filter(Boolean).join(' · ');
      const took = s.loadingStart && s.loadingEnd ? ` · loaded in ${span(s.loadingStart, s.loadingEnd)}` : '';
      const waiting = s.kind === 'assigned' && !s.departure ? ' · waiting for the driver to accept' : '';
      list.push({ title: 'Load attached', detail: `${bits}${took}${s.sealed ? ' · trailer sealed' : ''}${waiting}`, time: timeOnly(s.loadingEnd ?? s.createdAt), status: 'completed' });
    }
    if (s.kind !== 'awaiting') {
      list.push({
        title: 'On the road',
        detail: s.status === 'completed' ? `Took ${span(s.departure, s.delivered)}` : live ? (live.status === 'moving' ? `Moving at ${Math.round(live.speed_mph)} mph` : live.status === 'idle' ? 'Idle' : 'Stopped') : 'No live signal',
        status: s.status === 'completed' ? 'completed' : s.status === 'in_transit' && !loadingNow ? 'active' : 'pending',
      });
      list.push({
        title: 'Delivered',
        detail: s.status === 'completed' ? `${s.proofs.length} proof photo${s.proofs.length === 1 ? '' : 's'}` : 'Not confirmed yet',
        time: timeOnly(s.delivered),
        status: s.status === 'completed' ? 'completed' : 'pending',
      });
    }
    list.push({ title: 'Clocked out', detail: s.shiftEnd ? new Date(s.shiftEnd).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : 'Still on shift', time: timeOnly(s.shiftEnd), status: s.shiftEnd ? 'completed' : 'pending' });
    return list;
  }, [selected, live]);

  const riskOf = (num: string | null) => (num ? unitRisk[num.trim().toUpperCase()] : undefined);
  const riskUnits = (sh: Shipment) => [sh.unit, sh.trailer]
    .filter((n): n is string => !!n && !!riskOf(n))
    .map(n => ({ num: n, issues: riskOf(n)!.join(' · ') }));
  const riskLines = (sh: Shipment) => riskUnits(sh).map(u => `${u.num} (${u.issues})`);

  // One icon per unit/trailer that can't be on the road; each opens that
  // exact asset in Fleet Roadworthiness.
  const riskIcon = (sh: Shipment) => (
    <>
      {riskUnits(sh).map(u => (
        <button
          key={u.num}
          type="button"
          className="rw-icon"
          title={`${u.num}: ${u.issues} — open it in Fleet Roadworthiness`}
          aria-label={`${u.num} cannot be on the road — open in Fleet Roadworthiness`}
          onClick={(e) => { e.stopPropagation(); onOpenFleet?.(u.num); }}
        >
          <ShieldAlert size={15} />
        </button>
      ))}
    </>
  );

  const phone = selected ? employees.find(e => e.id === selected.driverId)?.phone : null;

  // The driver marks loading from the app. If they forget (or the office
  // sees the trailer being loaded), the office can set it here by hand.
  const [settingLoading, setSettingLoading] = useState(false);
  const setLoading = async (sh: Shipment, event: 'started' | 'finished') => {
    if (isMockMode || !supabase || sh.kind === 'awaiting') return;
    setSettingLoading(true);
    const now = new Date().toISOString();
    const patch = event === 'started'
      ? { loading_started_at: now }
      : { loading_started_at: sh.loadingStart ?? now, loading_completed_at: now };
    await supabase.from(sh.kind === 'assigned' ? 'dispatch_loads' : 'shift_loads').update(patch).eq('id', sh.key.slice(2));
    setSettingLoading(false);
    load();
  };
  const distance = selected && selected.odoStart != null && selected.odoEnd != null ? `${selected.odoEnd - selected.odoStart} mi` : '—';

  const kpiCard = (label: string, value: React.ReactNode, footer: React.ReactNode, icon: React.ReactNode) => (
    <div className="glass-card" style={{ padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
      <div>
        <p className="text-xs font-bold text-muted m-0">{label}</p>
        <p className="font-black m-0 mt-4 tabular-nums" style={{ fontSize: '28px', color: 'var(--charcoal)' }}>{typeof value === 'number' ? value.toLocaleString('en-GB') : value}</p>
        <p className="text-xs text-muted m-0 mt-4">{footer}</p>
      </div>
      <span style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--brand-red-light)', color: 'var(--brand-red)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
    </div>
  );

  const panel = (title: string, children: React.ReactNode, style?: React.CSSProperties) => (
    <div className="glass-card" style={{ padding: '16px 18px', ...style }}>
      <p className="font-black text-primary m-0 mb-12" style={{ fontSize: '14px' }}>{title}</p>
      {children}
    </div>
  );

  const info = (label: string, value: React.ReactNode) => (
    <div style={{ minWidth: 0 }}>
      <p className="text-xs text-muted m-0">{label}</p>
      <p className="text-sm font-bold text-primary m-0 mt-4" style={{ overflowWrap: 'anywhere' }}>{value}</p>
    </div>
  );

  // Photos + cargo evidence for the selected shipment (used by both modes).
  const signatureCard = selected?.signature ? (
    <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', background: 'var(--card-bg)', padding: '12px', marginBottom: '12px' }}>
      <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '6px' }}>
        <img src={signatureSrc(selected.signature.svg)} alt="Signature" style={{ display: 'block', width: '100%', maxHeight: '130px', objectFit: 'contain' }} />
      </div>
      <p className="text-xs font-bold text-primary m-0 mt-4">Signed by {selected.signature.name}</p>
      <p className="text-xs text-muted m-0" style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
        {dtShort(selected.signature.signedAt)}
        {selected.signature.lat != null && selected.signature.lng != null && <><MapPin size={11} /> {selected.signature.lat.toFixed(4)}, {selected.signature.lng.toFixed(4)}</>}
      </p>
    </div>
  ) : null;

  const proofBlock = selected ? (
    selected.proofs.length === 0 && !selected.cargoPath && !selected.sealed && !selected.signature ? (
      <p className="text-xs text-muted m-0">{selected.status === 'completed' ? 'No proof photos were recorded.' : 'Proof photos appear here once the driver completes the load.'}</p>
    ) : history ? (
      <>
        {signatureCard}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px' }}>
          {selected.proofs.map(p => (
            <button key={p.id} type="button" onClick={() => urls[p.photo_path] && setLightbox(urls[p.photo_path])} style={{ textAlign: 'left', padding: 0, border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden', background: 'var(--card-bg)', cursor: urls[p.photo_path] ? 'zoom-in' : 'default' }}>
              <span style={{ display: 'block', height: 120, background: 'var(--card-bg-hover)' }}>
                {urls[p.photo_path] ? <img src={urls[p.photo_path]} alt={POD_LABEL[p.pod_type]} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : <span style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}><Camera size={18} color="var(--charcoal-light)" /></span>}
              </span>
              <span style={{ display: 'block', padding: '8px 10px' }}>
                <span className="text-xs font-bold text-primary" style={{ display: 'block' }}>{POD_LABEL[p.pod_type]}</span>
                <span className="text-xs text-muted" style={{ display: 'block' }}>{dtShort(p.taken_at)}</span>
                <span className="text-xs text-muted" style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><MapPin size={10} />{p.gps_lat != null ? `${p.gps_lat.toFixed(4)}, ${p.gps_lng?.toFixed(4)}` : 'No GPS'}</span>
              </span>
            </button>
          ))}
        </div>
        {(selected.cargoPath || selected.sealed) && (
          <div className="flex items-center" style={{ gap: '10px', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
            {selected.cargoPath && urls[selected.cargoPath] && (
              <button type="button" onClick={() => setLightbox(urls[selected.cargoPath!])} style={{ padding: 0, border: '1px solid var(--border-color)', borderRadius: 8, overflow: 'hidden', width: 48, height: 48, cursor: 'zoom-in' }}>
                <img src={urls[selected.cargoPath]} alt="Cargo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </button>
            )}
            <span className="text-xs"><strong>At load start:</strong> {selected.sealed ? 'trailer sealed (plomba), photo not possible' : 'cargo photo taken when coupling'}</span>
          </div>
        )}
      </>
    ) : (
      <div className="flex flex-col" style={{ gap: '10px' }}>
        {signatureCard}
        {selected.cargoPath && urls[selected.cargoPath] && (
          <a href={urls[selected.cargoPath]} target="_blank" rel="noreferrer" className="flex items-center" style={{ gap: '10px', textDecoration: 'none' }}>
            <img src={urls[selected.cargoPath]} alt="Cargo" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--border-color)' }} />
            <span><span className="text-sm font-bold text-primary" style={{ display: 'block' }}>Cargo at load start</span><span className="text-xs text-muted">Photo taken when coupling</span></span>
          </a>
        )}
        {selected.sealed && <p className="text-xs m-0"><strong>Trailer sealed (plomba)</strong> — cargo photo not possible.</p>}
        {selected.proofs.map(p => (
          <a key={p.id} href={urls[p.photo_path]} target="_blank" rel="noreferrer" className="flex items-center" style={{ gap: '10px', textDecoration: 'none', pointerEvents: urls[p.photo_path] ? 'auto' : 'none' }}>
            <span style={{ width: 48, height: 48, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-color)', background: 'var(--card-bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {urls[p.photo_path] ? <img src={urls[p.photo_path]} alt={POD_LABEL[p.pod_type]} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Camera size={14} color="var(--charcoal-light)" />}
            </span>
            <span style={{ minWidth: 0 }}>
              <span className="text-sm font-bold text-primary" style={{ display: 'block' }}>{POD_LABEL[p.pod_type]}</span>
              <span className="text-xs text-muted" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {dtShort(p.taken_at)}{p.gps_lat != null && <><MapPin size={11} /> {p.gps_lat.toFixed(4)}, {p.gps_lng?.toFixed(4)}</>}
              </span>
            </span>
          </a>
        ))}
      </div>
    )
  ) : <p className="text-xs text-muted">Select a shipment.</p>;

  const infoBlock = selected ? (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px' }}>
        {info('Shipment ID', <span className="font-mono">{selected.ref}</span>)}
        {info('Status', <span className={`badge ${STATUS_META[selected.status].badge}`}>{STATUS_META[selected.status].label}</span>)}
        {info('Driver', <span className="flex items-center" style={{ gap: '8px' }}>{selected.driver}{phone && <a href={`tel:${phone}`} title={`Call ${phone}`} style={{ color: 'var(--brand-red)' }}><Phone size={13} /></a>}</span>)}
        {info('Unit', [selected.unit, selected.trailer].filter(Boolean).join(' / ') || '—')}
        {info('Pick Up Location', selected.origin ?? selected.carrier ?? '—')}
        {info('Drop Off Location', selected.destination ?? '—')}
        {info('Ship Time', dtShort(selected.departure))}
        {info('Loading', (() => {
          const st = loadingStateOf(selected);
          return (
            <span className="flex items-center" style={{ gap: '8px', flexWrap: 'wrap' }}>
              {st === 'none' && <span className="text-muted">{selected.kind === 'awaiting' ? '—' : 'Not started'}</span>}
              <LoadingChip s={selected} />
              {st === 'loading' && selected.loadingStart && <span className="text-xs text-muted">since {timeOnly(selected.loadingStart)}</span>}
              {st === 'loaded' && selected.loadingStart && selected.loadingEnd && <span className="text-xs text-muted">took {span(selected.loadingStart, selected.loadingEnd)}</span>}
              {selected.kind !== 'awaiting' && selected.status !== 'completed' && st !== 'loaded' && (
                <button type="button" className="comp-edit-btn" disabled={settingLoading} onClick={() => setLoading(selected, st === 'none' ? 'started' : 'finished')}>
                  {st === 'none' ? 'Mark loading' : 'Mark loaded'}
                </button>
              )}
            </span>
          );
        })())}
        {info('Delivery Cut-off', dtShort(selected.cutoff))}
        {info('Delivered', dtShort(selected.delivered))}
        {info('Duration', span(selected.departure, selected.delivered))}
        {info('Distance', distance)}
        {info('Trailer', selected.sealed ? 'Sealed (plomba)' : selected.trailer ?? '—')}
      </div>
      {selected.notes && <p className="text-xs text-muted" style={{ margin: '14px 0 0' }}><strong>Driver notes:</strong> {selected.notes}</p>}
      {selected.status !== 'completed' && selected.driverId && (
        <button type="button" className="btn" style={{ marginTop: '14px', backgroundColor: 'var(--brand-red)', color: '#fff', borderColor: 'var(--brand-red)', fontWeight: 700 }} onClick={() => onAssign(selected.driverId)}>
          <Truck size={14} style={{ marginRight: 6 }} /> {selected.kind === 'awaiting' ? 'Assign load' : 'Switch load'}
        </button>
      )}
    </>
  ) : <p className="text-xs text-muted">Select a shipment.</p>;

  const mapCard = (
    <div className="glass-card" style={{ padding: 0, overflow: 'hidden', position: 'relative', minHeight: '360px' }}>
      <div ref={mapEl} style={{ position: 'absolute', inset: 0 }} />
      {selected && trail.length === 0 && !live && !selected.proofs.some(p => p.gps_lat != null) && (
        <span className="badge badge-dark" style={{ position: 'absolute', left: 12, top: 12, zIndex: 500 }}>No GPS for this shipment</span>
      )}
    </div>
  );

  // One panel: shipment details on top, delivery stages underneath.
  const activityPanel = panel('Shipment Activity', (
    <>
      {selected && selected.status !== 'completed' && riskLines(selected).length > 0 && (
        <div className="flex items-center" style={{ gap: '8px', margin: '0 0 14px', fontSize: '12.5px', color: 'var(--brand-red)', fontWeight: 700 }}>
          {riskIcon(selected)} <span>{riskLines(selected).join(' · ')}</span>
        </div>
      )}
      {infoBlock}
      <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '18px', paddingTop: '16px' }}>
        <p className="font-black text-primary m-0" style={{ fontSize: '14px', marginBottom: '10px' }}>Delivery Stages</p>
        {selected ? <ShipmentStages steps={steps} /> : <p className="text-xs text-muted">Select a shipment.</p>}
      </div>
    </>
  ));

  return (
    <div className="ship-grid mt-16">
      {/* ── Tracking / history list ── */}
      <aside className="glass-card ship-list">
        <div className="flex items-center" style={{ gap: '8px', marginBottom: '12px' }}>
          <p className="font-black text-primary m-0" style={{ fontSize: '17px', marginRight: 'auto' }}>{history ? 'Delivery History' : 'Tracking List'}</p>
          <span className="text-xs text-muted tabular-nums">{filtered.length}</span>
        </div>
        <div style={{ marginBottom: '10px' }}>
          <TableFilter
            className="fg--block"
            groups={history ? [{
              key: 'period', label: 'Period', single: true, neutral: '30',
              options: [{ value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }],
              selected: [period],
              onChange: (v) => setPeriod((v[0] ?? '30') as '7' | '30' | '90'),
            }] : [{
              key: 'status', label: 'Status', single: true, neutral: 'all',
              options: [{ value: 'all', label: 'All shipments' }, ...(Object.keys(STATUS_META) as SStatus[]).map(k => ({ value: k, label: STATUS_META[k].label }))],
              selected: [statusFilter],
              onChange: (v) => setStatusFilter((v[0] ?? 'all') as 'all' | SStatus),
            }]}
            search={{ value: search, onChange: setSearch, placeholder: 'Search load, driver, route…' }}
          />
        </div>
        <div className="ship-list-scroll">
          {filtered.length === 0 ? (
            <NoData />
          ) : filtered.map(s => {
            const active = selected?.key === s.key;
            return (
              <div
                key={s.key}
                onClick={() => setSelectedKey(s.key)}
                style={{ padding: '12px', borderRadius: '14px', marginBottom: '10px', cursor: 'pointer', background: 'var(--card-bg)', border: `1.5px solid ${active ? 'var(--brand-red)' : 'var(--border-color)'}` }}
              >
                <div className="flex items-start" style={{ gap: '10px' }}>
                  <span style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--card-bg-hover)', color: 'var(--charcoal)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {history ? <PackageCheck size={20} /> : <Package size={20} />}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="flex items-center justify-between" style={{ gap: '6px' }}>
                      <span className="text-xs text-muted">{s.typeLabel}</span>
                      <span className={`badge ${STATUS_META[s.status].badge}`}>{STATUS_META[s.status].label}</span>
                    </div>
                    <p className="flex items-center m-0" style={{ gap: '6px', margin: '2px 0 4px' }}>
                      <MemberAvatar name={s.driver} size={18} />
                      <span className="text-xs font-bold text-primary" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.driver}</span>
                    </p>
                    <p className="font-mono font-bold text-primary m-0" style={{ fontSize: '13.5px', overflowWrap: 'anywhere' }}>{s.ref} <LoadingChip s={s} />{s.status !== 'completed' && riskLines(s).length > 0 && riskIcon(s)}</p>
                    <p className="text-xs text-muted m-0 mt-4" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={11} /> {dtShort(s.delivered ?? s.departure ?? s.createdAt)}
                    </p>
                  </div>
                  <button type="button" onClick={(e) => { e.stopPropagation(); setExpanded(expanded === s.key ? null : s.key); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--charcoal-light)', padding: 0 }} aria-label="Details">
                    <ChevronDown size={16} style={{ transform: expanded === s.key ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
                  </button>
                </div>
                {(() => {
                  const fill = barFill(s);
                  const sched = scheduleOf(s);
                  return (
                    <>
                      <div className="si-legend">
                        {BAR_STAGES.map(b => <span key={b.key}><i style={{ background: b.color }} />{b.label}</span>)}
                      </div>
                      <div className="si-bar" aria-hidden="true">
                        {BAR_STAGES.map(b => (
                          <span key={b.key} className="si-seg" style={{ width: `${b.weight}%` }}>
                            <span style={{ width: `${fill[b.key]}%`, background: b.color }} />
                          </span>
                        ))}
                      </div>
                      <div className="si-rows">
                        <div className="si-row"><span><Route size={13} /> Distance</span><strong>{s.odoStart != null && s.odoEnd != null ? `${s.odoEnd - s.odoStart} mi` : '—'}</strong></div>
                        <div className="si-row"><span><Timer size={13} /> Schedule</span><strong style={{ color: sched.late ? 'var(--brand-red)' : undefined }}>{sched.text}</strong></div>
                        <div className="si-row"><span><ListChecks size={13} /> Stages</span><strong>{stagesOf(s)}</strong></div>
                        <div className="si-row"><span><Flag size={13} /> {s.status === 'completed' ? 'Delivered' : 'Cut-off'}</span><strong>{s.status === 'completed' ? (timeOnly(s.delivered) ?? '—') : (timeOnly(s.cutoff) ?? '—')}</strong></div>
                        {history && <div className="si-row"><span><Camera size={13} /> Proof</span><strong>{s.proofs.length} photo{s.proofs.length === 1 ? '' : 's'}</strong></div>}
                      </div>
                    </>
                  );
                })()}
                {!history && s.status !== 'completed' && s.driverId && (
                  <button type="button" className="comp-edit-btn" style={{ marginTop: '10px', width: '100%', justifyContent: 'center' }} onClick={(e) => { e.stopPropagation(); onAssign(s.driverId); }}>
                    <Truck size={12} /> {s.kind === 'awaiting' ? 'Assign load' : 'Switch load'}
                  </button>
                )}
                {expanded === s.key && (
                  <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }} className="text-xs">
                    <p className="m-0"><strong>{s.driver}</strong>{s.unit ? ` · ${[s.unit, s.trailer].filter(Boolean).join(' / ')}` : ''}</p>
                    {(s.origin || s.destination) && <p className="text-muted m-0 mt-4">{s.origin ?? '—'} → {s.destination ?? '—'}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      {/* ── Right side ── */}
      <div className="ship-main">
        <div className="ship-kpis">
          {history ? (
            <>
              {kpiCard('Deliveries', histKpi.count, <>in the last {period} days</>, <PackageCheck size={18} />)}
              {kpiCard('Avg. Duration', histKpi.avg == null ? '—' : histKpi.avg >= 60 ? `${Math.floor(histKpi.avg / 60)}h ${String(histKpi.avg % 60).padStart(2, '0')}m` : `${histKpi.avg}m`, <>departure to delivery</>, <Timer size={18} />)}
              {kpiCard('With Proof', `${histKpi.proofPct}%`, <>{histKpi.photos} photo{histKpi.photos === 1 ? '' : 's'} on file</>, <ShieldCheck size={18} />)}
            </>
          ) : (
            <>
              {kpiCard('Total Shipments', kpi.total, <><Delta current={kpi.total} previous={kpi.totalPrev} /> vs last month</>, <Package size={18} />)}
              {kpiCard('In Transit', kpi.inTransit, <>{kpi.awaiting} waiting to start</>, <Truck size={18} />)}
              {kpiCard('Delivered', kpi.done, <><Delta current={kpi.done} previous={kpi.donePrev} /> vs last month</>, <PackageCheck size={18} />)}
            </>
          )}
        </div>

        <div className="ship-map-row">
          {mapCard}
          {panel('Proof of Delivery', proofBlock, { minHeight: '360px' })}
        </div>
        {activityPanel}
      </div>

      {lightbox && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }} onClick={() => setLightbox(null)}>
          <button type="button" onClick={() => setLightbox(null)} style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', borderRadius: '50%', width: 36, height: 36, cursor: 'pointer' }} aria-label="Close"><X size={18} /></button>
          <img src={lightbox} alt="Proof" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: '10px' }} onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
