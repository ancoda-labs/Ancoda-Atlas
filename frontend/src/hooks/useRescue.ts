'use client';

import { useMutation, useQuery } from '@tanstack/react-query';

import {
  fetchPersonsService,
  fetchRescueService,
  fileCorrectionService,
} from '@/services/rescue-services';

export function useRescueRegister(enabled = true) {
  return useQuery({
    queryKey: ['flood', 'rescue'],
    queryFn: fetchRescueService,
    // Gated by the caller: between them the two registers are around twelve
    // megabytes, and most visitors to the page never search a name.
    enabled,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * The OPMCM register, whole.
 *
 * Sixteen thousand rows, so it is cached hard: re-fetching it because a reader
 * switched tabs would cost them several megabytes on a mobile connection for a
 * list that moves every ten minutes.
 */
export function usePersonRegister(enabled = true) {
  return useQuery({
    queryKey: ['flood', 'persons'],
    queryFn: fetchPersonsService,
    enabled,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useFileCorrection() {
  return useMutation({ mutationFn: fileCorrectionService });
}
