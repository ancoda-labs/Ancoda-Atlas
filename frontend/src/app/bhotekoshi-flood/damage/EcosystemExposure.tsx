'use client';

import React from 'react';

import { useEcosystemExposure } from '@/hooks/useEcosystemExposure';
import type { Lang } from '@/hooks/use-flood-lang';
import { FLOOD_EVENT_ID } from '@/lib/event-id';
import type { EcosystemExposure as EcosystemExposurePayload } from '@/types';

const T = {
  kicker: { en: '4 · Ecosystem', ne: '४ · पारिस्थितिकी' },
  title: { en: 'Ecosystem exposure', ne: 'पारिस्थितिक प्रभाव' },
  standfirst: {
    en: 'Overlap between the event footprint and Nepal reference layers — protected areas, Ramsar wetlands, and land cover. Exposure only; not damage grading.',
    ne: 'घटना फुटप्रिन्ट र नेपालका सन्दर्भ तह — संरक्षित क्षेत्र, रामसार wetland, र भू-आवरण — बीचको ओभरल्याप। exposure मात्र; क्षति ग्रेडिङ होइन।',
  },
  bufferNotice: {
    en: 'Approximation from an assumed radius around the corridor centre — not a mapped event extent. Treat overlap figures as indicative until a polygon footprint is available.',
    ne: 'करिडोर केन्द्र वरिपरि अनुमानित त्रिज्याबाट — नक्साबद्ध घटना विस्तार होइन। बहुभुज फुटप्रिन्ट नआएसम्म ओभरल्याप सङ्केत मात्र मान्नुहोस्।',
  },
  protected: { en: 'Protected areas', ne: 'संरक्षित क्षेत्र' },
  ramsar: { en: 'Ramsar sites', ne: 'रामसार साइट' },
  landcover: { en: 'Land cover', ne: 'भू-आवरण' },
  colName: { en: 'Name', ne: 'नाम' },
  colDesignation: { en: 'Designation', ne: 'श्रेणी' },
  colOverlap: { en: 'Overlap km²', ne: 'ओभरल्याप km²' },
  colSharePa: { en: '% of PA', ne: 'PA को %' },
  colClass: { en: 'Class', ne: 'वर्ग' },
  colArea: { en: 'Area km²', ne: 'क्षेत्र km²' },
  loading: { en: 'Computing exposure…', ne: 'प्रभाव गणना…' },
  empty: {
    en: 'Exposure is not on this build yet — reference layers or a computed footprint may still be pending.',
    ne: 'यो निर्माणमा प्रभाव अझै छैन — सन्दर्भ तह वा गणना गरिएको फुटप्रिन्ट बाँकी हुन सक्छ।',
  },
  vintages: { en: 'Layer vintages', ne: 'तह संस्करण' },
  attribution: {
    en: 'Protected areas and Ramsar boundaries: obtain from authoritative distributors (see backend/data/eco/README.md). Land cover: NLCMS, FRTC/ICIMOD, CC BY 4.0.',
    ne: 'संरक्षित क्षेत्र र रामसार सीमा: आधिकारिक वितरकबाट (backend/data/eco/README.md हेर्नुहोस्)। भू-आवरण: NLCMS, FRTC/ICIMOD, CC BY 4.0।',
  },
  computed: { en: 'Computed', ne: 'गणना' },
};

function fmtKm2(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return value < 10 ? value.toFixed(2) : value.toFixed(1);
}

function fmtPct(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(1)}%`;
}

function LandcoverBars({
  rows,
  lang,
}: {
  rows: EcosystemExposurePayload['landcoverBreakdown'];
  lang: Lang;
}) {
  const total = rows.reduce((sum, row) => sum + row.areaKm2, 0);
  if (!rows.length || total <= 0) return null;

  return (
    <div className="fl-eco-landcover">
      <div className="fl-eco-bars" role="img" aria-label={T.landcover[lang]}>
        {rows.map(row => {
          const pct = (row.areaKm2 / total) * 100;
          return (
            <div
              key={row.className}
              className="fl-eco-bar-seg"
              style={{ flexGrow: pct, flexBasis: `${pct}%` }}
              title={`${row.className}: ${fmtKm2(row.areaKm2)} km²`}
            />
          );
        })}
      </div>
      <ul className="fl-eco-legend">
        {rows.map(row => (
          <li key={row.className}>
            <span className="fl-eco-legend-label">{row.className}</span>
            <span>{fmtKm2(row.areaKm2)} km²</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function EcosystemExposure({ lang }: { lang: Lang }) {
  const { data, isLoading } = useEcosystemExposure(FLOOD_EVENT_ID);
  const t = (key: keyof typeof T) => T[key][lang];

  return (
    <section id="ecosystem" className="fl-sec fl-damage fl-eco">
      <div className="fl-sec-head">
        <span>{t('kicker')}</span>
        <h2>{t('title')}</h2>
      </div>
      <p className="fl-ems-meta">{t('standfirst')}</p>

      {isLoading ? (
        <p className="fl-empty">{t('loading')}</p>
      ) : !data ? (
        <p className="fl-empty">{t('empty')}</p>
      ) : (
        <>
          {data.footprintSource === 'buffer_estimate' && (
            <p className="fl-warn fl-eco-buffer">{t('bufferNotice')}</p>
          )}

          {data.protectedAreas.length > 0 && (
            <div className="fl-grade-wrap">
              <div className="fl-sec-head fl-ems-subhead">
                <span>{t('protected')}</span>
              </div>
              <table className="fl-grade">
                <thead>
                  <tr>
                    <th>{t('colName')}</th>
                    <th>{t('colDesignation')}</th>
                    <th>{t('colOverlap')}</th>
                    <th>{t('colSharePa')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.protectedAreas.map(row => (
                    <tr key={`${row.name}-${row.designation}`}>
                      <th scope="row">{row.name}</th>
                      <td>{row.designation}</td>
                      <td>{fmtKm2(row.overlapKm2)}</td>
                      <td>{fmtPct(row.pctOfPa)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.ramsarSites.length > 0 && (
            <div className="fl-grade-wrap">
              <div className="fl-sec-head fl-ems-subhead">
                <span>{t('ramsar')}</span>
              </div>
              <table className="fl-grade">
                <thead>
                  <tr>
                    <th>{t('colName')}</th>
                    <th>{t('colOverlap')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ramsarSites.map(row => (
                    <tr key={row.name}>
                      <th scope="row">{row.name}</th>
                      <td>{fmtKm2(row.overlapKm2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.landcoverBreakdown.length > 0 && (
            <>
              <div className="fl-sec-head fl-ems-subhead">
                <span>{t('landcover')}</span>
              </div>
              <LandcoverBars rows={data.landcoverBreakdown} lang={lang} />
            </>
          )}

          <p className="fl-note fl-eco-meta">
            {t('computed')}{' '}
            {data.computedAt
              ? new Date(data.computedAt).toLocaleString(lang === 'ne' ? 'ne-NP' : 'en-GB', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })
              : '—'}
            {Object.keys(data.layerVintages).length > 0 && (
              <>
                {' · '}
                {t('vintages')}:{' '}
                {Object.entries(data.layerVintages)
                  .map(([layer, year]) => `${layer} ${year}`)
                  .join(' · ')}
              </>
            )}
          </p>
          <p className="fl-note">{t('attribution')}</p>
        </>
      )}
    </section>
  );
}
