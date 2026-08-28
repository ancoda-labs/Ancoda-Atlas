'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { Lang } from '@/hooks/use-flood-lang';
import { ageFrom } from '@/lib/relative-time';
import type { OpmcmPersonRegister, OpmcmPersonReport } from '@/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// The OPMCM rescue portal's missing-and-found register.
//
// A third list beside the NDRRMA register and the community reports, and — like
// them — never merged into either. The same person can sit on all three under
// different spellings. Every field is the portal's, reproduced as published: a
// blank stays blank, and Atlas links back rather than pretending to be the
// record. The portal's coordinates on these rows are unreliable, so the place
// shown is the text the filer typed.

const T = {
  title: { en: 'OPMCM rescue portal', ne: 'प्रधानमन्त्री कार्यालय उद्धार पोर्टल' },
  intro: {
    en: 'Filed on the Office of the Prime Minister’s rescue portal, or imported there from District Administration Offices. Reproduced as published — not merged with the registers above.',
    ne: 'प्रधानमन्त्री कार्यालयको उद्धार पोर्टलमा दर्ता गरिएको वा जिल्ला प्रशासन कार्यालयबाट त्यहाँ ल्याइएको। प्रकाशित अवस्थामै देखाइएको — माथिका सूचीसँग मिसाइएको छैन।',
  },
  lost: { en: 'Reported lost', ne: 'हराएको जनाइएको' },
  found: { en: 'Reported found', ne: 'भेटिएको जनाइएको' },
  search: { en: 'Search this register', ne: 'यो सूचीमा खोज्नुहोस्' },
  showing: { en: 'showing', ne: 'देखाइएको' },
  name: { en: 'Name', ne: 'नाम' },
  age: { en: 'Age', ne: 'उमेर' },
  place: { en: 'Place', ne: 'स्थान' },
  when: { en: 'When', ne: 'कहिले' },
  status: { en: 'Status', ne: 'अवस्था' },
  noResults: { en: 'Nobody on this register matches that.', ne: 'यस सूचीमा त्यस्तो कोही भेटिएन।' },
  loading: { en: 'Loading…', ne: 'लोड हुँदै…' },
  unavailable: { en: 'The portal register cannot be reached right now.', ne: 'पोर्टल सूचीमा अहिले पहुँच भएन।' },
  updated: { en: 'Register read', ne: 'सूची पढिएको' },
  openPortal: { en: 'Open the portal', ne: 'पोर्टल खोल्नुहोस्' },
  details: { en: 'Details', ne: 'विवरण' },
  description: { en: 'Description', ne: 'विवरण' },
  office: { en: 'Registered by', ne: 'दर्ता गर्ने' },
  close: { en: 'Close', ne: 'बन्द गर्नुहोस्' },
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

const DEVA_DIGITS = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
const toNeDigits = (str: string) => str.replace(/[0-9]/g, d => DEVA_DIGITS[Number(d)]);

type Which = 'lost' | 'found';

export default function FloodOpmcmRegister({
  register,
  lang,
}: {
  register: OpmcmPersonRegister | null | undefined;
  lang: Lang;
}) {
  const t = (key: keyof typeof T) => T[key][lang];
  const [which, setWhich] = useState<Which>('lost');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<OpmcmPersonReport | null>(null);

  useEffect(() => {
    setPage(0);
  }, [which, q]);

  const list = which === 'lost' ? register?.lost || [] : register?.found || [];

  const rows = useMemo(() => {
    const needle = fold(q.trim());
    if (!needle) return list;
    return list.filter(p =>
      fold(`${p.name || ''} ${p.place || ''} ${p.description || ''} ${p.daoOffice || ''}`).includes(needle),
    );
  }, [list, q]);

  const PAGE_SIZE = 10;
  const paginated = useMemo(() => rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [rows, page]);
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);

  const truncate = (str: string | null, len: number) => {
    if (!str) return '—';
    return str.length > len ? str.slice(0, len) + '…' : str;
  };

  return (
    <section className="fl-sec">
      <div className="fl-sec-head">
        <span>{lang === 'ne' ? 'पोर्टल' : 'Portal'}</span>
        <h2>{t('title')}</h2>
        {register && <em>{rows.length} {t('showing')}</em>}
      </div>
      <p className="fl-note">{t('intro')}</p>

      <div className="fl-chips">
        <button className={which === 'lost' ? 'on' : ''} onClick={() => setWhich('lost')}>
          {t('lost')} {register ? `· ${register.lost.length}` : ''}
        </button>
        <button className={which === 'found' ? 'on' : ''} onClick={() => setWhich('found')}>
          {t('found')} {register ? `· ${register.found.length}` : ''}
        </button>
      </div>

      <input
        className="fl-search"
        type="search"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder={t('search')}
        autoComplete="off"
        style={{ marginBottom: '24px' }}
      />

      {!register ? (
        <p className="fl-empty">{t('loading')}</p>
      ) : register.error && !list.length ? (
        <p className="fl-empty">{t('unavailable')}</p>
      ) : rows.length === 0 ? (
        <p className="fl-empty">{t('noResults')}</p>
      ) : (
        <>
          <div className="fl-table-scroll" style={{ minHeight: '445px', maxHeight: '445px', overflowY: 'hidden', overflowX: 'hidden', width: '100%' }}>
            <table className="fl-register" style={{ tableLayout: 'fixed', width: '100%' }}>
              <thead>
                <tr style={{ height: '40px' }}>
                  <th style={{ width: '26%' }}>{t('name')}</th>
                  <th className="num" style={{ width: '10%' }}>{t('age')}</th>
                  <th style={{ width: '30%' }}>{t('place')}</th>
                  <th style={{ width: '18%' }}>{t('when')}</th>
                  <th style={{ width: '16%' }}>{t('status')}</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(p => (
                  <tr key={p.id} onClick={() => setSelected(p)} style={{ height: '40px', cursor: 'pointer' }}>
                    <th scope="row" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {truncate(p.name, 26)}
                    </th>
                    <td className="num">{p.age || '—'}</td>
                    <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {truncate(p.place, 30)}
                    </td>
                    <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.eventAt ? ageFrom(p.eventAt, lang) : '—'}
                    </td>
                    <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.daoStatus || p.status || <span className="fl-blank">—</span>}
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
        {t('updated')} {register ? ageFrom(register.fetchedAt, lang) : '—'}
        {register?.source && (
          <>
            {' · '}
            <a href={register.source.url} target="_blank" rel="noopener noreferrer">
              {t('openPortal')} &#8599;
            </a>
          </>
        )}
      </p>

      <Dialog open={selected !== null} onOpenChange={open => !open && setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('details')}</DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="space-y-3 text-sm leading-relaxed">
              {(selected.thumb || selected.imageProxy) && (
                <img
                  src={selected.imageProxy || selected.thumb || undefined}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="max-h-56 w-full rounded object-contain"
                />
              )}
              <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-2">
                <dt className="font-semibold text-foreground">{t('name')}</dt>
                <dd className="m-0 text-muted-foreground">{selected.name || '—'}</dd>
                <dt className="font-semibold text-foreground">{t('age')}</dt>
                <dd className="m-0 text-muted-foreground">{selected.age || '—'}</dd>
                <dt className="font-semibold text-foreground">{t('place')}</dt>
                <dd className="m-0 text-muted-foreground">{selected.place || '—'}</dd>
                <dt className="font-semibold text-foreground">{t('status')}</dt>
                <dd className="m-0 text-muted-foreground">{selected.daoStatus || selected.status || '—'}</dd>
                {selected.daoOffice && (
                  <>
                    <dt className="font-semibold text-foreground">{t('office')}</dt>
                    <dd className="m-0 text-muted-foreground">{selected.daoOffice}</dd>
                  </>
                )}
              </dl>
              {selected.description && (
                <div>
                  <p className="mb-1 border-b border-border pb-1 font-semibold text-foreground">{t('description')}</p>
                  <p className="m-0 whitespace-pre-wrap break-words text-muted-foreground">{selected.description}</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button className="w-full" onClick={() => setSelected(null)}>
              {t('close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
