import { useEffect, useRef, useState } from 'react';

/**
 * Tracks a rolling window of a metric's own real values as they change —
 * no fabricated data. `ready` should stay false until the app's initial
 * data fetch has resolved: metric state commonly starts at 0 and jumps to
 * its real value once loading finishes, and that load-in jump is not a
 * genuine trend — recording it would produce a misleading "up" badge on
 * every fresh page load. Once `ready` flips true, the value at that
 * moment becomes the baseline (not compared against anything), and only
 * real changes after that are appended, capped at `maxSamples`.
 */
export function useMetricHistory(value: number, ready: boolean, maxSamples = 8): number[] {
  const [history, setHistory] = useState<number[]>([]);
  const baselineSet = useRef(false);

  useEffect(() => {
    if (!ready) return;
    if (!baselineSet.current) {
      baselineSet.current = true;
      setHistory([value]);
      return;
    }
    setHistory(prev => {
      if (prev.length && prev[prev.length - 1] === value) return prev;
      const next = [...prev, value];
      return next.length > maxSamples ? next.slice(next.length - maxSamples) : next;
    });
  }, [value, ready, maxSamples]);

  return history;
}

export interface MetricTrend {
  direction: 'up' | 'down' | 'flat';
  /** Percent change from the oldest to newest sample in the window, or null when it can't be expressed as a percentage (e.g. oldest sample was 0). */
  percent: number | null;
}

/** Derives a trend from a history buffer. Returns null until there are at least two distinct samples to compare — never invents a "flat" reading out of a single data point. */
export function getMetricTrend(history: number[]): MetricTrend | null {
  if (history.length < 2) return null;
  const first = history[0];
  const last = history[history.length - 1];
  if (first === last) return { direction: 'flat', percent: 0 };
  const direction = last > first ? 'up' : 'down';
  const percent = first === 0 ? null : ((last - first) / Math.abs(first)) * 100;
  return { direction, percent };
}
