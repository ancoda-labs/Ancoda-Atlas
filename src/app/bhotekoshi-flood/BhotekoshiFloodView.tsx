'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { MapPhoto, MapSelection } from '@/components/FloodDistrictMap';
import FloodMapDialog from '@/components/FloodMapDialog';
import FloodReportButton from '@/components/FloodReportButton';
import FloodNewsTicker from '@/components/FloodNewsTicker';
import { FloodNav } from '@/components/FloodShell';
import FloodSummary from '@/app/bhotekoshi-flood/_components/FloodSummary';
import FloodOfficial from '@/app/bhotekoshi-flood/_components/FloodOfficial';
import { useFloodLang } from '@/hooks/use-flood-lang';
import { ageFrom } from '@/lib/relative-time';
import FloodFooter from '@/components/FloodFooter';
import FloodThemeToggle from '@/components/FloodThemeToggle';
import { useFloodDesk } from '@/app/bhotekoshi-flood/_components/FloodDeskProvider';
import AtlasBrand from '@/components/AtlasBrand';
import { districtPinForText } from '@/apis/utils/flood-scope.mjs';
import type { FloodPhoto, FloodPhotoFeed, NewsItem } from '@/types';
import { DESK_POLL_MS, nextUpdateLabel, useTick } from '@/hooks/use-desk-refresh';
import { isConstrainedConnection, whenIdle } from '@/lib/connection-pref';
import AtlasMapPending from '@/components/AtlasMapPending';

/** A few kilometres of scatter so several stories in one district do not stack. */
function jitter(seed: string, amp: number): { dLat: number; dLon: number } {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  const u = (Math.abs(h) % 10000) / 10000;
  const v = (Math.abs((h * 13) | 0) % 10000) / 10000;
  return { dLat: (u * 2 - 1) * amp, dLon: (v * 2 - 1) * amp };
}

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
  title: { en: 'Rasuwa–Bhotekoshi Flood', ne: 'रसुवा–भोटेकोशी बाढी' },
  safetyNotice: { en: 'Safety notice', ne: 'सुरक्षा सूचना' },
  whereTitle: { en: 'Where the water went', ne: 'पानी कता गयो' },
  mapHint: {
    en: 'Rasuwa, Nuwakot and Dhading took the worst of it. The dashed line follows the water downstream.',
    ne: 'रसुवा, नुवाकोट र धादिङमा सबैभन्दा बढी क्षति भयो। धर्के रेखाले पानी बगेको बाटो देखाउँछ।',
  },
  whatHappened: { en: 'What happened', ne: 'के भयो' },
  source: { en: 'Source', ne: 'स्रोत' },
  mapLayerPath: { en: 'Districts and the water’s course', ne: 'जिल्ला र पानीको बाटो' },
  mapLayerGauges: { en: 'River gauges', ne: 'नदी मापन केन्द्र' },
  mapLayerPhotos: { en: 'Ground reports', ne: 'जनताका तस्बिर' },
  mapPhotoSource: {
    en: 'Photographs sent in by the public, placed where each was taken',
    ne: 'जनताले पठाएका तस्बिर, खिचिएकै स्थानमा राखिएको',
  },
  mapLayerNews: { en: 'Press photographs', ne: 'समाचारका तस्बिर' },
  mapNewsSource: {
    en: 'Lead images from flood reporting, placed in the district the headline names — not the camera’s GPS',
    ne: 'बाढी समाचारका मुख्य तस्बिर, शीर्षकमा लेखिएको जिल्लामा राखिएको — क्यामेराको जीपीएस होइन',
  },
  mapReviewed: { en: 'reviewed', ne: 'जाँचिएको' },
  mapRead: { en: 'read', ne: 'पढिएको' },
  loading: { en: 'Loading…', ne: 'लोड हुँदै…' },
  moreTitle: { en: 'The rest of the desk', ne: 'डेस्कका अन्य खण्ड' },
  donate: { en: 'Give safely', ne: 'सुरक्षित सहयोग' },
  donateSub: { en: 'Government funds and recognised organisations', ne: 'सरकारी कोष र मान्यताप्राप्त संस्था' },
  rescue: { en: 'Find someone', ne: 'कोही खोज्नुहोस्' },
  rescueSub: { en: 'Search rescued names, and missing-person reports', ne: 'उद्धार नामावली र हराएका व्यक्तिका रिपोर्ट खोज्नुहोस्' },
  situation: { en: 'Incident register', ne: 'घटना अभिलेख' },
  situationSub: { en: 'River levels, alerts and logged incidents', ne: 'नदीको सतह, चेतावनी र दर्ता घटना' },
  damage: { en: 'Damage assessment', ne: 'क्षति मूल्यांकन' },
  damageSub: { en: 'Copernicus EMSR927 and the NEA notice', ne: 'कोपर्निकस EMSR927 र प्राधिकरण सूचना' },
  report: { en: 'Ground reports', ne: 'जनताका तस्बिर' },
  reportSub: { en: 'Photographs from the affected districts', ne: 'प्रभावित जिल्लाका तस्बिर' },
  coverage: { en: 'Coverage', ne: 'समाचार' },
  coverageSub: { en: 'Press and broadcast reporting', ne: 'छापा र प्रसारण समाचार' },
  contacts: { en: 'Who to call', ne: 'कसलाई फोन गर्ने' },
  contactsSub: { en: 'Verified emergency numbers', ne: 'प्रमाणित आपतकालीन नम्बर' },
  mapPending: { en: 'Map of the affected districts', ne: 'प्रभावित जिल्लाको नक्सा' },
};

