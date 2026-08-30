'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import type { Lang } from '@/hooks/use-flood-lang';
import type {
  SitrepBreakdown,
  SitrepContent,
  SitrepNameList,
  SitrepValue,
  CorridorIncidents,
  CorridorTotals,
  FloodContent,
  RescuePortalStats,
  RescueSummary,
  PortalCount,
} from '@/types';
import { ageFrom } from '@/lib/relative-time';
import FloodReportedTiles, { ScrapedDot } from '@/app/bhotekoshi-flood/_components/FloodReportedTiles';

// The summary of everything, as it appears under the map on the overview.
//
// This component's real job is arithmetic hygiene. The figures it shows come
// from several bodies counting different populations at different hours, and
// they overlap: the tourist list and the official uncontacted figure describe
// some of the same people, the medical staff are not part of the security
// total, and the 14 in "14 helicopters" is aircraft, not survivors. Add any
// two of them together and you have invented casualties.
//
// So every group carries its own total, groups that must not be merged say so
// in the reader's own language, figures that sit outside a total are drawn
// apart from it, and if a hand-edited breakdown ever stops summing to its
// stated total the discrepancy is printed on the page rather than smoothed
// over.

const T = {
  tapHint: { en: 'Tap a figure for the split', ne: 'विवरणका लागि थिच्नुहोस्' },
  doNotMerge: { en: 'Do not add these together', ne: 'यी संख्या नजोड्नुहोस्' },
  notInTotal: { en: 'Counted separately, not in the total above', ne: 'छुट्टै गनिएको, माथिको जम्मामा छैन' },
  infrastructure: { en: 'Infrastructure damage', ne: 'भौतिक संरचना क्षति' },
  responseKicker: { en: 'Response', ne: 'प्रतिकार्य' },
  responseTitle: { en: 'Who is responding', ne: 'को-को खटिएका छन्' },
  peopleKicker: { en: 'People', ne: 'मानिस' },
  peopleTitle: { en: 'How the toll breaks down', ne: 'क्षतिको विवरण' },
  countedSeparately: { en: 'Counted separately', ne: 'छुट्टै गनिएको' },
  familiesCaption: {
    en: 'BIPAD’s corridor register, entered so far. Most incidents still have blank loss records — this is not a national displaced figure, and these rows are not added together.',
    ne: 'बिपद्को करिडोर अभिलेख, हालसम्म प्रविष्ट। अधिकांश घटनामा क्षति रेकर्ड अझै खाली छ — यो राष्ट्रिय विस्थापित संख्या होइन, र यी पङ्क्ति जोडिँदैनन्।',
  },
  familiesEvacuated: { en: 'Families evacuated', ne: 'स्थानान्तरित परिवार' },
  familiesAffected: { en: 'Families affected', ne: 'प्रभावित परिवार' },
  familiesRelocated: { en: 'Families relocated', ne: 'पुनर्स्थापित परिवार' },
  peopleAffected: { en: 'People affected', ne: 'प्रभावित व्यक्ति' },
  nameLists: { en: 'Published name lists', ne: 'प्रकाशित नामावली' },
  missingFound: { en: 'Missing and found', ne: 'हराएका र भेटिएका' },
  missing: { en: 'Reported missing', ne: 'हराएको जनाइएको' },
  found: { en: 'Reported found', ne: 'भेटिएको जनाइएको' },
  seeList: { en: 'See the names', ne: 'नाम हेर्नुहोस्' },
  people: { en: 'people', ne: 'जना' },
  asOf: { en: 'Figures as of', ne: 'तथ्यांक मिति' },
  sources: { en: 'Sources', ne: 'स्रोत' },
  discrepancy: {
    en: 'These figures no longer add up and have not been corrected yet. Treat the group totals as provisional.',
    ne: 'यी तथ्यांक मिल्दैनन् र अझै सच्याइएको छैन। समूहका जम्मा संख्यालाई अस्थायी मान्नुहोस्।',
  },
  whatHappened: { en: 'What happened', ne: 'के भयो' },
  portalTitle: { en: 'What the public is reporting', ne: 'जनताले गरेका रिपोर्ट' },
  portalIntro: {
    en: 'Filed by the public on the OPMCM rescue portal. These count reports, not people — one person is often reported by several relatives, and a family who finds someone rarely comes back to close the report. Read them as demand on the response, and do not add them to the figures above.',
    ne: 'प्रधानमन्त्री कार्यालयको उद्धार पोर्टलमा जनताले दर्ता गरेका विवरण। यी रिपोर्टको संख्या हो, व्यक्तिको होइन — एउटै व्यक्तिको लागि धेरै आफन्तले रिपोर्ट गर्न सक्छन्, र भेटिएपछि रिपोर्ट बन्द गर्न फर्किने कम हुन्छन्। यसलाई सहयोगको मागको सूचकका रूपमा हेर्नुहोस्, माथिको तथ्यांकमा नजोड्नुहोस्।',
  },
  portalRead: { en: 'Portal read', ne: 'पोर्टल पढिएको' },
  liveRead: { en: 'Read', ne: 'पढिएको' },
  reviewedAsOf: { en: 'Reviewed figures, as of', ne: 'जाँचिएका तथ्यांक, मिति' },
  noLiveFeed: {
    en: 'No portal publishes these as data, so they move only when the desk edits them.',
    ne: 'यी तथ्यांक कुनै पोर्टलले डेटाका रूपमा प्रकाशित गर्दैन, त्यसैले डेस्कले सम्पादन गर्दा मात्र परिवर्तन हुन्छन्।',
  },
  damageNote: {
    en: 'SitRep-3 still holds the 80 bridges and 40 km of paved road. Towers are NDRRMA 13 Bhadra 18:30. Houses are Copernicus EMSR927 — a mapped area of interest, not the national sitrep. None of this is BIPAD’s register, and these collections are not added together.',
    ne: 'सिटरेप-३ मा अझै ८० पुल र ४० कि.मी. पक्की सडक छन्। टावर एनडीआरआरएमए १३ भदौ १८:३० का हुन्। घर कोपर्निकस EMSR927 हुन् — नक्साको क्षेत्र, राष्ट्रिय सिटरेप होइन। यो बिपद्को अभिलेख होइन, र यी संकलन जोडिँदैनन्।',
  },
  portalOpenLost: { en: 'OPMCM portal, open reports', ne: 'प्रधानमन्त्री कार्यालय पोर्टल, खुला विवरण' },
  portalFound: { en: 'OPMCM portal, reported found', ne: 'प्रधानमन्त्री कार्यालय पोर्टल, भेटिएको जनाइएको' },
};

