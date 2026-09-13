import { motion } from 'framer-motion';
import type { CSSProperties } from 'react';

/** Adapted from the "Text Reveal" catalogue component (dillionverma /
 * magicui, demo id 856) — same two-layer per-word mechanism as the
 * reference: a low-opacity "ghost" copy of each word sitting behind a
 * copy whose opacity animates in, staggered word by word, left to right.
 *
 * One necessary change: the reference drives that per-word opacity off
 * scroll position inside a 200vh pinned track — built for a full-page
 * landing hero, not a compact dashboard section header. Wiring several
 * of these into one tab, as this app's headers need, would mean hundreds
 * of vh of hijacked scroll space before you could read past the first
 * one. This instead reveals the words once, staggered by mount order,
 * the moment the header renders — the same fade-in-from-ghost visual
 * signature, no scroll-jacking — mirroring how RevealOnMount already
 * stands in for a scroll-triggered reference elsewhere in this file.
 *
 * Colour is entirely `currentColor` (the ghost layer is just a dimmer
 * opacity of it), so a caller controls tone the normal way — via
 * className (text-primary, text-muted, uppercase, tracking, etc.) — same
 * as every other heading in this app, nothing hardcoded here. */

interface TextRevealHeaderProps {
  text: string;
  className?: string;
  style?: CSSProperties;
  /** Stagger position — lets a header higher up the page finish first when several sit close together. */
  index?: number;
}

export function TextRevealHeader({ text, className, style, index = 0 }: TextRevealHeaderProps) {
  const words = text.split(' ');
  return (
    <p className={className} style={{ display: 'flex', flexWrap: 'wrap', margin: 0, ...style }}>
      {words.map((word, i) => (
        <span key={i} style={{ position: 'relative', display: 'inline-block', marginRight: '0.28em' }}>
          <span aria-hidden="true" style={{ position: 'absolute', opacity: 0.22 }}>{word}</span>
          <motion.span
            initial={{ opacity: 0.22 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: index * 0.1 + i * 0.05, ease: [0.22, 1, 0.36, 1] }}
          >
            {word}
          </motion.span>
        </span>
      ))}
      <span className="sr-only">{text}</span>
    </p>
  );
}
