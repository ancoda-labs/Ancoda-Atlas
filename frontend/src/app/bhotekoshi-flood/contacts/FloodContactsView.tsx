'use client';

import React, { useState } from 'react';
import FloodShell from '@/components/FloodShell';
import FloodWarehouses from '@/app/bhotekoshi-flood/_components/FloodWarehouses';
import { useFloodLang } from '@/hooks/use-flood-lang';
import { ageFrom } from '@/lib/relative-time';
import type { BipadContact, BipadDistrictContacts, FloodDistrictContacts, FloodOfficialFeed } from '@/types';
import { useContacts } from '@/hooks/useFlood';
import { useJumpSection } from '@/hooks/use-jump-section';
import { useFloodDesk } from '@/app/bhotekoshi-flood/_components/FloodDeskProvider';
import {
  COLLAPSED_BUCKETS,
  normalizePhone,
  structureDistricts,
  type ContactBucket,
  type StructuredDistrict,
} from '@/lib/contact-groups';

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
  jumpDistrictsSub: { en: 'Focal persons, DAO, police', ne: 'सम्पर्क अधिकृत, जिप्रका, प्रहरी' },
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
    en: 'The local government’s own register on the Government of Nepal BIPAD Portal, grouped by role. Atlas has not rung them — use the verified national numbers above first. Ward chairs, committee members and volunteers are behind the summaries.',
    ne: 'नेपाल सरकारको बिपद् पोर्टलमा रहेको स्थानीय सरकारकै नामावली, भूमिकाअनुसार मिलाइएको। एट्लसले यी नम्बरमा फोन गरेर जाँचेको छैन — पहिले माथिका प्रमाणित राष्ट्रिय नम्बर प्रयोग गर्नुहोस्। वडा अध्यक्ष, समिति सदस्य र स्वयंसेवक सारांशभित्र छन्।',
  },
  drrFocal: { en: 'Disaster focal person', ne: 'विपद् सम्पर्क अधिकृत' },
  read: { en: 'Read', ne: 'पढिएको' },
  distJump: { en: 'Jump to a district', ne: 'जिल्लामा जानुहोस्' },
  uniqueLines: { en: 'unique lines', ne: 'फरक नम्बर' },
  loading: { en: 'Loading…', ne: 'लोड हुँदै…' },
};

const BUCKET: Record<ContactBucket, { en: string; ne: string }> = {
  focal: { en: 'Disaster focal persons', ne: 'विपद् सम्पर्क अधिकृत' },
  dao: { en: 'District administration', ne: 'जिल्ला प्रशासन' },
  security: { en: 'Police and army', ne: 'प्रहरी र सेना' },
  municipal: { en: 'Municipal leadership', ne: 'नगर / गाउँपालिका' },
  officers: { en: 'Other officers', ne: 'अन्य अधिकृत' },
  ward: { en: 'Ward chairs', ne: 'वडा अध्यक्ष' },
  committee: { en: 'Committee members', ne: 'समिति सदस्य' },
  volunteer: { en: 'Volunteers', ne: 'स्वयंसेवक' },
};

const CATEGORY: Record<string, { en: string; ne: string }> = {
  POLICE: { en: 'Police', ne: 'प्रहरी' },
  AMBULANCE: { en: 'Ambulance', ne: 'एम्बुलेन्स' },
  FIRE: { en: 'Fire', ne: 'दमकल' },
  HOSPITAL: { en: 'Hospitals', ne: 'अस्पताल' },
  HOSPITALS: { en: 'Hospitals', ne: 'अस्पताल' },
  HEALTH: { en: 'Health', ne: 'स्वास्थ्य' },
  DISASTER: { en: 'Disaster response', ne: 'विपद् प्रतिकार्य' },
  DISASTER_AUTHORITY: { en: 'Disaster response', ne: 'विपद् प्रतिकार्य' },
  ARMY: { en: 'Nepal Army', ne: 'नेपाली सेना' },
  RESCUE: { en: 'Rescue', ne: 'उद्धार' },
  RED_CROSS: { en: 'Red Cross', ne: 'रेडक्रस' },
  HELPLINE: { en: 'Helplines', ne: 'हेल्पलाइन' },
  HELPLINES: { en: 'Helplines', ne: 'हेल्पलाइन' },
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

function telHref(phone: string): string {
  const digits = normalizePhone(phone) || phone.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('9')) return `tel:+977${digits}`;
  return `tel:${digits || phone}`;
}

