'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import FloodDistrictMap from '@/components/FloodDistrictMap';
import { useFloodLang } from '@/hooks/use-flood-lang';
import { ageFrom } from '@/lib/relative-time';
import { highlightNames } from '@/lib/ask-sandbox/view';
import type { AskTurnResult, ViewAction } from '@/lib/ask-sandbox/types';
import type { FloodInsight, FloodInsightFeed } from '@/types';

interface Chip {
  id: string;
  label: string;
}

interface Status {
  tarka: boolean;
  model: string | null;
  remaining: { hour: number; globalHour: number };
  blurb: string;
  chips: Chip[];
}

interface ThreadTurn {
  role: 'user' | 'assistant';
  text: string;
  result?: AskTurnResult;
}

export default function AskSandboxView() {
  const [lang, setLang] = useFloodLang();
  const [status, setStatus] = useState<Status | null>(null);
  const [insight, setInsight] = useState<FloodInsight | null | undefined>(undefined);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [thread, setThread] = useState<ThreadTurn[]>([]);
  const [view, setView] = useState<ViewAction>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sandbox/ask?lang=${lang}`)
      .then(r => r.json())
      .then(d => {
        if (!cancelled) setStatus(d as Status);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [lang]);

  useEffect(() => {
    let cancelled = false;
    setInsight(undefined);
    fetch(`/api/flood/insights?lang=${lang}`)
      .then(r => (r.ok ? r.json() : null))
      .then((feed: FloodInsightFeed | null) => {
        if (!cancelled) setInsight(feed?.insight ?? null);
      })
      .catch(() => {
        if (!cancelled) setInsight(null);
      });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [thread, insight]);

  const highlights = useMemo(() => highlightNames(view), [view]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    setThread(prev => [...prev, { role: 'user', text: q }]);
    try {
      const res = await fetch('/api/sandbox/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q, lang }),
      });
      const data = (await res.json()) as AskTurnResult & { error?: string };
      if (!res.ok) throw new Error(data.error || 'ask failed');
      setThread(prev => [...prev, { role: 'assistant', text: data.answer, result: data }]);
      if (data.view) {
        setView(data.view);
        setMapOpen(true);
      }
      if (data.remaining) {
        setStatus(s => (s ? { ...s, remaining: data.remaining } : s));
      }
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ask failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fl ask-sandbox" lang={lang}>
      <header className="fl-mast fl-mast-sub" style={{ paddingBottom: 8 }}>
        <div className="fl-wrap">
          <p className="fl-eyebrow" style={{ color: 'var(--warn, #a86a11)' }}>
            {lang === 'ne' ? 'परीक्षण · सार्वजनिक डेस्क होइन' : 'Sandbox · not the public desk'}
          </p>
          <div className="fl-mast-top">
            <Link href="/bhotekoshi-flood">&larr; {lang === 'ne' ? 'डेस्क' : 'Desk'}</Link>
            <div className="fl-lang">
              <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button>
              <button className={lang === 'ne' ? 'on' : ''} onClick={() => setLang('ne')}>नेपाली</button>
            </div>
          </div>
          <h1>{lang === 'ne' ? 'एट्लसलाई सोध्नुहोस्' : 'Ask Atlas'}</h1>
          <p className="fl-note">
            {status?.tarka ? `Tarka · ${status.model}` : (lang === 'ne' ? 'मोडेल बन्द · डेस्कको तथ्यांक' : 'Model off · desk figures')}
            {status?.remaining != null && ` · ${status.remaining.hour} ${lang === 'ne' ? 'प्रश्न बाँकी' : 'asks left this hour'}`}
          </p>
        </div>
      </header>

      <main className="fl-wrap ask-sandbox-grid">
        <section className="ask-sandbox-chat">
          <div className="ask-sandbox-thread" ref={logRef}>
            <article className="ask-bubble ask-bubble-assistant">
              <p className="ask-sandbox-meta">
                {lang === 'ne' ? 'पछिल्लो बाढी समाचार' : 'Latest flood reporting'}
              </p>
              {insight === undefined ? (
                <p>{lang === 'ne' ? 'पछिल्लो समाचार पढिँदै…' : 'Reading the latest reporting…'}</p>
              ) : insight ? (
                <>
                  <h2>{insight.headline}</h2>
                  {insight.summary ? <p>{insight.summary}</p> : null}
                  {insight.bullets.length > 0 && (
                    <ul>
                      {insight.bullets.map((b, i) => <li key={i}>{b}</li>)}
                    </ul>
                  )}
                  <p className="ask-sandbox-meta">
                    {lang === 'ne' ? 'शीर्षक मात्र' : 'Headlines only'}
                    {' · '}
                    {insight.itemCount} {lang === 'ne' ? 'समाचार' : 'reports'}
                    {' · '}
                    {ageFrom(insight.generatedAt, lang)}
                  </p>
                  {insight.sources?.length > 0 && (
                    <ul className="ask-sandbox-sources">
                      {insight.sources.slice(0, 6).map(s => (
                        <li key={s.url}>
                          <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a>
                          <span> {s.source}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p>
                  {lang === 'ne'
                    ? 'अहिले संक्षेप गर्न मिल्ने समाचार छैन। तल सोध्न सकिन्छ।'
                    : 'No flood reporting to summarise right now. You can still ask below.'}
                </p>
              )}
            </article>

            {thread.map((t, i) => (
              <article key={i} className={`ask-bubble ask-bubble-${t.role}`}>
                {t.role === 'assistant' && t.result && (
                  <p className="ask-sandbox-meta">
                    {t.result.usedModel ? t.result.model : (lang === 'ne' ? 'डेस्कको तथ्यांक' : 'desk figures')}
                    {t.result.tools.length ? ` · ${t.result.tools.map(x => x.name).join(', ')}` : ''}
                  </p>
                )}
                <p style={{ whiteSpace: 'pre-wrap' }}>{t.text}</p>
              </article>
            ))}
            {busy && (
              <p className="ask-sandbox-meta">{lang === 'ne' ? 'हेर्दै…' : 'Checking the desk…'}</p>
            )}
          </div>

          <div className="ask-sandbox-composer">
            <div className="fl-chips">
              {(status?.chips || []).map(c => (
                <button key={c.id} type="button" onClick={() => send(c.label)} disabled={busy}>
                  {c.label}
                </button>
              ))}
            </div>
            <form
              onSubmit={e => {
                e.preventDefault();
                send(message);
              }}
            >
              <textarea
                id="ask-q"
                rows={2}
                maxLength={500}
                value={message}
                onChange={e => setMessage(e.target.value)}
                disabled={busy}
                placeholder={lang === 'ne' ? 'डेस्कलाई सोध्नुहोस्…' : 'Ask about this desk…'}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send(message);
                  }
                }}
              />
              <button type="submit" disabled={busy || !message.trim()}>
                {lang === 'ne' ? 'पठाउनुहोस्' : 'Send'}
              </button>
            </form>
            {error && <p className="fl-note">{error}</p>}
          </div>
        </section>

        <aside>
          <div className="fl-sec-head">
            <span>{lang === 'ne' ? 'नक्सा' : 'Map'}</span>
            <button type="button" onClick={() => setMapOpen(o => !o)}>
              {mapOpen ? (lang === 'ne' ? 'लुकाउनुहोस्' : 'Hide') : lang === 'ne' ? 'देखाउनुहोस्' : 'Show'}
            </button>
          </div>
          <p className="fl-note">
            {lang === 'ne'
              ? 'जवाफले जिल्ला देखाएपछि नक्सा खुल्छ।'
              : 'The map opens when an answer focuses a district.'}
          </p>
          {mapOpen && (
            <FloodDistrictMap lang={lang} highlightDistricts={highlights} />
          )}
        </aside>
      </main>
    </div>
  );
}
