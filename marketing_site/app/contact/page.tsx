import type { Metadata } from "next";
import { Mail, ArrowRight } from "lucide-react";
import { Container } from "@/components/Container";
import { SectionHeader } from "@/components/SectionHeader";
import { ContactForm } from "@/components/ContactForm";
import { Button } from "@/components/Button";
import { APP_URL } from "@/lib/config";
import { Reveal } from "@/components/Reveal";

export const metadata: Metadata = {
  title: "Request Access",
  description:
    "Request access to Tachyo. We'll walk you through the platform against your own fleet, then set up your company's account.",
};

const STEPS = [
  { title: "Send your details", body: "Takes a minute — company, fleet size and what you want to fix." },
  { title: "We walk you through it", body: "A call or screen-share against your own routes, rates and depots." },
  { title: "We set up your account", body: "Your company and first admin login are created for you — no card needed to talk." },
  { title: "Your team gets going", body: "Add staff and depots, and your drivers sign in to the app with a Driver ID and PIN." },
];

export default function ContactPage() {
  return (
    <section className="py-20 sm:py-24">
      <Container>
        <SectionHeader
          align="left"
          kicker="Request Access"
          title="Let's Look at Your Fleet, Not a Demo Dataset"
          subtitle="Tachyo accounts are set up by our team — there's no anonymous sign-up. Tell us a bit about your operation and we'll walk you through the platform, then create your company's login."
        />

        <div className="mt-14 grid gap-12 lg:grid-cols-[1.2fr_1fr]">
          <Reveal from="left" className="rounded-2xl border border-border bg-white p-8">
            <ContactForm />
          </Reveal>

          <Reveal from="right" delay={0.1} className="flex flex-col gap-8">
            <div className="rounded-2xl border border-border bg-bg-alt p-7">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-red">How it works</p>
              <ol className="mt-4 flex flex-col gap-4">
                {STEPS.map((step, i) => (
                  <li key={step.title} className="flex gap-3.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-charcoal text-xs font-black text-white">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-charcoal">{step.title}</p>
                      <p className="mt-0.5 text-sm text-charcoal-mid">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-5 text-xs text-charcoal-light">We typically reply within one business day.</p>
            </div>

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

            <div className="rounded-2xl border border-brand-red-light bg-brand-red-light p-7">
              <p className="text-sm font-bold text-charcoal">Already a Tachyo client?</p>
              <p className="mt-2 text-sm text-charcoal-mid">
                Skip the form — sign in to your company&apos;s dashboard.
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
