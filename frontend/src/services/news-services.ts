import api from '@/config/axios';
import type { NewsBundleResponse, NewsResponse } from '@/types';

/**
 * Every dashboard panel's news in one request.
 *
 * Eight separate topic routes on a high-latency mobile connection each pay
 * 200–400ms before any work starts, which is why the API grew a bundle mode.
 */
export async function fetchNewsBundleService(window = '24h'): Promise<NewsBundleResponse> {
  const { data } = await api.get<NewsBundleResponse>('/news', { params: { bundle: true, window } });
  return data;
}

export async function fetchTopicNewsService(
  topic: string,
  window = '24h',
  limit = 48,
  sourceCap = 12,
): Promise<NewsResponse> {
  const { data } = await api.get<NewsResponse>('/news', {
    params: { topic, window, limit, sourceCap },
  });
  return data;
}
