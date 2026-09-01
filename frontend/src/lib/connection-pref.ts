'use client';

/**
 * First-paint network preference for Nepal 3G.
 *
 * `atlas_low_perf` used to be something a reader discovered after the CRT
 * chrome had already downloaded. On saveData / 2G it should be the default
 * for that visit, so animations and webfonts do not compete with helplines.
 *
 * An inline script in the root layout applies the class before paint. This
 * module is the same rule for client islands that mount later.
 */

export const LOW_PERF_KEY = 'atlas_low_perf';

type NetworkInformationLike = {
  saveData?: boolean;
  effectiveType?: string;
};

function connection(): NetworkInformationLike | undefined {
  const nav = navigator as Navigator & {
    connection?: NetworkInformationLike;
    mozConnection?: NetworkInformationLike;
    webkitConnection?: NetworkInformationLike;
  };
  return nav.connection || nav.mozConnection || nav.webkitConnection;
}

/** True when the radio is the kind this desk is built for. */
export function isConstrainedConnection(): boolean {
  try {
    const c = connection();
    if (!c) return false;
    return Boolean(c.saveData || c.effectiveType === '2g' || c.effectiveType === 'slow-2g');
  } catch {
    return false;
  }
}

function storedLowPerf(): boolean | null {
  try {
    const value = localStorage.getItem(LOW_PERF_KEY);
    if (value === 'true') return true;
    if (value === 'false') return false;
  } catch {
    /* private mode */
  }
  return null;
}

/** Apply `low-perf` from storage or the Network Information API. */
export function seedLowPerf(): boolean {
  const stored = storedLowPerf();
  const slow = isConstrainedConnection();
  const on = stored === true || (stored !== false && slow);
  try {
    if (on) document.body.classList.add('low-perf');
    else document.body.classList.remove('low-perf');
    if (stored === null && slow) localStorage.setItem(LOW_PERF_KEY, 'true');
  } catch {
    /* the class still helps this document */
  }
  return on;
}

/**
 * Run after first paint. `timeout` is a ceiling, not a delay: slow phones
 * that never go idle still get the optional work.
 */
export function whenIdle(fn: () => void, timeout = 2000): () => void {
  const win = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (typeof win.requestIdleCallback === 'function') {
    const id = win.requestIdleCallback(fn, { timeout });
    return () => win.cancelIdleCallback?.(id);
  }
  const t = window.setTimeout(fn, Math.min(timeout, 1200));
  return () => window.clearTimeout(t);
}
