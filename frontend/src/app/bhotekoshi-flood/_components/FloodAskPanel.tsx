'use client';

/**
 * Ask Atlas on the flood desk — replaces the AI Insights panel.
 *
 * The news brief is the opening turn (refetched per language). Conversational
 * answers keep a composed `source` and a `byLang` map so switching the picker
 * carries earlier answers without overwriting the desk's own wording.
 *
 * While the slot is on screen the panel sits in the page. Once the reader
 * scrolls past, it docks bottom-right as a launcher bubble — one panel, one
 * thread, never two copies disagreeing.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import { ageFrom } from '@/lib/relative-time';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  NEPAL_LANGUAGES,
  WORLD_LANGUAGES,
  findLanguage,
  isWireLanguage,
} from '@/lib/nepal-languages';
import { useInsights } from '@/hooks/useFlood';
import { useAsk, useRetranslate, useSandboxStatus } from '@/hooks/useAsk';
import type { AskTurnResult } from '@/lib/ask-sandbox/types';
import type { AskHistoryTurn } from '@/services/sandbox-services';

type SiteLang = 'en' | 'ne';

interface Turn {
  role: 'user' | 'assistant';
  /** As the desk composed it (en/ne) — written once, never overwritten. */
  source: string;
  /** language code → this turn in that language */
  byLang: Record<string, string>;
  refused?: boolean;
  fellBackFrom?: string | null;
  seeded?: boolean;
}

interface Status {
  tarka: boolean;
  model: string | null;
  remaining: { hour: number; globalHour: number };
}

const COPY = {
  en: {
    kicker: 'Ask',
    title: 'Ask Atlas',
    subtitle: 'Nepal natural hazards only',
    experiment: 'Experiment. Monitoring aid, not a warning system.',
    placeholder: 'Ask about this flood, gauges, funds…',
    send: 'Send',
    close: 'Close',
    open: 'Ask Atlas about this flood',
    thinking: 'Reading the desk…',
    error: 'Could not answer just now. The desk figures are still on the page.',
    modelOff: 'Model off — answering from desk figures',
    left: 'asks left this hour',
    language: 'Answer language',
    groupNepal: 'Nepal',
    groupWorld: 'Worldwide',
    searchLanguage: 'Search a language…',
    noLanguage: 'No language found.',
    loading: 'Reading the latest reporting…',
    none: 'No flood reporting in the last 24 hours to summarise.',
    unavailable: 'The brief is unavailable right now.',
    basedOn: 'from',
    reports: 'reports',
    byList: 'Headlines only',
    fellBack: (name: string) => `Could not write ${name} — answered in English.`,
    intro:
      'I answer from what the desk last collected from Nepal government portals — NDRRMA/BIPAD, the OPMCM rescue portal, DHM and ReliefWeb — plus USGS, Open-Meteo, NASA FIRMS, and reviewed climate facts on /climate. Desk death figures are for this Rasuwa–Bhotekoshi flood event. Every answer carries the time it was collected.',
    scope:
      'I will not search for a person, will not tell anyone to stay or leave, will not predict, and will not claim climate change caused this flood.',
    starters: [
      'How many have died in the Bhotekoshi flood?',
      'Which districts are worst hit?',
      'What about Betrawati water level?',
      'Where can I donate?',
    ],
  },
  ne: {
    kicker: 'सोध्नुहोस्',
    title: 'एट्लसलाई सोध्नुहोस्',
    subtitle: 'नेपालका प्राकृतिक प्रकोप मात्र',
    experiment: 'प्रयोग। यो निगरानी सहायक हो, चेतावनी प्रणाली होइन।',
    placeholder: 'यो बाढी, ग्याज, सहयोगबारे सोध्नुहोस्…',
    send: 'पठाउनुहोस्',
    close: 'बन्द',
    open: 'यो बाढीबारे एट्लसलाई सोध्नुहोस्',
    thinking: 'डेस्क पढिँदै…',
    error: 'अहिले जवाफ दिन सकिएन। डेस्कका तथ्यांक पृष्ठमै छन्।',
    modelOff: 'मोडेल बन्द — डेस्कका तथ्यांकबाट',
    left: 'प्रश्न बाँकी',
    language: 'जवाफको भाषा',
    groupNepal: 'नेपाल',
    groupWorld: 'विश्वभर',
    searchLanguage: 'भाषा खोज्नुहोस्…',
    noLanguage: 'भाषा भेटिएन।',
    loading: 'पछिल्लो समाचार पढिँदै…',
    none: 'बितेका २४ घण्टामा संक्षेप गर्न मिल्ने बाढी समाचार छैन।',
    unavailable: 'अहिले संक्षेप उपलब्ध छैन।',
    basedOn: 'स्रोत',
    reports: 'समाचार',
    byList: 'शीर्षक मात्र',
    fellBack: (name: string) => `${name} लेख्न सकिएन — नेपालीमा जवाफ दिइयो।`,
    intro:
      'म डेस्कले नेपाल सरकारका पोर्टलबाट पछिल्लो पटक संकलन गरेको तथ्यांकबाट जवाफ दिन्छु — NDRRMA/BIPAD, OPMCM उद्धार पोर्टल, DHM र ReliefWeb, साथै USGS, Open-Meteo, NASA FIRMS र /climate का जाँचिएका जलवायु तथ्य। डेस्कका मृत्युका अंक यस रसुवा–भोटेकोशी बाढीका हुन्। हरेक जवाफसँग संकलन गरिएको समय हुन्छ।',
    scope:
      'म कुनै व्यक्ति खोज्दिनँ, बस्ने कि जाने भन्दिनँ, भविष्यवाणी गर्दिनँ, र यो बाढी जलवायु परिवर्तनले भएको भन्दिनँ।',
    starters: [
      'भोटेकोशी बाढीमा कति जनाको मृत्यु भयो?',
      'कुन जिल्ला सबैभन्दा प्रभावित छन्?',
      'बेत्रावतीको पानीको सतह कस्तो छ?',
      'कहाँ सहयोग गर्न सकिन्छ?',
    ],
  },
};

