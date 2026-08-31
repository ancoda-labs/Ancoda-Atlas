'use client';

import { useEffect, useState } from 'react';

/**
 * Which numbered jump card is current.
 *
 * The cards look like a contents list, so the one on screen needs a mark
 * or they read as static boxes. Hash handles a tap; the observer handles
 * a reader who just scrolled.
 */
export function useJumpSection(ids: readonly string[]): string {
  const [on, setOn] = useState(ids[0] ?? '');
  const key = ids.join(',');

  useEffect(() => {
    const list = key.split(',').filter(Boolean);
    const fromHash = () => {
      const id = window.location.hash.replace(/^#/, '');
      if (list.includes(id)) setOn(id);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);

    const els = list
      .map(id => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (!els.length) {
      return () => window.removeEventListener('hashchange', fromHash);
    }

    const io = new IntersectionObserver(
      entries => {
        const hit = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (hit?.target.id) setOn(hit.target.id);
      },
      { rootMargin: '-30% 0px -50% 0px', threshold: [0, 0.25, 0.5, 1] },
    );
    els.forEach(el => io.observe(el));
    return () => {
      window.removeEventListener('hashchange', fromHash);
      io.disconnect();
    };
  }, [key]);

  return on;
}
