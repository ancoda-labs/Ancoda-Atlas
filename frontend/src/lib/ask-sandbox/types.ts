/** Closed map side-channel. Unknown actions are dropped, not forwarded. */
export type ViewAction =
  | { focus: 'district'; id: string }
  | { focus: 'gauge'; id: string }
  | { focus: 'corridor' }
  | { highlight: 'districts'; ids: string[]; metric: 'deaths' | 'uncontacted' }
  | null;

export type AskIntent =
  | 'figures'
  | 'worst_districts'
  | 'uncontacted'
  | 'gauges'
  | 'district'
  | 'funds'
  | 'news'
  | 'helplines'
  // The dashboard's hazards, not only the flood desk's. The widget sits on
  // every page, so a question about an earthquake must not be answered with
  // the flood desk's death toll.
  | 'earthquake'
  | 'air_quality'
  | 'wildfire'
  | 'weather'
  | 'climate'
  | 'landslide'
  | 'rescue_person'
  | 'safety_advice'
  | 'prediction'
  | 'faq'
  | 'other';

export type AskToolName =
  | 'get_figures'
  | 'get_gauges'
  | 'get_district'
  | 'search_news'
  | 'get_relief_funds'
  | 'get_faq'
  | 'get_seismic'
  | 'get_air_quality'
  | 'get_fire'
  | 'get_weather'
  | 'get_climate';

export interface AskToolCall {
  name: AskToolName;
  args?: Record<string, string>;
}

export interface AskCitation {
  source: string;
  as_of: string | null;
  url?: string;
}

export interface AskSnapshot {
  sitrepAsOf: string | null;
  sitrepAsOfLabelEn: string | null;
  sitrepAsOfLabelNe: string | null;
  sitrepSources: AskCitation[];
  discrepancies: Array<{ id: string; stated: number; summed: number }>;
  headlines: Array<{
    id: string;
    value: number;
    suffix?: string;
    label_en?: string;
    label_ne?: string;
    source: string;
    live?: boolean;
  }>;
  breakdowns: Array<{
    id: string;
    total: number;
    title_en?: string;
    items: Array<{ label_en?: string; label_ne?: string; value: number }>;
  }>;
  gauges: Array<{
    id: number;
    label: string;
    district: string;
    level: string;
    waterLevel: number | null;
    warningLevel: number | null;
    dangerLevel: number | null;
    measuredAt: string | null;
    stale: boolean;
  }>;
  gaugesFetchedAt: string | null;
  pathPoints: Array<{
    id: string;
    name_en: string;
    name_ne?: string;
    district_en?: string;
    lat: number;
    lng: number;
    status: string;
    notes_en?: string;
  }>;
  funds: Array<{ id: string; name: string; url: string; last_verified?: string }>;
  helplines: Array<{ number: string; label_en?: string; primary: boolean }>;
  news: Array<{ title: string; source: string; link: string; pubDate: string }>;
  newsFetchedAt: string | null;
}

export interface AskTurnResult {
  kind: 'ok' | 'refused' | 'quota' | 'disabled';
  /** The classifier's verdict, so a refusal is legible without reading prose. */
  intent: AskIntent;
  /** Set when the answer could not be written in the language asked for. */
  fellBackFrom?: string | null;
  translated?: boolean;
  liveRefresh?: boolean;
  answer: string;
  /**
   * Desk-composed en/ne text before any carry. The flood panel keeps this as
   * `source` so switching language later retranslates the original, not a
   * translation of a translation.
   */
  source?: string;
  /** The language the answer is actually written in — any registry code. */
  lang: string;
  view: ViewAction;
  tools: AskToolCall[];
  citations: AskCitation[];
  model: string | null;
  usedModel: boolean;
  usage: { inputTokens: number; outputTokens: number };
  remaining: { hour: number; globalHour: number };
}
