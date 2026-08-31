// Open-Meteo Air Quality — Nepal PM2.5 / AQI
// Free, no key. Replaces the US-only EPA RadNet feed.
// Kathmandu regularly ranks among the world's most polluted cities in the
// winter inversion and spring wildfire seasons, so this is a first-order feed.

import { safeFetch } from '../utils/fetch.mjs';
import { CITIES, PROVINCES } from '../utils/nepal.mjs';

const BASE = 'https://air-quality-api.open-meteo.com/v1/air-quality';

// US EPA AQI breakpoints — the scale Nepali outlets and embassies quote.
const AQI_BANDS = [
  { max: 50,  label: 'Good',                           severity: 'none' },
  { max: 100, label: 'Moderate',                       severity: 'low' },
  { max: 150, label: 'Unhealthy for Sensitive Groups', severity: 'moderate' },
  { max: 200, label: 'Unhealthy',                      severity: 'high' },
  { max: 300, label: 'Very Unhealthy',                 severity: 'severe' },
  { max: Infinity, label: 'Hazardous',                 severity: 'extreme' },
];

export function aqiBand(aqi) {
  if (aqi == null) return { label: 'Unknown', severity: 'none' };
  return AQI_BANDS.find(b => aqi <= b.max);
}

export async function getAirQuality(lat, lon) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,us_aqi',
    timezone: 'Asia/Kathmandu',
  });
  return safeFetch(`${BASE}?${params}`, { timeout: 20000 });
}

export async function briefing() {
  const entries = Object.values(CITIES);
  const results = await Promise.all(
    entries.map(async city => {
      const aq = await getAirQuality(city.lat, city.lon);
      if (aq?.error) return { city: city.label, error: aq.error };
      const cur = aq.current || {};
      const band = aqiBand(cur.us_aqi);
      return {
        location: city.label,
        state: PROVINCES[city.province]?.label || null,
        lat: city.lat,
        lon: city.lon,
        aqi: cur.us_aqi ?? null,
        band: band.label,
        severity: band.severity,
        pm25: cur.pm2_5 ?? null,
        pm10: cur.pm10 ?? null,
        no2: cur.nitrogen_dioxide ?? null,
        so2: cur.sulphur_dioxide ?? null,
        co: cur.carbon_monoxide ?? null,
        ozone: cur.ozone ?? null,
      };
    })
  );

  const readings = results.filter(r => !r.error);
  const failed = results.filter(r => r.error);

  if (!readings.length) {
    return {
      source: 'AirQuality',
      timestamp: new Date().toISOString(),
      error: failed[0]?.error || 'Open-Meteo air quality returned no data',
    };
  }

  const ranked = [...readings].filter(r => r.aqi != null).sort((a, b) => b.aqi - a.aqi);
  const worst = ranked[0] || null;
  const kathmandu = readings.find(r => r.location === 'Kathmandu') || null;
  const unhealthy = ranked.filter(r => r.aqi > 150);

  const signals = [];
  if (worst && worst.aqi > 200) {
    signals.push(`AQI ${worst.aqi} at ${worst.location} — ${worst.band}. Outdoor exposure hazardous.`);
  } else if (worst && worst.aqi > 150) {
    signals.push(`AQI ${worst.aqi} at ${worst.location} — ${worst.band}.`);
  }
  if (unhealthy.length >= 3) {
    signals.push(`${unhealthy.length} Nepal cities above AQI 150 — regional pollution episode, not a local source`);
  }
  if (kathmandu?.pm25 != null && kathmandu.pm25 > 55) {
    signals.push(`Kathmandu PM2.5 at ${kathmandu.pm25} µg/m³ — valley inversion trapping particulates`);
  }

  return {
    source: 'AirQuality',
    timestamp: new Date().toISOString(),
    totalReadings: readings.length,
    worst,
    kathmandu,
    readings,
    signals,
    ...(failed.length ? { partialErrors: failed.map(f => ({ city: f.city, error: f.error })) } : {}),
  };
}

if (process.argv[1]?.endsWith('airquality.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
