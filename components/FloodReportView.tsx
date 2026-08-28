'use client';

import React, { useCallback, useEffect, useState } from 'react';
import FloodShell from './FloodShell';
import FloodGroundReports from './FloodGroundReports';
import FloodDistrictMap from './FloodDistrictMap';
import type { MapPhoto, MapSelection } from './FloodDistrictMap';
import FloodMapDialog from './FloodMapDialog';
import { useFloodLang } from '@/lib/use-flood-lang';
import { ageFrom, orientationTransform } from '@/lib/relative-time';
import type { FloodDeskPayload, FloodPhoto, FloodPhotoFeed } from '@/lib/types';

// Photographs sent in from the corridor, and the map they sit on.
//
// Separated from the overview so the upload form has room to lead with the
// safety notice rather than compete with the death toll for attention. The map
// here carries only the ground reports, so a pin is a photograph rather than
// one symbol among four.

const T = {
  kicker: { en: 'From the ground', ne: 'घटनास्थलबाट' },
  title: { en: 'Ground reports', ne: 'जनताबाट आएका रिपोर्ट' },
  standfirst: {
    en: 'Photographs sent in by people in the affected districts, shown where they were taken.',
    ne: 'प्रभावित जिल्लाका मानिसहरूले पठाएका तस्बिर, खिचिएकै स्थानमा देखाइएको।',
  },
  mapTitle: { en: 'Where the photos are from', ne: 'तस्बिर कहाँबाट आए' },
  mapEmpty: {
    en: 'No located photos yet. A photo appears here once one arrives carrying a position.',
    ne: 'अहिलेसम्म स्थान सहितको तस्बिर छैन। स्थान भएको तस्बिर आएपछि यहाँ देखिन्छ।',
  },
  close: { en: 'Close', ne: 'बन्द' },
  unverified: {
    en: 'Sent in by a member of the public and not verified by Atlas.',
    ne: 'जनताबाट आएको हो र एट्लसले पुष्टि गरेको छैन।',
  },
  anonymous: { en: 'Anonymous', ne: 'अज्ञात' },
};

export default function FloodReportView() {
  const [lang, setLang] = useFloodLang();
  const [desk, setDesk] = useState<FloodDeskPayload | null>(null);
  const [feed, setFeed] = useState<FloodPhotoFeed | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [selection, setSelection] = useState<MapSelection | null>(null);
  const t = (key: keyof typeof T) => T[key][lang];

  const loadPhotos = useCallback(async () => {
    try {
      const res = await fetch('/api/flood/photos');
      if (res.ok) setFeed(await res.json());
    } catch {
      setFeed({ enabled: false, photos: [], reason: 'unavailable' });
    }
  }, []);

  useEffect(() => {
    loadPhotos();
    fetch('/api/flood')
      .then(r => (r.ok ? r.json() : null))
      .then(d => d && setDesk(d))
      .catch(() => {});
  }, [loadPhotos]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenId(null);
        setSelection(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const photos: FloodPhoto[] = feed?.photos || [];
  const mapPhotos: MapPhoto[] = photos
    .filter((p): p is FloodPhoto & { lat: number; lon: number } => p.lat != null && p.lon != null)
    .map(p => ({
      id: p.id,
      lat: p.lat,
      lon: p.lon,
      geoSource: p.geoSource,
      label: p.caption || (lang === 'ne' ? 'जनताको तस्बिर' : 'Ground report'),
    }));
  const open = photos.find(p => p.id === openId) || null;
  const site = desk?.site;
  const safety = site ? (lang === 'ne' ? site.safety_ne || site.safety_en : site.safety_en) || '' : '';

  return (
    <FloodShell lang={lang} setLang={setLang} kicker={t('kicker')} title={t('title')} standfirst={t('standfirst')}>
      <section className="fl-sec">
        <div className="fl-sec-head">
          <span>{lang === 'ne' ? 'नक्सा' : 'Map'}</span>
          <h2>{t('mapTitle')}</h2>
          {mapPhotos.length > 0 && <em>{mapPhotos.length}</em>}
        </div>
        <FloodDistrictMap photos={mapPhotos} onSelect={setSelection} lang={lang} />
        {mapPhotos.length === 0 && <p className="fl-note">{t('mapEmpty')}</p>}
      </section>

      <FloodGroundReports
        photos={photos}
        enabled={feed?.enabled ?? false}
        lang={lang}
        safetyNotice={safety}
        onUploaded={loadPhotos}
        onOpen={setOpenId}
      />

      <FloodMapDialog
        selection={selection}
        pathPoints={desk?.floodPath?.points || []}
        gauges={desk?.river?.gauges || []}
        photos={photos}
        lang={lang}
        onClose={() => setSelection(null)}
      />

      {open && (
        <div className="fl-lightbox fl-lightbox-photo" onClick={() => setOpenId(null)} role="dialog" aria-modal="true">
          <div onClick={e => e.stopPropagation()}>
            <img
              src={open.url}
              alt={open.caption || 'Ground report photo'}
              style={{ transform: orientationTransform(open.orientation) }}
            />
            {open.caption && <p className="fl-payee">{open.caption}</p>}
            <p className="fl-note">
              {open.contributor || T.anonymous[lang]}
              {open.district ? ` · ${open.district}` : ''} · {ageFrom(open.createdAt, lang)}
            </p>
            <p className="fl-note">{t('unverified')}</p>
            <button onClick={() => setOpenId(null)}>{t('close')}</button>
          </div>
        </div>
      )}
    </FloodShell>
  );
}
