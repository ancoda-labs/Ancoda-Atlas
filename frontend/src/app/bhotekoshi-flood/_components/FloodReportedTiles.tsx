'use client';

import React from 'react';
import { ageFrom } from '@/lib/relative-time';
import { useTick } from '@/hooks/use-desk-refresh';
import type { Lang } from '@/hooks/use-flood-lang';
import type { CorridorIncidents, SitrepContent, SitrepHeadline, SitrepValue } from '@/types';
import { useFloodDesk } from '@/app/bhotekoshi-flood/_components/FloodDeskProvider';

// The "what has been reported" tile grid, used on Overview and Situation.
//
// BIPAD is still scraped on the ten-minute cycle: incidents logged, how many
// have a filled loss record, how many are still waiting, families evacuated.
// That register is days behind the national toll — it stores blanks as zeros —
// so deaths, uncontacted, injured, air rescue, deployed, houses and bridges are
// the reviewed sitrep with a bulletin overlay when that scrape's parts add
// up. Deaths never go down. BIPAD's
// entered-so-far count is printed under those tiles so the lag stays visible.
// The two sources are never added together.
//
// The heading carries last-update, not a LIVE stamp. A pulse on a tile means
// that figure currently comes from a scrape; houses and bridges never get one.

const T = {
  title: { en: 'What has been reported', ne: 'के-के जनाइएको छ' },
  incidents: { en: 'Incidents logged', ne: 'दर्ता घटना' },
  withFigures: { en: 'With damage figures', ne: 'क्षति तथ्यांक भएका' },
  awaiting: { en: 'Still awaiting figures', ne: 'तथ्यांक कुर्दै' },
  deaths: { en: 'Deaths recorded', ne: 'मृत्यु दर्ता' },
  missing: { en: 'Uncontacted recorded', ne: 'सम्पर्कविहीन दर्ता' },
  injured: { en: 'Injured recorded', ne: 'घाइते दर्ता' },
  heli: { en: 'Rescued by air', ne: 'हवाई उद्धार' },
  deployed: { en: 'Personnel deployed', ne: 'परिचालित जनशक्ति' },
  evacuated: { en: 'Families evacuated', ne: 'स्थानान्तरित परिवार' },
  affectedFamilies: { en: 'Families affected', ne: 'प्रभावित परिवार' },
  relocated: { en: 'Families relocated', ne: 'पुनर्स्थापित परिवार' },
  houses: { en: 'Houses destroyed', ne: 'भत्किएका घर' },
  bridges: { en: 'Bridges destroyed', ne: 'भत्किएका पुल' },
  bipadEntered: { en: 'BIPAD register', ne: 'बिपद् अभिलेख' },
  read: { en: 'Read', ne: 'पढिएको' },
  updated: { en: 'Updated', ne: 'अद्यावधिक' },
  asOf: { en: 'Reviewed as of', ne: 'जाँचिएको, मिति' },
  scraped: { en: 'Updates automatically', ne: 'स्वतः अद्यावधिक' },
  caveat: {
    en: 'Incident counts and families come from BIPAD’s corridor register and refresh on the desk cycle. Deaths, uncontacted, injured, air rescue and deployed staff are reviewed figures, overlaid from the Rasuwa flood bulletin when that scrape’s parts add up. Deaths never go down. Houses and bridges are NDRRMA / Copernicus. Do not add the two together.',
    ne: 'दर्ता घटना र परिवार बिपद्को करिडोर अभिलेख हुन् र डेस्क चक्रमा ताजा हुन्छन्। मृत्यु, सम्पर्कविहीन, घाइते, हवाई उद्धार र जनशक्ति जाँचिएका तथ्यांक हुन्, रसुवा बाढी बुलेटिनबाट ओभरले हुन्छ जब भागहरू जोडिन्छन्। मृत्यु घट्दैन। घर र पुल एनडीआरआरएमए / कोपर्निकसका हुन्। दुईथरी जोड्नुहोस् नहोस्।',
  },
  caveatHeadline: {
    en: 'Incident counts and families come from BIPAD’s corridor register and refresh on the desk cycle. Deaths, uncontacted and injured are reviewed figures, overlaid from the Rasuwa flood bulletin when that scrape’s parts add up. Deaths never go down. Personnel, air rescue and damage sit in their own sections. Do not add the register and the official toll together.',
    ne: 'दर्ता घटना र परिवार बिपद्को करिडोर अभिलेख हुन् र डेस्क चक्रमा ताजा हुन्छन्। मृत्यु, सम्पर्कविहीन र घाइते जाँचिएका तथ्यांक हुन्, रसुवा बाढी बुलेटिनबाट ओभरले हुन्छ जब भागहरू जोडिन्छन्। मृत्यु घट्दैन। जनशक्ति, हवाई उद्धार र क्षति आ-आफ्नै खण्डमा छन्। अभिलेख र आधिकारिक क्षति नजोड्नुहोस्।',
  },
  caveatShort: {
    en: 'Register and official toll are separate — do not add together.',
    ne: 'अभिलेख र आधिकारिक क्षति छुट्टै छन् — जोड्नुहोस् नहोस्।',
  },
  sourcesN: { en: 'sources', ne: 'स्रोत' },
};

