'use client';

import React from 'react';
import { useAtlasTheme } from '@/lib/use-atlas-theme';
import type { Lang } from '@/lib/use-flood-lang';

/**
 * Light/dark switch for the flood desk.
 *
 * Sits beside the language switch because the two are the same kind of choice —
 * how the page is rendered for this reader — and because a page read outdoors on
 * a phone in daylight and one read at 3am in a relief camp want opposite things.
 */
export default function FloodThemeToggle({ lang }: { lang: Lang }) {
  const [theme, setTheme] = useAtlasTheme();
  const dark = theme === 'dark';

  return (
    <button
      type="button"
      className="fl-theme-toggle"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      aria-pressed={dark}
      aria-label={
        lang === 'ne'
          ? dark ? 'उज्यालो रूपमा बदल्नुहोस्' : 'अँध्यारो रूपमा बदल्नुहोस्'
          : dark ? 'Switch to light theme' : 'Switch to dark theme'
      }
      title={lang === 'ne' ? (dark ? 'उज्यालो' : 'अँध्यारो') : dark ? 'Light' : 'Dark'}
    >
      <span aria-hidden="true">{dark ? '☀' : '☾'}</span>
    </button>
  );
}
