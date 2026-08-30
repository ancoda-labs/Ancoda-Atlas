'use client';

import React, { useEffect, useState } from 'react';
import type { Lang } from '@/hooks/use-flood-lang';
import type { NewsItem } from '@/types';
import { DESK_POLL_MS } from '@/hooks/use-desk-refresh';

// The same Bhotekoshi flood headlines the Atlas home page scrolls under the
// masthead. The desk used to leave them on the home page, so a family who
// opened /bhotekoshi-flood first never saw the wire that was already running.

const T = {
  label: { en: 'Bhotekoshi flood news', ne: 'भोटेकोशी बाढी समाचार' },
  loading: { en: 'Looking for the latest flood updates…', ne: 'पछिल्लो बाढी अपडेट खोजिँदैछ…' },
  empty: {
    en: 'No Bhotekoshi flood updates in the current feed.',
    ne: 'हालको फिडमा भोटेकोशी बाढीसम्बन्धी अपडेट छैन।',
  },
};

function cleanText(t: string) {
  if (!t) return '';
  return t.replace(/&#39;/g, "'").replace(/&#33;/g, '!').replace(/&amp;/g, '&').replace(/<[^>]+>/g, '');
}

interface Props {
  lang: Lang;
  /** When the parent already has the flood wire, reuse it instead of fetching. */
  items?: NewsItem[];
  status?: 'loading' | 'stale' | 'live' | 'error';
}

export default function FloodNewsTicker({ lang, items: givenItems, status: givenStatus }: Props) {
  const [fetched, setFetched] = useState<NewsItem[] | null>(givenItems !== undefined ? null : []);
  const [status, setStatus] = useState<'loading' | 'live' | 'error'>(givenItems !== undefined ? 'live' : 'loading');

  useEffect(() => {
    if (givenItems !== undefined) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/news?topic=flood&window=24h&limit=28&sourceCap=8');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = (await res.json()) as { items?: NewsItem[] };
        if (!cancelled) {
          setFetched(Array.isArray(data.items) ? data.items : []);
          setStatus('live');
        }
      } catch {
        if (!cancelled) setStatus('error');
      }
    };
    void load();
    const id = setInterval(load, DESK_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [givenItems]);

  const items = (givenItems ?? fetched ?? []).slice(0, 8);
  const loading = givenItems !== undefined ? givenStatus === 'loading' : status === 'loading';

  return (
    <section className="flood-news-ticker" aria-label={T.label[lang]}>
      <span className="flood-news-label">
        <span className="blink" />
        {T.label[lang]}
      </span>
      <div className="flood-news-viewport">
        <div className="flood-news-track">
          {items.length > 0 ? (
            [...items, ...items].map((item, index) => (
              <a key={`${item.link}-${index}`} href={item.link} target="_blank" rel="noopener noreferrer">
                {cleanText(item.title)} <span>· {item.source}</span>
              </a>
            ))
          ) : (
            <span>{loading ? T.loading[lang] : T.empty[lang]}</span>
          )}
        </div>
      </div>
    </section>
  );
}
