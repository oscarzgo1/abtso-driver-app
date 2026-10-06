import { useEffect, useRef } from 'react';

// "Refresh" on an empty state reloads just the section being looked at — not
// the whole page. The button announces a refresh; every screen that is
// currently mounted listens and re-runs its own loader.

export const REFRESH_EVENT = 'tachyo:refresh-section';

export const requestSectionRefresh = () => window.dispatchEvent(new CustomEvent(REFRESH_EVENT));

/** Call `load` whenever a section refresh is requested (always the latest `load`). */
export function useSectionRefresh(load: () => void | Promise<unknown>) {
  const ref = useRef(load);
  ref.current = load;
  useEffect(() => {
    const handler = () => { void ref.current(); };
    window.addEventListener(REFRESH_EVENT, handler);
    return () => window.removeEventListener(REFRESH_EVENT, handler);
  }, []);
}
