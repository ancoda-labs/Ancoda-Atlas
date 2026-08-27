#!/usr/bin/env node
// Hazard sweep synthesizer.
// Turns the raw sweep in runs/latest.json into the shape the UI renders:
// disaster-filtered RSS news, reported-impact summary, and rule-based reads.
//
// Exports synthesize(), generateIdeas(), fetchAllNews() for the sweeper.
// The payload shape is described in lib/types.ts.

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// === Geo-tagging keyword map ===
// Nepal places only. Ordered roughly most-specific first: `geoTagText` returns
// on the first hit, so districts and cities must be tested before the province
// and country names that contain them geographically.
const geoKeywords = {
  // Kathmandu valley
  'Kathmandu':[27.7172,85.3240],'Lalitpur':[27.6644,85.3188],'Patan':[27.6766,85.3240],
  'Bhaktapur':[27.6710,85.4298],'Thamel':[27.7154,85.3123],'Baneshwor':[27.6893,85.3400],
  // Major cities
  'Pokhara':[28.2096,83.9856],'Biratnagar':[26.4525,87.2718],'Birgunj':[27.0104,84.8770],
  'Bharatpur':[27.6768,84.4360],'Butwal':[27.7006,83.4484],'Nepalgunj':[28.0500,81.6167],
  'Dhangadhi':[28.6833,80.6000],'Janakpur':[26.7288,85.9266],'Hetauda':[27.4287,85.0322],
  'Dharan':[26.8065,87.2846],'Itahari':[26.6646,87.2718],'Birendranagar':[28.6000,81.6333],
  'Bhairahawa':[27.5000,83.4500],'Damak':[26.6600,87.7000],'Tulsipur':[28.1300,82.2970],
  // Districts and regions that appear in hazard coverage
  'Chitwan':[27.5291,84.3542],'Lumbini':[27.4833,83.2764],'Solukhumbu':[27.7000,86.7167],
  'Everest':[27.9881,86.9250],'Annapurna':[28.5961,83.8203],'Mustang':[28.9985,83.8473],
  'Manang':[28.6667,84.0167],'Dolpa':[29.0000,82.9000],'Humla':[30.0000,81.8333],
  'Jumla':[29.2747,82.1838],'Rasuwa':[28.1167,85.3000],'Sindhupalchok':[27.9500,85.7000],
  'Dolakha':[27.6667,86.1667],'Gorkha':[28.0000,84.6333],'Lamjung':[28.2333,84.3667],
  'Kaski':[28.2500,83.9500],'Palpa':[27.8667,83.5500],'Dang':[28.0000,82.3000],
  'Bardiya':[28.3000,81.4000],'Kailali':[28.7000,80.8000],'Kanchanpur':[28.8333,80.3333],
  'Ilam':[26.9095,87.9286],'Jhapa':[26.6000,87.9000],'Morang':[26.6000,87.4000],
  'Sunsari':[26.6667,87.1667],'Saptari':[26.6167,86.7333],'Siraha':[26.6500,86.2000],
  'Dhanusha':[26.8000,86.0000],'Mahottari':[26.8000,85.8000],'Sarlahi':[27.0000,85.5000],
  'Rautahat':[27.0000,85.3000],'Bara':[27.0333,85.0333],'Parsa':[27.1500,84.8833],
  'Makwanpur':[27.5000,85.0333],'Nuwakot':[27.9167,85.1667],'Dhading':[27.8667,84.9000],
  'Kavre':[27.6000,85.5500],'Ramechhap':[27.3333,86.0833],'Okhaldhunga':[27.3167,86.5000],
  'Khotang':[27.2000,86.7833],'Bhojpur':[27.1667,87.0500],'Taplejung':[27.3500,87.6667],
  'Panchthar':[27.1500,87.8000],'Terhathum':[27.1333,87.5333],'Dhankuta':[26.9833,87.3333],
  'Udayapur':[26.8333,86.6667],'Rolpa':[28.3000,82.6333],'Rukum':[28.6167,82.4833],
  'Salyan':[28.3833,82.1667],'Surkhet':[28.6000,81.6333],'Dailekh':[28.8333,81.7167],
  'Jajarkot':[28.7000,82.2000],'Mugu':[29.4667,82.1000],'Kalikot':[29.1333,81.6167],
  'Bajura':[29.5000,81.5167],'Bajhang':[29.5333,81.2000],'Achham':[29.1167,81.3000],
  'Doti':[29.2667,80.9333],'Dadeldhura':[29.3000,80.5833],'Baitadi':[29.5333,80.5000],
  'Darchula':[29.8500,80.8833],
  // Rivers — the named basins in most flood reporting
  'Koshi':[26.8000,87.1500],'Karnali':[28.6000,81.2000],'Narayani':[27.6000,84.4000],
  'Bagmati':[27.7000,85.3000],'Rapti':[28.0500,82.5000],'Gandaki':[28.4000,84.0000],
  'Mahakali':[29.2000,80.4000],'Trishuli':[27.9000,85.1500],'Melamchi':[27.8300,85.5600],
  // Provinces
  'Madhesh':[26.8000,85.8000],'Sudurpashchim':[29.3000,80.8000],
  // Physiographic belts
  'Terai':[27.0000,84.5000],'Madhes':[26.8000,85.8000],'Himalaya':[28.5000,84.5000],
  // Nepali-script place names. Most first-hand district hazard reporting is
  // published in Nepali, and without these every such headline fell back to
  // the outlet's home city and stacked on Kathmandu.
  'काठमाडौं':[27.7172,85.3240,'Kathmandu'],'काठमाडौँ':[27.7172,85.3240,'Kathmandu'],'ललितपुर':[27.6644,85.3188,'Lalitpur'],
  'भक्तपुर':[27.6710,85.4298,'Bhaktapur'],'पोखरा':[28.2096,83.9856,'Pokhara'],'विराटनगर':[26.4525,87.2718,'Biratnagar'],
  'वीरगन्ज':[27.0104,84.8770,'Birgunj'],'भरतपुर':[27.6768,84.4360,'Bharatpur'],'बुटवल':[27.7006,83.4484,'Butwal'],
  'नेपालगन्ज':[28.0500,81.6167,'Nepalgunj'],'धनगढी':[28.6833,80.6000,'Dhangadhi'],'जनकपुर':[26.7288,85.9266,'Janakpur'],
  'हेटौंडा':[27.4287,85.0322,'Hetauda'],'धरान':[26.8065,87.2846,'Dharan'],'इटहरी':[26.6646,87.2718,'Itahari'],
  'रसुवा':[28.1167,85.3000,'Rasuwa'],'सिन्धुपाल्चोक':[27.9500,85.7000,'Sindhupalchok'],'दोलखा':[27.6667,86.1667,'Dolakha'],
  'गोरखा':[28.0000,84.6333,'Gorkha'],'लमजुङ':[28.2333,84.3667,'Lamjung'],'कास्की':[28.2500,83.9500,'Kaski'],
  'नुवाकोट':[27.9167,85.1667,'Nuwakot'],'धादिङ':[27.8667,84.9000,'Dhading'],'काभ्रे':[27.6000,85.5500,'Kavre'],
  'रामेछाप':[27.3333,86.0833,'Ramechhap'],'सोलुखुम्बु':[27.7000,86.7167,'Solukhumbu'],'मनाङ':[28.6667,84.0167,'Manang'],
  'मुस्ताङ':[28.9985,83.8473,'Mustang'],'डोल्पा':[29.0000,82.9000,'Dolpa'],'हुम्ला':[30.0000,81.8333,'Humla'],
  'जुम्ला':[29.2747,82.1838,'Jumla'],'मुगु':[29.4667,82.1000,'Mugu'],'कालिकोट':[29.1333,81.6167,'Kalikot'],
  'जाजरकोट':[28.7000,82.2000,'Jajarkot'],'सुर्खेत':[28.6000,81.6333,'Surkhet'],'दैलेख':[28.8333,81.7167,'Dailekh'],
  'रुकुम':[28.6167,82.4833,'Rukum'],'रोल्पा':[28.3000,82.6333,'Rolpa'],'सल्यान':[28.3833,82.1667,'Salyan'],
  'बाजुरा':[29.5000,81.5167,'Bajura'],'बझाङ':[29.5333,81.2000,'Bajhang'],'अछाम':[29.1167,81.3000,'Achham'],
  'डोटी':[29.2667,80.9333,'Doti'],'डडेल्धुरा':[29.3000,80.5833,'Dadeldhura'],'बैतडी':[29.5333,80.5000,'Baitadi'],
  'दार्चुला':[29.8500,80.8833,'Darchula'],'कैलाली':[28.7000,80.8000,'Kailali'],'कञ्चनपुर':[28.8333,80.3333,'Kanchanpur'],
  'बर्दिया':[28.3000,81.4000,'Bardiya'],'बाँके':[28.0500,81.6167,'Banke'],'दाङ':[28.0000,82.3000,'Dang'],
  'चितवन':[27.5291,84.3542,'Chitwan'],'मकवानपुर':[27.5000,85.0333,'Makwanpur'],'पर्सा':[27.1500,84.8833,'Parsa'],
  'बारा':[27.0333,85.0333,'Bara'],'रौतहट':[27.0000,85.3000,'Rautahat'],'सर्लाही':[27.0000,85.5000,'Sarlahi'],
  'महोत्तरी':[26.8000,85.8000,'Mahottari'],'धनुषा':[26.8000,86.0000,'Dhanusha'],'सिरहा':[26.6500,86.2000,'Siraha'],
  'सप्तरी':[26.6167,86.7333,'Saptari'],'उदयपुर':[26.8333,86.6667,'Udayapur'],'सुनसरी':[26.6667,87.1667,'Sunsari'],
  'मोरङ':[26.6000,87.4000,'Morang'],'झापा':[26.6000,87.9000,'Jhapa'],'इलाम':[26.9095,87.9286,'Ilam'],
  'पाँचथर':[27.1500,87.8000,'Panchthar'],'ताप्लेजुङ':[27.3500,87.6667,'Taplejung'],'धनकुटा':[26.9833,87.3333,'Dhankuta'],
  'भोजपुर':[27.1667,87.0500,'Bhojpur'],'खोटाङ':[27.2000,86.7833,'Khotang'],'ओखलढुंगा':[27.3167,86.5000,'Okhaldhunga'],
  'सिन्धुली':[27.2500,85.9167,'Sindhuli'],'पाल्पा':[27.8667,83.5500,'Palpa'],'स्याङ्जा':[28.1000,83.8000,'Syangja'],
  'तनहुँ':[27.9167,84.2500,'Tanahun'],'बागलुङ':[28.2667,83.6000,'Baglung'],'म्याग्दी':[28.4000,83.5667,'Myagdi'],
  'पर्वत':[28.2333,83.7000,'Parbat'],'गुल्मी':[28.0833,83.2500,'Gulmi'],'अर्घाखाँची':[27.9500,83.0500,'Arghakhanchi'],
  'कपिलवस्तु':[27.5500,83.0500,'Kapilvastu'],'रुपन्देही':[27.6000,83.4500,'Rupandehi'],'नवलपरासी':[27.5500,83.9000,'Nawalparasi'],
  'प्युठान':[28.1000,82.8667,'Pyuthan'],'रुकुमपश्चिम':[28.6167,82.4833,'Rukum West'],
  // River basins named in flood reporting
  'भोटेकोशी':[27.9000,85.8500,'Bhotekoshi'],'त्रिशूली':[27.9000,85.1500,'Trishuli'],'सुनकोशी':[27.5000,85.9000,'Sunkoshi'],
  'कोशी':[26.8000,87.1500,'Koshi'],'कर्णाली':[28.6000,81.2000,'Karnali'],'नारायणी':[27.6000,84.4000,'Narayani'],
  'बागमती':[27.7000,85.3000,'Bagmati'],'राप्ती':[28.0500,82.5000,'Rapti'],'महाकाली':[29.2000,80.4000,'Mahakali'],
  'मेलम्ची':[27.8300,85.5600,'Melamchi'],'गण्डकी':[28.4000,84.0000,'Gandaki'],
  // Provinces and belts
  'मधेश':[26.8000,85.8000,'Madhesh'],'सुदूरपश्चिम':[29.3000,80.8000,'Sudurpashchim'],'लुम्बिनी':[27.4833,83.2764,'Lumbini'],
  'तराई':[27.0000,84.5000,'Terai'],'हिमाल':[28.5000,84.5000,'Himalaya'],
  // Country fallback — must stay last so a district match wins
  'Nepali':[28.3949,84.1240],'Nepalese':[28.3949,84.1240],'Nepal':[28.3949,84.1240],
  'नेपाल':[28.3949,84.1240,'Nepal'],
};

