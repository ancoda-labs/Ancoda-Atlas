'use client';

import { useCallback, useEffect, useState } from 'react';

// One language choice, shared by every page of the flood desk.
//
// The desk is now several routes rather than one, and a reader who picks Nepali
// on the overview must not land back in English on the rescue register. The
// choice lives in localStorage under the key the rest of Atlas already uses,
// and a custom event keeps every mounted component on a page in step — storage
// events only fire in *other* tabs, so they cannot do this on their own.

export type Lang = 'en' | 'ne';

const KEY = 'atlas_language';
const EVENT = 'atlas:language';

function readStored(): Lang | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'ne' || value === 'en' ? value : null;
  } catch {
    // Private mode and blocked site data both throw here. English is fine.
    return null;
  }
}

export function useFloodLang(): [Lang, (next: Lang) => void] {
  // Always starts English so the server-rendered markup and the first client
  // render agree; the stored choice is applied immediately after mount.
  const [lang, setLang] = useState<Lang>('en');

  useEffect(() => {
    const stored = readStored();
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

  const setLanguage = useCallback((next: Lang) => {
    setLang(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* the choice still applies for this page view */
    }
    window.dispatchEvent(new CustomEvent<Lang>(EVENT, { detail: next }));
  }, []);

  return [lang, setLanguage];
}
