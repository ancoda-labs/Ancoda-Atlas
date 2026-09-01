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
  kicker: { en: 'Missing people', ne: 'हराएका व्यक्ति' },
  title: { en: 'Search missing-person reports', ne: 'हराएका व्यक्तिका रिपोर्ट खोज्नुहोस्' },
  intro: {
    en: 'Families filed these reports of people still missing — on the Prime Minister’s rescue portal, or through a District Administration Office. Search by name. This is not the NDRRMA rescued register above.',
    ne: 'परिवारले अझै हराएका व्यक्तिका लागि प्रधानमन्त्री कार्यालयको उद्धार पोर्टल वा जिल्ला प्रशासन कार्यालयमार्फत दर्ता गरेका रिपोर्ट। नाम लेखेर खोज्नुहोस्। माथिको एनडीआरआरएमए उद्धार सूची होइन।',
  },
  caveat: {
    en: 'These count reports, not people. One person is often listed more than once, and a family who finds someone rarely comes back to close the report. Do not add this number to the official uncontacted figure.',
    ne: 'यी रिपोर्टको संख्या हुन्, व्यक्तिको होइन। एउटै व्यक्तिका लागि धेरै रिपोर्ट हुन सक्छन्, र भेटिएपछि रिपोर्ट बन्द गर्न फर्किने कम हुन्छन्। आधिकारिक सम्पर्कविहीन संख्यामा नजोड्नुहोस्।',
  },
  lost: { en: 'Still missing', ne: 'अझै हराइरहेका' },
  found: { en: 'Reported found', ne: 'भेटिएको जनाइएको' },
  other: { en: 'Filed otherwise', ne: 'अन्य रूपमा दर्ता' },
  shortRead: {
    en: 'The portal states more reports than were read on the last sweep, so a few of the newest may be missing. It is re-read every ten minutes.',
    ne: 'पोर्टलले पढिएकोभन्दा बढी विवरण रहेको जनाएको छ, त्यसैले पछिल्ला केही छुट्न सक्छन्। हरेक दस मिनेटमा पुनः पढिन्छ।',
  },
  searchLost: { en: 'Search a missing person’s name', ne: 'हराएका व्यक्तिको नाम खोज्नुहोस्' },
  searchFound: { en: 'Search a found person’s name', ne: 'भेटिएका व्यक्तिको नाम खोज्नुहोस्' },
  reports: { en: 'reports', ne: 'रिपोर्ट' },
  name: { en: 'Name', ne: 'नाम' },
  age: { en: 'Age', ne: 'उमेर' },
  place: { en: 'Place last seen', ne: 'अन्तिम देखिएको स्थान' },
  when: { en: 'Reported', ne: 'रिपोर्ट' },
  status: { en: 'Status', ne: 'अवस्था' },
  noResults: {
    en: 'Nobody on this missing-person list matches that. Try another spelling, or file a report on the portal.',
    ne: 'यो हराएका व्यक्तिको सूचीमा त्यस्तो कोही भेटिएन। अर्को हिज्जे प्रयास गर्नुहोस्, वा पोर्टलमा रिपोर्ट दर्ता गर्नुहोस्।',
  },
  loading: { en: 'Loading missing-person reports…', ne: 'हराएका व्यक्तिका रिपोर्ट लोड हुँदै…' },
  unavailable: {
    en: 'The missing-person register cannot be reached right now. Try the portal directly.',
    ne: 'हराएका व्यक्तिको सूचीमा अहिले पहुँच भएन। सिधै पोर्टल हेर्नुहोस्।',
  },
  updated: { en: 'Reports read', ne: 'रिपोर्ट पढिएको' },
  openPortal: { en: 'File a missing-person report on the portal', ne: 'पोर्टलमा हराएको रिपोर्ट दर्ता गर्नुहोस्' },
  details: { en: 'Missing-person report', ne: 'हराएका व्यक्तिको रिपोर्ट' },
  description: { en: 'Description', ne: 'विवरण' },
  office: { en: 'Registered by', ne: 'दर्ता गर्ने' },
  close: { en: 'Close', ne: 'बन्द गर्नुहोस्' },
};

import {
  foldName,
  matchScore,
  parseAgeField,
  parsePersonQuery,
} from '@/lib/person-search';

const DEVA_DIGITS = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
const toNeDigits = (str: string) => str.replace(/[0-9]/g, d => DEVA_DIGITS[Number(d)]);

type Which = 'lost' | 'found' | 'other';

