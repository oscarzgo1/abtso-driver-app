"use client";

import { useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { Container } from "./Container";
import { Button } from "./Button";
import { APP_URL, REQUEST_ACCESS_PATH } from "@/lib/config";

const NAV_LINKS = [
  { href: "/", label: "Platform" },
  { href: "/features", label: "Features" },
  { href: "/features#security", label: "Security" },
  { href: "/pricing", label: "Pricing" },
];

function subscribeToScroll(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}

export function Header() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Deepens the glow once the page has scrolled under the bar.
  const scrolled = useSyncExternalStore(
    subscribeToScroll,
    () => window.scrollY > 8,
    () => false
  );

  return (
    <header className="sticky top-0 z-50 w-full pt-3 sm:pt-4">
      <Container>
        <motion.div
          initial={{ y: -24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className={`flex h-16 items-center justify-between rounded-2xl border border-black/10 bg-white/95 px-4 backdrop-blur-md transition-shadow duration-300 sm:px-5 ${
            scrolled ? "shadow-[0_0_30px_rgba(0,0,0,0.45)]" : "shadow-[0_0_22px_rgba(0,0,0,0.32)]"
          }`}
        >
          <Link href="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
            <Image src="/logo.png" alt="Tachyo" width={28} height={28} className="rounded-md" />
            <span className="text-lg font-black tracking-tight text-charcoal">
              tachyo<span className="text-brand-red">.</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-semibold transition-colors ${
                  pathname === link.href
                    ? "text-brand-red"
                    : "text-charcoal-mid hover:text-charcoal"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Existing customers sign in; everyone else requests access —
              there's no self-service sign-up behind "Client Login". */}
          <div className="hidden items-center gap-2 md:flex">
            <a
              href={APP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg px-3.5 py-2.5 text-sm font-bold text-charcoal-mid transition-colors hover:text-brand-red"
            >
              Client Login
            </a>
            <Button href={REQUEST_ACCESS_PATH} variant="primary" size="md">
              Request Access
            </Button>
          </div>

          <button
            type="button"
            aria-label="Toggle menu"
            onClick={() => setOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-md text-charcoal md:hidden"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              {open ? (
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              ) : (
                <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </motion.div>

        {open && (
          <motion.div
            initial={{ y: -12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="mt-2 rounded-2xl border border-black/10 bg-white shadow-[0_0_24px_rgba(0,0,0,0.35)] md:hidden"
          >
            <div className="flex flex-col gap-1 p-4">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={`rounded-md px-3 py-2.5 text-sm font-semibold ${
                    pathname === link.href
                      ? "bg-brand-red/10 text-brand-red"
                      : "text-charcoal-mid"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              <div className="mt-3 flex flex-col gap-2 border-t border-border pt-4">
                <Button href={REQUEST_ACCESS_PATH} variant="primary">
                  Request Access
                </Button>
                <Button href={APP_URL} variant="secondary" external>
                  Client Login
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </Container>
    </header>
  );
}
