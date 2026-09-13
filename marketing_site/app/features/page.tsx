import type { Metadata } from "next";
import {
  MapPinned,
  ShieldAlert,
  IdCard,
  PoundSterling,
  BarChart3,
  Settings,
  Smartphone,
  Building2,
  ArrowRight,
  Check,
} from "lucide-react";
import { Container } from "@/components/Container";
import { SectionHeader } from "@/components/SectionHeader";
import { Button } from "@/components/Button";
import { Reveal } from "@/components/Reveal";

export const metadata: Metadata = {
  title: "Platform",
  description:
    "Every module in Tachyo's admin dashboard and driver app — live dispatch, alerts, payroll, analytics, and driver management, in one platform.",
};

const MODULES = [
  {
    icon: MapPinned,
    kicker: "Dispatch",
    title: "Live Dispatch Board",
    body: "A real-time map of every active driver, with a KPI strip covering employees logged in, stops over the break threshold, shifts calculated, and gross pay calculated — updated as it happens, not on a delay.",
    points: [
      "Live GPS positions for the whole fleet",
      "Depot geofencing built into the same map",
      "KPI strip refreshed in real time",
    ],
  },
  {
    icon: ShieldAlert,
    kicker: "Compliance & Safety",
    title: "Alert Monitors",
    body: "Emergency SOS and automated idle alerts — a driver stationary past 50 minutes, or an SOS trigger — surface through one notification bell instead of being buried in a report nobody reads until Monday.",
    points: [
      "Acknowledge / dismiss workflow with full audit trail",
      "Audio alarm with mute control",
      "One-tap \"open in Maps\" for the driver's location",
    ],
  },
  {
    icon: IdCard,
    kicker: "Fleet & HR",
    title: "Driver Profiles / Employee Database",
    body: "A full staff directory covering drivers, mechanics, and logistics personnel — not just drivers — with profession grouping so a mixed fleet team lives in one place instead of three spreadsheets.",
    points: [
      "Clock in/out and activate/deactivate per employee",
      "Profession-based grouping (drivers, mechanics, logistics)",
      "PIN-based credential generation",
    ],
  },
  {
    icon: PoundSterling,
    kicker: "Finance & Payroll",
    title: "Rates & Agencies / Earnings",
    body: "Per-driver and per-agency compensation profiles — hourly or fixed-shift rate types, weekday/Saturday/Sunday differentials, and Night Out allowance tracking — editable directly from the same table used for payroll review.",
    points: [
      "Agency vs. direct rate handling",
      "Weekend and Night Out differentials built in",
      "One table for both editing rates and reviewing payroll",
    ],
  },
  {
    icon: BarChart3,
    kicker: "Profitability",
    title: "Profitability & Payroll Analytics",
    body: "Revenue vs. driver cost broken down by day, a driver profitability leaderboard, and depot-to-depot comparison — filterable by driver, agency, depot, and date range, exportable to CSV or Excel.",
    points: [
      "Net margin per shift, computed automatically",
      "Driver profitability leaderboard (margin %, profit/hour)",
      "Depot-to-depot margin comparison",
    ],
  },
  {
    icon: Smartphone,
    kicker: "Driver App",
    title: "Built for the Cab, Not the Office",
    body: "Drivers get a company-scoped Driver ID and PIN — no email, no password to remember — with one-tap shift clock in/out and live GPS tracking with automatic depot geofence detection.",
    points: [
      "Simple Driver ID + PIN login",
      "One-tap shift clock in/out",
      "Built-in legal & compliance screen",
    ],
  },
  {
    icon: Building2,
    kicker: "Platform",
    title: "Multi-Tenant, Secure by Default",
    body: "Every company that signs up gets its own isolated data space, enforced at the database level with row-level security — not just hidden behind a login screen. Two account tiers (Payroll Admin and Logistics) keep payroll data away from dispatch-only staff.",
    points: [
      "Row-level security scoping every table to its organization",
      "MFA on every admin login",
      "Driver PINs stored as salted hashes, never in plain text",
    ],
  },
  {
    icon: Settings,
    kicker: "Admin",
    title: "Settings & Billing",
    body: "Theme, alert and audio preferences, and subscription management, all in the same dashboard — no separate portal to log into for account admin.",
    points: ["Light/dark theme", "Alert & audio preferences", "Subscription management"],
  },
];

export default function FeaturesPage() {
  return (
    <>
      <section className="border-b border-border bg-white py-20 sm:py-24">
        <Container>
          <SectionHeader
            kicker="Platform"
            title="Everything Dispatch, Finance, and Compliance Need — In One Place"
            subtitle="Tachyo is two connected products: the admin dashboard your team dispatches and reconciles payroll from, and the driver app your drivers actually use."
          />
        </Container>
      </section>

      <section className="py-20 sm:py-24">
        <Container className="flex flex-col gap-16">
          {MODULES.map((m, i) => (
            <Reveal key={m.title} from={i % 2 === 1 ? "right" : "left"}>
              <div
                className={`grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] ${
                  i % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""
                }`}
              >
                <div className="flex flex-col gap-4">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-charcoal text-white transition-colors duration-300 hover:bg-brand-red">
                    <m.icon size={22} strokeWidth={2.25} />
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wide text-brand-red">
                    {m.kicker}
                  </span>
                  <h3 className="text-2xl font-black tracking-tight text-charcoal">
                    {m.title}
                  </h3>
                </div>
                <div className="flex flex-col gap-5 rounded-2xl border border-border bg-white p-7">
                  <p className="text-base leading-relaxed text-charcoal-mid">{m.body}</p>
                  <ul className="flex flex-col gap-2.5">
                    {m.points.map((point) => (
                      <li key={point} className="flex items-start gap-2.5 text-sm text-charcoal">
                        <Check size={16} className="mt-0.5 shrink-0 text-brand-red" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Reveal>
          ))}
        </Container>
      </section>

      <section className="border-t border-border bg-bg-alt py-20">
        <Container className="flex flex-col items-center gap-6 text-center">
          <h2 className="text-2xl font-black tracking-tight text-charcoal sm:text-3xl">
            See it running against your own fleet.
          </h2>
          <Button href="/contact" size="lg">
            Book a Demo <ArrowRight size={18} />
          </Button>
        </Container>
      </section>
    </>
  );
}
