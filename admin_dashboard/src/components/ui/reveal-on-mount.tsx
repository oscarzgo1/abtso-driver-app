import { motion } from 'framer-motion';
import type { CSSProperties, ReactNode } from 'react';

interface RevealOnMountProps {
  children: ReactNode;
  /** Stagger position — each step adds a small delay so a group of cards animate in one after another. */
  index?: number;
  className?: string;
  style?: CSSProperties;
}

/** Simple fade+rise-in on mount, staggered by `index`. Remounts (and so
 * re-plays) whenever its parent conditionally renders it — e.g. switching
 * into the Analytics tab — standing in for the catalogue reference's
 * scroll-triggered TimelineAnimation, whose source wasn't available to
 * adapt directly. */
export function RevealOnMount({ children, index = 0, className, style }: RevealOnMountProps) {
  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
