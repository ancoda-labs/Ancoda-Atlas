import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type Lang = 'en' | 'ne';

const KEY = 'atlas_language';

/**
 * One language choice, shared by every page of the flood desk.
 *
 * A visit opens in English. Nepali is one click away, and that click is
 * remembered for this tab so Overview → Contacts stays in the same language.
 * It is not carried into the next visit.
 */
export function readStoredLang(): Lang {
  try {
    return sessionStorage.getItem(KEY) === 'ne' ? 'ne' : 'en';
  } catch {
    return 'en';
  }
}

const langSlice = createSlice({
  name: 'lang',
  initialState: { lang: 'en' as Lang },
  reducers: {
    setLang(state, action: PayloadAction<Lang>) {
      state.lang = action.payload;
      try {
        sessionStorage.setItem(KEY, action.payload);
      } catch {
        /* the choice still applies for this page view */
      }
    },
    hydrateLang(state, action: PayloadAction<Lang>) {
      state.lang = action.payload;
    },
  },
});

export const { setLang, hydrateLang } = langSlice.actions;
export default langSlice.reducer;
