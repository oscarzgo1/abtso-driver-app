import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/Container";
import { SectionHeader } from "@/components/SectionHeader";
import { Button } from "@/components/Button";
import { Reveal } from "@/components/Reveal";
import { BenefitsTimeline } from "@/components/BenefitsTimeline";
import { FeatureModulesSlideshow } from "@/components/FeatureModulesSlideshow";

export const metadata: Metadata = {
  title: "Platform",
  description:
    "Every module in Tachyo's admin panel and driver app — operations dashboard, walk-around checks, proof of delivery, fuel audit, compliance, holidays, payroll and profitability.",
};

const BENEFITS = [
  {
    title: "Catch Idle Time Before It Costs You",
    description:
      "Alerts fire the moment a driver sits stationary past your threshold — and the dashboard shows every idle driver and how long they've been still, so a long coffee stop never quietly eats an hour of wages.",
  },
  {
    title: "Walk-Around Checks You Can Actually Trust",
    description:
      "Camera-only photos, odometer readings and a timer on every check. A 90-second “inspection” is flagged as rushed and a skipped one as missing — per employee, not buried in paperwork.",
  },
  {
    title: "Proof of Delivery Before the Truck Is Back",
    description:
      "Drivers attach the load from the cab and can't confirm delivery without the signed paperwork and a photo of the emptied trailer. Disputes get settled with evidence, not memory.",
  },
  {
    title: "Fuel That Adds Up — or Gets Flagged",
    description:
      "Every fill-up comes with litres, an odometer reading and a dashboard photo, so MPG is checked automatically and a receipt that doesn't match the miles is flagged as a possible theft.",
  },
  {
    title: "Payroll and Margin That Reconcile Themselves",
    description:
      "Night outs, weekend rates, parking claims and approved holidays flow from what drivers actually did — and profit, revenue and cost per mile update as shifts close, not at month-end.",
  },
];

export default function FeaturesPage() {
  return (
    <>
      {/* ── Everything you get, first thing on the page ───────── */}
      <section className="border-b border-border bg-white py-20 sm:py-24">
        <Container className="flex flex-col items-center gap-14">
          <Reveal>
            <SectionHeader
              kicker="Why Teams Switch"
              title="Everything You Get, From Day One"
              subtitle="Not a roadmap — every one of these is live in the product a driver clocks into today."
            />
          </Reveal>
          <Reveal className="mx-auto w-full max-w-2xl">
            <BenefitsTimeline items={BENEFITS} />
          </Reveal>
        </Container>
      </section>

      {/* ── Every module, one at a time ───────────────────────── */}
      <section className="py-20 sm:py-24">
        <Container className="flex flex-col items-center gap-12">
          <Reveal className="max-w-2xl text-center">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-brand-red">Every Module</span>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-charcoal sm:text-3xl">
              Twelve Modules, One at a Time
            </h2>
          </Reveal>
          <Reveal className="w-full">
            <FeatureModulesSlideshow />
          </Reveal>
        </Container>
      </section>

      <section className="border-t border-border bg-bg-alt py-20">
        <Container className="flex flex-col items-center gap-6 text-center">
          <h2 className="text-2xl font-black tracking-tight text-charcoal sm:text-3xl">
            See it running against your own fleet.
          </h2>
          <Button href="/contact" size="lg">
            Request Access <ArrowRight size={18} />
          </Button>
        </Container>
      </section>
    </>
  );
}
