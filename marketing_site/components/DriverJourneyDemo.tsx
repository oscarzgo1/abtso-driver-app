"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Camera,
  Check,
  ClipboardCheck,
  FileText,
  Link2,
  PackageCheck,
  Plus,
  Search,
  Timer,
  Truck,
  Monitor,
  type LucideIcon,
} from "lucide-react";
import { PhoneMockup } from "./PhoneMockup";

/** A shift's paperwork, start to finish, as the driver app actually runs
 * it: the walk-around check, confirming the trailer (including one that
 * isn't in the fleet), attaching the load, and proof of delivery. Screens
 * are simplified redraws of the real app's red/black/white screens, not
 * screenshots — illustrative data only, no real driver or customer. The
 * step list doubles as the controls; it auto-advances like the
 * Problem/Fix slideshow, with the progress bar as the countdown. */

const STEP_MS = 4800;

interface Step {
  id: string;
  icon: LucideIcon;
  title: string;
  body: string;
  office: string;
}

const STEPS: Step[] = [
  {
    id: "check",
    icon: ClipboardCheck,
    title: "Walk-around check",
    body: "Camera-only photos, odometer and a running timer — a 90-second \"check\" is flagged as rushed, a skipped one as missing.",
    office: "Check logged · 11m 42s · 0 defects",
  },
  {
    id: "trailer",
    icon: Link2,
    title: "The exact trailer",
    body: "Pick one of your trailers or type any number — Amazon, Katem or any loader's — so every check and load is tied to the right unit.",
    office: "Coupled: YK23 XYZ / AMZ 5521",
  },
  {
    id: "load",
    icon: Truck,
    title: "Load attached from the cab",
    body: "Load reference and customer, entered by the driver. Sat still too long with nothing attached? The app reminds them.",
    office: "In transit · AMZ-44817 · Amazon",
  },
  {
    id: "delivery",
    icon: PackageCheck,
    title: "Proof of delivery",
    body: "Two compulsory photos — the signed paperwork and the back of the empty trailer — in the office the moment they're taken.",
    office: "Delivered 14:32 · POD + load photo",
  },
];

function ScreenHeader({ title, tag }: { title: string; tag?: string }) {
  return (
    <div className="flex items-baseline gap-1.5 border-b border-border/70 pb-2.5">
      <span className="text-[12px] font-black text-charcoal">{title}</span>
      {tag && <span className="font-mono text-[10px] font-semibold text-charcoal-light">| {tag}</span>}
    </div>
  );
}

function CheckScreen() {
  const rows = [
    { label: "Odometer", value: "184 552", kind: "text" },
    { label: "Tyres & wheel nuts", kind: "tick" },
    { label: "Lights & indicators", kind: "tick" },
    { label: "Front of vehicle", kind: "photo" },
    { label: "Offside", kind: "photo" },
    { label: "Rear & number plate", kind: "photo" },
  ];
  return (
    <div className="flex h-full flex-col gap-2">
      <ScreenHeader title="Safety check" tag="YK23 XYZ" />
      <div className="flex items-center justify-between text-[9px] font-semibold text-charcoal-light">
        <span className="flex items-center gap-1 text-brand-red">
          <Truck size={10} /> Trailer AMZ 5521
        </span>
        <span className="flex items-center gap-1 font-mono">
          <Timer size={10} /> 11:42
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {rows.map((r, i) => (
          <motion.div
            key={r.label}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 + i * 0.22, duration: 0.3 }}
            className="flex items-center justify-between rounded-lg border border-border/70 bg-white px-2.5 py-2"
          >
            <span className="text-[10px] font-bold text-charcoal">
              {r.label} <span className="text-brand-red">*</span>
            </span>
            {r.kind === "text" && <span className="font-mono text-[10px] font-bold text-charcoal">{r.value}</span>}
            {r.kind === "tick" && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.4 + i * 0.22, type: "spring", bounce: 0.5 }}
                className="flex h-4 w-4 items-center justify-center rounded bg-brand-red"
              >
                <Check size={10} strokeWidth={3.5} className="text-white" />
              </motion.span>
            )}
            {r.kind === "photo" && (
              <motion.span
                initial={{ backgroundColor: "#6b6b6b" }}
                animate={{ backgroundColor: "#333333" }}
                transition={{ delay: 0.5 + i * 0.22 }}
                className="flex h-5 w-7 items-center justify-center rounded"
              >
                {i < 5 ? <Check size={10} strokeWidth={3} className="text-white" /> : <Camera size={10} className="text-white" />}
              </motion.span>
            )}
          </motion.div>
        ))}
      </div>
      <div className="mt-auto grid grid-cols-2 gap-2">
        <span className="rounded-lg border border-border py-2 text-center text-[9px] font-bold text-charcoal-mid">Save as Draft</span>
        <span className="rounded-lg bg-brand-red py-2 text-center text-[9px] font-black text-white">Submit</span>
      </div>
    </div>
  );
}

