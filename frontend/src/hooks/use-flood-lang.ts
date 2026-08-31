'use client';

import { useCallback, useEffect } from 'react';

import { useAppDispatch, useAppSelector } from '@/hooks/use-app-store';
import { setLang, type Lang } from '@/store/slices/langSlice';

/**
 * One language choice, shared by every page of the flood desk.
 *
 * The state lives in the store; what stays here is setting the document
 * language, which matters for screen readers and for how a browser hyphenates
 * Devanagari.
 */
export function useFloodLang(): [Lang, (next: Lang) => void] {
  const lang = useAppSelector(s => s.lang.lang);
  const dispatch = useAppDispatch();

  useEffect(() => {
    document.documentElement.lang = lang === 'ne' ? 'ne' : 'en';
  }, [lang]);

  const set = useCallback((next: Lang) => dispatch(setLang(next)), [dispatch]);
  return [lang, set];
}

export type { Lang };
