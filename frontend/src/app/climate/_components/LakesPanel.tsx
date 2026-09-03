import React from 'react';

import { ClimatePanel, SourceChip, pickCopy } from '@/app/climate/_components/ClimatePanel';
import type { Lang } from '@/hooks/use-flood-lang';
import type { ClimateFact, ClimateSectionCopy } from '@/types';

export default function LakesPanel({
  lang,
  copy,
  fact,
}: {
  lang: Lang;
  copy: ClimateSectionCopy;
  fact: ClimateFact | undefined;
}) {
  const china = copy.china;
  const nepal = copy.nepal;
  const india = copy.india;
  if (typeof china !== 'number' || typeof nepal !== 'number' || typeof india !== 'number' || !fact) {
    return null;
  }
  const headline = pickCopy(lang, copy.headlineEn, copy.headlineNe);
  const caption = pickCopy(lang, copy.captionEn, copy.captionNe);
  const chinaLabel = lang === 'ne' ? 'चीन' : 'China';
  const nepalLabel = lang === 'ne' ? 'नेपाल' : 'Nepal';
  const indiaLabel = lang === 'ne' ? 'भारत' : 'India';
  const border = pickCopy(lang, "Nepal's border", 'TODO');
  const upstream = pickCopy(lang, 'upstream', 'TODO');
  const max = Math.max(china, nepal, india, 1);
  const rows = [
    { id: 'cn', n: china, label: `${chinaLabel} · ${upstream}`, tone: 'up' as const },
    { id: 'np', n: nepal, label: nepalLabel, tone: 'np' as const },
    { id: 'in', n: india, label: indiaLabel, tone: 'up' as const },
  ];
  return (
    <ClimatePanel
      id="lakes"
      index="02"
      kicker="LAKES"
      headline={headline}
      caption={caption}
      chip={<SourceChip fact={fact} />}
      table={
        <table className="sr-only">
          <caption>{headline}</caption>
          <tbody>
            <tr>
              <th>{chinaLabel}</th>
              <td>{china}</td>
            </tr>
            <tr>
              <th>{nepalLabel}</th>
              <td>{nepal}</td>
            </tr>
            <tr>
              <th>{indiaLabel}</th>
              <td>{india}</td>
            </tr>
          </tbody>
        </table>
      }
    >
      <div className="cl-lakes">
        {rows.map((row, i) => (
          <React.Fragment key={row.id}>
            {i === 1 ? <p className="cl-lk-border">{border}</p> : null}
            <div className="cl-lk-row">
              <span className="cl-lk-track" aria-hidden="true">
                <span
                  className={`cl-lk-fill is-${row.tone}`}
                  style={{ width: `${Math.max((row.n / max) * 100, 4)}%` }}
                />
              </span>
              <b>{row.n}</b>
              <span>{row.label}</span>
            </div>
          </React.Fragment>
        ))}
      </div>
    </ClimatePanel>
  );
}
