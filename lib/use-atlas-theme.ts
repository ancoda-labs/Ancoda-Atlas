'use client';

import { useCallback, useEffect, useState } from 'react';

// One theme choice, shared by the dashboard and every flood-desk page.
//
// The dashboard already stored a preference under `atlas_theme` and applied it
// by putting `dark-theme` on <body>. The flood desk never read it, so a reader
// who chose dark on the dashboard got a bright white page when they opened the
// flood pages — and had no way to change it, because the toggle lived on a
// screen they had navigated away from.
//
// This reads the same key, applies the same class, and broadcasts changes the
// way the language hook does, so every mounted component agrees.

export type Theme = 'light' | 'dark';

const KEY = 'atlas_theme';
const EVENT = 'atlas:theme';
const CLASS = 'dark-theme';

function readStored(): Theme | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    // Private mode and blocked site data both throw here.
    return null;
  }
}

function apply(theme: Theme): void {
  document.body.classList.toggle(CLASS, theme === 'dark');
}

export function useAtlasTheme(): [Theme, (next: Theme) => void] {
  // Starts light so the server-rendered markup and the first client render
  // agree; the stored choice is applied immediately after mount.
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    // The class may already be on <body> if the dashboard ran first in this
    // session, so fall back to reading it rather than assuming light.
    const stored = readStored() ?? (document.body.classList.contains(CLASS) ? 'dark' : null);
    if (stored) {
      setTheme(stored);
      apply(stored);
    }

    const onChange = (e: Event) => {
      const next = (e as CustomEvent<Theme>).detail;
      if (next === 'light' || next === 'dark') {
        setTheme(next);
        apply(next);
      }
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY && (e.newValue === 'light' || e.newValue === 'dark')) {
        setTheme(e.newValue);
        apply(e.newValue);
      }
    };

    window.addEventListener(EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const setThemeAndStore = useCallback((next: Theme) => {
    setTheme(next);
    apply(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* the choice still applies for this page view */
    }
    window.dispatchEvent(new CustomEvent<Theme>(EVENT, { detail: next }));
  }, []);

  return [theme, setThemeAndStore];
}
