'use client';

import React, { useEffect, useState } from 'react';
import FloodShell from '@/components/FloodShell';
import { useFloodLang } from '@/hooks/use-flood-lang';
import type { Lang } from '@/hooks/use-flood-lang';
import type { FloodBank, FloodDeskPayload } from '@/types';

// Giving, on its own page.
//
// It has a page to itself because the surrounding pressure is unusual: disaster
// fundraising fraud peaks in the first days, and a donor who has just read the
// death toll is in exactly the state of mind that a fake QR code is built for.
// So the warning leads, only reviewed government funds and recognised
// organisations appear, and the QR dialog tells the reader to check the payee
// name their own banking app shows before they confirm. Nothing on this page is
// auto-published — every account here came through a reviewed content edit.

const T = {
  kicker: { en: 'Give', ne: 'सहयोग' },
  title: { en: 'Give safely', ne: 'सुरक्षित रूपमा सहयोग गर्नुहोस्' },
  standfirst: {
    en: 'Atlas never handles money. Every account below is a government fund or a recognised organisation, and every link goes to their own page.',
    ne: 'एट्लसले कुनै रकम लिँदैन। तल दिइएका सबै खाता सरकारी कोष वा मान्यताप्राप्त संस्थाका हुन्, र हरेक लिंक तिनकै पृष्ठमा जान्छ।',
  },
  warn: {
    en: 'Do not send money to personal QR codes or personal accounts. Give only through the government funds and recognised organisations below.',
    ne: 'व्यक्तिगत QR वा व्यक्तिगत खातामा पैसा नपठाउनुहोस्। तल दिइएका सरकारी कोष र मान्यताप्राप्त संस्थामा मात्र सहयोग गर्नुहोस्।',
  },
  scanQr: { en: 'Scan this QR in your banking or wallet app', ne: 'आफ्नो बैंकिङ वा वालेट एपबाट यो QR स्क्यान गर्नुहोस्' },
  accountNo: { en: 'Account number', ne: 'खाता नम्बर' },
  copy: { en: 'Copy', ne: 'कपी' },
  copied: { en: 'Copied', ne: 'कपी भयो' },
  sameFund: { en: 'Same fund, other banks', ne: 'सोही कोष · अन्य बैंक' },
  orgs: { en: 'Recognised organisations', ne: 'मान्यताप्राप्त संस्थाहरू' },
  source: { en: 'Source', ne: 'स्रोत' },
  close: { en: 'Close', ne: 'बन्द' },
  checkPayee: {
    en: 'After scanning, check that the payee name your app shows matches the name above.',
    ne: 'स्क्यान गरेपछि भुक्तानी पाउने पक्षको नाम माथिको नामसँग मिल्छ कि मिल्दैन जाँच्नुहोस्।',
  },
  loading: { en: 'Loading…', ne: 'लोड हुँदै…' },
  cashTotal: { en: 'Relief cash total', ne: 'राहत रकम जम्मा' },
  foreignAid: { en: 'Foreign aid', ne: 'वैदेशिक सहयोग' },
  reliefGoods: { en: 'Relief goods', ne: 'राहत सामग्री' },
  aidFunds: { en: 'Funds', ne: 'कोष' },
  notPublished: { en: 'Not published', ne: 'प्रकाशित छैन' },
};

// The bulletin's aid figures, made readable without being restated.
//
// The source publishes these in Devanagari, sometimes as a bare number the
// page's own markup gives a unit to ("४७.५" plus a "टन" label), sometimes as a
// whole phrase carrying its own scale words ("रु. ४ अर्ब २४ करोड"). A unit
// appended to the second kind produced "रु. 4 अर्ब 24 करोड crore rupees" for
// English readers, so the unit is now added only to a figure that is a bare
// number, and scale words are transliterated rather than re-scaled — nothing
// here converts arba into crore or rupees into anything else.

const DEVA_DIGITS = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];

