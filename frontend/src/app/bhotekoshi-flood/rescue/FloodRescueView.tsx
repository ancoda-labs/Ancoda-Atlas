'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type {
  RescueRegister,
  RescuedPerson,
  OpmcmPersonRegister,
  OpmcmPersonReport,
} from '@/types';
import FloodShell from '@/components/FloodShell';
import FloodOpmcmRegister from '@/app/bhotekoshi-flood/rescue/_components/FloodOpmcmRegister';
import { useFloodLang, type Lang } from '@/hooks/use-flood-lang';
import { ageFrom } from '@/lib/relative-time';
import {
  foldName,
  matchScore,
  parseAgeField,
  parsePersonQuery,
  type PersonQuery,
} from '@/lib/person-search';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DESK_POLL_MS } from '@/hooks/use-desk-refresh';
import { useFloodDesk } from '@/app/bhotekoshi-flood/_components/FloodDeskProvider';
import { useFileCorrection, usePersonRegister, useRescueRegister } from '@/hooks/useRescue';
import { isConstrainedConnection, whenIdle } from '@/lib/connection-pref';
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
  kicker: { en: 'People', ne: 'व्यक्ति' },
  title: { en: 'Find someone', ne: 'कोही खोज्नुहोस्' },
  standfirst: {
    en: 'One search, two official lists: people NDRRMA has rescued, and missing-person reports families filed with the Prime Minister’s Office. They are not merged — the same name can appear on both.',
    ne: 'एउटै खोज, दुई आधिकारिक सूची: एनडीआरआरएमएले उद्धार गरेका व्यक्ति, र प्रधानमन्त्री कार्यालयमा परिवारले दर्ता गरेका हराएका व्यक्तिका रिपोर्ट। मिसाइएको छैन — एउटै नाम दुवैमा पर्न सक्छ।',
  },
  search: { en: 'Search a name, place, or age', ne: 'नाम, स्थान वा उमेर खोज्नुहोस्' },
  searchHint: {
    en: 'Try “Ram Bahadur”, “Timure”, “missing 40”, or “rescued India”. Spellings differ between lists — “Ram” also finds “Ram Bahadur”.',
    ne: '“राम बहादुर”, “टिमुरे”, “हराएका ४०”, वा “उद्धार India” लेख्नुहोस्। सूचीहरूमा हिज्जे फरक हुन सक्छ — “राम” ले “राम बहादुर” पनि भेट्छ।',
  },
  jumpLabel: { en: 'Choose a register', ne: 'सूची छान्नुहोस्' },
  jumpHint: { en: 'Or browse a list', ne: 'वा सूची हेर्नुहोस्' },
  jumpRescued: { en: 'People rescued', ne: 'उद्धार गरिएका' },
  jumpRescuedSub: { en: 'NDRRMA named register', ne: 'एनडीआरआरएमए नामावली' },
  jumpMissing: { en: 'Missing people', ne: 'हराएका व्यक्ति' },
  jumpMissingSub: { en: 'Family reports on the PM’s portal', ne: 'प्रधानमन्त्री कार्यालयमा परिवारका रिपोर्ट' },
  all: { en: 'All matches', ne: 'सबै मिलान' },
  rescued: { en: 'Rescued', ne: 'उद्धार' },
  missing: { en: 'Still missing', ne: 'अझै हराइरहेका' },
  found: { en: 'Reported found', ne: 'भेटिएको जनाइएको' },
  nepali: { en: 'Nepali', ne: 'नेपाली' },
  foreign: { en: 'Foreign nationals', ne: 'विदेशी नागरिक' },
  foreignBadge: { en: 'Foreign', ne: 'विदेशी' },
  total: { en: 'Rescued by NDRRMA', ne: 'एनडीआरआरएमए उद्धार' },
  missingTile: { en: 'Missing-person reports', ne: 'हराएका व्यक्तिका रिपोर्ट' },
  foundTile: { en: 'Reported found', ne: 'भेटिएको जनाइएको' },
  reports: { en: 'reports', ne: 'रिपोर्ट' },
  people: { en: 'people', ne: 'जना' },
  showing: { en: 'showing', ne: 'देखाइएको' },
  name: { en: 'Name', ne: 'नाम' },
  age: { en: 'Age', ne: 'उमेर' },
  rescuedFrom: { en: 'Rescued from', ne: 'उद्धार भएको स्थान' },
  takenTo: { en: 'Taken to', ne: 'पुर्‍याइएको स्थान' },
  lastSeen: { en: 'Last seen', ne: 'अन्तिम देखिएको' },
  status: { en: 'Status', ne: 'अवस्था' },
  date: { en: 'Date', ne: 'मिति' },
  gender: { en: 'Gender', ne: 'लिङ्ग' },
  country: { en: 'Country', ne: 'देश' },
  notes: { en: 'Notes', ne: 'कैफियत' },
  noName: { en: 'Name not recorded', ne: 'नाम उल्लेख छैन' },
  notRecorded: { en: 'Not recorded', ne: 'उल्लेख छैन' },
  yearsOld: { en: 'years old', ne: 'वर्ष' },
  placeMatch: {
    en: 'Matched a place or note — check the name carefully.',
    ne: 'स्थान वा विवरणमा मिल्यो — नाम राम्ररी हेर्नुहोस्।',
  },
  rescuedGroup: { en: 'Rescued — NDRRMA register', ne: 'उद्धार — एनडीआरआरएमए सूची' },
  missingGroup: { en: 'Still missing — family reports', ne: 'अझै हराइरहेका — परिवारका रिपोर्ट' },
  foundGroup: { en: 'Reported found — family reports', ne: 'भेटिएको जनाइएको — परिवारका रिपोर्ट' },
  missingGroupNote: {
    en: 'These are reports, not a count of people. One person may appear more than once. Do not add them to the official uncontacted figure.',
    ne: 'यी रिपोर्ट हुन्, व्यक्तिको संख्या होइन। एउटै व्यक्ति एकभन्दा बढी पटक पर्न सक्छन्। आधिकारिक सम्पर्कविहीन संख्यामा नजोड्नुहोस्।',
  },
  noResults: {
    en: 'Nobody on either list matches that. That does not mean they were not rescued or are not missing — only that these two portals have not published that spelling. Try another spelling, a place name, or file a missing-person report.',
    ne: 'कुनै सूचीमा त्यस्तो कोही भेटिएन। यसको अर्थ उद्धार भएको छैन वा हराउनुभएको छैन भन्ने होइन — यी दुई पोर्टलले त्यो हिज्जे प्रकाशित गरेका छैनन्। अर्को हिज्जे वा स्थान प्रयास गर्नुहोस्, वा हराएको रिपोर्ट दर्ता गर्नुहोस्।',
  },
  noRescued: {
    en: 'No rescued-register match. Check missing-person reports, or try another spelling.',
    ne: 'उद्धार सूचीमा मिलान भएन। हराएका व्यक्तिका रिपोर्ट हेर्नुहोस्, वा अर्को हिज्जे प्रयास गर्नुहोस्।',
  },
  loadMore: { en: 'Show more', ne: 'थप देखाउनुहोस्' },
  loading: { en: 'Loading the registers…', ne: 'सूची लोड हुँदै…' },
  unavailable: {
    en: 'The NDRRMA register cannot be reached right now. Try the portal directly.',
    ne: 'एनडीआरआरएमए सूचीमा अहिले पहुँच भएन। सिधै पोर्टल हेर्नुहोस्।',
  },
  updated: { en: 'Register read', ne: 'सूची पढिएको' },
  openPortal: { en: 'Open the NDRRMA Rasuwa register', ne: 'एनडीआरआरएमए रसुवा सूची खोल्नुहोस्' },
  close: { en: 'Close', ne: 'बन्द गर्नुहोस्' },
  details: { en: 'Rescued person', ne: 'उद्धार गरिएका व्यक्ति' },
  fileReport: { en: 'File a missing-person report on the portal', ne: 'पोर्टलमा हराएको रिपोर्ट दर्ता गर्नुहोस्' },
  matching: { en: 'Matching', ne: 'मिलान' },
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
};

