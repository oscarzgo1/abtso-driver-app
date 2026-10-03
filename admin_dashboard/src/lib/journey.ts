// Journey history: turns a shift's raw GPS pings into labelled stretches —
// Moving, Stationary (a short pause), Stopped (parked for a long time) and
// No signal (the phone sent nothing) — so a manager can show exactly where
// a driver was and for how long, from clock-in onwards.

export type JourneyLabel = 'moving' | 'stationary' | 'stopped' | 'no_signal';

export interface Ping {
  lat: number;
  lng: number;
  /** metres per second as reported by the phone, if any */
  speed: number | null;
  /** epoch ms */
  t: number;
}

export interface Segment {
  label: JourneyLabel;
  start: number;
  end: number;
  durationMs: number;
  distanceM: number;
  /** first and last coordinate of the stretch (for no_signal: either side of the gap) */
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  /** every ping inside the stretch, for drawing */
  path: { lat: number; lng: number }[];
}

export interface JourneyOptions {
  /** a still stretch at least this long is "Stopped", shorter is "Stationary" */
  stoppedMinutes: number;
  /** no ping for longer than this is a "No signal" gap */
  maxGapMinutes: number;
}

export const DEFAULT_JOURNEY_OPTIONS: JourneyOptions = { stoppedMinutes: 15, maxGapMinutes: 20 };

const MOVING_SPEED_MS = 1.0; // about 2 mph
const MOVING_DISTANCE_M = 120; // more than GPS drift between two pings

export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/**
 * @param pings   GPS pings in time order
 * @param endAt   where the journey ends (clock-out time, or "now" for a live shift)
 */
export function buildJourney(pings: Ping[], endAt: number, opts: JourneyOptions = DEFAULT_JOURNEY_OPTIONS): Segment[] {
  const sorted = [...pings].sort((a, b) => a.t - b.t);
  if (sorted.length === 0) return [];
  const maxGapMs = opts.maxGapMinutes * 60000;

  type Interval = { label: 'moving' | 'still' | 'no_signal'; a: Ping; b: Ping; dist: number };
  const intervals: Interval[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    const dist = haversineM(a, b);
    if (b.t - a.t > maxGapMs) {
      intervals.push({ label: 'no_signal', a, b, dist });
      continue;
    }
    const moving = (b.speed ?? 0) >= MOVING_SPEED_MS || dist >= MOVING_DISTANCE_M;
    intervals.push({ label: moving ? 'moving' : 'still', a, b, dist });
  }
  // The tail between the last ping and the end of the shift.
  const last = sorted[sorted.length - 1];
  if (endAt - last.t > maxGapMs) {
    intervals.push({ label: 'no_signal', a: last, b: { ...last, t: endAt }, dist: 0 });
  } else if (endAt > last.t) {
    intervals.push({ label: 'still', a: last, b: { ...last, t: endAt }, dist: 0 });
  }
  if (intervals.length === 0) {
    return [{
      label: 'stationary', start: sorted[0].t, end: sorted[0].t, durationMs: 0, distanceM: 0,
      from: sorted[0], to: sorted[0], path: [sorted[0]],
    }];
  }

  // Merge neighbouring intervals of the same kind.
  type Run = { label: Interval['label']; a: Ping; b: Ping; dist: number; path: { lat: number; lng: number }[] };
  const runs: Run[] = [];
  for (const iv of intervals) {
    const prev = runs[runs.length - 1];
    if (prev && prev.label === iv.label) {
      prev.b = iv.b;
      prev.dist += iv.dist;
      prev.path.push({ lat: iv.b.lat, lng: iv.b.lng });
    } else {
      runs.push({ label: iv.label, a: iv.a, b: iv.b, dist: iv.dist, path: [{ lat: iv.a.lat, lng: iv.a.lng }, { lat: iv.b.lat, lng: iv.b.lng }] });
    }
  }

  // Short stretches decide Stationary vs Stopped; then merge again so two
  // neighbouring stops of the same kind read as one.
  const stoppedMs = opts.stoppedMinutes * 60000;
  const labelled: Segment[] = [];
  for (const r of runs) {
    const durationMs = r.b.t - r.a.t;
    const label: JourneyLabel = r.label === 'still' ? (durationMs >= stoppedMs ? 'stopped' : 'stationary') : r.label;
    const prev = labelled[labelled.length - 1];
    if (prev && prev.label === label) {
      prev.end = r.b.t;
      prev.durationMs = prev.end - prev.start;
      prev.distanceM += r.dist;
      prev.to = { lat: r.b.lat, lng: r.b.lng };
      prev.path.push(...r.path);
    } else {
      labelled.push({
        label, start: r.a.t, end: r.b.t, durationMs, distanceM: r.dist,
        from: { lat: r.a.lat, lng: r.a.lng }, to: { lat: r.b.lat, lng: r.b.lng }, path: r.path,
      });
    }
  }
  // A short pause squeezed between two stops is still one parked period.
  // (Stationary then Stopped back to back are merged into Stopped.)
  const out: Segment[] = [];
  for (const seg of labelled) {
    const prev = out[out.length - 1];
    const stillKinds = (l: JourneyLabel) => l === 'stationary' || l === 'stopped';
    if (prev && stillKinds(prev.label) && stillKinds(seg.label)) {
      prev.end = seg.end;
      prev.durationMs = prev.end - prev.start;
      prev.label = prev.durationMs >= stoppedMs ? 'stopped' : 'stationary';
      prev.to = seg.to;
      prev.path.push(...seg.path);
    } else {
      out.push({ ...seg });
    }
  }
  return out;
}

export interface JourneySummary {
  movingMs: number;
  stationaryMs: number;
  stoppedMs: number;
  noSignalMs: number;
  distanceM: number;
  stops: number;
  longestStopMs: number;
}

export function summarise(segments: Segment[]): JourneySummary {
  const s: JourneySummary = { movingMs: 0, stationaryMs: 0, stoppedMs: 0, noSignalMs: 0, distanceM: 0, stops: 0, longestStopMs: 0 };
  for (const g of segments) {
    if (g.label === 'moving') { s.movingMs += g.durationMs; s.distanceM += g.distanceM; }
    else if (g.label === 'stationary') s.stationaryMs += g.durationMs;
    else if (g.label === 'stopped') { s.stoppedMs += g.durationMs; s.stops += 1; s.longestStopMs = Math.max(s.longestStopMs, g.durationMs); }
    else s.noSignalMs += g.durationMs;
  }
  return s;
}

export function formatDuration(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 1) return '<1m';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
}

export const LABEL_META: Record<JourneyLabel, { text: string; color: string }> = {
  moving: { text: 'Moving', color: '#16A34A' },
  stationary: { text: 'Stationary', color: '#D97706' },
  stopped: { text: 'Stopped', color: '#DC2626' },
  no_signal: { text: 'No signal', color: '#64748B' },
};
