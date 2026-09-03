'use client';

/**
 * The ask box, on every page.
 *
 * WHAT IT IS ALLOWED TO SAY.
 *
 * Nothing that is not already on the desk. The API hands the model a snapshot
 * built from the last sweep and tells it that block is data, not instructions;
 * it never reaches a government portal to answer a question. That is not a
 * shortcut — the portals are slow and go down (daq.hydrology.gov.np was
 * unreachable for a whole afternoon), and a text box anyone can type into is
 * the wrong thing to hang an outbound fetch off. So every answer carries the
 * sweep time it came from rather than implying it is live.
 *
 * Three questions are refused before a model is consulted at all: searching for
 * a named person, whether to stay or leave, and what happens next. Those live
 * in the backend's policy.py, and they are refused there so that the refusal
 * does not depend on a model being configured or in a good mood.
 *
 * The panel says "experiment" because it is one, and because a chat bubble on a
 * disaster page reads as authoritative whether or not it has earned it.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';

import { cn } from '@/lib/utils';
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
import { useFloodLang } from '@/hooks/use-flood-lang';
import { ALL_LANGUAGES, NEPAL_LANGUAGES, WORLD_LANGUAGES, findLanguage } from '@/lib/nepal-languages';
import { useAsk, useSandboxStatus } from '@/hooks/useAsk';
import type { AskTurnResult } from '@/lib/ask-sandbox/types';

/** The widget's own storage key.
 *
 *  `atlas_language` belongs to the site chrome and is deliberately not touched
 *  here. This picker changes what the ask box answers in, and nothing else —
 *  not the page, and not the AI Insights panel, which holds its own separate
 *  state for the news brief.
 */
const ASK_LANG_KEY = 'atlas_ask_language';

interface Turn {
  role: 'user' | 'assistant';
  text: string;
  refused?: boolean;
  /** Set when the answer could not be written in the language asked for. */
  fellBackFrom?: string | null;
}

interface Status {
  tarka: boolean;
  model: string | null;
  remaining: { hour: number; globalHour: number };
}

const COPY = {
  en: {
    open: 'Ask Atlas about Nepal hazards',
    title: 'Ask Atlas',
    subtitle: 'Nepal natural hazards only',
    experiment: 'Experiment. Monitoring aid, not a warning system.',
    placeholder: 'Ask about floods, earthquakes, air quality…',
    send: 'Send',
    close: 'Close',
    thinking: 'Reading the desk…',
    error: 'Could not answer just now. The desk figures are still on the page.',
    modelOff: 'Model off — answering from desk figures',
    left: 'asks left this hour',
    language: 'Answer language',
    groupNepal: 'Nepal',
    groupWorld: 'World',
    searchLanguage: 'Search a language…',
    noLanguage: 'No language matches.',
    fellBack: (name: string) => `Could not write ${name} — answered in English.`,
    intro:
      'I answer from what the desk last collected from Nepal government portals — NDRRMA/BIPAD, the OPMCM rescue portal, DHM and ReliefWeb — plus USGS, Open-Meteo and NASA FIRMS. Every answer carries the time it was collected.',
    scope:
      'I will not search for a person, will not tell anyone to stay or leave, and will not predict.',
    starters: [
      'How many have died in the Bhotekoshi flood?',
      'Any earthquakes in the last 24 hours?',
      'What is the air quality in Kathmandu?',
      'Which districts are worst hit?',
    ],
  },
  ne: {
    open: 'नेपालका प्रकोपबारे एट्लसलाई सोध्नुहोस्',
    title: 'एट्लसलाई सोध्नुहोस्',
    subtitle: 'नेपालका प्राकृतिक प्रकोप मात्र',
    experiment: 'प्रयोग। यो निगरानी सहायक हो, चेतावनी प्रणाली होइन।',
    placeholder: 'बाढी, भूकम्प, वायु गुणस्तरबारे सोध्नुहोस्…',
    send: 'पठाउनुहोस्',
    close: 'बन्द',
    thinking: 'डेस्क पढिँदै…',
    error: 'अहिले जवाफ दिन सकिएन। डेस्कका तथ्यांक पृष्ठमै छन्।',
    modelOff: 'मोडेल बन्द — डेस्कका तथ्यांकबाट',
    left: 'प्रश्न बाँकी',
    language: 'जवाफको भाषा',
    groupNepal: 'नेपाल',
    groupWorld: 'विश्व',
    searchLanguage: 'भाषा खोज्नुहोस्…',
    noLanguage: 'कुनै भाषा मिलेन।',
    fellBack: (name: string) => `${name} लेख्न सकिएन — नेपालीमा जवाफ दिइयो।`,
    intro:
      'म डेस्कले नेपाल सरकारका पोर्टलबाट पछिल्लो पटक संकलन गरेको तथ्यांकबाट जवाफ दिन्छु — NDRRMA/BIPAD, OPMCM उद्धार पोर्टल, DHM र ReliefWeb, साथै USGS, Open-Meteo र NASA FIRMS। हरेक जवाफसँग संकलन गरिएको समय हुन्छ।',
    scope:
      'म कुनै व्यक्ति खोज्दिनँ, बस्ने कि जाने भन्दिनँ, र भविष्यवाणी गर्दिनँ।',
    starters: [
      'भोटेकोशी बाढीमा कति जनाको मृत्यु भयो?',
      'पछिल्लो २४ घण्टामा भूकम्प गयो?',
      'काठमाडौंको वायु गुणस्तर कस्तो छ?',
      'कुन जिल्ला सबैभन्दा प्रभावित छन्?',
    ],
  },
};

