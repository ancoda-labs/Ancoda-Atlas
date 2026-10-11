import type { Metadata } from 'next';
import BudhiGandakiFloodView from '@/app/budhi-gandaki-flood/BudhiGandakiFloodView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Budhi Gandaki Flood · Gorkha · Ancoda Atlas',
  description:
    'Response desk for the Budhi Gandaki flood in Gorkha: safety guidance, emergency numbers, first-day reports with their sources, and live river levels from the Government of Nepal BIPAD Portal.',
};

export default function BudhiGandakiFloodPage() {
  return <BudhiGandakiFloodView />;
}
