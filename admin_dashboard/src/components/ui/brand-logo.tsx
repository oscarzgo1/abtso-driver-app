import type { CSSProperties } from 'react';

interface BrandLogoProps {
  iconSize?: number;
  textSize?: number;
  gap?: number;
  /** Uses the alpha-cut mark (`/logo_mark.png`) instead of the stock
   * white-backed one. `/logo.png` is a red mark baked onto opaque white,
   * which reads as a deliberate rounded badge on the collapsed rail but as
   * a stray white patch when the lockup sits directly on the sidebar's own
   * background — so that placement asks for the transparent cut instead. */
  transparentIcon?: boolean;
  /** White wordmark + white icon (via a brightness/invert filter on the
   * red mark, since there's no separate white asset) for use on a solid
   * brand-red background, where the normal charcoal text and red icon/dot
   * would both disappear. */
  light?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Overrides the wordmark's own font — the icon has no text of its own
   * to affect. Defaults to the app-wide 'Inter' used everywhere else this
   * logo appears; the login/auth screens pass their warmer Plus Jakarta
   * Sans instead (see .login-shell in index.css) so the wordmark matches
   * the rest of that card instead of standing out against it. */
  fontFamily?: string;
}

/** The full Tachyo wordmark, split into a red icon image + real text
 * instead of one flat PNG — so dark mode can turn "tachyo" white while
 * the truck/pin icon stays brand red, which a single CSS filter on a
 * combined raster image can't do (a filter applies to every pixel
 * uniformly). The icon reuses /logo.png, the same red-only mark already
 * used for the collapsed sidebar rail. Text color comes from
 * var(--charcoal), so it already follows the existing dark-mode
 * variables with no extra dark-mode-specific CSS needed here. */
export function BrandLogo({ iconSize = 28, textSize = 24, gap = 6, transparentIcon = false, light = false, className, style, fontFamily = "'Inter', sans-serif" }: BrandLogoProps) {
  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: `${gap}px`, ...style }}>
      <img
        src={transparentIcon ? '/logo_mark.png' : '/logo.png'}
        alt=""
        style={{ height: `${iconSize}px`, width: 'auto', objectFit: 'contain', filter: light ? 'brightness(0) invert(1)' : undefined }}
      />
      <span
        style={{
          fontFamily,
          fontWeight: 800,
          fontSize: `${textSize}px`,
          lineHeight: 1,
          letterSpacing: '-0.01em',
          color: light ? '#FFFFFF' : 'var(--charcoal)',
        }}
      >
        tachyo<span style={{ color: light ? '#FFFFFF' : 'var(--brand-red)' }}>.</span>
      </span>
    </div>
  );
}