function bucketCollapsed(bucket: ContactBucket, count: number): boolean {
  if (COLLAPSED_BUCKETS.has(bucket)) return true;
  return bucket === 'officers' && count > 8;
}

function hasDevanagari(s: string): boolean {
  return /[\u0900-\u097F]/.test(s);
}

/** Show the script that matches the page language first. */
function displayMergedName(name: string, lang: 'en' | 'ne'): string {
  const parts = name.split(' / ').map(p => p.trim()).filter(Boolean);
  if (parts.length < 2) return name;
  return [...parts]
    .sort((a, b) => {
      const aNe = hasDevanagari(a);
      const bNe = hasDevanagari(b);
      if (aNe === bNe) return 0;
      return lang === 'ne' ? (aNe ? -1 : 1) : aNe ? 1 : -1;
    })
    .join(' / ');
}

function BipadRow({ contact, lang }: { contact: BipadContact; lang: 'en' | 'ne' }) {
  if (!contact.phone) return null;
  return (
    <a href={telHref(contact.phone)}>
      <b>{contact.phone}</b>
      <span>
        {displayMergedName(contact.name || '', lang)}
        {contact.position ? ` · ${contact.position}` : ''}
      </span>
    </a>
  );
}

function DistrictDirectory({
  district,
  lang,
}: {
  district: StructuredDistrict;
  lang: 'en' | 'ne';
}) {
  return (
    <article id={`district-${district.slug}`} className="fl-dist">
      <h3>
        {lang === 'ne' ? district.nameNe : district.name}
        <em>
          {district.unique} {lang === 'ne' ? 'नम्बर' : 'lines'}
        </em>
      </h3>
      {district.groups.map(group => {
        const title = `${BUCKET[group.bucket][lang]} · ${group.contacts.length}`;
        const body = (
          <div className="fl-calls-more">
            {group.contacts.map(c => (
              <BipadRow key={c.id} contact={c} lang={lang} />
            ))}
          </div>
        );
        if (bucketCollapsed(group.bucket, group.contacts.length)) {
          return (
            <details key={group.bucket} className="fl-dist-more">
              <summary>{title}</summary>
              {body}
            </details>
          );
        }
        return (
          <React.Fragment key={group.bucket}>
            <h4 className="fl-minor">{title}</h4>
            {body}
          </React.Fragment>
        );
      })}
    </article>
  );
}

