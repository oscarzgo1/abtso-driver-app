"use client";

import { motion } from "motion/react";

/** Two soft, slowly-drifting glow blobs behind the hero — the same
 * restrained "gradient motion" treatment used on the admin dashboard's
 * login panel, reused here for visual continuity between the marketing
 * site and the product rather than inventing a different background
 * language for each. */
export function HeroGlow() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <motion.div
        className="absolute -top-32 -right-24 h-96 w-96 rounded-full bg-brand-red/10 blur-3xl"
        animate={{ x: [0, -20, 0], y: [0, 16, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-24 left-0 h-80 w-80 rounded-full bg-charcoal/5 blur-3xl"
        animate={{ x: [0, 16, 0], y: [0, -14, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      />
    </div>
  );
}
