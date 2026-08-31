'use client';

import React, { useEffect, useState } from 'react';
import FloodShell from '@/components/FloodShell';
import { useFloodLang } from '@/hooks/use-flood-lang';
import type { Lang } from '@/hooks/use-flood-lang';
import type {
  FloodBank,
  FloodOfficialFeed,
  PortalDonationChannel,
  ReliefNeedItem,
  SitrepBreakdown,
  SitrepValue,
} from '@/types';
import { ageFrom } from '@/lib/relative-time';
import { useDonations } from '@/hooks/useFlood';
import { useJumpSection } from '@/hooks/use-jump-section';
import { useFloodDesk } from '@/app/bhotekoshi-flood/_components/FloodDeskProvider';
import FloodWarehouses from '@/app/bhotekoshi-flood/_components/FloodWarehouses';

// Giving, on its own page.
//
// It has a page to itself because the surrounding pressure is unusual: disaster
// fundraising fraud peaks in the first days, and a donor who has just read the
// death toll is in exactly the state of mind that a fake QR code is built for.
// So the warning leads, only reviewed government funds and recognised
// organisations appear, and the QR dialog tells the reader to check the payee
// name their own banking app shows before they confirm. Nothing on this page is
// auto-published — every account here came through a reviewed content edit.
//
// The three things a reader actually came for sit first, numbered, and linked
// from a jump strip: the authorized QR, what has reached that fund, and the
// in-kind demand list with the warehouses that will take goods.

