import type { ReactNode } from "react";

interface MarqueeProps {
  children: ReactNode;
  vertical?: boolean;
  reverse?: boolean;
  pauseOnHover?: boolean;
  /** How many copies of the track to lay end to end — enough to always overflow the container. */
  repeat?: number;
  /** Set the speed from the caller with `[--duration:30s]`; the gap with `[--gap:1rem]`. */
  className?: string;
}

/** Infinite CSS-only marquee, the same mechanism as the shadcn/Magic UI one
 * the 21st.dev "Vertical Testimonials Marquee" (shadcnspace/marquee-03) is
 * built on — that registry entry doesn't ship its own `marquee` util, so this
 * is the equivalent written on our tokens. Pure CSS (no JS animation loop),
 * pauses on hover, and stops moving entirely for visitors who've asked their
 * OS for reduced motion. Copies after the first are hidden from assistive
 * tech so screen readers don't read every card four times. */
export function Marquee({
  children,
  vertical = false,
  reverse = false,
  pauseOnHover = false,
  repeat = 4,
  className = "",
}: MarqueeProps) {
  const direction = vertical
    ? "flex-col animate-[marquee-vertical_var(--duration,40s)_linear_infinite]"
    : "flex-row animate-[marquee_var(--duration,40s)_linear_infinite]";

  return (
    <div
      className={`group flex gap-(--gap) overflow-hidden [--gap:1rem] ${vertical ? "flex-col" : "flex-row"} ${className}`}
    >
      {Array.from({ length: repeat }).map((_, i) => (
        <div
          key={i}
          aria-hidden={i > 0 ? true : undefined}
          className={`flex shrink-0 justify-around gap-(--gap) motion-reduce:animate-none ${direction} ${
            reverse ? "[animation-direction:reverse]" : ""
          } ${pauseOnHover ? "group-hover:[animation-play-state:paused]" : ""}`}
        >
          {children}
        </div>
      ))}
    </div>
  );
}
