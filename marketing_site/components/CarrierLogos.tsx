import { siDhl, siFedex, siUps, siDpd, type SimpleIcon } from "simple-icons";
import { InfiniteSlider } from "./motion-primitives/infinite-slider";

/** Real carrier brand marks via simple-icons (self-hosted, versioned SVG
 * path data — no hotlinking external image hosts). Deliberately not every
 * name mentioned as an example carrier elsewhere on this site: simple-icons
 * only ships general/tech-adjacent brand marks, so names like Amazon
 * (retail, not a tech-stack logo) and Eddie Stobart (UK-only haulier)
 * aren't in the set. Swap in their actual logo files here if/when
 * supplied directly rather than sourcing look-alikes from elsewhere. */
const CARRIERS: SimpleIcon[] = [siDhl, siFedex, siUps, siDpd];

function CarrierMark({ icon }: { icon: SimpleIcon }) {
  return (
    <div className="flex items-center gap-3 grayscale opacity-60 transition duration-300 hover:opacity-100 hover:grayscale-0">
      <svg role="img" viewBox="0 0 24 24" className="h-8 w-8 shrink-0" fill={`#${icon.hex}`}>
        <title>{icon.title}</title>
        <path d={icon.path} />
      </svg>
      <span className="text-lg font-black tracking-tight text-charcoal">{icon.title}</span>
    </div>
  );
}

export function CarrierLogos() {
  return (
    <InfiniteSlider gap={64} speed={32} speedOnHover={10} className="w-full py-2">
      {CARRIERS.map((icon) => (
        <CarrierMark key={icon.slug} icon={icon} />
      ))}
    </InfiniteSlider>
  );
}
