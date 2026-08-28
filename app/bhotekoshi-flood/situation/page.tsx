import type { Metadata } from 'next';
import FloodSituationView from '@/components/FloodSituationView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'What has been reported · Rasuwa–Bhotekoshi Flood · Ancoda Atlas',
  description:
    'Flood and landslide incidents logged in the Government of Nepal BIPAD Portal for the Trishuli corridor, with the damage figures entered so far and the count still awaiting them.',
};

export default function SituationPage() {
  return <FloodSituationView />;
}