const T = {
  kicker: { en: 'Give', ne: 'सहयोग' },
  emptyFunds: { en: 'Reviewed accounts are not on this build.', ne: 'जाँचिएका खाता यो निर्माणमा छैनन्।' },
  emptyFigures: { en: 'These figures are not on this build.', ne: 'यी तथ्यांक यो निर्माणमा छैनन्।' },
  title: { en: 'Give safely', ne: 'सुरक्षित रूपमा सहयोग गर्नुहोस्' },
  standfirst: {
    en: 'Three things, in that order: the authorized government QR, what has already reached that fund, and the goods NDRRMA is still asking for. Atlas never handles money.',
    ne: 'तीन कुरा, त्यही क्रममा: आधिकारिक सरकारी QR, त्यो कोषमा आइसकेको रकम, र एनडीआरआरएमए अझै मागिरहेको सामग्री। एट्लसले कुनै रकम लिँदैन।',
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
  jumpLabel: { en: 'On this page', ne: 'यस पृष्ठमा' },
  jumpHint: { en: 'Tap a box to jump', ne: 'जान बाकस थिच्नुहोस्' },
  jumpGive: { en: 'Give with the authorized QR', ne: 'आधिकारिक QR बाट सहयोग' },
  jumpGiveSub: { en: "Prime Minister's Disaster Relief Fund", ne: 'प्रधानमन्त्री दैवी प्रकोप उद्धार कोष' },
  jumpReceived: { en: 'What has reached the fund', ne: 'कोषमा आएको रकम' },
  jumpReceivedSub: { en: 'Cash already in the nine banks', ne: 'नौ बैंकमा आइसकेको नगद' },
  jumpNeeded: { en: 'Relief goods and warehouses', ne: 'राहत सामग्री र गोदाम' },
  jumpNeededSub: { en: 'Demand list · where to deliver', ne: 'माग सूची · कहाँ बुझाउने' },
  giveKicker: { en: '1 · Give', ne: '१ · सहयोग' },
  giveTitle: { en: 'Authorized QR', ne: 'आधिकारिक QR' },
  authorized: { en: 'Government of Nepal', ne: 'नेपाल सरकार' },
  authorizedBadge: { en: 'Authorized government fund', ne: 'आधिकारिक सरकारी कोष' },
  receivedKicker: { en: '2 · Received', ne: '२ · प्राप्त' },
  receivedTitle: { en: 'What has reached the Prime Minister’s fund', ne: 'प्रधानमन्त्री कोषमा आएको रकम' },
  receivedIntro: {
    en: 'Balances the Ministry of Finance published for the Prime Minister’s Disaster Relief Fund, nine banks, 12 Bhadra. This is cash already in those accounts — not a pledge, and not Atlas. Give through the accounts above.',
    ne: 'अर्थ मन्त्रालयले प्रधानमन्त्री दैवी प्रकोप उद्धार कोषका नौ बैंकमा १२ भदौ प्रकाशित गरेको मौज्दात। यो ती खातामा आइसकेको नगद हो — घोषणा होइन, एट्लस होइन। माथिका खातामार्फत सहयोग गर्नुहोस्।',
  },
  receivedAsOf: { en: 'Figures as of', ne: 'तथ्यांक मिति' },
  doNotAdd: { en: 'Do not add these together', ne: 'यी संख्या नजोड्नुहोस्' },
  receivedWarn: {
    en: 'The amount already in the fund before the flood is inside the 6.55 billion, not on top of it. Foreign pledges, the World Bank package and in-kind cargo are not this fund.',
    ne: 'विपद्अघिको मौज्दात ६ अर्ब ५५ करोडभित्र छ, माथि होइन। वैदेशिक घोषणा, विश्व बैंक प्याकेज र सामग्री यो कोष होइनन्।',
  },
  notInRupee: { en: 'Counted separately, not in the rupee total', ne: 'छुट्टै गनिएको, नेपाली जम्मामा छैन' },
  notInFund: { en: 'Not in the Prime Minister’s fund', ne: 'प्रधानमन्त्री कोषमा होइन' },
  discrepancy: {
    en: 'These figures no longer add up and have not been corrected yet. Treat the group totals as provisional.',
    ne: 'यी तथ्यांक मिल्दैनन् र अझै सच्याइएको छैन। समूहका जम्मा संख्यालाई अस्थायी मान्नुहोस्।',
  },
  neededKicker: { en: '3 · Goods', ne: '३ · सामग्री' },
  neededTitle: { en: 'Relief goods needed and emergency warehouses', ne: 'राहत सामग्री आवश्यक र आपत्कालीन गोदाम' },
  neededIntro: {
    en: 'NDRRMA SitRep #06 demand list. This is what is still asked for — not cargo already sent, and not the cash in the Prime Minister’s fund.',
    ne: 'एनडीआरआरएमए सिटरेप #०६ को माग सूची। पठाइएको सामग्री होइन, प्रधानमन्त्री कोषको नगद पनि होइन।',
  },
  neededWarn: {
    en: 'Do not add these quantities onto the Rs 6.55 billion. The list will be updated as NDRRMA republishes it.',
    ne: 'यी परिमाण ६ अर्ब ५५ करोडमाथि नजोड्नुहोस्। एनडीआरआरएमए नयाँ सूची निकालेपछि यो अद्यावधिक हुनेछ।',
  },
  warehousesTitle: { en: 'Emergency warehouses', ne: 'आपत्कालीन गोदाम' },
  warehousesIntro: {
    en: 'In-kind goods can be handed in here. Tap a number to call.',
    ne: 'सामग्री यहाँ बुझाउन सकिन्छ। फोन गर्न नम्बर थिच्नुहोस्।',
  },
  needScroll: { en: 'Scroll the list', ne: 'सूची स्क्रोल गर्नुहोस्' },
  needPackNote: {
    en: 'Grey notes are pack size or product weight from the sitrep, not extra items. Dal is published as 8,693 — one off the 8,692 households.',
    ne: 'खैरो नोट सिटरेपको प्याक वा तौल हो, थप सामग्री होइन। दाल ८,६९३ छ — परिवार ८,६९२ भन्दा एक बढी।',
  },
  otherWays: { en: 'Other ways to give', ne: 'सहयोगका अन्य माध्यम' },
  notListed: { en: 'Not listed', ne: 'नखुलेको' },
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

/** NPR in the grouping the source published; other currencies as written internationally. */
function amount(value: number, unit?: string): string {
  const npr = unit === 'NPR' || unit === 'रु.';
  if (npr && value >= 1_000_000_000 && value % 1_000_000_000 === 0) {
    return `${(value / 1_000_000_000).toLocaleString('en-IN')} bn`;
  }
  return value.toLocaleString(npr ? 'en-IN' : 'en-US', {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
  });
}

/** Short label that sits in front of the figure so the unit is not missed. */
function unitPrefix(unit?: string): string {
  if (!unit) return '';
  if (unit === 'NPR') return 'Rs';
  if (unit === 'tonnes') return 't';
  return unit;
}

function money(value: number, unit?: string): string {
  const n = amount(value, unit);
  const prefix = unitPrefix(unit);
  return prefix ? `${prefix} ${n}` : n;
}

function Figure({ value, unit }: { value: number; unit?: string }) {
  const prefix = unitPrefix(unit);
  return (
    <>
      {prefix ? <em>{prefix} </em> : null}
      {amount(value, unit)}
    </>
  );
}

function itemLabel(item: { label_en?: string; label_ne?: string }, lang: Lang): string {
  return (lang === 'ne' ? item.label_ne || item.label_en : item.label_en) || '';
}

function ValueRow({ item, lang }: { item: SitrepValue; lang: Lang }) {
  const detail = lang === 'ne' ? item.detail_ne || item.detail_en : item.detail_en;
  const unit = lang === 'ne' ? item.unit_ne || item.unit_en : item.unit_en;
  return (
    <li>
      <span>{itemLabel(item, lang)}</span>
      <b>{money(item.value, unit)}</b>
      {detail && <small>{detail}</small>}
    </li>
  );
}

function NeedRow({ item, lang }: { item: ReliefNeedItem; lang: Lang }) {
  const detail = lang === 'ne' ? item.detail_ne || item.detail_en : item.detail_en;
  const unit = lang === 'ne' ? item.unit_ne || item.unit_en : item.unit_en;
  const qty = item.unspecified
    ? T.notListed[lang]
    : `${(item.value ?? 0).toLocaleString('en-IN')}${unit ? ` ${unit}` : ''}`;
  return (
    <li>
      <span>{itemLabel(item, lang)}</span>
      <b>
        {qty}
        {detail ? <small>{detail}</small> : null}
      </b>
    </li>
  );
}

function BreakdownCard({ breakdown, lang }: { breakdown: SitrepBreakdown; lang: Lang }) {
  const [open, setOpen] = useState(false);
  const caption = lang === 'ne' ? breakdown.caption_ne || breakdown.caption_en : breakdown.caption_en;
  const warn = lang === 'ne' ? breakdown.do_not_merge_ne || breakdown.do_not_merge_en : breakdown.do_not_merge_en;
  const unit = breakdown.items[0] && (lang === 'ne' ? breakdown.items[0].unit_ne || breakdown.items[0].unit_en : breakdown.items[0].unit_en);

  return (
    <div className={`fl-fig t-${breakdown.tone} ${open ? 'open' : ''}`}>
      <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open}>
        <dd>
          <Figure value={breakdown.total} unit={unit} />
        </dd>
        <dt>
          {lang === 'ne' ? breakdown.title_ne || breakdown.title_en : breakdown.title_en}
          <i aria-hidden="true">{open ? '−' : '+'}</i>
        </dt>
      </button>
      {open && (
        <div className="fl-fig-body">
          {caption && <p className="fl-fig-cap">{caption}</p>}
          <ul className="fl-fig-list">
            {breakdown.items.map((item, i) => (
              <ValueRow key={i} item={item} lang={lang} />
            ))}
          </ul>
          {breakdown.aside && breakdown.aside.length > 0 && (
            <>
              <p className="fl-fig-aside-label">{T.notInRupee[lang]}</p>
              <ul className="fl-fig-list fl-fig-aside">
                {breakdown.aside.map((item, i) => (
                  <ValueRow key={i} item={item} lang={lang} />
                ))}
              </ul>
            </>
          )}
          {warn && (
            <p className="fl-fig-warn">
              <b>{T.doNotAdd[lang]}</b> {warn}
            </p>
          )}
        </div>
      )}
    </div>
  );
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
  const { desk: data } = useFloodDesk();
  const [qrOpen, setQrOpen] = useState<{ src: string; payee: string } | null>(null);
  // The portal's own channels ride on their own route: the QR codes arrive as
  // inline images and would otherwise bloat the payload every desk page loads.
  const { data: portal = null } = useDonations();
  const t = (key: keyof typeof T) => T[key][lang];

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

  const onJump = useJumpSection(['give', 'received', 'needed']);

  const primaryFund = data?.bankAccounts?.funds?.[0] || null;
  const heroBank = primaryFund?.banks?.find(b => b.qr) || null;
  const otherBanks = primaryFund ? primaryFund.banks.filter(b => b !== heroBank) : [];
  const secondaryFunds = (data?.bankAccounts?.funds || []).slice(1);
  const received = data?.reliefReceived;
  const needed = data?.reliefNeeded;
  const pmInFund = received?.headline?.find(h => h.id === 'pm-fund');
  const needHouseholds = needed?.headline?.find(h => h.id === 'households');

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
      <nav className="fl-jump" aria-label={t('jumpLabel')}>
        <p className="fl-jump-kicker">{t('jumpHint')}</p>
        <a href="#give" className={onJump === 'give' ? 'on' : undefined}>
          <b>1</b>
          <strong>{t('jumpGive')}</strong>
          <span>{t('jumpGiveSub')}</span>
        </a>
        <a href="#received" className={onJump === 'received' ? 'on' : undefined}>
          <b>2</b>
          <strong>{t('jumpReceived')}</strong>
          <span>
            {pmInFund
              ? `${money(pmInFund.value, lang === 'ne' ? pmInFund.unit_ne || pmInFund.unit_en : pmInFund.unit_en)} · ${t('jumpReceivedSub')}`
              : t('jumpReceivedSub')}
          </span>
        </a>
        <a href="#needed" className={onJump === 'needed' ? 'on' : undefined}>
          <b>3</b>
          <strong>{t('jumpNeeded')}</strong>
          <span>
            {needHouseholds
              ? `${needHouseholds.value.toLocaleString('en-IN')} ${lang === 'ne' ? 'परिवार' : 'households'} · ${t('jumpNeededSub')}`
              : t('jumpNeededSub')}
          </span>
        </a>
      </nav>

      <section id="give" className="fl-sec">
        <div className="fl-sec-head">
          <span>{t('giveKicker')}</span>
          <h2>{t('giveTitle')}</h2>
          <em className="ok">{t('authorized')}</em>
        </div>

        {!primaryFund ? (
          <p className="fl-empty">{t('emptyFunds')}</p>
        ) : (
          <>
            {primaryFund && heroBank && (
              <div className="fl-hero">
                <div className="fl-hero-qr-wrap">
                  <button
                    className="fl-hero-qr"
                    onClick={() => setQrOpen({ src: heroBank.qr || '', payee: heroBank.qr_payee || L(primaryFund, 'name') })}
                    aria-label={t('scanQr')}
                  >
                    <img src={heroBank.qr || undefined} alt="" />
                  </button>
                  <p className="fl-hero-scan">{t('scanQr')}</p>
                </div>
                <div className="fl-hero-txt">
                  <em className="fl-hero-badge">{t('authorizedBadge')}</em>
                  <h3>{L(primaryFund, 'name')}</h3>
                  <p className="fl-hero-bank">{L(heroBank, 'name')}</p>
                  <span className="fl-lbl">{t('accountNo')}</span>
                  {heroBank.accounts.map(a => (
                    <CopyableAccount key={a} value={a} lang={lang} />
                  ))}
                  {heroBank.swift && <span className="fl-swift">SWIFT {heroBank.swift}</span>}
                </div>
              </div>
            )}
            <p className="fl-warn">{t('warn')}</p>

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
          </>
        )}
      </section>

      <section id="received" className="fl-sec fl-received">
        <div className="fl-sec-head">
          <span>{t('receivedKicker')}</span>
          <h2>{t('receivedTitle')}</h2>
        </div>
        {!received ? (
          <p className="fl-empty">{t('emptyFigures')}</p>
        ) : (
          <>
            {(received.discrepancies || []).length > 0 && (
              <aside className="fl-standfirst" role="alert">
                <span>{lang === 'ne' ? 'चेतावनी' : 'Warning'}</span>
                <p>
                  {t('discrepancy')}{' '}
                  {received.discrepancies!.map(d => `${d.id}: ${d.stated} ≠ ${d.summed}`).join(' · ')}
                </p>
              </aside>
            )}
            <p className="fl-note">{t('receivedIntro')}</p>
            {received.headline && received.headline.length > 0 && (
              <div className="fl-tiles">
                {received.headline.map(h => {
                  const unit = lang === 'ne' ? h.unit_ne || h.unit_en : h.unit_en;
                  return (
                    <div key={h.id} className={`t-${h.tone}`}>
                      <dd>
                        <Figure value={h.value} unit={unit} />
                      </dd>
                      <dt>{lang === 'ne' ? h.label_ne || h.label_en : h.label_en}</dt>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="fl-fig-warn">
              <b>{t('doNotAdd')}</b> {t('receivedWarn')}
            </p>
            {received.breakdowns && received.breakdowns.length > 0 && (
              <div className="fl-figs">
                {received.breakdowns.map(b => (
                  <BreakdownCard key={b.id} breakdown={b} lang={lang} />
                ))}
              </div>
            )}
            {received.exclusive && received.exclusive.length > 0 && (
              <>
                <h4 className="fl-minor">{t('notInFund')}</h4>
                <div className="fl-listcards">
                  {received.exclusive.map(item => {
                    const unit = lang === 'ne' ? item.unit_ne || item.unit_en : item.unit_en;
                    const detail = lang === 'ne' ? item.detail_ne || item.detail_en : item.detail_en;
                    return (
                      <div key={item.id || item.label_en}>
                        <dd>
                          <Figure value={item.value} unit={unit} />
                        </dd>
                        <dt>{itemLabel(item, lang)}</dt>
                        {detail && <small>{detail}</small>}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            <p className="fl-note">
              {t('receivedAsOf')}{' '}
              {(lang === 'ne' ? received.as_of_label_ne || received.as_of_label_en : received.as_of_label_en) || '—'}
              {(received.sources || []).map((src, i) => (
                <a key={i} href={src.url} target="_blank" rel="noopener noreferrer">
                  {' · '}
                  {src.label} &#8599;
                </a>
              ))}
            </p>
          </>
        )}
      </section>

      <section id="needed" className="fl-sec fl-needed">
        <div className="fl-sec-head">
          <span>{t('neededKicker')}</span>
          <h2>{t('neededTitle')}</h2>
        </div>
        {!needed ? (
          <p className="fl-empty">{t('emptyFigures')}</p>
        ) : (
          <>
            <p className="fl-note">{t('neededIntro')}</p>
            {needed.headline && needed.headline.length > 0 && (
              <div className="fl-tiles">
                {needed.headline.map(h => (
                  <div key={h.id} className={`t-${h.tone}`}>
                    <dd>
                      <Figure value={h.value} />
                    </dd>
                    <dt>{lang === 'ne' ? h.label_ne || h.label_en : h.label_en}</dt>
                  </div>
                ))}
              </div>
            )}
            <p className="fl-fig-warn">
              <b>{t('doNotAdd')}</b> {t('neededWarn')}
            </p>
            <p className="fl-need-scroll-hint">{t('needScroll')}</p>
            <div className="fl-need-groups" tabIndex={0} aria-label={t('needScroll')}>
              {(needed.groups || []).map(group => (
                <div key={group.id} className="fl-need-group">
                  <h3>{lang === 'ne' ? group.title_ne || group.title_en : group.title_en}</h3>
                  <ul className="fl-fig-list">
                    {group.items.map(item => (
                      <NeedRow key={item.id} item={item} lang={lang} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="fl-note">{t('needPackNote')}</p>
            <div id="warehouses" className="fl-wh-block">
              <div className="fl-sec-head">
                <span>{lang === 'ne' ? 'बुझाउने' : 'Drop-off'}</span>
                <h3>{t('warehousesTitle')}</h3>
                <em>{(needed.warehouses || []).length}</em>
              </div>
              <p className="fl-note">{t('warehousesIntro')}</p>
              <FloodWarehouses warehouses={needed.warehouses || []} lang={lang} />
              <p className="fl-note">{L(needed, 'warehouse_note')}</p>
            </div>
            <p className="fl-note">
              {t('receivedAsOf')}{' '}
              {(lang === 'ne' ? needed.as_of_label_ne || needed.as_of_label_en : needed.as_of_label_en) || '—'}
              {(needed.sources || []).map((src, i) => (
                <a key={i} href={src.url} target="_blank" rel="noopener noreferrer">
                  {' · '}
                  {src.label} &#8599;
                </a>
              ))}
            </p>
          </>
        )}
      </section>

      <section className="fl-sec">
        <div className="fl-sec-head">
          <span>{lang === 'ne' ? 'अन्य' : 'Also'}</span>
          <h2>{t('otherWays')}</h2>
        </div>
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
                            {channel.walletId && <CopyableAccount value={channel.walletId} lang={lang} />}
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
            {(orgSources.length > 0 || orgsVerifiedOn) && (
              <p className="fl-note">
                {t('orgsVerified')}
                {orgsVerifiedOn ? ` ${orgsVerifiedOn}` : ''}
                {orgSources.length > 0 && (
                  <>
                    {` · ${t('orgsAgainst')} `}
                    {orgSources.map(f => (
                      <a key={f.id} href={f.source_verification_url} target="_blank" rel="noopener noreferrer">
                        {hostOf(f.source_verification_url)} &#8599;
                      </a>
                    ))}
                  </>
                )}
              </p>
            )}
      </section>

      {qrOpen && (
        <div className="fl-lightbox" onClick={() => setQrOpen(null)} role="dialog" aria-modal="true">
          <div onClick={e => e.stopPropagation()}>
            <img src={qrOpen.src} alt={`QR code for ${qrOpen.payee}`} />
            <p className="fl-payee">{qrOpen.payee}</p>
            <p className="fl-hero-scan">{t('scanQr')}</p>
            <p className="fl-note">{t('checkPayee')}</p>
            <button onClick={() => setQrOpen(null)}>{t('close')}</button>
          </div>
        </div>
      )}
    </FloodShell>
  );
}
