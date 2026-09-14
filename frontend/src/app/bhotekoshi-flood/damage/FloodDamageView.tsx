'use client';

import React, { useEffect, useState } from 'react';
import {
  Building2,
  GraduationCap,
  HeartPulse,
  Home,
  Landmark,
  Milestone,
  Route,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import FloodShell from '@/components/FloodShell';
import { useFloodLang } from '@/hooks/use-flood-lang';
import type { Lang } from '@/hooks/use-flood-lang';
import type {
  DamageGradeRow,
  DamageImage,
  NeaPlant,
  RdnaCorridorStat,
  RdnaHeadline,
  RdnaSummaryRow,
  SitrepHeadline,
  SitrepValue,
} from '@/types';
import { useJumpSection } from '@/hooks/use-jump-section';
import { useFloodDesk } from '@/app/bhotekoshi-flood/_components/FloodDeskProvider';
import EcosystemExposure from '@/app/bhotekoshi-flood/damage/EcosystemExposure';
import FundingGapCard from '@/components/FundingGapCard';
import { computeFundingGap } from '@/lib/funding-gap';

// RDNA preliminary (NPC–NDRRMA), Copernicus EMSR927 AOI03 grading, and NEA 10
// Bhadra notice. RDNA crore figures are not merged into NDRRMA casualty KPIs
// or relief cash. Copernicus 3,058 is all buildings, 3,001 residential inside
// that — never add them. ~5,000 people in the AOI are not added to uncontacted.

const T = {
  kicker: { en: 'Damage', ne: 'क्षति' },
  title: { en: 'Damage assessment', ne: 'क्षति मूल्यांकन' },
  standfirst: {
    en: 'RDNA preliminary assessment, satellite grading of the Trishuli corridor, and the hydropower plants the electricity authority listed. Not a warning, and not the national sitrep.',
    ne: 'RDNA प्रारम्भिक मूल्यांकन, त्रिशूली करिडोरको उपग्रह ग्रेडिङ, र विद्युत् प्राधिकरणले सूचीकृत गरेका आयोजना। चेतावनी होइन, राष्ट्रिय सिटरेप पनि होइन।',
  },
  jumpLabel: { en: 'On this page', ne: 'यस पृष्ठमा' },
  jumpHint: { en: 'Tap a box to jump', ne: 'जान बाकस थिच्नुहोस्' },
  jumpRdna: { en: 'RDNA summary', ne: 'RDNA सारांश' },
  jumpRdnaSub: { en: 'Damage · losses · recovery', ne: 'क्षति · नोक्सानी · पुनर्प्राप्ति' },
  jumpEms: { en: 'Vidur grading', ne: 'विदुर ग्रेडिङ' },
  jumpEmsSub: { en: 'Copernicus EMSR927 AOI03', ne: 'कोपर्निकस EMSR927 AOI03' },
  jumpPower: { en: 'Hydropower plants', ne: 'जलविद्युत् आयोजना' },
  jumpPowerSub: { en: 'NEA notice 10 Bhadra', ne: 'प्राधिकरण सूचना १० भदौ' },
  jumpEco: { en: 'Ecosystem exposure', ne: 'पारिस्थितिक प्रभाव' },
  jumpEcoSub: { en: 'Protected areas · land cover', ne: 'संरक्षित क्षेत्र · भू-आवरण' },
  rdnaKicker: { en: '1 · RDNA', ne: '१ · RDNA' },
  rdnaCorridor: { en: 'Corridor assessment', ne: 'करिडोर मूल्यांकन' },
  corridorTotals: { en: 'Affected totals', ne: 'प्रभावित जम्मा' },
  corridorFacilities: { en: 'Buildings & facilities', ne: 'भवन र सुविधा' },
  corridorTransport: { en: 'Transport & energy', ne: 'यातायात र ऊर्जा' },
  rdnaTable: { en: 'Summary table', ne: 'सारांश तालिका' },
  rdnaExclusive: {
    en: 'Counted separately — not merged into NDRRMA casualty KPIs, uncontacted, or relief cash channels.',
    ne: 'छुट्टै गनिएको — NDRRMA casualty KPI, सम्पर्कविहीन वा राहत नगद च्यानलमा मिसाइएको छैन।',
  },
  colDamage: { en: 'Damage', ne: 'क्षति' },
  colLosses: { en: 'Losses', ne: 'नोक्सानी' },
  colEffects: { en: 'Effects', ne: 'प्रभाव' },
  colEffectsUsd: { en: 'Effects USD m', ne: 'प्रभाव USD m' },
  colShort: { en: 'Short (0–6 mo)', ne: 'छोटो (०–६ महिना)' },
  colLong: { en: 'Long', ne: 'दीर्घ' },
  colRecovery: { en: 'Recovery', ne: 'पुनर्प्राप्ति' },
  colRecoveryUsd: { en: 'Recovery USD m', ne: 'पुनर्प्राप्ति USD m' },
  crore: { en: 'NPR crore', ne: 'NPR करोड' },
  emsKicker: { en: '2 · Copernicus', ne: '२ · कोपर्निकस' },
  source: { en: 'Source', ne: 'स्रोत' },
  asOf: { en: 'Figures as of', ne: 'तथ्यांक मिति' },
  portal: { en: 'Copernicus portal', ne: 'कोपर्निकस पोर्टल' },
  loading: { en: 'Loading…', ne: 'लोड हुँदै…' },
  empty: { en: 'The grading is not on this build.', ne: 'यो निर्माणमा ग्रेडिङ छैन।' },
  colClass: { en: 'Class', ne: 'वर्ग' },
  colDest: { en: 'Destroyed', ne: 'ध्वस्त' },
  colDam: { en: 'Damaged', ne: 'क्षति' },
  colPoss: { en: 'Possible', ne: 'सम्भावित' },
  colAff: { en: 'Affected', ne: 'प्रभावित' },
  colAoi: { en: 'In the AOI', ne: 'AOI जम्मा' },
  colShare: { en: 'Share', ne: 'हिस्सा' },
  tableNote: {
    en: 'Possible damage is a proximity proxy, not a confirmed count. Affected is the sum of the damage classes. 3,058 is all buildings; 3,001 is residential inside that — do not add them.',
    ne: 'सम्भावित क्षति निकटताको प्रॉक्सी हो, पुष्टि होइन। प्रभावित क्षति वर्गको योग हो। ३,०५८ सबै भवन; ३,००१ त्यसभित्रको आवासीय — जोड्नु होइन।',
  },
  mapsKicker: { en: 'Maps', ne: 'नक्सा' },
  mapsTitle: { en: 'EMSR927 grading maps', ne: 'EMSR927 ग्रेडिङ नक्सा' },
  mapsHint: {
    en: 'Satellite product maps reprinted by the Rasuwa flood bulletin. Copernicus does not publish this AOI as a live vector feed; these images are the grading.',
    ne: 'रसुवा बाढी बुलेटिनले पुनर्मुद्रण गरेका उपग्रह उत्पादन नक्सा। कोपर्निकसले यो AOI लाई प्रत्यक्ष भेक्टर फिडका रूपमा प्रकाशित गर्दैन; ग्रेडिङ यिनै तस्बिर हुन्।',
  },
  photosTitle: { en: 'Syabrubesi and Timure', ne: 'स्याफ्रुबेँसी र टिमुरे' },
  photosHint: {
    en: 'Ground photographs of the mapped area, from the same compilation. Captions are the bulletin’s. Not the national sitrep.',
    ne: 'नक्सा क्षेत्रका स्थलगत तस्बिर, सोही संकलनबाट। क्याप्सन बुलेटिनकै हुन्। राष्ट्रिय सिटरेप होइन।',
  },
  close: { en: 'Close', ne: 'बन्द' },
  prev: { en: 'Previous', ne: 'अघिल्लो' },
  next: { en: 'Next', ne: 'पछिल्लो' },
  openMap: { en: 'Open map', ne: 'नक्सा खोल्नुहोस्' },
  powerKicker: { en: '3 · Power', ne: '३ · विद्युत्' },
  listed: { en: 'On the list', ne: 'सूचीमा' },
  hitMw: { en: 'Marked directly affected', ne: 'प्रत्यक्ष प्रभावित भनिएको' },
  mw: { en: 'MW', ne: 'मेगावाट' },
  plant: { en: 'Project', ne: 'आयोजना' },
  remarks: { en: 'Remarks', ne: 'कैफियत' },
  hitTag: { en: 'Hit', ne: 'प्रभावित' },
  blankRemarks: { en: 'On the list, not marked hit', ne: 'सूचीमा, प्रभावित भनिएको छैन' },
  phones: { en: 'NEA phones', ne: 'प्राधिकरण फोन' },
  exclusive: { en: 'Counted separately, not added to the uncontacted total of about 5,326', ne: 'छुट्टै गनिएको, सम्पर्कविहीन करिब ५,३२६ माथि होइन' },
  langtangInside: { en: 'Inside the 133+, not on top of it', ne: '१३३+ भित्र, माथि होइन' },
};

const CORRIDOR_GROUPS: Array<{ id: string; labelKey: keyof typeof T; ids: string[]; hero?: boolean }> = [
  { id: 'totals', labelKey: 'corridorTotals', ids: ['buildings', 'households', 'population'], hero: true },
  {
    id: 'facilities',
    labelKey: 'corridorFacilities',
    ids: ['rdna_qs_private', 'rdna_qs_public', 'rdna_qs_schools', 'rdna_qs_health', 'rdna_qs_culture'],
  },
  { id: 'transport', labelKey: 'corridorTransport', ids: ['rdna_qs_energy', 'rdna_qs_roads', 'rdna_qs_bridges'] },
];

const CORRIDOR_ICONS: Record<string, LucideIcon> = {
  buildings: Building2,
  households: Home,
  population: Users,
  rdna_qs_private: Home,
  rdna_qs_public: Landmark,
  rdna_qs_schools: GraduationCap,
  rdna_qs_health: HeartPulse,
  rdna_qs_culture: Landmark,
  rdna_qs_energy: Zap,
  rdna_qs_roads: Route,
  rdna_qs_bridges: Milestone,
};

const GROUP_LABEL: Record<string, { en: string; ne: string }> = {
  hazard: { en: 'Hazard', ne: 'खतरा' },
  people: { en: 'People', ne: 'जनसंख्या' },
  buildings: { en: 'Buildings', ne: 'भवन' },
  transport: { en: 'Transport', ne: 'यातायात' },
  facilities: { en: 'Facilities', ne: 'सुविधा' },
  landcover: { en: 'Land cover', ne: 'भू-आवरण' },
};

function L(o: object | null | undefined, key: string, lang: Lang): string {
  if (!o) return '';
  const obj = o as Record<string, unknown>;
  const val = lang === 'ne' ? obj[`${key}_ne`] || obj[`${key}_en`] : obj[`${key}_en`];
  return typeof val === 'string' ? val : '';
}

function formatNum(value: number, approximate?: boolean, suffix?: string): string {
  const text = Number.isInteger(value) ? value.toLocaleString() : String(value);
  return `${approximate ? '~' : ''}${text}${suffix || ''}`;
}

function cell(value: number | null | undefined, unit?: string, approximate?: boolean): string {
  if (value == null) return '—';
  return `${formatNum(value, approximate)}${unit ? ` ${unit}` : ''}`;
}

function formatCr(value: number | null | undefined): string {
  if (value == null) return '—';
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function RdnaTile({ item, lang }: { item: RdnaHeadline; lang: Lang }) {
  return (
    <div className={item.id === 'effects' || item.id === 'recovery' ? 't-critical' : 't-warning'}>
      <dd>
        <span className="fl-rdna-cr">{formatCr(item.value_cr)}</span>
        <span className="fl-rdna-unit">{T.crore[lang]}</span>
        {item.usd_m != null && (
          <span className="fl-rdna-usd">
            USD {formatCr(item.usd_m)} m
          </span>
        )}
      </dd>
      <dt>{L(item, 'label', lang)}</dt>
    </div>
  );
}

function corridorParts(
  item: RdnaCorridorStat,
  lang: Lang
): { label: string; value: string; detail?: string; prose?: boolean } {
  const text = L(item, 'text', lang);
  if (text) {
    const split = text.indexOf(':');
    if (split >= 0) {
      return {
        label: text.slice(0, split).trim(),
        value: text.slice(split + 1).trim(),
        prose: text.length > 52,
      };
    }
    return { label: text, value: '' };
  }
  return {
    label: L(item, 'label', lang),
    value: formatNum(item.value ?? 0, item.approximate, item.suffix),
    detail: L(item, 'detail', lang) || undefined,
  };
}

function CorridorTile({ item, lang, hero }: { item: RdnaCorridorStat; lang: Lang; hero?: boolean }) {
  const Icon = CORRIDOR_ICONS[item.id] || Building2;
  const { label, value, detail, prose } = corridorParts(item, lang);
  return (
    <div className={`fl-rdna-corridor-card${hero ? ' fl-rdna-corridor-card-hero' : ''}${prose ? ' fl-rdna-corridor-card-prose' : ''}`}>
      <span className="fl-rdna-corridor-icon" aria-hidden="true">
        <Icon size={hero ? 20 : 17} strokeWidth={1.75} />
      </span>
      <dl className="fl-rdna-corridor-body">
        <dt>{label}</dt>
        {value ? <dd>{value}</dd> : null}
        {detail ? <small>{detail}</small> : null}
      </dl>
    </div>
  );
}

function CorridorGroup({
  title,
  items,
  lang,
  hero,
}: {
  title: string;
  items: RdnaCorridorStat[];
  lang: Lang;
  hero?: boolean;
}) {
  if (!items.length) return null;
  return (
    <div className="fl-rdna-corridor-block">
      <h3 className="fl-rdna-corridor-title">{title}</h3>
      <div className={hero ? 'fl-rdna-corridor-hero' : 'fl-rdna-corridor-grid'}>
        {items.map(item => (
          <CorridorTile key={item.id} item={item} lang={lang} hero={hero} />
        ))}
      </div>
    </div>
  );
}

function telHref(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) return `tel:+977${digits.slice(1)}`;
  return `tel:${digits || phone}`;
}

function displayPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 9 && digits.startsWith('01')) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return phone;
}

