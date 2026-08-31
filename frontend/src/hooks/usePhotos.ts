'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  fetchPhotosService,
  reportPhotoService,
  uploadPhotoService,
} from '@/services/photo-services';

const PHOTOS_KEY = ['flood', 'photos'] as const;

export function usePhotos() {
  return useQuery({
    queryKey: PHOTOS_KEY,
    queryFn: fetchPhotosService,
    // The URLs inside are short-lived presigned links, so a long cache would
    // hand a reader signatures that have already expired.
    staleTime: 30_000,
  });
}

export function useUploadPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: uploadPhotoService,
    // Photos publish on arrival, so the sender should see theirs immediately.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PHOTOS_KEY }),
  });
}

export function useReportPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string | null }) =>
      reportPhotoService(id, reason),
    // Three distinct flags retire a photo, so the gallery may have changed.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PHOTOS_KEY }),
  });
}
