// The makes a fleet can pick for a tractor unit (Add Asset). The lorry shown in
// Live Tracking is a line drawing, the same for every make.
export const TRUCK_MAKES = ['DAF', 'Volvo', 'Scania', 'MAN', 'Mercedes-Benz', 'Iveco', 'Renault', 'Ford Trucks', 'Other'] as const;

export const makeSlug = (make: string | null | undefined): string =>
  (make ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** A flat illustration of an articulated lorry (the same for every make). */
export function TruckImage({ width = 170 }: { make?: string | null; width?: number }) {
  const wheel = (cx: number) => (
    <g key={cx}>
      <circle cx={cx} cy="108" r="15" fill="#1E1F22" />
      <circle cx={cx} cy="108" r="8.5" fill="#C9CED6" />
      <circle cx={cx} cy="108" r="3.2" fill="#6B7280" />
    </g>
  );
  return (
    <svg viewBox="0 0 330 130" width={width} role="img" aria-label="Lorry" style={{ display: 'block', maxWidth: '100%' }}>
      <ellipse cx="165" cy="124" rx="150" ry="4" fill="#000" opacity="0.08" />
      {/* trailer: box body with curtain-side ribs and chassis */}
      <rect x="6" y="16" width="214" height="78" rx="4" fill="#F4F5F7" stroke="#C3C8D0" strokeWidth="1.5" />
      {Array.from({ length: 9 }, (_, i) => <line key={i} x1={26 + i * 22} y1="20" x2={26 + i * 22} y2="90" stroke="#DADEE4" strokeWidth="1.5" />)}
      <rect x="6" y="94" width="214" height="7" rx="2" fill="#3A3D43" />
      <rect x="34" y="101" width="60" height="5" rx="2" fill="#4A4E55" />
      {/* tractor: cab, roof fairing, windscreen, grille */}
      <path d="M224 24q0-4 4-4h30l8 22h-42z" fill="#A30000" />
      <path d="M226 98V46q0-5 5-5h46q6 0 9 5l17 25q3 4 3 9v18z" fill="#CC0000" />
      <path d="M262 47h15l14 21h-29z" fill="#DCE8F3" stroke="#B9C7D6" strokeWidth="1" />
      <path d="M246 47v49" stroke="#A30000" strokeWidth="1.5" />
      <rect x="241" y="70" width="8" height="3" rx="1.5" fill="#7A0000" />
      <rect x="296" y="76" width="9" height="16" rx="2" fill="#2B2D31" />
      <rect x="299" y="68" width="8" height="5" rx="2" fill="#FFF4C2" />
      <rect x="292" y="95" width="20" height="7" rx="2" fill="#2B2D31" />
      {/* chassis, fuel tank and wheel arches */}
      <rect x="206" y="98" width="100" height="6" rx="2" fill="#3A3D43" />
      <rect x="252" y="86" width="26" height="12" rx="3" fill="#9AA0AA" />
      <path d="M222 108a18 18 0 0 1 36 0z" fill="#A30000" />
      <path d="M272 108a18 18 0 0 1 36 0z" fill="#A30000" />
      {[48, 80, 112, 240, 290].map(wheel)}
    </svg>
  );
}
