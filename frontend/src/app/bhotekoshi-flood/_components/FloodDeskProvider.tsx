'use client';

import React, { createContext, useContext, useMemo } from 'react';

import { useDesk } from '@/hooks/useFlood';
import type { FloodDeskSlug } from '@/services/flood-services';
import type { FloodContent, FloodDeskPayload } from '@/types';

/**
 * The desk payload, fetched once for every page under a flood desk —
 * /bhotekoshi-flood, or /budhi-gandaki-flood with `desk` set.
 *
 * `desk` rides in the context so a shared component can tell which flood it is
 * drawing for, and drop wording that only holds for the Bhotekoshi desk.
 *
 * The reviewed content arrives in the first HTML — the layout fetches it
 * server-side and hands it in as `initialDesk` — and the live overlay refreshes
 * on the desk's own cadence after that. One query serves FloodShell and the
 * page, so the two do not each hit the same route.
 *
 * The context shape is unchanged from the version that held its own state, so
 * no consumer had to be touched when the fetching moved.
 */
interface FloodDeskContextValue {
  deskSlug: FloodDeskSlug;
  content: FloodContent;
  live: FloodDeskPayload | null;
  desk: FloodDeskPayload;
}

const FloodDeskContext = createContext<FloodDeskContextValue | null>(null);

export function useFloodDesk(): FloodDeskContextValue {
  const ctx = useContext(FloodDeskContext);
  if (!ctx) {
    throw new Error('useFloodDesk must be used under FloodDeskProvider');
  }
  return ctx;
}

/** What the desk renders when the API has not answered yet.
 *
 *  Every section is empty rather than absent, so a view destructuring a key
 *  does not crash on a cold API. */
const EMPTY_DESK = {
  river: { gauges: [], error: null, fetchedAt: '' },
  generatedAt: '',
} as unknown as FloodDeskPayload;

export function FloodDeskProvider({
  initialDesk,
  desk: deskSlug = 'bhotekoshi-flood',
  children,
}: {
  initialDesk: FloodDeskPayload | null;
  desk?: FloodDeskSlug;
  children: React.ReactNode;
}) {
  const { data } = useDesk(initialDesk ?? undefined, deskSlug);
  const desk = data ?? initialDesk ?? EMPTY_DESK;

  const value = useMemo(
    () => ({ deskSlug, content: desk as unknown as FloodContent, live: data ?? null, desk }),
    [deskSlug, desk, data],
  );

  return <FloodDeskContext.Provider value={value}>{children}</FloodDeskContext.Provider>;
}
