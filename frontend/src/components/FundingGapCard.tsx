'use client';

import React from 'react';

import type { Lang } from '@/hooks/use-flood-lang';
import {
  formatCrore,
  type FundingGap,
} from '@/lib/funding-gap';

const T = {
  title: { en: 'Received vs recovery need', ne: 'प्राप्त र पुनर्प्राप्ति आवश्यकता' },
  unit: { en: 'NPR crore', ne: 'NPR करोड' },
  ask: {
    en: 'Ask Atlas for this chart: “fund vs RDNA recovery?”',
    ne: 'यो चार्ट एट्लसलाई सोध्नुहोस्: «कोष vs RDNA पुनर्प्राप्ति?»',
  },
};

function barClass(id: string): string {
  if (id === 'received') return 'fl-funding-gap-bar fl-funding-gap-bar--received';
  if (id === 'recovery') return 'fl-funding-gap-bar fl-funding-gap-bar--recovery';
  return 'fl-funding-gap-bar fl-funding-gap-bar--gap';
}

export function FundingGapChart({
  gap,
  lang,
  compact,
}: {
  gap: {
    bars: Array<{
      id: string;
      label_en: string;
      label_ne: string;
      value_cr: number;
    }>;
    caveat_en?: string | null;
    caveat_ne?: string | null;
  };
  lang: Lang;
  compact?: boolean;
}) {
  const bars = gap.bars || [];
  const max = Math.max(...bars.map(b => b.value_cr), 1);
  const caveat =
    lang === 'ne'
      ? gap.caveat_ne || ('caveat_en' in gap ? gap.caveat_en : undefined)
      : gap.caveat_en || ('caveat_ne' in gap ? gap.caveat_ne : undefined);

  return (
    <figure className={`fl-funding-gap-chart${compact ? ' fl-funding-gap-chart--compact' : ''}`}>
      <div className="fl-funding-gap-bars" role="img" aria-label={T.title[lang]}>
        {bars.map(bar => {
          const height = Math.max(4, Math.round((bar.value_cr / max) * 100));
          const label = lang === 'ne' ? bar.label_ne : bar.label_en;
          return (
            <div key={bar.id} className="fl-funding-gap-col">
              <div className="fl-funding-gap-track" aria-hidden="true">
                <div className={barClass(bar.id)} style={{ height: `${height}%` }} />
              </div>
              <strong>{formatCrore(bar.value_cr)}</strong>
              <span>{label}</span>
            </div>
          );
        })}
      </div>
      <figcaption>
        <em>{T.unit[lang]}</em>
        {caveat ? <p>{caveat}</p> : null}
      </figcaption>
    </figure>
  );
}

export default function FundingGapCard({
  gap,
  lang,
  showAskHint,
}: {
  gap: FundingGap;
  lang: Lang;
  showAskHint?: boolean;
}) {
  const receivedAs =
    lang === 'ne' ? gap.received_as_of_ne || gap.received_as_of : gap.received_as_of;
  const rdnaAs = lang === 'ne' ? gap.rdna_as_of_ne || gap.rdna_as_of : gap.rdna_as_of;

  return (
    <aside className="fl-funding-gap-card" aria-labelledby="fl-funding-gap-title">
      <div className="fl-sec-head fl-ems-subhead fl-rdna-subhead">
        <span>{T.unit[lang]}</span>
        <h3 id="fl-funding-gap-title">{T.title[lang]}</h3>
      </div>
      {(receivedAs || rdnaAs) && (
        <p className="fl-ems-meta">
          {receivedAs ? `PMDRF · ${receivedAs}` : null}
          {receivedAs && rdnaAs ? ' · ' : null}
          {rdnaAs ? `RDNA · ${rdnaAs}` : null}
        </p>
      )}
      <FundingGapChart gap={gap} lang={lang} />
      {showAskHint ? <p className="fl-funding-gap-ask">{T.ask[lang]}</p> : null}
    </aside>
  );
}
