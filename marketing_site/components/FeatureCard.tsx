import type { LucideIcon } from "lucide-react";
import { SpotlightCard } from "./SpotlightCard";

interface FeatureCardProps {
  icon: LucideIcon;
  title: string;
  body: string;
}

export function FeatureCard({ icon: Icon, title, body }: FeatureCardProps) {
  return (
    <SpotlightCard className="transition-transform duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-charcoal/5">
      <div className="flex flex-col gap-4 p-7">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-charcoal text-white transition-colors duration-300 group-hover:bg-brand-red">
          <Icon size={20} strokeWidth={2.25} />
        </span>
        <h3 className="text-lg font-bold text-charcoal">{title}</h3>
        <p className="text-sm leading-relaxed text-charcoal-mid">{body}</p>
      </div>
    </SpotlightCard>
  );
}
