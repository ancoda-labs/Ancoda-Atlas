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
