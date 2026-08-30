'use client';

import { useCallback, useEffect, useState } from 'react';

// One language choice, shared by every page of the flood desk.
//
// A visit opens in English. Nepali is one click away, and that click is
// remembered for this tab so Overview → Contacts stays in the same language.
// It is not carried into the next visit — the first thing shown is English.

export type Lang = 'en' | 'ne';

const KEY = 'atlas_language';
const EVENT = 'atlas:language';

function readSession(): Lang | null {
  try {
    const value = sessionStorage.getItem(KEY);
    return value === 'ne' || value === 'en' ? value : null;
  } catch {
    return null;
  }
}

export function useFloodLang(): [Lang, (next: Lang) => void] {
  const [lang, setLang] = useState<Lang>('en');

  useEffect(() => {
    const stored = readSession();
    if (stored) setLang(stored);

    const onChange = (e: Event) => {
      const next = (e as CustomEvent<Lang>).detail;
      if (next === 'en' || next === 'ne') setLang(next);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY && (e.newValue === 'en' || e.newValue === 'ne')) setLang(e.newValue);
    };

    window.addEventListener(EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === 'ne' ? 'ne' : 'en';
  }, [lang]);

  const setLanguage = useCallback((next: Lang) => {
    setLang(next);
    try {
      sessionStorage.setItem(KEY, next);
    } catch {
      /* the choice still applies for this page view */
    }
    window.dispatchEvent(new CustomEvent<Lang>(EVENT, { detail: next }));
  }, []);

  return [lang, setLanguage];
}
