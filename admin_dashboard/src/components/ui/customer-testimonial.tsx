import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Testimonial } from '@/data/testimonials';

interface CustomerTestimonialProps {
  items: Testimonial[];
  intervalMs?: number;
  className?: string;
  style?: CSSProperties;
}

/** Corner testimonial card for the login brand panel — same slide-down
 * cycle as the earlier FeatureCallout (which this replaces), showing a
 * real customer's name/title and quote, sourced from
 * src/data/testimonials.ts. A photo is optional — without one, an
 * initial-letter avatar is shown instead (an honest placeholder, not a
 * stand-in photo). Renders nothing when the list is empty, so this ships
 * safely before any real testimonials have been added. */
export function CustomerTestimonial({ items, intervalMs = 6000, className, style }: CustomerTestimonialProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (items.length <= 1) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % items.length), intervalMs);
    return () => clearInterval(id);
  }, [items.length, intervalMs]);

  if (items.length === 0) return null;
  const current = items[index];

  return (
    <div className={className} style={{ position: 'relative', overflow: 'hidden', ...style }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            padding: '14px 16px',
            borderRadius: '12px',
            background: 'rgba(255,255,255,0.12)',
            border: '1px solid rgba(255,255,255,0.18)',
            backdropFilter: 'blur(6px)',
          }}
        >
          <p style={{ fontSize: '12.5px', lineHeight: 1.45, margin: 0 }}>&ldquo;{current.quote}&rdquo;</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
            {current.photo ? (
              <img
                src={current.photo}
                alt={current.name}
                style={{ width: '30px', height: '30px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid rgba(255,255,255,0.3)' }}
              />
            ) : (
              <div
                aria-hidden="true"
                style={{
                  width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '12px', fontWeight: 700,
                }}
              >
                {current.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '11.5px', fontWeight: 700 }}>{current.name}</div>
              <div style={{ fontSize: '10.5px', opacity: 0.8 }}>{current.title}</div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
