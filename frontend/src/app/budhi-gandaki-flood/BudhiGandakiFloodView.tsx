'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { MapSelection } from '@/components/FloodDistrictMap';
import FloodMapDialog from '@/components/FloodMapDialog';
import FloodSummary from '@/app/bhotekoshi-flood/_components/FloodSummary';
import FloodRiverGauges from '@/app/bhotekoshi-flood/situation/_components/FloodRiverGauges';
import { useFloodDesk } from '@/app/bhotekoshi-flood/_components/FloodDeskProvider';
import { useFloodLang } from '@/hooks/use-flood-lang';
import { ageFrom } from '@/lib/relative-time';
import FloodFooter from '@/components/FloodFooter';
import FloodThemeToggle from '@/components/FloodThemeToggle';
import { nextUpdateLabel, useTick } from '@/hooks/use-desk-refresh';
import { isConstrainedConnection, whenIdle } from '@/lib/connection-pref';
import AtlasMapPending from '@/components/AtlasMapPending';
import AtlasMark from '@/components/AtlasMark';

// The overview of the Budhi Gandaki flood desk.
//
// Built from the Bhotekoshi desk's own parts, in the same order and for the
// same reader: numbers to call, then the safety notice, then the figures and
// the map. What it leaves out is deliberate. The rescue register, the OPMCM
// portal, the ministry feeds and the ground-report feed all belong to the
// Bhotekoshi flood — the API sends them as null for this desk — and the ask
// panel's tools only know that flood's figures. A section with no source for
// this flood is not drawn at all, rather than drawn from the other one.

const T = {
  back: { en: 'Back to Atlas', ne: 'एट्लसमा फर्कनुहोस्' },
  title: { en: 'Budhi Gandaki Flood · Gorkha', ne: 'बूढीगण्डकी बाढी · गोरखा' },
  safetyNotice: { en: 'Safety notice', ne: 'सुरक्षा सूचना' },
  mapHint: {
    en: 'Gorkha took the flood; Dhading lies across the river at Arughat and Benighat. Chitwan and Nawalparasi are shaded for DHM’s downstream warning, not for reported damage. The line follows the water down the valley.',
    ne: 'बाढी गोरखामा आयो; आरुघाट र बेनीघाटमा नदीपारि धादिङ छ। चितवन र नवलपरासी जल तथा मौसम विज्ञान विभागको तल्लो तटीय चेतावनीका लागि रंगिएका हुन्, क्षति जनाइएकाले होइन। रेखाले उपत्यकामा पानी बगेको बाटो देखाउँछ।',
  },
  mapTopics: { en: 'On this map', ne: 'यो नक्सामा' },
  mapLayerPath: { en: 'Course', ne: 'पानीको बाटो' },
  mapLayerGauges: { en: 'Gauges', ne: 'मापन केन्द्र' },
  mapReviewed: { en: 'reviewed', ne: 'जाँचिएको' },
  mapRead: { en: 'read', ne: 'पढिएको' },
  mapPending: { en: 'Map of the Budhi Gandaki valley', ne: 'बूढीगण्डकी उपत्यकाको नक्सा' },
  entry: { en: 'Landslide dam', ne: 'पहिरोको बाँध' },
  alertsKicker: { en: 'Warnings', ne: 'चेतावनी' },
  alertsTitle: { en: 'What officials are warning about', ne: 'अधिकारीहरूले के चेतावनी दिएका छन्' },
  source: { en: 'Source', ne: 'स्रोत' },
  giveKicker: { en: 'Give', ne: 'सहयोग' },
  giveTitle: { en: 'Give safely', ne: 'सुरक्षित सहयोग' },
  otherDesk: { en: 'The Rasuwa–Bhotekoshi flood desk', ne: 'रसुवा–भोटेकोशी बाढी डेस्क' },
  otherDeskSub: {
    en: 'A separate flood, with its own figures. Do not add the two together.',
    ne: 'छुट्टै बाढी, आफ्नै तथ्यांकसहित। दुईलाई नजोड्नुहोस्।',
  },
};

// Gorkha is where the water went. The rest are graded for this flood alone,
// so the Bhotekoshi desk's severe Rasuwa and Nuwakot fade to context here.
const DISTRICT_STATUS: Record<string, 'severe' | 'affected'> = {
  Gorkha: 'severe',
  Dhading: 'affected',
  Chitwan: 'affected',
  'Nawalparasi East': 'affected',
};

const FloodDistrictMap = dynamic(() => import('@/components/FloodDistrictMap'), {
  ssr: false,
  loading: () => <AtlasMapPending label="Map" />,
});

