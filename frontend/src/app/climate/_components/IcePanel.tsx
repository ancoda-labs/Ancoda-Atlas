import React from 'react';

import { ClimatePanel, SourceChip, pickCopy } from '@/app/climate/_components/ClimatePanel';
import type { Lang } from '@/hooks/use-flood-lang';
import type { ClimateFact, ClimateSectionCopy } from '@/types';

function IceGrid({ percent, headline, caption }: { percent: number; headline: string; caption: string }) {
  const lost = Math.max(0, Math.min(100, Math.round(percent)));
  const cells = [];
  for (let i = 0; i < 100; i += 1) {
    const col = i % 10;
    const rowFromBottom = Math.floor(i / 10);
    cells.push(
      <rect
        key={i}
        className={i < lost ? 'cl-ice-lost' : 'cl-ice-rest'}
        x={col * 10 + 0.7}
        y={(9 - rowFromBottom) * 10 + 0.7}
        width="8.6"
        height="8.6"
        rx="0.6"
      />,
    );
  }
  return (
    <svg viewBox="0 0 100 100" role="img" aria-labelledby="cl-ice-title cl-ice-desc" className="cl-ice-sq">
      <title id="cl-ice-title">{headline}</title>
      <desc id="cl-ice-desc">{caption}</desc>
      {cells}
    </svg>
  );
}

export default function IcePanel({
  lang,
  copy,
  fact,
}: {
  lang: Lang;
  copy: ClimateSectionCopy;
  fact: ClimateFact | undefined;
}) {
  const percent = copy.percent;
  if (typeof percent !== 'number' || !fact) return null;
  const headline = pickCopy(lang, copy.headlineEn, copy.headlineNe);
  const caption = pickCopy(lang, copy.captionEn, copy.captionNe);
  return (
    <ClimatePanel
      id="ice"
      index="01"
      kicker="ICE"
      headline={headline}
      caption={caption}
      chip={<SourceChip fact={fact} />}
      table={
        <table className="sr-only">
          <caption>{headline}</caption>
          <tbody>
            <tr>
              <th>
                {copy.fromYear}–{copy.toYear}
              </th>
              <td>{percent}%</td>
            </tr>
          </tbody>
        </table>
      }
    >
      <div className="cl-ice">
        <p className="cl-hero">{percent}%</p>
        <IceGrid percent={percent} headline={headline} caption={caption} />
      </div>
    </ClimatePanel>
  );
}
