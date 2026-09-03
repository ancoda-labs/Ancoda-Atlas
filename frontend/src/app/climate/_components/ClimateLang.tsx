'use client';

import { useEffect } from 'react';

import { useAppDispatch } from '@/hooks/use-app-store';
import { setLang, type Lang } from '@/store/slices/langSlice';

/** URL is the language for this route. Keep the shared footer in step. */
export default function ClimateLang({ lang }: { lang: Lang }) {
  const dispatch = useAppDispatch();
  useEffect(() => {
    dispatch(setLang(lang));
    document.documentElement.lang = lang === 'ne' ? 'ne' : 'en';
  }, [dispatch, lang]);
  return null;
}
