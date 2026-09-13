import type { ButtonHTMLAttributes } from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FlowButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  text?: string;
  /** Text shown once the fill animation takes over on hover. Defaults to `text`. */
  hoverText?: string;
}

export function FlowButton({ text = 'Modern Button', hoverText, className, type = 'button', ...props }: FlowButtonProps) {
  const revealText = hoverText ?? text;

  return (
    <button
      type={type}
      className={cn(
        // Rest state matches this page's other primary buttons (.login-submit:
        // solid brand red, white text, 10px radius) but sized down a step —
        // no hover glow, just the flow animation itself.
        'group relative flex items-center justify-center gap-2 overflow-hidden rounded-[10px] border-0 bg-[#CC0000] px-3 py-2 font-[inherit] text-xs font-extrabold tracking-[0.6px] text-white cursor-pointer transition-all duration-[600ms] ease-[cubic-bezier(0.23,1,0.32,1)] hover:text-[#CC0000] active:scale-[0.97]',
        className,
      )}
      {...props}
    >
      {/* Left arrow (arr-2) */}
      <ArrowRight
        className="absolute w-3.5 h-3.5 left-[-25%] stroke-white group-hover:stroke-[#CC0000] fill-none z-[9] group-hover:left-3 transition-all duration-[800ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]"
      />

      {/* Text — rest label slides out and fades, hover label fades in behind it */}
      <span className="relative z-[1] grid">
        <span className="col-start-1 row-start-1 -translate-x-3 opacity-100 group-hover:translate-x-3 group-hover:opacity-0 transition-all duration-[800ms] ease-out">
          {text}
        </span>
        <span className="col-start-1 row-start-1 translate-x-3 opacity-0 group-hover:translate-x-3 group-hover:opacity-100 transition-all duration-[800ms] ease-out delay-[150ms]">
          {revealText}
        </span>
      </span>

      {/* Circle — flat white fill flooding over the resting red. No grey,
          no black: just the two colors already used everywhere on this
          page, inverted. */}
      <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-[50%] opacity-0 bg-white group-hover:w-[600px] group-hover:h-[600px] group-hover:opacity-100 transition-all duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)]" />

      {/* Right arrow (arr-1) */}
      <ArrowRight
        className="absolute w-3.5 h-3.5 right-3 stroke-white group-hover:stroke-[#CC0000] fill-none z-[9] group-hover:right-[-25%] transition-all duration-[800ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]"
      />
    </button>
  );
}