function TrailerScreen() {
  return (
    <div className="flex h-full flex-col gap-2.5">
      <ScreenHeader title="Trailer number" />
      <p className="text-[9px] text-charcoal-light">Select the trailer, or type its number if it isn&apos;t one of ours.</p>
      <div className="flex items-center gap-1.5 rounded-lg bg-bg-alt px-2.5 py-2">
        <Search size={11} className="text-charcoal-light" />
        <motion.span
          initial={{ width: 0 }}
          animate={{ width: "auto" }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          className="overflow-hidden whitespace-nowrap font-mono text-[10px] font-bold text-charcoal"
        >
          AMZ 5521
        </motion.span>
        <motion.span
          animate={{ opacity: [1, 0, 1] }}
          transition={{ repeat: Infinity, duration: 0.9 }}
          className="h-3 w-px bg-charcoal"
        />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.1, duration: 0.35 }}
        className="flex items-center gap-2 rounded-lg bg-brand-red-light px-2.5 py-2.5 ring-1 ring-brand-red/40"
      >
        <Plus size={13} className="shrink-0 text-brand-red" />
        <div className="flex flex-col">
          <span className="font-mono text-[10px] font-black text-charcoal">Use &quot;AMZ 5521&quot;</span>
          <span className="text-[8.5px] text-charcoal-mid">Trailer not in our fleet (e.g. Amazon, Katem)</span>
        </div>
      </motion.div>
      <p className="mt-1 text-[8px] font-bold uppercase tracking-wide text-charcoal-light">Our trailers</p>
      {["TRL-204", "TRL-311", "TRL-418"].map((t) => (
        <div key={t} className="flex items-center gap-2 rounded-lg bg-bg-alt px-2.5 py-2">
          <Truck size={11} className="text-brand-red" />
          <span className="font-mono text-[10px] font-bold text-charcoal-mid">{t}</span>
        </div>
      ))}
    </div>
  );
}

function LoadScreen() {
  return (
    <div className="flex h-full flex-col gap-2.5">
      <ScreenHeader title="Attach load" />
      {[
        { label: "Load reference *", value: "AMZ-44817" },
        { label: "Customer / carrier *", value: "Amazon Logistics" },
      ].map((f, i) => (
        <div key={f.label} className="flex flex-col gap-1">
          <span className="text-[8.5px] font-bold uppercase tracking-wide text-charcoal-light">{f.label}</span>
          <div className="rounded-lg bg-bg-alt px-2.5 py-2">
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 + i * 0.6 }}
              className="text-[10.5px] font-bold text-charcoal"
            >
              {f.value}
            </motion.span>
          </div>
        </div>
      ))}
      <motion.span
        initial={{ scale: 0.96, opacity: 0.6 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="rounded-lg bg-brand-red py-2.5 text-center text-[10px] font-black uppercase tracking-wide text-white"
      >
        Attach load
      </motion.span>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2.2 }}
        className="mt-auto rounded-xl bg-charcoal p-3 text-white"
      >
        <p className="text-[9.5px] font-black">Has load AMZ-44817 been delivered?</p>
        <p className="mt-0.5 text-[8.5px] text-white/70">You&apos;ve been stopped for 30 min. Confirm it in Quick Actions.</p>
      </motion.div>
    </div>
  );
}

function DeliveryScreen() {
  return (
    <div className="relative flex h-full flex-col gap-2.5">
      <ScreenHeader title="Confirm delivery" />
      <p className="text-[9px] text-charcoal-light">Load AMZ-44817 — take both photos to confirm.</p>
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Paperwork", icon: FileText },
          { label: "Load evidence", icon: PackageCheck },
        ].map((slot, i) => (
          <motion.div
            key={slot.label}
            initial={{ backgroundColor: "#f5f5f5" }}
            animate={{ backgroundColor: "#e8e8e8" }}
            transition={{ delay: 0.4 + i * 0.7 }}
            className="relative flex h-28 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border border-border"
          >
            <slot.icon size={20} className="text-charcoal-mid" />
            <span className="text-[9px] font-bold text-charcoal">{slot.label}</span>
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.6 + i * 0.7, type: "spring", bounce: 0.5 }}
              className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-charcoal"
            >
              <Check size={9} strokeWidth={3.5} className="text-white" />
            </motion.span>
          </motion.div>
        ))}
      </div>
      <span className="rounded-lg bg-brand-red py-2.5 text-center text-[10px] font-black uppercase tracking-wide text-white">
        Confirm delivered
      </span>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2.1 }}
        className="mt-auto flex items-center gap-2 rounded-xl bg-charcoal px-3 py-2.5 text-white"
      >
        <Check size={14} className="shrink-0 text-brand-red" strokeWidth={3} />
        <span className="text-[9.5px] font-bold">Load AMZ-44817 marked as delivered.</span>
      </motion.div>
    </div>
  );
}

