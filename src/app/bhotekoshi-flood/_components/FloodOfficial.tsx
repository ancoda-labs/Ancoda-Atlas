'use client';

import React, { useState } from 'react';
import type { Lang } from '@/hooks/use-flood-lang';
import { ageFrom } from '@/lib/relative-time';
import type { FloodOfficialFeed, GovEffort, NdrrmaBulletin } from '@/types';

// The official national picture, kept apart from the corridor figures.
//
// Two feeds sit here: NDRRMA's national Daily Disaster Bulletin (a nationwide
// 24-hour count, not the Bhotekoshi toll) and the OPMCM portal's log of what
// the government is doing. Neither is folded into the sitrep grid above — a
// nationwide daily count and a cumulative corridor count are different things
// and must never be added.

const T = {
  eyebrow: { en: 'Official', ne: 'सरकारी' },
  govTitle: { en: 'What the government is doing', ne: 'सरकारले के गर्दैछ' },
  govIntro: {
    en: 'Operation updates the Office of the Prime Minister publishes on its rescue portal.',
    ne: 'प्रधानमन्त्री कार्यालयले आफ्नो उद्धार पोर्टलमा प्रकाशित गरेका कार्य विवरण।',
  },
  bulletinTitle: { en: 'National picture — past 24 hours', ne: 'राष्ट्रिय अवस्था — विगत २४ घण्टा' },
  bulletinIntro: {
    en: 'NDRRMA’s Daily Disaster Bulletin covers the whole country, not just this flood. Read it alongside the corridor figures, not added to them.',
    ne: 'एनडीआरआरएमएको दैनिक विपद् बुलेटिनले यो बाढी मात्र होइन, सिंगो देशलाई समेट्छ। करिडोरका तथ्यांकसँग जोडेर होइन, छेउछाउ राखेर पढ्नुहोस्।',
  },
  openPdf: { en: 'Open the full bulletin (PDF)', ne: 'पूरा बुलेटिन खोल्नुहोस् (PDF)' },
  more: { en: 'Show more', ne: 'थप देखाउनुहोस्' },
  read: { en: 'Read', ne: 'पढिएको' },
};

function pick(lang: Lang, en: string | null | undefined, ne: string | null | undefined): string {
  return ((lang === 'ne' ? ne || en : en || ne) || '').trim();
}

export default function FloodOfficial({
  govEfforts,
  dailyBulletin,
  lang,
}: {
  govEfforts?: FloodOfficialFeed<GovEffort> | null;
  dailyBulletin?: FloodOfficialFeed<NdrrmaBulletin> | null;
  lang: Lang;
}) {
  const t = (key: keyof typeof T) => T[key][lang];
  const [expanded, setExpanded] = useState(false);

  const efforts = govEfforts?.items || [];
  const bulletin = dailyBulletin?.items?.[0] || null;
  const shown = expanded ? efforts : efforts.slice(0, 4);

  if (!efforts.length && !bulletin) return null;

  return (
    <section className="fl-sec">
      {bulletin && (
        <>
          <div className="fl-sec-head">
            <span>{t('eyebrow')}</span>
            <h2>{t('bulletinTitle')}</h2>
          </div>
          <p className="fl-note">{t('bulletinIntro')}</p>
          <div className="fl-place-note">
            <h3>{pick(lang, bulletin.title, bulletin.titleNe) || bulletin.date}</h3>
            <p>{pick(lang, bulletin.summary, bulletin.summaryNe)}</p>
            {bulletin.pdfUrl && (
              <p className="fl-note">
                <a href={bulletin.pdfUrl} target="_blank" rel="noopener noreferrer">
                  {t('openPdf')} &#8599;
                </a>
              </p>
            )}
          </div>
          {dailyBulletin && (
            <p className="fl-note">
              {t('read')} {ageFrom(dailyBulletin.fetchedAt, lang)}
              {' · '}
              <a href={dailyBulletin.source.url} target="_blank" rel="noopener noreferrer">
                {dailyBulletin.source.label} &#8599;
              </a>
            </p>
          )}
        </>
      )}

      {efforts.length > 0 && (
        <>
          <div className="fl-sec-head" style={{ marginTop: bulletin ? '32px' : 0 }}>
            <span>{t('eyebrow')}</span>
            <h2>{t('govTitle')}</h2>
            <em>{efforts.length}</em>
          </div>
          <p className="fl-note">{t('govIntro')}</p>
          <ul className="fl-alerts">
            {shown.map(e => {
              const body = pick(lang, e.bodyEn, e.bodyNe);
              return (
                <li key={e.id}>
                  <h3>{pick(lang, e.title, e.titleNe)}</h3>
                  {body && <p style={{ whiteSpace: 'pre-line' }}>{body}</p>}
                  <span className="fl-report-meta">
                    {e.agency && <b>{e.agency}</b>}
                    {e.district && <span>{e.district}</span>}
                    <time>{ageFrom(e.createdAt, lang)}</time>
                    {e.link && (
                      <a href={e.link} target="_blank" rel="noopener noreferrer">
                        &#8599;
                      </a>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          {efforts.length > 4 && !expanded && (
            <button
              onClick={() => setExpanded(true)}
              className="mx-auto mt-4 block rounded border border-border bg-background px-6 py-2.5 text-[15px] font-semibold text-foreground hover:border-border-bright"
            >
              {t('more')}
            </button>
          )}
          {govEfforts && (
            <p className="fl-note">
              {t('read')} {ageFrom(govEfforts.fetchedAt, lang)}
              {' · '}
              <a href={govEfforts.source.url} target="_blank" rel="noopener noreferrer">
                {govEfforts.source.label} &#8599;
              </a>
            </p>
          )}
        </>
      )}
    </section>
  );
}
