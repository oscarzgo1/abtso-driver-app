"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Eye, ClipboardX, BellOff, Users2, AlertTriangle, Quote, type LucideIcon } from "lucide-react";

interface ProblemPanel {
  icon: LucideIcon;
  tag: string;
  headline: string;
  teaser: ReactNode;
  /** A concrete, day-in-the-life scenario — makes the abstract cost
   * tangible instead of another generic bullet point. Framed as an
   * illustrative scenario, not a sourced customer quote. */
  scenario: string;
}

function ScenarioHook({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-bg-alt p-3.5">
      <Quote size={15} className="mt-0.5 shrink-0 text-charcoal-light" />
      <p className="text-xs italic leading-relaxed text-charcoal-mid">{text}</p>
    </div>
  );
}

function RouteLossTeaser() {
  return (
    <div className="rounded-xl border border-border bg-bg-alt p-4">
      <p className="text-[10px] font-bold uppercase tracking-wide text-charcoal-light">Net Margin Loss</p>
      <p className="mt-1 font-mono text-2xl font-black tabular-nums text-brand-red">(£142.50)</p>
      <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-charcoal-mid">
        <AlertTriangle size={13} className="shrink-0 text-amber-500" />
        Unbilled deadhead miles
      </div>
    </div>
  );
}

function TimesheetTeaser() {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-50 p-4">
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
      <p className="text-sm font-semibold text-amber-800">
        14 unverified Night Out &amp; weekend claims
      </p>
    </div>
  );
}

function IdlePulseTeaser() {
  return (
    <motion.div
      animate={{
        boxShadow: [
          "0 0 0 0 rgba(204,0,0,0)",
          "0 0 0 6px rgba(204,0,0,0.08)",
          "0 0 0 0 rgba(204,0,0,0)",
        ],
      }}
      transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      className="rounded-xl border border-brand-red/25 bg-brand-red-light p-4"
    >
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-red opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-red" />
        </span>
        <span className="text-xs font-bold uppercase tracking-wide text-brand-red">
          54m Stationary
        </span>
      </div>
      <p className="mt-2 font-mono text-sm font-black tabular-nums text-brand-red">
        (£18.00) <span className="text-xs font-semibold text-brand-red/70">unmonitored wage bleed</span>
      </p>
    </motion.div>
  );
}

function FragmentedRosterTeaser() {
  return (
    <div className="flex flex-wrap gap-2">
      <span className="rounded-full border border-border bg-bg-alt px-3 py-1.5 text-xs font-semibold text-charcoal-mid">
        3 disconnected Excel sheets
      </span>
      <span className="rounded-full border border-border bg-bg-alt px-3 py-1.5 text-xs font-semibold text-charcoal-mid">
        No unified PIN management
      </span>
    </div>
  );
}

const PANELS: ProblemPanel[] = [
  {
    icon: Eye,
    tag: "OPERATIONS & DISPATCH",
    headline: "You find out a route lost money weeks after it ran.",
    teaser: <RouteLossTeaser />,
    scenario:
      "A 12-truck fleet ran a Manchester–Leeds route for a full week before anyone noticed it was quietly losing money — fuel and driver cost had crept past what the load actually paid.",
  },
  {
    icon: ClipboardX,
    tag: "FINANCE & PAYROLL",
    headline: "Friday payroll takes two days of cross-checking.",
    teaser: <TimesheetTeaser />,
    scenario:
      "Every Friday, a payroll clerk cross-references three separate spreadsheets by hand just to work out who actually worked a Night Out and who simply claimed one.",
  },
  {
    icon: BellOff,
    tag: "COMPLIANCE & SAFETY",
    headline: "Inflated timesheets go unnoticed until the invoice arrives.",
    teaser: <IdlePulseTeaser />,
    scenario:
      "A driver logged as \"on shift\" for six hours was actually parked at a services for two of them — nobody caught it until the fuel receipts stopped adding up.",
  },
  {
    icon: Users2,
    tag: "FLEET & HR",
    headline: "Drivers, mechanics, and staff scattered across spreadsheets.",
    teaser: <FragmentedRosterTeaser />,
    scenario:
      "When a driver leaves, three different admins each have to remember which of four spreadsheets still has their PIN — and update all of them by hand.",
  },
];

/** Interactive expanding accordion replacing the old static 2x2 pain-point
 * grid: a horizontal row of panels on desktop where the active one grows
 * (flex-grow transition) while the rest collapse to a narrow icon+label
 * spine, and a click-to-expand vertical stack on mobile where hover isn't
 * a thing. Same underlying PANELS data drives both layouts so they can't
 * drift out of sync. Light-themed to match the rest of the page — only
 * the hero and its mockup use the dark-slate treatment. */
export function ProblemAccordion() {
  const [active, setActive] = useState(0);
  const [openMobile, setOpenMobile] = useState(0);

  return (
    <>
      {/* Desktop: hover-expanding horizontal panels */}
      <div className="hidden w-full gap-3 md:flex md:h-[560px] lg:h-[640px]">
        {PANELS.map((panel, i) => {
          const isActive = active === i;
          return (
            <div
              key={panel.tag}
              onMouseEnter={() => setActive(i)}
              onClick={() => setActive(i)}
              style={{ flexGrow: isActive ? 3 : 1 }}
              className={`relative flex min-w-0 cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border border-border bg-white p-6 transition-[flex-grow,box-shadow] duration-500 ease-out ${
                isActive ? "shadow-xl shadow-charcoal/8" : ""
              }`}
            >
              {isActive ? (
                <>
                  <div className="flex flex-col gap-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-red-light text-brand-red">
                      <panel.icon size={18} strokeWidth={2.25} />
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wide text-brand-red">
                      {panel.tag}
                    </span>
                    <h3 className="text-xl font-black leading-tight tracking-tight text-charcoal">
                      {panel.headline}
                    </h3>
                  </div>
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: 0.15 }}
                    className="flex flex-col gap-3"
                  >
                    <ScenarioHook text={panel.scenario} />
                    {panel.teaser}
                  </motion.div>
                </>
              ) : (
                <div className="flex h-full flex-col items-center justify-between py-2">
                  <panel.icon size={18} strokeWidth={2.25} className="shrink-0 text-charcoal-light" />
                  <span className="[writing-mode:vertical-rl] rotate-180 text-xs font-bold uppercase tracking-wide text-charcoal-light">
                    {panel.tag}
                  </span>
                  <span className="h-4 w-1 shrink-0 rounded-full bg-border" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile: click-to-expand vertical stack */}
      <div className="flex w-full flex-col gap-3 md:hidden">
        {PANELS.map((panel, i) => {
          const isOpen = openMobile === i;
          return (
            <div
              key={panel.tag}
              className="overflow-hidden rounded-2xl border border-border bg-white"
            >
              <button
                type="button"
                onClick={() => setOpenMobile(isOpen ? -1 : i)}
                className="flex w-full items-center gap-3 p-5 text-left"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-red-light text-brand-red">
                  <panel.icon size={18} strokeWidth={2.25} />
                </span>
                <div className="flex-1">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-brand-red">
                    {panel.tag}
                  </span>
                  <p className="mt-0.5 text-base font-black leading-tight text-charcoal">
                    {panel.headline}
                  </p>
                </div>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="flex flex-col gap-3 px-5 pb-5">
                      <ScenarioHook text={panel.scenario} />
                      {panel.teaser}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </>
  );
}
