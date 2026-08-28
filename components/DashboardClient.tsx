'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import NepalSignalsMap from './NepalSignalsMap';
import BhotekoshiFloodButton from './BhotekoshiFloodButton';
import type {
  HazardSnapshot,
  NewsItem,
  WeatherAlert,
  FloodVideo,
  VideoFeed,
} from '@/lib/types';
import { errorMessage } from '@/lib/types';

interface PanelState {
  items: NewsItem[];
  status: 'loading' | 'stale' | 'live' | 'error';
}

interface DashboardClientProps {
  initialData: HazardSnapshot;
}

// Every panel maps to a hazard topic in apis/sources/nepal-news.mjs.
const NEWS_PANELS = [
  {
    id: 'live-hazard',
    title: 'Live Hazard Feed',
    topic: 'all',
    limit: 48,
    sourceCap: 12,
    maxItems: 14,
    priority: true,
    empty: 'No hazard reporting in this window.',
  },
  {
    id: 'earthquake-news',
    title: 'Seismic Reporting',
    topic: 'earthquake',
    limit: 24,
    sourceCap: 8,
    maxItems: 10,
    priority: false,
    empty: 'No earthquake reporting in this window.',
  },
  {
    id: 'flood-news',
    title: 'Flood & Landslide',
    topic: 'flood',
    limit: 28,
    sourceCap: 8,
    maxItems: 10,
    priority: false,
    empty: 'No flood or landslide reporting in this window.',
  },
  {
    id: 'weather-news',
    title: 'Weather Warnings',
    topic: 'weather',
    limit: 28,
    sourceCap: 8,
    maxItems: 10,
    priority: false,
    empty: 'No weather warnings in this window.',
  },
  {
    id: 'wildfire-news',
    title: 'Wildfire',
    topic: 'wildfire',
    limit: 24,
    sourceCap: 8,
    maxItems: 10,
    priority: false,
    empty: 'No wildfire reporting in this window.',
  },
  {
    id: 'airquality-news',
    title: 'Air Quality',
    topic: 'airquality',
    limit: 24,
    sourceCap: 8,
    maxItems: 10,
    priority: false,
    empty: 'No air quality reporting in this window.',
  },
  {
    id: 'climate-news',
    title: 'Glacier & Climate Hazard',
    topic: 'climate',
    limit: 24,
    sourceCap: 8,
    maxItems: 10,
    priority: false,
    empty: 'No glacier or climate hazard reporting in this window.',
  },
  {
    id: 'relief-news',
    title: 'Relief & Response',
    topic: 'relief',
    limit: 28,
    sourceCap: 8,
    maxItems: 10,
    priority: false,
    empty: 'No relief or response reporting in this window.',
  },
];

// Terms that push a headline up the Live Hazard Feed. Weighted toward events
// with casualties or displacement, not toward forecasts.
const PRIORITY_TERMS = [
  'earthquake', 'aftershock', 'landslide', 'flood', 'flash flood', 'avalanche', 'glof',
  'cloudburst', 'inundat', 'washed away', 'collapse', 'wildfire', 'forest fire',
  'evacuat', 'rescue', 'missing', 'dead', 'death', 'killed', 'injured', 'displaced',
  'emergency', 'disaster', 'warning', 'alert', 'ndrrma',
  'भूकम्प', 'पहिरो', 'बाढी', 'डुबान', 'उद्धार', 'बेपत्ता', 'मृत्यु', 'विपद्', 'डढेलो',
];
const LOCAL_SOURCE_HINTS = ['kathmandu post', 'onlinekhabar', 'online khabar', 'the rising nepal', 'nepal news', 'setopati', 'ratopati', 'nepali times', 'khabarhub'];

