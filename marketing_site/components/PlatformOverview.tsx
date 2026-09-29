"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import {
  BarChart3,
  Building2,
  Fuel,
  ImageIcon,
  MapPinned,
  PoundSterling,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

/** Sits directly under the Hero so a visitor gets the full shape of the
 * platform — every module, not just the one or two the page happens to
 * dwell on further down — without having to scroll through the Problem/Fix
 * slideshow, the driver-journey demo and the benefits list to piece it
 * together. Same auto-advancing list + progress-bar pattern as
 * DriverJourneyDemo and ProblemFixSlideshow, but the detail panel is a
 * real image slot instead of a redrawn app screen: `image` is left unset
 * until real screenshots/photos are supplied, and the slot renders a
 * labelled placeholder instead of inventing a picture. Drop a path under
 * /public and set `image` to swap a slide over once assets arrive. */

const STEP_MS = 5000;

interface Item {
  id: string;
  icon: LucideIcon;
  title: string;
  body: string;
  /** e.g. "/platform/dispatch.jpg" once the asset exists — left undefined shows a placeholder. */
  image?: string;
}

const ITEMS: Item[] = [
  {
    id: "dispatch",
    icon: MapPinned,
    title: "Live Dispatch Board",
    body: "Every driver, vehicle and load on one map in real time, with depot geofencing and shift KPIs — not a spreadsheet refreshed every hour.",
    image: "/features/dispatch.jpg",
  },
  {
    id: "compliance",
    icon: ShieldCheck,
    title: "Compliance & Walk-Arounds",
    body: "MOT and inspection due dates, VOR status and defect photos alongside every walk-around check — nothing slips through a forgotten column.",
    image: "/features/walkaround.jpg",
  },
  {
    id: "fuel",
    icon: Fuel,
    title: "Fuel & Theft Detection",
    body: "Litres, odometer and a dashboard photo on every fill-up. MPG is checked automatically, and a receipt that doesn't add up is flagged.",
    image: "/features/fuel.jpg",
  },
  {
    id: "payroll",
    icon: PoundSterling,
    title: "Payroll & Live Margin",
    body: "Night outs, weekend rates and holidays flow from what drivers actually did, and margin updates per shift and per depot — not at month-end.",
    image: "/features/payroll.jpg",
  },
  {
    id: "benchmarking",
    icon: BarChart3,
    title: "Depot-to-Depot Benchmarking",
    body: "See which depot is actually pulling its weight, filterable by driver, agency and date range — not just which one shouts loudest.",
    image: "/features/benchmarking.jpg",
  },
  {
    id: "secure",
    icon: Building2,
    title: "Secure, Invite-Only Accounts",
    body: "Every company's data is isolated at the database level, with MFA on admin logins — accounts are set up by our team, no open sign-ups.",
    image: "/features/secure.jpg",
  },
];

function ImageSlide({ item }: { item: Item }) {
  if (item.image) {
    return (
      <Image
        src={item.image}
        alt={item.title}
        fill
        sizes="(min-width: 1024px) 480px, 90vw"
        className="object-cover"
      />
    );
  }
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 border-2 border-dashed border-border bg-bg-alt/80 p-8 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-charcoal-light shadow-sm">
        <ImageIcon size={20} />
      </span>
      <p className="text-xs font-bold uppercase tracking-wide text-charcoal-light">Image coming soon</p>
      <p className="text-sm font-semibold text-charcoal-mid">{item.title}</p>
    </div>
  );
}

export function PlatformOverview() {
  const [index, setIndex] = useState(0);
  const [resetKey, setResetKey] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = setTimeout(() => {
      setIndex((i) => (i + 1) % ITEMS.length);
      setResetKey((k) => k + 1);
    }, STEP_MS);
    return () => clearTimeout(id);
  }, [resetKey, paused]);

  const select = (i: number) => {
    if (i === index) return;
    setIndex(i);
    setResetKey((k) => k + 1);
  };

  const active = ITEMS[index];

  return (
    <div
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      className="grid w-full items-center gap-12 lg:grid-cols-[1fr_auto]"
    >
      <div className="grid">
        {/* Invisible copies reserve the tallest row's height so opening one item never shifts the section below. */}
        {ITEMS.map((_, g) => (
          <GhostList key={g} active={g} />
        ))}
        <ol className="col-start-1 row-start-1 flex flex-col gap-2 self-start">
          {ITEMS.map((it, i) => {
            const isActive = i === index;
            return (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => select(i)}
                  className={`flex w-full gap-4 rounded-2xl border p-4 text-left transition-all duration-300 ${
                    isActive ? "border-brand-red/40 bg-white shadow-lg shadow-brand-red/5" : "border-transparent hover:bg-white/60"
                  }`}
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors duration-300 ${
                      isActive ? "bg-brand-red text-white" : "bg-charcoal/5 text-charcoal-mid"
                    }`}
                  >
                    <it.icon size={19} strokeWidth={2.25} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className={`text-base font-black tracking-tight ${isActive ? "text-charcoal" : "text-charcoal-mid"}`}>
                      {it.title}
                    </span>
                    <AnimatePresence initial={false}>
                      {isActive && (
                        <motion.span
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                          className="overflow-hidden text-sm leading-relaxed text-charcoal-mid"
                        >
                          {it.body}
                        </motion.span>
                      )}
                    </AnimatePresence>
                    <span className="mt-2 block h-[3px] overflow-hidden rounded-full bg-border">
                      {isActive && (
                        <motion.span
                          key={resetKey}
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: 1 }}
                          transition={{ duration: STEP_MS / 1000, ease: "linear" }}
                          style={{ transformOrigin: "left" }}
                          className="block h-full rounded-full bg-brand-red"
                        />
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="relative mx-auto aspect-[4/3] w-full max-w-[480px] overflow-hidden rounded-3xl shadow-xl shadow-charcoal/10 lg:w-[480px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={active.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0"
          >
            <ImageSlide item={active} />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function GhostList({ active }: { active: number }) {
  return (
    <ol aria-hidden inert className="invisible col-start-1 row-start-1 flex flex-col gap-2">
      {ITEMS.map((it, i) => (
        <li key={it.id}>
          <div className="flex w-full gap-4 rounded-2xl border border-transparent p-4">
            <span className="h-10 w-10 shrink-0" />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-base font-black tracking-tight">{it.title}</span>
              {i === active && <span className="text-sm leading-relaxed">{it.body}</span>}
              <span className="mt-2 block h-[3px]" />
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}
