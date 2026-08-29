'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import type { FloodInsightFeed } from '@/types';
import { ageFrom } from '@/lib/relative-time';
import { cn } from '@/lib/utils';
import {
  NEPAL_LANGUAGES,
  WORLD_LANGUAGES,
  findLanguage,
  isWireLanguage,
} from '@/lib/nepal-languages';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

// What the reporting currently says, beside the map.
//
// The panel is deliberately explicit about provenance. No model writes these
// briefs — Atlas lists what the outlets filed, and the panel says so — and a
// model is used only to carry that list into the reader's language, which the
// panel also says. When the language could not be delivered at all it states
// that the text came back in Nepali instead. On a page people use to decide
// whether to move, an unattributed summary is worse than no summary.

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
  byList: { en: 'Headlines only', ne: 'शीर्षक मात्र' },
  basedOn: { en: 'from', ne: 'स्रोत' },
  reports: { en: 'reports', ne: 'समाचार' },
  language: { en: 'Language', ne: 'भाषा' },
  groupNepal: { en: 'Nepal', ne: 'नेपाल' },
  groupWorld: { en: 'Worldwide', ne: 'विश्वभर' },
  searchLanguage: { en: 'Search a language…', ne: 'भाषा खोज्नुहोस्…' },
  noLanguage: { en: 'No language found.', ne: 'भाषा भेटिएन।' },
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
  const [langOpen, setLangOpen] = useState(false);
  const [feed, setFeed] = useState<FloodInsightFeed | null>(null);
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
  const selectedLanguage = findLanguage(briefLang);

  return (
    <section className="fl-insights" aria-labelledby="flood-insights-title">
      <div className="fl-sec-head">
        <span>{t('kicker')}</span>
        <h2 id="flood-insights-title">{t('title')}</h2>
      </div>

      {/* A combobox rather than a select: 130-odd languages is a scroll nobody
          should have to do, and someone looking for their own language knows
          its name. cmdk matches on the value string, so the endonym, the
          English name and the code are all searchable — a Tamil speaker can
          type "தமிழ்", "Tamil" or "ta". */}
      <div className="fl-insights-lang">
        <span id="brief-lang-label">{t('language')}</span>
        <Popover open={langOpen} onOpenChange={setLangOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={langOpen}
              aria-labelledby="brief-lang-label"
              className="w-full justify-between font-normal"
            >
              <span className="truncate">
                {selectedLanguage.native} · {selectedLanguage.english}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
            <Command
              filter={(value, search) =>
                value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
              }
            >
              <CommandInput placeholder={t('searchLanguage')} />
              <CommandList>
                <CommandEmpty>{t('noLanguage')}</CommandEmpty>
                {/* Nepal first: this desk's own readers. Then everyone else,
                    since Rasuwa is a trekking corridor and a migration source
                    district. */}
                {[
                  { label: t('groupNepal'), items: NEPAL_LANGUAGES },
                  { label: t('groupWorld'), items: WORLD_LANGUAGES },
                ].map(group => (
                  <CommandGroup key={group.label} heading={group.label}>
                    {group.items.map(l => (
                      <CommandItem
                        key={l.code}
                        value={`${l.native} ${l.english} ${l.code}`}
                        onSelect={() => {
                          setBriefLang(l.code);
                          setLangOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            briefLang === l.code ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <span className="truncate">
                          {l.native} · {l.english}
                        </span>
                        {/* Every listed language is one a model can write, so
                            the only thing that can force Nepali is having no
                            model configured at all. */}
                        {!hasModel && !isWireLanguage(l.code) && (
                          <span className="fl-lang-via ml-2"> — {t('viaNepali')}</span>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

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
          {/* Only a model-written brief has a summary worth printing. The
              extractive one is boilerplate — "N reports from M outlets, listed
              below" — which the footer already states as "from N reports", with
              the headlines themselves directly underneath. */}
          {insight.generator === 'llm' && insight.summary && (
            <p className="fl-insights-summary">{insight.summary}</p>
          )}

          {insight.bullets.length > 0 && (
            <ul className="fl-insights-points">
              {insight.bullets.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          )}

          <div className="fl-insights-foot">
            {/* Kept: that Atlas listed these headlines rather than summarising
                them. A reader deciding whether to act on the panel needs that
                one. */}
            {insight.generator !== 'llm' && (
              <span className="g-list">{t('byList')}</span>
            )}
            <span>
              {t('basedOn')} {insight.itemCount} {t('reports')} · {ageFrom(insight.generatedAt, lang)}
            </span>
          </div>

        </div>
      )}
    </section>
  );
}
