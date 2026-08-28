import type { Metadata } from 'next';
import FloodRescueView from '@/app/bhotekoshi-flood/rescue/FloodRescueView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'People rescued · Rasuwa–Bhotekoshi Flood · Ancoda Atlas',
  description:
    'The NDRRMA register of people rescued in the Rasuwa–Bhotekoshi flood, searchable by name, with the location each person was rescued from and where they were taken.',
};

export default function RescuePage() {
  return <FloodRescueView />;
}
