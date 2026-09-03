import { FloodDeskProvider } from '@/app/bhotekoshi-flood/_components/FloodDeskProvider';
import { serverGet } from '@/lib/server-api';
import type { FloodDeskPayload } from '@/types';

/** Same desk chrome as Coverage and Damage: helplines, mast, section nav. */
export default async function ClimateFloodLayout({ children }: { children: React.ReactNode }) {
  const desk = await serverGet<FloodDeskPayload>('/flood');
  return <FloodDeskProvider initialDesk={desk}>{children}</FloodDeskProvider>;
}
