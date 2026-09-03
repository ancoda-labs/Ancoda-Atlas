'use client';

import { useEffect, useState } from 'react';

/**
 * False during SSR and the first client paint, true after mount.
 *
 * Relative clocks (`Date.now()`, `ageFrom`) and query results that the
 * server did not snapshot will otherwise disagree with the HTML and trip
 * Next's hydration overlay.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