// ~0.05 degrees is roughly 5km at Nepal's latitude.
const GEO_JITTER_DEG = 0.05;

// === Disaster relevance filter ===
// The RSS feeds below are general Nepali dailies. Atlas only carries the
// hazard coverage, so a headline has to name a natural hazard, its impact,
// or the response to it before it reaches the map or the ticker.
const HAZARD_TERMS = [
  // Geophysical
  'earthquake', 'quake', 'aftershock', 'tremor', 'seismic', 'epicentre', 'epicenter',
  // Mass movement
  'landslide', 'mudslide', 'rockfall', 'avalanche', 'debris flow',
  // Hydrological
  'flood', 'flooding', 'inundat', 'flash flood', 'glof', 'glacial lake', 'river swell',
  'waterlogg', 'embankment', 'washed away', 'swollen',
  // Meteorological
  'monsoon', 'heavy rain', 'rainfall', 'downpour', 'cloudburst', 'storm', 'windstorm',
  'hailstorm', 'thunderstorm', 'lightning', 'cold wave', 'heat wave', 'heatwave',
  'snowfall', 'blizzard', 'drought',
  // Fire
  'wildfire', 'forest fire', 'bushfire',
  // Air and environment
  'air quality', 'aqi', 'pm2.5', 'smog', 'haze', 'pollution',
  // Impact and response
  'disaster', 'calamity', 'evacuat', 'rescue', 'search and rescue', 'relief',
  'casualt', 'missing', 'displaced', 'shelter', 'ndrrma', 'red cross',
  'preparedness', 'early warning', 'damage assessment',
  // Nepali
  'भूकम्प', 'पराकम्प', 'पहिरो', 'बाढी', 'डुबान', 'हिमपहिरो', 'हिमताल',
  'वर्षा', 'मनसुन', 'असिना', 'चट्याङ', 'आगलागी', 'डढेलो', 'खडेरी',
  'विपद्', 'उद्धार', 'राहत', 'विस्थापित', 'क्षति', 'बेपत्ता', 'शीतलहर',
];

