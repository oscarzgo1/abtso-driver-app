import { useEffect, useRef } from 'react';

// ============================================================
// A drawn-signature box. Strokes are captured with pointer events (mouse,
// touch or pen) and exported as a small SVG string, the same format the
// driver app stores for delivery and sign-off signatures, so it can be
// shown anywhere with an <img>.
// ============================================================

const W = 520;
const H = 170;

export default function SignaturePad({ onChange, disabled }: { onChange: (svg: string | null) => void; disabled?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<[number, number][][]>([]);
  const drawing = useRef(false);

  const paint = () => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of strokes.current) {
      ctx.beginPath();
      s.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      if (s.length === 1) ctx.lineTo(s[0][0] + 0.1, s[0][1] + 0.1);
      ctx.stroke();
    }
  };

  const toSvg = (): string | null => {
    const pts = strokes.current.filter(s => s.length > 0);
    if (pts.length === 0) return null;
    const d = pts.map(s => s.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ') + (s.length === 1 ? ' l0.1 0.1' : '')).join(' ');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><path d="${d}" fill="none" stroke="#111" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  };

  const pos = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  };

  useEffect(() => { paint(); }, []);

  return (
    <div>
      <div style={{ position: 'relative', background: '#fff', border: '1px solid var(--border-color)', borderRadius: '10px', overflow: 'hidden', maxWidth: `${W}px` }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          style={{ display: 'block', width: '100%', height: 'auto', touchAction: 'none', cursor: disabled ? 'not-allowed' : 'crosshair' }}
          onPointerDown={(e) => {
            if (disabled) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            drawing.current = true;
            strokes.current.push([pos(e)]);
            paint();
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            strokes.current[strokes.current.length - 1].push(pos(e));
            paint();
          }}
          onPointerUp={() => { drawing.current = false; onChange(toSvg()); }}
          onPointerCancel={() => { drawing.current = false; onChange(toSvg()); }}
        />
        <span style={{ position: 'absolute', left: 14, right: 14, bottom: 30, borderBottom: '1px dashed #bbb', pointerEvents: 'none' }} />
        <span style={{ position: 'absolute', left: 14, bottom: 8, fontSize: '10px', color: '#999', pointerEvents: 'none' }}>Sign above the line</span>
      </div>
      <button
        type="button"
        className="comp-edit-btn"
        style={{ marginTop: '6px' }}
        disabled={disabled}
        onClick={() => { strokes.current = []; paint(); onChange(null); }}
      >
        Clear signature
      </button>
    </div>
  );
}
