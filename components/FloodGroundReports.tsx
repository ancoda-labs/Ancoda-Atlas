'use client';

import React, { useRef, useState } from 'react';
import type { FloodPhoto } from '@/lib/types';
import { ageFrom, orientationTransform } from '@/lib/relative-time';

// Ground reports — photos the public sends in from the flood corridor.
//
// The section leads with the safety notice, not with the upload button, and the
// notice is a gate rather than a footnote: the form does not open until the
// sender confirms they were not at the water's edge, and the server checks the
// same thing again. Asking people for flood photographs and warning them away
// from the river are in tension, and the only honest way to run both is to make
// the warning the first thing in the way.

type Lang = 'en' | 'ne';

const MAX_BYTES = 12 * 1024 * 1024;

const T = {
  title: { en: 'Ground reports', ne: 'जनताबाट आएका रिपोर्ट' },
  kicker: { en: 'From people there', ne: 'त्यहाँ भएकाहरूबाट' },
  intro: {
    en: 'Photos sent in by people in the affected districts. They appear here as soon as they are sent — Atlas does not check them first, so treat them as one person’s account rather than as confirmation.',
    ne: 'प्रभावित जिल्लामा रहेका मानिसहरूले पठाएका तस्बिर। पठाउनासाथ यहाँ देखिन्छन् — एट्लसले पहिले जाँच्दैन, त्यसैले यसलाई एक जनाको भनाइ मान्नुहोस्, पुष्टि होइन।',
  },
  safetyHeading: { en: 'Before you take any photo', ne: 'तस्बिर खिच्नुअघि' },
  gate: {
    en: 'I took this from a safe distance, or after the water had gone. I did not go to the riverbank for it.',
    ne: 'मैले यो सुरक्षित दूरीबाट, वा पानी गइसकेपछि खिचेको हुँ। यसका लागि म नदी किनारमा गएको होइन।',
  },
  openForm: { en: 'Send a photo', ne: 'तस्बिर पठाउनुहोस्' },
  cancel: { en: 'Cancel', ne: 'रद्द' },
  choose: { en: 'Choose a photo', ne: 'तस्बिर छान्नुहोस्' },
  caption: { en: 'What does it show?', ne: 'यसमा के देखिन्छ?' },
  captionHint: { en: 'Optional. A road, a bridge, a shelter — in a sentence.', ne: 'ऐच्छिक। सडक, पुल, आश्रय — एक वाक्यमा।' },
  name: { en: 'Your name', ne: 'तपाईंको नाम' },
  nameHint: { en: 'Optional, and shown publicly. Leave blank to stay anonymous.', ne: 'ऐच्छिक, र सार्वजनिक देखिन्छ। अज्ञात रहन खाली छोड्नुहोस्।' },
  district: { en: 'District', ne: 'जिल्ला' },
  districtHint: { en: 'Used only if the photo carries no location of its own.', ne: 'तस्बिरमा आफ्नै स्थान नभएमा मात्र प्रयोग हुन्छ।' },
  useLocation: { en: 'Use my current location', ne: 'मेरो अहिलेको स्थान प्रयोग गर्नुहोस्' },
  locationSet: { en: 'Location attached', ne: 'स्थान जोडियो' },
  locationDenied: { en: 'Location unavailable — pick a district instead', ne: 'स्थान उपलब्ध भएन — बरु जिल्ला छान्नुहोस्' },
  privacy: {
    en: 'Atlas removes the camera, device and location tags from the file before storing it. The only position kept is the one shown on the map.',
    ne: 'एट्लसले फाइल भण्डारण गर्नुअघि क्यामेरा, यन्त्र र स्थानका ट्यागहरू हटाउँछ। नक्सामा देखिने स्थान मात्र राखिन्छ।',
  },
  submit: { en: 'Send', ne: 'पठाउनुहोस्' },
  sending: { en: 'Sending…', ne: 'पठाउँदै…' },
  sent: { en: 'Thank you — your photo is on the map.', ne: 'धन्यवाद — तपाईंको तस्बिर नक्सामा छ।' },
  empty: { en: 'No ground reports yet.', ne: 'अहिलेसम्म कुनै रिपोर्ट आएको छैन।' },
  disabled: { en: 'Photo reports are not switched on for this deployment.', ne: 'यो सर्भरमा तस्बिर रिपोर्ट सक्रिय गरिएको छैन।' },
  report: { en: 'Report this photo', ne: 'यो तस्बिर उजुरी गर्नुहोस्' },
  reported: { en: 'Reported — thank you', ne: 'उजुरी दर्ता भयो — धन्यवाद' },
  reportConfirm: {
    en: 'Report this photo as graphic, false, or not related to the flood?',
    ne: 'यो तस्बिर बीभत्स, गलत, वा बाढीसँग असम्बन्धित भनी उजुरी गर्ने?',
  },
  approx: { en: 'district only', ne: 'जिल्ला मात्र' },
  fromPhoto: { en: 'from the photo', ne: 'तस्बिरबाट' },
  fromDevice: { en: 'sender’s position', ne: 'पठाउनेको स्थान' },
  anonymous: { en: 'Anonymous', ne: 'अज्ञात' },
  errTooLarge: { en: 'That file is over 12 MB. Please send a smaller photo.', ne: 'फाइल १२ एमबी भन्दा ठूलो छ। सानो तस्बिर पठाउनुहोस्।' },
  errFormat: { en: 'Only JPEG, PNG and WebP photos can be sent.', ne: 'JPEG, PNG र WebP तस्बिर मात्र पठाउन सकिन्छ।' },
  errRate: { en: 'You have sent several photos already. Please try again in a few minutes.', ne: 'तपाईंले धेरै तस्बिर पठाइसक्नुभयो। केही मिनेटपछि प्रयास गर्नुहोस्।' },
  errGeneric: { en: 'That did not send. Please try again.', ne: 'पठाउन सकिएन। फेरि प्रयास गर्नुहोस्।' },
};

