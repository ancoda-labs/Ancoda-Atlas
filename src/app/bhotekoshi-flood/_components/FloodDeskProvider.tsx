'use client';

import React, { createContext, useContext, useMemo, useState } from 'react';
import { useDeskRefresh } from '@/hooks/use-desk-refresh';
import type { FloodContent, FloodDeskPayload } from '@/types';

/**
 * Reviewed flood-desk content in the first HTML, live overlay after.
 *
 * Helplines, sitrep, bank accounts and QR paths live in content/ and must
 * paint without waiting on /api/flood or BIPAD. One client fetch fills gauges,
 * advisories and freshness for every desk page, so FloodShell and the page
 * do not each hit the same route.
 */
interface FloodDeskContextValue {
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

function asDesk(content: FloodContent, live: FloodDeskPayload | null): FloodDeskPayload {
  if (live) return live;
  return {
    ...content,
    river: { gauges: [], error: null, fetchedAt: '' },
    generatedAt: '',
  };
}

export function FloodDeskProvider({
  content,
  children,
}: {
  content: FloodContent;
  children: React.ReactNode;
}) {
  const [live, setLive] = useState<FloodDeskPayload | null>(null);

  useDeskRefresh(
    React.useCallback(() => {
      fetch('/api/flood')
        .then(r => (r.ok ? r.json() : null))
        .then(d => {
          if (d) setLive(d);
        })
        .catch(() => {});
    }, []),
  );

  const desk = useMemo(() => asDesk(content, live), [content, live]);
  const value = useMemo(() => ({ content, live, desk }), [content, live, desk]);

  return <FloodDeskContext.Provider value={value}>{children}</FloodDeskContext.Provider>;
}
