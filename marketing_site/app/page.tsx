import {
  Eye,
  ClipboardX,
  BellOff,
  Users2,
  MapPinned,
  PoundSterling,
  BarChart3,
  ShieldCheck,
  Smartphone,
  Building2,
  ArrowRight,
} from "lucide-react";
import { Container } from "@/components/Container";
import { SectionHeader } from "@/components/SectionHeader";
import { Button } from "@/components/Button";
import { PainPointCard } from "@/components/PainPointCard";
import { FeatureCard } from "@/components/FeatureCard";
import { HeroMockup } from "@/components/HeroMockup";
import { HeroGlow } from "@/components/HeroGlow";
import { TextBlurIn } from "@/components/TextBlurIn";
import { Reveal, RevealGroup, RevealItem } from "@/components/Reveal";

const PAIN_POINTS = [
  {
    icon: Eye,
    role: "Operations & Dispatch",
    title: "You find out a route lost money weeks after it ran.",
    body: "When driver cost and load revenue live in separate systems, margin is a guess until someone reconciles it by hand — usually too late to renegotiate anything.",
  },
  {
    icon: ClipboardX,
    role: "Finance & Payroll",
    title: "Friday payroll takes two days of cross-checking.",
    body: "Night Out allowances, weekend differentials, and agency-vs-direct rates, reconciled manually from paper timesheets, unit by unit, every single week.",
  },
  {
    icon: BellOff,
    role: "Compliance & Safety",
    title: "Inflated timesheets go unnoticed until the invoice arrives.",
    body: "Without automated idle and geofence alerts, a driver stationary for an hour looks identical to one making a delivery — until someone finally checks.",
  },
  {
    icon: Users2,
    role: "Fleet & HR",
    title: "Drivers, mechanics, and logistics staff live in different spreadsheets.",
    body: "No single place to see who's active, who's assigned where, or who needs a new PIN — just a patchwork of files nobody fully trusts.",
  },
];

const FEATURES = [
  {
    icon: MapPinned,
    title: "Live Dispatch Board",
    body: "Real-time GPS, depot geofencing, and shift KPIs on one map — not a spreadsheet refreshed every hour.",
  },
  {
    icon: PoundSterling,
    title: "Rates & Earnings",
    body: "Hourly or fixed-shift rates, weekend differentials, and Night Out allowances — calculated from the shifts drivers actually clocked.",
  },
  {
    icon: BarChart3,
    title: "Profitability Analytics",
    body: "Revenue vs. driver cost, per shift and per depot, with a leaderboard that shows exactly where your margin is going.",
  },
  {
    icon: Smartphone,
    title: "Driver App",
    body: "Driver ID and PIN, one-tap clock in/out. No training required — built for the cab, not the office.",
  },
  {
    icon: ShieldCheck,
    title: "Automated Alerts",
    body: "SOS and idle-time detection run against live GPS and shift data, surfaced through one notification bell.",
  },
  {
    icon: Building2,
    title: "Multi-Tenant & Secure",
    body: "MFA on every admin login, hashed driver PINs, and row-level data isolation — your data is never visible to anyone outside your company.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Register your company",
    body: "Self-service setup — no waiting on a sales engineer to provision your account.",
  },
  {
    n: "02",
    title: "Add your fleet",
    body: "Drivers, depots, and rate profiles, all entered once and used everywhere in the platform.",
  },
  {
    n: "03",
    title: "See your margin from day one",
    body: "Dispatch, track, and reconcile payroll without ever leaving the screen.",
  },
];