// Short Latin keywords match on word boundaries. Plain substring matching
// turns 'rain' into a hit on "training" and 'storm' into one on "brainstorm".
// Devanagari keeps substring matching: Nepali attaches case suffixes directly
// to the noun, so a boundary match would miss "बाढीले" for "बाढी".
const DEVANAGARI = /[\u0900-\u097F]/;
const hazardMatchers = HAZARD_TERMS.map(term => {
  const key = term.toLowerCase();
  if (DEVANAGARI.test(key)) return { key, re: null };
  return { key, re: new RegExp(`(?:^|[^a-z0-9])${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`, 'i') };
});

function isHazardText(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  return hazardMatchers.some(({ key, re }) => (re ? re.test(t) : t.includes(key)));
}

// Devanagari entries carry a third element: the Latin label the rest of the
// system already uses for that district. Without it "रसुवा" and "Rasuwa" count
// as two separate places when impact reporting is tallied by district.
function geoTagText(text) {
  if (!text) return null;
  for (const [keyword, [lat, lon, label]] of Object.entries(geoKeywords)) {
    if (text.includes(keyword)) {
      return { lat, lon, region: label || keyword };
    }
  }
  return null;
}

function sanitizeExternalUrl(raw) {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

// === RSS Fetching ===
async function fetchRSS(url, source) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const xml = await res.text();
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
      const block = match[1];
      const title = (block.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1] || '').trim();
      const link = sanitizeExternalUrl((block.match(/<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/)?.[1] || '').trim());
      const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
      if (title && title !== source) items.push({ title, date: pubDate, source, url: link || undefined });
    }
    return items;
  } catch (e) {
    console.log(`RSS fetch failed (${source}):`, e.message);
    return [];
  }
}

