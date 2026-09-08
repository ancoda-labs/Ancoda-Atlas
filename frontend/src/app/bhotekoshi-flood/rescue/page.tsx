import type { Metadata } from 'next';
import FloodRescueView from '@/app/bhotekoshi-flood/rescue/FloodRescueView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Find someone · Rasuwa–Bhotekoshi Flood · Ancoda Atlas',
  description:
    'Search a name, place or age across the NDRRMA rescued register and family missing reports filed on the Prime Minister’s Office portal. Portal filings are not the official uncontacted toll; the two lists are not merged.',
};

export default function RescuePage() {
  return <FloodRescueView />;
}
