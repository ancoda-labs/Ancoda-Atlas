'use client';

import React, { useEffect, useMemo, useState } from 'react';
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
  COLLAPSED_PORTAL_BUCKETS,
  dialKey,
  filterDirectory,
  filterPortalDirectory,
  foldHay,
  normalizePhone,
  parseContactQuery,
  structureDistricts,
  structurePortalContacts,
  type ContactBucket,
  type PortalBucket,
  type PortalLine,
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
    en: 'National emergency lines first, then the warehouses that take in-kind goods, then district offices, then the Prime Minister’s rescue-portal directory. Tap a number to call.',
    ne: 'पहिले राष्ट्रिय आपतकालीन नम्बर, त्यसपछि सामग्री बुझाउने गोदाम, जिल्ला कार्यालय, अनि प्रधानमन्त्री कार्यालयको उद्धार पोर्टलको सूची। फोन गर्न नम्बर थिच्नुहोस्।',
  },
  jumpLabel: { en: 'On this page', ne: 'यस पृष्ठमा' },
  jumpHint: { en: 'Tap a box to jump', ne: 'जान बाकस थिच्नुहोस्' },
  jumpNational: { en: 'National emergency lines', ne: 'राष्ट्रिय आपतकालीन नम्बर' },
  jumpNationalSub: { en: 'Free from any phone in Nepal', ne: 'नेपालभित्र कुनै पनि फोनबाट निःशुल्क' },
  jumpWarehouses: { en: 'Emergency warehouses', ne: 'आपत्कालीन गोदाम' },
  jumpWarehousesSub: { en: 'Where to hand in goods', ne: 'सामग्री कहाँ बुझाउने' },
  jumpDistricts: { en: 'District offices', ne: 'जिल्ला कार्यालय' },
  jumpDistrictsSub: { en: 'Pick a district', ne: 'जिल्ला छान्नुहोस्' },
  jumpPortal: { en: 'OPMCM rescue portal', ne: 'उद्धार पोर्टल' },
  jumpPortalSub: { en: 'Prime Minister’s Office directory', ne: 'प्रधानमन्त्री कार्यालयको सूची' },
  jumpSites: { en: 'sites', ne: 'ठाउँ' },
  jumpSite: { en: 'site', ne: 'ठाउँ' },
  jumpLines: { en: 'lines', ne: 'नम्बर' },
  jumpLine: { en: 'line', ne: 'नम्बर' },
  national: { en: 'National emergency lines', ne: 'राष्ट्रिय आपतकालीन नम्बर' },
  warehousesTitle: { en: 'Emergency warehouses', ne: 'आपत्कालीन गोदाम' },
  warehousesIntro: {
    en: 'In-kind goods can be handed in here. Same drop-off list as on Donate. Tap a number to call.',
    ne: 'सामग्री यहाँ बुझाउन सकिन्छ। सहयोग पृष्ठकै बुझाउने सूची। फोन गर्न नम्बर थिच्नुहोस्।',
  },
  otherLines: { en: 'Other national lines', ne: 'अन्य राष्ट्रिय नम्बर' },
  districts: { en: 'District contacts', ne: 'जिल्ला सम्पर्क' },
  districtsIntro: {
    en: 'Pick a district. These are the local government’s own numbers on the BIPAD Portal, grouped by role. Atlas has not rung them — use the national lines above first.',
    ne: 'जिल्ला छान्नुहोस्। यी नेपाल सरकारको बिपद् पोर्टलमा रहेका स्थानीय सरकारकै नम्बर हुन्, भूमिकाअनुसार मिलाइएका। एट्लसले फोन गरेर जाँचेको छैन — पहिले माथिका राष्ट्रिय नम्बर प्रयोग गर्नुहोस्।',
  },
  districtCount: { en: 'districts', ne: 'जिल्ला' },
  pickDistrict: {
    en: 'Open a district to see who to call there. Ward chairs, committee members and volunteers are behind the summaries inside.',
    ne: 'त्यहाँ कसलाई फोन गर्ने हेर्न जिल्ला खोल्नुहोस्। वडा अध्यक्ष, समिति सदस्य र स्वयंसेवक भित्रका सारांशमा छन्।',
  },
  tapToCall: { en: 'Tap to call', ne: 'फोन गर्न थिच्नुहोस्' },
  pending: {
    en: 'District-level numbers are not published here yet. Atlas will not show an emergency number it has not checked against an official source — a wrong number costs someone the minutes they had. Use the national lines above, which are verified, or contact your District Administration Office directly.',
    ne: 'जिल्लास्तरीय नम्बर अझै यहाँ प्रकाशित गरिएको छैन। आधिकारिक स्रोतबाट नजाँचिएको आपतकालीन नम्बर एट्लसले देखाउँदैन — गलत नम्बरले संकटमा परेको मानिसको बहुमूल्य समय खेर जान्छ। माथिका प्रमाणित राष्ट्रिय नम्बर प्रयोग गर्नुहोस्, वा सिधै जिल्ला प्रशासन कार्यालयलाई सम्पर्क गर्नुहोस्।',
  },
  verifiedOn: { en: 'Numbers last checked', ne: 'नम्बर अन्तिम जाँचिएको' },
  source: { en: 'Source', ne: 'स्रोत' },
  portalTitle: { en: 'From the OPMCM rescue portal', ne: 'प्रधानमन्त्री कार्यालयको उद्धार पोर्टलबाट' },
  portalNote: {
    en: 'Published on the Office of the Prime Minister’s rescue portal, grouped by role. Nationwide 100 / 101 / 102 sit behind the first summary — they are the same numbers as above. District lines are underneath. Atlas has not separately checked each line.',
    ne: 'प्रधानमन्त्री कार्यालयको उद्धार पोर्टलमा प्रकाशित, भूमिकाअनुसार मिलाइएको। देशव्यापी १०० / १०१ / १०२ पहिलो सारांशभित्र छन् — माथिकै नम्बर हुन्। जिल्लाका नम्बर तल छन्। एट्लसले हरेक लाइन छुट्टै जाँचेको छैन।',
  },
  portalLocal: { en: 'District lines on the portal', ne: 'पोर्टलका जिल्ला नम्बर' },
  nationwide: { en: 'Nationwide', ne: 'देशव्यापी' },
  around: { en: '24/7', ne: '२४/७' },
  drrFocal: { en: 'Disaster focal person', ne: 'विपद् सम्पर्क अधिकृत' },
  read: { en: 'Read', ne: 'पढिएको' },
  distJump: { en: 'Districts on this register', ne: 'यस अभिलेखका जिल्ला' },
  uniqueLines: { en: 'unique lines', ne: 'फरक नम्बर' },
  search: { en: 'Search a district, name, or number', ne: 'जिल्ला, नाम वा नम्बर खोज्नुहोस्' },
  searchHint: {
    en: 'Type a district, an officer’s name, a role, or part of a number. Matching lines stay; the rest hide.',
    ne: 'जिल्ला, अधिकृतको नाम, भूमिका वा नम्बरको अंश लेख्नुहोस्। मिल्ने लाइन मात्र देखिन्छ।',
  },
  searchCount: { en: 'matching lines', ne: 'मिल्ने नम्बर' },
  noHits: {
    en: 'No district office or number on this page matches that search.',
    ne: 'त्यो खोजसँग मिल्ने जिल्ला कार्यालय वा नम्बर यस पृष्ठमा छैन।',
  },
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

