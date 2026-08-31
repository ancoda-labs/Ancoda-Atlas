'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { EVENTS_URL } from '@/config/axios';
import { fetchDashboardService } from '@/services/hazard-services';
import { fetchNewsBundleService } from '@/services/news-services';
import { useAppDispatch } from '@/hooks/use-app-store';
import { setSweeping } from '@/store/slices/deskSlice';
import type { HazardSnapshot } from '@/types';

export const DASHBOARD_KEY = ['dashboard'] as const;

/** How often an open dashboard re-asks, when the stream is not delivering.
 *
 * The sweep runs every fifteen minutes, so this is a backstop rather than the
 * primary path — see useSweepStream below. */
const DASHBOARD_POLL_MS = 2 * 60 * 1000;

export function useDashboard(initialData?: HazardSnapshot) {
  return useQuery({
    queryKey: DASHBOARD_KEY,
    queryFn: fetchDashboardService,
    initialData,
    refetchInterval: DASHBOARD_POLL_MS,
    refetchIntervalInBackground: false,
  });
}

/**
 * The live sweep stream, pushed into the query cache.
 *
 * SSE cannot go through axios, so it stays an EventSource — but rather than
 * holding its own copy of the snapshot it writes into the same cache entry the
 * query owns, so a component reads one source whether the update arrived by
 * stream or by poll.
 *
 * The poll above is the backstop, and it is not redundant: a proxy that buffers
 * event-streams, a dropped connection the browser does not retry, or an
 * instance that has not swept yet all leave the stream silent. Before there was
 * a poll the page simply stopped moving, with nothing on screen to say so.
 */
export function useSweepStream() {
  const queryClient = useQueryClient();
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (typeof EventSource === 'undefined') return;

    const source = new EventSource(EVENTS_URL);

    source.onmessage = event => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'sweep_start') {
          dispatch(setSweeping(true));
        } else if (message.type === 'update' && message.data) {
          dispatch(setSweeping(false));
          queryClient.setQueryData(DASHBOARD_KEY, message.data);
        }
      } catch {
        /* a malformed frame is not worth breaking the stream over */
      }
    };

    source.onerror = () => {
      source.close();
      dispatch(setSweeping(false));
    };

    return () => source.close();
  }, [queryClient, dispatch]);
}

export function useNewsBundle(window = '24h') {
  return useQuery({
    queryKey: ['news', 'bundle', window],
    queryFn: () => fetchNewsBundleService(window),
    // The wire's own cache is four minutes; asking more often only re-reads it.
    staleTime: 4 * 60 * 1000,
  });
}
