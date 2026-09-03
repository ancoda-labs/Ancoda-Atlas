import type { Metadata } from 'next';

import ClimateView from '@/app/climate/ClimateView';
import { serverGet } from '@/lib/server-api';
import type { ClimateContextPayload, NewsResponse } from '@/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Climate · Rasuwa–Bhotekoshi Flood · Ancoda Atlas',
  description: 'Change over time and Nepal’s exposure. Not a cause of any one flood.',
};

const NEWS_PATH = '/news?topic=climate&window=7d&limit=12&sourceCap=8';

export default async function ClimateNePage() {
  const [data, news] = await Promise.all([
    serverGet<ClimateContextPayload>('/climate'),
    serverGet<NewsResponse>(NEWS_PATH),
  ]);
  return <ClimateView lang="ne" data={data} news={news} />;
}
