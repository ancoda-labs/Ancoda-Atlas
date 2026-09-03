'use client';

import { useMutation, useQuery } from '@tanstack/react-query';

import { askService, fetchSandboxStatusService } from '@/services/sandbox-services';
import type { Lang } from '@/store/slices/langSlice';

export function useSandboxStatus() {
  return useQuery({
    queryKey: ['sandbox', 'status'],
    queryFn: fetchSandboxStatusService,
    // The remaining budget changes with every turn, so it is never stale.
    staleTime: 0,
  });
}

export function useAsk() {
  return useMutation({
    // Any code from the language registry, not just the site chrome's two:
    // the ask box translates its answer without translating the page.
    mutationFn: ({ message, lang }: { message: string; lang: Lang | string }) =>
      askService(message, lang),
  });
}