function Tile({ item, lang }: { item: SitrepHeadline; lang: Lang }) {
  const unit = L(item, 'unit', lang);
  return (
    <div className={`t-${item.tone}`}>
      <dd>
        {formatNum(item.value, item.approximate, item.suffix)}
        {unit ? <em>{unit}</em> : null}
      </dd>
      <dt>{L(item, 'label', lang)}</dt>
    </div>
  );
}

function grouped(rows: DamageGradeRow[]): Array<{ group: string; rows: DamageGradeRow[] }> {
  const order: string[] = [];
  const buckets = new Map<string, DamageGradeRow[]>();
  for (const row of rows) {
    if (!buckets.has(row.group)) {
      order.push(row.group);
      buckets.set(row.group, []);
    }
    buckets.get(row.group)!.push(row);
  }
  return order.map(group => ({ group, rows: buckets.get(group) || [] }));
}

function cap(img: DamageImage, lang: Lang): string {
  return lang === 'ne'
    ? img.caption_ne || img.caption_en || img.alt || ''
    : img.caption_en || img.caption_ne || img.alt || '';
}

function SwipeRail({
  items,
  lang,
  onOpen,
  kind,
}: {
  items: DamageImage[];
  lang: Lang;
  onOpen: (id: string) => void;
  kind: 'map' | 'photo';
}) {
  const track = React.useRef<HTMLDivElement>(null);
  const [i, setI] = React.useState(0);
  const slides = items.filter(item => item.imageProxy);

  const go = (n: number) => {
    const el = track.current;
    if (!el) return;
    const next = Math.max(0, Math.min(slides.length - 1, n));
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
    setI(next);
  };

  if (!slides.length) return null;
  return (
    <div className={`fl-ems-rail fl-ems-rail-${kind}`} aria-roledescription="carousel">
      <div
        ref={track}
        className="fl-ems-rail-track"
        tabIndex={0}
        onScroll={e => {
          const el = e.currentTarget;
          const w = el.clientWidth;
          if (!w) return;
          setI(Math.round(el.scrollLeft / w));
        }}
        onKeyDown={e => {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            go(i - 1);
          }
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            go(i + 1);
          }
        }}
      >
        {slides.map(item => {
          const src = item.imageProxy || item.src;
          const caption = cap(item, lang);
          return (
            <figure key={item.id}>
              <button type="button" onClick={() => onOpen(item.id)} aria-label={caption || T.openMap[lang]}>
                <img src={src} alt={item.alt || caption} loading="lazy" referrerPolicy="no-referrer" />
              </button>
              {caption ? <figcaption>{caption}</figcaption> : null}
            </figure>
          );
        })}
      </div>
      {slides.length > 1 && (
        <div className="fl-ems-rail-bar">
          <button type="button" onClick={() => go(i - 1)} disabled={i <= 0} aria-label={T.prev[lang]}>
            ←
          </button>
          <ol>
            {slides.map((item, n) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={n === i ? 'on' : undefined}
                  onClick={() => go(n)}
                  aria-label={`${n + 1} / ${slides.length}`}
                  aria-current={n === i ? 'true' : undefined}
                />
              </li>
            ))}
          </ol>
          <span>
            {i + 1} / {slides.length}
          </span>
          <button
            type="button"
            onClick={() => go(i + 1)}
            disabled={i >= slides.length - 1}
            aria-label={T.next[lang]}
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}

