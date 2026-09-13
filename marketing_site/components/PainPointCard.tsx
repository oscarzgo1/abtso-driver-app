import type { LucideIcon } from "lucide-react";
import { SpotlightCard } from "./SpotlightCard";

interface PainPointCardProps {
  icon: LucideIcon;
  role: string;
  title: string;
  body: string;
}

export function PainPointCard({ icon: Icon, role, title, body }: PainPointCardProps) {
  return (
    <SpotlightCard className="transition-transform duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-charcoal/5">
      <div className="flex flex-col gap-4 p-7">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-red-light text-brand-red">
            <Icon size={20} strokeWidth={2.25} />
          </span>
          <span className="text-xs font-bold uppercase tracking-wide text-charcoal-light">
            {role}
          </span>
        </div>
        <h3 className="text-lg font-bold leading-snug text-charcoal">{title}</h3>
        <p className="text-sm leading-relaxed text-charcoal-mid">{body}</p>
      </div>
    </SpotlightCard>
  );
}