const SCALE_WORDS: Array<[RegExp, string]> = [
  [/रु\./g, 'Rs'],
  [/अर्ब/g, 'arba'],
  [/करोड/g, 'crore'],
  [/लाख/g, 'lakh'],
  [/हजार/g, 'thousand'],
  [/टन/g, 'tonnes'],
  [/मिलियन/g, 'million'],
];

const toEnDigits = (str: string) => str.replace(/[०-९]/g, d => String(DEVA_DIGITS.indexOf(d)));
const toNeDigits = (str: string) => str.replace(/[0-9]/g, d => DEVA_DIGITS[Number(d)]);

/** True when the value is only a number, so the caller's unit belongs on it. */
const isBareNumber = (value: string) => /^[\d०-९][\d०-९.,\s]*$/.test(value.trim());

function aidFigure(
  value: string | null | undefined,
  lang: Lang,
  suffix?: { en: string; ne: string },
): string | null {
  if (!value) return null;
  const bare = isBareNumber(value);
  if (lang === 'ne') {
    const ne = toNeDigits(value);
    return bare && suffix ? `${ne} ${suffix.ne}` : ne;
  }
  const en = SCALE_WORDS.reduce((acc, [word, word_en]) => acc.replace(word, word_en), toEnDigits(value)).replace(/\s+/g, ' ').trim();
  return bare && suffix ? `${en} ${suffix.en}` : en;
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
      <span className="flood-acct-copy">{done ? T.copied[lang] : T.copy[lang]}</span>
    </button>
  );
}

