import { loadFloodContent } from '@/lib/flood';
import { FloodDeskProvider } from '@/app/bhotekoshi-flood/_components/FloodDeskProvider';

/** Reviewed JSON changes by deploy. Live gauges overlay after paint. */
export const revalidate = 300;

export default function BhotekoshiFloodLayout({ children }: { children: React.ReactNode }) {
  return <FloodDeskProvider content={loadFloodContent()}>{children}</FloodDeskProvider>;
}
