'use client';

import React from 'react';
import { ageFrom } from '@/lib/relative-time';
import type { Lang } from '@/hooks/use-flood-lang';
import type { CorridorIncidents, SitrepContent, SitrepHeadline, SitrepValue } from '@/types';
import sitrepJson from '../../../../content/bhotekoshi-flood/sitrep.json';

// The "what has been reported" tile grid, used on Overview and Situation.
//
// BIPAD is still scraped on the ten-minute cycle: incidents logged, how many
// have a filled loss record, how many are still waiting, families evacuated.
// That register is days behind the national toll — it stores blanks as zeros —
// so deaths, uncontacted, injured, air rescue, deployed, houses and bridges are
// the reviewed sitrep with a live bulletin overlay when that scrape's parts add
// up. Deaths never go down. BIPAD's
// entered-so-far count is printed under those tiles so the lag stays visible.
// The two sources are never added together.

const bundledSitrep = sitrepJson as SitrepContent;

const T = {
  title: { en: 'What has been reported', ne: 'के-के जनाइएको छ' },
  incidents: { en: 'Incidents logged', ne: 'दर्ता घटना' },
  withFigures: { en: 'With damage figures', ne: 'क्षति तथ्यांक भएका' },
  awaiting: { en: 'Still awaiting figures', ne: 'तथ्यांक कुर्दै' },
  deaths: { en: 'Deaths recorded', ne: 'मृत्यु दर्ता' },
  missing: { en: 'Uncontacted recorded', ne: 'सम्पर्कविहीन दर्ता' },
  injured: { en: 'Injured recorded', ne: 'घाइते दर्ता' },
  heli: { en: 'Rescued by air', ne: 'हवाई उद्धार' },
  deployed: { en: 'Personnel deployed', ne: 'परिचालित जनशक्ति' },
  evacuated: { en: 'Families evacuated', ne: 'स्थानान्तरित परिवार' },
  houses: { en: 'Houses destroyed', ne: 'भत्किएका घर' },
  bridges: { en: 'Bridges destroyed', ne: 'भत्किएका पुल' },
  bipadEntered: { en: 'BIPAD register', ne: 'बिपद् अभिलेख' },
  read: { en: 'Read', ne: 'पढिएको' },
  asOf: { en: 'Reviewed as of', ne: 'जाँचिएको, मिति' },
  caveat: {
    en: 'Incident counts and families evacuated are BIPAD’s live corridor register — scraping continues. Deaths, uncontacted, injured, air rescue and deployed staff are reviewed figures with a live overlay from the Rasuwa flood bulletin when that scrape’s parts add up. Deaths never go down. Houses and bridges are NDRRMA / Copernicus. Do not add the two together.',
    ne: 'दर्ता घटना र स्थानान्तरित परिवार बिपद्को प्रत्यक्ष करिडोर अभिलेख हुन् — स्क्रेप जारी छ। मृत्यु, सम्पर्कविहीन, घाइते, हवाई उद्धार र जनशक्ति जाँचिएका तथ्यांक हुन्, रसुवा बाढी बुलेटिनको प्रत्यक्ष ओभरलेसहित जब भागहरू जोडिन्छन्। मृत्यु घट्दैन। घर र पुल एनडीआरआरएमए / कोपर्निकसका हुन्। दुईथरी जोड्नुहोस् नहोस्।',
  },
};

function headline(sitrep: SitrepContent | null | undefined, id: string): SitrepHeadline | undefined {
  return (sitrep?.headline || []).find(h => h.id === id);
}

function breakdownTotal(sitrep: SitrepContent | null | undefined, id: string): number | undefined {
  const row = (sitrep?.breakdowns || []).find(b => b.id === id);
  return row?.total;
}

function infra(sitrep: SitrepContent | null | undefined, id: string, en: string): SitrepValue | undefined {
  return (sitrep?.infrastructure?.items || []).find(i => i.id === id || i.label_en === en);
}

function reviewed(
  sitrep: SitrepContent | null | undefined,
  headlineId: string,
  breakdownId?: string,
): SitrepHeadline | undefined {
  const fromHeadline = headline(sitrep, headlineId);
  if (fromHeadline) return fromHeadline;
  const total = breakdownId ? breakdownTotal(sitrep, breakdownId) : undefined;
  if (total == null) return undefined;
  return { id: headlineId, value: total, tone: 'warning', source: '', label_en: '', label_ne: '' };
}

function n(value: number | null | undefined, suffix?: string): string {
  return `${(value ?? 0).toLocaleString()}${suffix || ''}`;
}

function BipadUnder({ value, lang }: { value: number | null | undefined; lang: Lang }) {
  if (value == null) return null;
  return (
    <small className="fl-blank">
      {T.bipadEntered[lang]} {n(value)}
    </small>
  );
}

