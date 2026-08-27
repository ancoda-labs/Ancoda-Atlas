'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import FloodDistrictMap from './FloodDistrictMap';
import type {
  FloodDeskPayload,
  FloodGauge,
  FloodOrg,
  FloodBank,
  FloodHelpline,
  FloodAlert,
  FloodPathPoint,
  FloodFigure,
  NewsItem,
} from '@/lib/types';

// Rasuwa–Bhotekoshi flood desk — the view behind /bhotekoshi-flood.
//
// The rest of Atlas is an analyst's terminal. This page is not — it is the one
// surface an affected family, a volunteer or a donor might open, so it is
// written in plain language, ordered by what someone needs first (stay safe →
// call for help → check the river → give safely), works in Nepali, and lives
// at its own URL so it can be shared on its own.

type Lang = 'en' | 'ne';

const T = {
  back: { en: 'Back to Atlas', ne: 'एट्लसमा फर्कनुहोस्' },
  title: { en: 'Rasuwa–Bhotekoshi Flood', ne: 'रसुवा–भोटेकोशी बाढी' },
  close: { en: 'Close', ne: 'बन्द' },
  safetyFirst: { en: 'Stay safe', ne: 'सुरक्षित रहनुहोस्' },
  callNow: { en: 'Call for help', ne: 'सहयोगका लागि फोन गर्नुहोस्' },
  callHint: { en: 'Tap a number to call. These are free from any phone in Nepal.', ne: 'फोन गर्न नम्बरमा थिच्नुहोस्। नेपालभित्र यी नम्बर निःशुल्क छन्।' },
  river: { en: 'River levels right now', ne: 'नदीको अहिलेको सतह' },
  riverHint: {
    en: 'Live from the Government of Nepal BIPAD Portal. Each gauge is compared against its own warning and danger marks — not against the other gauges.',
    ne: 'नेपाल सरकारको बिपद् पोर्टलबाट प्रत्यक्ष। प्रत्येक मापन केन्द्रलाई आफ्नै सचेत र खतरा तहसँग तुलना गरिएको हो — अरू केन्द्रसँग होइन।',
  },
  levelDanger: { en: 'ABOVE DANGER', ne: 'खतरा तह माथि' },
  levelWarning: { en: 'ABOVE WARNING', ne: 'सचेत तह माथि' },
  levelNormal: { en: 'BELOW WARNING', ne: 'सचेत तह मुनि' },
  levelUnknown: { en: 'NO CURRENT READING', ne: 'हालको तथ्यांक छैन' },
  rising: { en: 'rising', ne: 'बढ्दै' },
  falling: { en: 'falling', ne: 'घट्दै' },
  steady: { en: 'steady', ne: 'स्थिर' },
  staleNote: { en: 'This gauge has not reported recently — the last reading is shown for reference only, not as the level now.', ne: 'यो मापन केन्द्रले हालै तथ्यांक पठाएको छैन — अन्तिम रिडिङ सन्दर्भका लागि मात्र देखाइएको हो, अहिलेको सतह होइन।' },
  latest: { en: 'Latest reported figures', ne: 'पछिल्लो जनाइएको तथ्यांक' },
  mapTitle: { en: 'Affected districts', ne: 'प्रभावित जिल्ला' },
  mapHint: { en: 'Rasuwa, Nuwakot and Dhading took the worst of it. The dashed line follows the water downstream.', ne: 'रसुवा, नुवाकोट र धादिङमा सबैभन्दा बढी क्षति भयो। धर्के रेखाले पानी बगेको बाटो देखाउँछ।' },
  liveTitle: { en: 'BIPAD Portal · live', ne: 'बिपद् पोर्टल · प्रत्यक्ष' },
  stationPhotos: { en: 'Gauge stations', ne: 'मापन केन्द्रहरू' },
  emergency: { en: 'Emergency', ne: 'आपतकालीन' },
  tapToCall: { en: 'Tap to call', ne: 'फोन गर्न थिच्नुहोस्' },
  moreLines: { en: 'Other lines', ne: 'अन्य नम्बर' },
  official: { en: 'Official confirmed', ne: 'आधिकारिक पुष्टि' },
  donate: { en: 'Give safely', ne: 'सुरक्षित रूपमा सहयोग गर्नुहोस्' },
  scanQr: { en: 'Scan this QR in your banking or wallet app', ne: 'आफ्नो बैंकिङ वा वालेट एपबाट यो QR स्क्यान गर्नुहोस्' },
  accountNo: { en: 'Account number', ne: 'खाता नम्बर' },
  copy: { en: 'Copy', ne: 'कपी' },
  copied: { en: 'Copied', ne: 'कपी भयो' },
  openPortal: { en: 'Open donation page', ne: 'दान पृष्ठ खोल्नुहोस्' },
  news: { en: 'Latest news', ne: 'पछिल्लो समाचार' },
  whatHappened: { en: 'What happened', ne: 'के भयो' },
  affected: { en: 'Affected districts', ne: 'प्रभावित जिल्ला' },
  floodPathTitle: { en: 'Where the water went', ne: 'पानी कता गयो' },
  source: { en: 'Source', ne: 'स्रोत' },
  asOf: { en: 'As of', ne: 'मिति' },
  loading: { en: 'Loading…', ne: 'लोड हुँदै…' },
  unavailable: { en: 'Live river data is unavailable right now. Everything else on this page still applies.', ne: 'नदीको प्रत्यक्ष तथ्यांक अहिले उपलब्ध छैन। यस पृष्ठका अन्य कुरा यथावत् छन्।' },
  photoNote: { en: 'Photo of the gauge station itself, published by DHM. It is not a live camera view of the flood.', ne: 'यो जल तथा मौसम विज्ञान विभागले प्रकाशित गरेको मापन केन्द्रकै तस्बिर हो। बाढीको प्रत्यक्ष क्यामेरा दृश्य होइन।' },
  viewPortal: { en: 'Open BIPAD Portal', ne: 'बिपद् पोर्टल खोल्नुहोस्' },
  noNews: { en: 'No flood reporting in the last 48 hours.', ne: 'बितेका ४८ घण्टामा बाढीसम्बन्धी समाचार छैन।' },
};

