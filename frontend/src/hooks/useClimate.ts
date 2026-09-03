'use client';

import { useQuery } from '@tanstack/react-query';

import { fetchClimateService } from '@/services/climate-services';
import { useClimateSeed } from '@/components/ClimateSeed';
import type { ClimateContextPayload } from '@/types';

/** Weekly OWID snapshot plus reviewed facts. Cached hard — the file is annual. */
export function useClimate(initialData?: ClimateContextPayload) {
  const seed = useClimateSeed();
  return useQuery({
    queryKey: ['climate'],
    queryFn: fetchClimateService,
    initialData: initialData ?? seed ?? undefined,
    staleTime: 10 * 60 * 1000,
  });
}
