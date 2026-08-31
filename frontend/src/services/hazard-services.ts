import api from '@/config/axios';
import type { HazardSnapshot } from '@/types';

/** The synthesized hazard snapshot the landing dashboard renders. */
export async function fetchDashboardService(): Promise<HazardSnapshot> {
  const { data } = await api.get<HazardSnapshot>('/data');
  return data;
}