// Every feed below is a Nepal outlet, so an untagged hazard headline still
// belongs on the map — fall back to the outlet's own city rather than
// dropping the item.
const RSS_SOURCE_FALLBACKS = {
  'Kathmandu Post':   { lat: 27.7172, lon: 85.3240, region: 'Kathmandu' },
  'Online Khabar':    { lat: 27.7172, lon: 85.3240, region: 'Kathmandu' },
  'Online Khabar EN': { lat: 27.7172, lon: 85.3240, region: 'Kathmandu' },
  'Nepali Times':     { lat: 27.7172, lon: 85.3240, region: 'Kathmandu' },
  'Setopati':         { lat: 27.7172, lon: 85.3240, region: 'Kathmandu' },
  'Khabarhub':        { lat: 27.7172, lon: 85.3240, region: 'Kathmandu' },
  'Ratopati':         { lat: 27.7172, lon: 85.3240, region: 'Kathmandu' },
  'Nepal News':       { lat: 27.7172, lon: 85.3240, region: 'Kathmandu' },
};

// Several Nepali feeds ship no <pubDate>. Sorting purely by recency buries
// them under the high-volume ones, so guarantee every outlet a few slots
// before recency decides the rest.
const PER_SOURCE_RESERVE = 4;

export async function fetchAllNews() {
  const feeds = [
    // English-language dailies
    ['https://kathmandupost.com/rss', 'Kathmandu Post'],
    ['https://english.onlinekhabar.com/feed', 'Online Khabar EN'],
    ['https://english.khabarhub.com/feed/', 'Khabarhub'],
    ['https://nepalitimes.com/feed', 'Nepali Times'],
    ['https://www.nepalnews.com/feed', 'Nepal News'],
    // Nepali-language, high volume
    ['https://www.onlinekhabar.com/feed', 'Online Khabar'],
    ['https://www.setopati.com/feed', 'Setopati'],
    ['https://www.ratopati.com/feed', 'Ratopati'],
  ];

  const results = await Promise.allSettled(
    feeds.map(([url, source]) => fetchRSS(url, source))
  );

  const allNews = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value);

  // De-duplicate, drop everything that is not a hazard story, then geo-tag
  const seen = new Set();
  const geoNews = [];
  for (const item of allNews) {
    if (!isHazardText(item.title)) continue;
    const key = item.title.substring(0, 40).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const geo = geoTagText(item.title) || RSS_SOURCE_FALLBACKS[item.source];
    if (geo) {
      geoNews.push({
        title: item.title.substring(0, 100),
        source: item.source,
        date: item.date,
        url: item.url,
        // Small jitter so headlines sharing a city do not stack into one dot.
        // Kept to ~5km: on a country the size of Nepal a wider spread would
        // have thrown a Kathmandu story into the next province.
        lat: geo.lat + (Math.random() - 0.5) * GEO_JITTER_DEG,
        lon: geo.lon + (Math.random() - 0.5) * GEO_JITTER_DEG,
        region: geo.region
      });
    }
  }

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const filtered = geoNews.filter(n => !n.date || new Date(n.date) >= cutoff);
  filtered.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  const selected = [];
  const selectedKeys = new Set();
  const keyFor = item => `${item.source}|${item.title}|${item.date}`;
  const pushUnique = item => {
    const key = keyFor(item);
    if (selectedKeys.has(key)) return;
    selected.push(item);
    selectedKeys.add(key);
  };

  // Give every outlet its reserved slots first, then let recency fill the rest.
  for (const source of new Set(filtered.map(item => item.source))) {
    filtered.filter(item => item.source === source).slice(0, PER_SOURCE_RESERVE).forEach(pushUnique);
  }
  filtered.forEach(pushUnique);
  return selected.slice(0, 50);
}

