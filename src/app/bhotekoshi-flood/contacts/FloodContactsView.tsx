'use client';

import React, { useState } from 'react';
import FloodShell from '@/components/FloodShell';
import FloodWarehouses from '@/app/bhotekoshi-flood/_components/FloodWarehouses';
import { useFloodLang } from '@/hooks/use-flood-lang';
import { ageFrom } from '@/lib/relative-time';
import type { BipadDistrictContacts, FloodDeskPayload, FloodDistrictContacts, FloodOfficialFeed } from '@/types';
import { useDeskRefresh } from '@/hooks/use-desk-refresh';
import { useJumpSection } from '@/hooks/use-jump-section';

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
    en: 'National emergency lines first, then the warehouses that take in-kind goods, then district offices. Tap a number to call.',
    ne: 'पहिले राष्ट्रिय आपतकालीन नम्बर, त्यसपछि सामग्री बुझाउने गोदाम, अनि जिल्ला कार्यालय। फोन गर्न नम्बर थिच्नुहोस्।',
  },
  jumpLabel: { en: 'On this page', ne: 'यस पृष्ठमा' },
  jumpHint: { en: 'Tap a box to jump', ne: 'जान बाकस थिच्नुहोस्' },
  jumpNational: { en: 'National emergency lines', ne: 'राष्ट्रिय आपतकालीन नम्बर' },
  jumpNationalSub: { en: 'Free from any phone in Nepal', ne: 'नेपालभित्र कुनै पनि फोनबाट निःशुल्क' },
  jumpWarehouses: { en: 'Emergency warehouses', ne: 'आपत्कालीन गोदाम' },
  jumpWarehousesSub: { en: 'Where to hand in goods', ne: 'सामग्री कहाँ बुझाउने' },
  jumpDistricts: { en: 'District offices', ne: 'जिल्ला कार्यालय' },
  jumpDistrictsSub: { en: 'DAO, BIPAD, rescue portal', ne: 'जिप्रका, बिपद्, उद्धार पोर्टल' },
  national: { en: 'National emergency lines', ne: 'राष्ट्रिय आपतकालीन नम्बर' },
  warehousesTitle: { en: 'Emergency warehouses', ne: 'आपत्कालीन गोदाम' },
  warehousesIntro: {
    en: 'In-kind goods can be handed in here. Same drop-off list as on Donate. Tap a number to call.',
    ne: 'सामग्री यहाँ बुझाउन सकिन्छ। सहयोग पृष्ठकै बुझाउने सूची। फोन गर्न नम्बर थिच्नुहोस्।',
  },
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
  portalTitle: { en: 'From the OPMCM rescue portal', ne: 'प्रधानमन्त्री कार्यालयको उद्धार पोर्टलबाट' },
  portalNote: {
    en: 'Published on the Office of the Prime Minister’s rescue portal. Atlas reproduces the directory as listed there and has not separately checked each line.',
    ne: 'प्रधानमन्त्री कार्यालयको उद्धार पोर्टलमा प्रकाशित। एट्लसले त्यहाँ सूचीकृत विवरण जस्ताको तस्तै देखाउँछ र हरेक लाइन छुट्टै जाँचेको छैन।',
  },
  nationwide: { en: 'Nationwide', ne: 'देशव्यापी' },
  around: { en: '24/7', ne: '२४/७' },
  bipadTitle: { en: 'District offices, from the BIPAD Portal', ne: 'जिल्ला कार्यालय, बिपद् पोर्टलबाट' },
  bipadNote: {
    en: 'The local government’s own register on the Government of Nepal BIPAD Portal, re-read every few minutes. These are officials whose job is this response — chief district officers, disaster focal persons, municipal police. Atlas has not rung them, so treat them as the portal’s listing rather than a checked line, and use the verified national numbers above first.',
    ne: 'नेपाल सरकारको बिपद् पोर्टलमा रहेको स्थानीय सरकारकै नामावली, हरेक केही मिनेटमा पुनः पढिने। यी यही प्रतिकार्यमा खटिएका अधिकारी हुन् — प्रमुख जिल्ला अधिकारी, विपद् सम्पर्क अधिकृत, नगर प्रहरी। एट्लसले यी नम्बरमा फोन गरेर जाँचेको छैन, त्यसैले यसलाई पोर्टलको सूची मान्नुहोस्, र पहिले माथिका प्रमाणित राष्ट्रिय नम्बर प्रयोग गर्नुहोस्।',
  },
  drrFocal: { en: 'Disaster focal person', ne: 'विपद् सम्पर्क अधिकृत' },
  read: { en: 'Read', ne: 'पढिएको' },
};

