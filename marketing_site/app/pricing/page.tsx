import type { Metadata } from "next";
import { Check, ArrowRight } from "lucide-react";
import { Container } from "@/components/Container";
import { SectionHeader } from "@/components/SectionHeader";
import { Button } from "@/components/Button";
import { Reveal } from "@/components/Reveal";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Tachyo pricing, built around your fleet size. Talk to us for a plan and quote.",
};

const PLANS = [
  {
    name: "Starter",
    forWhom: "Fleets getting off spreadsheets for the first time.",
    features: [
      "Live Dispatch Board",
      "Driver Profiles & Employee Database",
      "Alert Monitors (SOS & idle)",
      "Driver App",
    ],
  },
  {
    name: "Growth",
    forWhom: "Fleets ready to see margin, not just movement.",
    features: [
      "Everything in Starter",
      "Rates & Agencies / Earnings",
      "Profitability & Payroll Analytics",
      "CSV / Excel export",
    ],
    highlight: true,
  },
  {
    name: "Enterprise",
    forWhom: "Larger operations with multiple depots and custom needs.",
    features: [
      "Everything in Growth",
      "Multi-depot analytics & comparison",
      "Dedicated onboarding",
      "Custom reporting",
    ],
  },
];

export default function PricingPage() {
  return (
    <>
      <section className="border-b border-border bg-white py-20 sm:py-24">
        <Container>
          <SectionHeader
            kicker="Pricing"
            title="Simple Plans, Built Around Your Fleet"
            subtitle="Every haulage operation is different — pricing is quoted against your fleet size and the modules you need, not a one-size-fits-all number. Talk to us and we'll put a plan together."
          />
        </Container>
      </section>

      <section className="py-20 sm:py-24">
        <Container className="grid gap-8 lg:grid-cols-3">
          {PLANS.map((plan, i) => (
            <Reveal key={plan.name} delay={i * 0.1}>
              <div
                className={`flex h-full flex-col gap-6 rounded-2xl border p-8 transition-transform duration-300 hover:-translate-y-1.5 ${
                  plan.highlight
                    ? "border-brand-red bg-white shadow-xl shadow-brand-red/10 hover:shadow-2xl hover:shadow-brand-red/15"
                    : "border-border bg-white hover:shadow-xl hover:shadow-charcoal/5"
                }`}
              >
                {plan.highlight && (
                  <span className="w-fit rounded-full bg-brand-red-light px-3 py-1 text-xs font-bold uppercase tracking-wide text-brand-red">
                    Most Popular
                  </span>
                )}
                <div>
                  <h3 className="text-xl font-black text-charcoal">{plan.name}</h3>
                  <p className="mt-1 text-sm text-charcoal-light">{plan.forWhom}</p>
                </div>
                <p className="text-3xl font-black text-charcoal">
                  Custom <span className="text-base font-semibold text-charcoal-light">quote</span>
                </p>
                <ul className="flex flex-col gap-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-charcoal-mid">
                      <Check size={16} className="mt-0.5 shrink-0 text-brand-red" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  href="/contact"
                  variant={plan.highlight ? "primary" : "secondary"}
                  className="mt-auto"
                >
                  Request a Quote
                </Button>
              </div>
            </Reveal>
          ))}
        </Container>
      </section>

      <section className="border-t border-border bg-bg-alt py-20">
        <Container className="flex flex-col items-center gap-6 text-center">
          <h2 className="max-w-xl text-2xl font-black tracking-tight text-charcoal sm:text-3xl">
            Not sure which plan fits your fleet?
          </h2>
          <p className="max-w-lg text-charcoal-mid">
            Tell us your fleet size and how you run dispatch today — we'll recommend the right starting point.
          </p>
          <Button href="/contact" size="lg">
            Talk to Us <ArrowRight size={18} />
          </Button>
        </Container>
      </section>
    </>
  );
}
