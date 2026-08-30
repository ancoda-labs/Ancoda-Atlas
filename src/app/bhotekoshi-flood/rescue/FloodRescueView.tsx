'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type {
  SitrepContent,
  SitrepNameList,
  RescueRegister,
  FloodOfficialFeed,
  NdrrmaPopup,
  OpmcmPersonRegister,
} from '@/types';
import FloodShell from '@/components/FloodShell';
import FloodOpmcmRegister from '@/app/bhotekoshi-flood/rescue/_components/FloodOpmcmRegister';
import { useFloodLang, type Lang } from '@/hooks/use-flood-lang';
import { ageFrom } from '@/lib/relative-time';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DESK_POLL_MS } from '@/hooks/use-desk-refresh';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// The NDRRMA rescued-persons register.
//
// This page exists for one reader: someone looking for a specific person. Every
// decision follows from that. The whole register is loaded and searched in the
// browser, because a paginated list is useless to them. Matching is loose —
// Nepali names transliterate half a dozen ways and a family will not guess the
// spelling the portal chose. And nothing is inferred: a blank on the official
// register renders as a blank here, never as an assumption.

const T = {
  kicker: { en: 'Rescue register', ne: 'उद्धार सूची' },
  title: { en: 'People rescued', ne: 'उद्धार गरिएका व्यक्ति' },
  standfirst: {
    en: 'Atlas reproduces the NDRRMA portal register as published. Machine-read attachment rows are labelled and must be checked against the source document.',
    ne: 'एट्लसले एनडीआरआरएमए पोर्टलको सूची जस्ताको तस्तै देखाउँछ। मेसिनले पढेका कागजातका पङ्क्ति छुट्टै चिन्ह लगाइएका छन् र मूल कागजातसँग जाँच्नुपर्छ।',
  },
  search: { en: 'Search for a name', ne: 'नाम खोज्नुहोस्' },
  searchHint: {
    en: 'Try part of the name. Spellings differ between lists — searching for “Ram” will find “Ram Bahadur” and “Rambahadur”.',
    ne: 'नामको केही अंश लेख्नुहोस्। सूचीहरूमा हिज्जे फरक हुन सक्छ — “राम” खोज्दा “राम बहादुर” पनि भेटिन्छ।',
  },
  all: { en: 'All', ne: 'सबै' },
  nepali: { en: 'Nepali', ne: 'नेपाली' },
  foreign: { en: 'Foreign nationals', ne: 'विदेशी नागरिक' },
  foreignBadge: { en: 'Foreign', ne: 'विदेशी' },
  total: { en: 'Rescued in total', ne: 'कुल उद्धार' },
  showing: { en: 'showing', ne: 'देखाइएको' },
  name: { en: 'Name', ne: 'नाम' },
  age: { en: 'Age', ne: 'उमेर' },
  rescuedFrom: { en: 'Rescued from', ne: 'उद्धार भएको स्थान' },
  takenTo: { en: 'Taken to', ne: 'पुर्‍याइएको स्थान' },
  status: { en: 'Status', ne: 'अवस्था' },
  date: { en: 'Date', ne: 'मिति' },
  noName: { en: 'Name not recorded', ne: 'नाम उल्लेख छैन' },
  notRecorded: { en: 'Not recorded', ne: 'उल्लेख छैन' },
  noResults: {
    en: 'Nobody on this register matches that. That does not mean they were not rescued — this register covers the rescues NDRRMA has published, and other lists are held by district offices and hospitals.',
    ne: 'यस सूचीमा त्यस्तो कोही भेटिएन। यसको अर्थ उहाँको उद्धार भएको छैन भन्ने होइन — यो सूचीमा एनडीआरआरएमएले प्रकाशित गरेका उद्धार मात्र छन्; अन्य सूची जिल्ला कार्यालय र अस्पतालसँग छन्।',
  },
  loading: { en: 'Loading the register…', ne: 'सूची लोड हुँदै…' },
  unavailable: {
    en: 'The NDRRMA register cannot be reached right now. Try the portal directly.',
    ne: 'एनडीआरआरएमए सूचीमा अहिले पहुँच भएन। सिधै पोर्टल हेर्नुहोस्।',
  },
  updated: { en: 'Register read', ne: 'सूची पढिएको' },
  openPortal: { en: 'Open the NDRRMA portal', ne: 'एनडीआरआरएमए पोर्टल खोल्नुहोस्' },
  correctionTitle: { en: 'Something wrong on this list?', ne: 'यो सूचीमा केही गलत छ?' },
  correctionIntro: {
    en: 'Atlas cannot edit the government record, but it will pass a correction on. Tell us what is wrong and we will raise it with NDRRMA.',
    ne: 'एट्लसले सरकारी अभिलेख सम्पादन गर्न सक्दैन, तर सुधारको माग पुर्‍याउँछ। के गलत छ भन्नुहोस्, हामी एनडीआरआरएमएसँग उठाउँछौँ।',
  },
  correctionKind: { en: 'What is wrong?', ne: 'के गलत छ?' },
  kWrong: { en: 'Details are wrong', ne: 'विवरण गलत छ' },
  kNotSafe: { en: 'Someone listed is not actually safe', ne: 'सूचीमा भएको व्यक्ति वास्तवमा सुरक्षित हुनुहुन्न' },
  kMissing: { en: 'Someone is missing from the list', ne: 'कोही सूचीमा छुटेको छ' },
  kRemove: { en: 'Ask for a name to be taken down', ne: 'नाम हटाउन अनुरोध' },
  kOther: { en: 'Something else', ne: 'अन्य' },
  correctionMsg: { en: 'What should we tell them?', ne: 'हामीले के भन्ने?' },
  correctionContact: { en: 'How can we reach you? (optional)', ne: 'तपाईंलाई कसरी सम्पर्क गर्ने? (ऐच्छिक)' },
  contactPlaceholder: { en: 'Phone or email', ne: 'फोन वा इमेल' },
  messagePlaceholder: {
    en: 'Name, district, and what the register has wrong.',
    ne: 'नाम, जिल्ला र सूचीमा के गलत छ।',
  },
  send: { en: 'Send', ne: 'पठाउनुहोस्' },
  sending: { en: 'Sending…', ne: 'पठाइँदै…' },
  sent: { en: 'Received. Thank you — the desk will raise it.', ne: 'प्राप्त भयो। धन्यवाद — डेस्कले यो विषय उठाउनेछ।' },
  sendFailed: { en: 'That did not send. Please try again.', ne: 'पठाउन सकिएन। फेरि प्रयास गर्नुहोस्।' },
  correctionOff: {
    en: 'Corrections are not switched on for this deployment. Contact NDRRMA directly.',
    ne: 'यो सर्भरमा सुधार सुविधा सक्रिय छैन। सिधै एनडीआरआरएमएलाई सम्पर्क गर्नुहोस्।',
  },
  ocrKicker: { en: 'Document OCR', ne: 'कागजात ओसीआर' },
  ocrTitle: { en: 'Rows extracted from the official attachment', ne: 'आधिकारिक कागजातबाट निकालिएका पङ्क्ति' },
  ocrIntro: {
    en: 'Tarka read this NDRRMA attachment. These rows are searchable below, but OCR can misspell a name: every row remains unverified until checked against the PDF.',
    ne: 'टार्काले यो एनडीआरआरएमए कागजात पढेको हो। यी पङ्क्ति तल खोज्न सकिन्छ, तर ओसीआरले नाम गलत पढ्न सक्छ; पीडीएफसँग जाँच नभएसम्म सबै पङ्क्ति अप्रमाणित छन्।',
  },
  ocrTotal: { en: 'Document rows', ne: 'कागजातका पङ्क्ति' },
  ocrUnknown: { en: 'Origin not recorded', ne: 'मूल स्थान उल्लेख छैन' },
  ocrPartial: {
    en: 'Only part of this document could be read. The counts below are incomplete.',
    ne: 'यो कागजातको केही भाग मात्र पढ्न सकियो। तलका संख्या अपूर्ण छन्।',
  },
  ocrBadge: { en: 'OCR · unverified', ne: 'ओसीआर · अप्रमाणित' },
  ocrRead: { en: 'Extracted', ne: 'निकालिएको' },
  exportJson: { en: 'Download JSON', ne: 'JSON डाउनलोड' },
  exportCsv: { en: 'Download CSV', ne: 'CSV डाउनलोड' },
};

