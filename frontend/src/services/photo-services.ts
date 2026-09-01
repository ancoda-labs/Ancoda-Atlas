import api from '@/config/axios';
import type { FloodPhoto } from '@/types';

export interface PhotoFeed {
  enabled: boolean;
  photos: FloodPhoto[];
  reason?: string;
}

export async function fetchPhotosService(): Promise<PhotoFeed> {
  const { data } = await api.get<PhotoFeed>('/flood/photos');
  return data;
}

/**
 * Send a ground report.
 *
 * safetyAcknowledged is required by the API and is not a formality: the desk
 * asks people not to go closer to a river to get a picture for it.
 */
export async function uploadPhotoService(form: FormData): Promise<{ photo: FloodPhoto }> {
  const { data } = await api.post<{ photo: FloodPhoto }>('/flood/photos', form, {
    // Let the browser set the multipart boundary itself.
    headers: { 'Content-Type': undefined },
    timeout: 60_000,
  });
  return data;
}

export async function reportPhotoService(
  id: string,
  reason: string | null,
): Promise<{ counted: boolean; reportCount: number; removed: boolean }> {
  const { data } = await api.post('/flood/photos/report', { id, reason });
  return data;
}
