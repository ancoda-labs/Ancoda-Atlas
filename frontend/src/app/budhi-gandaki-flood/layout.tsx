import { FloodDeskProvider } from '@/app/bhotekoshi-flood/_components/FloodDeskProvider';
import { serverGet } from '@/lib/server-api';
import type { FloodDeskPayload } from '@/types';

// Rendered per request, like the Bhotekoshi desk: the helplines and the
// reviewed figures are in the first HTML, not a round trip later.
export const dynamic = 'force-dynamic';

export default async function BudhiGandakiFloodLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const desk = await serverGet<FloodDeskPayload>('/flood/desks/budhi-gandaki-flood');
  return (
    <FloodDeskProvider initialDesk={desk} desk="budhi-gandaki-flood">
      {children}
    </FloodDeskProvider>
  );
}
