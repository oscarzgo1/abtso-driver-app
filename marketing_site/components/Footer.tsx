import Image from "next/image";
import Link from "next/link";
import { Container } from "./Container";
import { APP_URL, SITE_TAGLINE } from "@/lib/config";

const COLUMNS = [
  {
    title: "Platform",
    links: [
      { href: "/features", label: "Features" },
      { href: "/pricing", label: "Pricing" },
      { href: APP_URL, label: "Client Login", external: true },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/legal/privacy", label: "Privacy Policy" },
      { href: "/legal/terms", label: "Terms of Service" },
      { href: "/legal/dpa", label: "Data Processing Addendum" },
      { href: "/legal/cookies", label: "Cookie Policy" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-bg-alt">
      <Container className="py-14">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-5">
          <div className="col-span-2">
            <div className="flex items-center gap-2">
              <Image src="/logo.png" alt="Tachyo" width={26} height={26} className="rounded-md" />
              <span className="text-base font-black tracking-tight text-charcoal">
                tachyo<span className="text-brand-red">.</span>
              </span>
            </div>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-charcoal-light">
              {SITE_TAGLINE}
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="text-xs font-bold uppercase tracking-wide text-charcoal-light">
                {col.title}
              </p>
              <ul className="mt-3 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {"external" in link && link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-charcoal-mid hover:text-brand-red"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-sm text-charcoal-mid hover:text-brand-red"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-border pt-6 sm:flex-row sm:items-center">
          <p className="text-xs text-charcoal-light">
            © {new Date().getFullYear()} Tachyo. All rights reserved.
          </p>
          <p className="text-xs text-charcoal-light">Built for UK haulage operators.</p>
        </div>
      </Container>
    </footer>
  );
}