export default function BudhiGandakiFloodView() {
  const [lang, setLang] = useFloodLang();
  const { desk: data } = useFloodDesk();
  const [selection, setSelection] = useState<MapSelection | null>(null);
  const [mapReady, setMapReady] = useState(false);
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
    return whenIdle(() => setMapReady(true), isConstrainedConnection() ? 4000 : 1800);
  }, []);

  const L = (o: object | null | undefined, key: string): string => {
    if (!o) return '';
    const obj = o as Record<string, unknown>;
    const val = lang === 'ne' ? obj[`${key}_ne`] || obj[`${key}_en`] : obj[`${key}_en`];
    return typeof val === 'string' ? val : '';
  };

  const site = data?.site;
  const safety = site ? L(site, 'safety') : '';
  const sitrep = data?.sitrep || null;
  const alerts = data?.alerts?.alerts || [];
  const giveNote = L(data?.bankAccounts?.verification, 'note');

  return (
    <div className="fl" lang={lang}>
      <div className="fl-rail">
        <div className="fl-wrap" style={{ paddingTop: '8px', paddingBottom: '8px' }}>
          <div className="fl-rail-lines" style={{ marginBottom: safety ? '6px' : '0' }}>
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

      <header className="fl-mast fl-mast-sub" style={{ paddingBottom: '8px' }}>
        <div className="fl-wrap">
          <div className="fl-mast-top">
            <Link href="/" className="fl-mast-home">
              <AtlasMark className="fl-mast-mark" />
              <span>&larr; {t('back')}</span>
            </Link>
            <div className="fl-mast-controls">
              <div className="fl-lang">
                <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button>
                <button className={lang === 'ne' ? 'on' : ''} onClick={() => setLang('ne')}>नेपाली</button>
              </div>
              <FloodThemeToggle lang={lang} />
            </div>
          </div>
          <p className="fl-eyebrow">{site ? L(site, 'kicker') : ''}</p>
          <div className="fl-mast-title">
            <h1>{site ? L(site, 'brand') : t('title')}</h1>
          </div>
          <p className="fl-dateline">{site ? L(site, 'date_line') : ''}</p>
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
        </div>
      </header>

      <main className="fl-wrap">
        {sitrep ? (
          <FloodSummary
            section="chapters"
            sitrep={sitrep}
            lang={lang}
            whatHappened={null}
            corridor={data?.corridor || null}
          />
        ) : null}

        <section className="fl-sec fl-sec-map">
          <div className="fl-sec-head">
            <span>{lang === 'ne' ? 'क्षेत्र' : 'Where'}</span>
          </div>
          {mapReady ? (
            <FloodDistrictMap
              points={(data?.floodPath?.points || []).map(p => ({
                id: p.id,
                name_en: p.name_en || '',
                name_ne: p.name_ne || '',
                lat: p.lat,
                lng: p.lng,
                status: p.status,
              }))}
              gauges={data?.river?.gauges || []}
              onSelect={setSelection}
              lang={lang}
              districtStatus={DISTRICT_STATUS}
              entryLabel={T.entry}
            />
          ) : (
            <AtlasMapPending label={t('mapPending')} />
          )}
          <p className="fl-note">{t('mapHint')}</p>

          <dl className="fl-map-topics" aria-label={t('mapTopics')}>
            <div className="fl-map-topic">
              <dt>{t('mapLayerPath')}</dt>
              <dd>
                {(data?.floodPath?.sources || []).map((src, i) => (
                  <a key={i} href={src.url} target="_blank" rel="noopener noreferrer">
                    {src.label} &#8599;
                  </a>
                ))}
                {data?.floodPath?.last_updated && (
                  <span className="fl-blank">
                    {' '}{t('mapReviewed')} {data.floodPath.last_updated}
                  </span>
                )}
              </dd>
            </div>
            <div className="fl-map-topic">
              <dt>{t('mapLayerGauges')}</dt>
              <dd>
                <a href="https://bipadportal.gov.np/" target="_blank" rel="noopener noreferrer">
                  {lang === 'ne' ? 'जल तथा मौसम विज्ञान विभाग · बिपद् पोर्टल' : 'DHM · BIPAD Portal'} &#8599;
                </a>
                <span className="fl-blank">
                  {' '}{t('mapRead')} {ageFrom(data?.river?.fetchedAt, lang)}
                </span>
              </dd>
            </div>
          </dl>
        </section>

        {safety && (
          <aside className="fl-standfirst" role="note">
            <div className="fl-standfirst-kicker">
              <span>{t('safetyNotice')}</span>
            </div>
            <p>{safety}</p>
          </aside>
        )}

        {alerts.length > 0 && (
          <section className="fl-sec">
            <div className="fl-sec-head">
              <span>{t('alertsKicker')}</span>
              <h2>{t('alertsTitle')}</h2>
            </div>
            {alerts.map(alert => (
              <aside key={alert.id} className="fl-standfirst" role="note">
                <div className="fl-standfirst-kicker">
                  <span>{L(alert, 'title')}</span>
                </div>
                <p>{L(alert, 'body')}</p>
                <p className="fl-note">
                  {t('source')}:{' '}
                  <a href={alert.source_url} target="_blank" rel="noopener noreferrer">
                    {alert.source} &#8599;
                  </a>
                </p>
              </aside>
            ))}
            {data?.alerts && <p className="fl-note">{L(data.alerts, 'note')}</p>}
          </section>
        )}

        {sitrep ? (
          <FloodSummary
            section="rest"
            sitrep={sitrep}
            lang={lang}
            whatHappened={data?.whatHappened || null}
            corridor={data?.corridor || null}
          />
        ) : null}

        <FloodRiverGauges river={data?.river} lang={lang} />

        {giveNote && (
          <section className="fl-sec">
            <div className="fl-sec-head">
              <span>{t('giveKicker')}</span>
              <h2>{t('giveTitle')}</h2>
            </div>
            <p className="fl-note">{giveNote}</p>
          </section>
        )}

        <section className="fl-sec">
          <div className="fl-sections">
            <Link href="/bhotekoshi-flood">
              <strong>{t('otherDesk')}</strong>
              <span>{t('otherDeskSub')}</span>
            </Link>
          </div>
        </section>

        <FloodMapDialog
          selection={selection}
          pathPoints={data?.floodPath?.points || []}
          gauges={data?.river?.gauges || []}
          photos={[]}
          lang={lang}
          onClose={() => setSelection(null)}
        />

        <FloodFooter />
      </main>
    </div>
  );
}
