'use client';

import React, { useEffect, useState } from 'react';
import FloodShell from '@/components/FloodShell';
import { useFloodLang } from '@/hooks/use-flood-lang';
import { ageFrom } from '@/lib/relative-time';
import { DESK_POLL_MS } from '@/hooks/use-desk-refresh';
import type {
  FloodOfficialFeed,
  FloodVideo,
  NdrrmaPhoto,
  NewsItem,
  PortalCarouselPhoto,
  VideoFeed,
} from '@/types';

interface GalleryFeed {
  carousel: FloodOfficialFeed<PortalCarouselPhoto> | null;
  /** Still served by /api/flood/gallery; this page no longer renders it. */
  featured?: FloodOfficialFeed<NdrrmaPhoto> | null;
}

// Coverage: what the Nepali press and broadcasters are reporting.
//
// Neither the photographs nor the video are Atlas's, and neither is copied.
// Images are streamed from the outlet through a signed proxy at request time
// (lib/news-media.ts) — needed because several Nepali outlets still serve over
// plain HTTP, which a browser blocks on an HTTPS page. Video plays in YouTube's
// own embed, so the channel keeps its audience. Every item is a link back to
// the people who did the reporting.

const T = {
  kicker: { en: 'Coverage', ne: 'समाचार' },
  title: { en: 'What the press is reporting', ne: 'सञ्चारमाध्यमले के भन्दैछन्' },
  standfirst: {
    en: 'Reporting from Nepali newsrooms and broadcasters. Atlas links to it and hosts none of it.',
    ne: 'नेपाली सञ्चारगृह र प्रसारकहरूको रिपोर्टिङ। एट्लसले लिंक मात्र दिन्छ, कुनै सामग्री राख्दैन।',
  },
  press: { en: 'In print and online', ne: 'छापा र अनलाइन' },
  broadcast: { en: 'On television', ne: 'टेलिभिजनमा' },
  broadcastHint: {
    en: 'Plays on YouTube. Atlas stores no video — the channel keeps the view.',
    ne: 'युट्युबमा चल्छ। एट्लसले भिडियो राख्दैन — दृश्य गणना च्यानलकै हुन्छ।',
  },
  loading: { en: 'Loading…', ne: 'लोड हुँदै…' },
  noNews: { en: 'No reporting in the last 48 hours.', ne: 'बितेका ४८ घण्टामा समाचार छैन।' },
  noVideo: { en: 'No broadcast coverage found right now.', ne: 'अहिले प्रसारण सामग्री भेटिएन।' },
  watch: { en: 'Watch on YouTube', ne: 'युट्युबमा हेर्नुहोस्' },
  close: { en: 'Close', ne: 'बन्द' },
  searchOff: {
    en: 'Cross-channel search is off — set YOUTUBE_API_KEY to widen this beyond the listed channels.',
    ne: 'च्यानलबीचको खोज बन्द छ — सूचीबद्ध च्यानलभन्दा बाहिर खोज्न YOUTUBE_API_KEY सेट गर्नुहोस्।',
  },
  portalPhotos: { en: 'Photographs from the rescue portal', ne: 'उद्धार पोर्टलका तस्बिर' },
  portalPhotosHint: {
    en: 'Published by the Office of the Prime Minister on its rescue portal, with its own captions. Streamed from the portal — Atlas stores none of them.',
    ne: 'प्रधानमन्त्री कार्यालयले आफ्नो उद्धार पोर्टलमा आफ्नै क्याप्सनसहित प्रकाशित गरेका तस्बिर। पोर्टलबाटै देखाइएको — एट्लसले कुनै तस्बिर राख्दैन।',
  },
};

