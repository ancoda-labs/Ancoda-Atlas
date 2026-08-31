import type { Metadata } from 'next';
import FloodDamageView from '@/app/bhotekoshi-flood/damage/FloodDamageView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Damage assessment · Rasuwa–Bhotekoshi Flood · Ancoda Atlas',
  description:
    'Copernicus EMS Rapid Mapping EMSR927 grading for Syabrubesi and the Trishuli corridor, and the Nepal Electricity Authority 10 Bhadra notice.',
};

export default function DamagePage() {
  return <FloodDamageView />;
}
