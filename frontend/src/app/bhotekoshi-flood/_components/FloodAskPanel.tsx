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
  /** Declared compose language for `source` (`en` or `ne`). */
  sourceLang: string;
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
    tagline: 'Ask about this flood, or tap a starter.',
    experiment: 'Monitoring aid, not a warning system.',
    placeholder: 'Ask about this flood…',
    send: 'Ask',
    close: 'Close',
    open: 'Ask Atlas about this flood',
    thinking: 'Reading the desk…',
    error: 'Could not answer just now. The desk figures are still on the page.',
    modelOff: 'Model off — answering from desk figures',
    left: 'translations left this hour',
    language: 'Language',
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
    tryThese: 'Try',
    briefLabel: 'Brief',
    fellBack: (name: string) => `Could not write ${name} — answered in English.`,
    needModel: 'Turn the model on to answer in other languages.',
    scope: 'Names from desk lists · no stay/leave · no forecasts',
    starters: [
      'What’s the death toll?',
      'How many still uncontacted?',
      'Worst-hit districts?',
      'How many were rescued?',
    ],
  },
  ne: {
    kicker: 'सोध्नुहोस्',
    title: 'एट्लसलाई सोध्नुहोस्',
    tagline: 'यो बाढीबारे सोध्नुहोस्, वा तलको छान्नुहोस्।',
    experiment: 'निगरानी सहायक, चेतावनी प्रणाली होइन।',
    placeholder: 'यो बाढीबारे सोध्नुहोस्…',
    send: 'सोध्नुहोस्',
    close: 'बन्द',
    open: 'यो बाढीबारे एट्लसलाई सोध्नुहोस्',
    thinking: 'डेस्क पढिँदै…',
    error: 'अहिले जवाफ दिन सकिएन। डेस्कका तथ्यांक पृष्ठमै छन्।',
    modelOff: 'मोडेल बन्द — डेस्कका तथ्यांकबाट',
    left: 'अनुवाद बाँकी यो घण्टा',
    language: 'भाषा',
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
    tryThese: 'छान्नुहोस्',
    briefLabel: 'संक्षेप',
    fellBack: (name: string) => `${name} लेख्न सकिएन — नेपालीमा जवाफ दिइयो।`,
    needModel: 'अन्य भाषामा जवाफ दिन मोडेल चाहिन्छ।',
    scope: 'डेस्क सूचीबाट नाम · बस्ने/जाने होइन · भविष्यवाणी होइन',
    starters: [
      'मृत्यु संख्या कति?',
      'सम्पर्कविहीन कति?',
      'कुन जिल्ला प्रभावित?',
      'कति जना उद्धार?',
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

/** Mark figures, desk paths and known source names so a skim finds the claim. */
function highlightAnswer(text: string): React.ReactNode {
  const pattern =
    /(\d{1,3}(?:,\d{3})+(?:\.\d+)?%?|\d{2,}(?::\d{2})?(?:\.\d+)?%?|\/(?:bhotekoshi-flood|climate)[\w\-./]*|\b(?:NDRRMA|BIPAD|MoHA|DHM|USGS|FIRMS|OPMCM|IFRC)\b)/g;
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const kind = token.startsWith('/')
      ? 'fl-ask-path'
      : /^\d/.test(token)
        ? 'fl-ask-figure'
        : 'fl-ask-source';
    nodes.push(
      <span key={key++} className={kind}>
        {token}
      </span>,
    );
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes.length > 0 ? nodes : text;
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

  // Wire brief paints immediately. Non-wire languages carry in the background —
  // a 30s+ model call used to leave the whole panel stuck on "Reading…".
  const wireLang = answerLang === 'ne' ? 'ne' : 'en';
  const carrying = !isWireLanguage(answerLang);
  const wireQuery = useInsights(wireLang);
  const carryQuery = useInsights(answerLang, { enabled: carrying });
  const feed = carrying && carryQuery.data ? carryQuery.data : wireQuery.data;
  const isLoading = !feed && (wireQuery.isLoading || (carrying && carryQuery.isFetching));
  const isError = !feed && (wireQuery.isError || (carrying && carryQuery.isError && wireQuery.isError));
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
    const writtenLang = insight.lang || wireLang;
    const stillCarrying = carrying && !carryQuery.data;
    return {
      role: 'assistant',
      source: text,
      sourceLang: writtenLang === 'ne' ? 'ne' : 'en',
      byLang: { [writtenLang]: text },
      seeded: true,
      fellBackFrom: stillCarrying ? null : (insight.fellBackFrom ?? null),
    };
  }, [feed?.insight, carrying, carryQuery.data, wireLang]);

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

  // Carry earlier answers when the picker language is missing from byLang.
  // Depend on answerLang only — depending on thread would re-run on every
  // message. Never assign source. English-only frames (e.g. news) still need
  // a carry into Nepali even though ne is a wire language for the brief.
  useEffect(() => {
    let cancelled = false;

    const missing = thread.filter(
      t => t.role === 'assistant' && !t.seeded && !t.byLang[answerLang],
    );
    if (missing.length === 0) return;

    const sources = missing.map(t => t.source);
    const sourceLangs = missing.map(t => t.sourceLang || 'en');
    void (async () => {
      try {
        const result = await retranslate.mutateAsync({
          texts: sources,
          lang: answerLang,
          sourceLangs,
        });
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
        { role: 'user', source: q, sourceLang: answerLang === 'ne' ? 'ne' : 'en', byLang: { [answerLang]: q } },
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
        const sourceLang =
          result.sourceLang === 'ne' || result.sourceLang === 'en'
            ? result.sourceLang
            : answerLang === 'ne'
              ? 'ne'
              : 'en';
        const byLang: Record<string, string> = { [sourceLang]: composed };
        if (shown) byLang[result.lang || answerLang] = shown;

        setThread(prev => [
          ...prev,
          {
            role: 'assistant',
            source: composed,
            sourceLang,
            byLang,
            refused: result.kind === 'refused',
            fellBackFrom: result.fellBackFrom ?? null,
          },
        ]);
        if (docked && !dockOpen) setUnread(true);
        void statusQuery.refetch();
      } catch {
        setThread(prev => [
          ...prev,
          {
            role: 'assistant',
            source: t.error,
            sourceLang: 'en',
            byLang: { en: t.error, [answerLang]: t.error },
          },
        ]);
        if (docked && !dockOpen) setUnread(true);
      } finally {
        setBusy(false);
      }
    },
    [ask, busy, answerLang, thread, opening, docked, dockOpen, t.error, statusQuery],
  );

  const insight = feed?.insight ?? null;

  const panelVisible = !docked || dockOpen;

  const panel = (
    <section
      id="flood-ask-panel"
      ref={panelRef}
      className={cn(
        'fl-insights fl-ask',
        docked && 'fl-ask--docked fixed bottom-4 right-4 z-[4001] w-[calc(100vw-2rem)] max-w-sm sm:bottom-24 sm:right-6',
      )}
      aria-labelledby="flood-ask-title"
      role={docked ? 'dialog' : undefined}
      aria-modal={docked ? false : undefined}
    >
      <header className="fl-ask-top">
        <div className="fl-ask-title-row">
          <div className="fl-sec-head fl-ask-head">
            <span>{t.kicker}</span>
            <h2 id="flood-ask-title">{t.title}</h2>
          </div>
          {docked && (
            <button
              type="button"
              onClick={() => setDockOpen(false)}
              className="fl-ask-close"
            >
              {t.close}
            </button>
          )}
        </div>
        <p className="fl-ask-lede">
          <span className="fl-ask-tagline">{t.tagline}</span>
          <span className="fl-ask-meta">{t.experiment}</span>
        </p>
        <p className="fl-ask-scope">{t.scope}</p>

        <div className="fl-insights-lang fl-ask-lang">
          <span id="flood-ask-lang-label">{t.language}</span>
          <Popover open={langOpen} onOpenChange={setLangOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={langOpen}
                aria-labelledby="flood-ask-lang-label"
                className="fl-ask-lang-btn w-full justify-between font-normal"
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

      <div
        ref={logRef}
        className={cn('fl-ask-log', docked ? 'fl-ask-log--docked' : 'fl-ask-log--inline')}
      >
        {thread.length === 0 && (
          <div className="fl-ask-starters">
            <p className="fl-ask-starters-label">{t.tryThese}</p>
            <ul>
              {t.starters.map(s => (
                <li key={s}>
                  <button type="button" onClick={() => send(s)} disabled={busy}>
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {isLoading && !feed ? (
          <p className="fl-empty">{t.loading}</p>
        ) : isError || !insight ? (
          <p className="fl-empty">
            {feed?.reason === 'no_reporting' ? t.none : t.unavailable}
          </p>
        ) : opening && thread.length === 0 ? (
          <article className="fl-insights-body fl-ask-brief">
            <p className="fl-ask-brief-label">{t.briefLabel}</p>
            {opening.fellBackFrom && (
              <p className="fl-insights-note" role="note">
                {status && !status.tarka
                  ? t.needModel
                  : t.fellBack(findLanguage(opening.fellBackFrom).native)}
              </p>
            )}
            <h3>{insight.headline}</h3>
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

        {thread.map((turn, i) => (
          <article
            key={i}
            className={cn(
              'fl-ask-bubble',
              turn.role === 'user' && 'fl-ask-bubble--user',
              turn.role === 'assistant' && 'fl-ask-bubble--assistant',
              turn.refused && 'fl-ask-bubble--refused',
            )}
          >
            <p className="whitespace-pre-wrap">
              {turn.role === 'user'
                ? turn.source
                : highlightAnswer(displayText(turn, answerLang))}
            </p>
            {turn.role === 'assistant' && turn.fellBackFrom ? (
              <p className="fl-ask-fallback">
                {status && !status.tarka
                  ? t.needModel
                  : t.fellBack(findLanguage(turn.fellBackFrom).native)}
              </p>
            ) : null}
          </article>
        ))}

        {busy && <p className="fl-ask-thinking">{t.thinking}</p>}
      </div>

      <form
        onSubmit={e => {
          e.preventDefault();
          void send(message);
        }}
        className="fl-ask-composer"
      >
        <div className="fl-ask-composer-row">
          <input
            ref={inputRef}
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder={t.placeholder}
            maxLength={500}
            disabled={busy}
            aria-label={t.placeholder}
          />
          <button type="submit" disabled={busy || !message.trim()}>
            {t.send}
          </button>
        </div>
        <p className="fl-ask-budget">
          {status && !status.tarka ? <span>{t.modelOff}</span> : null}
          {status?.remaining != null && (
            <span>
              {status.remaining.hour} {t.left}
            </span>
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