function headline(sitrep: SitrepContent | null | undefined, id: string): SitrepHeadline | undefined {
  return (sitrep?.headline || []).find(h => h.id === id);
}

function breakdownRow(sitrep: SitrepContent | null | undefined, id: string) {
  return (sitrep?.breakdowns || []).find(b => b.id === id);
}

function infra(sitrep: SitrepContent | null | undefined, id: string, en: string): SitrepValue | undefined {
  return (sitrep?.infrastructure?.items || []).find(i => i.id === id || i.label_en === en);
}

function reviewed(
  sitrep: SitrepContent | null | undefined,
  headlineId: string,
  breakdownId?: string,
): SitrepHeadline | undefined {
  const fromHeadline = headline(sitrep, headlineId);
  if (fromHeadline) return fromHeadline;
  const row = breakdownId ? breakdownRow(sitrep, breakdownId) : undefined;
  if (row?.total == null) return undefined;
  return {
    id: headlineId,
    value: row.total,
    tone: 'warning',
    source: '',
    label_en: '',
    label_ne: '',
    live: row.live,
  };
}

function n(value: number | null | undefined, suffix?: string): string {
  return `${(value ?? 0).toLocaleString()}${suffix || ''}`;
}

function newestIso(...candidates: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  let bestMs = -Infinity;
  for (const iso of candidates) {
    if (!iso) continue;
    const ms = new Date(iso).getTime();
    if (Number.isNaN(ms) || ms <= bestMs) continue;
    best = iso;
    bestMs = ms;
  }
  return best;
}

/** A pulse, not the word "live" — only on figures a scrape currently supplies. */
export function ScrapedDot({ lang }: { lang: Lang }) {
  const label = lang === 'ne' ? T.scraped.ne : T.scraped.en;
  return <i className="fl-scraped-dot" title={label} aria-label={label} />;
}

function BipadUnder({ value, lang }: { value: number | null | undefined; lang: Lang }) {
  if (value == null) return null;
  return (
    <small className="fl-blank">
      {T.bipadEntered[lang]} {n(value)}
    </small>
  );
}

function Tile({
  value,
  label,
  tone,
  scraped,
  lang,
  children,
}: {
  value: string;
  label: string;
  tone?: string;
  scraped?: boolean;
  lang: Lang;
  children?: React.ReactNode;
}) {
  return (
    <div className={[tone ? `t-${tone}` : '', scraped ? 'scraped' : ''].filter(Boolean).join(' ') || undefined}>
      <dd>
        {value}
        {scraped && <ScrapedDot lang={lang} />}
      </dd>
      <dt>{label}</dt>
      {children}
    </div>
  );
}

