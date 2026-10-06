import L from 'leaflet';
import { LABEL_META, formatDuration, type Segment } from './journey';

// Draws a journey on a Leaflet layer: every recorded position is a dot (so a
// gap between two pings is not passed off as a road the driver took), joined by
// a faint dotted guide, and every place the driver stopped is a larger marker
// with its time and duration.

const hm = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export function drawJourney(
  layer: L.LayerGroup,
  segments: Segment[],
  opts: { selected?: number | null; onSelect?: (i: number) => void } = {},
): L.LatLngExpression[] {
  const bounds: L.LatLngExpression[] = [];
  const { selected = null, onSelect } = opts;
  let stopNo = 0;

  segments.forEach((seg, i) => {
    const meta = LABEL_META[seg.label];
    const pts = seg.path.map(p => [p.lat, p.lng] as [number, number]);
    pts.forEach(p => bounds.push(p));
    const dim = selected !== null && selected !== i;

    if (seg.label === 'moving' || seg.label === 'no_signal') {
      L.polyline(pts, {
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
        L.circleMarker(p, { radius: 3.5, color: '#fff', weight: 1.5, fillColor: meta.color, fillOpacity: dim ? 0.3 : 1 })
          .addTo(layer)
          .on('click', () => onSelect?.(i));
      });
      return;
    }

    // A stop: where the driver stood still.
    stopNo += seg.label === 'stopped' ? 1 : 0;
    const c = seg.path[0];
    const big = seg.label === 'stopped';
    const marker = L.circleMarker([c.lat, c.lng], {
      radius: big ? 10 : 7,
      color: '#fff',
      weight: 2.5,
      fillColor: meta.color,
      fillOpacity: dim ? 0.35 : 1,
    })
      .addTo(layer)
      .on('click', () => onSelect?.(i));
    marker.bindTooltip(`${meta.text} ${hm(seg.start)} to ${hm(seg.end)} (${formatDuration(seg.durationMs)})`);
    if (big) {
      L.marker([c.lat, c.lng], {
        interactive: false,
        icon: L.divIcon({
          className: '',
          html: `<span class="jm-stop-no" style="opacity:${dim ? 0.35 : 1}">${stopNo}</span>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        }),
      }).addTo(layer);
    }
  });

  return bounds;
}
