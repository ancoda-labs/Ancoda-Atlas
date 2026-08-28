import type { Metadata } from 'next';
import FloodContactsView from '@/app/bhotekoshi-flood/contacts/FloodContactsView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Who to call · Rasuwa–Bhotekoshi Flood · Ancoda Atlas',
  description:
    'Verified emergency numbers for the Rasuwa–Bhotekoshi flood — national rescue, police and ambulance lines, free from any phone in Nepal.',
};

export default function ContactsPage() {
  return <FloodContactsView />;
}
