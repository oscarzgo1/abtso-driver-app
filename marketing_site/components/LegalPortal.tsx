"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Printer, Download } from "lucide-react";
import { Container } from "./Container";

export interface LegalPortalDoc {
  slug: string;
  label: string;
}

/** The 5 documents in the portal, in tab order. Shared between every
 * page so the tab bar is identical everywhere and adding a 6th document
 * later is a one-line change. */
export const LEGAL_PORTAL_DOCS: LegalPortalDoc[] = [
  { slug: "terms", label: "B2B Terms of Service" },
  { slug: "privacy", label: "Privacy Policy" },
  { slug: "dpa", label: "Data Processing Addendum" },
  { slug: "telematics", label: "Telematics & GPS Policy" },
  { slug: "refund-policy", label: "Refund & Data Purge" },
];

export interface LegalPortalSection {
  id: string;
  label: string;
}

/** Shared shell for the 5-document legal portal: top tab bar across
 * documents, a sticky scroll-spy table of contents for the current
 * document's own numbered sections, and Print/Download actions.
 *
 * "Continuous scroll" is within ONE document (children renders straight
 * down the page, TOC tracks scroll position) — the 5 documents
 * themselves stay separate routes, switched via the top tabs, since a
 * single page combining all 5 would make each one harder to cite/link
 * to individually (exactly what a legal document needs to avoid). */
export function LegalPortalShell({
  activeSlug,
  title,
  updated,
  intro,
  sections,
  children,
}: {
  activeSlug: string;
  title: string;
  updated: string;
  intro?: ReactNode;
  sections: LegalPortalSection[];
  children: ReactNode;
}) {
  const [activeSection, setActiveSection] = useState<string>(sections[0]?.id ?? "");
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const headings = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the entry closest to the top of the viewport among those
        // currently intersecting — a plain "first intersecting entry"
        // flickers between adjacent sections as they cross the same
        // threshold together during a fast scroll.
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        const topMost = visible.reduce((a, b) =>
          a.boundingClientRect.top < b.boundingClientRect.top ? a : b
        );
        setActiveSection(topMost.target.id);
      },
      { rootMargin: "-96px 0px -70% 0px", threshold: 0 }
    );
    headings.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);

  const printPage = () => window.print();

  const downloadPack = () => {
    const pack = document.getElementById("legal-pack-source")?.innerText ?? "";
    const blob = new Blob([pack], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tachyo-${activeSlug}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="py-16 sm:py-20 print:py-0">
      <Container>
        {/* Top tab bar — switches between the 5 documents */}
        <div className="flex flex-wrap gap-2 border-b border-border pb-4 print:hidden">
          {LEGAL_PORTAL_DOCS.map((doc) => (
            <Link
              key={doc.slug}
              href={`/legal/${doc.slug}`}
              className={`rounded-md px-3 py-2 text-xs font-bold transition-colors ${
                doc.slug === activeSlug
                  ? "bg-brand-red text-white"
                  : "text-charcoal-mid hover:bg-brand-red-light hover:text-brand-red"
              }`}
            >
              {doc.label}
            </Link>
          ))}
        </div>

        <div className="mt-8 flex items-start justify-between gap-6 print:mt-0">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-charcoal sm:text-4xl">{title}</h1>
            <p className="mt-2 text-sm font-semibold text-charcoal-light">Last updated: {updated}</p>
          </div>
          <div className="flex shrink-0 gap-2 print:hidden">
            <button
              type="button"
              onClick={printPage}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-bold text-charcoal-mid transition-colors hover:bg-charcoal/5"
            >
              <Printer size={14} />
              Print / Save PDF
            </button>
            <button
              type="button"
              onClick={downloadPack}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-bold text-charcoal-mid transition-colors hover:bg-charcoal/5"
            >
              <Download size={14} />
              Download This Document
            </button>
          </div>
        </div>

        {intro && <div className="mt-6 max-w-3xl text-base leading-relaxed text-charcoal-mid">{intro}</div>}

        <div className="mt-10 flex gap-10">
          {/* Left 25% — sticky scroll-spy TOC */}
          <nav className="hidden w-64 shrink-0 lg:block print:hidden">
            <div className="sticky top-24 flex flex-col gap-1 border-l border-border pl-4">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-charcoal-light">On this page</p>
              {sections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className={`rounded px-2 py-1.5 text-xs font-medium transition-colors ${
                    activeSection === s.id
                      ? "bg-brand-red-light font-bold text-brand-red"
                      : "text-charcoal-mid hover:text-charcoal"
                  }`}
                >
                  {s.label}
                </a>
              ))}
            </div>
          </nav>

          {/* Right 75% — the document itself */}
          <div id="legal-pack-source" ref={contentRef} className="flex min-w-0 flex-1 flex-col gap-10">
            {children}
          </div>
        </div>
      </Container>
    </section>
  );
}

/** One numbered clause block. `id` must match its entry in the page's
 * `sections` array passed to LegalPortalShell, or the TOC/scroll-spy
 * for it silently does nothing. */
export function LegalClause({
  id,
  heading,
  children,
}: {
  id: string;
  heading: string;
  children: ReactNode;
}) {
  return (
    <div id={id} className="scroll-mt-24">
      <h2 className="text-lg font-black text-charcoal">{heading}</h2>
      <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-charcoal-mid">{children}</div>
    </div>
  );
}

/** Prominent marker for clauses that are a reasonable first draft but
 * have not been reviewed by a qualified UK solicitor — deliberately
 * impossible to mistake for finished, reliable legal protection.
 * Required on anything attempting to exclude or shift statutory
 * liability (employment, DVSA/road traffic, consumer protection). */
export function UnreviewedDraftNotice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">
      <p className="mb-1 font-black uppercase tracking-wide">Draft — pending qualified legal review</p>
      <p className="font-normal">{children}</p>
    </div>
  );
}
