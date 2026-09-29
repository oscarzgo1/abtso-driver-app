"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  LayoutDashboard,
  MapPinned,
  Bell,
  ClipboardCheck,
  PackageCheck,
  Fuel,
  ShieldCheck,
  CalendarDays,
  PoundSterling,
  BarChart3,
  Smartphone,
  Building2,
  Check,
  type LucideIcon,
} from "lucide-react";

/** All twelve modules used to be a long vertical stack — six-plus screens
 * of scrolling before you'd seen the last one. Same content, but only one
 * module is visible at a time now: a wrapping row of chips picks which,
 * a progress bar auto-advances every 6s (pausing on hover), and every
 * module sits in the same grid cell so switching never changes the
 * section's height — the same technique ProblemFixSlideshow uses. The
 * Header's "Security" link still deep-links here via #security: on
 * mount this reads the URL hash and opens directly on that module. */

const STEP_MS = 6000;

interface Module {
  icon: LucideIcon;
  kicker: string;
  anchor: string;
  title: string;
  body: string;
  points: string[];
}

const MODULES: Module[] = [
  {
    icon: LayoutDashboard,
    kicker: "Dispatch",
    anchor: "dashboard",
    title: "Operations Dashboard",
    body: "One screen for the whole day: who's registered, who's on shift, who's sat idle past your threshold, what's in transit, awaiting a load or awaiting a rate, and what's been completed this week — plus a live tracking timeline for any shipment, from clock-in to proof of delivery.",
    points: [
      "Live overview: on shift, idle, in transit, awaiting load or rate",
      "Shipment pipeline with status tabs and search",
      "Tracking timeline per load, with delivery photos attached",
      "Idle-driver panel showing time since last movement",
    ],
  },
  {
    icon: MapPinned,
    kicker: "Live Tracking",
    anchor: "",
    title: "Live Map & Depot Geofences",
    body: "Every active employee on a live map with your depot geofences drawn in, filterable by status, depot and speed. Tap a driver for their current tractor and trailer, or open their exact location in Google Maps.",
    points: [
      "Live GPS for the whole crew — no in-cab hardware",
      "Depot geofences detect arrivals automatically",
      "Status, location and speed filters",
    ],
  },
  {
    icon: Bell,
    kicker: "Alert Monitors",
    anchor: "",
    title: "One Alert Panel for Every Decision",
    body: "Emergency SOS, drivers idle past your threshold, fuel anomalies, fuel receipts and parking claims awaiting approval, skipped or rushed walk-around checks, and holiday requests — one queue, one category dropdown, and an audio alarm you can mute.",
    points: [
      "Approve holiday requests where you see them",
      "Fuel and parking claims reviewed in one place",
      "Unreviewed claims auto-approve after 10 hours, so payroll never stalls",
    ],
  },
  {
    icon: ClipboardCheck,
    kicker: "Compliance & Safety",
    anchor: "walk-around-checks",
    title: "Walk-Around Checks, Evidenced",
    body: "Start-of-shift safety checks and end-of-shift inspections done on the phone — camera-only photos (no gallery uploads), odometer readings and a running timer. A check done in 90 seconds shows up as rushed; a skipped one shows up as missing. Required for every employee, not just drivers.",
    points: [
      "Camera-only photo evidence, odometer and AdBlue levels",
      "Exact trailer confirmed — including third-party trailers (Amazon, Katem and other loaders)",
      "Per-employee summary of done, missed and rushed checks",
      "Full history with every photo, searchable by employee",
    ],
  },
  {
    icon: PackageCheck,
    kicker: "Shipments",
    anchor: "proof-of-delivery",
    title: "Loads & Proof of Delivery",
    body: "Drivers attach the load reference and customer from the cab. If the vehicle sits still too long with no load attached — or a load isn't confirmed — the app reminds them. Delivery can only be confirmed with two photos: the signed paperwork and the back of the emptied trailer, visible in the office the moment they're taken.",
    points: [
      "Load reference and customer required on every load",
      "Stationary reminders, with the wait time set by you",
      "Compulsory paperwork and load-evidence photos",
      "Carrier settlement import to reconcile what you're paid",
    ],
  },
  {
    icon: Fuel,
    kicker: "Cost Control",
    anchor: "",
    title: "Fuel Audit & Expenses",
    body: "Fuel and AdBlue receipts arrive with litres, an odometer reading and a photo of the dashboard, so MPG is worked out automatically for every vehicle. A fill-up that doesn't match the miles driven is flagged as a possible theft. Overnight parking claims are approved once and paid straight through payroll.",
    points: [
      "Receipt, dashboard photo and odometer on every fill-up",
      "MPG anomaly and rolling-drop detection per vehicle",
      "Parking claims reimbursed through payroll",
    ],
  },
  {
    icon: ShieldCheck,
    kicker: "Compliance & Safety",
    anchor: "",
    title: "Fleet Roadworthiness & Driver Hours",
    body: "MOT, tax and inspection due dates, VOR status, a defect registry with photos from the cab, and Working Time Directive monitoring for driver hours — with lead-time alerts before anything lapses.",
    points: [
      "Due-date tracking with configurable lead time",
      "VOR status and a defect registry with photos",
      "Driver hours and WTD monitoring",
    ],
  },
  {
    icon: CalendarDays,
    kicker: "Fleet & HR",
    anchor: "",
    title: "Employees & Holidays",
    body: "Drivers, mechanics and logistics staff in one employee database with PIN credentials and spreadsheet import — and a holiday calendar where employees request time off from the app and you approve or decline it from the office.",
    points: [
      "Profession grouping: drivers, mechanics, logistics",
      "Holiday requests with approve / decline and reasons",
      "Bulk import from a spreadsheet",
    ],
  },
  {
    icon: PoundSterling,
    kicker: "Finance & Payroll",
    anchor: "",
    title: "Rates, Payroll & Night Outs",
    body: "Per-driver and per-agency pay — hourly or fixed-shift rates, weekday/Saturday/Sunday differentials, Night Out allowances requested from the app, and reimbursed expenses — calculated from the shifts drivers actually clocked.",
    points: [
      "Agency vs. direct rate handling",
      "Weekend and Night Out differentials built in",
      "CSV / Excel exports for your payroll provider",
    ],
  },
  {
    icon: BarChart3,
    kicker: "Profitability",
    anchor: "",
    title: "Profitability Analytics",
    body: "Profit, revenue, payroll cost, fuel and margin trends over any period, a driver profitability ranking, and fleet economics per mile — filterable by driver, agency, depot and date range.",
    points: [
      "Profit, revenue, cost, fuel and margin trends",
      "Driver profitability ranking",
      "Fleet economics per mile",
    ],
  },
  {
    icon: Smartphone,
    kicker: "Driver App",
    anchor: "",
    title: "One App for the Whole Crew",
    body: "Clock in with a tractor and trailer, do the walk-around check, attach loads and prove delivery, log fuel and parking, report defects, raise an SOS, and request night outs and holidays — with a Driver ID and PIN, no email or password, and a clean red-and-black interface built for the cab.",
    points: [
      "Driver ID + PIN login",
      "Works for drivers, mechanics and logistics staff",
      "Automatic depot geofence detection",
    ],
  },
  {
    icon: Building2,
    kicker: "Security",
    anchor: "security",
    title: "Secure, Invite-Only, Multi-Tenant",
    body: "Every company gets its own isolated data space, enforced at the database level with row-level security — not just hidden behind a login screen. Accounts are set up by the Tachyo team rather than open sign-up, and two admin tiers (Payroll Admin and Logistics) keep pay data away from dispatch-only staff.",
    points: [
      "Row-level security scoping every table to its company",
      "Accounts created by Tachyo — no anonymous sign-ups",
      "Driver PINs stored as salted hashes, never in plain text",
    ],
  },
];

