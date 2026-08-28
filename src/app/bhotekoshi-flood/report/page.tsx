import type { Metadata } from 'next';
import FloodReportView from '@/app/bhotekoshi-flood/report/FloodReportView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Ground reports · Rasuwa–Bhotekoshi Flood · Ancoda Atlas',
  description:
    'Photographs sent in by people in the districts affected by the Rasuwa–Bhotekoshi flood, mapped to where they were taken.',
};

export default function ReportPage() {
  return <FloodReportView />;
}