export default function HomePage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-border bg-white">
        <HeroGlow />
        <Container className="grid items-center gap-12 py-20 lg:grid-cols-2 lg:py-28">
          <div className="flex flex-col gap-6">
            <Reveal>
              <span className="w-fit rounded-full bg-brand-red-light px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-brand-red">
                Built for UK Haulage Operators
              </span>
            </Reveal>
            <h1 className="text-4xl font-black leading-[1.05] tracking-tight text-charcoal sm:text-5xl lg:text-[3.25rem]">
              <TextBlurIn>Know which loads are actually</TextBlurIn>{" "}
              <TextBlurIn delay={0.35} className="text-brand-red">
                making you money.
              </TextBlurIn>
            </h1>
            <Reveal delay={0.15}>
              <p className="max-w-xl text-lg leading-relaxed text-charcoal-mid">
                Tachyo puts live dispatch, driver cost, and load revenue on one
                screen — so you stop finding out a route lost money weeks after
                it happened.
              </p>
            </Reveal>
            <Reveal delay={0.25}>
              <div className="flex flex-wrap gap-3">
                <Button href="/contact" size="lg">
                  Book a Demo <ArrowRight size={18} />
                </Button>
                <Button href="/features" variant="secondary" size="lg">
                  See the Platform
                </Button>
              </div>
            </Reveal>
          </div>
          <Reveal from="right" delay={0.2} className="flex justify-center lg:justify-end">
            <HeroMockup />
          </Reveal>
        </Container>
      </section>

      {/* ── Trust strip ──────────────────────────────────────── */}
      <section className="border-b border-border bg-bg-alt">
        <Container className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 py-6 text-xs font-bold uppercase tracking-wide text-charcoal-light">
          <span>Multi-Factor Authentication</span>
          <span>UK-Based</span>
          <span>Row-Level Data Isolation</span>
          <span>Built for Real Dispatch Operations</span>
        </Container>
      </section>

      {/* ── Problem / ICP pain points ────────────────────────── */}
      <section className="py-20 sm:py-28">
        <Container className="flex flex-col items-center gap-14">
          <Reveal>
            <SectionHeader
              kicker="The Problem"
              title="Every Haulage Business Runs Into These Costs"
              subtitle="Different roles feel it differently — but it's the same root cause: dispatch, cost, and payroll living in systems that don't talk to each other."
            />
          </Reveal>
          <RevealGroup className="grid w-full gap-6 sm:grid-cols-2">
            {PAIN_POINTS.map((p) => (
              <RevealItem key={p.title}>
                <PainPointCard {...p} />
              </RevealItem>
            ))}
          </RevealGroup>
        </Container>
      </section>

      {/* ── Solution + features ──────────────────────────────── */}
      <section className="border-y border-border bg-bg-alt py-20 sm:py-28">
        <Container className="flex flex-col items-center gap-14">
          <Reveal>
            <SectionHeader
              kicker="The Fix"
              title="One Platform. Every Number You Need, In Real Time."
              subtitle="Tachyo replaces the spreadsheet-and-phone-call routine with a single system dispatch, finance, and compliance all work from."
            />
          </Reveal>
          <RevealGroup className="grid w-full gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <RevealItem key={f.title}>
                <FeatureCard {...f} />
              </RevealItem>
            ))}
          </RevealGroup>
          <Reveal>
            <Button href="/features" variant="secondary" size="lg">
              Explore the full platform <ArrowRight size={18} />
            </Button>
          </Reveal>
        </Container>
      </section>

      {/* ── How it works ─────────────────────────────────────── */}
      <section className="py-20 sm:py-28">
        <Container className="flex flex-col items-center gap-14">
          <Reveal>
            <SectionHeader kicker="Getting Started" title="Live in Days, Not Months" />
          </Reveal>
          <RevealGroup className="grid w-full gap-8 sm:grid-cols-3">
            {STEPS.map((s) => (
              <RevealItem key={s.n} className="flex flex-col gap-3">
                <span className="text-4xl font-black text-border">{s.n}</span>
                <h3 className="text-lg font-bold text-charcoal">{s.title}</h3>
                <p className="text-sm leading-relaxed text-charcoal-mid">{s.body}</p>
              </RevealItem>
            ))}
          </RevealGroup>
        </Container>
      </section>

      {/* ── Final CTA ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-charcoal py-20 sm:py-24">
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
        <Container className="relative flex flex-col items-center gap-6 text-center">
          <Reveal>
            <h2 className="max-w-2xl text-3xl font-black tracking-tight text-white sm:text-4xl">
              Stop reconciling margin after the fact.
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="max-w-xl text-base text-white/70 sm:text-lg">
              Talk to us about bringing Tachyo to your fleet — see it against
              your own routes and rates, not a demo dataset.
            </p>
          </Reveal>
          <Reveal delay={0.2}>
            <Button href="/contact" size="lg" className="mt-2">
              Book a Demo <ArrowRight size={18} />
            </Button>
          </Reveal>
        </Container>
      </section>
    </>
  );
}