const SCREENS: Record<string, () => React.ReactElement> = {
  check: CheckScreen,
  trailer: TrailerScreen,
  load: LoadScreen,
  delivery: DeliveryScreen,
};

export function DriverJourneyDemo() {
  const [index, setIndex] = useState(0);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    const id = setTimeout(() => {
      setIndex((i) => (i + 1) % STEPS.length);
      setResetKey((k) => k + 1);
    }, STEP_MS);
    return () => clearTimeout(id);
  }, [resetKey]);

  const select = (i: number) => {
    setIndex(i);
    setResetKey((k) => k + 1);
  };

  const step = STEPS[index];
  const Screen = SCREENS[step.id];

  return (
    <div className="grid w-full items-center gap-12 lg:grid-cols-[1fr_auto]">
      <div className="grid">
        {STEPS.map((_, g) => (
          <GhostList key={g} active={g} />
        ))}
        <ol className="col-start-1 row-start-1 flex flex-col gap-3 self-start">
          {STEPS.map((s, i) => {
            const active = i === index;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => select(i)}
                  className={`group flex w-full gap-4 rounded-2xl border p-5 text-left transition-all duration-300 ${
                    active ? "border-brand-red/40 bg-white shadow-lg shadow-brand-red/5" : "border-transparent hover:bg-white/60"
                  }`}
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors duration-300 ${
                      active ? "bg-brand-red text-white" : "bg-charcoal/5 text-charcoal-mid"
                    }`}
                  >
                    <s.icon size={19} strokeWidth={2.25} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-charcoal-light">0{i + 1}</span>
                      <span className={`text-base font-black tracking-tight ${active ? "text-charcoal" : "text-charcoal-mid"}`}>{s.title}</span>
                    </span>
                    <AnimatePresence initial={false}>
                      {active && (
                        <motion.span
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                          className="overflow-hidden text-sm leading-relaxed text-charcoal-mid"
                        >
                          {s.body}
                        </motion.span>
                      )}
                    </AnimatePresence>
                    <span className="mt-2 block h-[3px] overflow-hidden rounded-full bg-border">
                      {active && (
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

      <div className="relative mx-auto">
        <PhoneMockup>
          <div className="flex h-full flex-col bg-white px-4 pb-5 pt-11">
            <AnimatePresence mode="wait">
              <motion.div
                key={step.id + resetKey}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="flex h-full flex-col"
              >
                <Screen />
              </motion.div>
            </AnimatePresence>
          </div>
        </PhoneMockup>

        {/* What the office sees at the same moment. */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step.id + "-office" + resetKey}
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ delay: 0.9, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="absolute -bottom-5 left-1/2 flex w-[260px] -translate-x-1/2 items-center gap-2.5 rounded-xl border border-border bg-white px-3.5 py-3 shadow-xl shadow-charcoal/10 lg:-left-28 lg:bottom-16 lg:translate-x-0"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-charcoal text-white">
              <Monitor size={15} />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-[9px] font-bold uppercase tracking-wide text-brand-red">Live in the office</span>
              <span className="truncate text-xs font-bold text-charcoal">{step.office}</span>
            </span>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// Invisible copies of the list, one per possible open step, stacked in one grid cell so the
// list reserves the tallest state's height and opening a step never shifts what's below it.
function GhostList({ active }: { active: number }) {
  return (
    <ol aria-hidden inert className="invisible col-start-1 row-start-1 flex flex-col gap-3">
      {STEPS.map((s, i) => (
        <li key={s.id}>
          <div className="flex w-full gap-4 rounded-2xl border border-transparent p-5">
            <span className="h-10 w-10 shrink-0" />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold">0{i + 1}</span>
                <span className="text-base font-black tracking-tight">{s.title}</span>
              </span>
              {i === active && <span className="text-sm leading-relaxed">{s.body}</span>}
              <span className="mt-2 block h-[3px]" />
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}
