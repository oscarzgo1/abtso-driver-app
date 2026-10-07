// ============================================================
// Map pins: small rounded pins in one style for drivers and trailers (soft
// tinted circle, white ring, short tail, glyph in the state's colour).
// Returned as HTML for L.divIcon; styles live in index.css (.mp-*).
// avatarSvg / trailerSvg are the round pictures used in lists.
// ============================================================

export const escapeHtml = (v: string) =>
  v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

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

export type PinState = 'live' | 'stationary' | 'idle' | 'nosignal' | 'still';

/** Small solid glyphs for the map pins (they take the pin's colour). */
const PERSON_GLYPH = '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c0-4.1 3.2-6.4 7-6.4s7 2.3 7 6.4z"/>';
const TRAILER_GLYPH = '<rect x="2.5" y="6" width="17" height="9" rx="1.6"/><rect x="19.5" y="11" width="2.5" height="2"/><circle cx="7" cy="17.4" r="1.9"/><circle cx="14" cy="17.4" r="1.9"/>';
const glyph = (body: string, size: number) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" aria-hidden="true">${body}</svg>`;

/**
 * Small rounded pin: a soft tinted circle with a white ring, a short tail and
 * a glyph in the state's colour (green moving, orange stationary, red idle, amber
 * no GPS, grey parked or ended). `label` (e.g. the tractor reg) sits above it.
 */
export function driverPinHtml(opts: { name: string; state?: PinState; label?: string | null }): string {
  const state = opts.state ?? 'live';
  const label = opts.label ? `<span class="mp-label">${opts.label}</span>` : '';
  return `<div class="mp-pin mp-driver mp-${state}"><span class="mp-tail"></span><span class="mp-bubble">${glyph(PERSON_GLYPH, 19)}</span>${label}</div>`;
}

/** The same pin for a trailer. */
export function trailerPinHtml(reg: string): string {
  return `<div class="mp-pin mp-trailer"><span class="mp-tail"></span><span class="mp-bubble">${glyph(TRAILER_GLYPH, 19)}</span><span class="mp-label">${escapeHtml(reg)}</span></div>`;
}

/** divIcon options shared by both pins (the tip of the tail is the position). */
export const DRIVER_PIN_SIZE: [number, number] = [34, 44];
export const DRIVER_PIN_ANCHOR: [number, number] = [17, 42];
export const TRAILER_PIN_SIZE: [number, number] = [34, 44];
export const TRAILER_PIN_ANCHOR: [number, number] = [17, 42];
