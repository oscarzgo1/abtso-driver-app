import type { ReactNode } from "react";
import { Container } from "./Container";

export function LegalPage({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  updated: ReactNode;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="py-20 sm:py-24">
      <Container className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-black tracking-tight text-charcoal sm:text-4xl">{title}</h1>
        <p className="mt-3 text-sm font-semibold text-charcoal-light">Last updated: {updated}</p>
        {intro && <div className="mt-6 text-base leading-relaxed text-charcoal-mid">{intro}</div>}
        <div className="mt-10 flex flex-col gap-10">{children}</div>
      </Container>
    </section>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="text-lg font-black text-charcoal">{heading}</h2>
      <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-charcoal-mid">
        {children}
      </div>
    </div>
  );
}

/** Visibly flags a fact this document needs from the business owner
 * before publication — a bracketed [INSERT: ...] placeholder, styled so
 * it can't be mistaken for finished copy or accidentally left in a
 * published page unnoticed. */
export function Insert({ children }: { children: ReactNode }) {
  return (
    <span className="rounded bg-brand-red-light px-1.5 py-0.5 font-mono text-[0.85em] font-bold text-brand-red">
      [{children}]
    </span>
  );
}
