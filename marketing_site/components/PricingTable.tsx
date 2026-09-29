"use client";

/** Adapted from Kokonut UI's "Pricing Table" (21st.dev community listing,
 * source at kokonutui.com/docs/components/pricing) — the underlying block
 * itself now sits behind their paid Pro tier so its exact source wasn't
 * copyable (same situation PhoneMockup.tsx ran into), but the public demo
 * still exposes the full data shape (plans + tiered features) and the
 * live preview panel is enough to rebuild the structure faithfully: a
 * billing-interval toggle above three selectable plan cards, with the
 * popular plan ringed, and a full feature-comparison matrix underneath
 * instead of bullet lists buried inside each card. Rebuilt on Tachyo's
 * own real feature set (drawn from what's already documented elsewhere
 * on this site) rather than the reference's placeholder copy, and kept
 * on "Custom quote" pricing throughout since Tachyo is sold per-fleet,
 * not a fixed self-serve number — never inventing a price that doesn't
 * exist. */

import { useState } from "react";
import { Check, Minus } from "lucide-react";
import { Button } from "./Button";

type Tier = "starter" | "growth" | "enterprise";

const TIER_RANK: Record<Tier, number> = { starter: 0, growth: 1, enterprise: 2 };

const PLANS: { id: Tier; name: string; forWhom: string; popular?: boolean }[] = [
  {
    id: "starter",
    name: "Starter",
    forWhom: "Fleets getting off spreadsheets for the first time.",
  },
  {
    id: "growth",
    name: "Growth",
    forWhom: "Fleets ready to see margin, not just movement.",
    popular: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    forWhom: "Larger operations with multiple depots and custom needs.",
  },
];

const FEATURES: { name: string; minTier: Tier }[] = [
  { name: "Operations Dashboard & Live Map", minTier: "starter" },
  { name: "Driver App (clock in, fuel, defects, SOS, holidays)", minTier: "starter" },
  { name: "Walk-Around Checks with Photo Evidence", minTier: "starter" },
  { name: "Alert Panel (SOS, idle time, approvals)", minTier: "starter" },
  { name: "Employee Database & Holiday Requests", minTier: "starter" },
  { name: "MOT & Compliance Tracking", minTier: "starter" },
  { name: "Secure, Isolated Company Data", minTier: "starter" },
  { name: "Loads & Proof of Delivery Photos", minTier: "growth" },
  { name: "Fuel Audit & Theft Detection", minTier: "growth" },
  { name: "Rates, Payroll & Expense Claims", minTier: "growth" },
  { name: "Profitability Analytics", minTier: "growth" },
  { name: "Carrier Settlement Import", minTier: "growth" },
  { name: "Defect Registry, VOR & Driver Hours (WTD)", minTier: "growth" },
  { name: "CSV / Excel Export", minTier: "growth" },
  { name: "Multi Depot Analytics & Benchmarking", minTier: "enterprise" },
  { name: "Dedicated Onboarding", minTier: "enterprise" },
  { name: "Custom Reporting", minTier: "enterprise" },
  { name: "Priority Support & SLA", minTier: "enterprise" },
];

export function PricingTable() {
  const [selected, setSelected] = useState<Tier>("growth");
  const [interval, setBillingInterval] = useState<"monthly" | "annual">("monthly");

  return (
    <div className="flex w-full flex-col gap-10">
      <div className="flex justify-center">
        <div className="inline-flex rounded-full border border-border bg-bg-alt p-1">
          {(["monthly", "annual"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setBillingInterval(opt)}
              className={`rounded-full px-5 py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
                interval === opt ? "bg-charcoal text-white shadow-sm" : "text-charcoal-light hover:text-charcoal"
              }`}
            >
              {opt === "monthly" ? "Billed Monthly" : "Billed Annually"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const isSelected = selected === plan.id;
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => setSelected(plan.id)}
              className={`flex flex-col gap-5 rounded-2xl border p-8 text-left transition-all duration-300 ${
                isSelected
                  ? "border-brand-red bg-white shadow-xl shadow-brand-red/10 ring-1 ring-brand-red"
                  : "border-border bg-white hover:-translate-y-1 hover:shadow-lg hover:shadow-charcoal/5"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xl font-black text-charcoal">{plan.name}</h3>
                {plan.popular && (
                  <span className="shrink-0 rounded-full bg-brand-red-light px-3 py-1 text-xs font-bold uppercase tracking-wide text-brand-red">
                    Most Popular
                  </span>
                )}
              </div>
              <p className="text-sm text-charcoal-light">{plan.forWhom}</p>
              <div className="flex flex-col gap-1">
                <p className="text-3xl font-black text-charcoal">
                  Custom <span className="text-base font-semibold text-charcoal-light">quote</span>
                </p>
                {interval === "annual" && (
                  <span className="text-xs font-semibold text-brand-red">Ask about annual billing savings</span>
                )}
              </div>
              <Button
                href="/contact"
                variant={isSelected ? "primary" : "secondary"}
                className="mt-auto w-full justify-center"
              >
                Request a Quote
              </Button>
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-white">
        <div className="min-w-[560px]">
          <div className="grid grid-cols-[1fr_repeat(3,120px)] items-center gap-x-4 border-b border-border bg-bg-alt px-6 py-3">
            <span className="text-xs font-bold uppercase tracking-wide text-charcoal-light">Features</span>
            {PLANS.map((plan) => (
              <span
                key={plan.id}
                className={`text-center text-xs font-bold uppercase tracking-wide ${
                  selected === plan.id ? "text-brand-red" : "text-charcoal-light"
                }`}
              >
                {plan.name}
              </span>
            ))}
          </div>
          {FEATURES.map((feature, i) => (
            <div
              key={feature.name}
              className={`grid grid-cols-[1fr_repeat(3,120px)] items-center gap-x-4 px-6 py-3.5 ${
                i !== FEATURES.length - 1 ? "border-b border-border/60" : ""
              }`}
            >
              <span className="text-sm text-charcoal-mid">{feature.name}</span>
              {PLANS.map((plan) => {
                const included = TIER_RANK[plan.id] >= TIER_RANK[feature.minTier];
                return (
                  <span
                    key={plan.id}
                    className={`flex justify-center rounded-md py-1 transition-colors ${
                      selected === plan.id && included ? "bg-brand-red-light" : ""
                    }`}
                  >
                    {included ? (
                      <Check size={16} className={selected === plan.id ? "text-brand-red" : "text-charcoal-mid"} />
                    ) : (
                      <Minus size={14} className="text-border" />
                    )}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