const DASHBOARD_COPY = {
  overview: { en: 'Nepal hazard overview', ne: 'नेपाल विपद् अवलोकन' },
  attention: { en: 'What needs attention today?', ne: 'आज के कुरामा ध्यान दिने?' },
  intro: {
    en: 'A plain-language view of earthquakes, rain, fires, air quality, and active response signals.',
    ne: 'भूकम्प, वर्षा, आगलागी, वायु गुणस्तर र सक्रिय उद्धारसम्बन्धी सरल जानकारी।',
  },
  floodNews: { en: 'Bhotekoshi flood news', ne: 'भोटेकोशी बाढी समाचार' },
  loadingNews: { en: 'Looking for the latest flood updates…', ne: 'पछिल्लो बाढी अपडेट खोजिँदैछ…' },
  noFloodNews: { en: 'No Bhotekoshi flood updates in the current feed.', ne: 'हालको फिडमा भोटेकोशी बाढीसम्बन्धी अपडेट छैन।' },
  liveUpdates: { en: 'Live updates', ne: 'प्रत्यक्ष अपडेट' },
  liveFeed: { en: 'Live hazard feed', ne: 'प्रत्यक्ष विपद् फिड' },
  showUpdates: { en: 'Show updates from', ne: 'अपडेटको समय' },
  moreContext: { en: 'A little more context', ne: 'थप जानकारी' },
  happening: { en: 'What else is happening?', ne: 'अरू के भइरहेको छ?' },
  contextHint: { en: 'Pictures and broadcast clips from the newsrooms covering it.', ne: 'समाचार कक्षहरूले पठाएका तस्बिर र प्रसारण क्लिपहरू।' },
  newsPhotos: { en: 'Pictures from the news', ne: 'समाचारका तस्बिर' },
  newsPhotosHint: {
    en: 'Lead photographs as the outlets published them. Atlas links back and stores none of them.',
    ne: 'सञ्चारगृहहरूले प्रकाशित गरेका मुख्य तस्बिर। एट्लसले लिंक मात्र दिन्छ, कुनै तस्बिर राख्दैन।',
  },
  newsVideos: { en: 'News videos', ne: 'समाचार भिडियो' },
  newsVideosHint: {
    en: 'Broadcast coverage on YouTube. It plays in the channel’s own player, so the channel keeps the view.',
    ne: 'युट्युबमा रहेको प्रसारण सामग्री। च्यानलकै प्लेयरमा चल्छ, त्यसैले दृश्य गणना च्यानलकै हुन्छ।',
  },
  loadingMedia: { en: 'Loading the latest coverage…', ne: 'पछिल्लो सामग्री लोड हुँदै…' },
  noPhotos: { en: 'No pictures in the current news window.', ne: 'हालको समाचार अवधिमा तस्बिर छैन।' },
  noVideos: { en: 'No broadcast coverage found right now.', ne: 'अहिले प्रसारण सामग्री भेटिएन।' },
  scrollBack: { en: 'Scroll back', ne: 'पछाडि सार्नुहोस्' },
  scrollForward: { en: 'Scroll forward', ne: 'अगाडि सार्नुहोस्' },
  watchOnYouTube: { en: 'Watch on YouTube', ne: 'युट्युबमा हेर्नुहोस्' },
  close: { en: 'Close', ne: 'बन्द' },
  fetching: { en: 'Fetching the latest hazard updates…', ne: 'पछिल्ला विपद् अपडेट ल्याइँदैछ…' },
  dictionary: { en: 'Nepal Hazard Dictionary', ne: 'नेपाल विपद् शब्दकोश' },
  lexicon: { en: 'Atlas Hazard Lexicon', ne: 'एट्लस विपद् शब्दावली' },
  guide: { en: 'Guide to natural-hazard triggers and severity thresholds', ne: 'प्राकृतिक विपद्का संकेत र गम्भीरता तहको मार्गदर्शन' },
  meaning: { en: 'Meaning', ne: 'अर्थ' },
  matters: { en: 'Why it matters', ne: 'किन महत्त्वपूर्ण छ' },
  notProof: { en: 'Not proof of', ne: 'यसको प्रमाण होइन' },
  example: { en: 'Example', ne: 'उदाहरण' },
} as const;