export default function AskAtlasWidget() {
  const [open, setOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [thread, setThread] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);

  // Read-only, and it has to stay that way. useFloodLang also returns a setter,
  // and taking it here would let this picker retitle the entire site — the one
  // thing it must not do. A node test asserts this file never imports the
  // store's language action, so the guarantee does not rest on this comment.
  const [siteLang] = useFloodLang();

  // The widget owns its answer language outright, under its own storage key.
  // A reader abroad wants the answer in Amharic without turning the page
  // Amharic — and there is no Amharic page to turn into; only the answer is
  // translated.
  const [answerLang, setAnswerLangState] = useState<string>(siteLang);

  // Seeded from the site's choice once, then never again: after the reader
  // picks a language here, switching the page between English and Nepali
  // leaves this alone.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(ASK_LANG_KEY);
      if (saved && ALL_LANGUAGES.some(l => l.code === saved)) setAnswerLangState(saved);
    } catch {
      // Private windows and blocked site data both throw here. The seed stands.
    }
  }, []);

  const setAnswerLang = useCallback((next: string) => {
    setAnswerLangState(next);
    try {
      window.localStorage.setItem(ASK_LANG_KEY, next);
    } catch {
      // Failing to remember the choice is not a reason to refuse it.
    }
  }, []);
  const t = COPY[answerLang === 'ne' ? 'ne' : 'en'];
  const selectedLanguage = useMemo(() => findLanguage(answerLang), [answerLang]);

  const ask = useAsk();
  // Only polled while the panel is open: the remaining budget is worthless to
  // a reader who is not asking anything, and this component is on every page.
  const statusQuery = useSandboxStatus();
  const status = open ? ((statusQuery.data as Status | undefined) ?? null) : null;

  const logRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [thread, busy]);

  // Escape closes, and focus goes back to the launcher rather than to the top
  // of the document.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        document.getElementById('ask-atlas-launcher')?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const send = useCallback(
    async (raw: string) => {
      const q = raw.trim();
      if (!q || busy) return;
      setMessage('');
      setThread(prev => [...prev, { role: 'user', text: q }]);
      setBusy(true);
      try {
        const result = (await ask.mutateAsync({ message: q, lang: answerLang })) as AskTurnResult;
        setThread(prev => [
          ...prev,
          {
            role: 'assistant',
            text: result.answer,
            // A refusal is styled differently on purpose. It is a position the
            // desk holds, not a failure to find an answer.
            refused: result.kind === 'refused',
            fellBackFrom: result.fellBackFrom ?? null,
          },
        ]);
      } catch {
        setThread(prev => [...prev, { role: 'assistant', text: t.error }]);
      } finally {
        setBusy(false);
      }
    },
    [ask, busy, answerLang, t.error],
  );

  return (
    <>
      <button
        id="ask-atlas-launcher"
        type="button"
        aria-expanded={open}
        aria-controls="ask-atlas-panel"
        aria-label={t.open}
        onClick={() => setOpen(v => !v)}
        className="fixed bottom-4 right-4 z-[4000] flex h-14 w-14 items-center justify-center rounded-full border border-border bg-primary text-background shadow-lg transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none sm:bottom-6 sm:right-6"
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
          </svg>
        )}
      </button>

      {open && (
        <div
          id="ask-atlas-panel"
          ref={panelRef}
          role="dialog"
          aria-modal="false"
          aria-label={t.title}
          className="fixed bottom-20 right-4 z-[4001] flex max-h-[min(32rem,calc(100dvh-6rem))] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl sm:bottom-24 sm:right-6"
        >
          <header className="border-b border-border px-4 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">{t.title}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 text-xs text-foreground/60 underline underline-offset-2 hover:text-foreground"
              >
                {t.close}
              </button>
            </div>
            <p className="mt-0.5 text-xs text-foreground/60">{t.subtitle}</p>
            <p className="mt-1 text-[11px] leading-snug text-foreground/50">{t.experiment}</p>

            {/* Its own row and its own state. The AI Insights panel has a
                separate picker for the news brief; a reader comparing the two
                should be able to read the brief in Nepali and ask a question
                in Amharic without one choice moving the other. */}
            <div className="mt-2 flex items-center gap-2">
              <span id="ask-atlas-lang" className="shrink-0 text-[11px] text-foreground/60">
                {t.language}
              </span>
              <Popover open={langOpen} onOpenChange={setLangOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={langOpen}
                    aria-labelledby="ask-atlas-lang"
                    className="h-7 min-w-0 flex-1 justify-between px-2 text-xs font-normal"
                  >
                    <span className="truncate">
                      {selectedLanguage.native} · {selectedLanguage.english}
                    </span>
                    <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                {/* Above the panel itself. The popover portals to the body, so
                    it escapes the panel's overflow-hidden, but it would render
                    behind the panel at anything below z-[4001]. */}
                <PopoverContent
                  align="end"
                  className="z-[4002] w-[min(18rem,calc(100vw-3rem))] p-0"
                >
                  <Command
                    filter={(value, search) =>
                      value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
                    }
                  >
                    <CommandInput placeholder={t.searchLanguage} />
                    <CommandList>
                      <CommandEmpty>{t.noLanguage}</CommandEmpty>
                      {/* Nepal first, as on the brief's picker: this desk's own
                          readers before everyone else. */}
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
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </header>

          <div ref={logRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            <div className="rounded-lg bg-foreground/5 p-3 text-xs leading-relaxed text-foreground/80">
              <p>{t.intro}</p>
              <p className="mt-2 text-foreground/60">{t.scope}</p>
            </div>

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
                <p className="whitespace-pre-wrap">{turn.text}</p>
                {turn.fellBackFrom ? (
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
            className="border-t border-border p-3"
          >
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder={t.placeholder}
                // Matches MAX_QUESTION_CHARS on the API, which refuses rather
                // than silently answering the first 500 characters.
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
                <> {status.remaining.hour} {t.left}</>
              )}
            </p>
          </form>
        </div>
      )}
    </>
  );
}
