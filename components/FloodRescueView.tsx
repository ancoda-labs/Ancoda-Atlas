'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { SitrepContent, SitrepNameList, RescueRegister, RescuedPerson, BulletinRescue } from '@/lib/types';
import FloodShell from './FloodShell';
import FloodFamilyRegister from './FloodFamilyRegister';
import { useFloodLang } from '@/lib/use-flood-lang';
import { ageFrom } from '@/lib/relative-time';

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
    en: 'Published by NDRRMA. Atlas reproduces it as it stands and cannot change the official record.',
    ne: 'एनडीआरआरएमएद्वारा प्रकाशित। एट्लसले यसलाई जस्ताको तस्तै देखाउँछ र आधिकारिक अभिलेख परिवर्तन गर्न सक्दैन।',
  },
  search: { en: 'Search for a name', ne: 'नाम खोज्नुहोस्' },
  searchHint: {
    en: 'Try part of the name. Spellings differ between lists — searching for “Ram” will find “Ram Bahadur” and “Rambahadur”.',
    ne: 'नामको केही अंश लेख्नुहोस्। सूचीहरूमा हिज्जे फरक हुन सक्छ — “राम” खोज्दा “राम बहादुर” पनि भेटिन्छ।',
  },
  all: { en: 'All', ne: 'सबै' },
  nepali: { en: 'Nepali', ne: 'नेपाली' },
  foreign: { en: 'Foreign nationals', ne: 'विदेशी नागरिक' },
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
  send: { en: 'Send', ne: 'पठाउनुहोस्' },
  sent: { en: 'Received. Thank you — the desk will raise it.', ne: 'प्राप्त भयो। धन्यवाद — डेस्कले यो विषय उठाउनेछ।' },
  sendFailed: { en: 'That did not send. Please try again.', ne: 'पठाउन सकिएन। फेरि प्रयास गर्नुहोस्।' },
  correctionOff: {
    en: 'Corrections are not switched on for this deployment. Contact NDRRMA directly.',
    ne: 'यो सर्भरमा सुधार सुविधा सक्रिय छैन। सिधै एनडीआरआरएमएलाई सम्पर्क गर्नुहोस्।',
  },
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

type Filter = 'all' | 'nepali' | 'foreign';

const BULLETIN_TABS = {
  nuwakot: {
    en: 'Nuwakot',
    ne: 'नुवाकोट',
    headers: {
      en: ['Name', 'Age', 'Address', 'Gender'],
      ne: ['नाम', 'उमेर', 'ठेगाना', 'लिङ्ग']
    }
  },
  surya: {
    en: 'Suryagadhi',
    ne: 'सूर्यगढी',
    headers: {
      en: ['Name', 'Address', 'Age', 'Gender'],
      ne: ['नाम', 'ठेगाना', 'उमेर', 'लिङ्ग']
    }
  },
  shelter: {
    en: 'Sheltered',
    ne: 'उद्धार सूची',
    headers: {
      en: ['Name', 'Address', 'Age', 'Gender'],
      ne: ['नाम', 'ठेगाना', 'उमेर', 'लिङ्ग']
    }
  },
  treat: {
    en: 'Treated (KTM)',
    ne: 'घाइते काठमाडौं',
    headers: {
      en: ['Name', 'Age', 'Address', 'Phone', 'District', 'Hospital', 'Status'],
      ne: ['नाम', 'उमेर', 'ठेगाना', 'सम्पर्क', 'जिल्ला', 'अस्पताल', 'अवस्था']
    }
  },
  dao: {
    en: 'NDRRMA Rec',
    ne: 'NDRRMA उद्धार',
    headers: {
      en: ['Name', 'Address', 'Age', 'Gender', 'Remarks'],
      ne: ['नाम', 'ठेगाना', 'उमेर', 'लिङ्ग', 'कैफियत']
    }
  },
  india: {
    en: 'Indian Tourists',
    ne: 'भारतीय',
    headers: {
      en: ['Name'],
      ne: ['नाम']
    }
  },
  trishuli1: {
    en: 'Trishuli-1',
    ne: 'त्रिशूली-१',
    headers: {
      en: ['Name'],
      ne: ['नाम']
    }
  }
};
type BulletinTab = keyof typeof BULLETIN_TABS;