function t(key: keyof typeof T, lang: Lang) {
  return T[key][lang];
}

const SAFETY_STEPS: Array<{ en: string; ne: string }> = [
  { en: 'Move away from the riverbank and go to higher ground.', ne: 'नदी किनारबाट टाढा गई अग्लो ठाउँमा जानुहोस्।' },
  { en: 'Do not go to watch or film the flood. People have died doing this.', ne: 'बाढी हेर्न वा भिडियो खिच्न नजानुहोस्। यसै गर्दा मानिसको ज्यान गएको छ।' },
  { en: 'Do not cross a flooded road, bridge or stream, even on foot.', ne: 'डुबेको सडक, पुल वा खोला पैदल भए पनि नतर्नुहोस्।' },
  { en: 'Keep your phone charged and share your location with family.', ne: 'फोन चार्ज राख्नुहोस् र परिवारसँग आफ्नो स्थान बाँड्नुहोस्।' },
  { en: 'Boil or treat drinking water. Flood water spreads disease.', ne: 'खानेपानी उमालेर वा शुद्ध पारेर मात्र पिउनुहोस्। बाढीको पानीले रोग सार्छ।' },
];

function PhoneIcon() {
  return (
    <svg className="fl-phone" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24 11.4 11.4 0 0 0 3.6.58 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.4 11.4 0 0 0 .58 3.6 1 1 0 0 1-.25 1z"
        fill="currentColor"
      />
    </svg>
  );
}

function levelClass(level: string) {
  if (level === 'danger') return 'flood-lvl-danger';
  if (level === 'warning') return 'flood-lvl-warning';
  if (level === 'normal') return 'flood-lvl-normal';
  return 'flood-lvl-unknown';
}

function levelLabel(level: string, lang: Lang) {
  if (level === 'danger') return t('levelDanger', lang);
  if (level === 'warning') return t('levelWarning', lang);
  if (level === 'normal') return t('levelNormal', lang);
  return t('levelUnknown', lang);
}

function trendLabel(trend: string | null, lang: Lang) {
  const v = (trend || '').toUpperCase();
  if (v === 'RISING') return `↑ ${t('rising', lang)}`;
  if (v === 'FALLING') return `↓ ${t('falling', lang)}`;
  if (v === 'STEADY') return `→ ${t('steady', lang)}`;
  return null;
}

