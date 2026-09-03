'use client';

import React from 'react';

import { ClimatePanel, SourceChip, pickCopy } from '@/app/climate/_components/ClimatePanel';
import MetricSwitcher from '@/components/MetricSwitcher';
import type { Lang } from '@/hooks/use-flood-lang';
import type { ClimateEmissions, ClimateSectionCopy } from '@/types';

export default function CausePanel({
  lang,
  copy,
  emissions,
}: {
  lang: Lang;
  copy: ClimateSectionCopy;
  emissions: ClimateEmissions;
}) {
  const metrics = emissions.metrics || {};
  if (!Object.keys(metrics).length || !emissions.source?.url) return null;
  const headline = pickCopy(lang, copy.headlineEn, copy.headlineNe);
  const year = emissions.year;
  return (
    <ClimatePanel
      id="cause"
      index="04"
      kicker="CAUSE"
      headline={headline}
      chip={
        <SourceChip
          fact={null}
          fallback={{
            label: emissions.source.label,
            url: emissions.source.url,
            year,
          }}
        />
      }
    >
      <MetricSwitcher
        metrics={metrics}
        defaultMetric={emissions.defaultMetric || 'cumulative_1750'}
        lang={lang}
        showFinding={false}
      />
    </ClimatePanel>
  );
}
