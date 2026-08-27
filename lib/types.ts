// Shared domain types for Ancoda Atlas.
//
// The sweep pipeline is written in plain ESM (apis/, lib/*.mjs) and cannot
// carry its own types, so this file is the single description of the shapes it
// produces. Anything crossing the boundary from a .mjs module into TypeScript
// gets a type here rather than an `any` at the call site.

// ─── Sweep metadata ─────────────────────────────────────────────────────────

export interface SweepMeta {
  version?: string;
  focus?: string;
  timestamp?: string;
  totalDurationMs?: number;
  sourcesQueried?: number;
  sourcesOk?: number;
  sourcesFailed?: number;
}

export interface SourceHealth {
  /** Source name, e.g. "Seismic". */
  n: string;
  /** The source failed outright. */
  err: boolean;
  /** The source answered, but from a fallback feed. */
  stale: boolean;
}

// ─── Seismic ────────────────────────────────────────────────────────────────

export interface Earthquake {
  mag: number | null;
  place: string | null;
  time?: string | null;
  lat?: number | null;
  lon?: number | null;
  depthKm: number | null;
  province?: string | null;
}

export interface SeismicLayer {
  totalEvents: number;
  events24h: number;
  events7d: number;
  maxMagnitude: number | null;
  strongest: Earthquake | null;
  byProvince: Record<string, number>;
  significant: Earthquake[];
  recent: Earthquake[];
  signals: string[];
}

// ─── Weather ────────────────────────────────────────────────────────────────

export type AlertSeverity = 'moderate' | 'severe' | 'extreme';

export interface WeatherAlert {
  event: string;
  severity: AlertSeverity;
  headline: string;
  lat: number;
  lon: number;
}

export interface WeatherStation {
  city: string;
  province: string | null;
  lat: number;
  lon: number;
  temperature: number | null;
  precipitation: number | null;
  rain5dMm: number;
  maxDailyRainMm: number;
}

export interface WeatherLayer {
  monsoonSeason: boolean;
  totalAlerts: number;
  alerts: WeatherAlert[];
  signals: string[];
  stations: WeatherStation[];
}

// ─── Fire ───────────────────────────────────────────────────────────────────

export interface FireDetection {
  lat: number;
  lon: number;
  frp: number;
}

export interface FireRegion {
  region: string;
  /** Total detections in the region. */
  det: number;
  /** Detections tagged as overnight. */
  night: number;
  /** High-confidence detections. */
  hc: number;
  fires: FireDetection[];
}

export interface FireLayer {
  status: 'active' | 'no_key' | 'unavailable';
  fireSeason: boolean;
  totalDetections: number;
  nightDetections: number;
  highConfidence: number;
  regions: FireRegion[];
  signals: string[];
}

// ─── Air quality ────────────────────────────────────────────────────────────

export interface AirQualityStation {
  location: string;
  province: string | null;
  lat: number | null;
  lon: number | null;
  pm25: number | null;
  aqi: number | null;
  band: string | null;
  severity?: string | null;
}

export interface AirQualityLayer {
  totalReadings: number;
  stations: AirQualityStation[];
  worst: AirQualityStation | null;
  kathmandu: AirQualityStation | null;
  signals: string[];
}

// ─── Humanitarian response ──────────────────────────────────────────────────

export interface ReliefDisaster {
  name?: string;
  title?: string;
  date?: string;
  countries?: string[];
  type?: string[];
  status?: string;
}

export interface ReliefReport {
  title?: string;
  date?: string;
  countries?: string[];
  disasterType?: string[];
  source?: string[] | string;
  url?: string | null;
}

export interface ReliefLayer {
  disasters: ReliefDisaster[];
  reports: ReliefReport[];
  /** Set when ReliefWeb is unavailable and HDX is answering instead. */
  error: string | null;
}

// ─── News ───────────────────────────────────────────────────────────────────

/** A geo-tagged hazard headline, as placed on the map. */
export interface HazardStory {
  title: string;
  source: string;
  date?: string;
  url?: string;
  lat: number;
  lon: number;
  region: string;
}

/** An item from the /api/news aggregator. */
export interface NewsItem {
  title: string;
  link: string;
  source: string;
  pubDate: string;
}

export interface NewsResponse {
  topic: string;
  window: string;
  mode: string;
  timestamp: string;
  count: number;
  items: NewsItem[];
}

