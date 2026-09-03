'use client';

import React, { useState } from 'react';

import { ClimatePanel, SourceChip, pickCopy } from '@/app/climate/_components/ClimatePanel';
import { sparkDot, sparkPolylines } from '@/lib/climate-spark';
import type { Lang } from '@/hooks/use-flood-lang';
import type { ClimateArrived, ClimateSectionCopy } from '@/types';

const W = 160;
const H = 32;

const METRICS = [
  { key: 'incidents', en: 'Incidents', ne: 'TODO' },
  { key: 'deaths', en: 'Deaths', ne: 'TODO' },
  { key: 'affected', en: 'Affected', ne: 'TODO' },
] as const;

type MetricKey = (typeof METRICS)[number]['key'];

function latest(values: Array<number | null>): string {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const value = values[i];
    if (typeof value === 'number') return String(value);
  }
  return '—';
}

function Spark({
  values,
  label,
  uid,
}: {
  values: Array<number | null>;
  label: string;
  uid: string;
}) {
  const lines = sparkPolylines(values, W, H);
  const dot = sparkDot(values, W, H);
  const titleId = `${uid}-title`;
  const descId = `${uid}-desc`;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-labelledby={`${titleId} ${descId}`}
      className="cl-spark"
    >
      <title id={titleId}>{label}</title>
      <desc id={descId}>{values.map(value => (value == null ? '—' : value)).join(', ')}</desc>
      {lines.map(points => (
        <polyline key={points} className="cl-spark-line" points={points} />
      ))}
      {dot ? <circle className="cl-spark-now" cx={dot.x} cy={dot.y} r="2.2" /> : null}
    </svg>
  );
}

export default function ArrivedPanel({
  lang,
  copy,
  arrived,
}: {
  lang: Lang;
  copy: ClimateSectionCopy;
  arrived: ClimateArrived;
}) {
  const [metric, setMetric] = useState<MetricKey>('incidents');
  if (!arrived.hazards.length || !arrived.years.length || !arrived.source?.url) return null;
  const headline = pickCopy(lang, copy.headlineEn, copy.headlineNe);
  const caption = [
    pickCopy(lang, copy.captionEn, copy.captionNe),
    arrived.truncated ? pickCopy(lang, copy.truncatedEn, copy.truncatedNe) : '',
  ]
    .filter(Boolean)
    .join(' ');
  const year = arrived.windowEnd;
  const years = arrived.years;
  return (
    <ClimatePanel
      id="arrived"
      index="03"
      kicker="WHAT ARRIVED"
      headline={headline}
      caption={caption}
      chip={
        <SourceChip
          fact={null}
          fallback={{
            label: arrived.source.label,
            url: arrived.source.url,
            year,
          }}
        />
      }
      table={
        <table className="sr-only">
          <caption>{headline}</caption>
          <thead>
            <tr>
              <th>{lang === 'ne' ? 'TODO' : 'Hazard'}</th>
              {years.map(y => (
                <th key={y}>{y}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {arrived.hazards.flatMap(hazard =>
              METRICS.map(item => (
                <tr key={`${hazard.id}-${item.key}`}>
                  <th>
                    {pickCopy(lang, hazard.labelEn, hazard.labelNe)} {item.en}
                  </th>
                  {(hazard[item.key] as Array<number | null>).map((value, i) => (
                    <td key={years[i]}>{value == null ? '—' : value}</td>
                  ))}
                </tr>
              )),
            )}
          </tbody>
        </table>
      }
    >
      <div className="cl-arrived">
        <div role="radiogroup" aria-label={lang === 'ne' ? 'TODO' : 'Count'} className="cl-metrics">
          {METRICS.map(item => (
            <button
              key={item.key}
              type="button"
              role="radio"
              aria-checked={item.key === metric}
              className={item.key === metric ? 'is-on' : undefined}
              onClick={() => setMetric(item.key)}
            >
              {pickCopy(lang, item.en, item.ne)}
            </button>
          ))}
        </div>
        {arrived.hazards.map(hazard => {
          const name = pickCopy(lang, hazard.labelEn, hazard.labelNe);
          const series = hazard[metric] as Array<number | null>;
          return (
            <div key={hazard.id} className="cl-arrived-row">
              <span className="cl-arrived-name">{name}</span>
              <Spark values={series} label={`${name} ${metric}`} uid={`cl-${hazard.id}-${metric}`} />
              <b>{latest(series)}</b>
            </div>
          );
        })}
        <p className="cl-arrived-years">
          {years[0]} – {years[years.length - 1]}
        </p>
      </div>
    </ClimatePanel>
  );
}
