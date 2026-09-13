import type { Metadata } from "next";
import { Target, ShieldCheck, Gauge, ArrowRight } from "lucide-react";
import { Container } from "@/components/Container";
import { SectionHeader } from "@/components/SectionHeader";
import { Button } from "@/components/Button";
import { Reveal, RevealGroup, RevealItem } from "@/components/Reveal";
import { SpotlightCard } from "@/components/SpotlightCard";

export const metadata: Metadata = {
  title: "About",
  description: "Why Tachyo exists, and what we believe a fleet dispatch platform should actually do.",
};

const PRINCIPLES = [
  {
    icon: Target,
    title: "Real numbers, not vanity metrics",
    body: "Every figure in Tachyo — margin, cost, profitability — is computed from your own shift and driver records. Nothing simulated, nothing dressed up to look better than it is.",
  },
  {
    icon: ShieldCheck,
    title: "Security isn't an add-on",
    body: "Multi-factor authentication, hashed credentials, and row-level data isolation are built into the platform from day one, not bolted on after a scare.",
  },
  {
    icon: Gauge,
    title: "Built for the people who use it daily",
    body: "A dispatcher needs speed. A driver needs simplicity. A payroll admin needs accuracy. We design for each of those, not one generic interface for everyone.",
  },
];

export default function AboutPage() {
  return (
    <>
      <section className="border-b border-border bg-white py-20 sm:py-24">
        <Container>
          <SectionHeader
            kicker="About Tachyo"
            title="We Built the Tool We Wished Existed"
            subtitle="Haulage runs on tight margins and thin staff. Most software built for the industry treats dispatch, payroll, and compliance as three separate problems — Tachyo treats them as one."
          />
        </Container>
      </section>

      <section className="py-20 sm:py-24">
        <Container className="mx-auto flex max-w-3xl flex-col gap-6 text-base leading-relaxed text-charcoal-mid sm:text-lg">
          <Reveal>
            <p>
              Every haulage operator we've spoken to has the same story: dispatch
              runs on one system, driver pay gets reconciled from paper
              timesheets, and nobody finds out a route was unprofitable until
              the numbers are reviewed weeks later. The tools weren't
              connected, so the picture was never complete.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <p>
              Tachyo exists to close that gap — one platform where a
              dispatcher sees a driver's live location, a payroll admin sees
              exactly what that shift will cost, and a finance lead sees
              whether the load it was assigned to was ever going to be
              profitable in the first place.
            </p>
          </Reveal>
          <Reveal delay={0.2}>
            <p>
              We're not trying to be a telematics company with a spreadsheet
              bolted on, or a payroll tool that happens to show a map. Tachyo
              is built specifically for UK road haulage — the rate structures,
              the Night Out allowances, the agency-vs-direct driver mix — not
              adapted from a generic fleet product built for somewhere else.
            </p>
          </Reveal>
        </Container>
      </section>

      <section className="border-y border-border bg-bg-alt py-20 sm:py-24">
        <Container className="flex flex-col items-center gap-14">
          <Reveal>
            <SectionHeader kicker="What We Believe" title="Principles We Build Against" />
          </Reveal>
          <RevealGroup className="grid w-full gap-6 sm:grid-cols-3">
            {PRINCIPLES.map((p) => (
              <RevealItem key={p.title}>
                <SpotlightCard className="h-full transition-transform duration-300 hover:-translate-y-1">
                  <div className="flex flex-col gap-4 p-7">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-charcoal text-white">
                      <p.icon size={20} strokeWidth={2.25} />
                    </span>
                    <h3 className="text-lg font-bold text-charcoal">{p.title}</h3>
                    <p className="text-sm leading-relaxed text-charcoal-mid">{p.body}</p>
                  </div>
                </SpotlightCard>
              </RevealItem>
            ))}
          </RevealGroup>
        </Container>
      </section>

      <section className="py-20">
        <Container className="flex flex-col items-center gap-6 text-center">
          <Reveal>
            <h2 className="max-w-xl text-2xl font-black tracking-tight text-charcoal sm:text-3xl">
              Want to see how it fits your operation?
            </h2>
          </Reveal>
          <Button href="/contact" size="lg">
            Get in Touch <ArrowRight size={18} />
          </Button>
        </Container>
      </section>
    </>
  );
}
