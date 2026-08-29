'use client';

import React, { useEffect, useState } from 'react';
import FloodShell from '@/components/FloodShell';
import { useFloodLang } from '@/hooks/use-flood-lang';
import type { Lang } from '@/hooks/use-flood-lang';
import type { FloodBank, FloodDeskPayload, FloodOfficialFeed, PortalDonationChannel } from '@/types';
import { ageFrom } from '@/lib/relative-time';
import { useDeskRefresh } from '@/hooks/use-desk-refresh';

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
  portalTitle: { en: 'Also listed by the government rescue portal', ne: 'सरकारी उद्धार पोर्टलमा सूचीकृत अन्य माध्यम' },
  portalHint: {
    en: 'Published live by the Office of the Prime Minister on rescue.opmcm.gov.np. These are read straight from that portal and are not part of the reviewed list above — check the payee name your own app shows before confirming any payment, and open the portal itself if anything looks wrong.',
    ne: 'प्रधानमन्त्री कार्यालयले rescue.opmcm.gov.np मा प्रत्यक्ष रूपमा प्रकाशित गरेको। यी सिधै त्यही पोर्टलबाट पढिएका हुन्, माथिको जाँचिएको सूचीको भाग होइनन् — भुक्तानी पक्का गर्नुअघि आफ्नै एपमा देखिने भुक्तानी पाउनेको नाम जाँच्नुहोस्, र शंका लागे पोर्टल आफैँ खोल्नुहोस्।',
  },
  portalRead: { en: 'Read', ne: 'पढिएको' },
  openPortal: { en: 'Open the portal', ne: 'पोर्टल खोल्नुहोस्' },
  wallet: { en: 'Wallet', ne: 'वालेट' },
  orgsVerified: { en: 'Organisations checked', ne: 'संस्था जाँचिएको' },
  orgsAgainst: { en: 'against', ne: 'स्रोत' },
};

/** "kathmandupost.com" — a source link the reader can recognise at a glance. */
function hostOf(url: string | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
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
  const [portal, setPortal] = useState<FloodOfficialFeed<PortalDonationChannel> | null>(null);
  const t = (key: keyof typeof T) => T[key][lang];

  // This page used to fetch once and never again, so a reader who left it open
  // kept whatever the portal was publishing when they arrived.
  useDeskRefresh(
    React.useCallback(() => {
      fetch('/api/flood')
        .then(r => (r.ok ? r.json() : null))
        .then(d => {
          if (d) setData(d);
        })
        .catch(() => {});
    }, []),
  );

  // The portal's own channels ride on their own route: the QR codes arrive as
  // inline images and would otherwise bloat the payload every desk page loads.
  useDeskRefresh(
    React.useCallback(() => {
      fetch('/api/flood/donations')
        .then(r => (r.ok ? r.json() : null))
        .then(d => {
          if (d) setPortal(d);
        })
        .catch(() => {});
    }, []),
  );

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

  /**
   * The portal's channels, minus the ones already in the table above.
   *
   * The OPMCM portal publishes the Prime Minister's fund bank by bank, and the
   * reviewed table lists the same nine banks — so the page was printing every
   * account twice, once hand-checked and once live, with no way for a reader to
   * tell they were the same account. Anything whose number is already shown is
   * dropped, and the reviewed row keeps the page because it is the verified one.
   *
   * Matching is on the digits alone: the portal writes a bank's two accounts as
   * "01013243801 / 02013243801" in one field, so each side is compared
   * separately and formatting differences cannot hide a duplicate.
   */
  const reviewedAccounts = new Set(
    (data?.bankAccounts?.funds || []).flatMap(f =>
      f.banks.flatMap(b => b.accounts.map(a => a.replace(/\D/g, ''))),
    ),
  );
  const portalChannels = (portal?.items || []).filter(channel => {
    const numbers = `${channel.accountNumber || ''} ${channel.walletId || ''}`
      .split(/[/,;]/)
      .map(n => n.replace(/\D/g, ''))
      .filter(Boolean);
    // A channel with no number at all — the portal's official QR — duplicates
    // nothing and stays.
    if (!numbers.length) return true;
    return !numbers.every(n => reviewedAccounts.has(n));
  });

  /**
   * Where the listed organisations were checked, and when.
   *
   * Each fund file carries its own verification source, and today all six point
   * at the same Kathmandu Post round-up — so the sources are de-duplicated and
   * the section prints one line rather than the same link six times. If a
   * future entry is checked somewhere else, its source appears alongside
   * automatically, which a single hardcoded line could not do.
   */
  const orgSources = [
    ...new Map(
      (data?.funds || [])
        .filter(f => f.source_verification_url)
        .map(f => [f.source_verification_url as string, f]),
    ).values(),
  ];
  const orgsVerifiedOn = (data?.funds || [])
    .map(f => f.last_verified)
    .filter((d): d is string => Boolean(d))
    .sort()
    .pop();

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

            {/* The portal's live listing, deliberately below the reviewed funds
                and never merged into them: everything above came through a
                content review, and this did not. */}
            {portalChannels.length > 0 && (
              <>
                <h4 className="fl-minor">{t('portalTitle')}</h4>
                <p className="fl-note">{t('portalHint')}</p>
                <table className="fl-banks fl-portal-banks">
                  <tbody>
                    {portalChannels.map(channel => {
                      const payee = channel.accountName || channel.organization || channel.title || '';
                      const qr = channel.qrData || channel.qrProxy;
                      return (
                        <tr key={channel.id}>
                          <th scope="row">
                            {channel.title || channel.organization}
                            {channel.bankName && <em>{channel.bankName}</em>}
                          </th>
                          <td>
                            {channel.accountName && <span className="fl-lbl">{channel.accountName}</span>}
                            {channel.accountNumber && <CopyableAccount value={channel.accountNumber} lang={lang} />}
                            {channel.walletId && (
                              <CopyableAccount value={channel.walletId} lang={lang} />
                            )}
                            {channel.walletName && !channel.walletId && (
                              <span className="fl-swift">
                                {t('wallet')} {channel.walletName}
                              </span>
                            )}
                            {channel.swiftCode && <span className="fl-swift">SWIFT {channel.swiftCode}</span>}
                            {channel.branch && <span className="fl-swift">{channel.branch}</span>}
                          </td>
                          <td className="fl-qr-cell">
                            {qr ? (
                              <button onClick={() => setQrOpen({ src: qr, payee })}>
                                <img src={qr} alt="" loading="lazy" />
                                <span>QR</span>
                              </button>
                            ) : (
                              <span className="fl-qr-none">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {portal && (
                  <p className="fl-note">
                    {t('portalRead')} {ageFrom(portal.fetchedAt, lang)}
                    {' · '}
                    <a href={portal.source.url} target="_blank" rel="noopener noreferrer">
                      {t('openPortal')} &#8599;
                    </a>
                  </p>
                )}
              </>
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
            {/* Provenance for the list, the same as every other section on the
                desk carries. On a giving page it matters more than most: a
                reader is about to send money to a name they were shown here,
                and is entitled to see who checked it and when. */}
            {(orgSources.length > 0 || orgsVerifiedOn) && (
              <p className="fl-note">
                {t('orgsVerified')}
                {orgsVerifiedOn ? ` ${orgsVerifiedOn}` : ''}
                {orgSources.length > 0 && (
                  <>
                    {` · ${t('orgsAgainst')} `}
                    {orgSources.map(f => (
                      <a
                        key={f.id}
                        href={f.source_verification_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {hostOf(f.source_verification_url)} &#8599;
                      </a>
                    ))}
                  </>
                )}
              </p>
            )}
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