export interface NewsFeedItem {
  headline: string;
  source: string;
  type: string;
  timestamp?: string;
  region: string;
  urgent: boolean;
  url?: string;
}

/** Impact read off the hazard news feed — the layer that sees a live event. */
export interface ReportedImpact {
  count: number;
  topRegions: Array<{ region: string; count: number }>;
  headline: string | null;
}

// ─── Reads and delta ────────────────────────────────────────────────────────

export interface HazardRead {
  title: string;
  /** Rule engine uses lowercase verbs; the LLM uses uppercase enums. */
  type: string;
  confidence: string;
  horizon?: string;
  /** Rule-engine reads carry `text`; LLM reads carry `rationale`. */
  text?: string;
  rationale?: string;
  ticker?: string;
  risk?: string;
  signals?: string[];
  source?: string;
}

export type ReadsSource = 'llm' | 'llm-failed' | 'rules' | 'disabled';

export interface DeltaSignal {
  key: string;
  label?: string;
  from?: number;
  to?: number;
  change?: number;
  pctChange?: number;
  direction?: 'up' | 'down' | 'resolved';
  severity?: 'moderate' | 'high' | 'critical';
  reason?: string;
}

export interface DeltaSummary {
  totalChanges: number;
  criticalChanges: number;
  direction: 'risk-off' | 'risk-on' | 'mixed';
  signalBreakdown: {
    new: number;
    escalated: number;
    deescalated: number;
    unchanged: number;
  };
}

export interface SweepDelta {
  timestamp: string;
  previous: string | null;
  signals: {
    new: DeltaSignal[];
    escalated: DeltaSignal[];
    deescalated: DeltaSignal[];
    unchanged: string[];
  };
  summary: DeltaSummary;
}

// ─── The synthesized payload the UI renders ─────────────────────────────────

export interface HazardSnapshot {
  meta: SweepMeta;
  seismic: SeismicLayer;
  weather: WeatherLayer;
  fire: FireLayer;
  airQuality: AirQualityLayer;
  relief: ReliefLayer;
  health: SourceHealth[];
  news: HazardStory[];
  impact: ReportedImpact;
  newsFeed: NewsFeedItem[];
  ideas: HazardRead[];
  ideasSource: ReadsSource;
  delta?: SweepDelta | null;
}

// ─── Flood desk ─────────────────────────────────────────────────────────────

export type GaugeLevel = 'danger' | 'warning' | 'normal' | 'unknown';

export interface FloodGauge {
  id: number;
  label: string;
  labelNe: string;
  district: string;
  districtNe: string;
  waterLevel: number | null;
  warningLevel: number | null;
  dangerLevel: number | null;
  level: GaugeLevel;
  trend: string | null;
  measuredAt: string | null;
  ageMinutes: number | null;
  stale: boolean;
  /** Percentage of the way to the danger mark, for the meter bar. */
  percentOfDanger: number | null;
  lat: number | null;
  lon: number | null;
  /** Proxy URL for the gauge's site photo. Not live flood imagery. */
  photo: string | null;
}

export interface RiverGauges {
  gauges: FloodGauge[];
  error: string | null;
  fetchedAt: string;
}

/** A record carrying both an English and a Nepali variant of some fields. */
export type Bilingual<K extends string> = {
  [P in `${K}_en` | `${K}_ne`]?: string;
};

export interface FloodSite extends Bilingual<'brand'>, Bilingual<'date_line'>, Bilingual<'kicker'>, Bilingual<'safety'> {
  id: string;
  report_contact_email?: string;
}

export interface FloodHelpline extends Bilingual<'label'> {
  id: string;
  number: string;
  primary: boolean;
}

export interface FloodAlert extends Bilingual<'title'>, Bilingual<'body'> {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  source: string;
  source_url: string;
}

export interface FloodFigure extends Bilingual<'label'>, Bilingual<'caption'>, Bilingual<'note'> {
  id: string;
  value: number;
  tone: 'critical' | 'warning' | 'positive';
}

export interface FloodReportedFigure extends Bilingual<'label'> {
  value: number;
  source: string;
  tone: 'critical' | 'warning' | 'positive';
}

export interface FloodPathPoint extends Bilingual<'name'>, Bilingual<'district'>, Bilingual<'notes'> {
  id: string;
  lat: number;
  lng: number;
  status: string;
}

export interface FloodBank extends Bilingual<'name'>, Bilingual<'qr_note'> {
  id: string;
  accounts: string[];
  swift?: string;
  currency?: string;
  qr: string | null;
  qr_payee?: string;
}

