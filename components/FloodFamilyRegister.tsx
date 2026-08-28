'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { Lang } from '@/lib/use-flood-lang';
import { ageFrom } from '@/lib/relative-time';
import type { FamilyPerson, FamilyRegister } from '@/lib/types';

// The community missing-and-found register.
//
// Sits beside the official NDRRMA register rather than inside it, and the two
// are never merged. The same person can appear on both under two spellings, and
// quietly reconciling them would either hide someone still missing or tell a
// family their relative is safe when nobody has confirmed it. So the counts
// stay separate and the page says which register a name came from.
//
// Contact numbers are shown because they are the mechanism: this register works
// by someone who has found a person ringing the family who is looking.

const T = {
  title: { en: 'Community reports', ne: 'सामुदायिक जानकारी' },
  intro: {
    en: 'Filed by families and members of the public through public forms. Not an official list — the official register is the NDRRMA one above, and these counts are never added to it.',
    ne: 'परिवार र सर्वसाधारणले सार्वजनिक फारमबाट पठाएको। यो आधिकारिक सूची होइन — आधिकारिक सूची माथिको एनडीआरआरएमए हो, र यी संख्या त्यसमा जोडिँदैनन्।',
  },
  missing: { en: 'Reported missing', ne: 'हराएको जनाइएको' },
  found: { en: 'Reported found', ne: 'भेटिएको जनाइएको' },
  search: { en: 'Search these reports', ne: 'यी जानकारीमा खोज्नुहोस्' },
  showing: { en: 'showing', ne: 'देखाइएको' },
  name: { en: 'Name', ne: 'नाम' },
  age: { en: 'Age', ne: 'उमेर' },
  place: { en: 'Place', ne: 'स्थान' },
  contact: { en: 'Contact', ne: 'सम्पर्क' },
  note: { en: 'Note', ne: 'टिप्पणी' },
  noResults: { en: 'No reports match that.', ne: 'त्यस्तो कुनै जानकारी भेटिएन।' },
  loading: { en: 'Loading…', ne: 'लोड हुँदै…' },
  unavailable: { en: 'The community register cannot be reached right now.', ne: 'सामुदायिक सूचीमा अहिले पहुँच भएन।' },
  updated: { en: 'Register updated', ne: 'सूची अद्यावधिक' },
  reportMissing: { en: 'Report someone missing', ne: 'हराएको जनाउनुहोस्' },
  reportFound: { en: 'Report someone found', ne: 'भेटिएको जनाउनुहोस्' },
  callHint: { en: 'Tap a number to call the family who filed the report.', ne: 'जानकारी दिने परिवारलाई फोन गर्न नम्बर थिच्नुहोस्।' },
};

/** Loose fold so a family finds a relative despite a different transliteration. */
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

type Which = 'missing' | 'found';

