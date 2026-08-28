'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import FloodDistrictMap from '@/components/FloodDistrictMap';
import FloodThemeToggle from '@/components/FloodThemeToggle';
import type { MapPhoto, MapSelection } from '@/components/FloodDistrictMap';
import FloodMapDialog from '@/components/FloodMapDialog';
import FloodReportButton from '@/components/FloodReportButton';
import FloodAiInsights from '@/app/bhotekoshi-flood/_components/FloodAiInsights';
import { FloodNav } from '@/components/FloodShell';
import FloodSummary from '@/app/bhotekoshi-flood/_components/FloodSummary';
import { useFloodLang } from '@/hooks/use-flood-lang';
import type { FloodDeskPayload, FloodPhoto, FloodPhotoFeed } from '@/types';

// The overview of the Rasuwa–Bhotekoshi flood desk.
//
// The rest of Atlas is an analyst's terminal. This is not — it is the surface an
// affected family, a volunteer or a donor opens, so it is written in plain
// language and works in Nepali.
//
// The order is the argument. Emergency numbers sit above everything, in the rail
// that never scrolls away. Then the safety notice, because people have died
// going to look at this flood. Then the map, because "where" is the first thing
// anyone asks. Then the figures. Everything that used to live further down this
// page — giving, the rescue register, the coverage, the ground reports — is now a
// tab of its own, so no single scroll has to carry all of it.

const T = {
  back: { en: 'Back to Atlas', ne: 'एट्लसमा फर्कनुहोस्' },
  title: { en: 'Rasuwa–Bhotekoshi Flood', ne: 'रसुवा–भोटेकोशी बाढी' },
  safetyNotice: { en: 'Safety notice', ne: 'सुरक्षा सूचना' },
  whereTitle: { en: 'Where the water went', ne: 'पानी कता गयो' },
  mapHint: {
    en: 'Rasuwa, Nuwakot and Dhading took the worst of it. The dashed line follows the water downstream.',
    ne: 'रसुवा, नुवाकोट र धादिङमा सबैभन्दा बढी क्षति भयो। धर्के रेखाले पानी बगेको बाटो देखाउँछ।',
  },
  whatHappened: { en: 'What happened', ne: 'के भयो' },
  alertsTitle: { en: 'Warnings in force', ne: 'लागू रहेका चेतावनी' },
  source: { en: 'Source', ne: 'स्रोत' },
  loading: { en: 'Loading…', ne: 'लोड हुँदै…' },
  moreTitle: { en: 'The rest of the desk', ne: 'डेस्कका अन्य खण्ड' },
  donate: { en: 'Give safely', ne: 'सुरक्षित सहयोग' },
  donateSub: { en: 'Government funds and recognised organisations', ne: 'सरकारी कोष र मान्यताप्राप्त संस्था' },
  rescue: { en: 'People rescued', ne: 'उद्धार भएका व्यक्ति' },
  rescueSub: { en: 'Search the NDRRMA register by name', ne: 'एनडीआरआरएमए सूचीमा नाम खोज्नुहोस्' },
  situation: { en: 'Incident register', ne: 'घटना अभिलेख' },
  situationSub: { en: 'River levels, alerts and logged incidents', ne: 'नदीको सतह, चेतावनी र दर्ता घटना' },
  report: { en: 'Ground reports', ne: 'जनताका तस्बिर' },
  reportSub: { en: 'Photographs from the affected districts', ne: 'प्रभावित जिल्लाका तस्बिर' },
  coverage: { en: 'Coverage', ne: 'समाचार' },
  coverageSub: { en: 'Press and broadcast reporting', ne: 'छापा र प्रसारण समाचार' },
  contacts: { en: 'Who to call', ne: 'कसलाई फोन गर्ने' },
  contactsSub: { en: 'Verified emergency numbers', ne: 'प्रमाणित आपतकालीन नम्बर' },
};

