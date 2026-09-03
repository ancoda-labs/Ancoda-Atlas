import React from 'react';

import type { Lang } from '@/hooks/use-flood-lang';
import type { ClimateFact } from '@/types';

export function pickCopy(lang: Lang, en: string | null | undefined, ne: string | null | undefined): string {
  if (lang === 'ne') return (ne && ne !== 'TODO' ? ne : en) || '';
  return (en || ne || '').trim();
}

export function SourceChip({
  fact,
  fallback,
}: {
  fact: ClimateFact | null | undefined;
  fallback?: { label: string; url: string; year?: string | number | null };
}) {
  const label = fact?.organisation || fallback?.label;
  const year = fact?.published ? fact.published.slice(0, 4) : fallback?.year;
  const href = fact?.url || fallback?.url;
  if (!label || !href) return null;
  return (
    <p className="fl-note">
      <a href={href} target="_blank" rel="noopener noreferrer">
        {label}
        {year ? ` ${year}` : ''}
        {' ↗'}
      </a>
    </p>
  );
}

export function ClimatePanel({
  id,
  index,
  kicker,
  headline,
  caption,
  chip,
  table,
  children,
}: {
  id: string;
  index: string;
  kicker: string;
  headline: string;
  caption?: string;
  chip?: React.ReactNode;
  table?: React.ReactNode;
  children: React.ReactNode;
}) {
  if (!headline) return null;
  return (
    <section className="fl-sec cl-viz" id={id}>
      <div className="fl-sec-head">
        <span>
          {index} — {kicker}
        </span>
        <h2>{headline}</h2>
      </div>
      {children}
      {caption ? <p className="fl-note">{caption}</p> : null}
      {chip}
      {table}
    </section>
  );
}
