import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type Theme = 'light' | 'dark';

const KEY = 'atlas_theme';

/**
 * One theme choice, shared by the dashboard and every flood-desk page.
 *
 * A visit opens in Dark. Light is one click away, and that click is remembered
 * for this tab so the dashboard and the desk agree — but it is not carried into
 * the next visit. The first thing shown is always Dark.
 */
export function readStoredTheme(): Theme {
  try {
    const value = sessionStorage.getItem(KEY);
    return value === 'light' ? 'light' : 'dark';
  } catch {
    // Private windows and blocked site data both throw here. Dark is correct
    // either way.
    return 'dark';
  }
}

const themeSlice = createSlice({
  name: 'theme',
  // Never read storage in the initial state: the server renders this too, and
  // a mismatch between server and first client render is a hydration error.
  // The server renders Dark, which is the default a visit opens in.
  initialState: { theme: 'dark' as Theme },
  reducers: {
    setTheme(state, action: PayloadAction<Theme>) {
      state.theme = action.payload;
      try {
        sessionStorage.setItem(KEY, action.payload);
      } catch {
        /* the choice still applies for this page view */
      }
    },
    hydrateTheme(state, action: PayloadAction<Theme>) {
      state.theme = action.payload;
    },
  },
});

export const { setTheme, hydrateTheme } = themeSlice.actions;
export default themeSlice.reducer;
