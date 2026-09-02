'use client';

import React, { useState } from 'react';
import type { Lang } from '@/hooks/use-flood-lang';
import { ageFrom } from '@/lib/relative-time';
import type { FloodOfficialFeed, GovUpdate, NewsTopic } from '@/types';

// What the ministries themselves posted, in their own words.
//
// This is the government's wire rather than a news wire: the Office of the
// Prime Minister, Home, Health and the district administrations post to
// nepal.gov.np directly. Nothing here is a figure the desk adds up — a post
// saying a billion rupees was released stays a sentence the government wrote,
// attributed to the ministry that wrote it.
//
// The two groups are the point of this panel. Clearing a hazard filter is not
// the same as being about this flood: on any given day the feed carries a
// Mahakali warning, a Bagmati river rise and a nationwide flash-flood advisory
// alongside the Bhotekoshi sitreps. Run together they read as one event. The
// server decides which is which (see flood/scope.py) and they are never mixed
// into one list here.
//
// Several posts carry their substance as a photograph of a printed notice, so
// the pictures are shown rather than dropped for being untranscribable.

const T = {
  eyebrow: { en: 'Official', ne: 'सरकारी' },
  title: { en: 'From the ministries', ne: 'मन्त्रालयहरूबाट' },
  intro: {
    en: 'Posts the ministries publish on the national portal, filtered to hazards and relief. Read them as statements from the office that made them, not as verified totals.',
    ne: 'मन्त्रालयहरूले राष्ट्रिय पोर्टलमा प्रकाशित गरेका अपडेट, विपद् र राहतसँग सम्बन्धित मात्र। यी सम्बन्धित कार्यालयका भनाइ हुन्, प्रमाणित तथ्यांक होइनन्।',
  },
  thisFlood: { en: 'This flood', ne: 'यही बाढी' },
  elsewhere: { en: 'Elsewhere in Nepal', ne: 'नेपालका अन्य ठाउँ' },
  elsewhereNote: {
    en: 'Hazard posts that do not name this corridor — other river basins, and warnings for the country as a whole. Kept apart so nothing here is read as being about the Bhotekoshi.',
    ne: 'यो करिडोर नखुलाएका विपद्सम्बन्धी अपडेट — अन्य नदी बेसिन र देशव्यापी सूचना। यी भोटेकोशीसँग सम्बन्धित होइनन्, त्यसैले छुट्टै राखिएका छन्।',
  },
  read: { en: 'Read', ne: 'पढिएको' },
  attachment: { en: 'Attachment', ne: 'संलग्न कागजात' },
  notice: { en: 'Notice image', ne: 'सूचनाको तस्बिर' },
  empty: {
    en: 'No hazard posts have been collected this cycle. The ministries still publish on the national portal.',
    ne: 'यो चक्रमा विपद्सम्बन्धी अपडेट संकलन भएको छैन। मन्त्रालयहरूले राष्ट्रिय पोर्टलमा अझै प्रकाशित गर्छन्।',
  },
  openPortal: { en: 'Open nepal.gov.np/updates', ne: 'nepal.gov.np/updates खोल्नुहोस्' },
};

const TOPICS: Record<NewsTopic, { en: string; ne: string }> = {
  flood: { en: 'Flood', ne: 'बाढी' },
  earthquake: { en: 'Earthquake', ne: 'भूकम्प' },
  wildfire: { en: 'Wildfire', ne: 'डढेलो' },
  airquality: { en: 'Air quality', ne: 'वायु गुणस्तर' },
  climate: { en: 'Climate', ne: 'जलवायु' },
  weather: { en: 'Weather', ne: 'मौसम' },
  relief: { en: 'Relief', ne: 'राहत' },
};

function pick(lang: Lang, en: string | null | undefined, ne: string | null | undefined): string {
  return ((lang === 'ne' ? ne || en : en || ne) || '').trim();
}

function noticeAlt(filename: string | null, fallback: string): string {
  // Portal uploads often arrive named as a millisecond stamp. That is not
  // alternative text — it is what a broken <img> paints on the page.
  if (!filename) return fallback;
  const stem = filename.replace(/\.[^.]+$/, '');
  return /^\d+$/.test(stem) ? fallback : filename;
}