const SIGNAL_GUIDE_ITEMS = [
  {
    term: 'Magnitude and Depth',
    category: 'Seismic',
    meaning: 'The energy released by an earthquake, and how far below the surface it ruptured.',
    matters: 'Depth matters as much as magnitude. A shallow M5 under a populated valley does more damage than a deep M6 out under the Himalaya.',
    notMeaning: 'Not a damage forecast. Building stock, soil and time of day drive the human cost.',
    example: 'The 2015 Gorkha earthquake was M7.8 at roughly 8km depth — shallow, which is why the shaking was so destructive.'
  },
  {
    term: 'Seismic Sequence',
    category: 'Seismic',
    meaning: 'A cluster of events in a short window, counted here over 24 hours and 7 days.',
    matters: 'Shallow clusters precede damaging events more often than deep isolated ones do. The count is a preparedness trigger, not a prediction.',
    notMeaning: 'Not an earthquake forecast. No method predicts the timing of a large rupture.',
    example: '5+ events in 24h with two or more shallow M4.5+ ruptures is the threshold Atlas flags.'
  },
  {
    term: '5-Day Rainfall',
    category: 'Hydro-met',
    meaning: 'Cumulative forecast rainfall over the next five days at each monitored city.',
    matters: 'Nepal’s hill slopes fail on cumulative saturation, not on any single day’s total. Landslide risk keeps climbing for days after the rain stops.',
    notMeaning: 'Not an official DHM warning. It is model output from Open-Meteo.',
    example: 'Above 200mm over five days is the point Atlas treats as a saturation threshold.'
  },
  {
    term: 'Flood / Landslide Risk',
    category: 'Hydro-met',
    meaning: 'Raised when forecast daily rainfall crosses 100mm in monsoon season, or 50mm outside it.',
    matters: '100mm/day is broadly the threshold Nepal’s DHM treats as heavy rainfall. Terai inundation and hill road closures follow on different timelines.',
    notMeaning: 'Not a district-level warning. Confirm against DHM before issuing public guidance.',
    example: 'An alert at Nepalgunj means Terai inundation risk; the same alert at Pokhara means slope failure risk.'
  },
  {
    term: 'Monsoon Season',
    category: 'Hydro-met',
    meaning: 'June through September, when Nepal receives roughly 80% of its annual rainfall.',
    matters: 'It sets the baseline. 100mm of rain in July is a monsoon day; the same in December is not.',
    notMeaning: 'Not itself an alert. It is the seasonal context every rainfall reading is scored against.',
    example: 'Atlas raises its heavy-rain threshold from 50mm to 100mm once monsoon season is active.'
  },
  {
    term: 'FRP',
    category: 'Fire',
    meaning: 'Fire Radiative Power. The intensity of one specific FIRMS hotspot, measured in megawatts.',
    matters: 'Higher FRP usually means a hotter, larger, or more energetic fire at that exact point.',
    notMeaning: 'Not the intensity of the whole region, and not a measure of area burned.',
    example: 'FRP 92.3 MW describes one hotspot, while Total 1,451 describes the whole regional detection count.'
  },
  {
    term: 'Night Detections',
    category: 'Fire',
    meaning: 'Thermal detections tagged as occurring at night inside the regional FIRMS bucket.',
    matters: 'Nighttime heat is more noteworthy than daytime: it is less likely to be routine agricultural burning, and it means the fire is running unchecked.',
    notMeaning: 'Not a count of separate fires. One large fire produces many detections.',
    example: 'Night 140 of 1,451 regional detections means the fire kept burning past dark.'
  },
  {
    term: 'US AQI',
    category: 'Air Quality',
    meaning: 'The US EPA air quality index computed from PM2.5 and PM10, the scale Nepali outlets and embassies quote.',
    matters: 'Kathmandu sits in a bowl. Winter inversion and spring fire smoke both get trapped, and the valley regularly ranks among the world’s most polluted cities.',
    notMeaning: 'Not a measure of any single pollutant, and not a personal exposure reading.',
    example: 'AQI above 150 is Unhealthy for everyone, not only sensitive groups.'
  },
  {
    term: 'GLOF',
    category: 'Cryosphere',
    meaning: 'Glacial Lake Outburst Flood — the sudden release of water from a moraine-dammed glacial lake.',
    matters: 'Nepal has dozens of lakes rated potentially dangerous. A GLOF arrives as a wall of water and debris with little or no warning downstream.',
    notMeaning: 'Not a monsoon flood. GLOFs can occur in clear weather and outside the rainy season.',
    example: 'The 2021 Melamchi flood carried debris that took out infrastructure far downstream of the source.'
  },
  {
    term: 'Active Disaster',
    category: 'Response',
    meaning: 'A disaster listed as active for Nepal by UN OCHA on ReliefWeb.',
    matters: 'It means formal response operations and cluster coordination are already standing. New district requests should route through them.',
    notMeaning: 'Not a measure of severity, and not a live count of affected people.',
    example: 'A listed active disaster is where you look first before opening a parallel operation.'
  },
  {
    term: 'Sweep Delta',
    category: 'Platform',
    meaning: 'The change summary between the current sweep and the previous one — new, escalated, and de-escalated signals.',
    matters: 'Useful for spotting what changed recently instead of re-reading the full dashboard from scratch.',
    notMeaning: 'Not a full risk model. It is a directional change layer on top of the raw hazard signals.',
    example: 'A delta marked risk-off with several new and escalated items means the latest sweep materially worsened the hazard picture.'
  },
  {
    term: 'Model Output vs Warning',
    category: 'Platform',
    meaning: 'Atlas reads satellite feeds and weather models directly. It does not republish official warnings.',
    matters: 'An Atlas alert is a reason to check DHM, NDRRMA or the National Seismological Centre — never a substitute for them.',
    notMeaning: 'Not an authoritative warning, and not a basis for public evacuation guidance on its own.',
    example: 'A Flood / Landslide Risk alert should send you to the DHM bulletin before any district advisory goes out.'
  }
];

