import { useEffect, useRef, useState } from 'react';

interface KpiSparklineProps {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}

/** Builds a smooth SVG path through the given points using Catmull-Rom-derived cubic bezier segments — pure geometry, works for any real value series. */
function buildSmoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return '';
  let path = `M ${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  return path;
}

/** Small line-draw-in animated sparkline for a real, honestly-sourced value series (see useMetricHistory) — no synthetic data generation here. */
export function KpiSparkline({ data, color, width = 72, height = 28 }: KpiSparklineProps) {
  const pathRef = useRef<SVGPathElement>(null);
  const [pathLength, setPathLength] = useState(0);
  const [drawn, setDrawn] = useState(false);

  const padding = 3;
  const min = data.length ? Math.min(...data) : 0;
  const max = data.length ? Math.max(...data) : 0;
  const range = max - min || 1;

  const points = data.map((v, i) => ({
    x: padding + (i / Math.max(data.length - 1, 1)) * (width - padding * 2),
    y: height - padding - ((v - min) / range) * (height - padding * 2),
  }));

  const d = buildSmoothPath(points);

  // Measures the path once on mount, then draws it in via a dashoffset
  // transition. Later data updates reshape `d` immediately (no re-draw
  // animation) so a live realtime refresh doesn't replay the intro effect.
  useEffect(() => {
    if (pathRef.current) {
      setPathLength(pathRef.current.getTotalLength());
      requestAnimationFrame(() => setDrawn(true));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (data.length < 2) return null;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none" aria-hidden="true">
      <path
        ref={pathRef}
        d={d}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
        style={{
          strokeDasharray: pathLength,
          strokeDashoffset: drawn ? 0 : pathLength,
          transition: 'stroke-dashoffset 700ms cubic-bezier(0.65, 0, 0.35, 1), stroke 300ms ease',
        }}
      />
    </svg>
  );
}
