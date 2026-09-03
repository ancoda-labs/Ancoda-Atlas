'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';

import { ClimatePanel, pickCopy } from '@/app/climate/_components/ClimatePanel';
import { useHydrated } from '@/hooks/use-hydrated';
import { cleanNewsTitle } from '@/lib/climate-news';
import { ageFrom } from '@/lib/relative-time';
import { fetchTopicNewsService } from '@/services/news-services';
import type { Lang } from '@/hooks/use-flood-lang';
import type { ClimateSectionCopy, NewsItem, NewsResponse } from '@/types';

const WINDOW = '7d';
const LIMIT = 12;
const CAP = 8;

export default function NewsPanel({
  lang,
  copy,
  initial,
}: {
  lang: Lang;
  copy: ClimateSectionCopy | null | undefined;
  initial: NewsResponse | null;
}) {
  const hydrated = useHydrated();
  const { data } = useQuery({
    queryKey: ['news', 'climate', WINDOW, LIMIT, CAP],
    queryFn: () => fetchTopicNewsService('climate', WINDOW, LIMIT, CAP),
    initialData: initial ?? undefined,
    staleTime: 4 * 60 * 1000,
  });
  const headline = pickCopy(lang, copy?.headlineEn, copy?.headlineNe) || 'What the climate wire is reporting.';
  const caption = pickCopy(lang, copy?.captionEn, copy?.captionNe);
  const items = (data?.items || []).filter((item): item is NewsItem => Boolean(item.title && item.link));
  const empty = pickCopy(lang, 'No climate headlines in this window.', 'TODO');

  return (
    <ClimatePanel
      id="news"
      index="05"
      kicker="NEWS"
      headline={headline}
      caption={caption}
    >
      {items.length === 0 ? (
        <p className="fl-empty">{empty}</p>
      ) : (
        <ul className="cl-news">
          {items.slice(0, LIMIT).map(item => {
            const age = hydrated ? ageFrom(item.pubDate, lang) : '';
            return (
              <li key={`${item.link}-${item.pubDate}`}>
                <a href={item.link} target="_blank" rel="noopener noreferrer">
                  <span className="cl-news-title">{cleanNewsTitle(item.title, item.source)}</span>
                  <span className="cl-news-meta">
                    {item.source}
                    {age ? (
                      <>
                        {' · '}
                        <time dateTime={item.pubDate}>{age}</time>
                      </>
                    ) : null}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </ClimatePanel>
  );
}
