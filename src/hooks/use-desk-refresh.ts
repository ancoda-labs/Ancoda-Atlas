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
// Deliberately much shorter than the ten-minute server cycle, not just under
// it. A poll close to the cycle length means the page can be holding figures
// almost a full cycle old, and the freshness line then reads "Data updated 11
// min ago · refreshes every 10 minutes" — which is not merely untidy, it tells
// a reader the page is broken.
//
// Two minutes matches the desk route's own cache window, so most of these polls
// are answered from cache and cost an upstream nothing, while the displayed age
// is never more than two minutes behind the truth.
export const DESK_POLL_MS = 2 * 60 * 1000;

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

/**
 * "next update in 6 min", or an honest word when the cycle is overdue.
 *
 * Stating the interval instead — "refreshes every 10 minutes" — reads as a
 * contradiction next to any age above ten minutes, which happens legitimately
 * while a cycle is in flight. A countdown to the cycle that is actually
 * scheduled cannot contradict the age beside it.
 */
export function nextUpdateLabel(
  nextAt: string | null | undefined,
  lang: 'en' | 'ne',
  refreshing = false,
): string | null {
  // A cycle in flight is the usual reason the previous one looks overdue: the
  // timestamp only moves when a cycle finishes, and a slow upstream — or a
  // portal rate-limiting the sweep — can carry one past its own next due time.
  // Reporting that as "update due" tells a reader something is wrong when in
  // fact the figures are being fetched as they watch.
  if (refreshing) return lang === 'ne' ? 'अहिले अद्यावधिक हुँदै' : 'updating now';
  if (!nextAt) return null;
  const ms = new Date(nextAt).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  // Past its due time and no cycle running. This is a narrow window — the
  // schedule fires on fixed boundaries while this timestamp is computed from
  // when the last cycle finished, so the two drift apart by however long a
  // cycle takes. Nothing is wrong and nothing useful can be said, so the
  // countdown is simply omitted: the age beside it is still exactly true, and
  // an alarming "update due" would be telling the reader about our arithmetic
  // rather than about their flood.
  if (ms <= 0) return null;
  const mins = Math.max(1, Math.round(ms / 60000));
  return lang === 'ne' ? `${mins} मिनेटमा अर्को अद्यावधिक` : `next update in ${mins} min`;
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
