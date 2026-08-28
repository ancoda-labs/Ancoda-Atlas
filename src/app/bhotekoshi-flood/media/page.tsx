import type { Metadata } from 'next';
import FloodMediaView from '@/app/bhotekoshi-flood/media/FloodMediaView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Coverage · Rasuwa–Bhotekoshi Flood · Ancoda Atlas',
  description:
    'Reporting on the Rasuwa–Bhotekoshi flood from Nepali newsrooms and broadcasters, linked back to the outlets that produced it.',
};

export default function MediaPage() {
  return <FloodMediaView />;
}