type Filter = 'all' | 'rescued' | 'missing' | 'found' | 'foreign';
const PAGE_SIZE = 20;

type IndexedPerson<T> = {
  row: T;
  foldedName: string;
  foldedHay: string;
  age: number | null;
};

function rankRows<T>(rows: IndexedPerson<T>[], query: PersonQuery, searching: boolean): IndexedPerson<T>[] {
  if (!searching) return rows;
  const ranked: Array<IndexedPerson<T> & { score: number }> = [];
  for (const item of rows) {
    const score = matchScore({
      foldedName: item.foldedName,
      foldedHay: item.foldedHay,
      age: item.age,
      query,
    });
    if (score > 0) ranked.push({ ...item, score });
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

function nameOnlyMatch(foldedName: string, query: PersonQuery): boolean {
  if (query.tokens.length === 0) return true;
  return query.tokens.every(tok => foldedName.includes(tok));
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

export default function FloodRescueView() {
  const [lang, setLang] = useFloodLang();
  const { desk } = useFloodDesk();
  const [data, setData] = useState<RescueRegister | null>(null);
  // Eight thousand rows on their own route, loaded alongside rather than inside
  // the NDRRMA register so the search box on this page paints immediately.
  const [portalRegister, setPortalRegister] = useState<OpmcmPersonRegister | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [rescuedShown, setRescuedShown] = useState(PAGE_SIZE);
  const [missingShown, setMissingShown] = useState(PAGE_SIZE);
  const [foundShown, setFoundShown] = useState(PAGE_SIZE);
  const [selectedRescued, setSelectedRescued] = useState<RescuedPerson | null>(null);
  const [selectedMissing, setSelectedMissing] = useState<OpmcmPersonReport | null>(null);
  const sitrep = desk.sitrep;
  const notices = desk.popups ?? null;
  const [form, setForm] = useState({ kind: 'wrong_details', message: '', contact: '' });
  const [formState, setFormState] = useState<'idle' | 'sending' | 'sent' | 'failed' | 'off'>('idle');
  const [wantRegisters, setWantRegisters] = useState(false);

  const t = (key: keyof typeof T) => T[key][lang];

  useEffect(() => {
    if (q.trim() || filter === 'missing' || filter === 'found') setWantRegisters(true);
  }, [q, filter]);

  useEffect(() => {
    const onFocus = () => setWantRegisters(true);
    const input = document.getElementById('fl-find-q');
    input?.addEventListener('focus', onFocus);
    const cancelIdle = whenIdle(() => setWantRegisters(true), isConstrainedConnection() ? 3500 : 1500);
    return () => {
      input?.removeEventListener('focus', onFocus);
      cancelIdle();
    };
  }, []);

  // Both registers, fetched only once the reader has asked for them —
  // `wantRegisters` gates it because between them they are around twelve
  // megabytes, and most visitors to this page never search a name.
  const rescueQuery = useRescueRegister(wantRegisters);
  const personsQuery = usePersonRegister(wantRegisters);
  useEffect(() => {
    if (rescueQuery.data) setData(rescueQuery.data);
  }, [rescueQuery.data]);
  useEffect(() => {
    if (personsQuery.data) setPortalRegister(personsQuery.data);
  }, [personsQuery.data]);


  useEffect(() => {
    setRescuedShown(PAGE_SIZE);
    setMissingShown(PAGE_SIZE);
    setFoundShown(PAGE_SIZE);
  }, [q, filter]);

  const persons: RescuedPerson[] = useMemo(() => data?.persons || [], [data]);
  const parsed = useMemo(() => parsePersonQuery(q), [q]);
  const searching = parsed.raw.length > 0;

  const rescuedIndex = useMemo(
    () =>
      persons.map(row => ({
        row,
        foldedName: foldName(`${row.name || ''} ${row.nameNe || ''}`),
        foldedHay: foldName(
          `${row.name || ''} ${row.nameNe || ''} ${row.country || ''} ${row.rescuedAt?.title || ''} ${row.rescuedAt?.titleNe || ''} ${row.stationedAt?.title || ''} ${row.stationedAt?.titleNe || ''} ${row.remarks || ''} ${row.status?.title || ''} ${row.status?.titleNe || ''}`,
        ),
        age: row.age,
      })),
    [persons],
  );

  const missingIndex = useMemo(
    () =>
      (portalRegister?.lost || []).map(row => ({
        row,
        foldedName: foldName(row.name || ''),
        foldedHay: foldName(`${row.name || ''} ${row.place || ''} ${row.description || ''} ${row.daoOffice || ''} ${row.status || ''} ${row.daoStatus || ''}`),
        age: parseAgeField(row.age),
      })),
    [portalRegister],
  );

  const foundIndex = useMemo(
    () =>
      (portalRegister?.found || []).map(row => ({
        row,
        foldedName: foldName(row.name || ''),
        foldedHay: foldName(`${row.name || ''} ${row.place || ''} ${row.description || ''} ${row.daoOffice || ''} ${row.status || ''} ${row.daoStatus || ''}`),
        age: parseAgeField(row.age),
      })),
    [portalRegister],
  );

  const rescuedHits = useMemo(() => {
    let rows = rescuedIndex;
    if (filter === 'foreign' || parsed.foreign) {
      rows = rows.filter(item => item.row.nationality && item.row.nationality !== 'nepali');
    }
    return rankRows(rows, parsed, searching);
  }, [rescuedIndex, parsed, searching, filter]);

  const missingHits = useMemo(() => rankRows(missingIndex, parsed, searching), [missingIndex, parsed, searching]);
  const foundHits = useMemo(() => rankRows(foundIndex, parsed, searching), [foundIndex, parsed, searching]);

  const showRescued = filter === 'all' || filter === 'rescued' || filter === 'foreign';
  const showMissing = filter === 'all' || filter === 'missing';
  const showFound = filter === 'all' || filter === 'found';

  const groupOrder: Array<'rescued' | 'missing' | 'found'> =
    parsed.intent === 'missing'
      ? ['missing', 'found', 'rescued']
      : parsed.intent === 'found'
        ? ['found', 'missing', 'rescued']
        : ['rescued', 'missing', 'found'];

  const toNeDigits = (str: string) => {
    const DEVA_DIGITS = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
    return str.replace(/[0-9]/g, d => DEVA_DIGITS[Number(d)]);
  };

  const fileCorrection = useFileCorrection();

  const submitCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.message.trim()) return;
    setFormState('sending');
    try {
      await fileCorrection.mutateAsync({
        kind: form.kind,
        message: form.message,
        contact: form.contact,
      });
      setFormState('sent');
      setForm({ kind: 'wrong_details', message: '', contact: '' });
    } catch (err) {
      // 503 means the database is not configured, which is a different thing
      // from the form failing — the page says "not available" rather than
      // "try again".
      setFormState((err as { status?: number })?.status === 503 ? 'off' : 'failed');
    }
  };

  const summary = data?.summary ?? desk.rescueSummary;
  const portalPersons = desk.portal?.persons;
  // Prefer the portal's own headline counters for the tiles. The eight-thousand-
  // row register is what a family searches; it is not what these three figures
  // are. On Cloudflare that sweep never finishes, so waiting on it left "—".
  const lostCount =
    portalPersons?.lostOpen ??
    portalPersons?.lost ??
    (portalRegister && !portalRegister.error ? portalRegister.lost.length : null);
  const foundCount =
    portalPersons?.found ??
    portalPersons?.foundOpen ??
    (portalRegister && !portalRegister.error ? portalRegister.found.length : null);
  const fig = (n: number) => (lang === 'ne' ? toNeDigits(n.toLocaleString()) : n.toLocaleString());
  const anyHits = (showRescued && rescuedHits.length > 0) || (showMissing && missingHits.length > 0) || (showFound && foundHits.length > 0);

  return (
    <FloodShell lang={lang} setLang={setLang} kicker={t('kicker')} title={t('title')} standfirst={t('standfirst')}>
      <section className="fl-find" id="rescued-search">
        <div className="fl-sec-head">
          <span>{lang === 'ne' ? 'खोज' : 'Search'}</span>
          <h2><label htmlFor="fl-find-q">{t('search')}</label></h2>
        </div>
        <input
          id="fl-find-q"
          className="fl-search"
          type="search"
          value={q}
          onChange={e => setQ(e.target.value)}
          onFocus={() => setWantRegisters(true)}
          placeholder={t('search')}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <p className="fl-find-hint">{t('searchHint')}</p>
      </section>

      <div className="fl-tiles">
        <div className="t-positive">
          <dd>{fig(summary?.total ?? sitrep?.name_lists?.lists?.find(l => l.id === 'ndrrma')?.value ?? persons.length)}</dd>
          <dt>{t('total')}</dt>
        </div>
        <div className="t-critical">
          <dd>{lostCount != null ? fig(lostCount) : '—'}</dd>
          <dt>{t('missingTile')}</dt>
          <small>{t('reports')}</small>
        </div>
        <div>
          <dd>{foundCount != null ? fig(foundCount) : '—'}</dd>
          <dt>{t('foundTile')}</dt>
          <small>{t('reports')}</small>
        </div>
      </div>

      {(data?.messages?.length ?? 0) > 0 && (
        <aside className="fl-register-about">
          <span>{lang === 'ne' ? 'एनडीआरआरएमए · सूचीबारे' : 'NDRRMA · About this register'}</span>
          {(data?.messages || []).map((msg, i) => {
            const line = bilingual(lang, msg.title, msg.titleNe);
            return line ? <p key={i}>{line}</p> : null;
          })}
        </aside>
      )}

      <div className="fl-chips" role="tablist" aria-label={t('jumpLabel')}>
        {(['all', 'rescued', 'missing', 'found', 'foreign'] as Filter[]).map(f => (
          <button
            key={f}
            type="button"
            role="tab"
            className={filter === f ? 'on' : ''}
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
          >
            {t(f)}
          </button>
        ))}
      </div>

      {searching && (
        <p className="fl-find-count" aria-live="polite">
          {t('matching')} “{parsed.raw}” —
          {' '}
          {[
            showRescued && rescuedHits.length > 0 ? `${fig(rescuedHits.length)} ${t('rescued')}` : null,
            showMissing && missingHits.length > 0 ? `${fig(missingHits.length)} ${t('missing')}` : null,
            showFound && foundHits.length > 0 ? `${fig(foundHits.length)} ${t('found')}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}

      {!data && !portalRegister ? (
        <p className="fl-empty">{t('loading')}</p>
      ) : data?.error && !persons.length ? (
        <p className="fl-empty">{t('unavailable')}</p>
      ) : searching && !anyHits ? (
        <p className="fl-empty">
          {t('noResults')}{' '}
          <a href={portalRegister?.source?.url || 'https://rescue.opmcm.gov.np/person-reports'} target="_blank" rel="noopener noreferrer">
            {t('fileReport')} &#8599;
          </a>
        </p>
      ) : (
        groupOrder.map(group => {
          if (group === 'rescued' && showRescued) {
            const slice = rescuedHits.slice(0, rescuedShown);
            if (searching && slice.length === 0) return null;
            return (
              <div className="fl-person-group" key="rescued" id="rescued-list">
                <h3>
                  {t('rescuedGroup')}
                  <em>{fig(rescuedHits.length)}</em>
                </h3>
                {slice.length === 0 ? (
                  <p className="fl-empty">{searching ? t('noRescued') : t('loading')}</p>
                ) : (
                  <div className="fl-person-list">
                    {slice.map(item => {
                      const p = item.row;
                      const from = bilingual(lang, p.rescuedAt?.title, p.rescuedAt?.titleNe) || p.remarks;
                      const to = bilingual(lang, p.stationedAt?.title, p.stationedAt?.titleNe);
                      const st = bilingual(lang, p.status?.title, p.status?.titleNe);
                      return (
                        <button type="button" className="fl-person" key={p.id} onClick={() => setSelectedRescued(p)}>
                          <span className="fl-person-kind rescued">{t('rescued')}</span>
                          <span>
                            <p className="fl-person-name">{bilingual(lang, p.name, p.nameNe) || t('noName')}</p>
                            <p className="fl-person-meta">
                              {from ? `${t('rescuedFrom')} ${from}` : t('notRecorded')}
                              {to ? ` · ${t('takenTo')} ${to}` : ''}
                              {st ? ` · ${st}` : ''}
                              {p.nationality && p.nationality !== 'nepali' ? ` · ${t('foreignBadge')}${p.country ? ` (${p.country})` : ''}` : ''}
                            </p>
                            {searching && !nameOnlyMatch(item.foldedName, parsed) && (
                              <p className="fl-person-why">{t('placeMatch')}</p>
                            )}
                          </span>
                          <span className="fl-person-age">{p.age != null ? p.age : '—'}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {rescuedHits.length > rescuedShown && (
                  <button type="button" className="fl-more" onClick={() => setRescuedShown(n => n + PAGE_SIZE)}>
                    {t('loadMore')} · {fig(rescuedHits.length - rescuedShown)}
                  </button>
                )}
                <p className="fl-note">
                  {t('updated')} {data ? ageFrom(data.fetchedAt, lang) : '—'} ·{' '}
                  <a href={data?.source?.url || 'https://ndrrma.gov.np/np/rasuwa/rescue'} target="_blank" rel="noopener noreferrer">
                    {t('openPortal')} &#8599;
                  </a>
                </p>
              </div>
            );
          }

          if (group === 'missing' && showMissing && searching) {
            const slice = missingHits.slice(0, missingShown);
            if (searching && slice.length === 0) return null;
            return (
              <div className="fl-person-group" key="missing">
                <h3>
                  {t('missingGroup')}
                  <em>{fig(missingHits.length)}</em>
                </h3>
                <p>{t('missingGroupNote')}</p>
                {slice.length === 0 ? (
                  <p className="fl-empty">{t('loading')}</p>
                ) : (
                  <div className="fl-person-list">
                    {slice.map(item => {
                      const p = item.row;
                      return (
                        <button type="button" className="fl-person" key={p.id || `${p.name}-${p.place}`} onClick={() => setSelectedMissing(p)}>
                          <span className="fl-person-kind missing">{t('missing')}</span>
                          <span>
                            <p className="fl-person-name">{p.name || t('noName')}</p>
                            <p className="fl-person-meta">
                              {p.place ? `${t('lastSeen')} ${p.place}` : t('notRecorded')}
                              {p.daoStatus || p.status ? ` · ${p.daoStatus || p.status}` : ''}
                              {p.eventAt ? ` · ${ageFrom(p.eventAt, lang)}` : ''}
                            </p>
                            {searching && !nameOnlyMatch(item.foldedName, parsed) && (
                              <p className="fl-person-why">{t('placeMatch')}</p>
                            )}
                          </span>
                          <span className="fl-person-age">{p.age || '—'}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {missingHits.length > missingShown && (
                  <button type="button" className="fl-more" onClick={() => setMissingShown(n => n + PAGE_SIZE)}>
                    {t('loadMore')} · {fig(missingHits.length - missingShown)}
                  </button>
                )}
                {portalRegister?.source && (
                  <p className="fl-note">
                    <a href={portalRegister.source.url} target="_blank" rel="noopener noreferrer">
                      {t('fileReport')} &#8599;
                    </a>
                  </p>
                )}
              </div>
            );
          }

          if (group === 'found' && showFound && searching) {
            const slice = foundHits.slice(0, foundShown);
            if (slice.length === 0) return null;
            return (
              <div className="fl-person-group" key="found">
                <h3>
                  {t('foundGroup')}
                  <em>{fig(foundHits.length)}</em>
                </h3>
                <p>{t('missingGroupNote')}</p>
                <div className="fl-person-list">
                  {slice.map(item => {
                    const p = item.row;
                    return (
                      <button type="button" className="fl-person" key={p.id || `${p.name}-found`} onClick={() => setSelectedMissing(p)}>
                        <span className="fl-person-kind found">{t('found')}</span>
                        <span>
                          <p className="fl-person-name">{p.name || t('noName')}</p>
                          <p className="fl-person-meta">
                            {p.place || t('notRecorded')}
                            {p.daoStatus || p.status ? ` · ${p.daoStatus || p.status}` : ''}
                          </p>
                        </span>
                        <span className="fl-person-age">{p.age || '—'}</span>
                      </button>
                    );
                  })}
                </div>
                {foundHits.length > foundShown && (
                  <button type="button" className="fl-more" onClick={() => setFoundShown(n => n + PAGE_SIZE)}>
                    {t('loadMore')} · {fig(foundHits.length - foundShown)}
                  </button>
                )}
              </div>
            );
          }

          return null;
        })
      )}

      {(notices?.items?.length ?? 0) > 0 && !searching && (
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

      {/* Browse the missing-person register when the page is not mid-search.
          Search results use the cards above so a family is not sent down the
          page to a second box. The two lists stay separate: this component
          never receives the NDRRMA rows. */}
      {!searching && (filter === 'all' || filter === 'missing' || filter === 'found') && (
        <FloodOpmcmRegister
          register={portalRegister}
          lang={lang}
          hideSearch
          which={filter === 'found' ? 'found' : 'lost'}
        />
      )}

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

      <Dialog open={selectedRescued !== null} onOpenChange={open => !open && setSelectedRescued(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedRescued ? bilingual(lang, selectedRescued.name, selectedRescued.nameNe) || t('noName') : t('details')}
            </DialogTitle>
          </DialogHeader>
          {selectedRescued && (
            <dl className="grid grid-cols-[108px_1fr] gap-x-3 gap-y-2 text-sm">
              <dt className="font-semibold text-foreground">{t('age')}</dt>
              <dd className="m-0 text-muted-foreground">{selectedRescued.age ?? t('notRecorded')}</dd>
              <dt className="font-semibold text-foreground">{t('rescuedFrom')}</dt>
              <dd className="m-0 text-muted-foreground">
                {bilingual(lang, selectedRescued.rescuedAt?.title, selectedRescued.rescuedAt?.titleNe) || selectedRescued.remarks || t('notRecorded')}
              </dd>
              <dt className="font-semibold text-foreground">{t('takenTo')}</dt>
              <dd className="m-0 text-muted-foreground">
                {bilingual(lang, selectedRescued.stationedAt?.title, selectedRescued.stationedAt?.titleNe) || t('notRecorded')}
              </dd>
              <dt className="font-semibold text-foreground">{t('status')}</dt>
              <dd className="m-0 text-muted-foreground">
                {bilingual(lang, selectedRescued.status?.title, selectedRescued.status?.titleNe) || t('notRecorded')}
              </dd>
              <dt className="font-semibold text-foreground">{t('date')}</dt>
              <dd className="m-0 text-muted-foreground">{selectedRescued.rescuedOn || t('notRecorded')}</dd>
              {selectedRescued.nationality && selectedRescued.nationality !== 'nepali' && (
                <>
                  <dt className="font-semibold text-foreground">{t('country')}</dt>
                  <dd className="m-0 text-muted-foreground">{selectedRescued.country || t('foreignBadge')}</dd>
                </>
              )}
              {selectedRescued.gender && (
                <>
                  <dt className="font-semibold text-foreground">{t('gender')}</dt>
                  <dd className="m-0 text-muted-foreground">{selectedRescued.gender}</dd>
                </>
              )}
              {selectedRescued.remarks && (
                <>
                  <dt className="font-semibold text-foreground">{t('notes')}</dt>
                  <dd className="m-0 text-muted-foreground">{selectedRescued.remarks}</dd>
                </>
              )}
            </dl>
          )}
          <DialogFooter>
            <Button className="w-full" onClick={() => setSelectedRescued(null)}>{t('close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={selectedMissing !== null} onOpenChange={open => !open && setSelectedMissing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedMissing?.name || t('missing')}</DialogTitle>
          </DialogHeader>
          {selectedMissing && (
            <div className="space-y-3 text-sm leading-relaxed">
              {selectedMissing.imageProxy && (
                <img src={selectedMissing.imageProxy} alt="" referrerPolicy="no-referrer" className="max-h-56 w-full rounded object-contain" />
              )}
              <p className="m-0 text-xs uppercase tracking-wide text-muted-foreground">{t('missingGroupNote')}</p>
              <dl className="grid grid-cols-[108px_1fr] gap-x-3 gap-y-2">
                <dt className="font-semibold text-foreground">{t('age')}</dt>
                <dd className="m-0 text-muted-foreground">{selectedMissing.age || t('notRecorded')}</dd>
                <dt className="font-semibold text-foreground">{t('lastSeen')}</dt>
                <dd className="m-0 text-muted-foreground">{selectedMissing.place || t('notRecorded')}</dd>
                <dt className="font-semibold text-foreground">{t('status')}</dt>
                <dd className="m-0 text-muted-foreground">{selectedMissing.daoStatus || selectedMissing.status || t('notRecorded')}</dd>
              </dl>
              {selectedMissing.description && (
                <p className="m-0 whitespace-pre-wrap break-words text-muted-foreground">{selectedMissing.description}</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button className="w-full" onClick={() => setSelectedMissing(null)}>{t('close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FloodShell>
  );
}
