'use client';

import React, { useEffect, useState } from 'react';
import FloodShell from '@/components/FloodShell';
import { useFloodLang } from '@/hooks/use-flood-lang';
import type { Lang } from '@/hooks/use-flood-lang';
import type { DamageGradeRow, DamageImage, NeaPlant, SitrepHeadline, SitrepValue } from '@/types';
import { useJumpSection } from '@/hooks/use-jump-section';
import { useFloodDesk } from '@/app/bhotekoshi-flood/_components/FloodDeskProvider';

// Copernicus EMSR927 grading for Syabrubesi / Timure, and the NEA 10 Bhadra
// notice. Two numbers on this page that look addable are not: 433 is all
// buildings in the mapped area, 392 is residential inside that; the ~450
// people in the AOI are not added to uncontacted 4,247, and the 133+ NEA
// hydropower workers are not added to hydropower 933 or to 4,247. Langtang
// 60 is inside the 133+. Copernicus 5 bridges in the AOI is not SitRep-3's
// 80 national bridges.

const T = {
  kicker: { en: 'Damage', ne: 'क्षति' },
  title: { en: 'Damage assessment', ne: 'क्षति मूल्यांकन' },
  standfirst: {
    en: 'Satellite grading of Syabrubesi and the Trishuli corridor, and the hydropower plants the electricity authority listed. Not a warning, and not the national sitrep.',
    ne: 'स्याफ्रुबेँसी र त्रिशूली करिडोरको उपग्रह ग्रेडिङ, र विद्युत् प्राधिकरणले सूचीकृत गरेका आयोजना। चेतावनी होइन, राष्ट्रिय सिटरेप पनि होइन।',
  },
  jumpLabel: { en: 'On this page', ne: 'यस पृष्ठमा' },
  jumpHint: { en: 'Tap a box to jump', ne: 'जान बाकस थिच्नुहोस्' },
  jumpEms: { en: 'Syabrubesi grading', ne: 'स्याफ्रुबेँसी ग्रेडिङ' },
  jumpEmsSub: { en: 'Copernicus EMSR927', ne: 'कोपर्निकस EMSR927' },
  jumpPower: { en: 'Hydropower plants', ne: 'जलविद्युत् आयोजना' },
  jumpPowerSub: { en: 'NEA notice 10 Bhadra', ne: 'प्राधिकरण सूचना १० भदौ' },
  emsKicker: { en: '1 · Copernicus', ne: '१ · कोपर्निकस' },
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
    en: 'Possible damage is a proximity proxy, not a confirmed count. Affected is the sum of the damage classes. 433 is all buildings; 392 is residential inside that — do not add them.',
    ne: 'सम्भावित क्षति निकटताको प्रॉक्सी हो, पुष्टि होइन। प्रभावित क्षति वर्गको योग हो। ४३३ सबै भवन; ३९२ त्यसभित्रको आवासीय — जोड्नु होइन।',
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
  powerKicker: { en: '2 · Power', ne: '२ · विद्युत्' },
  listed: { en: 'On the list', ne: 'सूचीमा' },
  hitMw: { en: 'Marked directly affected', ne: 'प्रत्यक्ष प्रभावित भनिएको' },
  mw: { en: 'MW', ne: 'मेगावाट' },
  plant: { en: 'Project', ne: 'आयोजना' },
  remarks: { en: 'Remarks', ne: 'कैफियत' },
  hitTag: { en: 'Hit', ne: 'प्रभावित' },
  blankRemarks: { en: 'On the list, not marked hit', ne: 'सूचीमा, प्रभावित भनिएको छैन' },
  phones: { en: 'NEA phones', ne: 'प्राधिकरण फोन' },
  exclusive: { en: 'Counted separately, not added to uncontacted 4,247 or hydropower 933', ne: 'छुट्टै गनिएको, सम्पर्कविहीन ४,२४७ वा जलविद्युत् ९३३ माथि होइन' },
  langtangInside: { en: 'Inside the 133+, not on top of it', ne: '१३३+ भित्र, माथि होइन' },
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
  const copernicus = damage?.copernicus;
  const power = damage?.power;
  const rows = copernicus?.rows || [];
  const headline = copernicus?.headline || [];
  const maps = copernicus?.maps || NO_IMAGES;
  const photos = copernicus?.photos || NO_IMAGES;
  const plants = power?.plants || [];
  const asOf = lang === 'ne' ? damage?.as_of_label_ne || damage?.as_of_label_en : damage?.as_of_label_en;
  const onJump = useJumpSection(['copernicus', 'power']);
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
      <nav className="fl-jump fl-jump-2" aria-label={t('jumpLabel')}>
        <p className="fl-jump-kicker">{t('jumpHint')}</p>
        <a href="#copernicus" className={onJump === 'copernicus' ? 'on' : undefined}>
          <b>1</b>
          <strong>{t('jumpEms')}</strong>
          <span>{t('jumpEmsSub')}</span>
        </a>
        <a href="#power" className={onJump === 'power' ? 'on' : undefined}>
          <b>2</b>
          <strong>{t('jumpPower')}</strong>
          <span>
            {power?.affected_mw != null
              ? `${power.affected_mw} ${t('mw')} · ${t('jumpPowerSub')}`
              : t('jumpPowerSub')}
          </span>
        </a>
      </nav>

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
