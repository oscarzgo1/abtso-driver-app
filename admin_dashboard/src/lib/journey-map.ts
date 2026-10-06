import L from 'leaflet';
import { LABEL_META, formatDuration, type Segment } from './journey';

// Draws a journey on a Leaflet layer: every recorded position is a dot (so a
// gap between two pings is not passed off as a road the driver took), joined by
// a faint dotted guide, and every place the driver stopped is a larger marker
// with its time and duration.

// One canvas renderer per map: hundreds of dots drawn as SVG nodes made the
// map slow, and changing them during a zoom could crash it.
const canvases = new WeakMap<L.Map, L.Canvas>();
const canvasFor = (map?: L.Map): L.Renderer | undefined => {
  if (!map) return undefined;
  let r = canvases.get(map);
  if (!r) { r = L.canvas({ padding: 0.5 }); canvases.set(map, r); }
  return r;
};

const hm = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export function drawJourney(
  layer: L.LayerGroup,
  segments: Segment[],
  opts: { selected?: number | null; onSelect?: (i: number) => void; map?: L.Map } = {},
): L.LatLngExpression[] {
  const bounds: L.LatLngExpression[] = [];
  const { selected = null, onSelect } = opts;
  const renderer = canvasFor(opts.map);

  segments.forEach((seg, i) => {
    const meta = LABEL_META[seg.label];
    const pts = seg.path.map(p => [p.lat, p.lng] as [number, number]);
    pts.forEach(p => bounds.push(p));
    const dim = selected !== null && selected !== i;

    if (seg.label === 'moving' || seg.label === 'no_signal') {
      L.polyline(pts, {
        renderer,
        color: meta.color,
        weight: 2,
        opacity: dim ? 0.2 : 0.55,
        dashArray: seg.label === 'no_signal' ? '2 10' : '1 7',
        lineCap: 'round',
        interactive: false,
      }).addTo(layer);
      // One dot per recorded position (not for a no-signal gap: nothing was recorded inside it).
      const dots = seg.label === 'moving' ? pts : [pts[0], pts[pts.length - 1]];
      dots.forEach(p => {
        L.circleMarker(p, { renderer, radius: 3.5, color: '#fff', weight: 1.5, fillColor: meta.color, fillOpacity: dim ? 0.3 : 1 })
          .addTo(layer)
          .on('click', () => onSelect?.(i));
      });
      return;
    }

    // A stop: where the driver stood still. A bold marker with a white centre
    // so it stands out from the route dots (no number).
    const c = seg.path[0];
    const big = seg.label === 'stopped';
    const marker = L.circleMarker([c.lat, c.lng], {
      renderer,
      radius: big ? 11 : 8,
      color: '#fff',
      weight: 3,
      fillColor: meta.color,
      fillOpacity: dim ? 0.35 : 1,
    })
      .addTo(layer)
      .on('click', () => onSelect?.(i));
    marker.bindTooltip(`${meta.text} ${hm(seg.start)} to ${hm(seg.end)} (${formatDuration(seg.durationMs)})`);
    L.circleMarker([c.lat, c.lng], {
      renderer, radius: big ? 3.5 : 2.5, color: '#fff', weight: 0, fillColor: '#fff', fillOpacity: dim ? 0.5 : 1, interactive: false,
    }).addTo(layer);
  });

  return bounds;
}