export default function FloodReportedTiles({
  lang,
  corridor,
  sitrep,
  showHeading = true,
}: {
  lang: Lang;
  corridor?: CorridorIncidents | null;
  sitrep?: SitrepContent | null;
  showHeading?: boolean;
}) {
  const t = (key: keyof typeof T) => T[key][lang];
  const totals = corridor?.totals ?? null;
  // Bundled sitrep is the fallback so the bulletin toll is on the page even
  // before the live corridor scrape answers. Reviewed figures win; BIPAD
  // zeros are never the headline number.
  const figures = sitrep || bundledSitrep;
  const deaths = reviewed(figures, 'deaths', 'deaths');
  const missing = reviewed(figures, 'uncontacted', 'uncontacted');
  const injured = reviewed(figures, 'injured', 'injured');
  const heli = reviewed(figures, 'heli', 'air-rescue');
  const deployed = reviewed(figures, 'deployed', 'deployed');
  const houses = infra(figures, 'houses', 'Houses destroyed')?.value;
  const bridges = infra(figures, 'bridges', 'Bridges')?.value;

  if (!totals && deaths == null) return null;

  return (
    <>
      {showHeading && (
        <div className="fl-sec-head">
          <span>{lang === 'ne' ? 'प्रत्यक्ष' : 'Live'}</span>
          <h2>{t('title')}</h2>
        </div>
      )}

      <div className="fl-tiles">
        {totals && (
          <>
            <div>
              <dd>{n(totals.incidentCount)}</dd>
              <dt>{t('incidents')}</dt>
            </div>
            <div>
              <dd>{n(totals.incidentsWithFigures)}</dd>
              <dt>{t('withFigures')}</dt>
            </div>
            <div className="t-warning">
              <dd>{n(totals.incidentsAwaitingFigures)}</dd>
              <dt>{t('awaiting')}</dt>
            </div>
          </>
        )}
        {deaths != null && (
          <div className={`t-${deaths.tone}`}>
            <dd>{n(deaths.value)}</dd>
            <dt>{t('deaths')}</dt>
            <BipadUnder value={totals?.deaths} lang={lang} />
          </div>
        )}
        {missing != null && (
          <div className={`t-${missing.tone}`}>
            <dd>{n(missing.value)}</dd>
            <dt>{t('missing')}</dt>
            <BipadUnder value={totals?.missing} lang={lang} />
          </div>
        )}
        {injured != null && (
          <div className={`t-${injured.tone}`}>
            <dd>{n(injured.value)}</dd>
            <dt>{t('injured')}</dt>
            <BipadUnder value={totals?.injured} lang={lang} />
          </div>
        )}
        {heli != null && (
          <div className={`t-${heli.tone}`}>
            <dd>{n(heli.value, heli.suffix)}</dd>
            <dt>{t('heli')}</dt>
          </div>
        )}
        {deployed != null && (
          <div className={`t-${deployed.tone}`}>
            <dd>{n(deployed.value, deployed.suffix)}</dd>
            <dt>{t('deployed')}</dt>
          </div>
        )}
        {totals && (
          <div>
            <dd>{n(totals.familiesEvacuated)}</dd>
            <dt>{t('evacuated')}</dt>
          </div>
        )}
        {houses != null && (
          <div>
            <dd>{n(houses)}</dd>
            <dt>{t('houses')}</dt>
            <BipadUnder value={totals?.housesDestroyed} lang={lang} />
          </div>
        )}
        {bridges != null && (
          <div>
            <dd>{n(bridges)}</dd>
            <dt>{t('bridges')}</dt>
            <BipadUnder value={totals?.bridgesDestroyed} lang={lang} />
          </div>
        )}
      </div>

      <p className="fl-note">
        {totals && (
          <>
            {t('read')} {ageFrom(corridor?.fetchedAt, lang)}
            {' · '}
            <a href="https://bipadportal.gov.np/" target="_blank" rel="noopener noreferrer">
              {lang === 'ne' ? 'बिपद् पोर्टल' : 'BIPAD Portal'} &#8599;
            </a>
            {' · '}
          </>
        )}
        {figures && (
          <>
            {t('asOf')}{' '}
            {(lang === 'ne' ? figures.as_of_label_ne || figures.as_of_label_en : figures.as_of_label_en) || '—'}
            {(figures.sources || []).map((src, i) => (
              <a key={i} href={src.url} target="_blank" rel="noopener noreferrer">
                {' · '}
                {src.label} &#8599;
              </a>
            ))}
            {' · '}
          </>
        )}
        <span className="fl-blank">{t('caveat')}</span>
      </p>
    </>
  );
}
