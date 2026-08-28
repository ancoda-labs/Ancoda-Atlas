'use client';

import React from 'react';
import type { MapSelection } from './FloodDistrictMap';
import type { Lang } from '@/lib/use-flood-lang';
import { ageFrom, ageLabel, orientationTransform } from '@/lib/relative-time';
import type { FloodGauge, FloodPathPoint, FloodPhoto } from '@/lib/types';

// What opens when someone clicks the map.
//
// The point of the dialog is the photographs. A place name and a status tell a
// reader almost nothing about what a village looks like now; a picture taken
// there this morning tells them a great deal. So whatever was clicked, this
// gathers the most recent imagery attached to that location and leads with it.
//
// Ground-report photographs are matched to a place by distance, and the radius
// is stated in the dialog rather than hidden — a photo twelve kilometres from
// Galchhi is evidence about the corridor, not about Galchhi, and the reader
// should be able to tell which they are looking at.

/** How far from a place a ground report can be and still be shown against it. */
const NEARBY_KM = 20;

const T = {
  close: { en: 'Close', ne: 'बन्द' },
  entry: { en: 'Where the flood entered Nepal', ne: 'बाढी नेपाल छिरेको बिन्दु' },
  reached: { en: 'Water confirmed to have reached here', ne: 'यहाँ पानी पुगेको पुष्टि' },
  estimated: { en: 'Estimated reach — not a confirmed observation', ne: 'अनुमानित प्रवाह — पुष्टि भएको अवलोकन होइन' },
  recentImages: { en: 'Recent photographs', ne: 'हालैका तस्बिर' },
  nearbyNote: {
    en: `Ground reports sent in from within ${NEARBY_KM} km. Sent by members of the public and not verified by Atlas.`,
    ne: `${NEARBY_KM} कि.मी. भित्रबाट आएका तस्बिर। जनताबाट पठाइएका हुन्, एट्लसले पुष्टि गरेको छैन।`,
  },
  noImages: {
    en: 'No photographs have been sent in from near here yet.',
    ne: 'यहाँ नजिकबाट अहिलेसम्म कुनै तस्बिर आएको छैन।',
  },
  sendOne: { en: 'Send a photo from here', ne: 'यहाँबाट तस्बिर पठाउनुहोस्' },
  gaugeStation: { en: 'DHM gauge station', ne: 'डीएचएम मापन केन्द्र' },
  level: { en: 'Water level', ne: 'पानीको सतह' },
  warning: { en: 'Warning', ne: 'सचेत' },
  danger: { en: 'Danger', ne: 'खतरा' },
  updated: { en: 'Updated', ne: 'अद्यावधिक' },
  stationPhotoNote: {
    en: 'Photograph of the gauge station itself, published by DHM. It is not a live camera view of the flood.',
    ne: 'यो जल तथा मौसम विज्ञान विभागले प्रकाशित गरेको मापन केन्द्रकै तस्बिर हो। बाढीको प्रत्यक्ष क्यामेरा दृश्य होइन।',
  },
  noReading: { en: 'No current reading', ne: 'हालको तथ्यांक छैन' },
  staleNote: {
    en: 'This gauge has not reported recently. The last reading is shown for reference only, not as the level now.',
    ne: 'यो मापन केन्द्रले हालै तथ्यांक पठाएको छैन। अन्तिम रिडिङ सन्दर्भका लागि मात्र हो, अहिलेको सतह होइन।',
  },
  anonymous: { en: 'Anonymous', ne: 'अज्ञात' },
  nearestGauge: { en: 'Nearest gauge', ne: 'नजिकको मापन केन्द्र' },
  away: { en: 'away', ne: 'टाढा' },
};

/** Great-circle distance in kilometres. */
function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

interface Props {
  selection: MapSelection | null;
  pathPoints: FloodPathPoint[];
  gauges: FloodGauge[];
  photos: FloodPhoto[];
  lang: Lang;
  onClose: () => void;
}

