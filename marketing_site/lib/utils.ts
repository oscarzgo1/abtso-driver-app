import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Standard shadcn/motion-primitives `cn` helper — merges conditional
 * class lists via clsx, then resolves conflicting Tailwind utilities
 * (e.g. two different `p-*` values) via tailwind-merge. Vendored
 * components pulled in via their CLIs (see components/motion-primitives)
 * import this exact path, so this is required infrastructure, not a
 * style preference. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
