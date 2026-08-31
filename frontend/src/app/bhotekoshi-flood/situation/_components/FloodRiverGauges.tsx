'use client';

import React from 'react';
import type { Lang } from '@/hooks/use-flood-lang';
import { ageLabel } from '@/lib/relative-time';
import type { FloodGauge, RiverGauges } from '@/types';

// Live river levels along the corridor, from the BIPAD Portal.
//
// Each gauge is judged against its own warning and danger marks, never against
// the other gauges — a 10 m reading on the Trishuli at Malekhu and a 2 m reading
// at Dhunche are both normal, and ranking them against each other would say
// something false about both. Gauges that have not reported recently are moved
// out of the live table entirely rather than shown with a stale number, because
// a 2021 water level presented as "now" is worse than no reading.

const T = {
  title: { en: 'River levels right now', ne: 'नदीको अहिलेको सतह' },
  hint: {
    en: 'Live from the Government of Nepal BIPAD Portal. Each gauge is compared against its own warning and danger marks — not against the other gauges.',
    ne: 'नेपाल सरकारको बिपद् पोर्टलबाट प्रत्यक्ष। प्रत्येक मापन केन्द्रलाई आफ्नै सचेत र खतरा तहसँग तुलना गरिएको हो — अरू केन्द्रसँग होइन।',
  },
  station: { en: 'Station', ne: 'मापन केन्द्र' },
  level: { en: 'Level', ne: 'सतह' },
  againstDanger: { en: 'Against danger mark', ne: 'खतरासँग तुलना' },
  updated: { en: 'Updated', ne: 'अद्यावधिक' },
  danger: { en: 'ABOVE DANGER', ne: 'खतरा तह माथि' },
  warning: { en: 'ABOVE WARNING', ne: 'सचेत तह माथि' },
  normal: { en: 'BELOW WARNING', ne: 'सचेत तह मुनि' },
  unknown: { en: 'NO CURRENT READING', ne: 'हालको तथ्यांक छैन' },
  rising: { en: 'rising', ne: 'बढ्दै' },
  falling: { en: 'falling', ne: 'घट्दै' },
  steady: { en: 'steady', ne: 'स्थिर' },
  stale: {
    en: 'This gauge has not reported recently — the last reading is shown for reference only, not as the level now.',
    ne: 'यो मापन केन्द्रले हालै तथ्यांक पठाएको छैन — अन्तिम रिडिङ सन्दर्भका लागि मात्र, अहिलेको सतह होइन।',
  },
  unavailable: {
    en: 'Live river data is unavailable right now. Everything else on this page still applies.',
    ne: 'नदीको प्रत्यक्ष तथ्यांक अहिले उपलब्ध छैन। यस पृष्ठका अन्य कुरा यथावत् छन्।',
  },
  loading: { en: 'Loading…', ne: 'लोड हुँदै…' },
  allBelow: { en: 'all below warning', ne: 'सबै सचेत तह मुनि' },
  aboveWarning: { en: 'above warning', ne: 'सचेत तह माथि' },
  portal: { en: 'Open BIPAD Portal', ne: 'बिपद् पोर्टल खोल्नुहोस्' },
};

function levelClass(level: string) {
  if (level === 'danger') return 'flood-lvl-danger';
  if (level === 'warning') return 'flood-lvl-warning';
  if (level === 'normal') return 'flood-lvl-normal';
  return 'flood-lvl-unknown';
}

function levelLabel(level: string, lang: Lang) {
  if (level === 'danger') return T.danger[lang];
  if (level === 'warning') return T.warning[lang];
  if (level === 'normal') return T.normal[lang];
  return T.unknown[lang];
}

function trendLabel(trend: string | null, lang: Lang) {
  const v = (trend || '').toUpperCase();
  if (v === 'RISING') return `↑ ${T.rising[lang]}`;
  if (v === 'FALLING') return `↓ ${T.falling[lang]}`;
  if (v === 'STEADY') return `→ ${T.steady[lang]}`;
  return null;
}

