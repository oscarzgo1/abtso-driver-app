import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTheme, type Theme } from '@/hooks/useTheme';

// Adapted from the "dropdown-14" catalogue component. Two real fixes
// were needed, not just re-skinning:
// 1. The reference's <DropdownMenuTrigger render={<Button .../>} /> uses
//    a render-prop API that belongs to Base UI, not the classic
//    @radix-ui/react-dropdown-menu this same prompt's dependency file
//    installs — Radix's Trigger takes a child + `asChild`, so that's
//    what's used here instead.
// 2. The reference swaps its trigger icon via Tailwind's `dark:` variant
//    (dark:hidden / hidden dark:block), which needs Tailwind's dark mode
//    wired to whatever mechanism toggles it. This app's dark mode is a
//    data-theme attribute (see useTheme), not Tailwind's own dark
//    variant, so the icon is switched from the real resolved theme in
//    JS instead — same visible behavior, correct mechanism for how
//    theming actually works here.
interface ThemeToggleProps {
  /** Notified whenever the menu opens or closes. The sidebar uses this to
   * stay expanded while the menu is up — it collapses on mouseleave, and
   * collapsing unmounts this button (and with it the open menu) the moment
   * the pointer moves off the rail toward the menu itself. */
  onOpenChange?: (open: boolean) => void;
}

export function ThemeToggle({ onOpenChange }: ThemeToggleProps = {}) {
  const { theme, setTheme, resolvedTheme } = useTheme();

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon-sm" aria-label="Toggle theme">
          {resolvedTheme === 'dark' ? <MoonIcon className="size-4" /> : <SunIcon className="size-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as Theme)}>
          <DropdownMenuRadioItem value="light" className="gap-2">
            <SunIcon className="size-4" />
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark" className="gap-2">
            <MoonIcon className="size-4" />
            Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system" className="gap-2">
            <MonitorIcon className="size-4" />
            System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
