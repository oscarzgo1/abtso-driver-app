import { Quote } from "lucide-react";
import { Marquee } from "./Marquee";

/** Layout adapted from 21st.dev's "Vertical Testimonials Marquee"
 * (shadcnspace/marquee-03): three columns of review cards scrolling
 * vertically in alternating directions, pausing on hover, with a fade at the
 * top and bottom edge — one column on phones, two from `sm`, three from `lg`.
 * Rebuilt on our own tokens instead of shadcn's Card, and with no avatar
 * images: each card is just the quote plus name and role.
 *
 * SAMPLE COPY. Every name, role and quote below is a placeholder written to
 * fill the layout, not something a real customer said. Replace them with real
 * quotes from named customers who've agreed to be quoted before this goes
 * live: publishing invented testimonials as genuine is misleading advertising
 * and, in the UK, falls foul of the fake reviews ban in the Digital Markets,
 * Competition and Consumers Act 2024. */

interface Testimonial {
  name: string;
  role: string;
  body: string;
}

const TESTIMONIALS: Testimonial[] = [
  {
    name: "Gareth Holloway",
    role: "Transport Manager, 42 truck fleet, West Midlands",
    body: "The idle alerts alone changed our mornings. I used to find out a driver had sat at a services for an hour when payroll came round. Now it pops up the moment it happens and I can ring them before it costs us anything.",
  },
  {
    name: "Priya Nair",
    role: "Operations Director, multi depot distribution, Leeds",
    body: "Having every depot on one live map with the geofences drawn in means I've stopped chasing people for updates. I can see who is where, who is moving and who is waiting on a load without picking up the phone.",
  },
  {
    name: "Danny Fairbrother",
    role: "Owner, 18 truck family fleet, Kent",
    body: "Drivers took to it straight away. It's a Driver ID and a PIN, no email accounts and no passwords to forget. The lads were clocking in and doing walk arounds on day one without me running a single training session.",
  },
  {
    name: "Hannah Whitcombe",
    role: "Fleet Compliance Manager, regional haulier, Bristol",
    body: "Walk around checks with camera only photos and a timer is what I wanted for years. A check done in ninety seconds gets flagged as rushed. A signed sheet never told me anything like that.",
  },
  {
    name: "Marcus Odell",
    role: "Finance Controller, chilled food logistics, Doncaster",
    body: "Payroll used to eat a weekend. Night outs, weekend rates and parking claims now come through from what drivers actually did, and I can see margin per driver without building a spreadsheet first.",
  },
  {
    name: "Sandra Kowalczyk",
    role: "Dispatch Supervisor, parcel linehaul, Northampton",
    body: "Proof of delivery is the part that pays for itself. A driver can't confirm a drop without the signed paperwork and a photo of the empty trailer, so disputes get settled with evidence instead of an argument.",
  },
  {
    name: "Ewan Mackinnon",
    role: "Workshop Manager, mixed fleet, Glasgow",
    body: "The defect registry puts everything in one place with the photos attached. A tyre report comes in from the cab, I mark it under inspection, and it ends up rectified or off the road with a record of who did what.",
  },
  {
    name: "Chloe Brennan",
    role: "Managing Director, family run haulage firm, Cheshire",
    body: "We looked at telematics boxes and the fitting costs put us off. Using the phone already in the driver's pocket meant we were up and running in days, with nothing to install in the cab.",
  },
  {
    name: "Tariq Mahmood",
    role: "Logistics Manager, contract distribution, Nottingham",
    body: "The fuel checks flagged a fill up that didn't match the miles driven, something we'd never have spotted on a paper receipt. Every fill up comes with the odometer and a dashboard photo, so it gets queried straight away.",
  },
];

function TestimonialCard({ name, role, body }: Testimonial) {
  return (
    <figure className="flex w-full flex-col gap-3 rounded-2xl border border-border bg-white p-5 shadow-sm shadow-charcoal/5">
      <Quote size={18} className="text-brand-red" aria-hidden />
      <blockquote className="text-sm leading-relaxed text-charcoal">{body}</blockquote>
      <figcaption className="flex flex-col">
        <span className="text-sm font-bold text-charcoal">{name}</span>
        <span className="text-xs text-charcoal-light">{role}</span>
      </figcaption>
    </figure>
  );
}

export function TestimonialsMarquee() {
  const column = (offset: number) =>
    TESTIMONIALS.filter((_, i) => i % 3 === offset).map((t) => <TestimonialCard key={t.name} {...t} />);

  return (
    <div className="relative h-[34rem] w-full overflow-hidden">
      <div className="mx-auto flex h-full w-full max-w-5xl gap-4 px-4">
        {/* Phones: one column holding everything. */}
        <Marquee vertical pauseOnHover className="h-full flex-1 [--duration:70s] sm:hidden">
          {TESTIMONIALS.map((t) => (
            <TestimonialCard key={t.name} {...t} />
          ))}
        </Marquee>
        {/* sm and up: three interleaved columns, the middle one running the other way. */}
        <Marquee vertical pauseOnHover className="hidden h-full flex-1 [--duration:50s] sm:flex">
          {column(0)}
        </Marquee>
        <Marquee vertical reverse pauseOnHover className="hidden h-full flex-1 [--duration:50s] sm:flex">
          {column(1)}
        </Marquee>
        <Marquee vertical pauseOnHover className="hidden h-full flex-1 [--duration:50s] lg:flex">
          {column(2)}
        </Marquee>
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1/4 bg-linear-to-b from-white" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/4 bg-linear-to-t from-white" />
    </div>
  );
}
