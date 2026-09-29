import type { ReactNode } from "react";

/** A CSS-only iPhone frame — dynamic island, side buttons, rounded
 * bezel — built to the same shape as the standard "configurable iPhone
 * mockup" pattern (dark bezel, content slot that respects safe areas),
 * since the specific 21st.dev component's source wasn't accessible to
 * copy directly. */
export function PhoneMockup({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto h-[600px] w-[300px] shrink-0 rounded-[52px] border-[6px] border-slate-950 bg-slate-950 shadow-2xl shadow-black/40">
      <span className="absolute -left-[6px] top-24 h-8 w-[6px] rounded-l bg-slate-800" />
      <span className="absolute -left-[6px] top-36 h-14 w-[6px] rounded-l bg-slate-800" />
      <span className="absolute -right-[6px] top-32 h-16 w-[6px] rounded-r bg-slate-800" />

      <div className="absolute inset-[6px] overflow-hidden rounded-[46px] bg-white">
        <span className="absolute left-1/2 top-3 z-20 h-7 w-28 -translate-x-1/2 rounded-full bg-slate-950" />
        {children}
      </div>
    </div>
  );
}
