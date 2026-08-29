'use client';

import { useEffect, useState } from 'react';

// How often a reader's open page re-asks for the desk's figures.
//
// Matched to the server cycle rather than picked per page. Every desk view used
// to choose its own — three minutes on the rescue register, four on the
// situation page, five on the overview and coverage, and nothing at all on
// giving and contacts, which never refreshed once opened. A page polling faster
// than the server refreshes only re-reads the same numbers, and one that never
// polls leaves a reader watching a flood with figures from whenever they
// happened to open the tab.
//
// Kept slightly under the cycle so a page reliably picks up each new cycle
// rather than drifting a full interval behind it.
export const DESK_POLL_MS = 9 * 60 * 1000;

/**
 * Re-run `load` on mount and every cycle thereafter.
 *
 * Also re-runs when the tab is brought back to the foreground: someone who
 * left the desk open in a background tab for an hour should see current
 * figures on their first glance, not on the next interval tick.
 */
export function useDeskRefresh(load: () => void, intervalMs: number = DESK_POLL_MS): void {
  useEffect(() => {
    load();
    const id = setInterval(load, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // `load` is expected to be stable for the life of the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs]);
}

/** A ticking "now", so a relative timestamp on screen does not freeze. */
export function useTick(everyMs = 30_000): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return tick;
}
