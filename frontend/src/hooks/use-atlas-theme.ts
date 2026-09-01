'use client';

import { useCallback, useEffect } from 'react';

import { useAppDispatch, useAppSelector } from '@/hooks/use-app-store';
import { setTheme, type Theme } from '@/store/slices/themeSlice';

const CLASS = 'dark-theme';

/**
 * One theme choice, shared by the dashboard and every flood-desk page.
 *
 * The state lives in the store now, so the two pages read the same value
 * without the custom DOM event and cross-tab storage listener this used to
 * need. What stays here is the one thing a store cannot do: put the class on
 * the body.
 */
export function useAtlasTheme(): [Theme, (next: Theme) => void] {
  const theme = useAppSelector(s => s.theme.theme);
  const dispatch = useAppDispatch();

  useEffect(() => {
    document.body.classList.toggle(CLASS, theme === 'dark');
  }, [theme]);

  const set = useCallback((next: Theme) => dispatch(setTheme(next)), [dispatch]);
  return [theme, set];
}

export type { Theme };
