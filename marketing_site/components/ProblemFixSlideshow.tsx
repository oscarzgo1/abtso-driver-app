"use client";

import { useEffect, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import {
  LayoutDashboard,
  ClipboardCheck,
  PackageCheck,
  Fuel,
  ShieldCheck,
  Building2,
  ArrowRight,
} from "lucide-react";
import { Button } from "./Button";
import { SectionHeader } from "./SectionHeader";
import { FeatureCard } from "./FeatureCard";
import { ProblemAccordion } from "./ProblemAccordion";
import { ShimmerText } from "./ShimmerText";

const AUTO_ADVANCE_MS = 5000;

// Deliberately distinct from BENEFITS in page.tsx — that's the outcome-led
// pitch ("what you get"), this is the module-led tour ("what's actually
// in the platform"). Kept non-overlapping on purpose.
const FEATURES = [
  {
    icon: LayoutDashboard,
    title: "One Operations Dashboard",
    body: "Who's on shift, who's idle, what's in transit and what's delivered — with a live tracking timeline for any load, from clock-in to proof of delivery.",
  },
  {
    icon: ClipboardCheck,
    title: "Walk-Around Checks, Evidenced",
    body: "Start and end-of-shift checks with camera-only photos, odometer readings and timers. Missed and rushed checks show up per employee.",
  },
  {
    icon: PackageCheck,
    title: "Proof of Delivery",
    body: "Loads attached from the cab, reminders when nothing's attached, and delivery confirmed with the paperwork and the emptied trailer on camera.",
  },
  {
    icon: Fuel,
    title: "Fuel Theft Detection",
    body: "Receipts, odometer and a dashboard photo on every fill-up — MPG is checked automatically and anything that doesn't add up is flagged.",
  },
  {
    icon: ShieldCheck,
    title: "Compliance & Driver Hours",
    body: "MOT and inspection due dates, VOR status, defects with photos and Working Time Directive hours — with lead-time alerts before anything lapses.",
  },
  {
    icon: Building2,
    title: "Secure, Invite-Only Accounts",
    body: "Every company's data is isolated at the database level, and accounts are set up by our team — no anonymous sign-ups poking around.",
  },
];

const SLIDES = [
  { id: "problem", label: "The Problem" },
  { id: "fix", label: "The Fix" },
] as const;

/** Merges the old separate "Problem" and "Fix" sections into one slideshow:
 * same two pitches, same components, but now framed as a single narrative
 * beat the visitor can step through — either by waiting (auto-advances
 * every 5s) or by clicking a tab directly. The progress bar under each
 * tab doubles as the auto-advance countdown, so the automatic behavior
 * is never a surprise. Auto-advance pauses while the pointer is over the
 * section — reading it shouldn't fight the timer — and stops for good
 * the moment someone clicks a tab themselves: that's a visitor saying
 * "I want to read this one", not "skip ahead in 5 seconds". */
export function ProblemFixSlideshow() {
  const [index, setIndex] = useState(0);
  const [resetKey, setResetKey] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(true);

  useEffect(() => {
    if (!autoAdvance || hovered) return;
    const id = setTimeout(() => {
      setIndex((i) => (i + 1) % SLIDES.length);
      setResetKey((k) => k + 1);
    }, AUTO_ADVANCE_MS);
    return () => clearTimeout(id);
  }, [resetKey, hovered, autoAdvance]);

  function selectSlide(i: number) {
    setAutoAdvance(false);
    if (i === index) return;
    setIndex(i);
    setResetKey((k) => k + 1);
  }

  return (
    <div
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      className="flex w-full flex-col items-center gap-12"
    >
      <div className="flex w-full max-w-md flex-col gap-2.5 sm:max-w-lg">
        <div className="grid grid-cols-2 gap-8">
          {SLIDES.map((slide, i) => (
            <button
              key={slide.id}
              type="button"
              onClick={() => selectSlide(i)}
              className={`text-sm font-bold uppercase tracking-wide transition-colors ${
                index === i ? "text-charcoal" : "text-charcoal-light hover:text-charcoal-mid"
              }`}
            >
              {slide.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-8">
          {SLIDES.map((slide, i) => (
            <div key={slide.id} className="relative h-[3px] overflow-hidden rounded-full bg-border">
              {autoAdvance && index === i && (
                <motion.div
                  key={resetKey}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: AUTO_ADVANCE_MS / 1000, ease: "linear" }}
                  style={{ transformOrigin: "left" }}
                  className="absolute inset-0 rounded-full bg-brand-red"
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid w-full">
        <Slide active={index === 0}>
          <SectionHeader
            kicker="The Problem"
            title="Every Haulage Business Runs Into These Costs"
            subtitle="Different roles feel it differently, but it's the same root cause: dispatch, cost, and payroll living in systems that don't talk to each other."
          />
          <ProblemAccordion />
        </Slide>
        <Slide active={index === 1}>
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-brand-red">
              The Fix
            </span>
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
              <ShimmerText>One Platform. Every Number You Need, In Real Time.</ShimmerText>
            </h2>
            <p className="text-base leading-relaxed text-charcoal-light sm:text-lg">
              Tachyo replaces the spreadsheet and phone call routine with a
              single system dispatch, finance, and compliance all work from.
            </p>
          </div>
          <div className="flex w-[calc(100%+3rem)] snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden scroll-px-6 lg:grid lg:w-full lg:snap-none lg:grid-cols-3 lg:gap-6 lg:overflow-visible lg:px-0 lg:pb-0">
            {FEATURES.map((f) => (
              <div key={f.title} className="grid w-[82%] shrink-0 snap-start sm:w-[48%] md:w-[38%] lg:w-auto">
                <FeatureCard {...f} />
              </div>
            ))}
          </div>
          <Button href="/features" variant="secondary" size="lg">
            Explore the full platform <ArrowRight size={18} />
          </Button>
        </Slide>
      </div>
    </div>
  );
}

// Both slides share one grid cell, so the section is always as tall as the taller
// one and switching never moves anything below it.
function Slide({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <motion.div
      inert={!active}
      aria-hidden={!active}
      initial={false}
      animate={{ opacity: active ? 1 : 0, y: active ? 0 : 8 }}
      transition={{ duration: 0.3, delay: active ? 0.25 : 0, ease: [0.22, 1, 0.36, 1] }}
      className={`col-start-1 row-start-1 flex w-full flex-col items-center gap-14 ${active ? "" : "pointer-events-none"}`}
    >
      {children}
    </motion.div>
  );
}
