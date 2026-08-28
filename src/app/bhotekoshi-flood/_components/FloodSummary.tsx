'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import type { Lang } from '@/hooks/use-flood-lang';
import type { SitrepBreakdown, SitrepContent, SitrepValue, FloodContent } from '@/types';

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
  tapHint: { en: 'Tap a figure for the district split', ne: 'जिल्लागत विवरणका लागि थिच्नुहोस्' },
  doNotMerge: { en: 'Do not add these together', ne: 'यी संख्या नजोड्नुहोस्' },
  notInTotal: { en: 'Counted separately, not in the total above', ne: 'छुट्टै गनिएको, माथिको जम्मामा छैन' },
  infrastructure: { en: 'Infrastructure damage', ne: 'भौतिक संरचना क्षति' },
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
      <span>{label(item, lang)}</span>
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
    <div className={`fl-fig t-${breakdown.tone} ${open ? 'open' : ''}`}>
      <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open}>
        <dd>{figure(breakdown.total, breakdown.suffix)}</dd>
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

export default function FloodSummary({
  sitrep,
  lang,
  whatHappened,
}: {
  sitrep: SitrepContent;
  lang: Lang;
  whatHappened: FloodContent['whatHappened'] | null;
}) {
  const t = (key: keyof typeof T) => T[key][lang];
  const breakdowns = sitrep.breakdowns || [];
  const nameLists = sitrep.name_lists;
  const missingFound = sitrep.missing_found;
  const infrastructure = sitrep.infrastructure;
  const discrepancies = sitrep.discrepancies || [];

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

      {/* Toll and Damage side-by-side in a grid */}
      <section className="fl-sec">
        <div className="fl-split">
          <div>
            <div className="fl-sec-head">
              <span>{lang === 'ne' ? 'अवस्था' : 'Toll'}</span>
              <h2>{lang === 'ne' ? 'अहिलेसम्मको तथ्यांक' : 'Where things stand'}</h2>
            </div>
            <p className="fl-note">{t('tapHint')}</p>

            <div className="fl-figs">
              {breakdowns.map(b => (
                <BreakdownCard key={b.id} breakdown={b} lang={lang} />
              ))}
            </div>

            <p className="fl-note">
              {t('asOf')}{' '}
              {(lang === 'ne' ? sitrep.as_of_label_ne || sitrep.as_of_label_en : sitrep.as_of_label_en) || '—'}
              {' · '}
              {(sitrep.sources || []).map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.label} &#8599;
                </a>
              ))}
            </p>
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
              </>
            )}
          </div>
        </div>
      </section>

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
            {nameLists.lists.map(list => {
              const inner = (
                <>
                  <dd>{list.value.toLocaleString()}</dd>
                  <dt>{label(list, lang)}</dt>
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
                {(missingFound.missing || []).map(item => (
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
                {(missingFound.found || []).map(item => (
                  <ValueRow key={item.id} item={item} lang={lang} />
                ))}
              </ul>
            </div>
          </div>
          <p className="fl-fig-warn">
            <b>{t('doNotMerge')}</b>{' '}
            {lang === 'ne' ? missingFound.do_not_merge_ne || missingFound.do_not_merge_en : missingFound.do_not_merge_en}
          </p>
        </section>
      )}
    </>
  );
}
