'use client';

import { useCallback, useEffect, useState } from 'react';

// One theme choice, shared by the dashboard and every flood-desk page.
//
// A visit opens in Dark. Light is one click away, and that click is remembered
// for this tab so the dashboard and the desk agree. It is not carried into the
// next visit — the first thing shown is Dark.

export type Theme = 'light' | 'dark';

const KEY = 'atlas_theme';
const EVENT = 'atlas:theme';
const CLASS = 'dark-theme';

function readSession(): Theme | null {
  try {
    const value = sessionStorage.getItem(KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    return null;
  }
}

function apply(theme: Theme): void {
  document.body.classList.toggle(CLASS, theme === 'dark');
}

export function useAtlasTheme(): [Theme, (next: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'dark';
    return readSession() ?? 'dark';
  });

  useEffect(() => {
    const stored = readSession();
    if (stored) {
      setTheme(stored);
      apply(stored);
    } else {
      apply('dark');
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
      sessionStorage.setItem(KEY, next);
    } catch {
      /* the choice still applies for this page view */
    }
    window.dispatchEvent(new CustomEvent<Theme>(EVENT, { detail: next }));
  }, []);

  return [theme, setThemeAndStore];
}
