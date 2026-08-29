'use client';

import React, { useState } from 'react';
import { nextUpdateLabel, useDeskRefresh, useTick } from '@/hooks/use-desk-refresh';
import { ageFrom } from '@/lib/relative-time';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import FloodThemeToggle from '@/components/FloodThemeToggle';
import FloodReportButton from '@/components/FloodReportButton';
import type { Lang } from '@/hooks/use-flood-lang';
import type { FloodDeskPayload } from '@/types';

// The frame every flood-desk page sits in.
//
// The desk began as one long page. It is now a set of them — the situation, the
// rescue register, the coverage — and they have to look like one publication
// rather than five: same emergency numbers in the same place, same masthead,
// one language switch. The overview keeps its own bespoke masthead; every other
// page is rendered inside this.

interface NavItem {
  href: string;
  en: string;
  ne: string;
}

const NAV: NavItem[] = [
  { href: '/bhotekoshi-flood', en: 'Overview', ne: 'सारांश' },
  // Giving sits second: after a reader has the picture, before they go
  // looking for a way to help and find a fake QR code somewhere else.
  { href: '/bhotekoshi-flood/donate', en: 'Donate', ne: 'सहयोग' },
  { href: '/bhotekoshi-flood/situation', en: 'Situation', ne: 'अवस्था' },
  { href: '/bhotekoshi-flood/rescue', en: 'Rescued', ne: 'उद्धार' },
  { href: '/bhotekoshi-flood/media', en: 'Coverage', ne: 'समाचार' },
  { href: '/bhotekoshi-flood/contacts', en: 'Contacts', ne: 'सम्पर्क' },
];

export function FloodNav({ lang }: { lang: Lang }) {
  const pathname = usePathname();
  return (
    <nav className="fl-nav" aria-label={lang === 'ne' ? 'खण्डहरू' : 'Sections'}>
      {NAV.map(item => (
        <Link
          key={item.href}
          href={item.href}
          className={pathname === item.href ? 'on' : ''}
          aria-current={pathname === item.href ? 'page' : undefined}
        >
          {lang === 'ne' ? item.ne : item.en}
        </Link>
      ))}
    </nav>
  );
}

interface Props {
  lang: Lang;
  setLang: (next: Lang) => void;
  /** Section label above the page title, e.g. "Rescue register". */
  kicker: string;
  title: string;
  /** One line under the title saying where the data came from. */
  standfirst?: string;
  children: React.ReactNode;
}