const DISTRICTS: Array<{ value: string; en: string; ne: string }> = [
  { value: 'Rasuwa', en: 'Rasuwa', ne: 'रसुवा' },
  { value: 'Nuwakot', en: 'Nuwakot', ne: 'नुवाकोट' },
  { value: 'Dhading', en: 'Dhading', ne: 'धादिङ' },
  { value: 'Gorkha', en: 'Gorkha', ne: 'गोरखा' },
  { value: 'Chitwan', en: 'Chitwan', ne: 'चितवन' },
  { value: 'Sindhupalchok', en: 'Sindhupalchok', ne: 'सिन्धुपाल्चोक' },
  { value: 'Kathmandu', en: 'Kathmandu', ne: 'काठमाडौँ' },
];

/** Map an error code from the upload route onto a sentence a sender can act on. */
function errorText(code: string, lang: Lang): string {
  if (code === 'file_too_large') return T.errTooLarge[lang];
  if (code === 'unsupported_format') return T.errFormat[lang];
  if (code === 'rate_limited') return T.errRate[lang];
  return T.errGeneric[lang];
}

interface Props {
  photos: FloodPhoto[];
  enabled: boolean;
  lang: Lang;
  /** The reviewed safety notice from content/bhotekoshi-flood/site.json. */
  safetyNotice: string;
  onUploaded: () => void;
  onOpen: (id: string) => void;
}