function briefSource(insight: {
  headline: string;
  summary: string;
  bullets: string[];
  generator: string;
}): string {
  const parts = [insight.headline];
  if (insight.generator === 'llm' && insight.summary) parts.push(insight.summary);
  if (insight.bullets.length > 0) parts.push(insight.bullets.map(b => `• ${b}`).join('\n'));
  return parts.join('\n\n');
}

function displayText(turn: Turn, lang: string): string {
  return turn.byLang[lang] ?? turn.source;
}

interface Props {
  lang: SiteLang;
}

export default function FloodAskPanel({ lang }: Props) {
  const [answerLang, setAnswerLang] = useState<string>(lang);
  const [langOpen, setLangOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [thread, setThread] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [docked, setDocked] = useState(false);
  const [dockOpen, setDockOpen] = useState(false);
  const [unread, setUnread] = useState(false);
  const [slotHeight, setSlotHeight] = useState<number | null>(null);

  const t = COPY[answerLang === 'ne' ? 'ne' : 'en'];
  const selectedLanguage = useMemo(() => findLanguage(answerLang), [answerLang]);

  const { data: feed, isLoading, isError } = useInsights(answerLang);
  const ask = useAsk();
  const retranslate = useRetranslate();
  const statusQuery = useSandboxStatus();
  const status = (statusQuery.data as Status | undefined) ?? null;

  const slotRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => setAnswerLang(lang), [lang]);

  // The brief is the opening turn. Refetched per language — replaced in place,
  // never pushed as a second copy, never carried through the translate route.
  const opening: Turn | null = useMemo(() => {
    const insight = feed?.insight;
    if (!insight) return null;
    const text = briefSource(insight);
    const writtenLang = insight.lang || answerLang;
    return {
      role: 'assistant',
      source: text,
      byLang: { [writtenLang]: text },
      seeded: true,
      fellBackFrom: insight.fellBackFrom ?? null,
    };
  }, [feed?.insight, answerLang]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [thread, busy, opening, dockOpen]);

  // Observe the slot, never the panel. Once docked the panel is position:fixed
  // and always intersects, which would latch docked forever.
  useEffect(() => {
    const slot = slotRef.current;
    if (!slot || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const leaving = !entry.isIntersecting;
        if (leaving) {
          const h = panelRef.current?.offsetHeight;
          if (h && h > 0) setSlotHeight(h);
          setDocked(true);
        } else {
          setDocked(false);
          setDockOpen(false);
          setUnread(false);
          setSlotHeight(null);
        }
      },
      { threshold: 0, rootMargin: '-48px 0px 0px 0px' },
    );
    observer.observe(slot);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!docked || !dockOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setDockOpen(false);
        document.getElementById('flood-ask-launcher')?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [docked, dockOpen]);

  useEffect(() => {
    if ((!docked || dockOpen) && !busy) inputRef.current?.focus();
  }, [docked, dockOpen, busy]);

  // Carry assistant turns missing this language. Depend on answerLang only —
  // depending on thread would re-run on every message. Never assign to source.
  useEffect(() => {
    if (isWireLanguage(answerLang)) return;
    let cancelled = false;

    const missing = thread.filter(
      t => t.role === 'assistant' && !t.seeded && !t.byLang[answerLang],
    );
    if (missing.length === 0) return;

    const sources = missing.map(t => t.source);
    void (async () => {
      try {
        const result = await retranslate.mutateAsync({ texts: sources, lang: answerLang });
        if (cancelled) return;
        if (result.kind === 'quota' || !result.items?.length) {
          setThread(prev =>
            prev.map(turn => {
              if (turn.role !== 'assistant' || turn.byLang[answerLang]) return turn;
              return { ...turn, fellBackFrom: answerLang };
            }),
          );
          return;
        }
        setThread(prev => {
          let itemIdx = 0;
          return prev.map(turn => {
            if (turn.role !== 'assistant' || turn.byLang[answerLang]) return turn;
            const item = result.items[itemIdx++];
            if (!item) return { ...turn, fellBackFrom: answerLang };
            if (item.translated && item.text) {
              return {
                ...turn,
                byLang: { ...turn.byLang, [answerLang]: item.text },
                fellBackFrom: null,
              };
            }
            return { ...turn, fellBackFrom: item.fellBackFrom ?? answerLang };
          });
        });
      } catch {
        if (cancelled) return;
        setThread(prev =>
          prev.map(turn => {
            if (turn.role !== 'assistant' || turn.byLang[answerLang]) return turn;
            return { ...turn, fellBackFrom: answerLang };
          }),
        );
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- answerLang only; thread would re-fire every send
  }, [answerLang]);

  const send = useCallback(
    async (raw: string) => {
      const q = raw.trim();
      if (!q || busy) return;
      setMessage('');
      setThread(prev => [
        ...prev,
        { role: 'user', source: q, byLang: { [answerLang]: q } },
      ]);
      setBusy(true);
      try {
        const history: AskHistoryTurn[] = [];
        if (opening?.source) {
          history.push({ role: 'assistant', text: opening.source });
        }
        for (const turn of thread) {
          history.push({ role: turn.role, text: turn.source });
        }
        const recent = history.slice(-6);
        const result = (await ask.mutateAsync({
          message: q,
          lang: answerLang,
          history: recent,
        })) as AskTurnResult;
        const composed = result.source ?? result.answer;
        const shown = result.answer;
        // Prefer the wire compose language for source cache keys.
        const sourceLang = answerLang === 'ne' ? 'ne' : 'en';
        const byLang: Record<string, string> = { [sourceLang]: composed };
        if (shown) byLang[result.lang || answerLang] = shown;

        setThread(prev => [
          ...prev,
          {
            role: 'assistant',
            source: composed,
            byLang,
            refused: result.kind === 'refused',
            fellBackFrom: result.fellBackFrom ?? null,
          },
        ]);
        if (docked && !dockOpen) setUnread(true);
      } catch {
        setThread(prev => [
          ...prev,
          {
            role: 'assistant',
            source: t.error,
            byLang: { en: t.error, [answerLang]: t.error },
          },
        ]);
        if (docked && !dockOpen) setUnread(true);
      } finally {
        setBusy(false);
      }
    },
    [ask, busy, answerLang, thread, opening, docked, dockOpen, t.error],
  );

  const insight = feed?.insight ?? null;
  const hasModel = feed?.hasModel ?? false;

  const panelVisible = !docked || dockOpen;

  const panel = (
    <section
      id="flood-ask-panel"
      ref={panelRef}
      className={cn(
        'fl-insights',
        docked &&
          'fixed bottom-4 right-4 z-[4001] w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-xl border border-border bg-background shadow-2xl sm:bottom-24 sm:right-6',
      )}
      aria-labelledby="flood-ask-title"
      role={docked ? 'dialog' : undefined}
      aria-modal={docked ? false : undefined}
    >
      <div className="fl-sec-head">
        <span>{t.kicker}</span>
        <h2 id="flood-ask-title">{t.title}</h2>
        {docked && (
          <button
            type="button"
            onClick={() => setDockOpen(false)}
            className="ml-auto shrink-0 text-xs text-foreground/60 underline underline-offset-2 hover:text-foreground"
          >
            {t.close}
          </button>
        )}
      </div>
      <p className="mb-2 px-0 text-[11px] leading-snug text-foreground/50">{t.experiment}</p>
      <p className="mb-3 text-xs text-foreground/60">{t.subtitle}</p>

      <div className="fl-insights-lang">
        <span id="flood-ask-lang-label">{t.language}</span>
        <Popover open={langOpen} onOpenChange={setLangOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={langOpen}
              aria-labelledby="flood-ask-lang-label"
              className="w-full justify-between font-normal"
            >
              <span className="truncate">
                {selectedLanguage.native} · {selectedLanguage.english}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className={cn(
              'w-[var(--radix-popover-trigger-width)] p-0',
              docked && 'z-[4002]',
            )}
          >
            <Command
              filter={(value, search) =>
                value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
              }
            >
              <CommandInput placeholder={t.searchLanguage} />
              <CommandList>
                <CommandEmpty>{t.noLanguage}</CommandEmpty>
                {[
                  { label: t.groupNepal, items: NEPAL_LANGUAGES },
                  { label: t.groupWorld, items: WORLD_LANGUAGES },
                ].map(group => (
                  <CommandGroup key={group.label} heading={group.label}>
                    {group.items.map(l => (
                      <CommandItem
                        key={l.code}
                        value={`${l.native} ${l.english} ${l.code}`}
                        onSelect={() => {
                          setAnswerLang(l.code);
                          setLangOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            answerLang === l.code ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <span className="truncate">
                          {l.native} · {l.english}
                        </span>
                        {!hasModel && !isWireLanguage(l.code) && (
                          <span className="fl-lang-via ml-2"> — via Nepali</span>
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

      <div
        ref={logRef}
        className={cn(
          'mt-3 space-y-3 overflow-y-auto',
          docked
            ? 'max-h-[min(20rem,calc(100dvh-22rem))] px-1'
            : 'max-h-[min(28rem,calc(100dvh-16rem))]',
        )}
      >
        <div className="rounded-lg bg-foreground/5 p-3 text-xs leading-relaxed text-foreground/80">
          <p>{t.intro}</p>
          <p className="mt-2 text-foreground/60">{t.scope}</p>
        </div>

        {isLoading && !feed ? (
          <p className="fl-empty">{t.loading}</p>
        ) : isError || !insight ? (
          <p className="fl-empty">
            {feed?.reason === 'no_reporting' ? t.none : t.unavailable}
          </p>
        ) : opening ? (
          <article className="fl-insights-body mr-2 rounded-lg px-3 py-2 text-xs leading-relaxed text-foreground">
            {opening.fellBackFrom && (
              <p className="fl-insights-note mb-2" role="note">
                {t.fellBack(findLanguage(opening.fellBackFrom).native)}
              </p>
            )}
            <h3>{insight.headline}</h3>
            {insight.generator === 'llm' && insight.summary && (
              <p className="fl-insights-summary">{insight.summary}</p>
            )}
            {insight.bullets.length > 0 && (
              <ul className="fl-insights-points">
                {insight.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            )}
            <div className="fl-insights-foot">
              {insight.generator !== 'llm' && (
                <span className="g-list">{t.byList}</span>
              )}
              <span>
                {t.basedOn} {insight.itemCount} {t.reports} ·{' '}
                {ageFrom(insight.generatedAt, lang)}
              </span>
            </div>
          </article>
        ) : null}

        {thread.length === 0 && (
          <ul className="space-y-1.5">
            {t.starters.map(s => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => send(s)}
                  className="w-full rounded-md border border-border px-3 py-2 text-left text-xs text-foreground/80 transition-colors hover:bg-foreground/5 motion-reduce:transition-none"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}

        {thread.map((turn, i) => (
          <article
            key={i}
            className={
              turn.role === 'user'
                ? 'ml-6 rounded-lg bg-primary/10 px-3 py-2 text-xs text-foreground'
                : turn.refused
                  ? 'mr-2 rounded-lg border border-border bg-foreground/5 px-3 py-2 text-xs leading-relaxed text-foreground/80'
                  : 'mr-2 rounded-lg px-3 py-2 text-xs leading-relaxed text-foreground'
            }
          >
            <p className="whitespace-pre-wrap">
              {turn.role === 'user' ? turn.source : displayText(turn, answerLang)}
            </p>
            {turn.role === 'assistant' && turn.fellBackFrom ? (
              <p className="mt-1.5 text-[11px] text-foreground/50">
                {t.fellBack(findLanguage(turn.fellBackFrom).native)}
              </p>
            ) : null}
          </article>
        ))}

        {busy && <p className="px-3 text-xs text-foreground/50">{t.thinking}</p>}
      </div>

      <form
        onSubmit={e => {
          e.preventDefault();
          void send(message);
        }}
        className="mt-3 border-t border-border pt-3"
      >
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder={t.placeholder}
            maxLength={500}
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-foreground/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
          />
          <button
            type="submit"
            disabled={busy || !message.trim()}
            className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-background disabled:opacity-40"
          >
            {t.send}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-foreground/50">
          {status && !status.tarka ? t.modelOff : null}
          {status?.remaining != null && (
            <>
              {' '}
              {status.remaining.hour} {t.left}
            </>
          )}
        </p>
      </form>
    </section>
  );

  return (
    <>
      <div
        ref={slotRef}
        style={docked && slotHeight ? { height: slotHeight } : undefined}
        aria-hidden={docked || undefined}
      >
        {!docked ? panel : null}
      </div>

      {docked && (
        <button
          id="flood-ask-launcher"
          type="button"
          aria-expanded={dockOpen}
          aria-controls="flood-ask-panel"
          aria-label={t.open}
          onClick={() => {
            setDockOpen(v => !v);
            setUnread(false);
          }}
          className="fixed bottom-4 right-4 z-[4000] flex h-14 w-14 items-center justify-center rounded-full border border-border bg-primary text-background shadow-lg transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none sm:bottom-6 sm:right-6"
        >
          {dockOpen ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
            </svg>
          )}
          {unread && !dockOpen && (
            <span
              className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-destructive"
              aria-hidden="true"
            />
          )}
        </button>
      )}

      {docked && panelVisible ? panel : null}
    </>
  );
}
