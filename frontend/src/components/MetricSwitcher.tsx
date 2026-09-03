'use client';

import React, { useId, useMemo, useState } from 'react';

import { useHydrated } from '@/hooks/use-hydrated';
import type { Lang } from '@/hooks/use-flood-lang';
import { barWidth, sortMetricRows } from '@/lib/climate-bars';
import type { ClimateMetric, ClimateMetricId } from '@/types';

const ORDER: ClimateMetricId[] = [
  'cumulative_1750',
  'cumulative_1850',
  'annual_latest',
  'per_capita',
  'consumption',
];

const ROW_PX = 36;

const T = {
  group: { en: 'Emissions metric', ne: 'उत्सर्जन मापक' },
  scale: { en: "Compare at Nepal's scale", ne: 'नेपालको मापनमा तुलना' },
  country: { en: 'Country', ne: 'देश' },
  value: { en: 'Value', ne: 'मान' },
  how: { en: 'What these bars count', ne: 'यी बारले के गन्छन्' },
} as const;

function pick(lang: Lang, en: string | null | undefined, ne: string | null | undefined): string {
  return ((lang === 'ne' ? ne || en : en || ne) || '').trim();
}

function fmtValue(value: number, unit: ClimateMetric['unit']): string {
  if (unit === 'pct') {
    if (value < 0.1) return `${value.toFixed(2)}%`;
    if (value < 10) return `${value.toFixed(1)}%`;
    return `${Math.round(value)}%`;
  }
  if (unit === 't') return `${value.toFixed(1)} t`;
  return `${value.toFixed(1)} Mt`;
}

function finding(
  metric: ClimateMetric,
  rows: ClimateMetric['rows'],
  lang: Lang,
): string {
  const nepal = rows.find(row => row.id === 'nepal');
  if (!nepal) return '';
  return lang === 'ne'
    ? `नेपाल ${fmtValue(nepal.value, metric.unit)}`
    : `Nepal ${fmtValue(nepal.value, metric.unit)}`;
}

function summary(metric: ClimateMetric, rows: ClimateMetric['rows'], scale: boolean, lang: Lang): string {
  const nepal = rows.find(row => row.id === 'nepal');
  const name = pick(lang, metric.nameEn, metric.nameNe);
  const nepalBit = nepal
    ? lang === 'ne'
      ? `नेपाल ${fmtValue(nepal.value, metric.unit)}`
      : `Nepal ${fmtValue(nepal.value, metric.unit)}`
    : '';
  const scaled = scale ? pick(lang, metric.scaleCaptionEn, metric.scaleCaptionNe) : '';
  return [name, scaled, nepalBit].filter(Boolean).join('. ').replace(/\.(\s*\.)+/g, '.');
}

export default function MetricSwitcher({
  metrics,
  defaultMetric,
  lang,
  showFinding = true,
  compact = false,
}: {
  metrics: Partial<Record<ClimateMetricId, ClimateMetric>>;
  defaultMetric: ClimateMetricId;
  lang: Lang;
  showFinding?: boolean;
  /** Overview desk: Nepal-scale peers by default, tighter rows. */
  compact?: boolean;
}) {
  const hydrated = useHydrated();
  const groupId = useId();
  const [metricId, setMetricId] = useState<ClimateMetricId>(
    metrics[defaultMetric] ? defaultMetric : ORDER.find(id => metrics[id]) || defaultMetric,
  );
  const [scale, setScale] = useState(compact);

  const metric = metrics[metricId] || metrics[defaultMetric];
  const available = ORDER.filter(id => metrics[id]);
  const rows = useMemo(() => {
    if (!metric) return [];
    return sortMetricRows(scale ? metric.scaleRows : metric.rows);
  }, [metric, scale]);
  const max = rows[0]?.value ?? 0;
  const rowPx = compact ? 28 : ROW_PX;

  if (!metric || rows.length === 0) return null;

  const caption = [
    pick(lang, metric.captionEn, metric.captionNe),
    scale ? pick(lang, metric.scaleCaptionEn, metric.scaleCaptionNe) : '',
  ]
    .filter(Boolean)
    .join(' ');

  const live = summary(metric, rows, scale, lang);
  const lead = finding(metric, rows, lang);

  return (
    <div className={compact ? 'ms ms-compact' : 'ms'}>
      {showFinding && lead ? <p className="ms-finding">{lead}</p> : null}

      <table className={hydrated ? 'sr-only' : 'ms-table'}>
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th>{T.country[lang]}</th>
            <th>{T.value[lang]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id}>
              <td>{pick(lang, row.labelEn, row.labelNe)}</td>
              <td>{fmtValue(row.value, metric.unit)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ms-live" hidden={!hydrated}>
        <div className="ms-toolbar">
          <div role="radiogroup" aria-label={T.group[lang]} className="ms-metrics">
            {available.map(id => {
              const item = metrics[id];
              if (!item) return null;
              return (
                <label key={id} className={id === metricId ? 'is-on' : undefined}>
                  <input
                    type="radio"
                    name={groupId}
                    value={id}
                    checked={id === metricId}
                    onChange={() => setMetricId(id)}
                  />
                  <span>{pick(lang, item.nameEn, item.nameNe)}</span>
                </label>
              );
            })}
          </div>

          <label className={scale ? 'ms-scale is-on' : 'ms-scale'}>
            <input type="checkbox" checked={scale} onChange={() => setScale(on => !on)} />
            <span>{T.scale[lang]}</span>
          </label>
        </div>

        <div
          className="ms-chart"
          style={{ height: rows.length * rowPx }}
          aria-hidden="true"
        >
          {rows.map((row, index) => (
            <div
              key={row.id}
              className={row.id === 'nepal' ? 'ms-row is-np' : 'ms-row'}
              style={{ transform: `translateY(${index * rowPx}px)` }}
            >
              <span className="ms-name">{pick(lang, row.labelEn, row.labelNe)}</span>
              <span className="ms-val">{fmtValue(row.value, metric.unit)}</span>
              <span className="ms-track">
                <span className="ms-fill" style={{ width: barWidth(row.value, max) }} />
              </span>
            </div>
          ))}
        </div>

        <details className="ms-how">
          <summary>{T.how[lang]}</summary>
          <p className="ms-caption">{caption}</p>
        </details>
        <p className="sr-only" aria-live="polite">
          {live}
        </p>
      </div>
    </div>
  );
}
