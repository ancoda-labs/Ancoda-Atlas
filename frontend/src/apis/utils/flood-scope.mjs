// What "this flood" means, in one place.
//
// Three facts define the desk's scope: when the event started, which districts
// it covers, and the box the corridor sits in. They were previously typed into
// four files that disagreed with each other — the incident window was
// 2026-08-25 in the BIPAD source and 2026-08-20 in both callers, so the same
// question asked through the refresher and through the source module returned
// different answers, and the district list existed in three lengths (nine in
// the contacts reader, seven in the ground-report form, five in a content file
// nothing rendered).
//
// This is deliberately configuration and not a live feed. No portal publishes
// "the districts affected by the Rasuwa flood" as data — the district list is
// an editorial judgement about scope, and deriving it from whichever districts
// happen to have logged an incident in the last hour would make the map and the
// contact list flicker as the register moves. Editing it here changes it
// everywhere at once, which is the property that was missing.

/**
 * The day the flood began, as the incident window's lower bound.
 *
 * Every BIPAD query and every caller resolves against this. Override with
 * FLOOD_EVENT_START to re-point the desk at a different event without touching
 * code.
 */
export const EVENT_START = process.env.FLOOD_EVENT_START || '2026-08-20';

/**
 * The districts along the flood's course, with the ids BIPAD files them under.
 *
 * Rasuwa down the Trishuli to the Narayani, plus the downstream districts the
 * toll is reported for. Ids come from bipadportal.gov.np/api/v1/district/.
 */
export const AFFECTED_DISTRICTS = [
  { id: 23, en: 'Rasuwa', ne: 'रसुवा' },
  { id: 25, en: 'Nuwakot', ne: 'नुवाकोट' },
  { id: 26, en: 'Dhading', ne: 'धादिङ' },
  { id: 24, en: 'Sindhupalchok', ne: 'सिन्धुपाल्चोक' },
  { id: 44, en: 'Gorkha', ne: 'गोरखा' },
  { id: 43, en: 'Tanahu', ne: 'तनहुँ' },
  { id: 35, en: 'Chitwan', ne: 'चितवन' },
  { id: 481, en: 'Nawalparasi East', ne: 'नवलपरासी पूर्व' },
  { id: 482, en: 'Nawalparasi West', ne: 'नवलपरासी पश्चिम' },
];

/**
 * A point inside each district, for pins that only know a name — a news
 * headline, a photo tagged with a district rather than a GPS fix. These are
 * district centres, not places the water reached; anything placed from this
 * table must be drawn as approximate.
 */
export const DISTRICT_PINS = {
  Rasuwa:            { lat: 28.1167, lon: 85.3000 },
  Nuwakot:           { lat: 27.9167, lon: 85.1667 },
  Dhading:           { lat: 27.8667, lon: 84.9000 },
  Sindhupalchok:     { lat: 27.9500, lon: 85.6833 },
  Gorkha:            { lat: 28.0000, lon: 84.6333 },
  Tanahu:            { lat: 27.9500, lon: 84.2500 },
  Chitwan:           { lat: 27.5833, lon: 84.5000 },
  'Nawalparasi East': { lat: 27.6700, lon: 84.1400 },
  'Nawalparasi West': { lat: 27.5300, lon: 83.6700 },
};

// Longer needles first so "Nawalparasi East" wins over "Nawalparasi".
const PIN_NEEDLES = [
  ['nawalparasi east', 'nawalparasi purba', 'east nawalparasi', 'नवलपरासी पूर्व', 'nawalpur', 'नवलपुर', 'Nawalparasi East'],
  ['nawalparasi west', 'nawalparasi paschim', 'west nawalparasi', 'नवलपरासी पश्चिम', 'Nawalparasi West'],
  ['sindhupalchok', 'sindhupalchowk', 'सिन्धुपाल्चोक', 'Sindhupalchok'],
  ['nuwakot', 'नुवाकोट', 'betrawati', 'बेत्रावती', 'Nuwakot'],
  ['dhading', 'धादिङ', 'galchhi', 'घल्छी', 'krishna bhir', 'कृष्णभीर', 'Dhading'],
  ['gorkha', 'गोरखा', 'ghyalchok', 'घ्याल्चोक', 'Gorkha'],
  ['tanahu', 'tanahun', 'तनहुँ', 'Tanahu'],
  ['chitwan', 'चितवन', 'narayanghat', 'नारायणगढ', 'Chitwan'],
  ['rasuwa', 'रसुवा', 'timure', 'तिमुरे', 'syaphrubesi', 'स्याफ्रु', 'bhotekoshi', 'bhote koshi', 'भोटेकोशी', 'Rasuwa'],
].map(([...needles]) => {
  const district = needles[needles.length - 1];
  return { district, needles: needles.slice(0, -1) };
});

/**
 * The district a headline or caption is talking about, if it names one we
 * cover. Returns a pin at that district's centre — approximate, never a claim
 * that the photograph was taken at those coordinates.
 */
export function districtPinForText(text) {
  if (!text) return null;
  const hay = ` ${String(text).toLowerCase()} `;
  for (const rule of PIN_NEEDLES) {
    if (rule.needles.some(n => hay.includes(n))) {
      const pin = DISTRICT_PINS[rule.district];
      if (!pin) return null;
      return { district: rule.district, lat: pin.lat, lon: pin.lon };
    }
  }
  return null;
}

/**
 * The corridor as a bounding box.
 *
 * BIPAD's own `district` filter is unreliable on the incident endpoint, so an
 * incident's membership is decided from its coordinates: the Trishuli catchment
 * from the Tibet border down to the Narayani confluence.
 */
export const CORRIDOR_BBOX = { minLat: 27.4, maxLat: 28.6, minLon: 84.3, maxLon: 85.9 };

/** True when a coordinate falls inside the corridor. */
export function inCorridor(lat, lon) {
  if (lat == null || lon == null) return false;
  return (
    lat >= CORRIDOR_BBOX.minLat && lat <= CORRIDOR_BBOX.maxLat &&
    lon >= CORRIDOR_BBOX.minLon && lon <= CORRIDOR_BBOX.maxLon
  );
}
