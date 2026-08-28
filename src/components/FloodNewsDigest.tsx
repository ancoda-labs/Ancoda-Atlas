'use client';

import React, { useState } from 'react';
import type { NewsDigest } from '@/types';
import { ageFrom, nepalTime } from '@/lib/relative-time';

// Ten-minute news briefs.
//
// The wire below this section is every headline as it lands, which is the right
// thing for someone watching all day and the wrong thing for someone opening
// the page for the first time nineteen hours in. This is the same reporting cut
// into ten-minute windows and summarised, so the page can be read backwards to
// see how the event actually developed.
//
// Each brief says whether a model wrote it. On a disaster page that is not a
// footnote — a reader deciding whether to act on a summary is entitled to know
// whether a machine produced the sentence or merely selected it.

type Lang = 'en' | 'ne';

const T = {
  kicker: { en: 'Briefs', ne: 'संक्षेप' },
  title: { en: 'Every ten minutes', ne: 'हरेक दस मिनेट' },
  intro: {
    en: 'Reporting from the last few hours, grouped into ten-minute windows and summarised. Newest first.',
    ne: 'बितेका केही घण्टाको समाचार, दस-दस मिनेटको अवधिमा समूहबद्ध गरी संक्षेपमा। नयाँ पहिले।',
  },
  empty: {
    en: 'No briefs yet. The first one is written once a ten-minute window closes with reporting in it.',
    ne: 'अहिलेसम्म संक्षेप छैन। समाचार भएको दस-मिनेटे अवधि सकिएपछि पहिलो लेखिन्छ।',
  },
  disabled: {
    en: 'Ten-minute briefs are not switched on for this deployment.',
    ne: 'यो सर्भरमा दस-मिनेटे संक्षेप सक्रिय गरिएको छैन।',
  },
  byModel: { en: 'Written by', ne: 'लेखेको' },
  byList: { en: 'Headlines only — no model configured', ne: 'शीर्षक मात्र — कुनै मोडेल सेट गरिएको छैन' },
  sources: { en: 'Reports in this window', ne: 'यस अवधिका समाचार' },
  reports: { en: 'reports', ne: 'समाचार' },
};

interface Props {
  digests: NewsDigest[];
  enabled: boolean;
  lang: Lang;
}

export default function FloodNewsDigest({ digests, enabled, lang }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const t = (key: keyof typeof T) => T[key][lang];

  return (
    <section className="fl-sec">
      <div className="fl-sec-head">
        <span>{t('kicker')}</span>
        <h2>{t('title')}</h2>
        {digests.length > 0 && <em>{digests.length}</em>}
      </div>
      <p className="fl-note">{t('intro')}</p>

      {!enabled ? (
        <p className="fl-empty">{t('disabled')}</p>
      ) : digests.length === 0 ? (
        <p className="fl-empty">{t('empty')}</p>
      ) : (
        <ol className="fl-digests">
          {digests.map(d => (
            <li key={d.id} className={d.generator === 'llm' ? 'g-llm' : 'g-list'}>
              <div className="fl-digest-when">
                <b>{nepalTime(d.bucketStart)}–{nepalTime(d.bucketEnd)}</b>
                <time>{ageFrom(d.bucketEnd, lang)}</time>
                <span>{d.itemCount} {t('reports')}</span>
              </div>
              <div className="fl-digest-body">
                <h3>{d.headline}</h3>
                <p>{d.summary}</p>
                {d.bullets.length > 0 && (
                  <ul>
                    {d.bullets.map((b, i) => <li key={i}>{b}</li>)}
                  </ul>
                )}
                <div className="fl-digest-foot">
                  <span className="fl-digest-gen">
                    {d.generator === 'llm' ? `${t('byModel')} ${d.model || 'LLM'}` : t('byList')}
                  </span>
                  {d.sources.length > 0 && (
                    <button type="button" onClick={() => setOpen(open === d.id ? null : d.id)}>
                      {t('sources')} ({d.sources.length}) {open === d.id ? '▴' : '▾'}
                    </button>
                  )}
                </div>
                {open === d.id && (
                  <ul className="fl-digest-sources">
                    {d.sources.map((s, i) => (
                      <li key={i}>
                        <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a>
                        <cite>{s.source}</cite>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
