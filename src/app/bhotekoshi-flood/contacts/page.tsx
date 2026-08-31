import type { Metadata } from 'next';
import FloodContactsView from '@/app/bhotekoshi-flood/contacts/FloodContactsView';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Who to call · Rasuwa–Bhotekoshi Flood · Ancoda Atlas',
  description:
    'Verified national emergency numbers, NDRRMA warehouse drop-off lines, and district contacts for the Rasuwa–Bhotekoshi flood.',
};

export default function ContactsPage() {
  return <FloodContactsView />;
}
