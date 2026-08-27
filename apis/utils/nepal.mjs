// Nepal geography — single source of truth for every geo-scoped hazard source.
// Every bounding box, province and city in Atlas resolves back to this file.

// National bounding box (generous by ~0.2 deg so border districts are not clipped)
export const NEPAL_BBOX = { lamin: 26.3, lomin: 79.9, lamax: 30.6, lomax: 88.3 };

// Geographic centre, used for radius searches and default map framing
export const NEPAL_CENTER = { lat: 28.35, lon: 84.1 };

export const NEPAL_ISO = { alpha2: 'NP', alpha3: 'NPL', numeric: 524, name: 'Nepal' };

// The seven federal provinces. Boxes are approximate rectangles that together
// tile the country — good enough to bucket a lat/lon into a province.
export const PROVINCES = {
  koshi:      { label: 'Koshi',       lamin: 26.35, lomin: 86.5,  lamax: 28.15, lomax: 88.3,  capital: 'Biratnagar' },
  madhesh:    { label: 'Madhesh',     lamin: 26.3,  lomin: 84.8,  lamax: 27.35, lomax: 86.9,  capital: 'Janakpur' },
  bagmati:    { label: 'Bagmati',     lamin: 27.0,  lomin: 84.3,  lamax: 28.4,  lomax: 86.4,  capital: 'Hetauda' },
  gandaki:    { label: 'Gandaki',     lamin: 27.5,  lomin: 82.9,  lamax: 29.35, lomax: 85.2,  capital: 'Pokhara' },
  lumbini:    { label: 'Lumbini',     lamin: 27.3,  lomin: 81.4,  lamax: 29.0,  lomax: 84.4,  capital: 'Deukhuri' },
  karnali:    { label: 'Karnali',     lamin: 28.1,  lomin: 81.0,  lamax: 30.45, lomax: 83.6,  capital: 'Birendranagar' },
  sudurpashchim: { label: 'Sudurpashchim', lamin: 28.3, lomin: 79.9, lamax: 30.6, lomax: 81.8, capital: 'Godawari' },
};

// Population and administrative centres — the anchors for weather, air quality
// and news geo-tagging.
export const CITIES = {
  kathmandu:     { label: 'Kathmandu',     lat: 27.7172, lon: 85.3240, province: 'bagmati' },
  pokhara:       { label: 'Pokhara',       lat: 28.2096, lon: 83.9856, province: 'gandaki' },
  biratnagar:    { label: 'Biratnagar',    lat: 26.4525, lon: 87.2718, province: 'koshi' },
  birgunj:       { label: 'Birgunj',       lat: 27.0104, lon: 84.8770, province: 'madhesh' },
  bharatpur:     { label: 'Bharatpur',     lat: 27.6768, lon: 84.4360, province: 'bagmati' },
  butwal:        { label: 'Butwal',        lat: 27.7006, lon: 83.4484, province: 'lumbini' },
  nepalgunj:     { label: 'Nepalgunj',     lat: 28.0500, lon: 81.6167, province: 'lumbini' },
  dhangadhi:     { label: 'Dhangadhi',     lat: 28.6833, lon: 80.6000, province: 'sudurpashchim' },
  janakpur:      { label: 'Janakpur',      lat: 26.7288, lon: 85.9266, province: 'madhesh' },
  birendranagar: { label: 'Birendranagar', lat: 28.6000, lon: 81.6333, province: 'karnali' },
};

// Nepal sits on the Main Himalayan Thrust. The seismic source widens the
// national box to catch ruptures that shake Nepal from just across the border.
export const SEISMIC_BBOX = { lamin: 25.5, lomin: 79.0, lamax: 31.5, lomax: 89.5 };

export function inNepal(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return false;
  return lat >= NEPAL_BBOX.lamin && lat <= NEPAL_BBOX.lamax
      && lon >= NEPAL_BBOX.lomin && lon <= NEPAL_BBOX.lomax;
}

// Bucket a coordinate into a province key, or null if it falls outside Nepal.
export function provinceOf(lat, lon) {
  if (!inNepal(lat, lon)) return null;
  for (const [key, p] of Object.entries(PROVINCES)) {
    if (lat >= p.lamin && lat <= p.lamax && lon >= p.lomin && lon <= p.lomax) return key;
  }
  return null;
}

// Keyword set for filtering global text feeds (ReliefWeb, RSS) down to Nepal.
// Kept deliberately tight — "Everest" and "Himalaya" alone pull in too much
// Indian and Chinese coverage without a Nepal token present.
export const NEPAL_KEYWORDS = [
  'Nepal', 'Nepali', 'Nepalese', 'Kathmandu', 'Pokhara', 'Biratnagar', 'Birgunj',
  'Lalitpur', 'Bhaktapur', 'Janakpur', 'Butwal', 'Nepalgunj', 'Dhangadhi',
  'Chitwan', 'Lumbini', 'Terai', 'Madhesh', 'Koshi', 'Gandaki', 'Karnali',
  'Bagmati', 'Sudurpashchim', 'Sherpa', 'Solukhumbu', 'Mustang', 'Dolpa',
  'Rasuwa', 'Sindhupalchok', 'Gorkha', 'Rukum', 'Jajarkot',
];

export function mentionsNepal(text) {
  if (!text) return false;
  return NEPAL_KEYWORDS.some(k => text.includes(k));
}
