import { MapPin, TrendingUp, ShieldAlert } from "lucide-react";

/** A schematic, illustrative glimpse of the dashboard — deliberately
 * abstract (generic labels, no invented driver names or numbers dressed
 * up as real data) rather than a "screenshot" that could be mistaken for
 * an actual client's real figures. */
export function HeroMockup() {
  const bars = [38, 62, 44, 78, 55, 90, 70];

  return (
    <div className="relative w-full max-w-lg rounded-2xl border border-border bg-white p-5 shadow-2xl shadow-charcoal/10">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-brand-red" />
          <span className="text-xs font-bold uppercase tracking-wide text-charcoal-light">
            Revenue vs. Cost — This Week
          </span>
        </div>
        <TrendingUp size={16} className="text-charcoal-light" />
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-bg-alt p-3">
          <p className="text-[10px] font-bold uppercase text-charcoal-light">Load Revenue</p>
          <p className="mt-1 text-lg font-black text-charcoal">£ · · ·</p>
        </div>
        <div className="rounded-xl bg-bg-alt p-3">
          <p className="text-[10px] font-bold uppercase text-charcoal-light">Driver Cost</p>
          <p className="mt-1 text-lg font-black text-charcoal">£ · · ·</p>
        </div>
        <div className="rounded-xl bg-brand-red-light p-3">
          <p className="text-[10px] font-bold uppercase text-brand-red">Net Margin</p>
          <p className="mt-1 text-lg font-black text-brand-red">%</p>
        </div>
      </div>

      <div className="mt-5 flex h-28 items-end gap-2">
        {bars.map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-md bg-gradient-to-t from-charcoal to-charcoal-mid"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between rounded-xl border border-border p-3">
        <div className="flex items-center gap-2">
          <MapPin size={14} className="text-charcoal-light" />
          <span className="text-xs font-semibold text-charcoal-mid">Live dispatch — depot geofencing active</span>
        </div>
        <ShieldAlert size={14} className="text-brand-red" />
      </div>
    </div>
  );
}