function priorityScore(item: NewsItem) {
  const text = `${item.title} ${item.source}`.toLowerCase();
  const hits = PRIORITY_TERMS.reduce((n, term) => n + (text.includes(term) ? 1 : 0), 0);
  const local = LOCAL_SOURCE_HINTS.some(h => (item.source || '').toLowerCase().includes(h)) ? 12 : 0;
  const ageMin = Math.max(0, (Date.now() - new Date(item.pubDate).getTime()) / 60000);
  const freshness = Math.max(0, 34 - Math.floor(ageMin / 15));
  return hits * 14 + local + freshness;
}

function priorityLevel(item: NewsItem) {
  const score = priorityScore(item);
  return score >= 70 ? 'high' : score >= 45 ? 'elevated' : 'latest';
}

function getAge(d: string | Date) {
  const ms = Date.now() - new Date(d).getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return 'just now';
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

function cleanText(t: string) {
  if (!t) return '';
  return t.replace(/&#39;/g, "'").replace(/&#33;/g, "!").replace(/&amp;/g, "&").replace(/<[^>]+>/g, '');
}

function srcClass(sourceName: string) {
  if (!sourceName) return 'other';
  const sl = sourceName.toLowerCase();
  if (sl.includes('kathmandu post')) return 'kp';
  if (sl.includes('online khabar') || sl.includes('onlinekhabar')) return 'ok';
  if (sl.includes('nepali times')) return 'nt';
  if (sl.includes('setopati')) return 'sp';
  if (sl.includes('ratopati')) return 'rp';
  if (sl.includes('khabarhub')) return 'kh';
  if (sl.includes('nepal news') || sl.includes('rising nepal')) return 'nn';
  return 'other';
}

function copy(key: keyof typeof DASHBOARD_COPY, language: 'en' | 'ne') {
  return DASHBOARD_COPY[key][language];
}

export default function DashboardClient({ initialData }: DashboardClientProps) {
  const [D, setD] = useState(initialData);
  const meta = D.meta || {};

  // Boot sequence state
  const [booting, setBooting] = useState(true);

  // Custom visual quality modes
  const [darkTheme, setDarkTheme] = useState(false);
  const [language, setLanguage] = useState<'en' | 'ne'>('en');
  const [newsWindow, setNewsWindow] = useState('24h');
  const [glossaryOpen, setGlossaryOpen] = useState(false);

  // Live news panel data cache
  const [newsCache, setNewsCache] = useState<Record<string, PanelState>>(() =>
    Object.fromEntries(NEWS_PANELS.map(p => [p.id, { items: [], status: 'loading' as const }])),
  );

  // Broadcast coverage for the video rail, and the clip currently playing.
  const [videoFeed, setVideoFeed] = useState<VideoFeed | null>(null);
  const [playing, setPlaying] = useState<FloodVideo | null>(null);

  const photoRailRef = useRef<HTMLDivElement | null>(null);
  const videoRailRef = useRef<HTMLDivElement | null>(null);

  // Load configuration from local storage
  useEffect(() => {
    const cachedPerf = localStorage.getItem('atlas_low_perf') === 'true';
    const cachedTheme = localStorage.getItem('atlas_theme') === 'dark';
    const cachedLanguage = localStorage.getItem('atlas_language');
    if (cachedLanguage === 'en' || cachedLanguage === 'ne') setLanguage(cachedLanguage);
    setDarkTheme(cachedTheme);
    if (cachedPerf) {
      document.body.classList.add('low-perf');
    }
    if (cachedTheme) {
      document.body.classList.add('dark-theme');
    }
  }, []);

  // Run boot sequence logs on mount
  useEffect(() => {
    setTimeout(() => setBooting(false), 3500);
  }, []);

  // Subscribe to live events via SSE
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;

    const es = new EventSource('/events');
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'update' && msg.data) {
          setD(msg.data);
        }
      } catch (err) {
        console.error('[SSE client] Error parsing event:', err);
      }
    };

    es.onerror = () => {
      es.close();
    };

    return () => {
      es.close();
    };
  }, []);

  // Fetch live hazard news on load & newsWindow changes
  const fetchAllNews = async () => {
    NEWS_PANELS.forEach(async (cfg) => {
      setNewsCache((prev) => ({
        ...prev,
        [cfg.id]: { ...prev[cfg.id], status: prev[cfg.id].items.length ? 'stale' : 'loading' },
      }));

      try {
        const url = `/api/news?topic=${cfg.topic}&window=${newsWindow}&limit=${cfg.limit}&sourceCap=${cfg.sourceCap}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = (await res.json()) as { items?: NewsItem[] };
        const items: NewsItem[] = Array.isArray(data.items) ? data.items : [];

        let sortedItems = items;
        if (cfg.priority) {
          sortedItems = [...items].sort(
            (a, b) => priorityScore(b) - priorityScore(a) || new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
          );
        }

        setNewsCache((prev) => ({
          ...prev,
          [cfg.id]: { items: sortedItems, status: 'live' },
        }));
      } catch (err) {
        console.error(`[News load failed for ${cfg.id}]:`, errorMessage(err));
        setNewsCache((prev) => ({
          ...prev,
          [cfg.id]: { ...prev[cfg.id], status: prev[cfg.id].items.length ? 'stale' : 'error' },
        }));
      }
    });
  };

  useEffect(() => {
    fetchAllNews();
    const interval = setInterval(fetchAllNews, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [newsWindow]);

  // Broadcast clips. Same cadence as the news sweep; the route caches hard, so
  // a poll costs one request and usually answers from memory.
  useEffect(() => {
    let cancelled = false;
    const loadVideos = async () => {
      try {
        const res = await fetch('/api/flood/videos');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const feed = (await res.json()) as VideoFeed;
        if (!cancelled) setVideoFeed(feed);
      } catch (err) {
        console.error('[Video load failed]:', errorMessage(err));
        if (!cancelled) {
          setVideoFeed({ videos: [], live: [], searchEnabled: false, error: 'unavailable', fetchedAt: new Date().toISOString() });
        }
      }
    };
    loadVideos();
    const interval = setInterval(loadVideos, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Escape closes the player.
  useEffect(() => {
    if (!playing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPlaying(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing]);

  const toggleTheme = () => {
    const target = !darkTheme;
    setDarkTheme(target);
    localStorage.setItem('atlas_theme', target ? 'dark' : 'light');
    document.body.classList.toggle('dark-theme', target);
  };

  const changeLanguage = (next: 'en' | 'ne') => {
    setLanguage(next);
    localStorage.setItem('atlas_language', next);
  };

  // The two media rails.
  //
  // Photographs come out of the news sweep that is already running — every
  // panel's items are pooled, deduplicated by link, and only the ones the
  // outlet published a lead image for make the rail. The image itself is
  // streamed through the signed proxy the API route mints (lib/news-media.ts),
  // never copied here.
  const newsPhotos = useMemo(() => {
    const seen = new Set<string>();
    const pooled: NewsItem[] = [];
    for (const panel of NEWS_PANELS) {
      for (const item of newsCache[panel.id]?.items || []) {
        if (!item.imageProxy || !item.link || seen.has(item.link)) continue;
        seen.add(item.link);
        pooled.push(item);
      }
    }
    return pooled
      .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
      .slice(0, 24);
  }, [newsCache]);

  const newsLoading = NEWS_PANELS.some(panel => newsCache[panel.id]?.status === 'loading');

  // Live channels lead, then the recorded clips. Deduplicated because a
  // stream can appear in both lists.
  const newsVideos = useMemo(() => {
    const seen = new Set<string>();
    return [...(videoFeed?.live || []), ...(videoFeed?.videos || [])]
      .filter(v => {
        if (!v?.id || seen.has(v.id)) return false;
        seen.add(v.id);
        return true;
      })
      .slice(0, 24);
  }, [videoFeed]);

  // Carousel paging: one viewport-width step, which keeps the gesture the same
  // whether the rail is showing four cards or one.
  const scrollRail = (ref: React.RefObject<HTMLDivElement | null>, direction: 1 | -1) => {
    const track = ref.current;
    if (!track) return;
    track.scrollBy({ left: direction * Math.max(240, track.clientWidth * 0.85), behavior: 'smooth' });
  };

  const ts = new Date(meta.timestamp || new Date());
  const formattedDate = ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
  const formattedTime = ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  const sq = D.seismic || {};
  const wx = D.weather || {};
  const worstAqi = D.airQuality?.worst?.aqi || 0;
  const activeDisasters = D.relief?.disasters?.length || 0;
  const extremeAlerts = (wx.alerts || []).filter((a: WeatherAlert) => a.severity === 'extreme').length;
  const floodTickerItems = (newsCache['flood-news']?.items || []).slice(0, 8);
  const impact = D.impact || { count: 0, topRegions: [] };

  // Headline posture. Ordered by consequence: a damaging quake outranks
  // everything, then extreme weather, then the slower-moving hazards.
  // Reported impact counts toward the posture on its own: an event already
  // under way outranks any forecast the sensor layers are showing.
  const alertLevel =
    (sq.maxMagnitude || 0) >= 5.5 || extremeAlerts > 0 || impact.count >= 12 ? 'CRITICAL'
    : (sq.events24h || 0) >= 5 || (wx.totalAlerts || 0) >= 2 || worstAqi > 200 || activeDisasters > 0 || impact.count >= 5 ? 'ELEVATED'
    : 'NOMINAL';

  const regimeChip =
    (sq.maxMagnitude || 0) >= 5.5 ? 'SIGNIFICANT SEISMIC EVENT'
    : impact.count >= 12 ? 'DISASTER RESPONSE UNDER WAY'
    : wx.monsoonSeason ? 'MONSOON HAZARD SEASON'
    : D.fire?.fireSeason ? 'WILDFIRE SEASON'
    : 'BACKGROUND MONITORING';

  const alertLabel =
    alertLevel === 'CRITICAL' ? 'ACT NOW'
    : alertLevel === 'ELEVATED' ? 'PAY ATTENTION'
    : 'NO MAJOR SIGNALS';

  if (booting) {
    return (
      <div id="boot" suppressHydrationWarning>
        <div className="logo-ring" suppressHydrationWarning>
          <span className="logo-text">ATLAS</span>
        </div>
      </div>
    );
  }

  return (
    <div id="main" className="p-3" suppressHydrationWarning>
      {/* Topbar */}
      <div className="topbar">
        <div className="top-left">
          <img
            className="brand-logo"
            src={darkTheme ? '/images/atlas-white.png' : '/images/atlas-black.png'}
            alt="ANCODA ATLAS"
            width={120}
            height={43}
          />
          <span className="regime-chip">
            <span className="blink" />
            {language === 'ne'
              ? regimeChip === 'BACKGROUND MONITORING' ? 'नियमित निगरानी' : regimeChip === 'DISASTER RESPONSE UNDER WAY' ? 'प्रत्यक्ष' : regimeChip === 'MONSOON HAZARD SEASON' ? 'मनसुनको समय' : regimeChip === 'WILDFIRE SEASON' ? 'डढेलोको समय' : 'महत्त्वपूर्ण भूकम्प'
              : regimeChip === 'BACKGROUND MONITORING' ? 'Routine monitoring' : regimeChip.replace('SIGNIFICANT SEISMIC EVENT', 'Significant earthquake').replace('DISASTER RESPONSE UNDER WAY', 'LIVE').replace('MONSOON HAZARD SEASON', 'Monsoon season').replace('WILDFIRE SEASON', 'Wildfire season')}
          </span>
        </div>
        <div className="top-right">
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${darkTheme ? 'light' : 'dark'} theme`}
            aria-pressed={darkTheme}
          >
            <span className="theme-toggle-label">{darkTheme ? 'Dark' : 'Light'}</span>
            <span className="theme-switch" aria-hidden="true">
              <span className="theme-switch-thumb" />
            </span>
          </button>
          <div className="language-toggle" role="group" aria-label="Language">
            <button className={language === 'en' ? 'active' : ''} onClick={() => changeLanguage('en')} aria-pressed={language === 'en'}>EN</button>
            <button className={language === 'ne' ? 'active' : ''} onClick={() => changeLanguage('ne')} aria-pressed={language === 'ne'}>ने</button>
          </div>
          <span className="meta-pill" suppressHydrationWarning>
            Updated in <span className="v">{((meta.totalDurationMs || 0) / 1000).toFixed(1)}s</span>
          </span>
          <span className="meta-pill" suppressHydrationWarning>
            {formattedDate} <span className="v">{formattedTime}</span>
          </span>
          <button className="guide-btn" onClick={() => setGlossaryOpen(true)}>
            Understand the numbers
          </button>
          <span className="alert-badge">{alertLabel}</span>
        </div>
      </div>

      <section className="flood-news-ticker" aria-label={copy('floodNews', language)}>
        <span className="flood-news-label"><span className="blink" />{copy('floodNews', language)}</span>
        <div className="flood-news-track">
          {floodTickerItems.length > 0 ? (
            [...floodTickerItems, ...floodTickerItems].map((item, index) => (
              <a key={`${item.link}-${index}`} href={item.link} target="_blank" rel="noopener noreferrer">
                {cleanText(item.title)} <span>· {item.source}</span>
              </a>
            ))
          ) : (
            <span>{newsCache['flood-news']?.status === 'loading' ? copy('loadingNews', language) : copy('noFloodNews', language)}</span>
          )}
        </div>
      </section>

      <section className="dashboard-intro" aria-labelledby="dashboard-title">
        <div>
          <p className="eyebrow">{copy('overview', language)}</p>
          <h1 id="dashboard-title">{copy('attention', language)}</h1>
          <p className="intro-copy">
            {copy('intro', language)}
          </p>
        </div>
        <BhotekoshiFloodButton />
      </section>

      <section className="map-hero" aria-label="Live geographic view">
        <div className="map-workspace">
          <div className="map-workspace-map">
            <NepalSignalsMap stories={D.news || []} />
          </div>
          <div className="live-feed-panel g-panel">
            <div className="sec-head">
              <div>
                <p className="eyebrow">{copy('liveUpdates', language)}</p>
                <h3>{copy('liveFeed', language)}</h3>
              </div>
              <span className="badge">
                {(newsCache['live-hazard']?.items || []).length} ITEMS
              </span>
            </div>
            <div className="news-window-bar">
              <span>{copy('showUpdates', language)}</span>
              {['6h', '24h', '48h', '7d'].map((w) => (
                <button key={w} className={`win-btn ${w === newsWindow ? 'active' : ''}`} onClick={() => setNewsWindow(w)}>
                  {w.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="news-list" suppressHydrationWarning>
              {(newsCache['live-hazard']?.items || []).length === 0 ? (
                <div className="news-empty">{copy('fetching', language)}</div>
              ) : (
                (newsCache['live-hazard']?.items || []).slice(0, 8).map((item, idx) => {
                  const isClickable = !!item.link;
                  return (
                    <div
                      key={idx}
                      className={`tk-card ${isClickable ? 'clickable' : ''}`}
                      onClick={() => {
                        if (isClickable) window.open(item.link, '_blank', 'noopener');
                      }}
                    >
                      <span className={`tk-src ${srcClass(item.source)}`}>
                        {(item.source || 'NEWS').substring(0, 14)}
                      </span>
                      <span className="tk-time">{getAge(item.pubDate)}</span>
                      <div className="tk-head">{cleanText(item.title)}</div>
                      {isClickable && <span className="tk-link">&#8599;</span>}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="supporting-section" aria-labelledby="supporting-title">
        <div className="supporting-heading">
          <div>
            <p className="eyebrow">{copy('moreContext', language)}</p>
            <h2 id="supporting-title">{copy('happening', language)}</h2>
          </div>
          <p>{copy('contextHint', language)}</p>
        </div>

        {/* Pictures the outlets published with their own reporting. */}
        <div className="media-rail" aria-labelledby="news-photo-rail">
          <div className="media-rail-head">
            <div>
              <h3 id="news-photo-rail">{copy('newsPhotos', language)}</h3>
              <p>{copy('newsPhotosHint', language)}</p>
            </div>
            <div className="media-rail-nav">
              {newsPhotos.length > 0 && <span className="badge">{newsPhotos.length}</span>}
              <button
                type="button"
                onClick={() => scrollRail(photoRailRef, -1)}
                aria-label={copy('scrollBack', language)}
              >
                &#8249;
              </button>
              <button
                type="button"
                onClick={() => scrollRail(photoRailRef, 1)}
                aria-label={copy('scrollForward', language)}
              >
                &#8250;
              </button>
            </div>
          </div>

          {newsPhotos.length === 0 ? (
            <div className="media-rail-empty">
              {newsLoading ? copy('loadingMedia', language) : copy('noPhotos', language)}
            </div>
          ) : (
            <div className="media-rail-track" ref={photoRailRef}>
              {newsPhotos.map((item) => (
                <a
                  className="media-card"
                  key={item.link}
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {/* Signed server-side by /api/news; the client never mints one. */}
                  <img src={item.imageProxy as string} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  <div className="media-card-body">
                    <p>{cleanText(item.title)}</p>
                    <span className="media-card-meta">
                      <b>{item.source}</b>
                      <time>{getAge(item.pubDate)}</time>
                    </span>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Broadcast clips, played in YouTube's own embed so the channel keeps the view. */}
        <div className="media-rail" aria-labelledby="news-video-rail">
          <div className="media-rail-head">
            <div>
              <h3 id="news-video-rail">{copy('newsVideos', language)}</h3>
              <p>{copy('newsVideosHint', language)}</p>
            </div>
            <div className="media-rail-nav">
              {newsVideos.length > 0 && <span className="badge">{newsVideos.length}</span>}
              <button
                type="button"
                onClick={() => scrollRail(videoRailRef, -1)}
                aria-label={copy('scrollBack', language)}
              >
                &#8249;
              </button>
              <button
                type="button"
                onClick={() => scrollRail(videoRailRef, 1)}
                aria-label={copy('scrollForward', language)}
              >
                &#8250;
              </button>
            </div>
          </div>

          {newsVideos.length === 0 ? (
            <div className="media-rail-empty">
              {videoFeed === null ? copy('loadingMedia', language) : copy('noVideos', language)}
            </div>
          ) : (
            <div className="media-rail-track" ref={videoRailRef}>
              {newsVideos.map((v) => (
                <figure className="media-card media-card-video" key={v.id}>
                  <button
                    type="button"
                    onClick={() => setPlaying(v)}
                    aria-label={`${copy('watchOnYouTube', language)}: ${v.title}`}
                  >
                    <img src={v.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" />
                    <i className="media-play" aria-hidden="true" />
                  </button>
                  <figcaption className="media-card-body">
                    <p>{cleanText(v.title)}</p>
                    <span className="media-card-meta">
                      <b>{v.channel || 'YouTube'}</b>
                      {v.publishedAt && <time>{getAge(v.publishedAt)}</time>}
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Video player. YouTube's own embed — Atlas hosts no video. */}
      {playing && (
        <div
          className="video-lightbox"
          onClick={() => setPlaying(null)}
          role="dialog"
          aria-modal="true"
          aria-label={playing.title}
        >
          <div onClick={e => e.stopPropagation()}>
            <div className="video-embed">
              <iframe
                src={`${playing.embedUrl}?autoplay=1&rel=0`}
                title={playing.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
            <p className="video-lightbox-title">{cleanText(playing.title)}</p>
            <p className="video-lightbox-meta">
              <a href={playing.url} target="_blank" rel="noopener noreferrer">
                {copy('watchOnYouTube', language)} &#8599;
              </a>
            </p>
            <button onClick={() => setPlaying(null)}>{copy('close', language)}</button>
          </div>
        </div>
      )}

      {/* Glossary Overlay */}
      <div className={`glossary-overlay ${glossaryOpen ? 'show' : ''}`}>
        <div className="glossary-panel">
          <div className="glossary-head">
            <div>
              <div className="glossary-kicker">{copy('dictionary', language)}</div>
              <div className="glossary-title">{copy('lexicon', language)}</div>
              <div className="glossary-sub">{copy('guide', language)}</div>
            </div>
            <button className="glossary-close" onClick={() => setGlossaryOpen(false)}>
              &times;
            </button>
          </div>
          <div className="glossary-body">
            {SIGNAL_GUIDE_ITEMS.map((item, idx) => (
              <div className="glossary-card" key={idx}>
                <div className="glossary-term">
                  <strong>{item.term}</strong>
                  <span className="glossary-tag">{item.category}</span>
                </div>
                <div className="glossary-line">
                  <span className="glossary-label">{copy('meaning', language)}</span>
                  {item.meaning}
                </div>
                <div className="glossary-line">
                  <span className="glossary-label">{copy('matters', language)}</span>
                  {item.matters}
                </div>
                <div className="glossary-line">
                  <span className="glossary-label">{copy('notProof', language)}</span>
                  {item.notMeaning}
                </div>
                {item.example && (
                  <div className="glossary-line text-[10px] text-[#81d4fa]">
                    <span className="glossary-label">{copy('example', language)}</span>
                    {item.example}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="glossary-foot">
            ANCODA ATLAS &bull; NATURAL HAZARD MONITORING &bull; NOT A SUBSTITUTE FOR DHM, NDRRMA OR NSC WARNINGS
          </div>
        </div>
      </div>
    </div>
  );
}