const PORTAL_BUCKET: Record<PortalBucket, { en: string; ne: string }> = {
  emergency: { en: 'Nationwide emergency (same as above)', ne: 'देशव्यापी आपतकालीन (माथिकै)' },
  authority: { en: 'Disaster offices', ne: 'विपद् कार्यालय' },
  health: { en: 'Hospitals', ne: 'अस्पताल' },
  welfare: { en: 'Helplines and welfare', ne: 'हेल्पलाइन र कल्याण' },
  local: { en: 'District lines', ne: 'जिल्ला नम्बर' },
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
  const short = dialKey(phone);
  if (short && short.length <= 4) return `tel:${short}`;
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

function portalLineLabel(line: PortalLine, lang: 'en' | 'ne'): string {
  const who = displayMergedName(line.name || line.organization || '', lang);
  const bits = [who];
  if (line.organization && line.organization !== line.name) {
    const org = displayMergedName(line.organization, lang);
    if (org && org !== who) bits.push(org);
  }
  if (line.isNationwide) bits.push(T.nationwide[lang]);
  if (line.available24x7) bits.push(T.around[lang]);
  return bits.filter(Boolean).join(' · ');
}

function PortalRow({ line, lang }: { line: PortalLine; lang: 'en' | 'ne' }) {
  return (
    <a href={telHref(line.phone)}>
      <b>{line.phone}</b>
      <span>{portalLineLabel(line, lang)}</span>
    </a>
  );
}

function PortalLines({ lines, lang }: { lines: PortalLine[]; lang: 'en' | 'ne' }) {
  return (
    <div className="fl-calls-more">
      {lines.map(line => (
        <PortalRow key={line.id} line={line} lang={lang} />
      ))}
    </div>
  );
}

function DistrictDirectory({
  district,
  lang,
  searching,
}: {
  district: StructuredDistrict;
  lang: 'en' | 'ne';
  searching: boolean;
}) {
  return (
    <details id={`district-${district.slug}`} className="fl-dist" open={searching || undefined}>
      <summary>
        <strong>{lang === 'ne' ? district.nameNe : district.name}</strong>
        <em>
          {district.unique} {lang === 'ne' ? 'नम्बर' : 'lines'}
        </em>
      </summary>
      <div className="fl-dist-body">
        {district.groups.map(group => {
          const title = `${BUCKET[group.bucket][lang]} · ${group.contacts.length}`;
          const body = (
            <div className="fl-calls-more">
              {group.contacts.map(c => (
                <BipadRow key={c.id} contact={c} lang={lang} />
              ))}
            </div>
          );
          if (bucketCollapsed(group.bucket, group.contacts.length) && !searching) {
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
      </div>
    </details>
  );
}

export default function FloodContactsView() {
  const [lang, setLang] = useFloodLang();
  const { desk: data } = useFloodDesk();
  // Three hundred rows, and only this page wants them, so they ride their own
  // route rather than the desk payload every page loads.
  // Emergency numbers are the last thing that should go stale on an open tab.
  const { data: official = null } = useContacts();
  const [q, setQ] = useState('');
  const t = (key: keyof typeof T) => T[key][lang];
  const onJump = useJumpSection(['national', 'warehouses', 'districts', 'portal']);

  const lines = data?.helplines?.lines || [];
  const primary = lines.filter(l => l.primary);
  const secondary = lines.filter(l => !l.primary);

  // Only districts someone has actually checked reach the page.
  const districts: FloodDistrictContacts[] = (data?.districtContacts?.districts || []).filter(
    d => d.verified && (d.contacts?.length ?? 0) > 0,
  );
  const directory = useMemo(() => structureDistricts(official?.items || []), [official]);
  const portalDir = useMemo(
    () => structurePortalContacts(data?.portalContacts?.items || []),
    [data?.portalContacts],
  );
  const searching = parseContactQuery(q).length > 0;
  const shownDistricts = useMemo(() => {
    const tokens = parseContactQuery(q);
    if (!tokens.length) return districts;
    return districts.flatMap(d => {
      const nameHay = foldHay(d.name_en, d.name_ne);
      if (tokens.every(tok => nameHay.includes(tok))) return [d];
      const contacts = (d.contacts || []).filter(c => {
        const hay = foldHay(d.name_en, d.name_ne, c.role_en, c.role_ne, c.number, normalizePhone(c.number));
        return tokens.every(tok => hay.includes(tok));
      });
      return contacts.length ? [{ ...d, contacts }] : [];
    });
  }, [districts, q]);
  const shownDirectory = useMemo(() => filterDirectory(directory, q), [directory, q]);
  const shownPortal = useMemo(() => filterPortalDirectory(portalDir, q), [portalDir, q]);
  const uniqueLines = shownDirectory.reduce((n, d) => n + d.unique, 0);
  const matchCount =
    uniqueLines +
    shownDistricts.reduce((n, d) => n + (d.contacts?.length ?? 0), 0) +
    shownPortal.unique;
  const canSearch = districts.length > 0 || directory.length > 0 || portalDir.unique > 0 || official === null;
  const noHits =
    searching &&
    shownDistricts.length === 0 &&
    shownDirectory.length === 0 &&
    shownPortal.unique === 0 &&
    official !== null;

  useEffect(() => {
    const openFromHash = () => {
      const id = window.location.hash.replace(/^#/, '');
      if (!id.startsWith('district-')) return;
      const el = document.getElementById(id);
      if (el instanceof HTMLDetailsElement) el.open = true;
    };
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    return () => window.removeEventListener('hashchange', openFromHash);
  }, [shownDirectory]);

  const label = (o: { label_en?: string; label_ne?: string }) =>
    (lang === 'ne' ? o.label_ne || o.label_en : o.label_en) || '';

  const warehouses = data?.reliefNeeded?.warehouses || [];
  const warehouseNote =
    lang === 'ne'
      ? data?.reliefNeeded?.warehouse_note_ne || data?.reliefNeeded?.warehouse_note_en
      : data?.reliefNeeded?.warehouse_note_en;

  return (
    <FloodShell lang={lang} setLang={setLang} kicker={t('kicker')} title={t('title')} standfirst={t('standfirst')}>
      <nav className="fl-jump fl-jump-4" aria-label={t('jumpLabel')}>
        <p className="fl-jump-kicker">{t('jumpHint')}</p>
        <a href="#national" className={onJump === 'national' ? 'on' : undefined}>
          <b>1</b>
          <strong>{t('jumpNational')}</strong>
          <span>{t('jumpNationalSub')}</span>
        </a>
        <a href="#warehouses" className={onJump === 'warehouses' ? 'on' : undefined}>
          <b>2</b>
          <strong>{t('jumpWarehouses')}</strong>
          {warehouses.length > 0 && (
            <em>
              {warehouses.length} {warehouses.length === 1 ? t('jumpSite') : t('jumpSites')}
            </em>
          )}
          <span>{t('jumpWarehousesSub')}</span>
        </a>
        <a href="#districts" className={onJump === 'districts' ? 'on' : undefined}>
          <b>3</b>
          <strong>{t('jumpDistricts')}</strong>
          {directory.length > 0 && (
            <em>
              {directory.length} {t('districtCount')}
            </em>
          )}
          <span>{t('jumpDistrictsSub')}</span>
        </a>
        <a href="#portal" className={onJump === 'portal' ? 'on' : undefined}>
          <b>4</b>
          <strong>{t('jumpPortal')}</strong>
          {portalDir.unique > 0 && (
            <em>
              {portalDir.unique} {portalDir.unique === 1 ? t('jumpLine') : t('jumpLines')}
            </em>
          )}
          <span>{t('jumpPortalSub')}</span>
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
          {directory.length > 0 && (
            <em>
              {searching
                ? `${shownDirectory.length} / ${directory.length} ${t('districtCount')}`
                : `${directory.length} ${t('districtCount')}`}
            </em>
          )}
        </div>

        {directory.length > 0 && !searching && (
          <p className="fl-note fl-pending">{t('districtsIntro')}</p>
        )}

        {canSearch && (
          <>
            <input
              id="fl-dist-q"
              className="fl-search"
              type="search"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder={t('search')}
              aria-label={t('search')}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <p className="fl-find-hint">{searching ? t('searchHint') : t('pickDistrict')}</p>
            {searching && matchCount > 0 && (
              <p className="fl-find-count" aria-live="polite">
                <b>{matchCount}</b> {t('searchCount')}
                {' · '}
                {shownDirectory.length} {t('districtCount')}
              </p>
            )}
          </>
        )}

        {noHits && <p className="fl-empty">{t('noHits')}</p>}

        {shownDistricts.length > 0 &&
          shownDistricts.map(d => (
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

        {official === null ? null : shownDirectory.length === 0 && shownDistricts.length === 0 && !searching ? (
          <p className="fl-note fl-pending">{t('pending')}</p>
        ) : null}

        {shownDirectory.length > 0 && (
          <>
            <div className="fl-dist-list" role="list" aria-label={t('distJump')}>
              {shownDirectory.map(d => (
                <DistrictDirectory
                  key={`${d.id}-${searching ? 'q' : 'all'}`}
                  district={d}
                  lang={lang}
                  searching={searching}
                />
              ))}
            </div>
            {official && (
              <p className="fl-note">
                {t('read')} {ageFrom(official.fetchedAt, lang)}
                {' · '}
                {uniqueLines} {searching ? t('searchCount') : t('uniqueLines')}
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

      {shownPortal.unique > 0 && (
        <section id="portal" className="fl-sec">
          <div className="fl-sec-head">
            <span>{lang === 'ne' ? '४ · पोर्टल' : '4 · Portal'}</span>
            <h2>{t('portalTitle')}</h2>
            <em>
              {searching
                ? `${shownPortal.unique} / ${portalDir.unique}`
                : portalDir.unique}
            </em>
          </div>
          {!searching && <p className="fl-note fl-pending">{t('portalNote')}</p>}

          {shownPortal.groups.map(group => {
            const title = `${PORTAL_BUCKET[group.bucket][lang]} · ${group.contacts.length}`;
            const body = <PortalLines lines={group.contacts} lang={lang} />;
            if (COLLAPSED_PORTAL_BUCKETS.has(group.bucket) && !searching) {
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

          {shownPortal.local.length > 0 && (
            <>
              <h4 className="fl-minor">{t('portalLocal')}</h4>
              <div className="fl-dist-list" role="list">
                {shownPortal.local.map(district => (
                  <details
                    key={district.name}
                    className="fl-dist"
                    open
                  >
                    <summary>
                      <strong>{district.name}</strong>
                      <em>
                        {district.contacts.length}{' '}
                        {lang === 'ne' ? 'नम्बर' : district.contacts.length === 1 ? 'line' : 'lines'}
                      </em>
                    </summary>
                    <div className="fl-dist-body">
                      <PortalLines lines={district.contacts} lang={lang} />
                    </div>
                  </details>
                ))}
              </div>
            </>
          )}

          {data?.portalContacts && (
            <p className="fl-note">
              {t('read')} {ageFrom(data.portalContacts.fetchedAt, lang)}
              {' · '}
              {shownPortal.unique} {searching ? t('searchCount') : t('uniqueLines')}
              {' · '}
              <a href={data.portalContacts.source.url} target="_blank" rel="noopener noreferrer">
                {data.portalContacts.source.label} &#8599;
              </a>
            </p>
          )}
        </section>
      )}
    </FloodShell>
  );
}