const NO_IMAGES: DamageImage[] = [];

export default function FloodDamageView() {
  const [lang, setLang] = useFloodLang();
  const { desk } = useFloodDesk();
  const [openId, setOpenId] = useState<string | null>(null);
  const t = (key: keyof typeof T) => T[key][lang];

  const damage = desk.damage;
  const rdna = damage?.rdna;
  const fundingGap = React.useMemo(
    () =>
      computeFundingGap({
        reliefReceived: desk.reliefReceived,
        damage,
      }),
    [desk.reliefReceived, damage],
  );
  const copernicus = damage?.copernicus;
  const power = damage?.power;
  const rows = copernicus?.rows || [];
  const headline = copernicus?.headline || [];
  const maps = copernicus?.maps || NO_IMAGES;
  const photos = copernicus?.photos || NO_IMAGES;
  const plants = power?.plants || [];
  const asOf = lang === 'ne' ? damage?.as_of_label_ne || damage?.as_of_label_en : damage?.as_of_label_en;
  const onJump = useJumpSection(['rdna', 'copernicus', 'power', 'ecosystem']);
  const gallery = React.useMemo(() => [...maps, ...photos], [maps, photos]);
  const openIndex = openId ? gallery.findIndex(item => item.id === openId) : -1;
  const openItem = openIndex >= 0 ? gallery[openIndex] : null;
  const touchX = React.useRef<number | null>(null);

  useEffect(() => {
    if (!openId) return;
    const ids = gallery.map(item => item.id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenId(null);
      const i = ids.indexOf(openId);
      if (e.key === 'ArrowLeft' && i > 0) setOpenId(ids[i - 1]);
      if (e.key === 'ArrowRight' && i >= 0 && i < ids.length - 1) setOpenId(ids[i + 1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId, gallery]);

  return (
    <FloodShell lang={lang} setLang={setLang} kicker={t('kicker')} title={t('title')} standfirst={t('standfirst')}>
      <nav className="fl-jump fl-jump-4" aria-label={t('jumpLabel')}>
        <p className="fl-jump-kicker">{t('jumpHint')}</p>
        <a href="#rdna" className={onJump === 'rdna' ? 'on' : undefined}>
          <b>1</b>
          <strong>{t('jumpRdna')}</strong>
          <span>{t('jumpRdnaSub')}</span>
        </a>
        <a href="#copernicus" className={onJump === 'copernicus' ? 'on' : undefined}>
          <b>2</b>
          <strong>{t('jumpEms')}</strong>
          <span>{t('jumpEmsSub')}</span>
        </a>
        <a href="#power" className={onJump === 'power' ? 'on' : undefined}>
          <b>3</b>
          <strong>{t('jumpPower')}</strong>
          {power?.affected_mw != null && (
            <em>
              {power.affected_mw} {t('mw')}
            </em>
          )}
          <span>{t('jumpPowerSub')}</span>
        </a>
        <a href="#ecosystem" className={onJump === 'ecosystem' ? 'on' : undefined}>
          <b>4</b>
          <strong>{t('jumpEco')}</strong>
          <span>{t('jumpEcoSub')}</span>
        </a>
      </nav>

      <section id="rdna" className="fl-sec fl-damage">
        <div className="fl-sec-head">
          <span>{t('rdnaKicker')}</span>
          <h2>{L(rdna, 'title', lang) || t('jumpRdna')}</h2>
        </div>

        {!rdna ? (
          <p className="fl-empty">{t('empty')}</p>
        ) : (
          <>
            {L(rdna, 'lead', lang) && <p className="fl-ems-meta">{L(rdna, 'lead', lang)}</p>}
            {L(rdna, 'note', lang) && <p className="fl-ems-caveat">{L(rdna, 'note', lang)}</p>}

            {(rdna.headline || []).length > 0 && (
              <div className="fl-tiles fl-rdna-kpis">
                {(rdna.headline || []).map(item => (
                  <RdnaTile key={item.id} item={item} lang={lang} />
                ))}
              </div>
            )}

            {fundingGap ? <FundingGapCard gap={fundingGap} lang={lang} showAskHint /> : null}

            {(rdna.corridor || []).length > 0 && (
              <div className="fl-rdna-corridor-wrap">
                <div className="fl-sec-head fl-ems-subhead fl-rdna-subhead">
                  <span>{t('rdnaCorridor')}</span>
                </div>
                {CORRIDOR_GROUPS.map(group => {
                  const byId = new Map((rdna.corridor || []).map(item => [item.id, item]));
                  const items = group.ids
                    .map(id => byId.get(id))
                    .filter((item): item is RdnaCorridorStat => Boolean(item));
                  return (
                    <CorridorGroup
                      key={group.id}
                      title={T[group.labelKey][lang]}
                      items={items}
                      lang={lang}
                      hero={group.hero}
                    />
                  );
                })}
              </div>
            )}

            {(rdna.rows || []).length > 0 && (
              <div className="fl-grade-wrap">
                <div className="fl-sec-head fl-ems-subhead">
                  <span>{t('rdnaTable')}</span>
                </div>
                <table className="fl-grade fl-rdna">
                  <thead>
                    <tr>
                      <th>{t('colClass')}</th>
                      <th>{t('colDamage')}</th>
                      <th>{t('colLosses')}</th>
                      <th>{t('colEffects')}</th>
                      <th>{t('colEffectsUsd')}</th>
                      <th>{t('colShort')}</th>
                      <th>{t('colLong')}</th>
                      <th>{t('colRecovery')}</th>
                      <th>{t('colRecoveryUsd')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(rdna.rows || []).map((row: RdnaSummaryRow) => (
                      <tr
                        key={row.id}
                        className={
                          row.kind === 'total' ? 'hit' : row.kind === 'sector' ? 'fl-grade-group' : undefined
                        }
                      >
                        <th scope="row">{L(row, 'label', lang)}</th>
                        <td>{formatCr(row.damage_cr)}</td>
                        <td>{formatCr(row.losses_cr)}</td>
                        <td>{formatCr(row.effects_cr)}</td>
                        <td>{formatCr(row.effects_usd_m)}</td>
                        <td>{formatCr(row.short_cr)}</td>
                        <td>{formatCr(row.long_cr)}</td>
                        <td>{formatCr(row.recovery_cr)}</td>
                        <td>{formatCr(row.recovery_usd_m)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="fl-note">{t('rdnaExclusive')}</p>
          </>
        )}
      </section>

      <section id="copernicus" className="fl-sec fl-damage">
        <div className="fl-sec-head">
          <span>{t('emsKicker')}</span>
          <h2>{L(copernicus, 'title', lang) || t('jumpEms')}</h2>
        </div>

        {!copernicus ? (
          <p className="fl-empty">{t('empty')}</p>
        ) : (
          <>
            {L(copernicus, 'lead', lang) && (
              <p className="fl-ems-meta">{L(copernicus, 'lead', lang)}</p>
            )}
            {L(copernicus, 'note', lang) && (
              <p className="fl-ems-caveat">{L(copernicus, 'note', lang)}</p>
            )}

            {headline.length > 0 && (
              <div className="fl-tiles fl-ems-headlines">
                {headline.map(item => (
                  <Tile key={item.id} item={item} lang={lang} />
                ))}
              </div>
            )}

            {maps.length > 0 && (
              <>
                <div className="fl-sec-head fl-ems-subhead">
                  <span>{t('mapsKicker')}</span>
                  <h3>{t('mapsTitle')}</h3>
                  <em>{maps.length}</em>
                </div>
                <p className="fl-note">{t('mapsHint')}</p>
                <SwipeRail items={maps} lang={lang} kind="map" onOpen={setOpenId} />
              </>
            )}

            {photos.length > 0 && (
              <>
                <div className="fl-sec-head fl-ems-subhead">
                  <span>{lang === 'ne' ? 'तस्बिर' : 'Photographs'}</span>
                  <h3>{t('photosTitle')}</h3>
                  <em>{photos.length}</em>
                </div>
                <p className="fl-note">{t('photosHint')}</p>
                <SwipeRail items={photos} lang={lang} kind="photo" onOpen={setOpenId} />
              </>
            )}

            {rows.length > 0 && (
              <div className="fl-grade-wrap">
                <table className="fl-grade">
                  <thead>
                    <tr>
                      <th>{t('colClass')}</th>
                      <th>{t('colDest')}</th>
                      <th>{t('colDam')}</th>
                      <th>{t('colPoss')}</th>
                      <th>{t('colAff')}</th>
                      <th>{t('colAoi')}</th>
                      <th>{t('colShare')}</th>
                    </tr>
                  </thead>
                  {grouped(rows).map(block => (
                    <tbody key={block.group}>
                      <tr className="fl-grade-group">
                        <th colSpan={7}>{lang === 'ne' ? GROUP_LABEL[block.group]?.ne : GROUP_LABEL[block.group]?.en}</th>
                      </tr>
                      {block.rows.map(row => {
                        const unit = L(row, 'unit', lang);
                        const heavy = row.id === 'all-buildings' || row.id === 'residential';
                        return (
                          <tr key={row.id} className={heavy ? 'hit' : undefined}>
                            <th scope="row">{L(row, 'label', lang)}</th>
                            <td>{cell(row.destroyed, unit)}</td>
                            <td>{cell(row.damaged)}</td>
                            <td>{cell(row.possible)}</td>
                            <td>{cell(row.affected, undefined, row.approximate)}</td>
                            <td>{cell(row.aoi, undefined, row.approximate)}</td>
                            <td>{row.share || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  ))}
                </table>
              </div>
            )}

            <p className="fl-note">{t('tableNote')}</p>

            <p className="fl-note">
              {t('asOf')} {asOf || '—'}
              {(damage?.sources || []).map((src, i) => (
                <React.Fragment key={i}>
                  {' · '}
                  <a href={src.url} target="_blank" rel="noopener noreferrer">
                    {src.label} &#8599;
                  </a>
                </React.Fragment>
              ))}
              {copernicus.portal_url && (
                <>
                  {' · '}
                  <a href={copernicus.portal_url} target="_blank" rel="noopener noreferrer">
                    {t('portal')} &#8599;
                  </a>
                </>
              )}
            </p>
          </>
        )}
      </section>

      <section id="power" className="fl-sec fl-damage">
        <div className="fl-sec-head">
          <span>{t('powerKicker')}</span>
          <h2>{L(power, 'title', lang) || t('jumpPower')}</h2>
        </div>

        {!power ? (
          <p className="fl-empty">{t('empty')}</p>
        ) : (
          <>
            <div className="fl-prose">
              <p>{L(power, 'body', lang)}</p>
            </div>
            {L(power, 'note', lang) && <p className="fl-warn">{L(power, 'note', lang)}</p>}

            <div className="fl-tiles">
              {power.listed_mw != null && (
                <div>
                  <dd>
                    {formatNum(power.listed_mw)}
                    <em>{t('mw')}</em>
                  </dd>
                  <dt>{t('listed')}</dt>
                </div>
              )}
              {power.affected_mw != null && (
                <div className="t-critical">
                  <dd>
                    {formatNum(power.affected_mw)}
                    <em>{t('mw')}</em>
                  </dd>
                  <dt>{t('hitMw')}</dt>
                </div>
              )}
              {power.uncontacted && <StaffTile item={power.uncontacted} lang={lang} />}
              {power.langtang_staff && <StaffTile item={power.langtang_staff} lang={lang} aside />}
            </div>
            <p className="fl-note">{t('exclusive')}</p>
            {power.langtang_staff && <p className="fl-note">{t('langtangInside')}</p>}

            {plants.length > 0 && (
              <div className="fl-grade-wrap">
                <table className="fl-grade fl-plants">
                  <thead>
                    <tr>
                      <th>{t('plant')}</th>
                      <th>{t('mw')}</th>
                      <th>{t('remarks')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plants.map((plant: NeaPlant) => (
                      <tr key={plant.id} className={plant.hit ? 'hit' : undefined}>
                        <th scope="row">
                          {L(plant, 'name', lang)}
                          {plant.hit && <em>{t('hitTag')}</em>}
                        </th>
                        <td>{formatNum(plant.mw)}</td>
                        <td>{L(plant, 'remarks', lang) || t('blankRemarks')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {L(power, 'foot', lang) && <p className="fl-note">{L(power, 'foot', lang)}</p>}

            {(power.phones || []).length > 0 && (
              <p className="fl-note">
                {t('phones')}{' '}
                {(power.phones || []).map((phone, i) => (
                  <React.Fragment key={phone}>
                    {i > 0 ? ' · ' : ''}
                    <a href={telHref(phone)}>{displayPhone(phone)}</a>
                  </React.Fragment>
                ))}
                {' · '}
                <a href="https://www.nea.org.np" target="_blank" rel="noopener noreferrer">
                  nea.org.np &#8599;
                </a>
              </p>
            )}
          </>
        )}
      </section>

      <EcosystemExposure lang={lang} />

      {openItem && openItem.imageProxy && (
        <div
          className="fl-lightbox fl-lightbox-photo"
          onClick={() => setOpenId(null)}
          role="dialog"
          aria-modal="true"
          onTouchStart={e => {
            touchX.current = e.changedTouches[0]?.clientX ?? null;
          }}
          onTouchEnd={e => {
            const start = touchX.current;
            touchX.current = null;
            if (start == null) return;
            const dx = e.changedTouches[0].clientX - start;
            if (dx > 48 && openIndex > 0) setOpenId(gallery[openIndex - 1].id);
            else if (dx < -48 && openIndex >= 0 && openIndex < gallery.length - 1) {
              setOpenId(gallery[openIndex + 1].id);
            }
          }}
        >
          <div onClick={e => e.stopPropagation()}>
            <img src={openItem.imageProxy || openItem.src} alt={openItem.alt || cap(openItem, lang)} />
            {cap(openItem, lang) ? <p className="fl-payee">{cap(openItem, lang)}</p> : null}
            <p className="fl-note">
              {openItem.kind === 'photo'
                ? t('photosHint')
                : t('mapsHint')}
            </p>
            <div className="fl-ems-lb-nav">
              {openIndex > 0 && (
                <button type="button" onClick={() => setOpenId(gallery[openIndex - 1].id)}>
                  {t('prev')}
                </button>
              )}
              <button type="button" onClick={() => setOpenId(null)}>
                {t('close')}
              </button>
              {openIndex >= 0 && openIndex < gallery.length - 1 && (
                <button type="button" onClick={() => setOpenId(gallery[openIndex + 1].id)}>
                  {t('next')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </FloodShell>
  );
}

function StaffTile({ item, lang, aside }: { item: SitrepValue; lang: Lang; aside?: boolean }) {
  return (
    <div className={aside ? 'fl-fig-aside' : 't-warning'}>
      <dd>{formatNum(item.value, undefined, item.suffix)}</dd>
      <dt>{L(item, 'label', lang)}</dt>
      {L(item, 'detail', lang) && <small>{L(item, 'detail', lang)}</small>}
    </div>
  );
}