export default function FloodRiverGauges({ river, lang }: { river: RiverGauges | null | undefined; lang: Lang }) {
  const t = (key: keyof typeof T) => T[key][lang];
  const gauges: FloodGauge[] = river?.gauges || [];
  const live = gauges.filter(g => !g.stale);
  const stale = gauges.filter(g => g.stale);
  const alerting = live.filter(g => g.level === 'danger' || g.level === 'warning').length;

  return (
    <section className="fl-sec">
      <div className="fl-sec-head">
        <span>{lang === 'ne' ? 'प्रत्यक्ष' : 'Live'}</span>
        <h2>{t('title')}</h2>
        {live.length > 0 && (
          <em className={alerting ? 'warn' : 'ok'}>
            {alerting > 0 ? `${alerting} ${t('aboveWarning')}` : t('allBelow')}
          </em>
        )}
      </div>
      <p className="fl-note">{t('hint')}</p>

      {!river ? (
        <p className="fl-empty">{t('loading')}</p>
      ) : river.error ? (
        <p className="fl-empty">{t('unavailable')}</p>
      ) : (
        <>
          <div className="fl-table-scroll">
            <table className="fl-gauges">
              <thead>
                <tr>
                  <th>{t('station')}</th>
                  <th className="num">{t('level')}</th>
                  <th>{t('againstDanger')}</th>
                  <th className="num">{t('updated')}</th>
                </tr>
              </thead>
              <tbody>
                {live.map(g => (
                  <tr key={g.id} className={levelClass(g.level)}>
                    <th scope="row">
                      {lang === 'ne' ? g.labelNe : g.label}
                      <em>{lang === 'ne' ? g.districtNe : g.district}</em>
                    </th>
                    <td className="num">
                      <b>{g.waterLevel != null ? g.waterLevel.toFixed(2) : '—'}</b>
                      <span>m</span>
                    </td>
                    <td>
                      <span className="fl-bar">
                        {g.percentOfDanger != null && <i style={{ width: `${Math.min(100, g.percentOfDanger)}%` }} />}
                      </span>
                      <small>
                        {levelLabel(g.level, lang)}
                        {g.warningLevel != null && ` · ${lang === 'ne' ? 'सचेत' : 'warn'} ${g.warningLevel}m`}
                        {g.dangerLevel != null && ` · ${lang === 'ne' ? 'खतरा' : 'danger'} ${g.dangerLevel}m`}
                      </small>
                    </td>
                    <td className="num">
                      {ageLabel(g.ageMinutes, lang)}
                      <span>{trendLabel(g.trend, lang)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {stale.length > 0 && (
            <details className="fl-more">
              <summary>
                {lang === 'ne'
                  ? `${stale.length} मापन केन्द्रले हालै तथ्यांक पठाएको छैन`
                  : `${stale.length} gauges have not reported recently`}
              </summary>
              <p className="fl-note">{t('stale')}</p>
              <div className="fl-table-scroll">
                <table className="fl-gauges">
                  <tbody>
                    {stale.map(g => (
                      <tr key={g.id} className="flood-lvl-unknown">
                        <th scope="row">
                          {lang === 'ne' ? g.labelNe : g.label}
                          <em>{lang === 'ne' ? g.districtNe : g.district}</em>
                        </th>
                        <td className="num">
                          <b>{g.waterLevel != null ? g.waterLevel.toFixed(2) : '—'}</b>
                          <span>m</span>
                        </td>
                        <td />
                        <td className="num">{ageLabel(g.ageMinutes, lang)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          <p className="fl-note">
            <a href="https://bipadportal.gov.np/" target="_blank" rel="noopener noreferrer">
              {t('portal')} &#8599;
            </a>
          </p>
        </>
      )}
    </section>
  );
}
