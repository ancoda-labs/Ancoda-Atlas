'use client';

import Link from 'next/link';
import { useAtlasTheme } from '@/hooks/use-atlas-theme';
import type { Lang } from '@/hooks/use-flood-lang';

/**
 * The Atlas mark on the flood-desk masthead.
 *
 * The dashboard already shows it. The desk did not — only a text back-link —
 * so a reader who landed on /bhotekoshi-flood had no sign they were still
 * on Atlas. Light/dark files are the same pair the dashboard uses.
 */
export default function AtlasBrand({ lang }: { lang: Lang }) {
  const [theme] = useAtlasTheme();
  const dark = theme === 'dark';

  return (
    <Link href="/" className="fl-brand">
      <img
        className="fl-brand-logo"
        src={dark ? '/images/atlas-white.png' : '/images/atlas-black.png'}
        alt="Ancoda Atlas"
        width={120}
        height={43}
      />
      <span>{lang === 'ne' ? 'एट्लसमा फर्कनुहोस्' : 'Back to Atlas'}</span>
    </Link>
  );
}