function ageLabel(minutes: number | null, lang: Lang) {
  if (minutes == null) return '—';
  if (minutes < 60) return lang === 'ne' ? `${minutes} मिनेट अघि` : `${minutes} min ago`;
  const h = Math.round(minutes / 60);
  if (h < 48) return lang === 'ne' ? `${h} घण्टा अघि` : `${h}h ago`;
  const d = Math.round(h / 24);
  return lang === 'ne' ? `${d} दिन अघि` : `${d}d ago`;
}

function CopyableAccount({ value, lang }: { value: string; lang: Lang }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="flood-acct"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          /* clipboard blocked — the number is selectable on the page anyway */
        }
      }}
    >
      <code>{value}</code>
      <span className="flood-acct-copy">{done ? t('copied', lang) : t('copy', lang)}</span>
    </button>
  );
}

export default function BhotekoshiFloodView() {
  const [lang, setLang] = useState<Lang>('en');
  const [data, setData] = useState<FloodDeskPayload | null>(null);
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [qrOpen, setQrOpen] = useState<{ src: string; payee: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/flood');
      if (res.ok) setData(await res.json());
    } catch (err) {
      console.error('[Flood panel] load failed', err);
    }
    try {
      const res = await fetch('/api/news?topic=flood&window=48h&limit=20&sourceCap=6');
      if (res.ok) {
        const j = await res.json();
        setNews(Array.isArray(j.items) ? j.items : []);
      }
    } catch {
      setNews([]);
    }
  }, []);

  useEffect(() => {
    load();
    // River gauges publish about every 10 minutes; keep the page current.
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  // Escape closes the QR lightbox.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && qrOpen) setQrOpen(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [qrOpen]);

  const site = data?.site;
  const gauges: FloodGauge[] = data?.river?.gauges || [];
  const liveGauges = gauges.filter(g => !g.stale);
  const staleGauges = gauges.filter(g => g.stale);
  const alerting = liveGauges.filter(g => g.level === 'danger' || g.level === 'warning').length;
  const photoGauges = gauges.filter(g => g.photo);

  const primaryFund = data?.bankAccounts?.funds?.[0] || null;
  // The bank the PMO appeal leads with, and the one with a decoded QR.
  const heroBank = primaryFund?.banks?.find((b) => b.qr) || null;
  const otherBanks = primaryFund ? primaryFund.banks.filter((b) => b !== heroBank) : [];
  const secondaryFunds = (data?.bankAccounts?.funds || []).slice(1);

  const L = (o: object | null | undefined, key: string): string => {
    if (!o) return '';
    const obj = o as Record<string, unknown>;
    const valNe = obj[`${key}_ne` as keyof typeof obj];
    const valEn = obj[`${key}_en` as keyof typeof obj];
    const val = lang === 'ne' ? valNe || valEn : valEn;
    return typeof val === 'string' ? val : '';
  };

  const LBody = (o: object | null | undefined): string[] => {
    if (!o) return [];
    const obj = o as Record<string, unknown>;
    const valNe = obj['body_ne' as keyof typeof obj];
    const valEn = obj['body_en' as keyof typeof obj];
    const val = lang === 'ne' ? valNe || valEn : valEn;
    return Array.isArray(val) ? (val as string[]) : [];
  };

  const BankRow = ({ bank, fundName }: { bank: FloodBank; fundName: string }) => (
    <tr>
      <th scope="row">
        {L(bank, 'name')}
        {bank.currency && <em>{bank.currency}</em>}
      </th>
      <td>
        {bank.accounts.map((a: string) => (
          <CopyableAccount key={a} value={a} lang={lang} />
        ))}
        {bank.swift && <span className="fl-swift">SWIFT {bank.swift}</span>}
      </td>
      <td className="fl-qr-cell">
        {bank.qr ? (
          <button onClick={() => setQrOpen({ src: bank.qr || '', payee: bank.qr_payee || fundName })}>
            <img src={bank.qr || undefined} alt="" loading="lazy" />
            <span>QR</span>
          </button>
        ) : (
          <span className="fl-qr-none" title={bank.qr_note_en ? L(bank, 'qr_note') : undefined}>—</span>
        )}
      </td>
    </tr>
  );

  return (
    <div className="fl">
      {/* Emergency rail */}
      <div className="fl-rail">
        <div className="fl-wrap fl-rail-in">
          <span className="fl-rail-tag">{t('emergency', lang)}</span>
          {(data?.helplines?.lines || []).filter((l) => l.primary).map((line) => (
            <a key={line.id} href={`tel:${line.number}`}>
              <b>{line.number}</b>{L(line, 'label')}
            </a>
          ))}
          <p>{site ? L(site, 'safety') : ''}</p>
        </div>
      </div>

      {/* Masthead */}
      <header className="fl-mast">
        <div className="fl-wrap">
          <div className="fl-mast-top">
            <Link href="/">&larr; {t('back', lang)}</Link>
            <div className="fl-lang">
              <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button>
              <button className={lang === 'ne' ? 'on' : ''} onClick={() => setLang('ne')}>नेपाली</button>
            </div>
          </div>
          <p className="fl-eyebrow">{site ? L(site, 'kicker') : ''}</p>
          <h1>{site ? L(site, 'brand') : t('title', lang)}</h1>
          <p className="fl-dateline">{site ? L(site, 'date_line') : ''}</p>
        </div>
      </header>

      {/* Toll */}
      {data?.keyFigures?.latest_reported?.items && data.keyFigures.latest_reported.items.length > 0 && (
        <div className="fl-toll">
          <div className="fl-wrap">
            <dl>
              {data.keyFigures.latest_reported.items.map((f, i) => (
                <div key={i} className={`t-${f.tone}`}>
                  <dd>{f.value.toLocaleString()}</dd>
                  <dt>{L(f, 'label')}</dt>
                  <small>{f.source}</small>
                </div>
              ))}
            </dl>
            <p className="fl-caveat">{L(data?.keyFigures, 'counts_conflict_note')}</p>
          </div>
        </div>
      )}

      <main className="fl-wrap">
        {/* ---- Donate ---- */}
        <section className="fl-sec">
          <div className="fl-sec-head">
            <span>{lang === 'ne' ? 'सहयोग' : 'Give'}</span>
            <h2>{t('donate', lang)}</h2>
          </div>

          <p className="fl-warn">
            {lang === 'ne'
              ? 'व्यक्तिगत QR वा व्यक्तिगत खातामा पैसा नपठाउनुहोस्। तल दिइएका सरकारी कोष र मान्यताप्राप्त संस्थामा मात्र सहयोग गर्नुहोस्।'
              : 'Do not send money to personal QR codes or personal accounts. Give only through the government funds and recognised organisations below.'}
          </p>

          {primaryFund && heroBank && (
            <div className="fl-hero">
              <button
                className="fl-hero-qr"
                onClick={() => setQrOpen({ src: heroBank.qr || '', payee: heroBank.qr_payee || L(primaryFund, 'name') })}
                aria-label={t('scanQr', lang)}
              >
                <img src={heroBank.qr || undefined} alt="" />
              </button>
              <div className="fl-hero-txt">
                <h3>{L(primaryFund, 'name')}</h3>
                <p className="fl-hero-bank">{L(heroBank, 'name')}</p>
                <p className="fl-hero-hint">{t('scanQr', lang)}</p>
                <span className="fl-lbl">{t('accountNo', lang)}</span>
                {heroBank.accounts.map((a: string) => (
                  <CopyableAccount key={a} value={a} lang={lang} />
                ))}
                {heroBank.swift && <span className="fl-swift">SWIFT {heroBank.swift}</span>}
              </div>
            </div>
          )}

          {primaryFund && otherBanks.length > 0 && (
            <>
              <h4 className="fl-minor">
                {lang === 'ne' ? 'सोही कोष · अन्य बैंक' : 'Same fund, other banks'}
              </h4>
              <table className="fl-banks">
                <tbody>
                  {otherBanks.map((b) => (
                    <BankRow key={b.id} bank={b} fundName={L(primaryFund, 'name')} />
                  ))}
                </tbody>
              </table>
            </>
          )}

          {secondaryFunds.map((fund) => (
            <React.Fragment key={fund.id}>
              <h4 className="fl-minor">{L(fund, 'name')}</h4>
              <table className="fl-banks">
                <tbody>
                  {fund.banks.map((b) => (
                    <BankRow key={b.id} bank={b} fundName={L(fund, 'name')} />
                  ))}
                </tbody>
              </table>
            </React.Fragment>
          ))}

          {data?.bankAccounts?.verification && (
            <p className="fl-note">
              {L(data.bankAccounts.verification, 'note')}{' '}
              <a href={data.bankAccounts.verification.source_url} target="_blank" rel="noopener noreferrer">
                {t('source', lang)} &#8599;
              </a>
            </p>
          )}

          <h4 className="fl-minor">{lang === 'ne' ? 'मान्यताप्राप्त संस्थाहरू' : 'Recognised organisations'}</h4>
          <ul className="fl-orgs">
            {(data?.funds || []).map((f) => (
              <li key={f.id}>
                <a href={f.url} target="_blank" rel="noopener noreferrer">
                  <strong>{f.name}</strong>
                  <span>{L(f, 'description')}</span>
                </a>
              </li>
            ))}
          </ul>
          <p className="fl-note">
            {lang === 'ne'
              ? 'एट्लसले कुनै रकम लिँदैन। हरेक लिंक सम्बन्धित संस्थाको आफ्नै दान पृष्ठमा जान्छ।'
              : 'Atlas never handles money. Every link goes to the organisation’s own donation page.'}
          </p>
        </section>

        {/* ---- Map + what happened ---- */}
        <section className="fl-sec">
          <div className="fl-sec-head">
            <span>{lang === 'ne' ? 'क्षेत्र' : 'Where'}</span>
            <h2>{t('mapTitle', lang)}</h2>
          </div>
          <div className="fl-split">
            <div>
              <FloodDistrictMap
                points={(data?.floodPath?.points || []).map((p) => ({
                  id: p.id,
                  name_en: p.name_en || '',
                  name_ne: p.name_ne || '',
                  lat: p.lat,
                  lng: p.lng,
                  status: p.status,
                }))}
                lang={lang}
              />
              <p className="fl-note">{t('mapHint', lang)}</p>
            </div>
            <div className="fl-prose">
              <h3>{t('whatHappened', lang)}</h3>
              {(LBody(data?.whatHappened) || []).map((para: string, i: number) => (
                <p key={i}>{para}</p>
              ))}
              {(data?.alerts?.alerts || []).map((a) => (
                <aside key={a.id} className={`fl-alert s-${a.severity}`}>
                  <strong>{L(a, 'title')}</strong>
                  <p>{L(a, 'body')}</p>
                  <a href={a.source_url} target="_blank" rel="noopener noreferrer">{a.source} &#8599;</a>
                </aside>
              ))}
              <p className="fl-note">
                {(data?.whatHappened?.sources || []).map((s, i) => (
                  <a key={i} href={s.url} target="_blank" rel="noopener noreferrer">{s.label} &#8599;</a>
                ))}
              </p>
            </div>
          </div>
        </section>

        {/* ---- News ---- */}
        <section className="fl-sec">
          <div className="fl-sec-head">
            <span>{lang === 'ne' ? 'तार' : 'Wire'}</span>
            <h2>{t('news', lang)}</h2>
            {news && news.length > 0 && <em>{news.length}</em>}
          </div>
          <div className="fl-wire">
            {news === null ? (
              <p className="fl-empty">{t('loading', lang)}</p>
            ) : news.length === 0 ? (
              <p className="fl-empty">{t('noNews', lang)}</p>
            ) : (
              news.map((n, i) => (
                <a key={i} href={n.link} target="_blank" rel="noopener noreferrer">
                  <time>{ageLabel(Math.round((Date.now() - new Date(n.pubDate).getTime()) / 60000), lang)}</time>
                  <p>{n.title}</p>
                  <cite>{n.source}</cite>
                </a>
              ))
            )}
          </div>
        </section>

        {/* ---- BIPAD live ---- */}
        <section className="fl-sec">
          <div className="fl-sec-head">
            <span>{lang === 'ne' ? 'प्रत्यक्ष' : 'Live'}</span>
            <h2>{t('liveTitle', lang)}</h2>
            {liveGauges.length > 0 && (
              <em className={alerting ? 'warn' : 'ok'}>
                {alerting > 0
                  ? lang === 'ne' ? `${alerting} सचेत तह माथि` : `${alerting} above warning`
                  : lang === 'ne' ? 'सबै सचेत तह मुनि' : 'all below warning'}
              </em>
            )}
          </div>
          <p className="fl-note">{t('riverHint', lang)}</p>

          {!data ? (
            <p className="fl-empty">{t('loading', lang)}</p>
          ) : data.river?.error ? (
            <p className="fl-empty">{t('unavailable', lang)}</p>
          ) : (
            <>
              <table className="fl-gauges">
                <thead>
                  <tr>
                    <th>{lang === 'ne' ? 'मापन केन्द्र' : 'Station'}</th>
                    <th className="num">{lang === 'ne' ? 'सतह' : 'Level'}</th>
                    <th>{lang === 'ne' ? 'खतरासँग तुलना' : 'Against danger mark'}</th>
                    <th className="num">{lang === 'ne' ? 'अद्यावधिक' : 'Updated'}</th>
                  </tr>
                </thead>
                <tbody>
                  {liveGauges.map(g => (
                    <tr key={g.id} className={levelClass(g.level)}>
                      <th scope="row">
                        {lang === 'ne' ? g.labelNe : g.label}
                        <em>{lang === 'ne' ? g.districtNe : g.district}</em>
                      </th>
                      <td className="num">
                        <b>{g.waterLevel != null ? g.waterLevel.toFixed(2) : '—'}</b>
                        <span>m</span>
                      </td>
                      <td>
                        <span className="fl-bar">
                          {g.percentOfDanger != null && <i style={{ width: `${Math.min(100, g.percentOfDanger)}%` }} />}
                        </span>
                        <small>
                          {levelLabel(g.level, lang)}
                          {g.warningLevel != null && ` · ${lang === 'ne' ? 'सचेत' : 'warn'} ${g.warningLevel}m`}
                          {g.dangerLevel != null && ` · ${lang === 'ne' ? 'खतरा' : 'danger'} ${g.dangerLevel}m`}
                        </small>
                      </td>
                      <td className="num">
                        {ageLabel(g.ageMinutes, lang)}
                        <span>{trendLabel(g.trend, lang)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {staleGauges.length > 0 && (
                <details className="fl-more">
                  <summary>
                    {lang === 'ne'
                      ? `${staleGauges.length} मापन केन्द्रले हालै तथ्यांक पठाएको छैन`
                      : `${staleGauges.length} gauges have not reported recently`}
                  </summary>
                  <p className="fl-note">{t('staleNote', lang)}</p>
                  <table className="fl-gauges">
                    <tbody>
                      {staleGauges.map(g => (
                        <tr key={g.id} className="flood-lvl-unknown">
                          <th scope="row">
                            {lang === 'ne' ? g.labelNe : g.label}
                            <em>{lang === 'ne' ? g.districtNe : g.district}</em>
                          </th>
                          <td className="num"><b>{g.waterLevel != null ? g.waterLevel.toFixed(2) : '—'}</b><span>m</span></td>
                          <td />
                          <td className="num">{ageLabel(g.ageMinutes, lang)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}

              {photoGauges.length > 0 && (
                <>
                  <h4 className="fl-minor">{t('stationPhotos', lang)}</h4>
                  <div className="fl-shots">
                    {photoGauges.map(g => (
                      <figure key={g.id}>
                        <img src={g.photo || undefined} alt={`${g.label} gauge station`} loading="lazy" />
                        <figcaption>{lang === 'ne' ? g.labelNe : g.label}</figcaption>
                      </figure>
                    ))}
                  </div>
                  <p className="fl-note">{t('photoNote', lang)}</p>
                </>
              )}

              <p className="fl-note">
                <a href="https://bipadportal.gov.np/" target="_blank" rel="noopener noreferrer">
                  {t('viewPortal', lang)} &#8599;
                </a>
              </p>
            </>
          )}
        </section>

        {/* ---- Where the water went ---- */}
        {data?.floodPath && (
          <section className="fl-sec">
            <div className="fl-sec-head">
              <span>{lang === 'ne' ? 'बाटो' : 'Course'}</span>
              <h2>{t('floodPathTitle', lang)}</h2>
            </div>
            <p className="fl-lead">{L(data.floodPath, 'lead')}</p>
            <div className="fl-prose"><p>{L(data.floodPath, 'body')}</p></div>
            <ol className="fl-course">
              {(data.floodPath.points || []).map((p) => (
                <li key={p.id}>
                  <h3>{L(p, 'name')}<em>{L(p, 'district')}</em></h3>
                  <p>{L(p, 'notes')}</p>
                </li>
              ))}
            </ol>
            <p className="fl-note">
              {(data.floodPath.sources || []).map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noopener noreferrer">{s.label} &#8599;</a>
              ))}
            </p>
          </section>
        )}

        {/* Official figures, collapsed */}
        {data?.keyFigures && (
          <details className="fl-more">
            <summary>{t('official', lang)} — {lang === 'ne' ? 'एनडीआरआरएमए / प्रहरी' : 'NDRRMA / Police'}</summary>
            <dl className="fl-official">
              {(data.keyFigures.figures || []).map((f) => (
                <div key={f.id} className={`t-${f.tone}`}>
                  <dd>{f.value.toLocaleString()}</dd>
                  <dt>{L(f, 'label')}</dt>
                  <small>{L(f, 'caption')}</small>
                </div>
              ))}
            </dl>
            <p className="fl-note">{L(data.keyFigures, 'preliminary_note')}</p>
            <p className="fl-note">
              {(data.keyFigures.sources || []).map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noopener noreferrer">{s.label} &#8599;</a>
              ))}
            </p>
          </details>
        )}

        {/* Helplines + safety */}
        <section className="fl-sec">
          <div className="fl-sec-head">
            <span>{lang === 'ne' ? 'सम्पर्क' : 'Contact'}</span>
            <h2>{t('callNow', lang)}</h2>
          </div>
          <p className="fl-note">{t('callHint', lang)}</p>

          {/* The three numbers that matter in an emergency get the weight.
              The rest are real but secondary, so they read as a reference row. */}
          <div className="fl-calls">
            {(data?.helplines?.lines || []).filter((l) => l.primary).map((line) => (
              <a key={line.id} href={`tel:${line.number}`}>
                <PhoneIcon />
                <b>{line.number}</b>
                <span>{L(line, 'label')}</span>
                <em>{t('tapToCall', lang)}</em>
              </a>
            ))}
          </div>

          {(data?.helplines?.lines || []).some((l) => !l.primary) && (
            <div className="fl-calls-more">
              {(data?.helplines?.lines || []).filter((l) => !l.primary).map((line) => (
                <a key={line.id} href={`tel:${line.number}`}>
                  <b>{line.number}</b>
                  <span>{L(line, 'label')}</span>
                </a>
              ))}
            </div>
          )}
          <h4 className="fl-minor">{t('safetyFirst', lang)}</h4>
          <ol className="fl-safety">
            {SAFETY_STEPS.map((s, i) => (
              <li key={i}>{s[lang]}</li>
            ))}
          </ol>
        </section>

        <footer className="fl-foot">
          {lang === 'ne'
            ? 'एट्लस निगरानी उपकरण हो, चेतावनी प्रणाली होइन। कदम चाल्नुअघि डीएचएम, एनडीआरआरएमए वा प्रहरीको आधिकारिक सूचना पुष्टि गर्नुहोस्।'
            : 'Atlas is a monitoring aid, not a warning system. Confirm with DHM, NDRRMA or the Police before acting.'}
        </footer>
      </main>

      {qrOpen && (
        <div className="fl-lightbox" onClick={() => setQrOpen(null)} role="dialog" aria-modal="true">
          <div onClick={e => e.stopPropagation()}>
            <img src={qrOpen.src} alt={`QR code for ${qrOpen.payee}`} />
            <p className="fl-payee">{qrOpen.payee}</p>
            <p className="fl-note">
              {lang === 'ne'
                ? 'स्क्यान गरेपछि भुक्तानी पाउने पक्षको नाम माथिको नामसँग मिल्छ कि मिल्दैन जाँच्नुहोस्।'
                : 'After scanning, check that the payee name your app shows matches the name above.'}
            </p>
            <button onClick={() => setQrOpen(null)}>{t('close', lang)}</button>
          </div>
        </div>
      )}
    </div>
  );
}
