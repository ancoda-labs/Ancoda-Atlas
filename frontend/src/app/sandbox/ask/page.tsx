import type { Metadata } from 'next';
import AskSandboxView from '@/app/sandbox/ask/AskSandboxView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Ask Atlas sandbox · Ancoda Atlas',
  description: 'Unlisted test bed for a desk-grounded ask box. Not the public flood desk.',
  robots: { index: false, follow: false },
};

export default function AskSandboxPage() {
  return <AskSandboxView />;
}