// === Reported impact, read off the disaster-filtered news feed ===
// The sensor layers describe conditions; they do not describe consequences.
// A flood that has already happened shows up as casualties and rescue
// operations in the district press hours before it reaches ReliefWeb, so the
// news feed is the only layer that sees an event already under way.
const IMPACT_TERMS = [
  'dead', 'death', 'deaths', 'killed', 'toll', 'bodies', 'body', 'fatal', 'casualt',
  'missing', 'injured', 'buried', 'swept away', 'stranded', 'displaced', 'evacuat',
  'rescue', 'rescued', 'collapse', 'destroyed', 'damage',
  'शव', 'मृत्यु', 'बेपत्ता', 'घाइते', 'उद्धार', 'विस्थापित', 'क्षति', 'पुरिए',
];

export function summarizeReportedImpact(news = []) {
  const impact = news.filter(n => {
    const t = (n.title || '').toLowerCase();
    return IMPACT_TERMS.some(term => t.includes(term));
  });

  // Rank districts by how much of the impact reporting names them, ignoring
  // the outlet-fallback tags that just mean "untagged".
  const OUTLET_FALLBACK = new Set(['Kathmandu', 'Nepal', 'नेपाल']);
  const byRegion = new Map();
  for (const n of impact) {
    if (OUTLET_FALLBACK.has(n.region)) continue;
    byRegion.set(n.region, (byRegion.get(n.region) || 0) + 1);
  }
  const ranked = [...byRegion.entries()].sort((a, b) => b[1] - a[1]);

  return {
    count: impact.length,
    topRegions: ranked.slice(0, 3).map(([region, n]) => ({ region, count: n })),
    headline: impact[0]?.title || null,
  };
}

