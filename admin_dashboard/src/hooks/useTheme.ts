import { useCallback, useState } from 'react';

export type Theme = 'light' | 'system';

const STORAGE_KEY = 'tachyo_theme';

/** Theme state backing the Settings/corner theme toggle. Dark mode has
 * been removed — 'system' is kept only so an existing stored preference
 * doesn't error out, but both values now resolve to the same thing:
 * light. No data-theme attribute is set on <html> any more since
 * index.css no longer has anything to key off it. */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === 'light' || saved === 'system' ? saved : 'system';
    } catch {
      return 'system';
    }
  });

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* private-browsing / storage disabled */ }
  }, []);

  const resolvedTheme: 'light' = 'light';

  return { theme, setTheme, resolvedTheme } as const;
}
