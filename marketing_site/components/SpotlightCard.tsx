"use client";

import { useMotionValue, motion, useMotionTemplate } from "motion/react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

/** Adapted from "Card Spotlight" (aceternity/manuarora700, demo id 986)
 * — same cursor-follow radial-gradient-masked glow as the reference. The
 * reference also layers a Three.js/@react-three/fiber animated dot-matrix
 * canvas on top of the spotlight; that's a heavy 3D dependency (and a
 * decorative flourish, not the actual spotlight mechanism) that doesn't
 * suit a B2B fleet/payroll site's tone or bundle size, so only the real
 * spotlight-follows-cursor effect was ported, not the canvas layer. */
export function SpotlightCard({
  children,
  className = "",
  radius = 260,
  color = "rgba(204, 0, 0, 0.10)",
}: {
  children: ReactNode;
  className?: string;
  radius?: number;
  color?: string;
}) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  function handleMouseMove({ currentTarget, clientX, clientY }: ReactMouseEvent<HTMLDivElement>) {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  }

  return (
    <div
      onMouseMove={handleMouseMove}
      className={`group relative overflow-hidden rounded-2xl border border-border bg-white ${className}`}
    >
      <motion.div
        className="pointer-events-none absolute -inset-px opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: color,
          maskImage: useMotionTemplate`radial-gradient(${radius}px circle at ${mouseX}px ${mouseY}px, white, transparent 80%)`,
          WebkitMaskImage: useMotionTemplate`radial-gradient(${radius}px circle at ${mouseX}px ${mouseY}px, white, transparent 80%)`,
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
