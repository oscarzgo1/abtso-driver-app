import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/Container";
import { SectionHeader } from "@/components/SectionHeader";
import { Button } from "@/components/Button";
import { Reveal } from "@/components/Reveal";
import { PricingTable } from "@/components/PricingTable";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Tachyo pricing, built around your fleet size. Talk to us for a plan and quote.",
};

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
        <Container>
          <Reveal>
            <PricingTable />
          </Reveal>
        </Container>
      </section>

      <section className="border-t border-border bg-bg-alt py-20">
        <Container className="flex flex-col items-center gap-6 text-center">
          <h2 className="max-w-xl text-2xl font-black tracking-tight text-charcoal sm:text-3xl">
            Not sure which plan fits your fleet?
          </h2>
          <p className="max-w-lg text-charcoal-mid">
            Tell us your fleet size and how you run dispatch today — we&apos;ll recommend the right starting point.
          </p>
          <Button href="/contact" size="lg">
            Talk to Us <ArrowRight size={18} />
          </Button>
        </Container>
      </section>
    </>
  );
}
