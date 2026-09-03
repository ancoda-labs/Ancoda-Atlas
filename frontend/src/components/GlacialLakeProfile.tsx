import React from 'react';

import type { Lang } from '@/hooks/use-flood-lang';
import type { ClimateFact } from '@/types';

/**
 * One mark per lake from the reviewed ICIMOD/UNDP 2020 inventory.
 * Atlas does not place the lakes; the counts are the fact.
 */
const BANDS = [
  { id: 'china', count: 25, tone: 'up' },
  { id: 'nepal', count: 21, tone: 'np' },
  { id: 'india', count: 1, tone: 'in' },
] as const;

const TOTAL = BANDS.reduce((sum, band) => sum + band.count, 0);
const UPSTREAM = BANDS.find(band => band.tone === 'up')?.count ?? 0;

const T = {
  heading: {
    en: '47 potentially dangerous glacial lakes',
    ne: '४७ वटा सम्भावित जोखिमपूर्ण हिमताल',
  },
  basins: {
    en: 'Koshi, Gandaki and Karnali basins',
    ne: 'कोशी, गण्डकी र कर्णाली बेसिन',
  },
  china: { en: 'China', ne: 'चीन' },
  nepal: { en: 'Nepal', ne: 'नेपाल' },
  india: { en: 'India', ne: 'भारत' },
  upstream: { en: 'upstream', ne: 'सीमापारि' },
  border: { en: "Nepal's border", ne: 'नेपालको सीमा' },
  punch: {
    en: "More than half sit upstream of Nepal's border.",
    ne: 'आधाभन्दा बढी नेपालको सीमापारि माथिल्लो तटीय क्षेत्रमा छन्।',
  },
} as const;

export default function GlacialLakeProfile({
  lang,
  fact,
}: {
  lang: Lang;
  fact: ClimateFact;
}) {
  const caption = lang === 'ne' ? fact.statementNe : fact.statementEn;
  const label = fact.organisation || fact.url;
  return (
    <figure className="glp">
      <header className="glp-head">
        <p className="glp-kicker">{T.heading[lang]}</p>
        <p className="glp-sub">{T.basins[lang]}</p>
      </header>

      <div className="glp-totals">
        {BANDS.map(band => (
          <div key={band.id} className={`glp-total is-${band.tone}`}>
            <b>{band.count}</b>
            <span>{T[band.id][lang]}</span>
            {band.tone === 'up' && <em>{T.upstream[lang]}</em>}
          </div>
        ))}
      </div>

      <div className="glp-chart" role="img" aria-label={caption}>
        <div className="glp-stack">
          {BANDS.map(band => (
            <span
              key={band.id}
              className={`glp-seg is-${band.tone}`}
              style={{ flexGrow: band.count, flexBasis: 0 }}
            />
          ))}
        </div>
        <div className="glp-axis">
          <span className="glp-cut" style={{ left: `${(UPSTREAM / TOTAL) * 100}%` }}>
            {T.border[lang]}
          </span>
        </div>
      </div>

      <figcaption>
        {T.punch[lang]}{' '}
        <a href={fact.url} target="_blank" rel="noopener noreferrer" aria-label={label}>
          ↗
        </a>
      </figcaption>
    </figure>
  );
}
