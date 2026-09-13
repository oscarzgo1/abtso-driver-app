"use client";

import * as React from "react";
import { motion, type HTMLMotionProps } from "motion/react";

/** Literal port of "Blur In Text" (animbits, demo id 19228) — same
 * per-unit blur-to-focus stagger as the reference, word by word by
 * default. Used for headlines where the reveal itself should draw the
 * eye, not just fade the whole block in at once. */
export interface TextBlurInProps extends Omit<HTMLMotionProps<"span">, "children"> {
  children: string;
  duration?: number;
  delay?: number;
  by?: "character" | "word";
  staggerDelay?: number;
}

export function TextBlurIn({
  children,
  className,
  duration = 0.7,
  delay = 0,
  by = "word",
  staggerDelay = 0.05,
  ...props
}: TextBlurInProps) {
  const units = by === "word" ? children.split(" ") : children.split("");
  return (
    <motion.span className={className} {...props}>
      {units.map((unit, index) => (
        <motion.span
          key={index}
          initial={{ opacity: 0, filter: "blur(10px)", y: 8 }}
          whileInView={{ opacity: 1, filter: "blur(0px)", y: 0 }}
          viewport={{ once: true }}
          transition={{ duration, delay: delay + index * staggerDelay, ease: [0.22, 1, 0.36, 1] }}
          style={{ display: "inline-block" }}
        >
          {unit === " " ? " " : unit}
          {by === "word" && index < units.length - 1 && " "}
        </motion.span>
      ))}
    </motion.span>
  );
}
