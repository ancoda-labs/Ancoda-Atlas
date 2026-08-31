import api from '@/config/axios';
import type { OpmcmPersonRegister, RescueRegister } from '@/types';

/** NDRRMA's rescued-persons register. */
export async function fetchRescueService(): Promise<RescueRegister> {
  const { data } = await api.get<RescueRegister>('/flood/rescue');
  return data;
}

/**
 * The OPMCM missing-and-found register, whole.
 *
 * Sixteen thousand rows in one response, deliberately: this is what a family
 * searches by name, and a search that covers the first two hundred answers
 * "not found" about someone who is on the list.
 */
export async function fetchPersonsService(): Promise<OpmcmPersonRegister> {
  const { data } = await api.get<OpmcmPersonRegister>('/flood/persons');
  return data;
}

/**
 * File a correction against the register.
 *
 * Nothing filed here changes what the register shows — it is stored for a human
 * to read. The form says so, and so does the API.
 */
export async function fileCorrectionService(payload: {
  kind?: string;
  message: string;
  personId?: number | null;
  personName?: string | null;
  contact?: string | null;
}): Promise<{ received: boolean }> {
  const { data } = await api.post('/flood/rescue/correction', payload);
  return data;
}
