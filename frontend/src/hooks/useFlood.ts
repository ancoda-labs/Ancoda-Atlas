'use client';

import { useQuery } from '@tanstack/react-query';

import {
  fetchContactsService,
  fetchDeskService,
  fetchDigestService,
  fetchDonationsService,
  fetchGalleryService,
  fetchInsightsService,
  fetchPressService,
  fetchSiteService,
  fetchSituationService,
  fetchVideosService,
} from '@/services/flood-services';
import type { Lang } from '@/store/slices/langSlice';
import type { FloodDeskPayload } from '@/types';

/**
 * How often an open desk page re-asks for its figures.
 *
 * Matched to the server cycle rather than picked per page. Every desk view used
 * to choose its own — three minutes on the rescue register, four on the
 * situation page, five on the overview, and nothing at all on giving and
 * contacts, which never refreshed once opened.
 *
 * Deliberately much shorter than the ten-minute server cycle, not just under
 * it. A poll close to the cycle length means the page can be holding figures
 * almost a full cycle old, and the freshness line then reads "Data updated 11
 * min ago · refreshes every 10 minutes" — which does not merely look untidy, it
 * tells a reader the page is broken.
 *
 * Two minutes matches the desk route's own cache window, so most of these polls
 * are answered from cache and cost an upstream nothing, while the displayed age
 * is never more than two minutes behind the truth.
 */
export const DESK_POLL_MS = 2 * 60 * 1000;

const desk = { refetchInterval: DESK_POLL_MS, staleTime: DESK_POLL_MS / 2 };

export function useDesk(initialData?: FloodDeskPayload) {
  return useQuery({
    queryKey: ['flood', 'desk'],
    queryFn: fetchDeskService,
    // Handed in by the server render, so the reviewed content is in the first
    // HTML rather than arriving a round trip later.
    initialData,
    ...desk,
  });
}

export function useSituation() {
  return useQuery({
    queryKey: ['flood', 'situation'],
    queryFn: fetchSituationService,
    ...desk,
  });
}

export function useContacts() {
  // The government's contact register moves on the order of days, not minutes.
  return useQuery({
    queryKey: ['flood', 'contacts'],
    queryFn: fetchContactsService,
    staleTime: 10 * 60 * 1000,
  });
}

export function useDonations() {
  return useQuery({
    queryKey: ['flood', 'donations'],
    queryFn: fetchDonationsService,
    staleTime: 5 * 60 * 1000,
  });
}

export function useGallery() {
  return useQuery({
    queryKey: ['flood', 'gallery'],
    queryFn: fetchGalleryService,
    staleTime: 10 * 60 * 1000,
  });
}

export function usePress() {
  return useQuery({
    queryKey: ['flood', 'press'],
    queryFn: fetchPressService,
    staleTime: 10 * 60 * 1000,
  });
}

export function useVideos() {
  return useQuery({
    queryKey: ['flood', 'videos'],
    queryFn: fetchVideosService,
    staleTime: 5 * 60 * 1000,
  });
}

export function useDigest(lang: Lang) {
  return useQuery({
    queryKey: ['flood', 'digest', lang],
    queryFn: () => fetchDigestService(lang),
    staleTime: 60_000,
  });
}

export function useInsights(lang: string, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['flood', 'insights', lang],
    queryFn: () => fetchInsightsService(lang),
    // The brief is rewritten every ten minutes at most.
    staleTime: 10 * 60 * 1000,
    enabled: opts?.enabled ?? true,
  });
}

/** The reviewed site block. Changes when a maintainer edits content/, so it is
 *  cached for the life of the page. */
export function useSite() {
  return useQuery({
    queryKey: ['flood', 'site'],
    queryFn: fetchSiteService,
    staleTime: Infinity,
  });
}
