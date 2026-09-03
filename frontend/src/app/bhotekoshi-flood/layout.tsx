import { FloodDeskProvider } from '@/app/bhotekoshi-flood/_components/FloodDeskProvider';
import { ClimateSeedProvider } from '@/components/ClimateSeed';
import { serverGet } from '@/lib/server-api';
import type { ClimateContextPayload, FloodDeskPayload } from '@/types';

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
  const [desk, climate] = await Promise.all([
    serverGet<FloodDeskPayload>('/flood'),
    serverGet<ClimateContextPayload>('/climate'),
  ]);
  return (
    <FloodDeskProvider initialDesk={desk}>
      <ClimateSeedProvider value={climate}>{children}</ClimateSeedProvider>
    </FloodDeskProvider>
  );
}
