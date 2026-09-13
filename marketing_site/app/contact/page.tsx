import type { Metadata } from "next";
import { Mail, Clock, ArrowRight } from "lucide-react";
import { Container } from "@/components/Container";
import { SectionHeader } from "@/components/SectionHeader";
import { ContactForm } from "@/components/ContactForm";
import { Button } from "@/components/Button";
import { APP_URL } from "@/lib/config";
import { Reveal } from "@/components/Reveal";

export const metadata: Metadata = {
  title: "Contact",
  description: "Book a demo with Tachyo and see the platform against your own routes and rates.",
};

export default function ContactPage() {
  return (
    <section className="py-20 sm:py-24">
      <Container>
        <SectionHeader
          align="left"
          kicker="Get in Touch"
          title="Let's Look at Your Fleet, Not a Demo Dataset"
          subtitle="Tell us a bit about your operation and we'll set up a time to walk through Tachyo against your own routes, rates, and depot structure."
        />

        <div className="mt-14 grid gap-12 lg:grid-cols-[1.2fr_1fr]">
          <Reveal from="left" className="rounded-2xl border border-border bg-white p-8">
            <ContactForm />
          </Reveal>

          <Reveal from="right" delay={0.1} className="flex flex-col gap-8">
            <div className="rounded-2xl border border-border bg-bg-alt p-7">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-charcoal text-white">
                  <Mail size={18} />
                </span>
                <p className="text-sm font-bold text-charcoal">Prefer email?</p>
              </div>
              <a
                href="mailto:hello@tachyo.co.uk"
                className="mt-3 block text-sm font-semibold text-brand-red hover:underline"
              >
                hello@tachyo.co.uk
              </a>
            </div>

            <div className="rounded-2xl border border-border bg-bg-alt p-7">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-charcoal text-white">
                  <Clock size={18} />
                </span>
                <p className="text-sm font-bold text-charcoal">Response time</p>
              </div>
              <p className="mt-3 text-sm text-charcoal-mid">
                We typically reply within one business day.
              </p>
            </div>

            <div className="rounded-2xl border border-brand-red-light bg-brand-red-light p-7">
              <p className="text-sm font-bold text-charcoal">Already a Tachyo client?</p>
              <p className="mt-2 text-sm text-charcoal-mid">
                Skip the form — head straight to your dashboard.
              </p>
              <Button href={APP_URL} variant="secondary" className="mt-4" external>
                Client Login <ArrowRight size={16} />
              </Button>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