const CATEGORY: Record<string, { en: string; ne: string }> = {
  POLICE: { en: 'Police', ne: 'प्रहरी' },
  AMBULANCE: { en: 'Ambulance', ne: 'एम्बुलेन्स' },
  FIRE: { en: 'Fire', ne: 'दमकल' },
  HOSPITAL: { en: 'Hospitals', ne: 'अस्पताल' },
  HEALTH: { en: 'Health', ne: 'स्वास्थ्य' },
  DISASTER: { en: 'Disaster response', ne: 'विपद् प्रतिकार्य' },
  ARMY: { en: 'Nepal Army', ne: 'नेपाली सेना' },
  RESCUE: { en: 'Rescue', ne: 'उद्धार' },
  HELPLINE: { en: 'Helplines', ne: 'हेल्पलाइन' },
  OTHER: { en: 'Other', ne: 'अन्य' },
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
  // Three hundred rows, and only this page wants them, so they ride their own
  // route rather than the desk payload every page loads.
  const [official, setOfficial] = useState<FloodOfficialFeed<BipadDistrictContacts> | null>(null);
  const t = (key: keyof typeof T) => T[key][lang];
  const onJump = useJumpSection(['national', 'warehouses', 'districts']);

  // Emergency numbers are the last thing that should go stale on an open tab.
  useDeskRefresh(
    React.useCallback(() => {
      fetch('/api/flood')
        .then(r => (r.ok ? r.json() : null))
        .then(d => {
          if (d) setData(d);
        })
        .catch(() => {});
      fetch('/api/flood/contacts')
        .then(r => (r.ok ? r.json() : null))
        .then(d => {
          if (d) setOfficial(d);
        })
        .catch(() => {});
    }, []),
  );

  const lines = data?.helplines?.lines || [];
  const primary = lines.filter(l => l.primary);
  const secondary = lines.filter(l => !l.primary);

  // Only districts someone has actually checked reach the page.
  const districts: FloodDistrictContacts[] = (data?.districtContacts?.districts || []).filter(
    d => d.verified && (d.contacts?.length ?? 0) > 0,
  );

  const label = (o: { label_en?: string; label_ne?: string }) =>
    (lang === 'ne' ? o.label_ne || o.label_en : o.label_en) || '';

  const warehouses = data?.reliefNeeded?.warehouses || [];
  const warehouseNote =
    lang === 'ne'
      ? data?.reliefNeeded?.warehouse_note_ne || data?.reliefNeeded?.warehouse_note_en
      : data?.reliefNeeded?.warehouse_note_en;

  return (
    <FloodShell lang={lang} setLang={setLang} kicker={t('kicker')} title={t('title')} standfirst={t('standfirst')}>
      <nav className="fl-jump" aria-label={t('jumpLabel')}>
        <p className="fl-jump-kicker">{t('jumpHint')}</p>
        <a href="#national" className={onJump === 'national' ? 'on' : undefined}>
          <b>1</b>
          <strong>{t('jumpNational')}</strong>
          <span>{t('jumpNationalSub')}</span>
        </a>
        <a href="#warehouses" className={onJump === 'warehouses' ? 'on' : undefined}>
          <b>2</b>
          <strong>{t('jumpWarehouses')}</strong>
          <span>
            {warehouses.length
              ? `${warehouses.length} ${lang === 'ne' ? 'ठाउँ' : 'sites'} · ${t('jumpWarehousesSub')}`
              : t('jumpWarehousesSub')}
          </span>
        </a>
        <a href="#districts" className={onJump === 'districts' ? 'on' : undefined}>
          <b>3</b>
          <strong>{t('jumpDistricts')}</strong>
          <span>{t('jumpDistrictsSub')}</span>
        </a>
      </nav>

      <section id="national" className="fl-sec">
        <div className="fl-sec-head">
          <span>{lang === 'ne' ? '१ · तत्काल' : '1 · Immediate'}</span>
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

      {warehouses.length > 0 && (
        <section id="warehouses" className="fl-sec fl-wh-sec">
          <div className="fl-sec-head">
            <span>{lang === 'ne' ? '२ · बुझाउने' : '2 · Drop-off'}</span>
            <h2>{t('warehousesTitle')}</h2>
            <em>{warehouses.length}</em>
          </div>
          <p className="fl-note">{t('warehousesIntro')}</p>
          <FloodWarehouses warehouses={warehouses} lang={lang} />
          {warehouseNote && <p className="fl-note">{warehouseNote}</p>}
          {data?.reliefNeeded?.sources && data.reliefNeeded.sources.length > 0 && (
            <p className="fl-note">
              {t('source')}
              {data.reliefNeeded.sources.map((src, i) => (
                <a key={i} href={src.url} target="_blank" rel="noopener noreferrer">
                  {' · '}
                  {src.label} &#8599;
                </a>
              ))}
            </p>
          )}
        </section>
      )}

      <section id="districts" className="fl-sec">
        <div className="fl-sec-head">
          <span>{lang === 'ne' ? '३ · जिल्ला' : '3 · District'}</span>
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

      {/* The government's live district register. It stands beside the reviewed
          block above rather than replacing it: the reviewed numbers were rung
          by a person, these were not, and the page says which is which. */}
      {(official?.items?.length ?? 0) > 0 && (
        <section className="fl-sec">
          <div className="fl-sec-head">
            <span>{lang === 'ne' ? 'प्रत्यक्ष' : 'Live'}</span>
            <h2>{t('bipadTitle')}</h2>
            <em>{(official?.items || []).reduce((n, d) => n + d.contacts.length, 0)}</em>
          </div>
          <p className="fl-note fl-pending">{t('bipadNote')}</p>
          {(official?.items || []).map(d => (
            <React.Fragment key={d.id}>
              <h4 className="fl-minor">{lang === 'ne' ? d.nameNe : d.name}</h4>
              <div className="fl-calls-more">
                {d.contacts.map(c => (
                  <a key={c.id} href={`tel:${c.phone}`}>
                    <b>{c.phone}</b>
                    <span>
                      {c.name}
                      {c.position ? ` · ${c.position}` : ''}
                      {c.drrFocal ? ` · ${t('drrFocal')}` : ''}
                    </span>
                  </a>
                ))}
              </div>
            </React.Fragment>
          ))}
          {official && (
            <p className="fl-note">
              {t('read')} {ageFrom(official.fetchedAt, lang)}
              {' · '}
              <a href={official.source.url} target="_blank" rel="noopener noreferrer">
                {official.source.label} &#8599;
              </a>
            </p>
          )}
        </section>
      )}

      {(() => {
        const contacts = data?.portalContacts?.items || [];
        if (!contacts.length) return null;
        const groups = new Map<string, typeof contacts>();
        for (const c of contacts) {
          const key = c.category || 'OTHER';
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(c);
        }
        return (
          <section className="fl-sec">
            <div className="fl-sec-head">
              <span>{lang === 'ne' ? 'पोर्टल' : 'Portal'}</span>
              <h2>{t('portalTitle')}</h2>
              <em>{contacts.length}</em>
            </div>
            <p className="fl-note fl-pending">{t('portalNote')}</p>
            {[...groups.entries()].map(([cat, list]) => {
              const catLabel = CATEGORY[cat] ? CATEGORY[cat][lang] : cat;
              return (
                <React.Fragment key={cat}>
                  <h4 className="fl-minor">{catLabel}</h4>
                  <div className="fl-calls-more">
                    {list.flatMap(c =>
                      c.phones.map(phone => (
                        <a key={`${c.id}-${phone}`} href={`tel:${phone}`}>
                          <b>{phone}</b>
                          <span>
                            {(lang === 'ne' ? c.nameNe || c.name : c.name) || c.organization}
                            {c.isNationwide ? ` · ${t('nationwide')}` : ''}
                            {c.available24x7 ? ` · ${t('around')}` : ''}
                          </span>
                        </a>
                      )),
                    )}
                  </div>
                </React.Fragment>
              );
            })}
            {data?.portalContacts && (
              <p className="fl-note">
                <a href={data.portalContacts.source.url} target="_blank" rel="noopener noreferrer">
                  {data.portalContacts.source.label} &#8599;
                </a>
              </p>
            )}
          </section>
        );
      })()}
    </FloodShell>
  );
}
