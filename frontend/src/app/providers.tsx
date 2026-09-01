'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Provider, useDispatch } from 'react-redux';

import { store, type AppDispatch } from '@/store';
import { hydrateLowPerf, readStoredLowPerf } from '@/store/slices/deskSlice';
import { hydrateLang, readStoredLang } from '@/store/slices/langSlice';
import { hydrateTheme, readStoredTheme } from '@/store/slices/themeSlice';

/**
 * The App Router's answer to Parichaya's App.tsx.
 *
 * Next renders the tree on the server, so the providers have to be a client
 * component mounted inside the server layout rather than wrapping it.
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // A reader coming back to a tab during a flood should see current
        // figures, so this stays on — unlike Parichaya, where refocusing a
        // console does not need to re-fetch.
        refetchOnWindowFocus: true,
        // The desk cycles every ten minutes and its routes cache for two, so
        // anything younger than that is certainly unchanged.
        staleTime: 60_000,
        // One retry, not three: during a live event the upstreams are already
        // under load, and a failed panel that says so beats three more
        // requests.
        retry: 1,
        retryDelay: 2_000,
      },
    },
  });
}

/** Read the reader's stored choices once, after mount.
 *
 * Deliberately not in the slices' initial state: the server renders those too,
 * and reading sessionStorage there is both impossible and — if it were faked —
 * a hydration mismatch.
 */
function HydrateClientPreferences() {
  const dispatch = useDispatch<AppDispatch>();
  useEffect(() => {
    dispatch(hydrateTheme(readStoredTheme()));
    dispatch(hydrateLang(readStoredLang()));
    dispatch(hydrateLowPerf(readStoredLowPerf()));
  }, [dispatch]);
  return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  // Created once per mount rather than at module scope: a module-level client
  // is shared across every request on the server, which leaks one reader's
  // cached data into another's render.
  const [queryClient] = useState(makeQueryClient);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
  }, []);

  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <HydrateClientPreferences />
        {children}
      </QueryClientProvider>
    </Provider>
  );
}