export default function FloodContactsView() {
  const [lang, setLang] = useFloodLang();
  const { desk: data } = useFloodDesk();
  // Three hundred rows, and only this page wants them, so they ride their own
  // route rather than the desk payload every page loads.
  // Emergency numbers are the last thing that should go stale on an open tab.
  const { data: official = null } = useContacts();
  const t = (key: keyof typeof T) => T[key][lang];
  const onJump = useJumpSection(['national', 'warehouses', 'districts']);

  const lines = data?.helplines?.lines || [];
  const primary = lines.filter(l => l.primary);
  const secondary = lines.filter(l => !l.primary);

  // Only districts someone has actually checked reach the page.
  const districts: FloodDistrictContacts[] = (data?.districtContacts?.districts || []).filter(
    d => d.verified && (d.contacts?.length ?? 0) > 0,
  );
  const directory = structureDistricts(official?.items || []);
  const uniqueLines = directory.reduce((n, d) => n + d.unique, 0);

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
          <span>
            {uniqueLines
              ? `${uniqueLines} ${t('uniqueLines')}`
              : t('jumpDistrictsSub')}
          </span>
        </a>
      </nav>

      <section id="national" className="fl-sec">
        <div className="fl-sec-head">
          <span>{lang === 'ne' ? '१ · तत्काल' : '1 · Immediate'}</span>
          <h2>{t('national')}</h2>
        </div>

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
          {uniqueLines > 0 && <em>{uniqueLines}</em>}
        </div>

        {districts.length > 0 &&
          districts.map(d => (
            <React.Fragment key={d.id}>
              <h4 className="fl-minor">{lang === 'ne' ? d.name_ne || d.name_en : d.name_en}</h4>
              <div className="fl-calls-more">
                {(d.contacts || []).map((c, i) => (
                  <a key={i} href={telHref(c.number)}>
                    <b>{c.number}</b>
                    <span>{(lang === 'ne' ? c.role_ne || c.role_en : c.role_en) || ''}</span>
                  </a>
                ))}
              </div>
            </React.Fragment>
          ))}

        {official === null ? null : directory.length === 0 && districts.length === 0 ? (
          <p className="fl-note fl-pending">{t('pending')}</p>
        ) : null}

        {directory.length > 0 && (
          <>
            <p className="fl-note fl-pending">{t('bipadNote')}</p>
            <nav className="fl-dist-toc" aria-label={t('distJump')}>
              {directory.map(d => (
                <a key={d.id} href={`#district-${d.slug}`}>
                  {lang === 'ne' ? d.nameNe : d.name}
                  <em>{d.unique}</em>
                </a>
              ))}
            </nav>
            {directory.map(d => (
              <DistrictDirectory key={d.id} district={d} lang={lang} />
            ))}
            {official && (
              <p className="fl-note">
                {t('read')} {ageFrom(official.fetchedAt, lang)}
                {' · '}
                {uniqueLines} {t('uniqueLines')}
                {' · '}
                <a href={official.source.url} target="_blank" rel="noopener noreferrer">
                  {official.source.label} &#8599;
                </a>
              </p>
            )}
          </>
        )}

        {data?.districtContacts?.last_verified && (
          <p className="fl-note">
            {t('verifiedOn')} {data.districtContacts.last_verified}
          </p>
        )}
      </section>

      {(() => {
        const contacts = data?.portalContacts?.items || [];
        if (!contacts.length) return null;
        const groups = new Map<string, typeof contacts>();
        for (const c of contacts) {
          const key = c.category || 'OTHER';
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(c);
        }
        const seen = new Set<string>();
        return (
          <section className="fl-sec">
            <div className="fl-sec-head">
              <span>{lang === 'ne' ? 'पोर्टल' : 'Portal'}</span>
              <h2>{t('portalTitle')}</h2>
              <em>{contacts.length}</em>
            </div>
            <p className="fl-note fl-pending">{t('portalNote')}</p>
            {[...groups.entries()].map(([cat, list]) => {
              const catLabel = CATEGORY[cat]
                ? CATEGORY[cat][lang]
                : cat.replace(/_/g, ' ').toLowerCase();
              return (
                <React.Fragment key={cat}>
                  <h4 className="fl-minor">{catLabel}</h4>
                  <div className="fl-calls-more">
                    {list.flatMap(c =>
                      c.phones.flatMap(phone => {
                        const key = normalizePhone(phone) || phone;
                        if (seen.has(`${cat}:${key}`)) return [];
                        seen.add(`${cat}:${key}`);
                        return [
                          <a key={`${c.id}-${phone}`} href={telHref(phone)}>
                            <b>{phone}</b>
                            <span>
                              {(lang === 'ne' ? c.nameNe || c.name : c.name) || c.organization}
                              {c.isNationwide ? ` · ${t('nationwide')}` : ''}
                              {c.available24x7 ? ` · ${t('around')}` : ''}
                            </span>
                          </a>,
                        ];
                      }),
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
