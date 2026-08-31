import type { ViewAction } from '@/lib/ask-sandbox/types';

const DISTRICT_IDS = new Set([
  'rasuwa',
  'nuwakot',
  'dhading',
  'chitwan',
  'gorkha',
  'tanahun',
  'nawalparasi east',
  'nawalparasi west',
  'makwanpur',
  'kathmandu',
]);

const NAME_TO_ID: Record<string, string> = {
  rasuwa: 'rasuwa',
  nuwakot: 'nuwakot',
  dhading: 'dhading',
  chitwan: 'chitwan',
  gorkha: 'gorkha',
  tanahun: 'tanahun',
  'nawalparasi east': 'nawalparasi east',
  'nawalparasi west': 'nawalparasi west',
  makwanpur: 'makwanpur',
  kathmandu: 'kathmandu',
  'नवलपरासी पूर्व': 'nawalparasi east',
  'नवलपरासी पश्चिम': 'nawalparasi west',
  चितवन: 'chitwan',
  नुवाकोट: 'nuwakot',
  रसुवा: 'rasuwa',
  धादिङ: 'dhading',
  गोरखा: 'gorkha',
  तनहुँ: 'tanahun',
};

export function districtIdFromLabel(label: string): string | null {
  const key = label.trim().toLowerCase();
  return NAME_TO_ID[key] || (DISTRICT_IDS.has(key) ? key : null);
}

export function displayNameForId(id: string): string {
  const map: Record<string, string> = {
    rasuwa: 'Rasuwa',
    nuwakot: 'Nuwakot',
    dhading: 'Dhading',
    chitwan: 'Chitwan',
    gorkha: 'Gorkha',
    tanahun: 'Tanahun',
    'nawalparasi east': 'Nawalparasi East',
    'nawalparasi west': 'Nawalparasi West',
    makwanpur: 'Makwanpur',
    kathmandu: 'Kathmandu',
  };
  return map[id] || id;
}

export function validateView(raw: unknown): ViewAction {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;
  if (v.focus === 'corridor') return { focus: 'corridor' };
  if (v.focus === 'district' && typeof v.id === 'string') {
    const id = districtIdFromLabel(v.id);
    return id ? { focus: 'district', id } : null;
  }
  if (v.focus === 'gauge' && typeof v.id === 'string') {
    return { focus: 'gauge', id: v.id.slice(0, 64) };
  }
  if (v.highlight === 'districts' && Array.isArray(v.ids)) {
    const ids = v.ids
      .filter((x): x is string => typeof x === 'string')
      .map(districtIdFromLabel)
      .filter((x): x is string => Boolean(x));
    const metric = v.metric === 'uncontacted' ? 'uncontacted' : 'deaths';
    return ids.length ? { highlight: 'districts', ids, metric } : null;
  }
  return null;
}

export function highlightNames(view: ViewAction): string[] {
  if (!view) return [];
  if ('focus' in view && view.focus === 'district') return [displayNameForId(view.id)];
  if ('highlight' in view && view.highlight === 'districts') return view.ids.map(displayNameForId);
  return [];
}
