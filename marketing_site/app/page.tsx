import { ArrowRight } from "lucide-react";
import { Container } from "@/components/Container";
import { SectionHeader } from "@/components/SectionHeader";
import { Button } from "@/components/Button";
import { HeroGlow } from "@/components/HeroGlow";
import { TextBlurIn } from "@/components/TextBlurIn";
import { Reveal } from "@/components/Reveal";
import { CarrierLogos } from "@/components/CarrierLogos";
import { ProblemFixSlideshow } from "@/components/ProblemFixSlideshow";
import { DriverJourneyDemo } from "@/components/DriverJourneyDemo";
import { PlatformOverview } from "@/components/PlatformOverview";
import { TestimonialsMarquee } from "@/components/TestimonialsMarquee";
import { REQUEST_ACCESS_PATH } from "@/lib/config";

export default function HomePage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section id="platform" className="relative overflow-hidden border-b border-border bg-white">
        <HeroGlow />
        <Container className="flex flex-col items-center gap-7 py-20 text-center lg:py-28">
          <Reveal>
            <span className="w-fit rounded-full bg-brand-red-light px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-brand-red">
              Real Numbers From a Real Fleet
            </span>
          </Reveal>
          <h1 className="max-w-4xl text-5xl font-black leading-[1.05] tracking-tight text-charcoal sm:text-6xl lg:text-7xl">
            <TextBlurIn>Your trucks are moving.</TextBlurIn>{" "}
            <TextBlurIn delay={0.35} className="text-brand-red">
              Is your margin?
            </TextBlurIn>
          </h1>
          <Reveal delay={0.15}>
            <p className="max-w-2xl text-lg leading-relaxed text-charcoal-mid sm:text-xl">
              Idle stops, rushed checks and missing proof of delivery all
              cost real money — and most fleets only find out at month-end.
              Tachyo catches every one the moment it happens, through the
              phone your drivers already carry.
            </p>
          </Reveal>
          <Reveal delay={0.25}>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button href={REQUEST_ACCESS_PATH} size="lg">
                Request Access <ArrowRight size={18} />
              </Button>
              <Button href="/features" variant="secondary" size="lg">
                Explore the Platform
              </Button>
            </div>
          </Reveal>
        </Container>
      </section>

      {/* ── Platform overview: every module, before any further scrolling ── */}
      <section className="border-b border-border bg-bg-alt py-16 sm:py-20">
        <Container className="flex flex-col items-center gap-12">
          <Reveal>
            <SectionHeader
              kicker="The Platform"
              title="Everything Tachyo Covers, At a Glance"
              subtitle="One system for dispatch, compliance, fuel, payroll and reporting — the full picture in one section, not six."
            />
          </Reveal>
          <Reveal className="w-full">
            <PlatformOverview />
          </Reveal>
        </Container>
      </section>

      {/* ── Carrier logos ────────────────────────────────────── */}
      <section className="border-b border-border bg-white py-8">
        <Container className="flex flex-col items-center gap-5">
          <span className="text-xs font-bold uppercase tracking-wide text-charcoal-light">
            Auto-Reconciles Loads From
          </span>
          <CarrierLogos />
        </Container>
      </section>

      {/* ── Problem → Fix slideshow ───────────────────────────── */}
      <section className="bg-white py-20 sm:py-28">
        <Container>
          <Reveal>
            <ProblemFixSlideshow />
          </Reveal>
        </Container>
      </section>

      {/* ── A shift's paperwork, start to finish ──────────────── */}
      <section className="border-y border-border bg-bg-alt py-20 sm:py-28">
        <Container className="flex flex-col items-center gap-14">
          <Reveal>
            <SectionHeader
              kicker="From the Cab to the Office"
              title="Every Check, Trailer and Delivery — Proven"
              subtitle="The driver does it once on their phone. The office sees it the same second — photos, times and all."
            />
          </Reveal>
          <Reveal className="w-full">
            <DriverJourneyDemo />
          </Reveal>
        </Container>
      </section>

      {/* ── Testimonials ──────────────────────────────────────── */}
      <section className="bg-white py-20 sm:py-28">
        <Container className="flex flex-col items-center gap-12">
          <Reveal>
            <SectionHeader
              kicker="What Operators Say"
              title="Built Around How Fleets Actually Run"
              subtitle="From the dispatch desk to the workshop floor, here is what teams say once Tachyo is live."
            />
          </Reveal>
          <Reveal className="w-full">
            <TestimonialsMarquee />
          </Reveal>
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
              Tell us about your fleet and we&apos;ll walk you through Tachyo
              against your own routes and rates — then set up your account.
            </p>
          </Reveal>
          <Reveal delay={0.2}>
            <Button href={REQUEST_ACCESS_PATH} size="lg" className="mt-2">
              Request Access <ArrowRight size={18} />
            </Button>
          </Reveal>
        </Container>
      </section>
    </>
  );
}