export default function FloodShell({ lang, setLang, kicker, title, standfirst, children }: Props) {
  const [desk, setDesk] = useState<FloodDeskPayload | null>(null);

  // The shell sits on every desk page, so it is where the freshness line
  // belongs — one statement of how old the figures are, wherever the reader is.
  useDeskRefresh(
    React.useCallback(() => {
      fetch('/api/flood')
        .then(r => (r.ok ? r.json() : null))
        .then(d => {
          if (d) setDesk(d);
        })
        .catch(() => {});
    }, []),
  );

  // Re-render on a timer so "4 min ago" does not sit frozen at whatever it said
  // when the page loaded.
  useTick();

  const site = desk?.site;
  const safetyText = site ? (lang === 'ne' ? site.safety_ne || site.safety_en : site.safety_en) : '';
  // NDRRMA's standing advisory rides in the same ticker, after the safety line.
  const advisory = desk?.advisories?.items?.[0];
  const advisoryText = advisory ? (lang === 'ne' ? advisory.bodyNe || advisory.body : advisory.body || advisory.bodyNe) : '';
  const safety = [safetyText, advisoryText].filter(Boolean).join(' • ');
  const lines = desk?.helplines?.lines || [];

  return (
    <div className="fl">
      <div className="fl-rail">
        <div className="fl-wrap" style={{ paddingTop: '8px', paddingBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '18px', flexWrap: 'wrap', marginBottom: safety ? '6px' : '0' }}>
            <span className="fl-rail-tag">{lang === 'ne' ? 'आपतकालीन' : 'Emergency'}</span>
            {lines.map(line => (
              <a key={line.id} href={`tel:${line.number}`} style={{ color: '#2a0508', textDecoration: 'none', fontSize: '13px', whiteSpace: 'nowrap' }}>
                <b style={{ fontFamily: 'var(--mono)', fontSize: '17px', fontWeight: 700, marginRight: '6px', letterSpacing: '0.02em' }}>{line.number}</b>
                {lang === 'ne' ? line.label_ne || line.label_en : line.label_en}
              </a>
            ))}
          </div>
          {safety && (
            <div style={{ borderTop: '1px solid rgba(42,5,8,0.15)', paddingTop: '6px', overflow: 'hidden', whiteSpace: 'nowrap', width: '100%' }}>
              <div className="fl-marquee-container" style={{ display: 'block', width: '100%', overflow: 'hidden' }}>
                <span className="fl-marquee-text" style={{ display: 'inline-block', whiteSpace: 'nowrap', animation: 'flMarquee 30s linear infinite', fontSize: '13px', fontWeight: 600, color: '#2a0508' }}>
                  {safety}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <header className="fl-mast fl-mast-sub" style={{ paddingBottom: '16px' }}>
        <div className="fl-wrap">
          <div className="fl-mast-top">
            <Link href="/">&larr; {lang === 'ne' ? 'एट्लसमा फर्कनुहोस्' : 'Back to Atlas'}</Link>
            <div className="fl-lang">
              <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button>
              <button className={lang === 'ne' ? 'on' : ''} onClick={() => setLang('ne')}>नेपाली</button>
              <FloodThemeToggle lang={lang} />
            </div>
          </div>
          <p className="fl-eyebrow">{kicker}</p>
          {/* Title and Report share a row: someone with a photo to send should
              not have to find a tab first. */}
          <div className="fl-mast-title">
            <h1>{title}</h1>
            <FloodReportButton lang={lang} />
          </div>
          {standfirst && <p className="fl-dateline">{standfirst}</p>}
          {/* How old the figures on this page are, and when they next move.
              A reader deciding whether to act on a number is entitled to know
              its age before they read it. */}
          <p className="fl-freshness">
            <i aria-hidden="true" />
            {desk?.refreshedAt ? (
              <>
                {lang === 'ne' ? 'तथ्यांक अद्यावधिक' : 'Data updated'}{' '}
                <b>{ageFrom(desk.refreshedAt, lang)}</b>
                {nextUpdateLabel(desk.nextRefreshAt, lang, desk.refreshing) && (
                  <span> · {nextUpdateLabel(desk.nextRefreshAt, lang, desk.refreshing)}</span>
                )}
              </>
            ) : (
              <span>
                {lang === 'ne'
                  ? 'तथ्यांक ताजा गरिँदै — केही क्षणमा देखिनेछ'
                  : 'Fetching the latest figures — they will appear shortly'}
              </span>
            )}
          </p>
        </div>
      </header>

      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--paper)', borderBottom: '1px solid var(--rule)', paddingBottom: '1px' }}>
        <div className="fl-wrap">
          <style dangerouslySetInnerHTML={{__html: `
            .fl-nav { margin-top: 0 !important; }
          `}} />
          <FloodNav lang={lang} />
        </div>
      </div>

      <main className="fl-wrap">
        {children}

        <footer className="fl-foot">
          {lang === 'ne'
            ? 'एट्लस निगरानी उपकरण हो, चेतावनी प्रणाली होइन। कदम चाल्नुअघि डीएचएम, एनडीआरआरएमए वा प्रहरीको आधिकारिक सूचना पुष्टि गर्नुहोस्।'
            : 'Atlas is a monitoring aid, not a warning system. Confirm with DHM, NDRRMA or the Police before acting.'}
        </footer>
      </main>
    </div>
  );
}