const FloodDistrictMap = dynamic(() => import('@/components/FloodDistrictMap'), {
  ssr: false,
  loading: () => <AtlasMapPending label="Map" />,
});

const FloodAiInsights = dynamic(() => import('@/app/bhotekoshi-flood/_components/FloodAiInsights'), {
  ssr: false,
});

export default function BhotekoshiFloodView() {
  const [lang, setLang] = useFloodLang();
  const { desk: data } = useFloodDesk();
  const [photoFeed, setPhotoFeed] = useState<FloodPhotoFeed | null>(null);
  const [newsItems, setNewsItems] = useState<NewsItem[] | null>(null);
  const [selection, setSelection] = useState<MapSelection | null>(null);
  const [heavyReady, setHeavyReady] = useState(false);
  useTick();

  const t = (key: keyof typeof T) => T[key][lang];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelection(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    return whenIdle(() => setHeavyReady(true), isConstrainedConnection() ? 4000 : 1800);
  }, []);

  useEffect(() => {
    if (!heavyReady) return;
    let cancelled = false;
    const load = async () => {
      const [photosRes, newsRes] = await Promise.all([
        fetch('/api/flood/photos').catch(() => null),
        fetch('/api/news?topic=flood&window=24h&limit=28&sourceCap=8').catch(() => null),
      ]);
      try {
        if (photosRes?.ok && !cancelled) setPhotoFeed(await photosRes.json());
      } catch {
        /* the map stands on its own without ground reports */
      }
      try {
        if (newsRes?.ok && !cancelled) {
          const j = await newsRes.json();
          setNewsItems(Array.isArray(j.items) ? j.items : []);
        } else if (!cancelled) {
          setNewsItems([]);
        }
      } catch {
        if (!cancelled) setNewsItems([]);
      }
    };
    load();
    const id = setInterval(load, DESK_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [heavyReady]);

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
  // NDRRMA's standing advisory rides in the scrolling ticker, after the safety line.
  const advisory = data?.advisories?.items?.[0];
  const advisoryText = advisory
    ? (lang === 'ne' ? advisory.bodyNe || advisory.body : advisory.body || advisory.bodyNe) || ''
    : '';
  const marquee = [safety, advisoryText].filter(Boolean).join(' • ');
  const sitrep = data?.sitrep || null;


  const photos: FloodPhoto[] = photoFeed?.photos || [];
  const groundPins: MapPhoto[] = photos
    .filter((p): p is FloodPhoto & { lat: number; lon: number } => p.lat != null && p.lon != null)
    .map(p => ({
      id: p.id,
      lat: p.lat,
      lon: p.lon,
      geoSource: p.geoSource,
      label: p.caption || (lang === 'ne' ? 'जनताको तस्बिर' : 'Ground report'),
      url: p.url,
      orientation: p.orientation,
      layer: 'ground',
    }));
  const newsPins: MapPhoto[] = (newsItems || [])
    .filter(item => item.imageProxy && item.link)
    .map(item => {
      const located = districtPinForText(item.title);
      const pin = located || { district: 'Rasuwa', lat: 28.1167, lon: 85.3000 };
      const { dLat, dLon } = jitter(item.link, located ? 0.025 : 0.03);
      return {
        id: `news:${item.link}`,
        lat: pin.lat + dLat,
        lon: pin.lon + dLon,
        geoSource: 'district' as const,
        label: item.title,
        url: item.imageProxy || undefined,
        layer: 'news' as const,
        href: item.link,
        sub: located
          ? (lang === 'ne' ? 'समाचारको तस्बिर — जिल्ला शीर्षकबाट' : 'Press photograph — district from the headline')
          : (lang === 'ne'
            ? 'समाचारको तस्बिर — शीर्षकमा जिल्ला नभएकाले रसुवामा राखिएको'
            : 'Press photograph — headline named no district, shown in Rasuwa'),
      };
    })
    .slice(0, 16);
  const mapPhotos: MapPhoto[] = [...groundPins, ...newsPins];

  const sections: Array<{ href: string; title: string; sub: string }> = [
    { href: '/bhotekoshi-flood/rescue', title: t('rescue'), sub: t('rescueSub') },
    { href: '/bhotekoshi-flood/contacts', title: t('contacts'), sub: t('contactsSub') },
    { href: '/bhotekoshi-flood/donate', title: t('donate'), sub: t('donateSub') },
    { href: '/bhotekoshi-flood/damage', title: t('damage'), sub: t('damageSub') },
    { href: '/bhotekoshi-flood/situation', title: t('situation'), sub: t('situationSub') },
    { href: '/bhotekoshi-flood/media', title: t('coverage'), sub: t('coverageSub') },
  ];

  return (
    <div className="fl" lang={lang}>
      <div className="fl-rail">
        <div className="fl-wrap" style={{ paddingTop: '8px', paddingBottom: '8px' }}>
          <div className="fl-rail-lines" style={{ marginBottom: marquee ? '6px' : '0' }}>
            <span className="fl-rail-tag">{lang === 'ne' ? 'आपतकालीन' : 'Emergency'}</span>
            {(data?.helplines?.lines || []).map(line => (
              <a key={line.id} href={`tel:${line.number}`} style={{ color: '#2a0508', textDecoration: 'none', fontSize: '13px', whiteSpace: 'nowrap' }}>
                <b style={{ fontFamily: 'var(--mono)', fontSize: '17px', fontWeight: 700, marginRight: '6px', letterSpacing: '0.02em' }}>{line.number}</b>
                {L(line, 'label')}
              </a>
            ))}
          </div>
          {marquee && (
            <div style={{ borderTop: '1px solid rgba(42,5,8,0.15)', paddingTop: '6px', overflow: 'hidden', whiteSpace: 'nowrap', width: '100%' }}>
              <div className="fl-marquee-container" style={{ display: 'block', width: '100%', overflow: 'hidden' }}>
                <span className="fl-marquee-text" style={{ display: 'inline-block', whiteSpace: 'nowrap', animation: 'flMarquee 30s linear infinite', fontSize: '13px', fontWeight: 600, color: '#2a0508' }}>
                  {marquee}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <header className="fl-mast fl-mast-sub" style={{ paddingBottom: '16px' }}>
        <div className="fl-wrap">
          <div className="fl-mast-top">
            <AtlasBrand lang={lang} />
            <div className="fl-mast-controls">
              <div className="fl-lang">
                <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button>
                <button className={lang === 'ne' ? 'on' : ''} onClick={() => setLang('ne')}>नेपाली</button>
              </div>
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
          {/* The same freshness line the other desk pages get from FloodShell.
              This page builds its own masthead, so it carries its own copy. */}
          <p className="fl-freshness">
            <i aria-hidden="true" />
            {data?.refreshedAt ? (
              <>
                {lang === 'ne' ? 'तथ्यांक अद्यावधिक' : 'Data updated'}{' '}
                <b>{ageFrom(data.refreshedAt, lang)}</b>
                {nextUpdateLabel(data.nextRefreshAt, lang, data.refreshing) && (
                  <span> · {nextUpdateLabel(data.nextRefreshAt, lang, data.refreshing)}</span>
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
          <FloodNewsTicker lang={lang} items={newsItems || []} status={newsItems == null ? 'loading' : 'live'} />
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
        {/* Official figures first: a family opening this page needs the toll
            before the map. The map is "where"; the tabs are "how many" —
            and they must not be added across. */}
        {sitrep ? (
          <FloodSummary
            section="chapters"
            sitrep={sitrep}
            lang={lang}
            whatHappened={null}
            portal={data?.portal || null}
            corridor={data?.corridor || null}
            rescueSummary={data?.rescueSummary || null}
            rescueFetchedAt={data?.rescueFetchedAt || null}
          />
        ) : null}

        <section className="fl-sec fl-sec-map fl-overview-split">
          <div className="fl-overview-map">
          <div className="fl-sec-head">
            <span>{lang === 'ne' ? 'क्षेत्र' : 'Where'}</span>
          </div>
          {heavyReady ? (
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
          ) : (
            <AtlasMapPending label={t('mapPending')} />
          )}
          <p className="fl-note">{t('mapHint')}</p>

          {/* Where each layer of pins comes from.
              The three do not share a provenance and must not look as though
              they do: the course of the water is a reviewed reading of a DHM
              situation report, the gauges are live off BIPAD every few minutes,
              and the green dots are photographs the public sent us. A reader
              deciding whether to trust a pin needs to know which of those it
              is. */}
          <div className="fl-map-sources">
            <p className="fl-note">
              <b>{t('mapLayerPath')}</b>{' — '}
              {(data?.floodPath?.sources || []).map((src, i) => (
                <a key={i} href={src.url} target="_blank" rel="noopener noreferrer">
                  {src.label} &#8599;
                </a>
              ))}
              {data?.floodPath?.last_updated && (
                <span className="fl-blank">
                  {t('mapReviewed')} {data.floodPath.last_updated}
                </span>
              )}
            </p>
            <p className="fl-note">
              <b>{t('mapLayerGauges')}</b>{' — '}
              <a href="https://bipadportal.gov.np/" target="_blank" rel="noopener noreferrer">
                {lang === 'ne' ? 'जल तथा मौसम विज्ञान विभाग · बिपद् पोर्टल' : 'DHM · BIPAD Portal'} &#8599;
              </a>
              <span className="fl-blank">
                {t('mapRead')} {ageFrom(data?.river?.fetchedAt, lang)}
              </span>
            </p>
            {groundPins.length > 0 && (
              <p className="fl-note">
                <b>{t('mapLayerPhotos')}</b>{' — '}
                <span className="fl-blank">{t('mapPhotoSource')}</span>
              </p>
            )}
            {newsPins.length > 0 && (
              <p className="fl-note">
                <b>{t('mapLayerNews')}</b>{' — '}
                <span className="fl-blank">{t('mapNewsSource')}</span>
              </p>
            )}
          </div>
          </div>

          <div className="fl-overview-aside">
            {heavyReady ? <FloodAiInsights lang={lang} /> : null}
          </div>
        </section>

        {sitrep ? (
          <>
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

            <FloodSummary
              section="rest"
              sitrep={sitrep}
              lang={lang}
              whatHappened={data?.whatHappened || null}
              portal={data?.portal || null}
              corridor={data?.corridor || null}
              rescueSummary={data?.rescueSummary || null}
              rescueFetchedAt={data?.rescueFetchedAt || null}
            />
          </>
        ) : null}

        <FloodOfficial govEfforts={data?.govEfforts} dailyBulletin={data?.dailyBulletin} lang={lang} />

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

        <FloodFooter />
      </main>
    </div>
  );
}