/**
 * Fold a name into something comparable across spellings.
 *
 * Nepali names reach these lists through several transliterations — Shrestha
 * and Shrest, Bahadur and Bdr — and a family searching for a relative will not
 * guess which one the portal used. Punctuation and spacing go, and the Latin
 * digraphs that vary most are normalised.
 */
function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ऀ-ॿ]/g, '')
    .replace(/sh/g, 's')
    .replace(/ph/g, 'f')
    .replace(/aa/g, 'a')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/w/g, 'v');
}

/**
 * Read a field in the reader's language, falling back to the other script.
 *
 * NDRRMA fills these columns unevenly — some rows carry only the Devanagari
 * name, others only the romanised one, and the same is true of places and
 * statuses. Showing a blank because the reader's column happens to be empty
 * would hide a record Atlas holds, so the other script stands in. Nothing is
 * translated here: whichever reading exists is reproduced as published.
 */
function bilingual(
  lang: Lang,
  en: string | null | undefined,
  ne: string | null | undefined,
): string | null {
  const preferred = lang === 'ne' ? ne : en;
  const fallback = lang === 'ne' ? en : ne;
  return preferred?.trim() || fallback?.trim() || null;
}

type Filter = 'all' | 'nepali' | 'foreign';

interface SearchPerson {
  key: string;
  name: string | null;
  nameNe: string | null;
  age: number | null;
  nationality: string | null;
  country: string | null;
  rescuedOn: string | null;
  rescueLocation: string | null;
  rescueLocationNe: string | null;
  destination: string | null;
  destinationNe: string | null;
  status: string | null;
  statusNe: string | null;
  source: 'portal' | 'ocr';
}