function PhotoStrip({ photos, lang }: { photos: FloodPhoto[]; lang: Lang }) {
  return (
    <div className="fl-dlg-shots">
      {photos.map(p => (
        <figure key={p.id}>
          <img
            src={p.url}
            alt={p.caption || 'Ground report'}
            loading="lazy"
            style={{ transform: orientationTransform(p.orientation) }}
          />
          <figcaption>
            {p.caption && <p>{p.caption}</p>}
            <span>
              {p.contributor || T.anonymous[lang]} · {ageFrom(p.createdAt, lang)}
            </span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

export default function FloodMapDialog({ selection, pathPoints, gauges, photos, lang, onClose }: Props) {
  if (!selection) return null;
  const t = (key: keyof typeof T) => T[key][lang];
  const ne = lang === 'ne';

  const L = (o: object | null | undefined, key: string): string => {
    if (!o) return '';
    const obj = o as Record<string, unknown>;
    const val = ne ? obj[`${key}_ne`] || obj[`${key}_en`] : obj[`${key}_en`];
    return typeof val === 'string' ? val : '';
  };

  let title = '';
  let subtitle = '';
  let body: React.ReactNode = null;

  if (selection.kind === 'point') {
    const point = pathPoints.find(p => p.id === selection.id);
    if (!point) return null;
    title = L(point, 'name');
    subtitle = L(point, 'district');

    const status =
      point.status === 'entry' ? t('entry')
      : point.status === 'estimated' || point.status === 'at-risk' ? t('estimated')
      : t('reached');

    const nearby = photos
      .filter(p => p.lat != null && p.lon != null && distanceKm(point.lat, point.lng, p.lat, p.lon) <= NEARBY_KM)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 8);

    // The closest gauge doubles as an objective reading for the place.
    const withCoords = gauges.filter(g => g.lat != null && g.lon != null);
    const nearestGauge = withCoords
      .map(g => ({ gauge: g, km: distanceKm(point.lat, point.lng, g.lat as number, g.lon as number) }))
      .sort((a, b) => a.km - b.km)[0];

    body = (
      <>
        <p className={`fl-dlg-status s-${point.status}`}>{status}</p>
        {L(point, 'notes') && <p className="fl-dlg-notes">{L(point, 'notes')}</p>}

        {nearestGauge && nearestGauge.km <= 40 && (
          <p className="fl-dlg-gauge">
            <b>{t('nearestGauge')}:</b> {ne ? nearestGauge.gauge.labelNe : nearestGauge.gauge.label} ·{' '}
            {nearestGauge.gauge.waterLevel != null && !nearestGauge.gauge.stale
              ? `${nearestGauge.gauge.waterLevel.toFixed(2)} m`
              : t('noReading')}{' '}
            · {Math.round(nearestGauge.km)} km {t('away')}
          </p>
        )}

        <h4>{t('recentImages')}</h4>
        {nearby.length ? (
          <>
            <PhotoStrip photos={nearby} lang={lang} />
            <p className="fl-note">{t('nearbyNote')}</p>
          </>
        ) : (
          <p className="fl-empty">{t('noImages')}</p>
        )}
      </>
    );
  }

  if (selection.kind === 'gauge') {
    const gauge = gauges.find(g => g.id === selection.id);
    if (!gauge) return null;
    title = ne ? gauge.labelNe : gauge.label;
    subtitle = `${ne ? gauge.districtNe : gauge.district} · ${t('gaugeStation')}`;

    const nearby =
      gauge.lat != null && gauge.lon != null
        ? photos
            .filter(p => p.lat != null && p.lon != null && distanceKm(gauge.lat as number, gauge.lon as number, p.lat, p.lon) <= NEARBY_KM)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 6)
        : [];

    body = (
      <>
        <dl className="fl-dlg-readings">
          <div>
            <dt>{t('level')}</dt>
            <dd>{gauge.waterLevel != null ? `${gauge.waterLevel.toFixed(2)} m` : '—'}</dd>
          </div>
          {gauge.warningLevel != null && (
            <div>
              <dt>{t('warning')}</dt>
              <dd>{gauge.warningLevel} m</dd>
            </div>
          )}
          {gauge.dangerLevel != null && (
            <div>
              <dt>{t('danger')}</dt>
              <dd>{gauge.dangerLevel} m</dd>
            </div>
          )}
          <div>
            <dt>{t('updated')}</dt>
            <dd>{ageLabel(gauge.ageMinutes, lang)}</dd>
          </div>
        </dl>
        {gauge.stale && <p className="fl-dlg-stale">{t('staleNote')}</p>}

        <h4>{t('recentImages')}</h4>
        {gauge.photo && (
          <figure className="fl-dlg-station">
            <img src={gauge.photo} alt={`${gauge.label} gauge station`} loading="lazy" />
            <figcaption>{t('stationPhotoNote')}</figcaption>
          </figure>
        )}
        {nearby.length > 0 ? (
          <>
            <PhotoStrip photos={nearby} lang={lang} />
            <p className="fl-note">{t('nearbyNote')}</p>
          </>
        ) : (
          !gauge.photo && <p className="fl-empty">{t('noImages')}</p>
        )}
      </>
    );
  }

  if (selection.kind === 'photo') {
    const photo = photos.find(p => p.id === selection.id);
    if (!photo) return null;
    title = photo.caption || (ne ? 'जनताको तस्बिर' : 'Ground report');
    subtitle = `${photo.contributor || T.anonymous[lang]}${photo.district ? ` · ${photo.district}` : ''} · ${ageFrom(photo.createdAt, lang)}`;
    body = (
      <>
        <figure className="fl-dlg-single">
          <img
            src={photo.url}
            alt={photo.caption || 'Ground report'}
            style={{ transform: orientationTransform(photo.orientation) }}
          />
        </figure>
        <p className="fl-note">{t('nearbyNote')}</p>
      </>
    );
  }

  return (
    <div className="fl-lightbox fl-dlg" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div onClick={e => e.stopPropagation()}>
        <header className="fl-dlg-head">
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </header>
        <div className="fl-dlg-body">{body}</div>
        <button onClick={onClose}>{t('close')}</button>
      </div>
    </div>
  );
}
