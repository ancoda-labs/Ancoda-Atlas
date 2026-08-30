import { loadFloodContent } from '@/lib/flood';
import { FloodDeskProvider } from '@/app/bhotekoshi-flood/_components/FloodDeskProvider';

export default function BhotekoshiFloodLayout({ children }: { children: React.ReactNode }) {
  return <FloodDeskProvider content={loadFloodContent()}>{children}</FloodDeskProvider>;
}