export default function FloodRescueView() {
  const [lang, setLang] = useFloodLang();
  const [data, setData] = useState<RescueRegister | null>(null);
  // Eight thousand rows on their own route, loaded alongside rather than inside
  // the NDRRMA register so the search box on this page paints immediately.
  const [portalRegister, setPortalRegister] = useState<OpmcmPersonRegister | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(0);
  const [sitrep, setSitrep] = useState<SitrepContent | null>(null);
  const [notices, setNotices] = useState<FloodOfficialFeed<NdrrmaPopup> | null>(null);
  const [form, setForm] = useState({ kind: 'wrong_details', message: '', contact: '' });
  const [formState, setFormState] = useState<'idle' | 'sending' | 'sent' | 'failed' | 'off'>('idle');

  const t = (key: keyof typeof T) => T[key][lang];

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch('/api/flood/rescue')
        .then(r => (r.ok ? r.json() : null))
        .then(d => {
          if (!cancelled && d) setData(d);
        })
        .catch(() => {});
      fetch('/api/flood/persons')
        .then(r => (r.ok ? r.json() : null))
        .then(d => {
          if (!cancelled && d) setPortalRegister(d);
        })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, DESK_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/flood')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (cancelled || !d) return;
        if (d.sitrep) setSitrep(d.sitrep);
        // NDRRMA's site-wide notice. During this response it has been the
        // official list of rescued Nepali and foreign citizens, as a PDF —
        // which belongs on the page where people are searching for a name.
        if (d.popups) setNotices(d.popups);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setPage(0);
  }, [q, filter]);

  const persons = useMemo<SearchPerson[]>(() => {
    const portal: SearchPerson[] = (data?.persons || []).map(person => ({
      key: `portal-${person.id}`,
      name: person.name,
      nameNe: person.nameNe,
      age: person.age,
      nationality: person.nationality,
      country: person.country,
      rescuedOn: person.rescuedOn,
      rescueLocation: person.rescuedAt?.title || null,
      rescueLocationNe: person.rescuedAt?.titleNe || null,
      destination: person.stationedAt?.title || null,
      destinationNe: person.stationedAt?.titleNe || null,
      status: person.status?.title || null,
      statusNe: person.status?.titleNe || null,
      source: 'portal',
    }));
    const ocr: SearchPerson[] = (data?.ocrDocument?.records || []).map(person => ({
      key: person.id,
      name: person.name,
      nameNe: person.name,
      age: person.age,
      nationality: person.nationality,
      country: person.country,
      rescuedOn: person.rescue_date,
      rescueLocation: person.rescue_location,
      rescueLocationNe: person.rescue_location,
      destination: person.destination_or_hospital,
      destinationNe: person.destination_or_hospital,
      status: person.status,
      statusNe: person.status,
      source: 'ocr',
    }));
    return [...portal, ...ocr];
  }, [data]);

  const matches = useMemo(() => {
    const needle = fold(q.trim());
    return persons.filter(p => {
      if (filter === 'nepali' && p.nationality !== 'nepali') return false;
      if (filter === 'foreign' && p.nationality !== 'foreign') return false;
      if (!needle) return true;
      const haystack = fold(`${p.name || ''} ${p.nameNe || ''} ${p.country || ''} ${p.rescueLocation || ''} ${p.rescueLocationNe || ''} ${p.destination || ''} ${p.destinationNe || ''}`);
      return haystack.includes(needle);
    });
  }, [persons, q, filter]);

  const PAGE_SIZE = 10;

  const paginatedMatches = useMemo(() => {
    return matches.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  }, [matches, page]);

  const totalPages = useMemo(() => Math.ceil(matches.length / PAGE_SIZE), [matches]);

  const toNeDigits = (str: string) => {
    const DEVA_DIGITS = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
    return str.replace(/[0-9]/g, d => DEVA_DIGITS[Number(d)]);
  };

  const submitCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.message.trim()) return;
    setFormState('sending');
    try {
      const res = await fetch('/api/flood/rescue/correction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: form.kind, message: form.message, contact: form.contact }),
      });
      if (res.status === 503) setFormState('off');
      else if (res.ok) {
        setFormState('sent');
        setForm({ kind: 'wrong_details', message: '', contact: '' });
      } else setFormState('failed');
    } catch {
      setFormState('failed');
    }
  };

  const summary = data?.summary;
  const ocrDocument = data?.ocrDocument || null;

  return (
    <FloodShell lang={lang} setLang={setLang} kicker={t('kicker')} title={t('title')} standfirst={t('standfirst')}>
      {/* NDRRMA's own totals lead, because they are the register this page
          searches and they move with it. The reviewed name-list figures stand
          in only while the portal is unreachable. */}
      {summary ? (
        <div className="fl-tiles">
          <div><dd>{summary.total.toLocaleString()}</dd><dt>{t('total')}</dt></div>
          <div><dd>{summary.nepali.toLocaleString()}</dd><dt>{t('nepali')}</dt></div>
          <div><dd>{summary.foreign.toLocaleString()}</dd><dt>{t('foreign')}</dt></div>
          {summary.byStatus.filter(s => s.count > 0).map(s => (
            <div key={s.id}>
              <dd>{s.count.toLocaleString()}</dd>
              <dt>{bilingual(lang, s.title, s.titleNe)}</dt>
            </div>
          ))}
        </div>
      ) : sitrep?.name_lists?.lists ? (
        <div className="fl-tiles">
          {sitrep.name_lists.lists.map((list: SitrepNameList) => (
            <div key={list.id}>
              <dd>{list.value.toLocaleString()}</dd>
              <dt>{bilingual(lang, list.label_en, list.label_ne)}</dt>
            </div>
          ))}
        </div>
      ) : null}

      {(notices?.items?.length ?? 0) > 0 && (
        <section className="fl-sec">
          <div className="fl-sec-head">
            <span>{lang === 'ne' ? 'सरकारी' : 'Official'}</span>
            <h2>{lang === 'ne' ? 'एनडीआरआरएमएको सूचना' : 'NDRRMA notice'}</h2>
          </div>
          {(notices?.items || []).map(notice => {
            const title = bilingual(lang, notice.title, notice.titleNe);
            const body = bilingual(lang, notice.body, notice.bodyNe);
            return (
              <div className="fl-place-note" key={notice.id}>
                <h3>{title}</h3>
                {body && body !== title && <p>{body}</p>}
                {notice.pdfUrl && (
                  <p className="fl-note">
                    <a href={notice.pdfUrl} target="_blank" rel="noopener noreferrer">
                      {lang === 'ne' ? 'कागजात खोल्नुहोस् (PDF)' : 'Open the document (PDF)'} &#8599;
                    </a>
                  </p>
                )}
              </div>
            );
          })}
          {/* No source link here: the notice's own document link sits directly
              above, and a second link to the same authority under it read as a
              different destination. The read time stays — a reader still needs
              to know how fresh this is. */}
          <p className="fl-note">
            {lang === 'ne' ? 'पढिएको' : 'Read'} {notices ? ageFrom(notices.fetchedAt, lang) : '—'}
          </p>
        </section>
      )}

      {ocrDocument && (
        <section className="fl-sec">
          <div className="fl-sec-head">
            <span>{t('ocrKicker')}</span>
            <h2>{t('ocrTitle')}</h2>
          </div>
          <p className="fl-note">{t('ocrIntro')}</p>
          {!ocrDocument.complete && (
            <p className="fl-insights-note" role="note">{t('ocrPartial')}</p>
          )}
          <div className="fl-tiles">
            <div><dd>{ocrDocument.summary.total.toLocaleString()}</dd><dt>{t('ocrTotal')}</dt></div>
            <div><dd>{ocrDocument.summary.nepali.toLocaleString()}</dd><dt>{t('nepali')}</dt></div>
            <div><dd>{ocrDocument.summary.foreign.toLocaleString()}</dd><dt>{t('foreign')}</dt></div>
            {ocrDocument.summary.unknown > 0 && (
              <div><dd>{ocrDocument.summary.unknown.toLocaleString()}</dd><dt>{t('ocrUnknown')}</dt></div>
            )}
          </div>
          <p className="fl-note">
            {t('ocrRead')} {ageFrom(ocrDocument.extracted_at, lang)} ·{' '}
            {ocrDocument.source_url && (
              <>
                <a href={ocrDocument.source_url} target="_blank" rel="noopener noreferrer">
                  {ocrDocument.source_document} &#8599;
                </a>{' · '}
              </>
            )}
            <a href="/api/flood/rescue/ocr" target="_blank" rel="noopener noreferrer">
              {t('exportJson')}
            </a>{' · '}
            <a href="/api/flood/rescue/ocr?format=csv">
              {t('exportCsv')}
            </a>
          </p>
        </section>
      )}

      <section className="fl-sec">
        <div className="fl-sec-head">
          <span>{lang === 'ne' ? 'खोज' : 'Search'}</span>
          <h2>{t('search')}</h2>
          {persons.length > 0 && <em>{matches.length} {t('showing')}</em>}
        </div>

        <input
          className="fl-search"
          type="search"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={t('search')}
          autoComplete="off"
          style={{ marginBottom: '12px' }}
        />
        <p className="fl-field-hint" style={{ marginBottom: '24px' }}>{t('searchHint')}</p>

        <div className="fl-chips">
          {(['all', 'nepali', 'foreign'] as Filter[]).map(f => (
            <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
              {f === 'all' ? t('all') : f === 'nepali' ? t('nepali') : t('foreign')}
            </button>
          ))}
        </div>

        {!data ? (
          <p className="fl-empty">{t('loading')}</p>
        ) : data.error && persons.length === 0 ? (
          <p className="fl-empty">{t('unavailable')}</p>
        ) : matches.length === 0 ? (
          <p className="fl-empty">{t('noResults')}</p>
        ) : (
          <>
            <div className="fl-table-scroll" style={{ minHeight: '445px', maxHeight: '445px', overflowY: 'hidden', overflowX: 'hidden', width: '100%' }}>
              <table className="fl-register" style={{ tableLayout: 'fixed', width: '100%' }}>
                <thead>
                  <tr style={{ height: '40px' }}>
                    <th style={{ width: '20%' }}>{t('name')}</th>
                    <th className="num" style={{ width: '10%' }}>{t('age')}</th>
                    <th style={{ width: '25%' }}>{t('rescuedFrom')}</th>
                    <th style={{ width: '25%' }}>{t('takenTo')}</th>
                    <th style={{ width: '10%' }}>{t('status')}</th>
                    <th className="num" style={{ width: '10%' }}>{t('date')}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedMatches.map(p => (
                    <tr key={p.key} style={{ height: '40px' }}>
                      <th scope="row" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {bilingual(lang, p.name, p.nameNe) || t('noName')}
                        {p.source === 'ocr' && <em>{t('ocrBadge')}</em>}
                        {/* "FOREIGN (India)". The badge is uppercased by the
                            stylesheet; the country keeps the case the portal
                            wrote it in, because "SOUTH KOREA" reads worse than
                            "South Korea" and neither is translated. A foreign
                            row the portal left without a country — there is one
                            — reads simply "FOREIGN". */}
                        {p.nationality && p.nationality !== 'nepali' && (
                          <em>
                            {t('foreignBadge')}
                            {p.country && <span> ({p.country})</span>}
                          </em>
                        )}
                      </th>
                      <td className="num" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.age ?? '—'}
                      </td>
                      <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {bilingual(lang, p.rescueLocation, p.rescueLocationNe) || '—'}
                      </td>
                      <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {bilingual(lang, p.destination, p.destinationNe) || '—'}
                      </td>
                      <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {bilingual(lang, p.status, p.statusNe) || <span className="fl-blank">{t('notRecorded')}</span>}
                      </td>
                      <td className="num" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.rescuedOn || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="fl-pagination" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                                    className="rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground enabled:hover:border-border-bright disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {lang === 'ne' ? 'अघिल्लो' : 'Previous'}
                </button>
                <span style={{ fontSize: '14px', fontWeight: 500 }}>
                  {lang === 'ne'
                    ? `पेज ${toNeDigits(String(page + 1))} / ${toNeDigits(String(totalPages))}`
                    : `Page ${page + 1} of ${totalPages}`}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page === totalPages - 1}
                                    className="rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground enabled:hover:border-border-bright disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {lang === 'ne' ? 'अर्को' : 'Next'}
                </button>
              </div>
            )}
          </>
        )}

        <p className="fl-note">
          {t('updated')} {data ? ageFrom(data.fetchedAt, lang) : '—'} ·{' '}
          <a href={data?.source?.url || 'https://ndrrma.gov.np/np/rescue'} target="_blank" rel="noopener noreferrer">
            {t('openPortal')} &#8599;
          </a>
        </p>
      </section>

      {/* Two registers, side by side and never merged: NDRRMA's official one
          above and the Prime Minister's Office portal here. The same person can
          sit on both under different spellings, and reconciling them by machine
          would either hide someone still missing or announce a reunion that has
          not happened. */}
      <FloodOpmcmRegister register={portalRegister} lang={lang} />

      <section className="fl-sec">
        <div className="fl-sec-head">
          <span>{lang === 'ne' ? 'सुधार' : 'Correction'}</span>
          <h2>{t('correctionTitle')}</h2>
        </div>
        <p className="fl-note">{t('correctionIntro')}</p>

        {/*
          Two questions on one row, then the thing we actually need in full
          width. The old layout stacked all three at equal weight over 620px of
          column, which read as a long form for what is really one sentence of
          information plus a way to reach the sender.
        */}
        <form className="mt-5 max-w-[620px]" onSubmit={submitCorrection}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="correction-kind">{t('correctionKind')}</Label>
              <Select value={form.kind} onValueChange={kind => setForm({ ...form, kind })}>
                <SelectTrigger id="correction-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="wrong_details">{t('kWrong')}</SelectItem>
                  <SelectItem value="not_safe">{t('kNotSafe')}</SelectItem>
                  <SelectItem value="missing_person">{t('kMissing')}</SelectItem>
                  <SelectItem value="remove_me">{t('kRemove')}</SelectItem>
                  <SelectItem value="other">{t('kOther')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="correction-contact">{t('correctionContact')}</Label>
              <Input
                id="correction-contact"
                type="text"
                maxLength={200}
                placeholder={t('contactPlaceholder')}
                value={form.contact}
                onChange={e => setForm({ ...form, contact: e.target.value })}
              />
            </div>
          </div>

          <div className="mt-4 grid gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <Label htmlFor="correction-message">{t('correctionMsg')}</Label>
              {/* Only worth showing once the limit is in sight. */}
              {form.message.length > 1600 && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {form.message.length} / 2000
                </span>
              )}
            </div>
            <Textarea
              id="correction-message"
              rows={4}
              maxLength={2000}
              placeholder={t('messagePlaceholder')}
              value={form.message}
              onChange={e => setForm({ ...form, message: e.target.value })}
            />
          </div>

          {/* Status and the button share a line, so the form ends where it ends. */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p aria-live="polite" className="m-0 text-sm">
              {formState === 'sent' && <span className="text-[#1c7a4b]">{t('sent')}</span>}
              {formState === 'failed' && <span className="text-destructive">{t('sendFailed')}</span>}
              {formState === 'off' && <span className="text-destructive">{t('correctionOff')}</span>}
            </p>
            <Button
              type="submit"
              disabled={formState === 'sending' || !form.message.trim()}
              className="min-w-[120px]"
            >
              {formState === 'sending' ? t('sending') : t('send')}
            </Button>
          </div>
        </form>
      </section>
    </FloodShell>
  );
}