export default function FloodRescueView() {
  const [lang, setLang] = useFloodLang();
  const [data, setData] = useState<(RescueRegister & { bulletinRescue?: BulletinRescue | null }) | null>(null);
  const [sourceType, setSourceType] = useState<'ndrrma' | 'bulletin'>('ndrrma');
  const [bulletinTab, setBulletinTab] = useState<BulletinTab>('nuwakot');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(0);
  const [sitrep, setSitrep] = useState<SitrepContent | null>(null);
  const [form, setForm] = useState({ kind: 'wrong_details', message: '', contact: '' });
  const [formState, setFormState] = useState<'idle' | 'sending' | 'sent' | 'failed' | 'off'>('idle');

  const t = (key: keyof typeof T) => T[key][lang];

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch('/api/flood/rescue')
        .then(r => (r.ok ? r.json() : null))
        .then(d => {
          if (!cancelled && d) setData(d);
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 3 * 60 * 1000);
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
        if (!cancelled && d?.sitrep) setSitrep(d.sitrep);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setPage(0);
  }, [sourceType, bulletinTab, q, filter]);

  const persons: RescuedPerson[] = useMemo(() => data?.persons || [], [data]);

  const matches = useMemo(() => {
    const needle = fold(q.trim());
    return persons.filter(p => {
      if (filter === 'nepali' && p.nationality !== 'nepali') return false;
      if (filter === 'foreign' && p.nationality === 'nepali') return false;
      if (!needle) return true;
      const haystack = fold(`${p.name || ''} ${p.nameNe || ''} ${p.rescuedAt?.title || ''} ${p.stationedAt?.title || ''}`);
      return haystack.includes(needle);
    });
  }, [persons, q, filter]);

  const bulletinRows = useMemo(() => {
    const list: string[][] = data?.bulletinRescue?.[bulletinTab as keyof BulletinRescue] as string[][] ?? [];
    const needle = fold(q.trim());
    if (!needle) return list;
    return list.filter((row: string[]) => {
      const text = row.slice(1).join(' ');
      return fold(text).includes(needle);
    });
  }, [data, bulletinTab, q]);

  const PAGE_SIZE = 10;

  const paginatedMatches = useMemo(() => {
    return matches.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  }, [matches, page]);

  const paginatedBulletinRows = useMemo(() => {
    return bulletinRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  }, [bulletinRows, page]);

  const totalPages = useMemo(() => {
    const total = sourceType === 'ndrrma' ? matches.length : bulletinRows.length;
    return Math.ceil(total / PAGE_SIZE);
  }, [sourceType, matches, bulletinRows]);

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

  return (
    <FloodShell lang={lang} setLang={setLang} kicker={t('kicker')} title={t('title')} standfirst={t('standfirst')}>
      {sitrep?.name_lists?.lists ? (
        <div className="fl-tiles">
          {sitrep.name_lists.lists.map((list: SitrepNameList) => (
            <div key={list.id}>
              <dd>{list.value.toLocaleString()}</dd>
              <dt>{lang === 'ne' ? list.label_ne || list.label_en : list.label_en}</dt>
            </div>
          ))}
        </div>
      ) : summary ? (
        <div className="fl-tiles">
          <div><dd>{summary.total.toLocaleString()}</dd><dt>{t('total')}</dt></div>
          <div><dd>{summary.nepali.toLocaleString()}</dd><dt>{t('nepali')}</dt></div>
          <div><dd>{summary.foreign.toLocaleString()}</dd><dt>{t('foreign')}</dt></div>
          {summary.byStatus.filter(s => s.count > 0).map(s => (
            <div key={s.id}>
              <dd>{s.count.toLocaleString()}</dd>
              <dt>{lang === 'ne' ? s.titleNe || s.title : s.title}</dt>
            </div>
          ))}
        </div>
      ) : null}

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
        ) : data.error ? (
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
                    <tr key={p.id} style={{ height: '40px' }}>
                      <th scope="row" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {lang === 'ne' ? p.nameNe || p.name || t('noName') : p.name || t('noName')}
                        {p.nationality && p.nationality !== 'nepali' && <em>{p.nationality}</em>}
                      </th>
                      <td className="num" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.age ?? '—'}
                      </td>
                      <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.rescuedAt ? (lang === 'ne' ? p.rescuedAt.titleNe || p.rescuedAt.title : p.rescuedAt.title) : '—'}
                      </td>
                      <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.stationedAt ? (lang === 'ne' ? p.stationedAt.titleNe || p.stationedAt.title : p.stationedAt.title) : '—'}
                      </td>
                      <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.status ? (lang === 'ne' ? p.status.titleNe || p.status.title : p.status.title) : <span className="fl-blank">{t('notRecorded')}</span>}
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
                  className={page === 0 ? 'off' : ''}
                  style={{ padding: '6px 12px', fontSize: '14px', borderRadius: '4px', border: '1px solid var(--line)', background: 'var(--bg-card)', cursor: page === 0 ? 'not-allowed' : 'pointer' }}
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
                  className={page === totalPages - 1 ? 'off' : ''}
                  style={{ padding: '6px 12px', fontSize: '14px', borderRadius: '4px', border: '1px solid var(--line)', background: 'var(--bg-card)', cursor: page === totalPages - 1 ? 'not-allowed' : 'pointer' }}
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

      <FloodFamilyRegister lang={lang} />

      <section className="fl-sec">
        <div className="fl-sec-head">
          <span>{lang === 'ne' ? 'सुधार' : 'Correction'}</span>
          <h2>{t('correctionTitle')}</h2>
        </div>
        <p className="fl-note">{t('correctionIntro')}</p>

        <form className="fl-upload" onSubmit={submitCorrection}>
          <label className="fl-field">
            <span>{t('correctionKind')}</span>
            <select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>
              <option value="wrong_details">{t('kWrong')}</option>
              <option value="not_safe">{t('kNotSafe')}</option>
              <option value="missing_person">{t('kMissing')}</option>
              <option value="remove_me">{t('kRemove')}</option>
              <option value="other">{t('kOther')}</option>
            </select>
          </label>
          <label className="fl-field">
            <span>{t('correctionMsg')}</span>
            <textarea rows={3} maxLength={2000} value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} />
          </label>
          <label className="fl-field">
            <span>{t('correctionContact')}</span>
            <input type="text" maxLength={200} value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} />
          </label>
          {formState === 'sent' && <p className="fl-upload-ok">{t('sent')}</p>}
          {formState === 'failed' && <p className="fl-upload-err">{t('sendFailed')}</p>}
          {formState === 'off' && <p className="fl-upload-err">{t('correctionOff')}</p>}
          <button type="submit" className="fl-upload-send" disabled={formState === 'sending' || !form.message.trim()}>
            {t('send')}
          </button>
        </form>
      </section>
    </FloodShell>
  );
}
