'use client';

import React from 'react';
import Link from 'next/link';

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
  translated: {
    en: 'Atlas translation',
    ne: 'एट्लसको अनुवाद',
  },
  fullStatement: { en: 'Full statement', ne: 'पूर्ण वक्तव्य' },
  read: { en: 'Read', ne: 'पढिएको' },
  stale: { en: 'Last successful read', ne: 'पछिल्लो सफल पढाइ' },
  awaiting: {
    en: 'Emissions figures have not been collected yet.',
    ne: 'उत्सर्जनका तथ्यांक अझै संकलन भएका छैनन्।',
  },
  more: { en: 'Full Climate section', ne: 'पूर्ण जलवायु खण्ड' },
} as const;

const LAKE_FACT = 'icimod-undp-2020-pdgl';

/** Government statements stay in one language — no cross-fallback. */
function statementCopy(lang: Lang, en: string | null | undefined, ne: string | null | undefined): string {
  if (lang === 'ne') return (ne && ne.trim()) || '';
  return (en && en.trim()) || '';
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
  const text = lang === 'ne' ? fact.statementNe : fact.statementEn;
  return (
    <li>
      <p>
        <span className="atlas-climate-fact-src">{label}</span>
        {text} <SourceLink href={fact.url} label={label} />
      </p>
    </li>
  );
}

function climateParagraph(paras: string[], lang: Lang): string {
  const re = lang === 'ne' ? /जलवायु/ : /climate change|climate crisis|climate justice/i;
  return paras.find(para => re.test(para)) || paras[0] || '';
}

function VerdictCard({ item, lang }: { item: ClimateStatement; lang: Lang }) {
  const title = statementCopy(lang, item.title, item.titleNe);
  const body = statementCopy(lang, item.bodyEn, item.bodyNe);
  if (!title && !body) return null;
  const paras = body.split(/\n+/).map(p => p.trim()).filter(Boolean);
  const quote = climateParagraph(paras, lang);
  const rest = paras.filter(para => para !== quote);
  return (
    <li className="atlas-climate-verdict">
      <p className="atlas-climate-verdict-kicker">{T.government[lang]}</p>
      <h3>
        <a href={item.link} target="_blank" rel="noopener noreferrer">
          {title || item.ministry}
        </a>
      </h3>
      {quote ? (
        <blockquote className="atlas-climate-quote">
          <p>{quote}</p>
        </blockquote>
      ) : null}
      {rest.length > 0 ? (
        <details className="atlas-climate-full">
          <summary>{T.fullStatement[lang]}</summary>
          {paras.map(para => (
            <p key={para.slice(0, 48)}>{para}</p>
          ))}
        </details>
      ) : null}
      <span className="atlas-climate-meta">
        {item.ministry ? <b>{item.ministry}</b> : null}
        {item.translated && lang === 'en' ? <em>{T.translated.en}</em> : null}
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
  const climateHref = lang === 'ne' ? '/ne/climate' : '/climate';
  const verdicts = (data.statements || []).filter(item => {
    const title = statementCopy(lang, item.title, item.titleNe);
    const body = statementCopy(lang, item.bodyEn, item.bodyNe);
    return Boolean(title || body);
  });
  const desk = variant === 'desk';
  const split = desk && verdicts.length > 0;

  return (
    <section
      className={desk ? 'fl-sec atlas-climate atlas-climate-desk' : 'atlas-climate atlas-climate-dash'}
      aria-labelledby="atlas-climate-title"
    >
      <div className={desk ? 'fl-sec-head' : 'atlas-climate-head'}>
        <span>{T.eyebrow[lang]}</span>
        <h2 id="atlas-climate-title">{T.title[lang]}</h2>
      </div>

      <div className={split ? 'atlas-climate-split' : undefined}>
        <div className={desk ? 'atlas-climate-figures' : undefined}>
          {hasMetrics ? (
            <MetricSwitcher
              metrics={metrics}
              defaultMetric={emissions.defaultMetric || 'cumulative_1750'}
              lang={lang}
              compact={desk}
            />
          ) : (
            <p className={desk ? 'fl-empty' : 'atlas-climate-note'}>{T.awaiting[lang]}</p>
          )}
          <p className={desk ? 'fl-prov-row' : 'atlas-climate-prov'}>
            <span>
              {readLabel} {hydrated ? ageFrom(emissions.fetchedAt, lang) : ''}
            </span>
            {source?.url ? <SourceLink href={source.url} label={source.label} /> : null}
          </p>
        </div>

        {verdicts.length > 0 ? (
          <aside
            className={desk ? 'atlas-climate-verdicts' : 'atlas-climate-block'}
            aria-label={T.government[lang]}
          >
            {!desk ? <h3>{T.government[lang]}</h3> : null}
            <ul className="atlas-climate-statements">
              {verdicts.map(item => (
                <VerdictCard key={item.id} item={item} lang={lang} />
              ))}
            </ul>
          </aside>
        ) : null}

        {(lake || otherFacts.length > 0) ? (
          <div className={split ? 'atlas-climate-below' : desk ? 'atlas-climate-figures' : undefined}>
            {lake ? <GlacialLakeProfile lang={lang} fact={lake} compact={desk} /> : null}
            {otherFacts.length > 0 ? (
              <ul className="atlas-climate-facts">
                {otherFacts.map(fact => (
                  <FactLine key={fact.id} fact={fact} lang={lang} />
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      {desk ? (
        <p className="atlas-climate-more">
          <Link href={climateHref}>{T.more[lang]} →</Link>
        </p>
      ) : null}
    </section>
  );
}
