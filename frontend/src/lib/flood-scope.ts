/**
 * What "this flood" means, for the browser.
 *
 * The authoritative copy is backend/app/domains/flood/scope.py. This is the
 * subset the UI needs directly: the district list the report form offers, and
 * the pin a headline naming a district gets on the map.
 *
 * These are an editorial judgement about the scope of a response, not a live
 * feed — no portal publishes "the districts affected by the Rasuwa flood" as
 * data. Editing them means editing the backend's copy too.
 */

export interface AffectedDistrict {
  id: number;
  en: string;
  ne: string;
}

/** Rasuwa down the Trishuli to the Narayani, plus the downstream districts the
 *  toll is reported for. Ids are BIPAD's. */
export const AFFECTED_DISTRICTS: AffectedDistrict[] = [
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

/** District centres, for pins that only know a name. Approximate — these are
 *  centres, not places the water reached. */
export const DISTRICT_PINS: Record<string, { lat: number; lon: number }> = {
  Rasuwa: { lat: 28.1167, lon: 85.3 },
  Nuwakot: { lat: 27.9167, lon: 85.1667 },
  Dhading: { lat: 27.8667, lon: 84.9 },
  Sindhupalchok: { lat: 27.95, lon: 85.6833 },
  Gorkha: { lat: 28.0, lon: 84.6333 },
  Tanahu: { lat: 27.95, lon: 84.25 },
  Chitwan: { lat: 27.5833, lon: 84.5 },
  'Nawalparasi East': { lat: 27.67, lon: 84.14 },
  'Nawalparasi West': { lat: 27.53, lon: 83.67 },
};

// Longer needles first, so "Nawalparasi East" wins over "Nawalparasi".
const PIN_NEEDLES: Array<[string, string[]]> = [
  ['Nawalparasi East', ['nawalparasi east', 'nawalparasi purba', 'east nawalparasi', 'नवलपरासी पूर्व', 'nawalpur', 'नवलपुर']],
  ['Nawalparasi West', ['nawalparasi west', 'nawalparasi paschim', 'west nawalparasi', 'नवलपरासी पश्चिम']],
  ['Sindhupalchok', ['sindhupalchok', 'sindhupalchowk', 'सिन्धुपाल्चोक']],
  ['Nuwakot', ['nuwakot', 'नुवाकोट', 'betrawati', 'बेत्रावती']],
  ['Dhading', ['dhading', 'धादिङ', 'galchhi', 'घल्छी', 'krishna bhir', 'कृष्णभीर']],
  ['Gorkha', ['gorkha', 'गोरखा', 'ghyalchok', 'घ्याल्चोक']],
  ['Tanahu', ['tanahu', 'tanahun', 'तनहुँ']],
  ['Chitwan', ['chitwan', 'चितवन', 'narayanghat', 'नारायणगढ']],
  ['Rasuwa', ['rasuwa', 'रसुवा', 'timure', 'तिमुरे', 'syaphrubesi', 'स्याफ्रु', 'bhotekoshi', 'bhote koshi', 'भोटेकोशी']],
];

/**
 * The district a headline or caption names, as an approximate pin.
 *
 * Never a claim that something happened at those exact coordinates.
 */
export function districtPinForText(
  text: string | null | undefined,
): { district: string; lat: number; lon: number } | null {
  if (!text) return null;
  const hay = ` ${String(text).toLowerCase()} `;
  for (const [district, needles] of PIN_NEEDLES) {
    if (needles.some(n => hay.includes(n))) {
      const pin = DISTRICT_PINS[district];
      return pin ? { district, lat: pin.lat, lon: pin.lon } : null;
    }
  }
  return null;
}