function Update({ update, lang }: { update: GovUpdate; lang: Lang }) {
  const t = (key: keyof typeof T) => T[key][lang];
  const body = pick(lang, update.bodyEn, update.bodyNe);
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const shots = update.images.filter(i => i.imageProxy && !failed.has(i.imageProxy));

  return (
    <li>
      <h3>
        <a href={update.link} target="_blank" rel="noopener noreferrer">
          {pick(lang, update.title, update.titleNe)}
        </a>
      </h3>
      {body && <p>{body}</p>}
      {shots.length > 0 && (
        <div className="fl-gov-shots">
          {shots.map(image => (
            <a key={image.imageProxy} href={update.link} target="_blank" rel="noopener noreferrer">
              <img
                src={image.imageProxy || ''}
                alt={noticeAlt(image.filename, t('notice'))}
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => {
                  const src = image.imageProxy;
                  if (!src) return;
                  setFailed(prev => (prev.has(src) ? prev : new Set(prev).add(src)));
                }}
              />
            </a>
          ))}
        </div>
      )}
      {update.documents.map(doc => (
        <p className="fl-note" key={doc.url}>
          <a href={doc.url} target="_blank" rel="noopener noreferrer">
            {doc.filename || t('attachment')} &#8599;
          </a>
        </p>
      ))}
      <span className="fl-report-meta">
        {update.ministry && <b>{update.ministry}</b>}
        {update.topic && <em>{TOPICS[update.topic][lang]}</em>}
        {update.district && <span>{update.district}</span>}
        <time>{ageFrom(update.publishedAt, lang)}</time>
        <a href={update.link} target="_blank" rel="noopener noreferrer">
          &#8599;
        </a>
      </span>
    </li>
  );
}

export default function FloodGovUpdates({
  govUpdates,
  lang,
}: {
  govUpdates?: FloodOfficialFeed<GovUpdate> | null;
  lang: Lang;
}) {
  const t = (key: keyof typeof T) => T[key][lang];
  const updates = govUpdates?.items || [];
  const corridor = updates.filter(u => u.corridor);
  const elsewhere = updates.filter(u => !u.corridor);
  const portalUrl = govUpdates?.source.url || 'https://nepal.gov.np/updates';
  const portalLabel = govUpdates?.source.label || 'Government of Nepal updates portal';

  return (
    <section className="fl-sec fl-gov-updates">
      <div className="fl-sec-head">
        <span>{t('eyebrow')}</span>
        <h2>{t('title')}</h2>
        {updates.length > 0 && <em>{updates.length}</em>}
      </div>
      <p className="fl-note">{t('intro')}</p>

      {updates.length === 0 ? (
        <p className="fl-empty">{t('empty')}</p>
      ) : (
      <div className="fl-split fl-official-pair">
        {corridor.length > 0 && (
          <div className="fl-official-pane">
            <p className="fl-minor">
              {t('thisFlood')} · {corridor.length}
            </p>
            <div className="fl-official-scroll">
              <ul className="fl-alerts">
                {corridor.map(u => (
                  <Update key={u.id} update={u} lang={lang} />
                ))}
              </ul>
            </div>
          </div>
        )}

        {elsewhere.length > 0 && (
          <div className="fl-official-pane fl-gov-elsewhere">
            <p className="fl-minor">
              {t('elsewhere')} · {elsewhere.length}
            </p>
            <p className="fl-note fl-note-tight">{t('elsewhereNote')}</p>
            <div className="fl-official-scroll">
              <ul className="fl-alerts">
                {elsewhere.map(u => (
                  <Update key={u.id} update={u} lang={lang} />
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
      )}

      <p className="fl-note">
        {updates.length > 0 && govUpdates?.fetchedAt && (
          <>
            {t('read')} {ageFrom(govUpdates.fetchedAt, lang)}
            {' · '}
          </>
        )}
        <a href={portalUrl} target="_blank" rel="noopener noreferrer">
          {t('openPortal')} &#8599;
        </a>
        {portalLabel && updates.length > 0 && <> ({portalLabel})</>}
      </p>
    </section>
  );
}
