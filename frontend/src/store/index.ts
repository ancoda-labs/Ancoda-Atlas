import { configureStore } from '@reduxjs/toolkit';

import deskReducer from './slices/deskSlice';
import langReducer from './slices/langSlice';
import themeReducer from './slices/themeSlice';

/**
 * Client state only.
 *
 * Everything the server owns — the sweep, the desk, the registers — lives in
 * the TanStack Query cache instead. What is here is what the reader chose:
 * their theme, their language, and whether they want the heavy chrome.
 */
export const store = configureStore({
  reducer: {
    theme: themeReducer,
    lang: langReducer,
    desk: deskReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