export default function FloodReportedTiles({
  lang,
  corridor,
  sitrep,
  showHeading = true,
  scope = 'all',
  compactFootnote = false,
}: {
  lang: Lang;
  corridor?: CorridorIncidents | null;
  sitrep?: SitrepContent | null;
  showHeading?: boolean;
  /**
   * `headline` is the overview scan: incidents, the official toll, families.
   * Response splits and infrastructure live in their own sections there.
   * `all` keeps the situation-page register, which still prints every tile.
   */
  scope?: 'all' | 'headline';
  /** Short provenance lines for the overview topic panel. */
  compactFootnote?: boolean;
}) {
  useTick();
  const t = (key: keyof typeof T) => T[key][lang];
  const totals = corridor?.totals ?? null;
  // Bundled sitrep is the fallback so the bulletin toll is on the page even
  // before the corridor scrape answers. Reviewed figures win; BIPAD
  // zeros are never the headline number.
  // The desk payload already carries the reviewed sitrep with the live
  // overlay applied, so there is no separate bundled copy to fall back to.
  const { desk } = useFloodDesk();
  const figures = sitrep || (desk.sitrep as SitrepContent | null);

  // No reviewed figures means the desk has not answered yet. The tiles render
  // nothing rather than a grid of zeros — this component's whole premise is
  // that a zero is never the headline number.
  if (!figures) return null;

  const deaths = reviewed(figures, 'deaths', 'deaths');
  const missing = reviewed(figures, 'uncontacted', 'uncontacted');
  const injured = reviewed(figures, 'injured', 'injured');
  const heli = reviewed(figures, 'heli', 'air-rescue');
  const deployed = reviewed(figures, 'deployed', 'deployed');
  const houses = infra(figures, 'houses', 'Houses destroyed')?.value;
  const bridges = infra(figures, 'bridges', 'Bridges')?.value;
  const lastAt = newestIso(corridor?.fetchedAt, figures.as_of);
  const lastLabel = lastAt
    ? ageFrom(lastAt, lang)
    : (lang === 'ne' ? figures.as_of_label_ne || figures.as_of_label_en : figures.as_of_label_en) || '—';

  const showResponse = scope === 'all';
  const showDamage = scope === 'all';

  if (!totals && deaths == null) return null;

  return (
    <>
      {showHeading && (
        <div className="fl-sec-head">
          <span className="fl-updated">
            {t('updated')} {lastLabel}
          </span>
          <h2>{t('title')}</h2>
        </div>
      )}

      <div className="fl-tiles">
        {totals && (
          <>
            <Tile value={n(totals.incidentCount)} label={t('incidents')} scraped lang={lang} />
            <Tile value={n(totals.incidentsWithFigures)} label={t('withFigures')} scraped lang={lang} />
            <Tile
              value={n(totals.incidentsAwaitingFigures)}
              label={t('awaiting')}
              tone="warning"
              scraped
              lang={lang}
            />
          </>
        )}
        {deaths != null && (
          <Tile value={n(deaths.value)} label={t('deaths')} tone={deaths.tone} scraped={deaths.live} lang={lang}>
            <BipadUnder value={totals?.deaths} lang={lang} />
          </Tile>
        )}
        {missing != null && (
          <Tile value={n(missing.value)} label={t('missing')} tone={missing.tone} scraped={missing.live} lang={lang}>
            <BipadUnder value={totals?.missing} lang={lang} />
          </Tile>
        )}
        {injured != null && (
          <Tile value={n(injured.value)} label={t('injured')} tone={injured.tone} scraped={injured.live} lang={lang}>
            <BipadUnder value={totals?.injured} lang={lang} />
          </Tile>
        )}
        {totals && (
          <>
            <Tile value={n(totals.familiesEvacuated)} label={t('evacuated')} scraped lang={lang} />
            {(totals.familiesAffected ?? 0) > 0 && (
              <Tile value={n(totals.familiesAffected)} label={t('affectedFamilies')} scraped lang={lang} />
            )}
            {(totals.familiesRelocated ?? 0) > 0 && (
              <Tile value={n(totals.familiesRelocated)} label={t('relocated')} scraped lang={lang} />
            )}
          </>
        )}
        {showResponse && heli != null && (
          <Tile
            value={n(heli.value, heli.suffix)}
            label={t('heli')}
            tone={heli.tone}
            scraped={heli.live}
            lang={lang}
          />
        )}
        {showResponse && deployed != null && (
          <Tile
            value={n(deployed.value, deployed.suffix)}
            label={t('deployed')}
            tone={deployed.tone}
            scraped={deployed.live}
            lang={lang}
          />
        )}
        {showDamage && houses != null && (
          <Tile value={n(houses)} label={t('houses')} lang={lang}>
            <BipadUnder value={totals?.housesDestroyed} lang={lang} />
          </Tile>
        )}
        {showDamage && bridges != null && (
          <Tile value={n(bridges)} label={t('bridges')} lang={lang}>
            <BipadUnder value={totals?.bridgesDestroyed} lang={lang} />
          </Tile>
        )}
      </div>

      {compactFootnote ? (
        <div className="fl-prov">
          <p className="fl-prov-row">
            {totals && (
              <>
                <span>
                  {t('read')} {ageFrom(corridor?.fetchedAt, lang)}
                </span>
                <a href="https://bipadportal.gov.np/" target="_blank" rel="noopener noreferrer">
                  {lang === 'ne' ? 'बिपद् पोर्टल' : 'BIPAD Portal'} &#8599;
                </a>
              </>
            )}
            <span>
              {t('asOf')}{' '}
              {(lang === 'ne' ? figures.as_of_label_ne || figures.as_of_label_en : figures.as_of_label_en) || '—'}
            </span>
          </p>
          {(figures.sources || []).length > 0 && (
            <details className="fl-prov-sources">
              <summary>
                {(figures.sources || []).length} {t('sourcesN')}
              </summary>
              <ul>
                {(figures.sources || []).map((src, i) => (
                  <li key={i}>
                    <a href={src.url} target="_blank" rel="noopener noreferrer">
                      {src.label} &#8599;
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="fl-prov-note">{t('caveatShort')}</p>
        </div>
      ) : (
        <p className="fl-note">
          {totals && (
            <>
              {t('read')} {ageFrom(corridor?.fetchedAt, lang)}
              {' · '}
              <a href="https://bipadportal.gov.np/" target="_blank" rel="noopener noreferrer">
                {lang === 'ne' ? 'बिपद् पोर्टल' : 'BIPAD Portal'} &#8599;
              </a>
              {' · '}
            </>
          )}
          {figures && (
            <>
              {t('asOf')}{' '}
              {(lang === 'ne' ? figures.as_of_label_ne || figures.as_of_label_en : figures.as_of_label_en) || '—'}
              {(figures.sources || []).map((src, i) => (
                <a key={i} href={src.url} target="_blank" rel="noopener noreferrer">
                  {' · '}
                  {src.label} &#8599;
                </a>
              ))}
              {' · '}
            </>
          )}
          <span className="fl-blank">{scope === 'headline' ? t('caveatHeadline') : t('caveat')}</span>
        </p>
      )}
    </>
  );
}
