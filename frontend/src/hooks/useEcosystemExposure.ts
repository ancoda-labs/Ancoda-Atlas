'use client';

import { useQuery } from '@tanstack/react-query';

import { fetchEcosystemExposureService } from '@/services/event-services';
import type { EcosystemExposure } from '@/types';

const STALE_MS = 10 * 60 * 1000;

export function useEcosystemExposure(eventId: string, initialData?: EcosystemExposure | null) {
  return useQuery({
    queryKey: ['events', eventId, 'ecosystem-exposure'],
    queryFn: () => fetchEcosystemExposureService(eventId),
    staleTime: STALE_MS,
    initialData: initialData ?? undefined,
  });
}
