'use client';

import React from 'react';
import { useAtlasTheme } from '@/hooks/use-atlas-theme';
import type { Lang } from '@/hooks/use-flood-lang';

/**
 * Light/dark switch for the flood desk and the Atlas dashboard.
 *
 * A reader outdoors on a phone in daylight and one at 3am in a relief camp
 * want opposite things. The control has to be findable — a 13px glyph in the
 * language row was not. Two labelled sides, the active one filled.
 */
export default function FloodThemeToggle({ lang }: { lang: Lang }) {
  const [theme, setTheme] = useAtlasTheme();
  const dark = theme === 'dark';

  return (
    <div
      className="fl-theme"
      role="group"
      aria-label={lang === 'ne' ? 'रूप' : 'Theme'}
    >
      <button
        type="button"
        className={dark ? undefined : 'on'}
        aria-pressed={!dark}
        onClick={() => setTheme('light')}
      >
        <SunIcon />
        {lang === 'ne' ? 'उज्यालो' : 'Light'}
      </button>
      <button
        type="button"
        className={dark ? 'on' : undefined}
        aria-pressed={dark}
        onClick={() => setTheme('dark')}
      >
        <MoonIcon />
        {lang === 'ne' ? 'अँध्यारो' : 'Dark'}
      </button>
    </div>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="4" fill="currentColor" />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        d="M12 3v2M12 19v2M5 12H3M21 12h-2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M16.5 3.5a8.5 8.5 0 1 1-10 12.4A7 7 0 0 0 16.5 3.5z"
      />
    </svg>
  );
}
