import { FloodDeskProvider } from '@/app/bhotekoshi-flood/_components/FloodDeskProvider';
import { serverGet } from '@/lib/server-api';
import type { FloodDeskPayload } from '@/types';

// Rendered per request. The reviewed content is fetched server-side so the
// helplines, the sitrep and the donation routes are in the first HTML — this
// is the page that tells someone who to call, and it must not wait on a round
// trip to say so.
export const dynamic = 'force-dynamic';

export default async function BhotekoshiFloodLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const desk = await serverGet<FloodDeskPayload>('/flood');
  return <FloodDeskProvider initialDesk={desk}>{children}</FloodDeskProvider>;
}
