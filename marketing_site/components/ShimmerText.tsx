"use client";

/** Adapted from Spell's "Shimmer Text" (spell.sh, MIT license) — same
 * background-position sweep animation, but built on Tailwind's own
 * `bg-clip-text text-transparent` gradient-text recipe instead of the
 * original's manual `background` shorthand + WebkitTextFillColor mix,
 * which Framer Motion's style handling was dropping (backgroundClip and
 * backgroundImage kept computing back to their initial values). */

import { motion } from "motion/react";

interface ShimmerTextProps {
  children: React.ReactNode;
  className?: string;
  duration?: number;
  delay?: number;
}

export function ShimmerText({ children, className = "", duration = 1.6, delay = 0.5 }: ShimmerTextProps) {
  return (
    <span className="inline-block overflow-hidden">
      <motion.span
        className={`inline-block bg-clip-text bg-no-repeat text-transparent ${className}`}
        style={{
          backgroundColor: "var(--charcoal)",
          backgroundImage:
            "linear-gradient(to right, var(--charcoal) 0%, var(--brand-red) 40%, var(--brand-red) 60%, var(--charcoal) 100%)",
          backgroundSize: "50% 200%",
        }}
        initial={{ backgroundPositionX: "250%" }}
        animate={{ backgroundPositionX: ["-100%", "250%"] }}
        transition={{ duration, delay, repeat: Infinity, repeatDelay: 1.5, ease: "linear" }}
      >
        {children}
      </motion.span>
    </span>
  );
}

export default ShimmerText;