export default function BhotekoshiFloodView() {
  const [lang, setLang] = useFloodLang();
  const [data, setData] = useState<FloodDeskPayload | null>(null);
  const [photoFeed, setPhotoFeed] = useState<FloodPhotoFeed | null>(null);
  const [selection, setSelection] = useState<MapSelection | null>(null);

  const t = (key: keyof typeof T) => T[key][lang];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelection(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/flood');
        if (res.ok && !cancelled) setData(await res.json());
      } catch (err) {
        console.error('[Flood overview] load failed', err);
      }
      try {
        const res = await fetch('/api/flood/photos');
        if (res.ok && !cancelled) setPhotoFeed(await res.json());
      } catch {
        /* the map stands on its own without ground reports */
      }
    };
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const L = (o: object | null | undefined, key: string): string => {
    if (!o) return '';
    const obj = o as Record<string, unknown>;
    const val = lang === 'ne' ? obj[`${key}_ne`] || obj[`${key}_en`] : obj[`${key}_en`];
    return typeof val === 'string' ? val : '';
  };

  const LBody = (o: object | null | undefined): string[] => {
    if (!o) return [];
    const obj = o as Record<string, unknown>;
    const val = lang === 'ne' ? obj['body_ne'] || obj['body_en'] : obj['body_en'];
    return Array.isArray(val) ? (val as string[]) : [];
  };

  const site = data?.site;
  const safety = site ? L(site, 'safety') : '';
  const sitrep = data?.sitrep || null;

  const photos: FloodPhoto[] = photoFeed?.photos || [];
  const mapPhotos: MapPhoto[] = photos
    .filter((p): p is FloodPhoto & { lat: number; lon: number } => p.lat != null && p.lon != null)
    .map(p => ({
      id: p.id,
      lat: p.lat,
      lon: p.lon,
      geoSource: p.geoSource,
      label: p.caption || (lang === 'ne' ? 'जनताको तस्बिर' : 'Ground report'),
    }));

  const sections: Array<{ href: string; title: string; sub: string }> = [
    { href: '/bhotekoshi-flood/donate', title: t('donate'), sub: t('donateSub') },
    { href: '/bhotekoshi-flood/rescue', title: t('rescue'), sub: t('rescueSub') },
    { href: '/bhotekoshi-flood/situation', title: t('situation'), sub: t('situationSub') },
    { href: '/bhotekoshi-flood/media', title: t('coverage'), sub: t('coverageSub') },
    { href: '/bhotekoshi-flood/contacts', title: t('contacts'), sub: t('contactsSub') },
  ];

  return (
    <div className="fl">
      <div className="fl-rail">
        <div className="fl-wrap" style={{ paddingTop: '8px', paddingBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '18px', flexWrap: 'wrap', marginBottom: safety ? '6px' : '0' }}>
            <span className="fl-rail-tag">{lang === 'ne' ? 'आपतकालीन' : 'Emergency'}</span>
            {(data?.helplines?.lines || []).map(line => (
              <a key={line.id} href={`tel:${line.number}`} style={{ color: '#2a0508', textDecoration: 'none', fontSize: '13px', whiteSpace: 'nowrap' }}>
                <b style={{ fontFamily: 'var(--mono)', fontSize: '17px', fontWeight: 700, marginRight: '6px', letterSpacing: '0.02em' }}>{line.number}</b>
                {L(line, 'label')}
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
            <Link href="/">&larr; {t('back')}</Link>
            <div className="fl-lang">
              <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button>
              <button className={lang === 'ne' ? 'on' : ''} onClick={() => setLang('ne')}>नेपाली</button>
              <FloodThemeToggle lang={lang} />
            </div>
          </div>
          <p className="fl-eyebrow">{site ? L(site, 'kicker') : ''}</p>
          {/* Same row as every other page of the desk — see FloodShell. */}
          <div className="fl-mast-title">
            <h1>{site ? L(site, 'brand') : t('title')}</h1>
            <FloodReportButton lang={lang} />
          </div>
          <p className="fl-dateline">{site ? L(site, 'date_line') : ''}</p>
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
        {/* The map leads: "where" is the first thing anyone asks. The brief sits
            beside it rather than below, so "where" and "what is happening" are
            one glance instead of two. */}
        <section className="fl-sec fl-sec-map fl-overview-split">
          <div className="fl-overview-map">
          <div className="fl-sec-head">
            <span>{lang === 'ne' ? 'क्षेत्र' : 'Where'}</span>
          </div>
          <FloodDistrictMap
            points={(data?.floodPath?.points || []).map(p => ({
              id: p.id,
              name_en: p.name_en || '',
              name_ne: p.name_ne || '',
              lat: p.lat,
              lng: p.lng,
              status: p.status,
            }))}
            photos={mapPhotos}
            gauges={data?.river?.gauges || []}
            onSelect={setSelection}
            lang={lang}
          />
          <p className="fl-note">{t('mapHint')}</p>
          </div>

          <div className="fl-overview-aside">
            <FloodAiInsights lang={lang} />
          </div>
        </section>

        {safety && (
          <aside className="fl-standfirst" role="note">
            <div>
              <span style={{ display: 'block' }}>{t('safetyNotice')}</span>
              <img
                src="/images/nepal-police.png"
                alt="Nepal Police"
                style={{ height: '80px', width: 'auto', display: 'block', marginTop: '16px' }}
              />
            </div>
            <p>{safety}</p>
          </aside>
        )}

        {/* Warnings still in force, before the retrospective figures. */}
        {(data?.alerts?.alerts || []).length > 0 && (
          <section className="fl-sec">
            <div className="fl-sec-head">
              <span>{lang === 'ne' ? 'चेतावनी' : 'Warnings'}</span>
              <h2>{t('alertsTitle')}</h2>
            </div>
            {(data?.alerts?.alerts || []).map(a => (
              <aside key={a.id} className={`fl-alert s-${a.severity}`}>
                <strong>{L(a, 'title')}</strong>
                <p>{L(a, 'body')}</p>
                <a href={a.source_url} target="_blank" rel="noopener noreferrer">
                  {a.source} &#8599;
                </a>
              </aside>
            ))}
            {data?.alerts && <p className="fl-note">{L(data.alerts, 'note')}</p>}
          </section>
        )}

        {/* The summary of everything. */}
        {sitrep ? (
          <FloodSummary
            sitrep={sitrep}
            lang={lang}
            whatHappened={data?.whatHappened || null}
            portal={data?.portal || null}
          />
        ) : (
          <p className="fl-empty">{t('loading')}</p>
        )}

        <section className="fl-sec">
          <div className="fl-sec-head">
            <span>{lang === 'ne' ? 'थप' : 'More'}</span>
            <h2>{t('moreTitle')}</h2>
          </div>
          <div className="fl-sections">
            {sections.map(s => (
              <Link key={s.href} href={s.href}>
                <strong>{s.title}</strong>
                <span>{s.sub}</span>
              </Link>
            ))}
          </div>
        </section>

        <FloodMapDialog
          selection={selection}
          pathPoints={data?.floodPath?.points || []}
          gauges={data?.river?.gauges || []}
          photos={photos}
          lang={lang}
          onClose={() => setSelection(null)}
        />

        <footer className="fl-foot">
          {lang === 'ne'
            ? 'एट्लस निगरानी उपकरण हो, चेतावनी प्रणाली होइन। कदम चाल्नुअघि डीएचएम, एनडीआरआरएमए वा प्रहरीको आधिकारिक सूचना पुष्टि गर्नुहोस्।'
            : 'Atlas is a monitoring aid, not a warning system. Confirm with DHM, NDRRMA or the Police before acting.'}
        </footer>
      </main>
    </div>
  );
}
