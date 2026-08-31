// Open-Meteo — Nepal weather and monsoon/flood watch
// Free, no key. Replaces the US-only NOAA/NWS alert feed.
// Monsoon flooding and landslides are Nepal's dominant recurring hazard.

import { safeFetch } from '../utils/fetch.mjs';
import { CITIES, PROVINCES } from '../utils/nepal.mjs';

const BASE = 'https://api.open-meteo.com/v1/forecast';

// WMO weather codes worth flagging. Everything else is ordinary weather.
const SEVERE_CODES = {
  65: { event: 'Heavy Rain', severity: 'severe' },
  67: { event: 'Heavy Freezing Rain', severity: 'severe' },
  75: { event: 'Heavy Snowfall', severity: 'severe' },
  82: { event: 'Violent Rain Showers', severity: 'extreme' },
  86: { event: 'Heavy Snow Showers', severity: 'severe' },
  95: { event: 'Thunderstorm', severity: 'moderate' },
  96: { event: 'Thunderstorm with Hail', severity: 'severe' },
  99: { event: 'Thunderstorm with Heavy Hail', severity: 'extreme' },
};

export async function getForecast(lat, lon) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max',
    timezone: 'Asia/Kathmandu',
    forecast_days: '5',
  });
  return safeFetch(`${BASE}?${params}`, { timeout: 20000 });
}

// Nepal's monsoon runs roughly June through September. Rain thresholds that
// are unremarkable in July are notable in December.
function isMonsoonSeason(date = new Date()) {
  const m = date.getMonth() + 1;
  return m >= 6 && m <= 9;
}

function classify(city, fc) {
  const cur = fc.current || {};
  const daily = fc.daily || {};
  const days = (daily.time || []).map((date, i) => ({
    date,
    code: daily.weather_code?.[i] ?? null,
    tMax: daily.temperature_2m_max?.[i] ?? null,
    tMin: daily.temperature_2m_min?.[i] ?? null,
    precip: daily.precipitation_sum?.[i] ?? 0,
    precipChance: daily.precipitation_probability_max?.[i] ?? null,
  }));

  const rain5d = days.reduce((s, d) => s + (d.precip || 0), 0);
  const maxDaily = days.reduce((m, d) => Math.max(m, d.precip || 0), 0);

  return {
    city: city.label,
    province: PROVINCES[city.province]?.label || null,
    lat: city.lat,
    lon: city.lon,
    temperature: cur.temperature_2m ?? null,
    humidity: cur.relative_humidity_2m ?? null,
    precipitation: cur.precipitation ?? null,
    windSpeed: cur.wind_speed_10m ?? null,
    weatherCode: cur.weather_code ?? null,
    forecast: days,
    rain5dMm: +rain5d.toFixed(1),
    maxDailyRainMm: +maxDaily.toFixed(1),
  };
}

export async function briefing() {
  const entries = Object.values(CITIES);
  const results = await Promise.all(
    entries.map(async city => {
      const fc = await getForecast(city.lat, city.lon);
      if (fc?.error) return { city: city.label, lat: city.lat, lon: city.lon, error: fc.error };
      return classify(city, fc);
    })
  );

  const stations = results.filter(r => !r.error);
  const failed = results.filter(r => r.error);

  if (!stations.length) {
    return {
      source: 'Weather',
      timestamp: new Date().toISOString(),
      error: failed[0]?.error || 'Open-Meteo returned no data for any Nepal station',
    };
  }

  const monsoon = isMonsoonSeason();
  // 100mm/day is the threshold Nepal's DHM broadly treats as heavy rainfall.
  const heavyRainThreshold = monsoon ? 100 : 50;

  const alerts = [];
  for (const s of stations) {
    const severe = SEVERE_CODES[s.weatherCode];
    if (severe) {
      alerts.push({
        event: severe.event,
        severity: severe.severity,
        headline: `${severe.event} at ${s.city}, ${s.province || 'Nepal'}`,
        lat: s.lat, lon: s.lon,
      });
    }
    if (s.maxDailyRainMm >= heavyRainThreshold) {
      alerts.push({
        event: 'Flood / Landslide Risk',
        severity: s.maxDailyRainMm >= heavyRainThreshold * 1.5 ? 'extreme' : 'severe',
        headline: `${s.maxDailyRainMm}mm daily rainfall forecast at ${s.city} — flood and landslide risk`,
        lat: s.lat, lon: s.lon,
      });
    }
    if (s.temperature != null && s.temperature >= 40) {
      alerts.push({
        event: 'Extreme Heat',
        severity: 'severe',
        headline: `${s.temperature}°C at ${s.city} — heat stress in the Terai`,
        lat: s.lat, lon: s.lon,
      });
    }
  }

  const signals = [];
  const wettest = [...stations].sort((a, b) => b.rain5dMm - a.rain5dMm)[0];
  if (wettest && wettest.rain5dMm > 150) {
    signals.push(`${wettest.rain5dMm}mm forecast over 5 days at ${wettest.city} — sustained saturation, landslide risk rising`);
  }
  if (monsoon) signals.push('Monsoon season active — elevated baseline flood and landslide exposure');
  if (alerts.some(a => a.severity === 'extreme')) {
    signals.push('Extreme weather alert active in at least one Nepal district');
  }

  return {
    source: 'Weather',
    timestamp: new Date().toISOString(),
    monsoonSeason: monsoon,
    totalSevereAlerts: alerts.length,
    topAlerts: alerts.slice(0, 12),
    stations,
    signals,
    ...(failed.length ? { partialErrors: failed.map(f => ({ city: f.city, error: f.error })) } : {}),
  };
}

if (process.argv[1]?.endsWith('weather.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
