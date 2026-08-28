import type { Metadata } from 'next';
import FloodDonateView from '@/components/FloodDonateView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Give safely · Rasuwa–Bhotekoshi Flood · Ancoda Atlas',
  description:
    'Verified ways to donate to the Rasuwa–Bhotekoshi flood response: official government relief funds and recognised organisations, with account numbers and QR codes.',
};

export default function DonatePage() {
  return <FloodDonateView />;
}
