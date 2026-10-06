// ============================================================
// Map pins — one look for every live map: a teardrop pin holding a 3D-style
// character avatar for a driver (colours, hair and shirt are picked from the
// driver's name so the same person always looks the same), and a matching pin
// with a 3D trailer for a coupled trailer. Returned as HTML for L.divIcon;
// styles live in index.css (.mp-*).
// ============================================================

// One simple avatar for every employee and one simple trailer icon for every
// trailer: neutral, flat and on-brand, so the map reads at a glance and nobody
// is represented by a cartoon.
const DRIVER_RIM = '#CC0000';
const TRAILER_RIM = '#333333';

export const escapeHtml = (v: string) =>
  v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** The rim colour of an employee's pin (the same for everyone). */
export const accentFor = (_name?: string) => DRIVER_RIM;

/** A simple person (head and shoulders), the same for every employee. */
export function avatarSvg(_name?: string, size = 34): string {
  return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">
<circle cx="32" cy="32" r="32" fill="#EFEFEF"/>
<circle cx="32" cy="24" r="10.5" fill="#333333"/>
<path d="M11 58C11 45.5 20.5 39 32 39S53 45.5 53 58Z" fill="#333333"/>
</svg>`;
}

/** A simple trailer, the same for every trailer. */
export function trailerSvg(size = 26): string {
  return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">
<rect x="7" y="16" width="46" height="24" rx="3" fill="#333333"/>
<rect x="53" y="29" width="6" height="5" rx="1.5" fill="#333333"/>
<rect x="7" y="40" width="46" height="4" rx="1" fill="#555555"/>
<circle cx="19" cy="48" r="5.5" fill="#333333"/><circle cx="19" cy="48" r="2" fill="#fff"/>
<circle cx="34" cy="48" r="5.5" fill="#333333"/><circle cx="34" cy="48" r="2" fill="#fff"/>
</svg>`;
}

export type PinState = 'live' | 'idle' | 'nosignal' | 'still';

/** Teardrop pin with the driver's avatar; `label` (e.g. the tractor reg) sits beside it. */
export function driverPinHtml(opts: { name: string; state?: PinState; label?: string | null }): string {
  const state = opts.state ?? 'live';
  const accent = accentFor(opts.name || '?');
  const label = opts.label ? `<span class="mp-label">${opts.label}</span>` : '';
  return `<div class="mp-pin mp-driver mp-${state}" style="--mp-accent:${accent}">
<span class="mp-shadow"></span>
<span class="mp-bubble">${avatarSvg(opts.name || '?', 32)}<i class="mp-status"></i></span>
<span class="mp-tail"></span>${label}</div>`;
}

/** Teardrop pin with a 3D trailer. */
export function trailerPinHtml(reg: string): string {
  return `<div class="mp-pin mp-trailer" style="--mp-accent:${TRAILER_RIM}">
<span class="mp-shadow"></span>
<span class="mp-bubble">${trailerSvg(24)}</span>
<span class="mp-tail"></span><span class="mp-label">${escapeHtml(reg)}</span></div>`;
}

/** divIcon options shared by both pins (the tip of the drop is the position). */
export const DRIVER_PIN_SIZE: [number, number] = [44, 50];
export const DRIVER_PIN_ANCHOR: [number, number] = [22, 48];
export const TRAILER_PIN_SIZE: [number, number] = [36, 42];
export const TRAILER_PIN_ANCHOR: [number, number] = [18, 40];