// === Actionable Reads from Nepal Hazard Signals ===
// Each rule fires only when the underlying data clears a threshold that is
// meaningful for Nepal specifically. `type` mirrors the dashboard's
// vocabulary: prepare / respond / watch.
export function generateIdeas(V2) {
  const ideas = [];

  const quakes24h = V2.seismic?.events24h || 0;
  const maxMag = V2.seismic?.maxMagnitude || 0;
  const shallow = V2.seismic?.significant?.filter(q => q.depthKm != null && q.depthKm < 35).length || 0;

  const alerts = V2.weather?.alerts || [];
  const floodAlerts = alerts.filter(a => /flood|landslide/i.test(a.event)).length;
  const heatAlerts = alerts.filter(a => /heat/i.test(a.event)).length;
  const extremeAlerts = alerts.filter(a => a.severity === 'extreme').length;
  const monsoon = Boolean(V2.weather?.monsoonSeason);
  const wettest = [...(V2.weather?.stations || [])].sort((a, b) => (b.rain5dMm || 0) - (a.rain5dMm || 0))[0];

  const worstAqi = V2.airQuality?.worst?.aqi || 0;
  const thermalTotal = V2.fire?.totalDetections || 0;
  const nightBurning = V2.fire?.nightDetections || 0;
  const activeDisasters = V2.relief?.disasters?.length || 0;

  // --- Seismic ---
  if (maxMag >= 5.5) {
    ideas.push({
      title: 'Significant Earthquake — Damage Assessment Window',
      text: `M${maxMag} event recorded in the Nepal region. Expect aftershocks for weeks. Priority checks: highway integrity on the Prithvi and Araniko corridors, rural district hospital capacity, and school building stock.`,
      type: 'respond', confidence: 'High', horizon: 'immediate'
    });
  } else if (quakes24h >= 5 && shallow >= 2) {
    ideas.push({
      title: 'Seismic Sequence Building',
      text: `${quakes24h} events in 24h with ${shallow} shallow M4.5+ ruptures. Shallow clusters precede damaging events more often than deep ones. Worth flagging to district preparedness contacts.`,
      type: 'watch', confidence: 'Medium', horizon: 'days'
    });
  }

  // --- Monsoon compound risk: rain plus terrain already shaken ---
  if (floodAlerts >= 2 && monsoon) {
    const seismicPrimed = quakes24h >= 3 || maxMag >= 4.5;
    ideas.push({
      title: seismicPrimed ? 'Compound Hazard — Saturated Slopes on Shaken Ground' : 'Monsoon Flood and Landslide Exposure',
      text: seismicPrimed
        ? `${floodAlerts} flood/landslide alerts active during monsoon, with recent seismic activity loosening the same slopes. This is the combination that closed the Araniko highway in 2015. Treat road access as unreliable.`
        : `${floodAlerts} flood/landslide alerts active in monsoon season. Terai inundation and hill-district road closures are both likely. Pre-position relief stock while highways are still open.`,
      type: seismicPrimed ? 'respond' : 'prepare', confidence: seismicPrimed ? 'High' : 'Medium', horizon: 'days'
    });
  }

  // --- Sustained rainfall saturation ---
  if (wettest && wettest.rain5dMm > 200) {
    ideas.push({
      title: 'Slope Saturation Threshold Crossed',
      text: `${wettest.rain5dMm}mm forecast over five days at ${wettest.city}. Nepal's hill slopes fail on cumulative saturation rather than on any single day's rainfall, so landslide risk keeps climbing for days after the rain stops.`,
      type: 'prepare', confidence: 'Medium', horizon: 'days'
    });
  }

  // --- Extreme weather ---
  if (extremeAlerts > 0) {
    ideas.push({
      title: 'Extreme Weather Alert Active',
      text: `${extremeAlerts} station${extremeAlerts > 1 ? 's are' : ' is'} under an extreme-severity weather alert. Confirm against DHM's own bulletin before issuing district guidance — Atlas reads model output, not the national warning.`,
      type: 'respond', confidence: 'High', horizon: 'immediate'
    });
  }

  // --- Heat ---
  if (heatAlerts > 0) {
    ideas.push({
      title: 'Terai Heat Stress',
      text: `${heatAlerts} station${heatAlerts > 1 ? 's' : ''} at or above 40°C. Heat casualties in the Terai concentrate among outdoor workers and the elderly, and district health posts see the load a day or two behind the peak.`,
      type: 'prepare', confidence: 'Medium', horizon: 'days'
    });
  }

  // --- Fire ---
  if (thermalTotal > 500) {
    ideas.push({
      title: 'Active Fire Season',
      text: `${thermalTotal.toLocaleString()} thermal detections nationwide${nightBurning > 20 ? `, including ${nightBurning} overnight — fires running unchecked past dark` : ''}. Expect smoke to degrade valley air quality and reduce visibility at hill airstrips.`,
      type: 'watch', confidence: 'High', horizon: 'days'
    });
  }

  // --- Air quality ---
  if (worstAqi > 150) {
    const fireDriven = thermalTotal > 500;
    ideas.push({
      title: fireDriven ? 'Fire-Driven Air Quality Emergency' : 'Air Quality Above Unhealthy Threshold',
      text: fireDriven
        ? `Peak AQI ${worstAqi} alongside ${thermalTotal.toLocaleString()} active thermal detections. Forest fire smoke, not just traffic and dust. School closure and flight disruption at Tribhuvan both become live possibilities.`
        : `Peak AQI ${worstAqi} across monitored cities. Valley inversion trapping particulates. Health system load rises with a few days' lag.`,
      type: fireDriven ? 'respond' : 'watch', confidence: fireDriven ? 'High' : 'Medium', horizon: 'days'
    });
  }

  // --- Event already under way, seen through district reporting ---
  const impact = V2.impact || { count: 0, topRegions: [] };
  if (impact.count >= 5) {
    const where = impact.topRegions.length
      ? impact.topRegions.map(r => `${r.region} (${r.count})`).join(', ')
      : 'no single district dominant';
    ideas.push({
      title: 'Reported Disaster Impact Under Way',
      text: `${impact.count} of the last ${V2.news?.length || 0} hazard headlines report casualties, missing persons, displacement or active rescue. Concentration: ${where}. Sensor layers describe conditions, not consequences — treat this as the live event and confirm scale with NDRRMA.`,
      type: 'respond', confidence: impact.count >= 12 ? 'High' : 'Medium', horizon: 'immediate'
    });
  }

  // --- Humanitarian response already under way ---
  if (activeDisasters > 0) {
    ideas.push({
      title: 'Declared Response Operations Active',
      text: `${activeDisasters} disaster${activeDisasters > 1 ? 's are' : ' is'} listed as active for Nepal on ReliefWeb. Cluster coordination is already standing, so new district requests should route through the existing operation rather than opening a parallel one.`,
      type: 'respond', confidence: 'High', horizon: 'weeks'
    });
  }

  return ideas.slice(0, 8);
}

