import Link from "next/link";
import type { ReactNode } from "react";

interface ButtonProps {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  size?: "md" | "lg";
  className?: string;
  external?: boolean;
}

const base =
  "group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-lg font-bold tracking-tight transition-colors duration-150 whitespace-nowrap [&_svg]:transition-transform [&_svg]:duration-300 hover:[&_svg]:translate-x-0.5";

const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-brand-red text-white hover:bg-brand-red-dark",
  secondary:
    "bg-white text-charcoal border border-border hover:border-charcoal",
  ghost: "text-charcoal hover:text-brand-red",
};

const sizes: Record<NonNullable<ButtonProps["size"]>, string> = {
  md: "px-5 py-2.5 text-sm",
  lg: "px-7 py-3.5 text-base",
};

/** Primary buttons get a diagonal shine sweep on hover — a light, CSS-only
 * take on the "shine/glow CTA" pattern (21st.dev has several JS versions
 * of this; a pure-CSS gradient sweep gets the same effect with zero added
 * JS for something this small and this frequently rendered). */
function Shine() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full"
    />
  );
}

export function Button({
  href,
  children,
  variant = "primary",
  size = "md",
  className = "",
  external = false,
}: ButtonProps) {
  const classes = `${base} ${variants[variant]} ${sizes[size]} ${className}`;
  const content = (
    <>
      {variant === "primary" && <Shine />}
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
    </>
  );

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
        {content}
      </a>
    );
  }
  return (
    <Link href={href} className={classes}>
      {content}
    </Link>
  );
}
