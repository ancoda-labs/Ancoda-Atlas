import api from '@/config/axios';
import type { ClimateContextPayload } from '@/types';

/** Standing climate context: OWID snapshot plus reviewed glacier/GLOF facts. */
export async function fetchClimateService(): Promise<ClimateContextPayload> {
  const { data } = await api.get<ClimateContextPayload>('/climate');
  return data;
}
