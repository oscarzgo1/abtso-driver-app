import { TextBlurIn } from "./TextBlurIn";

interface SectionHeaderProps {
  kicker?: string;
  title: string;
  subtitle?: string;
  align?: "left" | "center";
  tone?: "light" | "dark";
}

export function SectionHeader({
  kicker,
  title,
  subtitle,
  align = "center",
  tone = "light",
}: SectionHeaderProps) {
  const alignClass = align === "center" ? "text-center items-center mx-auto" : "text-left items-start";
  const subtitleColor = tone === "dark" ? "text-white/70" : "text-charcoal-light";
  const kickerColor = tone === "dark" ? "text-white/80" : "text-brand-red";

  return (
    <div className={`flex max-w-2xl flex-col gap-3 ${alignClass}`}>
      {kicker && (
        <span
          className={`text-xs font-bold uppercase tracking-[0.14em] ${kickerColor}`}
        >
          {kicker}
        </span>
      )}
      <h2
        className={`text-3xl font-black tracking-tight sm:text-4xl ${
          tone === "dark" ? "text-white" : "text-charcoal"
        }`}
      >
        <TextBlurIn>{title}</TextBlurIn>
      </h2>
      {subtitle && (
        <p className={`text-base leading-relaxed sm:text-lg ${subtitleColor}`}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
