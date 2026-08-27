'use client';

import React, { useState, useEffect } from 'react';
import NepalSignalsMap from './NepalSignalsMap';
import BhotekoshiFloodButton from './BhotekoshiFloodButton';
import type {
  HazardSnapshot,
  NewsItem,
  SourceHealth,
  Earthquake,
  WeatherAlert,
  WeatherStation,
  FireRegion,
  AirQualityStation,
  HazardRead,
  ReliefDisaster,
  ReliefReport,
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

function formatNumber(val: number | null | undefined, decimals = 0) {
  if (val == null || !Number.isFinite(val)) return '--';
  return val.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// Bar width for the Signal Core meters: each metric gets its own ceiling so a
// count of 3 earthquakes and 3,000 fire detections do not render identically.
function meterPercent(value: number, ceiling: number) {
  if (!Number.isFinite(value) || value <= 0) return 2;
  return Math.max(4, Math.min(100, Math.round((value / ceiling) * 100)));
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

  // Load configuration from local storage
  useEffect(() => {
    const cachedPerf = localStorage.getItem('atlas_low_perf') === 'true';
    const cachedTheme = localStorage.getItem('atlas_theme') === 'dark';
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

  const toggleTheme = () => {
    const target = !darkTheme;
    setDarkTheme(target);
    localStorage.setItem('atlas_theme', target ? 'dark' : 'light');
    document.body.classList.toggle('dark-theme', target);
  };

  // Rule-based hazard read-out, shown when the LLM layer is off
  const buildInsights = () => {
    const lines: Array<{ tone: string; text: string }> = [];
    const sq = D.seismic || {};
    const wx = D.weather || {};
    const aqiWorst: AirQualityStation | null = D.airQuality?.worst ?? null;
    const impactSummary = D.impact || { count: 0, topRegions: [] };
    const wettest = [...(wx.stations || [])].sort((a: WeatherStation, b: WeatherStation) => (b.rain5dMm || 0) - (a.rain5dMm || 0))[0];

    if (sq.maxMagnitude != null && sq.totalEvents) {
      const strongest = sq.strongest;
      lines.push({
        tone: sq.maxMagnitude >= 5 ? 'warn' : 'base',
        text: `Seismic: ${sq.events7d || 0} events in 7d, strongest M${sq.maxMagnitude}${strongest?.place ? ` near ${strongest.place.replace(/^\d+\s*km\s*/, '')}` : ''}${strongest?.depthKm != null ? ` at ${strongest.depthKm.toFixed(0)}km depth` : ''}.`,
      });
    }

    if (wx.totalAlerts) {
      lines.push({
        tone: 'warn',
        text: `${wx.totalAlerts} weather alert${wx.totalAlerts > 1 ? 's' : ''} active${wx.monsoonSeason ? ' during monsoon — flood and landslide exposure is at its seasonal peak' : ''}.`,
      });
    } else if (wx.monsoonSeason) {
      lines.push({
        tone: 'base',
        text: 'Monsoon season active with no severe alerts in the current window.',
      });
    }

    if (wettest?.rain5dMm > 100) {
      lines.push({
        tone: wettest.rain5dMm > 200 ? 'warn' : 'base',
        text: `${wettest.rain5dMm}mm forecast over 5 days at ${wettest.city} — slopes fail on cumulative saturation, not single-day totals.`,
      });
    }

    if (D.fire?.totalDetections) {
      lines.push({
        tone: D.fire.totalDetections > 500 ? 'warn' : 'base',
        text: `${formatNumber(D.fire.totalDetections)} fire detections nationwide${D.fire.nightDetections > 20 ? `, ${D.fire.nightDetections} overnight — burning unchecked past dark` : ''}.`,
      });
    }

    if (aqiWorst?.aqi != null) {
      lines.push({
        tone: aqiWorst.aqi > 150 ? 'warn' : 'base',
        text: `Air quality peaks at AQI ${aqiWorst.aqi} (${aqiWorst.band}) in ${aqiWorst.location}.`,
      });
    }

    if (impactSummary.count >= 5) {
      const where = (impactSummary.topRegions || []).map((r) => `${r.region} (${r.count})`).join(', ');
      lines.push({
        tone: 'warn',
        text: `${impactSummary.count} headlines report casualties, missing persons, displacement or active rescue${where ? ` — concentrated in ${where}` : ''}.`,
      });
    }

    if (D.relief?.disasters?.length) {
      lines.push({
        tone: 'warn',
        text: `${D.relief.disasters.length} disaster${D.relief.disasters.length > 1 ? 's' : ''} listed as active for Nepal on ReliefWeb — cluster coordination already standing.`,
      });
    }

    const lead = newsCache['live-hazard']?.items?.[0];
    if (lead) {
      lines.push({ tone: 'lead', text: `Leading headline: ${lead.title}` });
    }

    return lines;
  };

  const ts = new Date(meta.timestamp || new Date());
  const formattedDate = ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
  const formattedTime = ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  const sq = D.seismic || {};
  const wx = D.weather || {};
  const worstAqi = D.airQuality?.worst?.aqi || 0;
  const totalThermal = D.fire?.totalDetections || 0;
  const activeDisasters = D.relief?.disasters?.length || 0;
  const extremeAlerts = (wx.alerts || []).filter((a: WeatherAlert) => a.severity === 'extreme').length;
  const impact = D.impact || { count: 0, topRegions: [] };
  const wettest = [...(wx.stations || [])].sort((a: WeatherStation, b: WeatherStation) => (b.rain5dMm || 0) - (a.rain5dMm || 0))[0];

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

  const signalCoreMetrics = [
    { label: 'Earthquakes today', value: sq.events24h || 0, percent: meterPercent(sq.events24h || 0, 10) },
    { label: 'Weather alerts', value: wx.totalAlerts || 0, percent: meterPercent(wx.totalAlerts || 0, 12) },
    { label: 'Rain expected (5 days)', value: wettest?.rain5dMm ? Math.round(wettest.rain5dMm) : 0, percent: meterPercent(wettest?.rain5dMm || 0, 400) },
    { label: 'Active responses', value: activeDisasters, percent: meterPercent(activeDisasters, 6) },
  ];

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
          <span className="brand">ANCODA ATLAS</span>
          <span className="regime-chip">
            <span className="blink" />
            {regimeChip === 'BACKGROUND MONITORING' ? 'Routine monitoring' : regimeChip.replace('SIGNIFICANT SEISMIC EVENT', 'Significant earthquake').replace('DISASTER RESPONSE UNDER WAY', 'LIVE').replace('MONSOON HAZARD SEASON', 'Monsoon season').replace('WILDFIRE SEASON', 'Wildfire season')}
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
            <button className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')} aria-pressed={language === 'en'}>EN</button>
            <button className={language === 'ne' ? 'active' : ''} onClick={() => setLanguage('ne')} aria-pressed={language === 'ne'}>ने</button>
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

      <section className="dashboard-intro" aria-labelledby="dashboard-title">
        <div>
          <p className="eyebrow">Nepal hazard overview</p>
          <h1 id="dashboard-title">What needs attention today?</h1>
          <p className="intro-copy">
            A plain-language view of earthquakes, rain, fires, air quality, and active response signals.
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
                <p className="eyebrow">Live updates</p>
                <h3>Live hazard feed</h3>
              </div>
              <span className="badge">
                {(newsCache['live-hazard']?.items || []).length} ITEMS
              </span>
            </div>
            <div className="news-window-bar">
              <span>Show updates from</span>
              {['6h', '24h', '48h', '7d'].map((w) => (
                <button key={w} className={`win-btn ${w === newsWindow ? 'active' : ''}`} onClick={() => setNewsWindow(w)}>
                  {w.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="news-list" suppressHydrationWarning>
              {(newsCache['live-hazard']?.items || []).length === 0 ? (
                <div className="news-empty">Fetching the latest hazard updates…</div>
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
            <p className="eyebrow">A little more context</p>
            <h2 id="supporting-title">What else is happening?</h2>
          </div>
          <p>Simple summaries to help explain the map and live updates.</p>
        </div>

        {/* Main Grid */}
        <div className="grid-container">
        {/* Left Column (Rail) */}
        <div className="col">
          {/* Seismic Panel */}
          <div className="g-panel">
            <div className="sec-head">
              <h3>Earthquakes nearby</h3>
              <span className="badge">USGS</span>
            </div>
            <div className="nuke-ok">
              {(sq.maxMagnitude || 0) < 4.5 ? (
                <>&#9679; No significant earthquakes reported</>
              ) : (
                <>&#9888; Significant earthquake detected</>
              )}
            </div>
            {(sq.recent || []).length === 0 && (
              <div className="font-mono text-[10px] text-dim">No recent events</div>
            )}
            {(sq.recent || []).slice(0, 6).map((q: Earthquake, i: number) => (
              <div className="site-row" key={i}>
                <span>
                  M{q.mag?.toFixed(1)} &middot;{' '}
                  {(q.place || '').replace(/^\d+\s*km\s*/, '').substring(0, 26)}
                </span>
                <span className="site-val">{q.depthKm != null ? `${q.depthKm.toFixed(0)} km` : '--'}</span>
              </div>
            ))}
            {(sq.signals || []).length > 0 && (
              <div className="sig-info-box" suppressHydrationWarning>
                {sq.signals.slice(0, 2).map((s: string, idx: number) => (
                  <div key={idx}>{s}</div>
                ))}
              </div>
            )}
          </div>

          {/* Rainfall & Flood Panel */}
          <div className="g-panel">
            <div className="sec-head">
              <h3>Rain and flood risk</h3>
              <span className="badge">{wx.monsoonSeason ? 'MONSOON' : 'OPEN-METEO'}</span>
            </div>
            {(wx.alerts || []).length > 0 ? (
              (wx.alerts || []).slice(0, 5).map((a: WeatherAlert, i: number) => (
                <div className="site-row" key={i}>
                  <span>{a.event}</span>
                  <span
                    className="site-val"
                    style={{ color: a.severity === 'extreme' ? 'var(--warn)' : a.severity === 'severe' ? 'var(--accent2)' : 'var(--accent)' }}
                  >
                    {(a.severity || '').toUpperCase()}
                  </span>
                </div>
              ))
            ) : (
              <div className="font-mono text-[10px] text-dim">NO SEVERE WEATHER ALERTS</div>
            )}
            <div className="nml-market-subtitle">Where the most rain is expected</div>
            {[...(wx.stations || [])]
              .sort((a: WeatherStation, b: WeatherStation) => (b.rain5dMm || 0) - (a.rain5dMm || 0))
              .slice(0, 5)
              .map((st: WeatherStation, i: number) => (
                <div className="econ-row" key={i}>
                  <span className="elabel">{st.city}</span>
                  <span
                    className="eval"
                    style={{ color: (st.rain5dMm || 0) > 200 ? 'var(--warn)' : (st.rain5dMm || 0) > 100 ? 'var(--accent2)' : 'var(--accent)' }}
                  >
                    {st.rain5dMm != null ? `${st.rain5dMm} mm` : '--'}
                  </span>
                </div>
              ))}
            {(wx.signals || []).length > 0 && (
              <div className="sig-info-box" suppressHydrationWarning>
                {wx.signals.slice(0, 2).map((s: string, idx: number) => (
                  <div key={idx}>{s}</div>
                ))}
              </div>
            )}
          </div>

          {/* Wildfire Panel */}
          <div className="g-panel">
            <div className="sec-head">
              <h3>Wildfire activity</h3>
              <span className="badge">NASA FIRMS</span>
            </div>
            {D.fire?.status === 'no_key' ? (
              <div className="font-mono text-[10px] text-dim">
                Satellite fire data is not connected
              </div>
            ) : (D.fire?.regions || []).length > 0 ? (
              <>
                <div className="econ-row">
                  <span className="elabel">Total detections (48h)</span>
                  <span className="eval text-accent">{formatNumber(totalThermal)}</span>
                </div>
                <div className="econ-row">
                  <span className="elabel">Overnight</span>
                  <span className="eval" style={{ color: (D.fire?.nightDetections || 0) > 20 ? 'var(--warn)' : 'var(--accent)' }}>
                    {formatNumber(D.fire?.nightDetections || 0)}
                  </span>
                </div>
                {[...(D.fire.regions || [])]
                  .sort((a: FireRegion, b: FireRegion) => (b.det || 0) - (a.det || 0))
                  .slice(0, 5)
                  .map((r: FireRegion, i: number) => (
                    <div className="site-row" key={i}>
                      <span>{r.region}</span>
                      <span className="site-val">{formatNumber(r.det)}</span>
                    </div>
                  ))}
              </>
            ) : (
              <div className="font-mono text-[10px] text-dim">No active fire detections</div>
            )}
          </div>

          {/* Air Quality Panel */}
          <div className="g-panel">
            <div className="sec-head">
              <h3>Air quality</h3>
              <span className="badge">PM2.5</span>
            </div>
            {(D.airQuality?.stations || []).length > 0 ? (
              (D.airQuality.stations || []).slice(0, 7).map((st: AirQualityStation, i: number) => (
                <div className="econ-row" key={i}>
                  <span className="elabel">{st.location}</span>
                  <span className="eval" style={{ color: (st.aqi ?? 0) > 150 ? 'var(--warn)' : (st.aqi ?? 0) > 100 ? 'var(--accent2)' : 'var(--accent)' }}>
                    {st.aqi ?? '--'}{' '}
                    <span className="text-[9px] text-dim font-normal">{st.band || ''}</span>
                  </span>
                </div>
              ))
            ) : (
              <div className="font-mono text-[10px] text-dim">No air quality data</div>
            )}
          </div>
        </div>

        {/* Right Column (Reads, Core, Response, Source health) */}
        <div className="col">
          {/* Active-event desk — opens the dedicated /bhotekoshi-flood page */}
          <BhotekoshiFloodButton />

          {/* Hazard Reads */}
          <div className="g-panel right-insights">
            <div className="sec-head">
              <h3>What the signals suggest</h3>
              <span className="badge">{D.ideasSource === 'llm' ? 'LLM' : 'SYNTHESIZED'}</span>
              </div>
            <div>
              {(D.ideas || []).length > 0 ? (
                <ul className="insights-list">
                  {(D.ideas || []).slice(0, 6).map((idea: HazardRead, idx: number) => (
                    <li key={idx} className={/RESPOND|respond/.test(idea.type || '') ? 'ins-warn' : 'ins-base'}>
                      <strong>{cleanText(idea.title)}</strong>
                      {' — '}
                      {cleanText(idea.rationale || idea.text || '')}
                    </li>
                  ))}
                </ul>
              ) : buildInsights().length > 0 ? (
                <ul className="insights-list">
                  {buildInsights().slice(0, 8).map((line, idx) => (
                    <li key={idx} className={`ins-${line.tone}`}>{cleanText(line.text)}</li>
                  ))}
                </ul>
              ) : (
                <div className="news-empty">Awaiting sweep data.</div>
              )}
            </div>
          </div>

          {/* Signal Core */}
          <div className="g-panel right-core">
            <div className="sec-head">
              <h3>At a glance</h3>
              <span className="badge">UPDATED LIVE</span>
            </div>
            {signalCoreMetrics.map((sm, i) => (
              <div className="sm" key={i}>
                <span className="sml">{sm.label}</span>
                <div className="smb">
                  <span style={{ width: `${sm.percent}%` }} />
                </div>
                <span className="smv">{formatNumber(sm.value)}</span>
              </div>
            ))}
          </div>

          {/* Active Response */}
          <div className="g-panel">
            <div className="sec-head">
              <h3>Current response</h3>
              <span className="badge">RELIEFWEB</span>
            </div>
            {D.relief?.error ? (
              <div className="font-mono text-[10px] text-dim">
                Response information is temporarily unavailable
              </div>
            ) : (D.relief?.disasters || []).length > 0 ? (
              (D.relief.disasters || []).slice(0, 5).map((d: ReliefDisaster, i: number) => (
                <div className="site-row" key={i}>
                  <span>{(d.name || '').substring(0, 34)}</span>
                  <span className="site-val">{(d.type || []).join('/').substring(0, 12) || '--'}</span>
                </div>
              ))
            ) : (
              <div className="font-mono text-[10px] text-dim">No active declared disasters</div>
            )}
            {(D.relief?.reports || []).slice(0, 4).map((r: ReliefReport, i: number) => (
              <div
                key={`rep-${i}`}
                className={`tk-card ${r.url ? 'clickable' : ''}`}
                onClick={() => { if (r.url) window.open(r.url, '_blank', 'noopener'); }}
              >
                <span className="tk-src other">{D.relief?.error ? 'HDX' : 'OCHA'}</span>
                <div className="tk-head">{cleanText(r.title || '').substring(0, 90)}</div>
                {r.url && <span className="tk-link">&#8599;</span>}
              </div>
            ))}
          </div>

          {/* Source Health */}
          <div className="g-panel right-sources">
            <div className="sec-head">
              <h3>Data sources</h3>
              <span className="badge">
                {meta.sourcesOk || 0}/{meta.sourcesQueried || 5}
              </span>
            </div>
            <div className="src-grid">
              {(D.health || []).map((s: SourceHealth, idx: number) => (
                <div
                  className="src-item"
                  key={idx}
                  title={s.err ? 'Error' : s.stale ? 'Degraded — running on a fallback feed' : 'Operational'}
                >
                  <div
                    className={`sd ${s.err ? 'err' : 'ok'}`}
                    style={s.stale && !s.err ? { background: 'var(--accent2)' } : undefined}
                  />
                  <span>{s.n}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      </section>

      {/* Glossary Overlay */}
      <div className={`glossary-overlay ${glossaryOpen ? 'show' : ''}`}>
        <div className="glossary-panel">
          <div className="glossary-head">
            <div>
              <div className="glossary-kicker">Nepal Hazard Dictionary</div>
              <div className="glossary-title">Atlas Hazard Lexicon</div>
              <div className="glossary-sub">Guide to natural-hazard triggers and severity thresholds</div>
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
                  <span className="glossary-label">Meaning</span>
                  {item.meaning}
                </div>
                <div className="glossary-line">
                  <span className="glossary-label">Why it matters</span>
                  {item.matters}
                </div>
                <div className="glossary-line">
                  <span className="glossary-label">Not proof of</span>
                  {item.notMeaning}
                </div>
                {item.example && (
                  <div className="glossary-line text-[10px] text-[#81d4fa]">
                    <span className="glossary-label">Example</span>
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