export default function FloodDonateView() {
  const [lang, setLang] = useFloodLang();
  const [data, setData] = useState<FloodDeskPayload | null>(null);
  const [qrOpen, setQrOpen] = useState<{ src: string; payee: string } | null>(null);
  const t = (key: keyof typeof T) => T[key][lang];

  useEffect(() => {
    let cancelled = false;
    fetch('/api/flood')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!cancelled && d) setData(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setQrOpen(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const L = (o: object | null | undefined, key: string): string => {
    if (!o) return '';
    const obj = o as Record<string, unknown>;
    const val = lang === 'ne' ? obj[`${key}_ne`] || obj[`${key}_en`] : obj[`${key}_en`];
    return typeof val === 'string' ? val : '';
  };

  const primaryFund = data?.bankAccounts?.funds?.[0] || null;
  const heroBank = primaryFund?.banks?.find(b => b.qr) || null;
  const otherBanks = primaryFund ? primaryFund.banks.filter(b => b !== heroBank) : [];
  const secondaryFunds = (data?.bankAccounts?.funds || []).slice(1);

  const BankRow = ({ bank, fundName }: { bank: FloodBank; fundName: string }) => (
    <tr>
      <th scope="row">
        {L(bank, 'name')}
        {bank.currency && <em>{bank.currency}</em>}
      </th>
      <td>
        {bank.accounts.map(a => (
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
          <span className="fl-qr-none">—</span>
        )}
      </td>
    </tr>
  );

  return (
    <FloodShell lang={lang} setLang={setLang} kicker={t('kicker')} title={t('title')} standfirst={t('standfirst')}>
      <section className="fl-sec">
        <p className="fl-warn">{t('warn')}</p>

        {/* The bulletin's headline aid figures, and only as far as it published
            them. A figure it stopped publishing reads "Not published" rather
            than falling back to the last number anyone hardcoded — on a page
            about money, a stale total is worse than an absent one. */}
        <div className="fl-donate-stats">
          {(() => {
            const stats = data?.bulletinRescue?.stats;
            const cash = aidFigure(stats?.cashTotal, lang);
            const goods = aidFigure(stats?.goodsTotal, lang, { en: 'tonnes', ne: 'टन' });
            const funds = aidFigure(stats?.fundsTotal, lang, { en: 'million USD', ne: 'मिलियन USD' });
            // Published as free Nepali text. Shown as written rather than
            // paired with a translation of whatever it used to say.
            const sub = stats?.aidSubtext || null;

            return (
              <>
                <div className="fl-stat-card">
                  <div className="fl-stat-card-title">{t('cashTotal')}</div>
                  <div className="fl-stat-card-value">{cash ?? t('notPublished')}</div>
                </div>

                <div className="fl-stat-card aid-card">
                  <div className="fl-stat-card-title">{t('foreignAid')}</div>
                  <div className="fl-stat-card-pair">
                    <span>{t('reliefGoods')}</span>
                    <strong>{goods ?? t('notPublished')}</strong>
                  </div>
                  <div className="fl-stat-card-pair">
                    <span>{t('aidFunds')}</span>
                    <strong>{funds ?? t('notPublished')}</strong>
                  </div>
                  {sub && <div className="fl-stat-card-sub">{sub}</div>}
                </div>
              </>
            );
          })()}
        </div>

        {!data ? (
          <p className="fl-empty">{t('loading')}</p>
        ) : (
          <>
            {primaryFund && heroBank && (
              <div className="fl-hero">
                <button
                  className="fl-hero-qr"
                  onClick={() => setQrOpen({ src: heroBank.qr || '', payee: heroBank.qr_payee || L(primaryFund, 'name') })}
                  aria-label={t('scanQr')}
                >
                  <img src={heroBank.qr || undefined} alt="" />
                </button>
                <div className="fl-hero-txt">
                  <h3>{L(primaryFund, 'name')}</h3>
                  <p className="fl-hero-bank">{L(heroBank, 'name')}</p>
                  <p className="fl-hero-hint">{t('scanQr')}</p>
                  <span className="fl-lbl">{t('accountNo')}</span>
                  {heroBank.accounts.map(a => (
                    <CopyableAccount key={a} value={a} lang={lang} />
                  ))}
                  {heroBank.swift && <span className="fl-swift">SWIFT {heroBank.swift}</span>}
                </div>
              </div>
            )}

            {primaryFund && otherBanks.length > 0 && (
              <>
                <h4 className="fl-minor">{t('sameFund')}</h4>
                <table className="fl-banks">
                  <tbody>
                    {otherBanks.map(b => (
                      <BankRow key={b.id} bank={b} fundName={L(primaryFund, 'name')} />
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {secondaryFunds.map(fund => (
              <React.Fragment key={fund.id}>
                <h4 className="fl-minor">{L(fund, 'name')}</h4>
                <table className="fl-banks">
                  <tbody>
                    {fund.banks.map(b => (
                      <BankRow key={b.id} bank={b} fundName={L(fund, 'name')} />
                    ))}
                  </tbody>
                </table>
              </React.Fragment>
            ))}

            {data.bankAccounts?.verification && (
              <p className="fl-note">
                {L(data.bankAccounts.verification, 'note')}{' '}
                <a href={data.bankAccounts.verification.source_url} target="_blank" rel="noopener noreferrer">
                  {t('source')} &#8599;
                </a>
              </p>
            )}

            <h4 className="fl-minor">{t('orgs')}</h4>
            <ul className="fl-orgs">
              {(data.funds || []).map(f => (
                <li key={f.id}>
                  <a href={f.url} target="_blank" rel="noopener noreferrer">
                    <strong>{f.name}</strong>
                    <span>{L(f, 'description')}</span>
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {qrOpen && (
        <div className="fl-lightbox" onClick={() => setQrOpen(null)} role="dialog" aria-modal="true">
          <div onClick={e => e.stopPropagation()}>
            <img src={qrOpen.src} alt={`QR code for ${qrOpen.payee}`} />
            <p className="fl-payee">{qrOpen.payee}</p>
            <p className="fl-note">{t('checkPayee')}</p>
            <button onClick={() => setQrOpen(null)}>{t('close')}</button>
          </div>
        </div>
      )}
    </FloodShell>
  );
}