export default function FloodMediaView() {
  const [lang, setLang] = useFloodLang();
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [videoFeed, setVideoFeed] = useState<VideoFeed | null>(null);
  const [gallery, setGallery] = useState<GalleryFeed | null>(null);
  // NDRRMA publishes camera originals — one of them is a 9 MB JPEG the media
  // proxy refuses on size. A photograph that will not load is dropped rather
  // than left as a broken frame in the grid.
  const [brokenPhotos, setBrokenPhotos] = useState<Set<string>>(new Set());
  const [playing, setPlaying] = useState<FloodVideo | null>(null);
  const [visibleNewsCount, setVisibleNewsCount] = useState(9);
  const [visibleVideosCount, setVisibleVideosCount] = useState(9);
  const t = (key: keyof typeof T) => T[key][lang];

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/news?topic=flood&window=48h&limit=40&sourceCap=8');
        if (res.ok && !cancelled) {
          const j = await res.json();
          setNews(Array.isArray(j.items) ? j.items : []);
        }
      } catch {
        if (!cancelled) setNews([]);
      }
      try {
        const res = await fetch('/api/flood/videos');
        if (res.ok && !cancelled) setVideoFeed(await res.json());
      } catch {
        /* the press section stands on its own */
      }
      try {
        const res = await fetch('/api/flood/gallery');
        if (res.ok && !cancelled) setGallery(await res.json());
      } catch {
        /* the galleries are optional */
      }
    };
    load();
    const id = setInterval(load, DESK_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPlaying(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const videos = videoFeed?.videos || [];
  const dropBroken = (key: string) => setBrokenPhotos(prev => (prev.has(key) ? prev : new Set(prev).add(key)));
  const portalPhotos = (gallery?.carousel?.items || []).filter(p => !brokenPhotos.has(`portal:${p.id}`));
  const liveVideos = videoFeed?.live || [];
  const withImages = (news || []).filter(n => n.imageProxy);
  const withoutImages = (news || []).filter(n => !n.imageProxy);

  const paginatedWithImages = withImages.slice(0, visibleNewsCount);
  const paginatedVideos = videos.slice(0, visibleVideosCount);

  return (
    <FloodShell lang={lang} setLang={setLang} kicker={t('kicker')} title={t('title')} standfirst={t('standfirst')}>
      <section className="fl-sec">
        <div className="fl-sec-head">
          <span>{lang === 'ne' ? 'प्रत्यक्ष' : 'Live'}</span>
          <h2>{lang === 'ne' ? 'प्रत्यक्ष प्रसारण (युट्युब)' : 'Live Television News'}</h2>
          {liveVideos.length > 0 && <em>{liveVideos.length}</em>}
        </div>
        <p className="fl-note">
          {lang === 'ne'
            ? 'नेपाली समाचार च्यानलहरूको प्रत्यक्ष प्रसारण, युट्युबबाट सिधै।'
            : 'Live broadcast from Nepali news channels, streamed directly from YouTube.'}
        </p>

        {!videoFeed ? (
          <p className="fl-empty">{t('loading')}</p>
        ) : liveVideos.length === 0 ? (
          <p className="fl-empty">{lang === 'ne' ? 'अहिले प्रत्यक्ष च्यानल उपलब्ध छैन।' : 'No live broadcast channels available right now.'}</p>
        ) : (
          <div className="fl-videos">
            {liveVideos.map(v => (
              <figure key={v.id}>
                <button type="button" onClick={() => setPlaying(v)} aria-label={`${t('watch')}: ${v.title}`}>
                  <img src={v.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  <i className="fl-play" aria-hidden="true" />
                </button>
                <figcaption>
                  <p>{v.title}</p>
                  <span className="fl-report-meta">
                    <b>{v.channel}</b>
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>

      {/* The rescue portal's own photographs, in the same card grid the press
          coverage below uses. They are the government's pictures of its own
          response, so the section keeps its "Official" eyebrow and every card
          links back to the portal — but a reader scanning the page should not
          have to switch reading modes between two galleries of the same thing. */}
      {portalPhotos.length > 0 && (
        <section className="fl-sec">
          <div className="fl-sec-head">
            <span>{lang === 'ne' ? 'सरकारी' : 'Official'}</span>
            <h2>{t('portalPhotos')}</h2>
            <em>{portalPhotos.length}</em>
          </div>
          <p className="fl-note">{t('portalPhotosHint')}</p>
          <div className="fl-media-grid">
            {portalPhotos.map(photo => {
              const caption = (lang === 'ne' ? photo.altNe || photo.altEn : photo.altEn || photo.altNe) || '';
              return (
                <a
                  key={photo.id}
                  href="https://rescue.opmcm.gov.np/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {photo.imageProxy && (
                    <img
                      src={photo.imageProxy}
                      alt={caption}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={() => dropBroken(`portal:${photo.id}`)}
                    />
                  )}
                  <div>
                    <p>{caption}</p>
                    <span className="fl-report-meta">
                      <b>{lang === 'ne' ? 'प्रधानमन्त्री कार्यालय' : 'OPMCM'}</b>
                      {photo.createdAt && <time>{ageFrom(photo.createdAt, lang)}</time>}
                    </span>
                  </div>
                </a>
              );
            })}
          </div>
          {gallery?.carousel && (
            <p className="fl-note">
              {lang === 'ne' ? 'पढिएको' : 'Read'} {ageFrom(gallery.carousel.fetchedAt, lang)}
              {' · '}
              <a href={gallery.carousel.source.url} target="_blank" rel="noopener noreferrer">
                {gallery.carousel.source.label} &#8599;
              </a>
            </p>
          )}
        </section>
      )}

      <section className="fl-sec">
        <div className="fl-sec-head">
          <span>{lang === 'ne' ? 'प्रेस' : 'Press'}</span>
          <h2>{t('press')}</h2>
          {news && news.length > 0 && <em>{news.length}</em>}
        </div>

        {news === null ? (
          <p className="fl-empty">{t('loading')}</p>
        ) : news.length === 0 ? (
          <p className="fl-empty">{t('noNews')}</p>
        ) : (
          <>
            {withImages.length > 0 && (
              <>
                <div className="fl-media-grid">
                  {paginatedWithImages.map((item, i) => {
                    // Signed server-side by /api/news; the client never mints one.
                    const src = item.imageProxy;
                    return (
                      <a key={i} href={item.link} target="_blank" rel="noopener noreferrer">
                        {src && <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" />}
                        <div>
                          <p>{item.title}</p>
                          <span className="fl-report-meta">
                            <b>{item.source}</b>
                            <time>{ageFrom(item.pubDate, lang)}</time>
                          </span>
                        </div>
                      </a>
                    );
                  })}
                </div>
                {withImages.length > visibleNewsCount && (
                  <button
                    onClick={() => setVisibleNewsCount(prev => prev + 9)}
                    className="mx-auto mt-6 block rounded border border-border bg-background px-6 py-2.5 text-[15px] font-semibold text-foreground hover:border-border-bright"
                  >
                    {lang === 'ne' ? 'थप देखाउनुहोस्' : 'Show more'}
                  </button>
                )}
              </>
            )}

            {withoutImages.length > 0 && (
              <div className="mt-8 rounded-lg border border-border bg-background p-6">
                <h3 className="mb-4 border-b border-border pb-2 text-lg font-semibold text-foreground">
                  {lang === 'ne' ? 'समाचार फिड (शीर्षकहरू)' : 'News Wire (Headlines)'}
                </h3>
                <div className="fl-wire">
                  {withoutImages.map((item, i) => (
                    <a key={i} href={item.link} target="_blank" rel="noopener noreferrer">
                      <time>{ageFrom(item.pubDate, lang)}</time>
                      <p>{item.title}</p>
                      <cite>{item.source}</cite>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <section className="fl-sec">
        <div className="fl-sec-head">
          <span>{lang === 'ne' ? 'प्रसारण' : 'Broadcast'}</span>
          <h2>{t('broadcast')}</h2>
          {videos.length > 0 && <em>{videos.length}</em>}
        </div>
        <p className="fl-note">{t('broadcastHint')}</p>

        {!videoFeed ? (
          <p className="fl-empty">{t('loading')}</p>
        ) : videos.length === 0 ? (
          <p className="fl-empty">{t('noVideo')}</p>
        ) : (
          <>
            <div className="fl-videos">
              {paginatedVideos.map(v => (
                <figure key={v.id}>
                  <button type="button" onClick={() => setPlaying(v)} aria-label={`${t('watch')}: ${v.title}`}>
                    <img src={v.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" />
                    <i className="fl-play" aria-hidden="true" />
                  </button>
                  <figcaption>
                    <p>{v.title}</p>
                    <span className="fl-report-meta">
                      <b>{v.channel}</b>
                      {v.publishedAt && <time>{ageFrom(v.publishedAt, lang)}</time>}
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
            {videos.length > visibleVideosCount && (
              <button
                onClick={() => setVisibleVideosCount(prev => prev + 9)}
                className="mx-auto mt-6 block rounded border border-border bg-background px-6 py-2.5 text-[15px] font-semibold text-foreground hover:border-border-bright"
              >
                {lang === 'ne' ? 'थप देखाउनुहोस्' : 'Show more'}
              </button>
            )}
          </>
        )}
      </section>

      {playing && (
        <div className="fl-lightbox fl-lightbox-video" onClick={() => setPlaying(null)} role="dialog" aria-modal="true">
          <div onClick={e => e.stopPropagation()}>
            <div className="fl-embed">
              <iframe
                src={`${playing.embedUrl}?autoplay=1&rel=0`}
                title={playing.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
            <p className="fl-payee">{playing.title}</p>
            <p className="fl-note">
              <a href={playing.url} target="_blank" rel="noopener noreferrer">{t('watch')} &#8599;</a>
            </p>
            <button onClick={() => setPlaying(null)}>{t('close')}</button>
          </div>
        </div>
      )}
    </FloodShell>
  );
}
