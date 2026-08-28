'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { FloodInsightFeed } from '@/types';
import { ageFrom } from '@/lib/relative-time';
import { NEPAL_LANGUAGES, canGenerateIn, findLanguage } from '@/lib/nepal-languages';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// What the reporting currently says, beside the map.
//
// The panel is deliberately explicit about provenance. Every brief states
// whether a model wrote it or Atlas merely listed the headlines, and when the
// reader asked for a language no model writes reliably it says the text came
// back in Nepali instead. On a page people use to decide whether to move, an
// unattributed summary is worse than no summary.

type Lang = 'en' | 'ne';

const T = {
  kicker: { en: 'AI', ne: 'एआई' },
  title: { en: 'AI Insights', ne: 'एआई विश्लेषण' },
  loading: { en: 'Reading the latest reporting…', ne: 'पछिल्लो समाचार पढिँदै…' },
  none: {
    en: 'No flood reporting in the last 24 hours to summarise.',
    ne: 'बितेका २४ घण्टामा संक्षेप गर्न मिल्ने बाढी समाचार छैन।',
  },
  unavailable: {
    en: 'Insights are unavailable right now.',
    ne: 'अहिले विश्लेषण उपलब्ध छैन।',
  },
  byModel: { en: 'Written by', ne: 'लेखेको' },
  byList: { en: 'Headlines only', ne: 'शीर्षक मात्र' },
  basedOn: { en: 'from', ne: 'स्रोत' },
  reports: { en: 'reports', ne: 'समाचार' },
  sources: { en: 'Sources', ne: 'स्रोतहरू' },
  language: { en: 'Language', ne: 'भाषा' },
  // Covers both reasons a language can be unavailable: no model at all, or no
  // model that writes it reliably. Either way the outcome is what is stated.
  fellBack: {
    en: 'This brief is in Nepali. It could not be written in',
    ne: 'यो संक्षेप नेपालीमा छ। यसलाई यो भाषामा लेख्न सकिएन:',
  },
  viaNepali: { en: 'via Nepali', ne: 'नेपालीमार्फत' },
};

interface Props {
  lang: Lang;
}

export default function FloodAiInsights({ lang }: Props) {
  const [briefLang, setBriefLang] = useState<string>(lang);
  const [feed, setFeed] = useState<FloodInsightFeed | null>(null);
  const [showSources, setShowSources] = useState(false);
  const t = (key: keyof typeof T) => T[key][lang];

  // Following the page's own language toggle is the behaviour a reader expects;
  // picking a language here then overrides it until they pick again.
  useEffect(() => setBriefLang(lang), [lang]);

  const load = useCallback(async (code: string) => {
    try {
      const res = await fetch(`/api/flood/insights?lang=${encodeURIComponent(code)}`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      setFeed(await res.json());
    } catch {
      setFeed({ insight: null, hasModel: false, reason: 'unavailable' });
    }
  }, []);

  useEffect(() => {
    setFeed(null);
    load(briefLang);
    const id = setInterval(() => load(briefLang), 10 * 60 * 1000);
    return () => clearInterval(id);
  }, [briefLang, load]);

  const insight = feed?.insight ?? null;
  const hasModel = feed?.hasModel ?? false;

  return (
    <section className="fl-insights" aria-labelledby="flood-insights-title">
      <div className="fl-sec-head">
        <span>{t('kicker')}</span>
        <h2 id="flood-insights-title">{t('title')}</h2>
      </div>

      <label className="fl-insights-lang">
        <span>{t('language')}</span>
        <Select value={briefLang} onValueChange={setBriefLang}>
          <SelectTrigger aria-label={t('language')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {NEPAL_LANGUAGES.map(l => {
              // Without a model only the two languages the wire itself arrives
              // in can be produced; with one, everything the registry marks
              // generatable. The rest still appear, labelled with what they
              // will actually return, so the choice is never a surprise.
              const direct = hasModel ? canGenerateIn(l) : l.code === 'ne' || l.code === 'en';
              return (
                <SelectItem key={l.code} value={l.code}>
                  {l.native} · {l.english}
                  {!direct && <span className="fl-lang-via"> — {t('viaNepali')}</span>}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </label>

      {feed === null ? (
        <p className="fl-empty">{t('loading')}</p>
      ) : !insight ? (
        <p className="fl-empty">{feed.reason === 'no_reporting' ? t('none') : t('unavailable')}</p>
      ) : (
        <div className="fl-insights-body">
          {insight.fellBackFrom && (
            <p className="fl-insights-note" role="note">
              {t('fellBack')}{' '}
              <b>{findLanguage(insight.fellBackFrom).native}</b>
            </p>
          )}

          <h3>{insight.headline}</h3>
          <p className="fl-insights-summary">{insight.summary}</p>

          {insight.bullets.length > 0 && (
            <ul className="fl-insights-points">
              {insight.bullets.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          )}

          <div className="fl-insights-foot">
            <span className={insight.generator === 'llm' ? 'g-llm' : 'g-list'}>
              {insight.generator === 'llm'
                ? `${t('byModel')} ${insight.model || 'LLM'}`
                : t('byList')}
            </span>
            <span>
              {t('basedOn')} {insight.itemCount} {t('reports')} · {ageFrom(insight.generatedAt, lang)}
            </span>
          </div>

          {insight.sources.length > 0 && (
            <>
              <button
                type="button"
                className="fl-insights-toggle"
                onClick={() => setShowSources(v => !v)}
                aria-expanded={showSources}
              >
                {t('sources')} ({insight.sources.length}) {showSources ? '▴' : '▾'}
              </button>
              {showSources && (
                <ul className="fl-insights-sources">
                  {insight.sources.map((s, i) => (
                    <li key={i}>
                      <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a>
                      <cite>{s.source}</cite>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