/** "13,248+" — the number, grouped, with any suffix the source published. */
function figure(value: number, suffix?: string): string {
  return `${value.toLocaleString()}${suffix || ''}`;
}

function label(item: { label_en?: string; label_ne?: string }, lang: Lang): string {
  return (lang === 'ne' ? item.label_ne || item.label_en : item.label_en) || '';
}

function ValueRow({ item, lang }: { item: SitrepValue; lang: Lang }) {
  const detail = lang === 'ne' ? item.detail_ne || item.detail_en : item.detail_en;
  const note = lang === 'ne' ? item.note_ne || item.note_en : item.note_en;
  const unit = lang === 'ne' ? item.unit_ne || item.unit_en : item.unit_en;
  return (
    <li>
      <span>
        {label(item, lang)}
        {item.live && <ScrapedDot lang={lang} />}
      </span>
      <b>
        {figure(item.value, item.suffix)}
        {unit ? ` ${unit}` : ''}
      </b>
      {(detail || note) && <small>{detail || note}</small>}
    </li>
  );
}

function BreakdownCard({ breakdown, lang }: { breakdown: SitrepBreakdown; lang: Lang }) {
  const [open, setOpen] = useState(false);
  const caption = lang === 'ne' ? breakdown.caption_ne || breakdown.caption_en : breakdown.caption_en;
  const warn = lang === 'ne' ? breakdown.do_not_merge_ne || breakdown.do_not_merge_en : breakdown.do_not_merge_en;

  return (
    <div className={`fl-fig t-${breakdown.tone} ${open ? 'open' : ''}${breakdown.live ? ' scraped' : ''}`}>
      <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open}>
        <dd>
          {figure(breakdown.total, breakdown.suffix)}
          {breakdown.live && <ScrapedDot lang={lang} />}
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

          {/* Figures the source keeps outside the total, drawn outside it too. */}
          {breakdown.aside && breakdown.aside.length > 0 && (
            <>
              <p className="fl-fig-aside-label">{T.notInTotal[lang]}</p>
              <ul className="fl-fig-list fl-fig-aside">
                {breakdown.aside.map((item, i) => (
                  <ValueRow key={i} item={item} lang={lang} />
                ))}
              </ul>
            </>
          )}

          {warn && (
            <p className="fl-fig-warn">
              <b>{T.doNotMerge[lang]}</b> {warn}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const PEOPLE_IDS = ['deaths', 'injured', 'uncontacted'];
const RESPONSE_IDS = ['deployed', 'air-rescue'];
const SEPARATE_IDS = ['police-treated', 'tourists', 'security-uncontacted', 'timure-customs'];

function pickBreakdowns(sitrep: SitrepContent, ids: string[]): SitrepBreakdown[] {
  const byId = new Map((sitrep.breakdowns || []).map(b => [b.id, b]));
  return ids.flatMap(id => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

/** BIPAD's family figures as one card, so evacuated sits with affected and relocated. */
function familiesCard(totals: CorridorTotals): SitrepBreakdown {
  const row = (
    value: number | null | undefined,
    label_en: string,
    label_ne: string,
    keepZero = false,
  ): SitrepValue[] =>
    value == null || (!keepZero && value === 0) ? [] : [{ value, label_en, label_ne }];

  return {
    id: 'families',
    total: totals.familiesEvacuated ?? 0,
    tone: 'warning',
    live: true,
    no_total_check: true,
    title_en: T.familiesEvacuated.en,
    title_ne: T.familiesEvacuated.ne,
    caption_en: T.familiesCaption.en,
    caption_ne: T.familiesCaption.ne,
    items: [
      ...row(totals.familiesEvacuated, T.familiesEvacuated.en, T.familiesEvacuated.ne, true),
      ...row(totals.familiesAffected, T.familiesAffected.en, T.familiesAffected.ne),
      ...row(totals.familiesRelocated, T.familiesRelocated.en, T.familiesRelocated.ne),
      ...row(totals.affected, T.peopleAffected.en, T.peopleAffected.ne),
    ],
  };
}

/**
 * The OPMCM portal's counters, drawn as the same expandable cards as the sitrep.
 *
 * Labels are the portal's own wording in both languages, so a reader who
 * follows the source link finds the identical phrase there. Three rules hold
 * this honest: a counter the portal did not publish is dropped rather than
 * printed as a zero, no card is built unless its headline total arrived, and
 * any card whose parts overlap says so and is exempt from reconciliation
 * rather than implying an arithmetic that does not hold.
 */
function portalBreakdowns(portal: RescuePortalStats): SitrepBreakdown[] {
  const row = (
    value: PortalCount,
    label_en: string,
    label_ne: string,
    detail?: { en: string; ne: string },
  ): SitrepValue[] =>
    value == null
      ? []
      : [{ value, label_en, label_ne, detail_en: detail?.en, detail_ne: detail?.ne }];

  const { requests, offers, persons } = portal;
  const cards: SitrepBreakdown[] = [];

  if (requests.total != null) {
    cards.push({
      id: 'portal-requests',
      total: requests.total,
      tone: 'warning',
      title_en: 'Total help requests',
      title_ne: 'कुल सहयोग अनुरोध',
      caption_en: 'Requests for help filed on the portal, by the state each one is in.',
      caption_ne: 'पोर्टलमा दर्ता भएका सहयोग अनुरोध, हाल कुन अवस्थामा छन् भन्ने आधारमा।',
      // "Critical" is a severity flag laid over the states, not a state.
      no_total_check: true,
      items: [
        ...row(requests.open, 'Open requests', 'खुला अनुरोध'),
        ...row(requests.critical, 'Critical requests', 'अति जरुरी अनुरोध', {
          en: 'A severity flag, not a state — these are also counted in the states above.',
          ne: 'यो जरुरीको स्तर हो, अवस्था होइन — यी माथिका अवस्थाहरूमा पनि गनिएका छन्।',
        }),
        ...row(requests.inProgress, 'In progress requests', 'कार्य भइरहेका अनुरोध'),
        ...row(requests.resolved, 'Resolved requests', 'समाधान भएका अनुरोध'),
        ...row(requests.cancelled, 'Cancelled requests', 'रद्द भएका अनुरोध'),
      ],
    });
  }

  if (offers.total != null) {
    cards.push({
      id: 'portal-offers',
      total: offers.total,
      tone: 'positive',
      title_en: 'Total help offers',
      title_ne: 'कुल सहयोग प्रस्ताव',
      caption_en: 'Help offered by volunteers, hospitals and organisations through the portal.',
      caption_ne: 'स्वयंसेवक, अस्पताल र संस्थाहरूले पोर्टलमार्फत गरेका सहयोगका प्रस्ताव।',
      items: [
        ...row(offers.available, 'Available help offers', 'उपलब्ध सहयोग प्रस्ताव'),
        ...row(offers.helping, 'Currently helping', 'हाल सहयोग गर्दै'),
        ...row(offers.completed, 'Completed', 'सम्पन्न'),
        ...row(offers.unavailable, 'Unavailable', 'अनुपलब्ध'),
      ],
    });
  }

  if (persons.lost != null) {
    cards.push({
      id: 'portal-missing',
      total: persons.lost,
      tone: 'critical',
      title_en: 'Lost people reported',
      title_ne: 'हराएका मानिस रिपोर्ट',
      caption_en:
        'Missing-person reports filed by families. The groups below overlap — a missing child is also an open report.',
      caption_ne:
        'परिवारले दर्ता गरेका हराएका व्यक्तिका रिपोर्ट। तलका समूह एकआपसमा मिल्छन् — हराएको बालबालिका खुला रिपोर्ट पनि हो।',
      no_total_check: true,
      items: [
        ...row(persons.lostOpen, 'Still missing', 'अझै हराइरहेका', {
          en: 'Reports nobody has closed. A family who finds their relative rarely comes back to say so, so this falls more slowly than the truth.',
          ne: 'बन्द नगरिएका रिपोर्ट। आफन्त भेटिएपछि रिपोर्ट बन्द गर्न फर्किने कम हुन्छन्, त्यसैले यो वास्तविकता भन्दा ढिलो घट्छ।',
        }),
        ...row(persons.childrenMissing, 'Children missing (under 18)', 'हराएका बालबालिका (१८ मुनि)'),
        ...row(persons.elderlyMissing, 'Elderly missing (60+)', 'हराएका ज्येष्ठ नागरिक (६०+)'),
        ...row(persons.last24h, 'Reported in the last 24 hours', 'पछिल्लो २४ घण्टामा रिपोर्ट', {
          en: 'Every person report filed in the past day — missing and found together.',
          ne: 'पछिल्लो एक दिनमा दर्ता भएका सबै व्यक्ति रिपोर्ट — हराएका र भेटिएका दुवै।',
        }),
      ],
    });
  }

  if (persons.found != null) {
    cards.push({
      id: 'portal-found',
      total: persons.found,
      tone: 'positive',
      title_en: 'Found people reported',
      title_ne: 'फेला परेका मानिस रिपोर्ट',
      caption_en: 'People reported found on the portal, and whether their family has been reached.',
      caption_ne: 'पोर्टलमा फेला परेको जनाइएका व्यक्ति, र परिवारसँग सम्पर्क भयो कि भएन।',
      items: [
        ...row(persons.foundOpen, 'Awaiting family', 'परिवारको प्रतीक्षामा'),
        ...row(persons.resolved, 'Reunited / resolved', 'भेट भयो / समाधान भयो'),
      ],
    });
  }

  return cards;
}

export default function FloodSummary({
  sitrep,
  lang,
  whatHappened,
  portal,
  corridor,
  rescueSummary,
  rescueFetchedAt,
}: {
  sitrep: SitrepContent;
  lang: Lang;
  whatHappened: FloodContent['whatHappened'] | null;
  portal?: RescuePortalStats | null;
  corridor?: CorridorIncidents | null;
  rescueSummary?: RescueSummary | null;
  rescueFetchedAt?: string | null;
}) {
  const t = (key: keyof typeof T) => T[key][lang];
  const nameLists = sitrep.name_lists;
  const missingFound = sitrep.missing_found;
  const infrastructure = sitrep.infrastructure;
  const discrepancies = sitrep.discrepancies || [];
  // A portal that failed its last read still has its previous figures behind
  // it; one that has never answered has nothing to draw.
  const portalCards = portal ? portalBreakdowns(portal) : [];
  const peopleCards = pickBreakdowns(sitrep, PEOPLE_IDS);
  const responseCards = [
    ...pickBreakdowns(sitrep, RESPONSE_IDS),
    ...(corridor?.totals ? [familiesCard(corridor.totals)] : []),
  ];
  const separateCards = pickBreakdowns(sitrep, SEPARATE_IDS);

  /**
   * The reviewed lists, with the one figure that has a live source replaced.
   *
   * Both list sections below are reviewed content, and both carried "NDRRMA
   * rescued: 529" — a figure typed in when it was true. The register those
   * cards link to now holds well over two thousand people, so the page was
   * contradicting itself one click apart. Where a row is the NDRRMA register
   * (`id: 'ndrrma'`), its value comes from the live register instead; every
   * other row has no live source and is shown exactly as reviewed.
   */
  const liveList = <T extends { id: string; value: number; live?: boolean }>(item: T): T => {
    if (item.id !== 'ndrrma' || rescueSummary?.total == null) return item;
    return { ...item, value: rescueSummary.total, live: true };
  };

  /**
   * The portal's own counters, as extra rows on the missing-and-found lists.
   *
   * Appended rather than merged into the reviewed rows: the OPMCM portal is a
   * separate collection from the forms and helplines listed beside it, the same
   * person can be filed in several of them, and the section's own warning is
   * that these are never added together. A pulse on the row marks the scrape
   * without writing "live" next to the label.
   */
  const portalRow = (
    id: string,
    value: number | null | undefined,
    label: { en: string; ne: string },
  ): SitrepNameList[] =>
    value == null
      ? []
      : [{
          id,
          value,
          label_en: label.en,
          label_ne: label.ne,
          live: true,
        }];

  /** The reviewed figures' own dateline and sources, printed under a section. */
  const ReviewedSource = ({ note }: { note?: boolean | 'damage' }) => (
    <p className="fl-note">
      {t('reviewedAsOf')}{' '}
      {(lang === 'ne' ? sitrep.as_of_label_ne || sitrep.as_of_label_en : sitrep.as_of_label_en) || '—'}
      {(sitrep.sources || []).map((src, i) => (
        <React.Fragment key={i}>
          {' · '}
          <a href={src.url} target="_blank" rel="noopener noreferrer">
            {src.label} &#8599;
          </a>
        </React.Fragment>
      ))}
      {note === 'damage' && <span className="fl-blank"> {t('damageNote')}</span>}
      {note === true && <span className="fl-blank"> {t('noLiveFeed')}</span>}
    </p>
  );

  const LBody = (o: { body_en?: string | string[]; body_ne?: string | string[] } | null | undefined): string[] => {
    if (!o) return [];
    const val = lang === 'ne' ? o.body_ne || o.body_en : o.body_en;
    return Array.isArray(val) ? (val as string[]) : [];
  };

  return (
    <>
      {/* If the arithmetic broke, the reader is told before they read a number. */}
      {discrepancies.length > 0 && (
        <aside className="fl-standfirst" role="alert">
          <span>{lang === 'ne' ? 'चेतावनी' : 'Warning'}</span>
          <p>
            {t('discrepancy')}{' '}
            {discrepancies.map(d => `${d.id}: ${d.stated} ≠ ${d.summed}`).join(' · ')}
          </p>
        </aside>
      )}

      {/* BIPAD's live register beside the reviewed damage record.
          Incident counts still come from the scrape. Deaths, uncontacted,
          injured, houses and bridges use the reviewed sitrep when it has
          them, because BIPAD stores unfilled loss as zeros. */}
      <section className="fl-sec">
        <div className="fl-split">
          <div>
            <FloodReportedTiles corridor={corridor} sitrep={sitrep} lang={lang} scope="headline" />

          </div>

          <div>
            {infrastructure?.items && infrastructure.items.length > 0 && (
              <>
                <div className="fl-sec-head">
                  <span>{lang === 'ne' ? 'संरचना' : 'Damage'}</span>
                  <h2>{lang === 'ne' ? infrastructure.title_ne || infrastructure.title_en : infrastructure.title_en}</h2>
                </div>
                <ul className="fl-fig-list fl-fig-wide">
                  {infrastructure.items.map((item, i) => (
                    <ValueRow key={i} item={item} lang={lang} />
                  ))}
                </ul>
                {/* These are deliberately NOT swapped for BIPAD's live counts.
                    BIPAD stores an unfilled loss record as zeros, and most of
                    this corridor's incidents are still awaiting figures — so
                    the live read says nought bridges destroyed where the
                    reviewed record says eighty. Printing that here would not be
                    fresher, it would be wrong. The entered-so-far figures sit
                    in the left column, under their own caveat. */}
                <ReviewedSource note="damage" />
              </>
            )}
          </div>
        </div>
      </section>

      {/* Personnel, air rescue and families — each group under its own total,
          so army/police/APF are not read as extra casualties and evacuated
          families are not mixed into the death toll. Tap a card for the split. */}
      {responseCards.length > 0 && (
        <section className="fl-sec">
          <div className="fl-sec-head">
            <span>{t('responseKicker')}</span>
            <h2>{t('responseTitle')}</h2>
          </div>
          <p className="fl-note">{t('tapHint')}</p>
          <div className="fl-figs">
            {responseCards.map(b => (
              <BreakdownCard key={b.id} breakdown={b} lang={lang} />
            ))}
          </div>
          <ReviewedSource />
        </section>
      )}

      {peopleCards.length > 0 && (
        <section className="fl-sec">
          <div className="fl-sec-head">
            <span>{t('peopleKicker')}</span>
            <h2>{t('peopleTitle')}</h2>
          </div>
          <p className="fl-note">{t('tapHint')}</p>
          <div className="fl-figs">
            {peopleCards.map(b => (
              <BreakdownCard key={b.id} breakdown={b} lang={lang} />
            ))}
          </div>
          {separateCards.length > 0 && (
            <>
              <h4 className="fl-minor">{t('countedSeparately')}</h4>
              <div className="fl-figs">
                {separateCards.map(b => (
                  <BreakdownCard key={b.id} breakdown={b} lang={lang} />
                ))}
              </div>
            </>
          )}
          <ReviewedSource />
        </section>
      )}

      {/* What the public filed, on its own full-width row.
          The portal counts reports rather than people, so its figures sit under
          their own heading with the caveat attached, never mixed into the
          figures above where a reader might sum across them. */}
      {portalCards.length > 0 && portal && (
        <section className="fl-sec">
          <div className="fl-portal fl-portal-wide">
                <div className="fl-sec-head">
                  <span>{lang === 'ne' ? 'पोर्टल' : 'Portal'}</span>
                  <h2>{t('portalTitle')}</h2>
                </div>
                <p className="fl-note">{t('portalIntro')}</p>

                <div className="fl-figs">
                  {portalCards.map(b => (
                    <BreakdownCard key={b.id} breakdown={b} lang={lang} />
                  ))}
                </div>

                <p className="fl-note">
                  {t('portalRead')} {ageFrom(portal.fetchedAt, lang)}
                  {' · '}
                  <a href={portal.source.url} target="_blank" rel="noopener noreferrer">
                    {portal.source.label} &#8599;
                  </a>
                </p>
              </div>
        </section>
      )}

      {/* Background and On the ground side-by-side in a grid */}
      {(whatHappened || (sitrep.notes && sitrep.notes.length > 0)) && (
        <section className="fl-sec">
          <div className="fl-split">
            <div>
              {whatHappened && (
                <>
                  <div className="fl-sec-head">
                    <span>{lang === 'ne' ? 'पृष्ठभूमि' : 'Background'}</span>
                    <h2>{t('whatHappened')}</h2>
                  </div>
                  <div className="fl-prose">
                    {LBody(whatHappened).map((para, i) => (
                      <p key={i}>{para}</p>
                    ))}
                  </div>
                  <p className="fl-note">
                    {(whatHappened.sources || []).map((s, i) => (
                      <a key={i} href={s.url} target="_blank" rel="noopener noreferrer">
                        {s.label} &#8599;
                      </a>
                    ))}
                  </p>
                </>
              )}
            </div>

            <div>
              {sitrep.notes && sitrep.notes.length > 0 && (
                <>
                  <div className="fl-sec-head">
                    <span>{lang === 'ne' ? 'ठाउँ' : 'On the ground'}</span>
                    <h2>{lang === 'ne' ? 'स्थानगत विवरण' : 'Place by place'}</h2>
                  </div>
                  <div className="fl-prose">
                    {sitrep.notes.map(note => (
                      <div key={note.id} className="fl-place-note">
                        <h3>{lang === 'ne' ? note.title_ne || note.title_en : note.title_en}</h3>
                        <p>{lang === 'ne' ? note.body_ne || note.body_en : note.body_en}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {nameLists?.lists && nameLists.lists.length > 0 && (
        <section className="fl-sec">
          <div className="fl-sec-head">
            <span>{lang === 'ne' ? 'नामावली' : 'Lists'}</span>
            <h2>{lang === 'ne' ? nameLists.title_ne || nameLists.title_en : nameLists.title_en}</h2>
            <em>{nameLists.lists.length}</em>
          </div>
          <div className="fl-listcards">
            {nameLists.lists.map(liveList).map(list => {
              const inner = (
                <>
                  <dd>{list.value.toLocaleString()}</dd>
                  <dt>
                    {label(list, lang)}
                    {list.live && <ScrapedDot lang={lang} />}
                  </dt>
                  <small>{t('people')}</small>
                </>
              );
              return list.href ? (
                <Link key={list.id} href={list.href} className="linked">
                  {inner}
                  <span className="fl-listcard-go">{t('seeList')} &rarr;</span>
                </Link>
              ) : (
                <div key={list.id}>{inner}</div>
              );
            })}
          </div>
          <p className="fl-fig-warn">
            <b>{t('doNotMerge')}</b>{' '}
            {lang === 'ne' ? nameLists.do_not_merge_ne || nameLists.do_not_merge_en : nameLists.do_not_merge_en}
          </p>
          {/* Two datelines, because these rows do not share one: the NDRRMA
              card is re-read every ten minutes, the rest move only on a
              content edit. */}
          {rescueSummary && (
            <p className="fl-note">
              {t('liveRead')} {ageFrom(rescueFetchedAt, lang)}
              {' · '}
              <a href="https://ndrrma.gov.np/np/rasuwa/rescue" target="_blank" rel="noopener noreferrer">
                NDRRMA &#8599;
              </a>
            </p>
          )}
          <ReviewedSource />
        </section>
      )}

      {missingFound && (
        <section className="fl-sec">
          <div className="fl-sec-head">
            <span>{lang === 'ne' ? 'खोजी' : 'Search'}</span>
            <h2>{lang === 'ne' ? missingFound.title_ne || missingFound.title_en : missingFound.title_en}</h2>
          </div>
          <div className="fl-split">
            <div>
              <h4 className="fl-minor">{t('missing')}</h4>
              <ul className="fl-fig-list">
                {[
                  ...(missingFound.missing || []),
                  ...portalRow('portal-lost', portal?.persons.lostOpen, T.portalOpenLost),
                ].map(item => (
                  <ValueRow key={item.id} item={item} lang={lang} />
                ))}
              </ul>
            </div>
            <div>
              <h4 className="fl-minor">
                {t('found')}
                {missingFound.found_total ? ` · ${missingFound.found_total.toLocaleString()}` : ''}
              </h4>
              <ul className="fl-fig-list">
                {[
                  ...(missingFound.found || []).map(liveList),
                  ...portalRow('portal-found', portal?.persons.found, T.portalFound),
                ].map(item => (
                  <ValueRow key={item.id} item={item} lang={lang} />
                ))}
              </ul>
            </div>
          </div>
          <p className="fl-fig-warn">
            <b>{t('doNotMerge')}</b>{' '}
            {lang === 'ne' ? missingFound.do_not_merge_ne || missingFound.do_not_merge_en : missingFound.do_not_merge_en}
          </p>
          {portal && (
            <p className="fl-note">
              {t('liveRead')} {ageFrom(portal.fetchedAt, lang)}
              {' · '}
              <a href={portal.source.url} target="_blank" rel="noopener noreferrer">
                {portal.source.label} &#8599;
              </a>
            </p>
          )}
          <ReviewedSource />
        </section>
      )}
    </>
  );
}