export default function FloodOpmcmRegister({
  register,
  lang,
  query,
  hideSearch = false,
  which: whichProp,
}: {
  register: OpmcmPersonRegister | null | undefined;
  lang: Lang;
  /** When set, this list follows the page search instead of its own box. */
  query?: string;
  hideSearch?: boolean;
  which?: Which;
}) {
  const t = (key: keyof typeof T) => T[key][lang];
  const [which, setWhich] = useState<Which>(whichProp || 'lost');
  const [qLocal, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<OpmcmPersonReport | null>(null);

  const q = query != null ? query : qLocal;

  useEffect(() => {
    setPage(0);
  }, [which, q]);

  useEffect(() => {
    if (whichProp) setWhich(whichProp);
  }, [whichProp]);

  const list =
    which === 'lost'
      ? register?.lost ?? []
      : which === 'found'
        ? register?.found ?? []
        : register?.other ?? [];

  const parsed = useMemo(() => parsePersonQuery(q), [q]);

  const rows = useMemo(() => {
    if (!parsed.raw) return list;
    const ranked: Array<{ row: (typeof list)[number]; score: number }> = [];
    for (const p of list) {
      const foldedName = foldName(p.name || '');
      const foldedHay = foldName(`${p.name || ''} ${p.place || ''} ${p.description || ''} ${p.daoOffice || ''} ${p.status || ''} ${p.daoStatus || ''}`);
      const score = matchScore({
        foldedName,
        foldedHay,
        age: parseAgeField(p.age),
        query: parsed,
      });
      if (score > 0) ranked.push({ row: p, score });
    }
    ranked.sort((a, b) => b.score - a.score);
    return ranked.map(r => r.row);
  }, [list, parsed]);

  const PAGE_SIZE = 10;
  const paginated = useMemo(() => rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [rows, page]);
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);

  const truncate = (str: string | null, len: number) => {
    if (!str) return '—';
    return str.length > len ? str.slice(0, len) + '…' : str;
  };

  const countLabel = `${rows.length.toLocaleString()} ${t('reports')}`;

  return (
    <section className="fl-sec" id="missing" aria-labelledby="fl-missing-title">
      <div className="fl-sec-head">
        <span>{t('kicker')}</span>
        <h2 id="fl-missing-title">{hideSearch ? (lang === 'ne' ? 'हराएका व्यक्तिका रिपोर्ट' : 'Missing-person reports') : t('title')}</h2>
        {register && <em className={which === 'lost' ? 'warn' : undefined}>{countLabel}</em>}
      </div>
      <p className="fl-note">{t('intro')}</p>
      <p className="fl-fig-warn">
        <b>{lang === 'ne' ? 'जोड्नुहोस् नहोस्।' : 'Do not add these up.'}</b> {t('caveat')}
      </p>

      {/* The portal is written to while it is read, so `total` can move between
          the first page and the last. A sweep that came up short says so rather
          than letting a family assume the name they searched for is not there. */}
      {register && register.total != null && register.fetched < register.total && (
        <p className="fl-note fl-pending">{t('shortRead')}</p>
      )}

      <div className="fl-chips">
        <button type="button" className={which === 'lost' ? 'on' : ''} onClick={() => setWhich('lost')} aria-pressed={which === 'lost'}>
          {t('lost')} {register ? `· ${(register.lost?.length ?? 0).toLocaleString()}` : ''}
        </button>
        <button type="button" className={which === 'found' ? 'on' : ''} onClick={() => setWhich('found')} aria-pressed={which === 'found'}>
          {t('found')} {register ? `· ${(register.found?.length ?? 0).toLocaleString()}` : ''}
        </button>
        {/* Guarded on the field, not just the object. A register handed to this
            component can predate the field — the refresher restores its last
            store from disk across a deploy — and an unguarded `.length` here
            takes the whole page down for someone searching for a relative. */}
        {(register?.other?.length ?? 0) > 0 && (
          <button type="button" className={which === 'other' ? 'on' : ''} onClick={() => setWhich('other')} aria-pressed={which === 'other'}>
            {t('other')} · {(register?.other?.length ?? 0).toLocaleString()}
          </button>
        )}
      </div>

      {!hideSearch && (
      <input
        className="fl-search"
        type="search"
        value={qLocal}
        onChange={e => setQ(e.target.value)}
        placeholder={which === 'found' ? t('searchFound') : t('searchLost')}
        autoComplete="off"
        aria-label={which === 'found' ? t('searchFound') : t('searchLost')}
        style={{ marginBottom: '24px' }}
      />
      )}

      {!register ? (
        <p className="fl-empty">{t('loading')}</p>
      ) : register.error && !list.length ? (
        <p className="fl-empty">{t('unavailable')}</p>
      ) : rows.length === 0 ? (
        <p className="fl-empty">{t('noResults')}</p>
      ) : (
        <>
          <div className="fl-table-scroll" style={{ minHeight: '445px', maxHeight: '445px', overflowY: 'hidden', overflowX: 'hidden', width: '100%' }}>
            <table className="fl-register" style={{ tableLayout: 'fixed', width: '100%' }} aria-label={t('title')}>
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
            <DialogTitle>{selected?.name || t('details')}</DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="space-y-3 text-sm leading-relaxed">
              {selected.imageProxy && (
                <img
                  src={selected.imageProxy}
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
