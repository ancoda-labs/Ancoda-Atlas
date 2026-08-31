import type { Metadata } from 'next';
import FloodDonateView from '@/app/bhotekoshi-flood/donate/FloodDonateView';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Give safely · Rasuwa–Bhotekoshi Flood · Ancoda Atlas',
  description:
    'Give to the Rasuwa–Bhotekoshi flood response: authorized Prime Minister’s Disaster Relief Fund QR, cash already in that fund, and the NDRRMA relief-goods demand list with emergency warehouses.',
};

export default function DonatePage() {
  return <FloodDonateView />;
}
