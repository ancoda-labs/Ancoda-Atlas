import api from '@/config/axios';
import type {
  BipadDistrictContacts,
  FloodDeskPayload,
  FloodOfficialFeed,
  NewsDigestFeed,
  PortalDonationChannel,
} from '@/types';

/** The overview: reviewed content with the live ten-minute cycle laid over it. */
export async function fetchDeskService(): Promise<FloodDeskPayload> {
  const { data } = await api.get<FloodDeskPayload>('/flood');
  return data;
}

export async function fetchSituationService() {
  const { data } = await api.get('/flood/situation');
  return data;
}

export async function fetchContactsService(): Promise<FloodOfficialFeed<BipadDistrictContacts>> {
  const { data } = await api.get('/flood/contacts');
  return data;
}

export async function fetchDonationsService(): Promise<FloodOfficialFeed<PortalDonationChannel>> {
  const { data } = await api.get('/flood/donations');
  return data;
}

export async function fetchGalleryService() {
  const { data } = await api.get('/flood/gallery');
  return data;
}

export async function fetchPressService() {
  const { data } = await api.get('/flood/press');
  return data;
}

export async function fetchVideosService() {
  const { data } = await api.get('/flood/videos');
  return data;
}

export async function fetchDigestService(lang: 'en' | 'ne' = 'en'): Promise<NewsDigestFeed> {
  const { data } = await api.get<NewsDigestFeed>('/flood/digest', { params: { lang } });
  return data;
}

export async function fetchInsightsService(lang: string) {
  const { data } = await api.get('/flood/insights', { params: { lang } });
  return data;
}

/** Per-source cycle health. What an operator opens when a section looks stale. */
export async function fetchRefreshStatusService() {
  const { data } = await api.get('/flood/refresh');
  return data;
}
