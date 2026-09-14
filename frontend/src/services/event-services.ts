import api from '@/config/axios';
import type { EcosystemExposure } from '@/types';

export async function fetchEcosystemExposureService(
  eventId: string,
): Promise<EcosystemExposure | null> {
  const response = await api.get<EcosystemExposure>(`/events/${encodeURIComponent(eventId)}/ecosystem-exposure`, {
    validateStatus: status => status === 200 || status === 204,
  });
  if (response.status === 204) return null;
  return response.data;
}
