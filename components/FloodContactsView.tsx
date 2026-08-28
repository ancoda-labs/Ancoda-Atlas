'use client';

import React, { useEffect, useState } from 'react';
import FloodShell from './FloodShell';
import { useFloodLang } from '@/lib/use-flood-lang';
import type { FloodDeskPayload, FloodDistrictContacts } from '@/lib/types';

// Every number a person in trouble might need, on one page.
//
// The rule that shapes this page: a district is rendered only if someone has
// marked its numbers verified. An unchecked emergency number is worse than no
// number, because it sends someone who needs help to a line that does not
// answer and costs them the minutes they had. Districts that are not verified
// are not shown as "unknown" — they are simply not shown, and the national
// helplines stand in their place.

const T = {
  kicker: { en: 'Contacts', ne: 'सम्पर्क' },
  title: { en: 'Who to call', ne: 'कसलाई फोन गर्ने' },
  standfirst: {
    en: 'These numbers are free from any phone in Nepal. Tap one to call.',
    ne: 'नेपालभित्र यी नम्बर कुनै पनि फोनबाट निःशुल्क छन्। फोन गर्न थिच्नुहोस्।',
  },
  national: { en: 'National emergency lines', ne: 'राष्ट्रिय आपतकालीन नम्बर' },
  otherLines: { en: 'Other national lines', ne: 'अन्य राष्ट्रिय नम्बर' },
  districts: { en: 'District contacts', ne: 'जिल्ला सम्पर्क' },
  tapToCall: { en: 'Tap to call', ne: 'फोन गर्न थिच्नुहोस्' },
  pending: {
    en: 'District-level numbers are not published here yet. Atlas will not show an emergency number it has not checked against an official source — a wrong number costs someone the minutes they had. Use the national lines above, which are verified, or contact your District Administration Office directly.',
    ne: 'जिल्लास्तरीय नम्बर अझै यहाँ प्रकाशित गरिएको छैन। आधिकारिक स्रोतबाट नजाँचिएको आपतकालीन नम्बर एट्लसले देखाउँदैन — गलत नम्बरले संकटमा परेको मानिसको बहुमूल्य समय खेर जान्छ। माथिका प्रमाणित राष्ट्रिय नम्बर प्रयोग गर्नुहोस्, वा सिधै जिल्ला प्रशासन कार्यालयलाई सम्पर्क गर्नुहोस्।',
  },
  loading: { en: 'Loading…', ne: 'लोड हुँदै…' },
  verifiedOn: { en: 'Numbers last checked', ne: 'नम्बर अन्तिम जाँचिएको' },
  source: { en: 'Source', ne: 'स्रोत' },
};

function PhoneIcon() {
  return (
    <svg className="fl-phone" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24 11.4 11.4 0 0 0 3.6.58 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.4 11.4 0 0 0 .58 3.6 1 1 0 0 1-.25 1z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function FloodContactsView() {
  const [lang, setLang] = useFloodLang();
  const [data, setData] = useState<FloodDeskPayload | null>(null);
  const t = (key: keyof typeof T) => T[key][lang];

  useEffect(() => {
    let cancelled = false;
    fetch('/api/flood')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!cancelled && d) setData(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const lines = data?.helplines?.lines || [];
  const primary = lines.filter(l => l.primary);
  const secondary = lines.filter(l => !l.primary);

  // Only districts someone has actually checked reach the page.
  const districts: FloodDistrictContacts[] = (data?.districtContacts?.districts || []).filter(
    d => d.verified && (d.contacts?.length ?? 0) > 0,
  );

  const label = (o: { label_en?: string; label_ne?: string }) =>
    (lang === 'ne' ? o.label_ne || o.label_en : o.label_en) || '';

  return (
    <FloodShell lang={lang} setLang={setLang} kicker={t('kicker')} title={t('title')} standfirst={t('standfirst')}>
      <section className="fl-sec">
        <div className="fl-sec-head">
          <span>{lang === 'ne' ? 'तत्काल' : 'Immediate'}</span>
          <h2>{t('national')}</h2>
        </div>

        {!data ? (
          <p className="fl-empty">{t('loading')}</p>
        ) : (
          <>
            <div className="fl-calls">
              {primary.map(line => (
                <a key={line.id} href={`tel:${line.number}`}>
                  <PhoneIcon />
                  <b>{line.number}</b>
                  <span>{label(line)}</span>
                  <em>{t('tapToCall')}</em>
                </a>
              ))}
            </div>

            {secondary.length > 0 && (
              <>
                <h4 className="fl-minor">{t('otherLines')}</h4>
                <div className="fl-calls-more">
                  {secondary.map(line => (
                    <a key={line.id} href={`tel:${line.number}`}>
                      <b>{line.number}</b>
                      <span>{label(line)}</span>
                    </a>
                  ))}
                </div>
              </>
            )}

            {data.helplines?.source_url && (
              <p className="fl-note">
                <a href={data.helplines.source_url} target="_blank" rel="noopener noreferrer">
                  {t('source')} &#8599;
                </a>
              </p>
            )}
          </>
        )}
      </section>

      <section className="fl-sec">
        <div className="fl-sec-head">
          <span>{lang === 'ne' ? 'जिल्ला' : 'District'}</span>
          <h2>{t('districts')}</h2>
          {districts.length > 0 && <em>{districts.length}</em>}
        </div>

        {districts.length === 0 ? (
          <p className="fl-note fl-pending">{t('pending')}</p>
        ) : (
          districts.map(d => (
            <React.Fragment key={d.id}>
              <h4 className="fl-minor">{lang === 'ne' ? d.name_ne || d.name_en : d.name_en}</h4>
              <div className="fl-calls-more">
                {(d.contacts || []).map((c, i) => (
                  <a key={i} href={`tel:${c.number}`}>
                    <b>{c.number}</b>
                    <span>{(lang === 'ne' ? c.role_ne || c.role_en : c.role_en) || ''}</span>
                  </a>
                ))}
              </div>
            </React.Fragment>
          ))
        )}

        {data?.districtContacts?.last_verified && (
          <p className="fl-note">
            {t('verifiedOn')} {data.districtContacts.last_verified}
          </p>
        )}
      </section>
    </FloodShell>
  );
}
