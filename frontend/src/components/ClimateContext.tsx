'use client';

import React from 'react';

import { useClimate } from '@/hooks/useClimate';
import { useHydrated } from '@/hooks/use-hydrated';
import type { Lang } from '@/hooks/use-flood-lang';
import { ageFrom } from '@/lib/relative-time';
import MetricSwitcher from '@/components/MetricSwitcher';
import GlacialLakeProfile from '@/components/GlacialLakeProfile';
import type { ClimateContextPayload, ClimateFact, ClimateStatement } from '@/types';

const T = {
  eyebrow: { en: 'Background', ne: 'पृष्ठभूमि' },
  title: { en: 'Climate context', ne: 'जलवायु सन्दर्भ' },
  government: { en: "Nepal's government", ne: 'नेपाल सरकार' },
  governmentIntro: {
    en: "What Nepal's government has said, in its own words. These are statements from the office that made them.",
    ne: 'नेपाल सरकारले आफ्नै शब्दमा भनेको कुरा। यी सम्बन्धित कार्यालयका भनाइ हुन्।',
  },
  translated: {
    en: 'Atlas translation. The government published this in Nepali only.',
    ne: 'एट्लसको अनुवाद। सरकारले यो नेपालीमा मात्र प्रकाशित गरेको हो।',
  },
  fullStatement: { en: 'Full statement', ne: 'पूर्ण वक्तव्य' },
  read: { en: 'Read', ne: 'पढिएको' },
  stale: { en: 'Last successful read', ne: 'पछिल्लो सफल पढाइ' },
  awaiting: {
    en: 'Emissions figures have not been collected yet.',
    ne: 'उत्सर्जनका तथ्यांक अझै संकलन भएका छैनन्।',
  },
} as const;

const LAKE_FACT = 'icimod-undp-2020-pdgl';

function pick(lang: Lang, en: string | null | undefined, ne: string | null | undefined): string {
  return ((lang === 'ne' ? ne || en : en || ne) || '').trim();
}

function SourceLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className="atlas-climate-src">
      ↗
    </a>
  );
}

function FactLine({ fact, lang }: { fact: ClimateFact; lang: Lang }) {
  const year = fact.published ? fact.published.slice(0, 4) : '';
  const label = [fact.organisation, year].filter(Boolean).join(' ');
  return (
    <li>
      <p>
        {lang === 'ne' ? fact.statementNe : fact.statementEn} <SourceLink href={fact.url} label={label} />
      </p>
    </li>
  );
}

function climateParagraph(paras: string[]): string {
  return paras.find(para => /climate change|जलवायु/i.test(para)) || paras[0] || '';
}

function StatementLine({ item, lang }: { item: ClimateStatement; lang: Lang }) {
  const title = pick(lang, item.title, item.titleNe);
  const body = pick(lang, item.bodyEn, item.bodyNe);
  const paras = body.split(/\n+/).map(p => p.trim()).filter(Boolean);
  const quote = climateParagraph(paras);
  const rest = paras.filter(para => para !== quote);
  return (
    <li>
      <h3>
        <a href={item.link} target="_blank" rel="noopener noreferrer">
          {title || item.ministry}
        </a>
      </h3>
      {quote && (
        <blockquote className="atlas-climate-quote">
          <p>{quote}</p>
        </blockquote>
      )}
      {rest.length > 0 && (
        <details className="atlas-climate-full">
          <summary>{T.fullStatement[lang]}</summary>
          {paras.map(para => (
            <p key={para.slice(0, 48)}>{para}</p>
          ))}
        </details>
      )}
      {item.translated && lang === 'en' && <p className="atlas-climate-note">{T.translated.en}</p>}
      <span className="atlas-climate-meta">
        {item.ministry && <b>{item.ministry}</b>}
        <SourceLink href={item.link} label={item.ministry || item.link} />
      </span>
    </li>
  );
}

export default function ClimateContext({
  lang,
  variant = 'desk',
  initialData,
}: {
  lang: Lang;
  variant?: 'desk' | 'dashboard';
  initialData?: ClimateContextPayload;
}) {
  const { data } = useClimate(initialData);
  const hydrated = useHydrated();
  if (!data) return null;

  const emissions = data.emissions;
  const metrics = emissions.metrics || {};
  const hasMetrics = Object.keys(metrics).length > 0;
  const source = emissions.source;
  const lake = data.facts.find(fact => fact.id === LAKE_FACT);
  const otherFacts = data.facts.filter(fact => fact.id !== LAKE_FACT);
  const readLabel = emissions.stale ? T.stale[lang] : T.read[lang];

  return (
    <section
      className={
        variant === 'desk'
          ? 'fl-sec atlas-climate atlas-climate-desk'
          : 'atlas-climate atlas-climate-dash'
      }
      aria-labelledby="atlas-climate-title"
    >
      <div className={variant === 'desk' ? 'fl-sec-head' : 'atlas-climate-head'}>
        <span>{T.eyebrow[lang]}</span>
        <h2 id="atlas-climate-title">{T.title[lang]}</h2>
      </div>

      {hasMetrics ? (
        <MetricSwitcher
          metrics={metrics}
          defaultMetric={emissions.defaultMetric || 'cumulative_1750'}
          lang={lang}
        />
      ) : (
        <p className={variant === 'desk' ? 'fl-empty' : 'atlas-climate-note'}>{T.awaiting[lang]}</p>
      )}
      <p className={variant === 'desk' ? 'fl-prov-row' : 'atlas-climate-prov'}>
        <span>
          {readLabel} {hydrated ? ageFrom(emissions.fetchedAt, lang) : ''}
        </span>
        {source?.url && <SourceLink href={source.url} label={source.label} />}
      </p>

      {lake && <GlacialLakeProfile lang={lang} fact={lake} />}

      {otherFacts.length > 0 && (
        <ul className="atlas-climate-facts">
          {otherFacts.map(fact => (
            <FactLine key={fact.id} fact={fact} lang={lang} />
          ))}
        </ul>
      )}

      {data.statements.length > 0 && (
        <div className="atlas-climate-block">
          <h3>{T.government[lang]}</h3>
          <p className={variant === 'desk' ? 'fl-note' : 'atlas-climate-note'}>{T.governmentIntro[lang]}</p>
          <ul className="atlas-climate-statements">
            {data.statements.map(item => (
              <StatementLine key={item.id} item={item} lang={lang} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