// === Synthesize raw sweep data into dashboard format ===
export async function synthesize(data) {
  // === Seismic (USGS) ===
  const seismicData = data.sources.Seismic || {};
  const seismic = {
    totalEvents: seismicData.totalEvents || 0,
    events24h: seismicData.events24h || 0,
    events7d: seismicData.events7d || 0,
    maxMagnitude: seismicData.maxMagnitude ?? null,
    strongest: seismicData.strongest || null,
    byProvince: seismicData.byProvince || {},
    significant: (seismicData.significant || []).slice(0, 15),
    recent: (seismicData.recent || []).slice(0, 25).map(q => ({
      mag: q.mag, place: q.place, time: q.time, lat: q.lat, lon: q.lon,
      depthKm: q.depthKm, province: q.province
    })),
    signals: seismicData.signals || [],
  };

  // === Weather — monsoon, flood, landslide, heat ===
  const weatherData = data.sources.Weather || {};
  const weather = {
    monsoonSeason: Boolean(weatherData.monsoonSeason),
    totalAlerts: weatherData.totalSevereAlerts || 0,
    alerts: (weatherData.topAlerts || []).filter(a => a.lat != null && a.lon != null).slice(0, 12),
    signals: weatherData.signals || [],
    stations: (weatherData.stations || []).map(st => ({
      city: st.city, province: st.province, lat: st.lat, lon: st.lon,
      temperature: st.temperature, precipitation: st.precipitation,
      rain5dMm: st.rain5dMm, maxDailyRainMm: st.maxDailyRainMm
    })),
  };

  // === Wildfire (NASA FIRMS) ===
  const firmsData = data.sources.FIRMS || {};
  const fireRegions = (firmsData.hotspots || []).map(h => ({
    region: h.region, det: h.totalDetections || 0, night: h.nightDetections || 0,
    hc: h.highConfidence || 0,
    fires: (h.highIntensity || []).slice(0, 8).map(f => ({ lat: f.lat, lon: f.lon, frp: f.frp || 0 }))
  }));
  const fire = {
    status: firmsData.status || 'unavailable',
    fireSeason: Boolean(firmsData.fireSeason),
    totalDetections: firmsData.totalDetections || fireRegions.reduce((s, r) => s + r.det, 0),
    nightDetections: fireRegions.reduce((s, r) => s + r.night, 0),
    highConfidence: fireRegions.reduce((s, r) => s + r.hc, 0),
    regions: fireRegions,
    signals: firmsData.signals || [],
  };

  // === Air quality — wildfire smoke and valley inversion ===
  const aqData = data.sources.AirQuality || {};
  const airQuality = {
    totalReadings: aqData.totalReadings || 0,
    stations: (aqData.readings || []).slice(0, 10).map(r => ({
      location: r.location, province: r.state || r.province || null,
      lat: r.lat, lon: r.lon,
      pm25: r.pm25, aqi: r.aqi, band: r.band, severity: r.severity
    })),
    worst: aqData.worst || null,
    kathmandu: aqData.kathmandu || null,
    signals: aqData.signals || [],
  };

  // === Humanitarian response ===
  const rwData = data.sources.ReliefWeb || {};
  const relief = {
    disasters: (rwData.activeDisasters || []).slice(0, 10),
    reports: (rwData.latestReports || []).slice(0, 10),
    error: rwData.rwError || rwData.error || null,
  };

  const health = Object.entries(data.sources).map(([name, src]) => ({
    n: name, err: Boolean(src.error), stale: Boolean(src.stale)
  }));

  // Disaster-filtered RSS
  const news = await fetchAllNews();

  const V2 = {
    meta: data.atlas,
    seismic, weather, fire, airQuality, relief,
    health, news,
    impact: summarizeReportedImpact(news),
    newsFeed: buildNewsFeed(news),
    ideas: [], ideasSource: 'disabled',
  };

  return V2;
}

