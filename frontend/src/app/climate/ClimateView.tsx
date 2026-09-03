'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';

import ArrivedPanel from '@/app/climate/_components/ArrivedPanel';
import CausePanel from '@/app/climate/_components/CausePanel';
import ClimateLang from '@/app/climate/_components/ClimateLang';
import IcePanel from '@/app/climate/_components/IcePanel';
import LakesPanel from '@/app/climate/_components/LakesPanel';
import NewsPanel from '@/app/climate/_components/NewsPanel';
import { pickCopy } from '@/app/climate/_components/ClimatePanel';
import FloodShell from '@/components/FloodShell';
import { useFloodLang, type Lang } from '@/hooks/use-flood-lang';
import type { ClimateContextPayload, NewsResponse } from '@/types';

const T = {
  kicker: { en: 'Climate', ne: 'TODO' },
  jumpLabel: { en: 'On this page', ne: 'TODO' },
  jumpHint: { en: 'Tap a box to jump', ne: 'TODO' },
  ice: { en: 'Ice', ne: 'TODO' },
  iceSub: { en: 'Glacier area lost', ne: 'TODO' },
  lakes: { en: 'Lakes', ne: 'TODO' },
  lakesSub: { en: 'Dangerous glacial lakes', ne: 'TODO' },
  arrived: { en: 'Arrived', ne: 'TODO' },
  arrivedSub: { en: 'What BIPAD recorded', ne: 'TODO' },
  cause: { en: 'Cause', ne: 'TODO' },
  causeSub: { en: "Nepal's CO₂ share", ne: 'TODO' },
  news: { en: 'News', ne: 'TODO' },
  newsSub: { en: 'Climate wire', ne: 'TODO' },
} as const;

export default function ClimateView({
  lang: routeLang,
  data,
  news,
}: {
  lang: Lang;
  data: ClimateContextPayload | null;
  news: NewsResponse | null;
}) {
  const [, setStoreLang] = useFloodLang();
  const router = useRouter();
  const pathname = usePathname();
  const lang = routeLang;

  const setLang = (next: Lang) => {
    setStoreLang(next);
    const target = next === 'ne' ? '/ne/climate' : '/climate';
    if (pathname !== target) router.push(target);
  };

  const section = data?.section;
  const facts = data?.facts || [];
  const iceFact = facts.find(fact => fact.id === section?.ice?.factId);
  const lakeFact = facts.find(fact => fact.id === section?.lakes?.factId);
  const title = pickCopy(lang, section?.titleEn, section?.titleNe) || 'Climate';
  const standfirst = pickCopy(lang, section?.standfirstEn, section?.standfirstNe);
  const disclaimer = pickCopy(lang, data?.disclaimerEn, data?.disclaimerNe);
  const showIce = Boolean(section?.ice && iceFact);
  const showLakes = Boolean(section?.lakes && lakeFact);
  const showArrived = Boolean(section?.arrived && data?.arrived?.hazards.length && data.arrived.source?.url);
  const showCause = Boolean(section?.cause && data?.emissions && Object.keys(data.emissions.metrics || {}).length);
  const jumps = [
    showIce && {
      href: '#ice',
      n: '1',
      label: pickCopy(lang, T.ice.en, T.ice.ne),
      sub: pickCopy(lang, T.iceSub.en, T.iceSub.ne),
      em: typeof section?.ice?.percent === 'number' ? `${section.ice.percent}%` : '',
    },
    showLakes && {
      href: '#lakes',
      n: '2',
      label: pickCopy(lang, T.lakes.en, T.lakes.ne),
      sub: pickCopy(lang, T.lakesSub.en, T.lakesSub.ne),
      em:
        typeof section?.lakes?.china === 'number'
          ? `${section.lakes.china} / ${section.lakes.nepal} / ${section.lakes.india}`
          : '',
    },
    showArrived && {
      href: '#arrived',
      n: '3',
      label: pickCopy(lang, T.arrived.en, T.arrived.ne),
      sub: pickCopy(lang, T.arrivedSub.en, T.arrivedSub.ne),
      em: data?.arrived?.years?.length
        ? `${data.arrived.years[0]}–${data.arrived.years[data.arrived.years.length - 1]}`
        : '',
    },
    showCause && {
      href: '#cause',
      n: '4',
      label: pickCopy(lang, T.cause.en, T.cause.ne),
      sub: pickCopy(lang, T.causeSub.en, T.causeSub.ne),
      em: '',
    },
    {
      href: '#news',
      n: '5',
      label: pickCopy(lang, T.news.en, T.news.ne),
      sub: pickCopy(lang, T.newsSub.en, T.newsSub.ne),
      em: '',
    },
  ].filter(Boolean) as Array<{ href: string; n: string; label: string; sub: string; em: string }>;

  return (
    <FloodShell
      lang={lang}
      setLang={setLang}
      kicker={pickCopy(lang, T.kicker.en, T.kicker.ne)}
      title={title}
      standfirst={standfirst}
    >
      <ClimateLang lang={lang} />
      {disclaimer ? <p className="fl-note">{disclaimer}</p> : null}
      {jumps.length > 0 ? (
        <nav className="fl-jump fl-jump-fit" aria-label={pickCopy(lang, T.jumpLabel.en, T.jumpLabel.ne)}>
          <p className="fl-jump-kicker">{pickCopy(lang, T.jumpHint.en, T.jumpHint.ne)}</p>
          {jumps.map(item => (
            <a key={item.href} href={item.href}>
              <b>{item.n}</b>
              <strong>{item.label}</strong>
              {item.em ? <em>{item.em}</em> : null}
              <span>{item.sub}</span>
            </a>
          ))}
        </nav>
      ) : null}

      {showIce && section?.ice && <IcePanel lang={lang} copy={section.ice} fact={iceFact} />}

      {/* TODO HEAT — Nepal temperature anomaly by elevation. Flagged off until a reviewed DHM/ICIMOD series exists. */}

      {showLakes && section?.lakes && <LakesPanel lang={lang} copy={section.lakes} fact={lakeFact} />}

      {/* TODO WATER — monsoon onset/withdrawal and extreme-rainfall days. */}
      {/* TODO AIR — hazardous air days per year. */}
      {/* TODO FIRE — forest fire detections per year. */}

      {showArrived && section?.arrived && data?.arrived && (
        <ArrivedPanel lang={lang} copy={section.arrived} arrived={data.arrived} />
      )}

      {showCause && section?.cause && data?.emissions && (
        <CausePanel lang={lang} copy={section.cause} emissions={data.emissions} />
      )}

      <NewsPanel lang={lang} copy={section?.news} initial={news} />
    </FloodShell>
  );
}
