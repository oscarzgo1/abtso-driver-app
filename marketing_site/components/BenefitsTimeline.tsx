"use client";

import { motion } from "motion/react";
import { Check } from "lucide-react";

export interface BenefitItem {
  title: string;
  description: string;
}

/** Vertical checklist timeline — same dot-and-connecting-line template as
 * a standard process timeline (icon node, connecting line, title +
 * description to the right), adapted for a benefits list rather than a
 * dated process: every node reads as delivered (solid brand-red check),
 * not a mix of complete/pending states, since these are concurrent
 * capabilities a client gets from day one, not a future roadmap. Each
 * node and its connecting line segment animates in on scroll, staggered
 * top to bottom. */
export function BenefitsTimeline({ items }: { items: BenefitItem[] }) {
  return (
    <div className="flex flex-col">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <div key={item.title} className="flex gap-5">
            <div className="flex flex-col items-center">
              <motion.span
                initial={{ scale: 0.5, opacity: 0 }}
                whileInView={{ scale: 1, opacity: 1 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.4, delay: i * 0.15, ease: [0.22, 1, 0.36, 1] }}
                className="z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-red text-white shadow-md shadow-brand-red/25"
              >
                <Check size={18} strokeWidth={3} />
              </motion.span>
              {!isLast && (
                <motion.span
                  initial={{ scaleY: 0 }}
                  whileInView={{ scaleY: 1 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.5, delay: i * 0.15 + 0.15, ease: [0.22, 1, 0.36, 1] }}
                  style={{ originY: 0 }}
                  className="w-px flex-1 bg-brand-red/25"
                />
              )}
            </div>
            <motion.div
              initial={{ opacity: 0, x: -12 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: i * 0.15 + 0.1, ease: [0.22, 1, 0.36, 1] }}
              className={`pt-1.5 ${isLast ? "pb-0" : "pb-10"}`}
            >
              <h3 className="text-lg font-black tracking-tight text-charcoal">{item.title}</h3>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-charcoal-mid">
                {item.description}
              </p>
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}
