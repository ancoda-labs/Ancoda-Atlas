import api from '@/config/axios';
import type {
  BipadDistrictContacts,
  FloodDeskPayload,
  FloodInsightFeed,
  FloodOfficialFeed,
  FloodVideo,
  NdrrmaPhoto,
  NewsDigestFeed,
  PortalCarouselPhoto,
  PortalDonationChannel,
} from '@/types';

/** What /flood/gallery answers with. */
export interface GalleryFeed {
  carousel: FloodOfficialFeed<PortalCarouselPhoto> | null;
  featured: FloodOfficialFeed<NdrrmaPhoto> | null;
  generatedAt: string;
}

/** What /flood/videos answers with. */
export interface VideoFeed {
  videos: FloodVideo[];
  live: FloodVideo[];
  searchEnabled: boolean;
  error: string | null;
  fetchedAt: string;
}

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

export async function fetchGalleryService(): Promise<GalleryFeed> {
  const { data } = await api.get<GalleryFeed>('/flood/gallery');
  return data;
}

export async function fetchPressService() {
  const { data } = await api.get('/flood/press');
  return data;
}

export async function fetchVideosService(): Promise<VideoFeed> {
  const { data } = await api.get<VideoFeed>('/flood/videos');
  return data;
}

export async function fetchDigestService(lang: 'en' | 'ne' = 'en'): Promise<NewsDigestFeed> {
  const { data } = await api.get<NewsDigestFeed>('/flood/digest', { params: { lang } });
  return data;
}

export async function fetchInsightsService(lang: string): Promise<FloodInsightFeed> {
  // Non-wire languages wait on a model carry; 30s was cutting the request off
  // mid-translation and leaving the Ask panel stuck on "Reading…".
  const { data } = await api.get<FloodInsightFeed>('/flood/insights', {
    params: { lang },
    timeout: 90_000,
  });
  return data;
}

/** Per-source cycle health. What an operator opens when a section looks stale. */
export async function fetchRefreshStatusService() {
  const { data } = await api.get('/flood/refresh');
  return data;
}

/**
 * The small reviewed strings the chrome needs — the report contact address.
 *
 * Its own route because the footer appears on the dashboard as well as the
 * desk, and pulling the whole desk payload to render one email address would
 * be absurd.
 */
export async function fetchSiteService(): Promise<{ site: { report_contact_email?: string } | null }> {
  const { data } = await api.get('/flood/site');
  return data;
}