export default function FloodFamilyRegister({ lang }: { lang: Lang }) {
  const [data, setData] = useState<FamilyRegister | null>(null);
  const [which, setWhich] = useState<Which>('missing');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [selectedPerson, setSelectedPerson] = useState<FamilyPerson | null>(null);
  const t = (key: keyof typeof T) => T[key][lang];

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch('/api/flood/family')
        .then(r => (r.ok ? r.json() : null))
        .then(d => {
          if (!cancelled && d) setData(d);
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    setPage(0);
  }, [which, q]);

  const rows: FamilyPerson[] = useMemo(() => {
    const list = which === 'missing' ? data?.missing || [] : data?.found || [];
    const needle = fold(q.trim());
    if (!needle) return list;
    return list.filter(p => fold(`${p.name || ''} ${p.place || ''} ${p.note || ''}`).includes(needle));
  }, [data, which, q]);

  const PAGE_SIZE = 10;

  const paginatedRows = useMemo(() => {
    return rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  }, [rows, page]);

  const totalPages = useMemo(() => {
    return Math.ceil(rows.length / PAGE_SIZE);
  }, [rows]);

  const toNeDigits = (str: string) => {
    const DEVA_DIGITS = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
    return str.replace(/[0-9]/g, d => DEVA_DIGITS[Number(d)]);
  };

  const truncate = (str: string, len: number) => {
    if (!str) return '—';
    return str.length > len ? str.slice(0, len) + '...' : str;
  };

  return (
    <section className="fl-sec">
      <div className="fl-sec-head">
        <span>{lang === 'ne' ? 'सामुदायिक' : 'Community'}</span>
        <h2>{t('title')}</h2>
        {data && <em>{rows.length} {t('showing')}</em>}
      </div>
      <p className="fl-note">{t('intro')}</p>

      <div className="fl-chips">
        <button className={which === 'missing' ? 'on' : ''} onClick={() => setWhich('missing')}>
          {t('missing')} {data ? `· ${data.counts.missing}` : ''}
        </button>
        <button className={which === 'found' ? 'on' : ''} onClick={() => setWhich('found')}>
          {t('found')} {data ? `· ${data.counts.found}` : ''}
        </button>
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
      <p className="fl-field-hint" style={{ marginBottom: '24px' }}>{t('callHint')}</p>

      {!data ? (
        <p className="fl-empty">{t('loading')}</p>
      ) : data.error ? (
        <p className="fl-empty">{t('unavailable')}</p>
      ) : rows.length === 0 ? (
        <p className="fl-empty">{t('noResults')}</p>
      ) : (
        <>
          <div className="fl-table-scroll" style={{ minHeight: '445px', maxHeight: '445px', overflowY: 'hidden', overflowX: 'hidden', width: '100%' }}>
            <table className="fl-register" style={{ tableLayout: 'fixed', width: '100%' }}>
              <thead>
                <tr style={{ height: '40px' }}>
                  <th style={{ width: '22%' }}>{t('name')}</th>
                  <th className="num" style={{ width: '10%' }}>{t('age')}</th>
                  <th style={{ width: '22%' }}>{t('place')}</th>
                  <th style={{ width: '22%' }}>{t('contact')}</th>
                  <th style={{ width: '24%' }}>{t('note')}</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map(p => (
                  <tr key={p.id} onClick={() => setSelectedPerson(p)} style={{ height: '40px', cursor: 'pointer' }}>
                    <th scope="row" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {truncate(p.name || '', 25)}
                    </th>
                    <td className="num">{p.age || '—'}</td>
                    <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {truncate(p.place || '', 25)}
                    </td>
                    <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.phone
                        ? p.phone.split('/').map(n => (
                            <a key={n} className="fl-tel" href={`tel:${n.replace(/\s/g, '')}`} onClick={e => e.stopPropagation()}>
                              {n.trim()}
                            </a>
                          ))
                        : '—'}
                    </td>
                    <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {truncate(p.note || '', 30)}
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
        {t('updated')} {data?.updatedAt ? ageFrom(data.updatedAt, lang) : '—'}
        {data?.forms?.missing && (
          <>
            {' · '}
            <a href={data.forms.missing} target="_blank" rel="noopener noreferrer">{t('reportMissing')} &#8599;</a>
          </>
        )}
        {data?.forms?.found && (
          <>
            {' · '}
            <a href={data.forms.found} target="_blank" rel="noopener noreferrer">{t('reportFound')} &#8599;</a>
          </>
        )}
        {data?.source && (
          <>
            {' · '}
            <a href={data.source.url} target="_blank" rel="noopener noreferrer">{data.source.label} &#8599;</a>
          </>
        )}
      </p>

      {selectedPerson && (
        <div className="fl-lightbox" onClick={() => setSelectedPerson(null)} role="dialog" aria-modal="true">
          <div onClick={e => e.stopPropagation()} className="fl-dialog-content" style={{ maxWidth: '480px', width: '90%', padding: '24px', background: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--line)', margin: 'auto' }}>
            <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '20px', borderBottom: '1px solid var(--line)', paddingBottom: '8px', color: 'var(--ink-1)' }}>
              {lang === 'ne' ? 'विवरण' : 'Details'}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '12px 8px', fontSize: '15px', lineHeight: 1.5, color: 'var(--ink-2)' }}>
              <strong>{t('name')}:</strong>
              <span>{selectedPerson.name || '—'}</span>
              
              <strong>{t('age')}:</strong>
              <span>{selectedPerson.age || '—'}</span>
              
              <strong>{t('place')}:</strong>
              <span>{selectedPerson.place || '—'}</span>
              
              <strong>{t('contact')}:</strong>
              <span>
                {selectedPerson.phone
                  ? selectedPerson.phone.split('/').map(n => (
                      <a key={n} style={{ display: 'block', color: 'var(--accent)', textDecoration: 'underline' }} href={`tel:${n.replace(/\s/g, '')}`} onClick={e => e.stopPropagation()}>
                        {n.trim()}
                      </a>
                    ))
                  : '—'}
              </span>
              
              <strong style={{ gridColumn: 'span 2', marginTop: '8px', borderBottom: '1px solid var(--line)', paddingBottom: '4px' }}>
                {t('note')}:
              </strong>
              <span style={{ gridColumn: 'span 2', color: 'var(--ink-3)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {selectedPerson.note || '—'}
              </span>
            </div>
            
            <button
              onClick={() => setSelectedPerson(null)}
              style={{ marginTop: '24px', width: '100%', padding: '10px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
            >
              {lang === 'ne' ? 'बन्द गर्नुहोस्' : 'Close'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
