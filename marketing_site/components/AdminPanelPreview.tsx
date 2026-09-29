"use client";

/** Adapted from 0xUrvish's "Bento Card" (uselayouts.com, MIT license) —
 * same animated-tabs shell (sliding sidebar pill via layoutId, blurred
 * fade/slide content swap) rebuilt on our own design tokens instead of
 * shadcn's, with lucide-react in place of hugeicons. Redrawn to match the
 * current admin panel: the operations Dashboard, the Alert Panel's
 * single queue, per-employee walk-around compliance, and profitability.
 * Illustrative figures throughout (not a live data pull). Negative
 * values use accounting parentheses, never a literal minus sign.
 */

import { useMemo, useState } from "react";
import { motion, AnimatePresence, LayoutGroup } from "motion/react";
import {
  LayoutDashboard,
  Bell,
  ClipboardCheck,
  TrendingDown,
  AlertTriangle,
  Check,
  CalendarDays,
  Fuel,
  Clock,
  type LucideIcon,
} from "lucide-react";

interface TabConfig {
  id: string;
  label: string;
  icon: LucideIcon;
  header: string;
  description: string;
}

const TABS: TabConfig[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    header: "Dashboard",
    description: "Today's operation — and one load, start to finish.",
  },
  {
    id: "alerts",
    label: "Alert Panel",
    icon: Bell,
    header: "Alert Panel",
    description: "Everything waiting on a decision, in one queue.",
  },
  {
    id: "walkarounds",
    label: "Walk-Arounds",
    icon: ClipboardCheck,
    header: "Walk-Around Checks",
    description: "Who's checking their vehicle properly — and who isn't.",
  },
  {
    id: "profitability",
    label: "Profitability",
    icon: TrendingDown,
    header: "Profitability & Payroll",
    description: "Where this month's margin actually went.",
  },
];

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-white/60 p-2.5">
      <p className="font-mono text-sm font-black tabular-nums text-charcoal">{value}</p>
      <p className="mt-0.5 text-[8px] font-semibold uppercase leading-tight text-charcoal-light">{label}</p>
    </div>
  );
}