export function FeatureModulesSlideshow() {
  const [index, setIndex] = useState(0);
  const [resetKey, setResetKey] = useState(0);
  const [paused, setPaused] = useState(false);

  // Deep link from the Header's "Security" nav item (/features#security)
  // and similar anchors — open directly on the matching module.
  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (!hash) return;
    const i = MODULES.findIndex((m) => m.anchor === hash);
    if (i >= 0) setIndex(i);
  }, []);

  useEffect(() => {
    if (paused) return;
    const id = setTimeout(() => {
      setIndex((i) => (i + 1) % MODULES.length);
      setResetKey((k) => k + 1);
    }, STEP_MS);
    return () => clearTimeout(id);
  }, [resetKey, paused]);

  function select(i: number) {
    if (i === index) return;
    setIndex(i);
    setResetKey((k) => k + 1);
  }

  return (
    <div
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      className="flex w-full flex-col gap-8"
    >
      {/* Chips wrap onto extra rows rather than scrolling sideways, so every module name is fully
          visible at every width — a scroll strip clipped the last chip mid-word at the edge. */}
      <div className="flex w-full flex-wrap justify-center gap-2">
        {MODULES.map((m, i) => (
          <button
            key={m.title}
            type="button"
            onClick={() => select(i)}
            aria-current={i === index}
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-left text-xs font-bold transition-colors ${
              i === index
                ? "border-brand-red bg-brand-red text-white"
                : "border-border bg-white text-charcoal-mid hover:border-charcoal/30"
            }`}
          >
            <m.icon size={14} strokeWidth={2.25} className="shrink-0" />
            {m.title}
          </button>
        ))}
      </div>

      <div className="relative h-[3px] w-full overflow-hidden rounded-full bg-border">
        <motion.div
          key={resetKey}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: STEP_MS / 1000, ease: "linear" }}
          style={{ transformOrigin: "left" }}
          className="absolute inset-0 rounded-full bg-brand-red"
        />
      </div>

      <div className="grid">
        {MODULES.map((m, i) => (
          <ModulePanel key={m.title} module={m} active={i === index} />
        ))}
      </div>
    </div>
  );
}

// Every panel shares one grid cell (only the active one visible) so the section is always
// as tall as the tallest module and switching between them never shifts the page.
function ModulePanel({ module: m, active }: { module: Module; active: boolean }) {
  return (
    <motion.div
      id={m.anchor || undefined}
      inert={!active}
      aria-hidden={!active}
      initial={false}
      animate={{ opacity: active ? 1 : 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={`col-start-1 row-start-1 grid scroll-mt-24 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] ${
        active ? "" : "pointer-events-none"
      }`}
    >
      <div className="flex flex-col gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-charcoal text-white">
          <m.icon size={22} strokeWidth={2.25} />
        </span>
        <span className="text-xs font-bold uppercase tracking-wide text-brand-red">{m.kicker}</span>
        <h3 className="text-2xl font-black tracking-tight text-charcoal">{m.title}</h3>
      </div>
      <div className="flex flex-col gap-5 rounded-2xl border border-border bg-white p-7">
        <p className="text-base leading-relaxed text-charcoal-mid">{m.body}</p>
        <ul className="flex flex-col gap-2.5">
          {m.points.map((point) => (
            <li key={point} className="flex items-start gap-2.5 text-sm text-charcoal">
              <Check size={16} className="mt-0.5 shrink-0 text-brand-red" />
              {point}
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}