export interface FloodBankFund extends Bilingual<'name'> {
  id: string;
  banks: FloodBank[];
}

export interface FloodOrg extends Bilingual<'description'> {
  id: string;
  name: string;
  tier: number;
  url: string;
  status?: string;
  moderation?: string;
}

export interface SourceRef {
  label: string;
  url: string;
}

export interface FloodContent {
  site: FloodSite | null;
  keyFigures:
    | (Bilingual<'preliminary_note'> &
        Bilingual<'counts_conflict_note'> & {
          last_updated?: string;
          sources?: SourceRef[];
          figures?: FloodFigure[];
          latest_reported?: Bilingual<'caveat'> & { as_of?: string; items?: FloodReportedFigure[] };
        })
    | null;
  whatHappened: (Bilingual<'headline'> & { body_en?: string[]; body_ne?: string[]; sources?: SourceRef[] }) | null;
  alerts: (Bilingual<'note'> & { alerts?: FloodAlert[] }) | null;
  floodPath: (Bilingual<'lead'> & Bilingual<'body'> & { points?: FloodPathPoint[]; sources?: SourceRef[] }) | null;
  helplines: { lines?: FloodHelpline[]; source_url?: string } | null;
  bankAccounts: {
    funds?: FloodBankFund[];
    verification?: Bilingual<'note'> & { source_url?: string };
  } | null;
  affectedDistricts: { districts?: Array<Bilingual<'name'>> } | null;
  funds: FloodOrg[];
}

export interface FloodDeskPayload extends FloodContent {
  river: RiverGauges;
  generatedAt: string;
}

// ─── Runtime collaborators ──────────────────────────────────────────────────
//
// The sweeper drives four plain-ESM modules. These interfaces describe only the
// members TypeScript actually touches, so the .mjs modules stay the source of
// truth for their own behaviour.

export interface AtlasConfig {
  focus: { country: string; iso2: string; iso3: string; timezone: string };
  port: number;
  publicUrl: string | null;
  refreshIntervalMinutes: number;
  llm: { provider: string | null; apiKey: string | null; model: string | null; baseUrl: string | null };
  telegram: Record<string, unknown>;
  discord: Record<string, unknown>;
  delta?: { thresholds?: { numeric?: Record<string, number>; count?: Record<string, number> } };
}

export interface MemoryManagerLike {
  addRun(snapshot: HazardSnapshot): SweepDelta | null;
  getLastRun(): Partial<HazardSnapshot> | null;
  pruneAlertedSignals(): void;
}

export interface LLMProviderLike {
  readonly isConfigured: boolean;
  readonly name?: string;
  complete(system: string, user: string, opts?: { maxTokens?: number; timeout?: number }): Promise<{ text: string }>;
}

export interface AlerterLike {
  readonly isConfigured: boolean;
  evaluateAndAlert(
    provider: LLMProviderLike | null,
    delta: SweepDelta | null,
    memory: MemoryManagerLike,
  ): Promise<unknown>;
  sendActionableIdeas?(ideas: HazardRead[]): Promise<unknown>;
}

/** An SSE subscriber. The route supplies its own writer over the stream. */
export interface SseClient {
  write(payload: string): void;
}

export type BroadcastMessage =
  | { type: 'connected' }
  | { type: 'sweep_start'; timestamp: string }
  | { type: 'update'; data: HazardSnapshot };

/** Narrow an unknown catch binding to a readable message. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ─── GeoJSON (only the subset Atlas draws) ──────────────────────────────────

export interface PolygonGeometry {
  type: 'Polygon';
  /** Rings of [lon, lat] pairs. */
  coordinates: Array<Array<[number, number]>>;
}

export interface MultiPolygonGeometry {
  type: 'MultiPolygon';
  coordinates: Array<Array<Array<[number, number]>>>;
}

export type Geometry = PolygonGeometry | MultiPolygonGeometry;

export interface GeoFeature<P = Record<string, unknown>> {
  type: 'Feature';
  properties: P;
  geometry: Geometry;
}

export interface GeoCollection<P = Record<string, unknown>> {
  type: 'FeatureCollection';
  features: Array<GeoFeature<P>>;
}

export interface AffectedDistrictProps {
  name_en: string;
  name_ne: string;
  status: 'severe' | 'affected';
  province: string;
}