// === Unified News Feed for Ticker ===
function buildNewsFeed(rssNews) {
  // Nepali-language headlines stay in the feed — most first-hand hazard
  // reporting from the districts is published in Nepali first.
  const feed = rssNews.map(n => ({
    headline: n.title, source: n.source, type: 'rss',
    timestamp: n.date, region: n.region,
    urgent: /earthquake|भूकम्प|flood|बाढी|landslide|पहिरो|evacuat|rescue|उद्धार/i.test(n.title),
    url: n.url,
  }));

  // Filter to last 30 days, sort by timestamp descending, limit to 50
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recent = feed.filter(item => !item.timestamp || new Date(item.timestamp) >= cutoff);
  recent.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

  const selected = [];
  const selectedKeys = new Set();
  const keyFor = item => `${item.type}|${item.source}|${item.headline}|${item.timestamp}`;
  const pushUnique = item => {
    const key = keyFor(item);
    if (selectedKeys.has(key)) return;
    selected.push(item);
    selectedKeys.add(key);
  };

  for (const source of new Set(recent.map(item => item.source))) {
    recent.filter(item => item.source === source).slice(0, PER_SOURCE_RESERVE).forEach(pushUnique);
  }
  recent.forEach(pushUnique);
  return selected.slice(0, 50);
}

// === CLI Mode: print the synthesized hazard picture ===
async function cliSynthesize() {
  const data = JSON.parse(readFileSync(join(ROOT, 'runs/latest.json'), 'utf8'));
  console.log('Fetching disaster-filtered RSS feeds...');
  const V2 = await synthesize(data);
  V2.ideas = generateIdeas(V2);
  V2.ideasSource = V2.ideas.length ? 'rules' : 'disabled';

  console.log('\n--- Synthesis ---');
  console.log(
    'Quakes 7d:', V2.seismic.events7d,
    '| Weather alerts:', V2.weather.totalAlerts,
    '| Fire detections:', V2.fire.totalDetections,
    '| Peak AQI:', V2.airQuality.worst?.aqi ?? '--',
    '| Hazard news:', V2.news.length,
    '| Impact reports:', V2.impact.count,
    '| Reads:', V2.ideas.length
  );
  console.log(JSON.stringify(V2, null, 2));
}

// Run CLI if invoked directly
const isMain = process.argv[1]
  && fileURLToPath(import.meta.url).replace(/\\/g, '/') === process.argv[1].replace(/\\/g, '/');
if (isMain) {
  await cliSynthesize();
}