function DashboardPreview() {
  const steps = [
    { title: "Clocked in", detail: "YK23 XYZ / AMZ 5521", state: "done" },
    { title: "Load attached", detail: "AMZ-44817 · Amazon", state: "done" },
    { title: "On the road", detail: "Moving at 52 mph", state: "active" },
    { title: "Load delivered", detail: "Not confirmed yet", state: "pending" },
  ];
  return (
    <div className="flex h-full flex-col gap-2.5">
      <div className="grid grid-cols-4 gap-1.5">
        <StatTile value="12" label="On shift" />
        <StatTile value="2" label="Idle" />
        <StatTile value="7" label="In transit" />
        <StatTile value="38" label="Done this wk" />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 rounded-xl border border-border/60 bg-white/60 p-2.5">
        <p className="text-[8px] font-bold uppercase tracking-wide text-charcoal-light">Tracking · J. Carter</p>
        {steps.map((s, i) => (
          <motion.div
            key={s.title}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 + i * 0.12 }}
            className="flex items-center gap-2"
          >
            <span
              className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full ${
                s.state === "done" ? "bg-charcoal" : s.state === "active" ? "bg-brand-red" : "border border-border bg-white"
              }`}
            >
              {s.state === "done" && <Check size={8} strokeWidth={4} className="text-white" />}
              {s.state === "active" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />}
            </span>
            <span className="text-[9.5px] font-bold text-charcoal">{s.title}</span>
            <span className="ml-auto truncate text-[8.5px] text-charcoal-light">{s.detail}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function AlertsPreview() {
  const rows: { icon: LucideIcon; label: string; who: string; detail: string; tone: "red" | "dark" }[] = [
    { icon: Clock, label: "Idle 58m", who: "M. Patel", detail: "Stationary past threshold", tone: "red" },
    { icon: Fuel, label: "Fuel anomaly", who: "LD19 QRS", detail: "MPG 31% below its average", tone: "red" },
    { icon: ClipboardCheck, label: "Walk-around", who: "S. Khan", detail: "Rushed — 3m 12s", tone: "dark" },
    { icon: CalendarDays, label: "Holiday", who: "J. Carter", detail: "6–10 Oct · Approve?", tone: "dark" },
  ];
  return (
    <div className="flex h-full flex-col gap-1.5 overflow-hidden">
      <div className="flex w-fit items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[8.5px] font-bold text-charcoal">
        All Alerts (9) <span className="text-charcoal-light">▾</span>
      </div>
      {rows.map((r, i) => (
        <motion.div
          key={r.label}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 + i * 0.1 }}
          className="flex items-center gap-2 rounded-lg border border-border/60 bg-white/60 px-2.5 py-1.5"
        >
          <r.icon size={12} className={`shrink-0 ${r.tone === "red" ? "text-brand-red" : "text-charcoal"}`} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-[9.5px] font-bold text-charcoal">
              {r.label} · <span className="font-mono">{r.who}</span>
            </span>
            <span className="truncate text-[8px] text-charcoal-light">{r.detail}</span>
          </div>
          <span className="rounded bg-charcoal px-1.5 py-0.5 text-[7.5px] font-bold uppercase text-white">Review</span>
        </motion.div>
      ))}
    </div>
  );
}

function WalkaroundsPreview() {
  const rows = [
    { name: "J. Carter", done: 14, due: 14, missed: 0, rushed: 0 },
    { name: "S. Khan", done: 12, due: 14, missed: 1, rushed: 2 },
    { name: "M. Patel", done: 9, due: 12, missed: 3, rushed: 0 },
    { name: "R. Lewis", done: 10, due: 10, missed: 0, rushed: 1 },
  ];
  return (
    <div className="flex h-full flex-col gap-1.5 overflow-hidden">
      <div className="flex items-center justify-between rounded-lg bg-brand-red/5 px-2.5 py-1.5 text-[9px] font-bold text-charcoal">
        <span>45 of 50 checks done</span>
        <span className="text-brand-red">4 missed · 3 rushed</span>
      </div>
      {rows.map((r, i) => (
        <div key={r.name} className="flex items-center gap-2 rounded-lg border border-border/60 bg-white/60 px-2.5 py-2">
          <span className="w-14 text-[9.5px] font-bold text-charcoal">{r.name}</span>
          <span className="w-9 font-mono text-[9px] font-bold text-charcoal">
            {r.done}/{r.due}
          </span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
            <motion.span
              initial={{ width: 0 }}
              animate={{ width: `${(r.done / r.due) * 100}%` }}
              transition={{ delay: 0.1 + i * 0.1, duration: 0.6, ease: "easeOut" }}
              className={`block h-full rounded-full ${r.missed > 0 ? "bg-brand-red" : "bg-charcoal"}`}
            />
          </span>
          {r.missed + r.rushed > 0 ? (
            <AlertTriangle size={11} className="shrink-0 text-brand-red" />
          ) : (
            <Check size={11} className="shrink-0 text-charcoal" strokeWidth={3} />
          )}
        </div>
      ))}
    </div>
  );
}

function ProfitabilityPreview() {
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="rounded-xl border border-brand-red/25 bg-brand-red/5 p-3">
        <p className="text-[9px] font-bold uppercase tracking-wide text-charcoal-light">Net Shortfall This Month</p>
        <div className="mt-1 flex items-baseline gap-2">
          <p className="font-mono text-2xl font-black tabular-nums text-brand-red">(£1,534)</p>
          <span className="flex items-center gap-1 rounded-full bg-brand-red/10 px-1.5 py-0.5 text-[9px] font-bold text-brand-red">
            <TrendingDown size={10} />
            18% worse than last month
          </span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <StatTile value="£3,420" label="Revenue" />
        <StatTile value="£3,180" label="Payroll" />
        <StatTile value="£1,774" label="Fuel & AdBlue" />
      </div>
      <div className="mt-auto flex items-center gap-2 rounded-xl border border-border/60 bg-white/60 p-2.5">
        <Fuel size={13} className="shrink-0 text-charcoal-light" />
        <span className="text-[9px] font-semibold text-charcoal-mid">
          Fleet unit economics: <span className="font-mono text-brand-red">(£0.73)/mi</span>
        </span>
      </div>
    </div>
  );
}

export function AdminPanelPreview() {
  const [activeTab, setActiveTab] = useState(TABS[0]);

  const content = useMemo(() => {
    switch (activeTab.id) {
      case "dashboard":
        return <DashboardPreview />;
      case "alerts":
        return <AlertsPreview />;
      case "walkarounds":
        return <WalkaroundsPreview />;
      case "profitability":
        return <ProfitabilityPreview />;
      default:
        return null;
    }
  }, [activeTab.id]);

  return (
    <div className="group relative w-full max-w-xl overflow-hidden rounded-3xl border border-border bg-white shadow-2xl shadow-charcoal/5 transition-all duration-500 hover:-translate-y-1 hover:shadow-charcoal/10">
      <div className="relative z-10 space-y-1.5 p-5 sm:p-6">
        <h2 className="text-xs uppercase tracking-wide text-charcoal-light">Live From Our Admin Panel</h2>
        <p className="max-w-[420px] text-lg font-medium leading-snug text-charcoal sm:text-xl">
          See exactly where the money is leaking — the same dashboard your team would use.
        </p>
      </div>

      <div className="relative h-[300px] w-full overflow-hidden rounded-[2rem] sm:h-[320px]">
        <div className="absolute left-14 top-14 h-full w-full rounded-3xl border border-border/50 bg-bg-alt opacity-80" />

        <div className="absolute left-4 top-6 flex h-full w-[calc(100%-1rem)] flex-col overflow-hidden rounded-tl-3xl border-4 border-border bg-white shadow-xl sm:left-20 sm:w-full">
          <div className="relative flex items-center border-b border-border/70 px-5 py-4 backdrop-blur-sm">
            <div className="flex gap-1.5">
              <div className="h-2 w-2 rounded-full bg-charcoal-light/30" />
              <div className="h-2 w-2 rounded-full bg-charcoal-light/30" />
              <div className="h-2 w-2 rounded-full bg-charcoal-light/30" />
            </div>
            <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2">
              <span className="text-xs uppercase text-charcoal-light/60">app.tachyo.co.uk</span>
            </div>
          </div>

          <div className="flex flex-1 overflow-hidden">
            <div className="flex w-24 shrink-0 flex-col gap-1 border-r border-border/30 bg-bg-alt/40 p-2 pt-6 sm:w-32">
              <LayoutGroup>
                {TABS.map((tab) => {
                  const isActive = activeTab.id === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab)}
                      className={`relative flex cursor-pointer items-center gap-1.5 rounded-xl p-2 text-xs transition-colors ${
                        isActive ? "text-charcoal" : "text-charcoal-light hover:text-charcoal"
                      }`}
                    >
                      <tab.icon size={13} className="relative z-20 shrink-0" />
                      <span className="relative z-20 truncate font-medium">{tab.label}</span>
                      {isActive && (
                        <motion.div
                          layoutId="admin-preview-pill"
                          className="absolute left-0 z-30 h-4 w-[2px] rounded-full bg-brand-red"
                          transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                        />
                      )}
                      {isActive && (
                        <motion.div
                          layoutId="admin-preview-bg"
                          className="absolute inset-0 rounded-lg border border-border/40 bg-white"
                          transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                        />
                      )}
                    </button>
                  );
                })}
              </LayoutGroup>
            </div>

            <div className="relative flex min-w-0 flex-1 flex-col gap-3 overflow-hidden bg-white p-4 pt-5 sm:pr-24">
              <header className="flex flex-col gap-0.5">
                <h3 className="text-[10px] font-bold uppercase tracking-tight text-charcoal/60">{activeTab.header}</h3>
                <p className="text-[9px] leading-tight text-charcoal-light">{activeTab.description}</p>
              </header>

              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={activeTab.id}
                  initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
                  transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                  className="flex-1"
                >
                  {content}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
