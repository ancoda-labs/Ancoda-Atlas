import type { Metadata } from 'next';
import BhotekoshiFloodView from '@/app/bhotekoshi-flood/BhotekoshiFloodView';

// Rendered per request, not prerendered. Reviewed content is still inlined by
// SSR, so the first paint carries the numbers either way. ISR needs an
// incremental cache the Workers deployment does not have.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Rasuwa–Bhotekoshi Flood · Ancoda Atlas',
  description:
    'Live response desk for the Rasuwa–Bhotekoshi flood: safety guidance, emergency numbers, live river levels from the Government of Nepal BIPAD Portal, and verified ways to donate.',
};

export default function BhotekoshiFloodPage() {
  return <BhotekoshiFloodView />;
}