export default function FloodGroundReports({ photos, enabled, lang, safetyNotice, onUploaded, onOpen }: Props) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [contributor, setContributor] = useState('');
  const [district, setDistrict] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [geoState, setGeoState] = useState<'idle' | 'asking' | 'ok' | 'denied'>('idle');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [reported, setReported] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement | null>(null);

  const t = (key: keyof typeof T) => T[key][lang];

  const pickFile = (chosen: File | null) => {
    setError(null);
    setDone(false);
    if (!chosen) {
      setFile(null);
      setPreview(null);
      return;
    }
    if (chosen.size > MAX_BYTES) {
      setError(T.errTooLarge[lang]);
      setFile(null);
      setPreview(null);
      return;
    }
    setFile(chosen);
    setPreview(URL.createObjectURL(chosen));
  };

  const askLocation = () => {
    if (!navigator.geolocation) {
      setGeoState('denied');
      return;
    }
    setGeoState('asking');
    navigator.geolocation.getCurrentPosition(
      pos => {
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setGeoState('ok');
      },
      () => setGeoState('denied'),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setCaption('');
    setContributor('');
    setDistrict('');
    setCoords(null);
    setGeoState('idle');
    setProgress(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !acknowledged || progress != null) return;
    setError(null);

    const form = new FormData();
    form.set('photo', file);
    form.set('safetyAcknowledged', 'true');
    if (caption.trim()) form.set('caption', caption.trim());
    if (contributor.trim()) form.set('contributor', contributor.trim());
    if (district) form.set('district', district);
    if (coords) {
      form.set('lat', String(coords.lat));
      form.set('lon', String(coords.lon));
    }

    // XHR rather than fetch: a photo over a mobile connection can take a minute
    // and the only thing worse than a slow upload is one with no progress bar.
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/flood/photos');
    xhr.upload.addEventListener('progress', ev => {
      if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100));
    });
    xhr.addEventListener('load', () => {
      setProgress(null);
      if (xhr.status === 201) {
        setDone(true);
        reset();
        onUploaded();
        return;
      }
      let code = 'unknown';
      try {
        const body: unknown = JSON.parse(xhr.responseText);
        if (body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string') {
          code = (body as { error: string }).error;
        }
      } catch {
        /* a non-JSON body is still an error, just an unlabelled one */
      }
      setError(errorText(code, lang));
    });
    xhr.addEventListener('error', () => {
      setProgress(null);
      setError(T.errGeneric[lang]);
    });
    setProgress(0);
    xhr.send(form);
  };

  const report = async (id: string) => {
    if (reported.has(id)) return;
    if (!window.confirm(T.reportConfirm[lang])) return;
    setReported(prev => new Set(prev).add(id));
    try {
      await fetch('/api/flood/photos/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      onUploaded();
    } catch {
      /* the flag is best-effort; the local state already reads as reported */
    }
  };

  const geoLabel = (photo: FloodPhoto): string | null => {
    if (photo.geoSource === 'exif') return T.fromPhoto[lang];
    if (photo.geoSource === 'device') return T.fromDevice[lang];
    if (photo.geoSource === 'district') return T.approx[lang];
    return null;
  };

  return (
    <section className="fl-sec" id="ground-reports">
      <div className="fl-sec-head">
        <span>{t('kicker')}</span>
        <h2>{t('title')}</h2>
        {photos.length > 0 && <em>{photos.length}</em>}
      </div>

      {/* The notice comes before the invitation, deliberately. */}
      <div className="fl-safety-gate">
        <h4>{t('safetyHeading')}</h4>
        <p>{safetyNotice}</p>
      </div>

      <p className="fl-note">{t('intro')}</p>

      {!enabled ? (
        <p className="fl-empty">{t('disabled')}</p>
      ) : (
        <>
          <label className="fl-gate-check">
            <input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} />
            <span>{t('gate')}</span>
          </label>

          {acknowledged && (
            <form className="fl-upload" onSubmit={submit}>
              <div className="fl-upload-file">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  id="fl-photo-input"
                  onChange={e => pickFile(e.target.files?.[0] || null)}
                />
                <label htmlFor="fl-photo-input">{file ? file.name : t('choose')}</label>
                {preview && <img src={preview} alt="" className="fl-upload-preview" />}
              </div>

              <label className="fl-field">
                <span>{t('caption')}</span>
                <textarea
                  value={caption}
                  maxLength={280}
                  rows={2}
                  onChange={e => setCaption(e.target.value)}
                  placeholder={T.captionHint[lang]}
                />
              </label>

              <div className="fl-field-row">
                <label className="fl-field">
                  <span>{t('name')}</span>
                  <input
                    type="text"
                    value={contributor}
                    maxLength={60}
                    onChange={e => setContributor(e.target.value)}
                    placeholder={T.nameHint[lang]}
                  />
                </label>
                <label className="fl-field">
                  <span>{t('district')}</span>
                  <select value={district} onChange={e => setDistrict(e.target.value)}>
                    <option value="">—</option>
                    {DISTRICTS.map(d => (
                      <option key={d.value} value={d.value}>{lang === 'ne' ? d.ne : d.en}</option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="fl-field-hint">{t('districtHint')}</p>

              <button type="button" className="fl-geo-btn" onClick={askLocation} disabled={geoState === 'asking'}>
                {geoState === 'ok' ? `✓ ${t('locationSet')}` : geoState === 'denied' ? t('locationDenied') : t('useLocation')}
              </button>

              <p className="fl-field-hint">{t('privacy')}</p>

              {error && <p className="fl-upload-err">{error}</p>}

              <button type="submit" className="fl-upload-send" disabled={!file || progress != null}>
                {progress != null ? `${t('sending')} ${progress}%` : t('submit')}
              </button>
              {progress != null && (
                <span className="fl-upload-bar"><i style={{ width: `${progress}%` }} /></span>
              )}
            </form>
          )}

          {done && <p className="fl-upload-ok">{t('sent')}</p>}

          {photos.length === 0 ? (
            <p className="fl-empty">{t('empty')}</p>
          ) : (
            <div className="fl-reports">
              {photos.map(photo => (
                <figure key={photo.id}>
                  <button type="button" className="fl-report-img" onClick={() => onOpen(photo.id)}>
                    <img
                      src={photo.url}
                      alt={photo.caption || 'Ground report photo'}
                      loading="lazy"
                      style={{ transform: orientationTransform(photo.orientation) }}
                    />
                  </button>
                  <figcaption>
                    {photo.caption && <p>{photo.caption}</p>}
                    <span className="fl-report-meta">
                      <b>{photo.contributor || T.anonymous[lang]}</b>
                      {photo.district && <em>{photo.district}</em>}
                      <time>{ageFrom(photo.createdAt, lang)}</time>
                      {geoLabel(photo) && <i>{geoLabel(photo)}</i>}
                    </span>
                    <button type="button" className="fl-report-flag" onClick={() => report(photo.id)}>
                      {reported.has(photo.id) ? t('reported') : t('report')}
                    </button>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
