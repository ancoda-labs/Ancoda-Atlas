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
  /** How often the sweep repeats, in minutes. */
  refreshIntervalMinutes?: number;
  /** True while a sweep is running. */
  sweeping?: boolean;
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
  /** The outlet's own lead image, as they published it. Never copied by Atlas. */
  image?: string | null;
  /**
   * Same image, as a path on this server. Signed by the API route, because the
   * signing key is a server secret and must never reach the browser — a client
   * that could mint these would turn the proxy into an open one.
   */
  imageProxy?: string | null;
}

export interface NewsResponse {
  topic: string;
  window: string;
  mode: string;
  timestamp: string;
  count: number;
  items: NewsItem[];
}

/** One dashboard open: every hazard panel, one round trip. */
export interface NewsBundleResponse {
  window: string;
  timestamp: string;
  topics: Record<string, NewsResponse>;
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
  /** Where the desk checked that this organisation is running an appeal. */
  source_verification_url?: string;
  /** The date it was last checked against that source. */
  last_verified?: string;
}

export interface SourceRef {
  label: string;
  url: string;
}

export interface FloodContent {
  site: FloodSite | null;
  whatHappened: (Bilingual<'headline'> & { body_en?: string[]; body_ne?: string[]; sources?: SourceRef[] }) | null;
  alerts: (Bilingual<'note'> & { alerts?: FloodAlert[] }) | null;
  floodPath:
    | (Bilingual<'lead'> &
        Bilingual<'body'> & {
          points?: FloodPathPoint[];
          sources?: SourceRef[];
          /** The date the desk last checked this course against its source. */
          last_updated?: string;
        })
    | null;
  helplines: { lines?: FloodHelpline[]; source_url?: string } | null;
  bankAccounts: {
    funds?: FloodBankFund[];
    verification?: Bilingual<'note'> & { source_url?: string };
  } | null;
  districtContacts: {
    last_verified?: string | null;
    sources?: SourceRef[];
    districts?: FloodDistrictContacts[];
  } | null;
  sitrep: SitrepContent | null;
  /** Cash in the Prime Minister's fund, and pledges that must not be added to it. */
  reliefReceived: FloodReliefReceived | null;
  /** NDRRMA demand list and the warehouses that will take in-kind goods. */
  reliefNeeded: FloodReliefNeeded | null;
  /** Copernicus EMSR927 grading and the NEA 10 Bhadra notice. */
  damage: FloodDamageContent | null;
  funds: FloodOrg[];
}

/**
 * Emergency contacts for one district.
 *
 * `verified` gates rendering. An unverified district is not shown at all: a
 * phone number nobody has checked is worse than no number, because it sends
 * someone in trouble to a line that does not answer.
 */
export interface FloodDistrictContacts extends Bilingual<'name'> {
  id: string;
  verified?: boolean;
  contacts?: Array<Bilingual<'role'> & { number: string; note_en?: string; note_ne?: string }>;
}

export interface FloodDeskPayload extends FloodContent {
  river: RiverGauges;
  portal?: RescuePortalStats | null;
  /** BIPAD's corridor incident tally, for the live band on the overview. */
  corridor?: CorridorIncidents | null;
  /** NDRRMA's own rescued-persons totals. The register itself is served separately. */
  rescueSummary?: RescueSummary | null;
  /** When that register was last read, so the page can date the figure. */
  rescueFetchedAt?: string | null;
  dailyBulletin?: FloodOfficialFeed<NdrrmaBulletin> | null;
  advisories?: FloodOfficialFeed<NationalAdvisory> | null;
  govEfforts?: FloodOfficialFeed<GovEffort> | null;
  govUpdates?: FloodOfficialFeed<GovUpdate> | null;
  portalContacts?: FloodOfficialFeed<PortalContact> | null;
  popups?: FloodOfficialFeed<NdrrmaPopup> | null;
  /** When the ten-minute cycle last finished, and when the next one is due. */
  refreshedAt?: string | null;
  nextRefreshAt?: string | null;
  refreshIntervalMinutes?: number;
  /** True while a cycle is running, so the page can say so rather than
   *  reporting the previous cycle as overdue. */
  refreshing?: boolean;
  generatedAt: string;
}

// ─── Community ground reports ───────────────────────────────────────────────

/**
 * Where a photo's coordinates came from. Shown to the reader, because the four
 * are not equally trustworthy: EXIF is where the shutter fired, `device` is
 * where the sender was standing when they uploaded, and `district` is a whole
 * district's centre rather than a place.
 */
export type PhotoGeoSource = 'exif' | 'device' | 'district' | 'none';

export type PhotoStatus = 'published' | 'removed';

export interface FloodPhoto {
  id: string;
  /** Pre-signed and short-lived. Never persisted — see lib/storage.ts. */
  url: string;
  width: number | null;
  height: number | null;
  /** EXIF orientation 1–8, preserved so a stripped photo still renders upright. */
  orientation: number;
  lat: number | null;
  lon: number | null;
  geoSource: PhotoGeoSource;
  district: string | null;
  placeLabel: string | null;
  caption: string | null;
  contributor: string | null;
  takenAt: string | null;
  createdAt: string;
  reportCount: number;
}

/** The ground-report feed, or the reason there isn't one. */
export interface FloodPhotoFeed {
  enabled: boolean;
  photos: FloodPhoto[];
  /** Set when `enabled` is false: which piece of infrastructure is missing. */
  reason?: string;
}

export interface DigestSource {
  title: string;
  url: string;
  source: string;
}

export interface NewsDigest {
  id: string;
  /** ISO timestamps bounding the ten-minute window this brief covers. */
  bucketStart: string;
  bucketEnd: string;
  lang: 'en' | 'ne';
  headline: string;
  summary: string;
  bullets: string[];
  sources: DigestSource[];
  itemCount: number;
  /** 'llm' when a model wrote the brief, 'extractive' when Atlas listed headlines. */
  generator: 'llm' | 'extractive';
  model: string | null;
}

/**
 * One live brief over the current flood reporting, for the overview panel.
 *
 * Distinct from NewsDigest: that one is a stored ten-minute window, this one is
 * computed on demand and never persisted, so it works on a deployment with no
 * database.
 */
export interface FloodInsight {
  headline: string;
  summary: string;
  bullets: string[];
  sources: DigestSource[];
  itemCount: number;
  /**
   * 'llm' when a model wrote it, 'extractive' when Atlas listed headlines. The
   * live insights panel is always extractive: no model writes about the flood.
   */
  generator: 'llm' | 'extractive';
  /** The model that translated the brief, when one did. Never an author. */
  model: string | null;
  /**
   * True when a model carried this brief into the reader's language. The
   * headlines under it are then no longer the outlets' own words, and the
   * panel says so.
   */
  translated?: boolean;
  /** The language actually written, which may differ from the one requested. */
  lang: string;
  /**
   * Set when the requested language could not be written and Nepali was used
   * instead, so the panel can say so rather than mislabelling the text.
   */
  fellBackFrom?: string;
  generatedAt: string;
}

export interface FloodInsightFeed {
  insight: FloodInsight | null;
  /**
   * Whether an LLM is configured. It only ever translates here, so without one
   * the brief is limited to the languages the headlines arrive in — Nepali and
   * English — and the picker uses this to mark what it cannot deliver.
   */
  hasModel: boolean;
  reason?: string;
}

export interface NewsDigestFeed {
  enabled: boolean;
  lang: 'en' | 'ne';
  digests: NewsDigest[];
  reason?: string;
}

// ─── NDRRMA rescue register ─────────────────────────────────────────────────

export interface RescuePlace {
  id: number;
  title: string | null;
  titleNe: string | null;
  lat: number | null;
  lon: number | null;
}

/**
 * One named person on the government's rescue register.
 *
 * Every field is reproduced as NDRRMA publishes it. Nothing here is inferred:
 * a null is a blank on the official register, not a gap Atlas should fill.
 */
export interface RescuedPerson {
  id: number;
  name: string | null;
  nameNe: string | null;
  age: number | null;
  gender: string | null;
  /** 'nepali' or 'foreign', as the portal files it. */
  nationality: string | null;
  /** The country, for a foreign national. Null where the portal left it blank. */
  country: string | null;
  rescuedOn: string | null;
  rescuedAt: RescuePlace | null;
  stationedAt: RescuePlace | null;
  status: { id: number; title: string; titleNe: string | null } | null;
  remarks: string | null;
}

export interface RescueSummary {
  total: number;
  nepali: number;
  foreign: number;
  byStatus: Array<{ id: number; title: string; titleNe: string | null; count: number }>;
}

export interface RescueRegister {
  persons: RescuedPerson[];
  summary: RescueSummary | null;
  locations: { rescued: RescuePlace[]; stationed: RescuePlace[] };
  /** Lines NDRRMA publishes above the register itself. Empty if unread. */
  messages?: Array<{ title: string | null; titleNe: string | null }>;
  error: string | null;
  source: SourceRef;
  fetchedAt: string;
}

// ─── OPMCM rescue portal counters ───────────────────────────────────────────
//
// The Prime Minister's Office portal at rescue.opmcm.gov.np, where the public
// files missing persons, requests for help, and offers of help. These counters
// describe filings, not people — see src/apis/sources/rescue-portal.mjs — and
// are never merged with the NDRRMA register or the sitrep toll.

/** A counter as the portal published it. Null means it said nothing, not zero. */
export type PortalCount = number | null;

export interface RescuePortalStats {
  requests: {
    total: PortalCount;
    open: PortalCount;
    /** A severity flag, not a state: these are also counted under a state. */
    critical: PortalCount;
    inProgress: PortalCount;
    resolved: PortalCount;
    cancelled: PortalCount;
  };
  offers: {
    total: PortalCount;
    available: PortalCount;
    helping: PortalCount;
    completed: PortalCount;
    unavailable: PortalCount;
  };
  persons: {
    total: PortalCount;
    lost: PortalCount;
    /** Missing reports nobody has closed. Not a count of people still missing. */
    lostOpen: PortalCount;
    found: PortalCount;
    foundOpen: PortalCount;
    resolved: PortalCount;
    /** Every person report filed in the past day, missing and found together. */
    last24h: PortalCount;
    childrenMissing: PortalCount;
    elderlyMissing: PortalCount;
  };
  error: string | null;
  source: SourceRef;
  fetchedAt: string;
}

// ─── OPMCM / NDRRMA content feeds ───────────────────────────────────────────
//
// The official portals publish more than counters: NDRRMA's national daily
// bulletin and press notes, and the OPMCM portal's government-effort log,
// contact directory, missing-and-found register and geolocated help requests.
// All of it is national or portal-scoped context — shown under its own heading,
// never folded into the corridor sitrep. See src/apis/sources/ndrrma-*.mjs and
// src/apis/sources/rescue-portal.mjs.

export interface NdrrmaBulletin {
  id: number;
  title: string | null;
  titleNe: string | null;
  summary: string | null;
  summaryNe: string | null;
  date: string | null;
  pdfUrl: string | null;
  /** Signed media-proxy path, or null. */
  imageProxy: string | null;
}

export interface NdrrmaNotice {
  id: number;
  title: string | null;
  titleNe: string | null;
  summary: string | null;
  summaryNe: string | null;
  date: string | null;
  imageProxy: string | null;
}

export interface NationalAdvisory {
  id: number;
  title: string | null;
  titleNe: string | null;
  body: string | null;
  bodyNe: string | null;
  links: Array<{ name: string | null; link: string | null }>;
  numbers: Array<{ name: string | null; designation: string | null; number: string | null }>;
}

export interface GovEffort {
  id: string | null;
  title: string | null;
  titleNe: string | null;
  bodyEn: string | null;
  bodyNe: string | null;
  agency: string | null;
  district: string | null;
  province: string | null;
  link: string | null;
  createdAt: string | null;
}

/** The hazard topics the wire ranks against. Mirrors TOPIC_ORDER on the server. */
export type NewsTopic =
  | 'flood'
  | 'earthquake'
  | 'wildfire'
  | 'airquality'
  | 'climate'
  | 'weather'
  | 'relief';

export interface GovUpdateImage {
  filename: string | null;
  mimeType: string | null;
  /** Signed media-proxy path, or null. */
  imageProxy: string | null;
}

export interface GovUpdateDocument {
  filename: string | null;
  mimeType: string | null;
  url: string;
}

/**
 * One post from the Government of Nepal updates portal at nepal.gov.np.
 *
 * Hazard-filtered on the server — the feed carries every ministry, so an
 * administrative circular never reaches this list. A language the government
 * did not publish is null rather than a copy of the other one, so `title` and
 * `titleNe` are rarely both filled.
 */
export interface GovUpdate {
  id: string;
  title: string | null;
  titleNe: string | null;
  bodyEn: string | null;
  bodyNe: string | null;
  /** Which hazard the post is about, on the news wire's own topic scale. */
  topic: NewsTopic | null;
  /**
   * Whether the post is about this flood rather than a hazard elsewhere.
   * Decided in `flood/scope.py`: a national advisory that happens to list a
   * corridor district among twenty others is not corridor news.
   */
  corridor: boolean;
  /** The corridor district the post names, when it is about this flood. */
  district: string | null;
  /** The publishing ministry or office. The named official is not carried. */
  ministry: string | null;
  publishedAt: string | null;
  link: string;
  /** Frequently the substance itself: a photograph of a printed notice. */
  images: GovUpdateImage[];
  documents: GovUpdateDocument[];
}

export interface PortalContact {
  id: string | null;
  name: string | null;
  nameNe: string | null;
  organization: string | null;
  category: string | null;
  phones: string[];
  email: string | null;
  description: string | null;
  descriptionNe: string | null;
  district: string | null;
  isNationwide: boolean;
  available24x7: boolean;
}

export interface OpmcmPersonReport {
  id: string | null;
  type: string;
  name: string | null;
  age: string | null;
  gender: string | null;
  place: string | null;
  eventAt: string | null;
  description: string | null;
  status: string | null;
  daoStatus: string | null;
  daoOffice: string | null;
  origin: string | null;
  /** Signed media-proxy path for the full image, or null. */
  imageProxy: string | null;
}

/**
 * The portal's open missing-and-found register, in full.
 *
 * Every open report is carried, not a first page of them: this is the list a
 * family searches by name, and a search over the first two hundred of eight
 * thousand answers "not found" about someone who is on it.
 */
export interface OpmcmPersonRegister {
  lost: OpmcmPersonReport[];
  found: OpmcmPersonReport[];
  /** Rows the portal files under neither heading. Still somebody's relative. */
  other: OpmcmPersonReport[];
  /** What the portal states the register holds. */
  total: number | null;
  /** How many rows were actually read, so a short sweep is visible. */
  fetched: number;
  error: string | null;
  source: SourceRef;
  fetchedAt: string;
}

export interface HelpRequest {
  id: string | null;
  ref: string | null;
  title: string | null;
  problemType: string | null;
  helpTypes: string[];
  urgency: string | null;
  status: string | null;
  place: string | null;
  lat: number | null;
  lon: number | null;
}

/** A photograph NDRRMA features on its own site, with its bilingual caption. */
export interface NdrrmaPhoto {
  id: number;
  title: string | null;
  titleNe: string | null;
  description: string | null;
  descriptionNe: string | null;
  /** Signed media-proxy path, or null. */
  imageProxy: string | null;
}

/**
 * A notice NDRRMA raises over its own site — its current "read this first",
 * usually with the document it is pointing at.
 */
export interface NdrrmaPopup {
  id: string;
  title: string | null;
  titleNe: string | null;
  body: string | null;
  bodyNe: string | null;
  pdfUrl: string | null;
  imageProxy: string | null;
}

/** A photograph from the OPMCM portal's own home-page gallery. */
export interface PortalCarouselPhoto {
  id: string | null;
  altEn: string | null;
  altNe: string | null;
  order: number | null;
  createdAt: string | null;
  /** Signed media-proxy path, or null. */
  imageProxy: string | null;
}

/**
 * A donation channel as the OPMCM portal publishes it.
 *
 * Live, and therefore kept apart from the reviewed accounts on the giving page:
 * these are shown under the portal's name with a link back to it, never merged
 * into the hand-checked fund table.
 */
export interface PortalDonationChannel {
  id: string | null;
  title: string | null;
  organization: string | null;
  description: string | null;
  bankName: string | null;
  accountName: string | null;
  accountNumber: string | null;
  branch: string | null;
  swiftCode: string | null;
  walletName: string | null;
  walletId: string | null;
  /** Inline base64 QR, usable as an <img> src verbatim. */
  qrData: string | null;
  /** Signed media-proxy path, when the portal published a URL instead. */
  qrProxy: string | null;
  priority: number | null;
}

/** A request for help filed on the portal. No filer name or number is carried. */
export interface PortalHelpFiling {
  id: string | null;
  ref: string | null;
  title: string | null;
  description: string | null;
  problemType: string | null;
  helpTypes: string[];
  affectedCount: number | null;
  urgency: string | null;
  status: string | null;
  district: string | null;
  place: string | null;
  createdAt: string | null;
  lat: number | null;
  lon: number | null;
}

/** An offer of help filed on the portal. Individual volunteers stay anonymous. */
export interface PortalOfferFiling {
  id: string | null;
  ref: string | null;
  title: string | null;
  description: string | null;
  providerType: string | null;
  providerName: string | null;
  resourceTypes: string[];
  quantity: number | null;
  capacity: string | null;
  status: string | null;
  district: string | null;
  place: string | null;
  createdAt: string | null;
  lat: number | null;
  lon: number | null;
}

/** What has just been filed on the portal: asked for, and offered. */
export interface PortalActivity {
  requests: PortalHelpFiling[];
  offers: PortalOfferFiling[];
  error: string | null;
  source: SourceRef;
  fetchedAt: string;
}

/**
 * One missing-or-found report reduced to a map point.
 *
 * Only points inside Nepal survive the source module — the register's
 * coordinates are unreliable — and no photograph is carried.
 */
export interface PersonMapPoint {
  id: string | null;
  type: string | null;
  name: string | null;
  age: string | null;
  gender: string | null;
  eventAt: string | null;
  lat: number | null;
  lon: number | null;
}

/** One official the local government lists as reachable, per BIPAD. */
export interface BipadContact {
  id: number;
  name: string | null;
  position: string | null;
  phone: string | null;
  email: string | null;
  /** BIPAD's own flag for the district's disaster focal person. */
  drrFocal: boolean;
}

/** One affected district's live contact list, as BIPAD holds it. */
export interface BipadDistrictContacts {
  id: number;
  name: string;
  nameNe: string;
  contacts: BipadContact[];
}

export interface FloodOfficialFeed<T> {
  items: T[];
  error: string | null;
  source: SourceRef;
  fetchedAt: string;
}

// ─── BIPAD incident register ────────────────────────────────────────────────

export interface BipadHazard {
  id: number;
  title: string;
  titleNe: string | null;
  type: string | null;
  color: string | null;
  icon: string | null;
}

/**
 * Damage and casualties for one incident.
 *
 * `reported` is the field that matters. BIPAD writes an unfilled record as all
 * zeros, so without this flag "nobody was hurt" and "nobody has entered the
 * figures yet" are indistinguishable — and on a disaster page they must not be.
 */
export interface BipadLoss {
  id: number;
  deaths: number;
  missing: number;
  injured: number;
  affected: number;
  familiesAffected: number;
  familiesEvacuated: number;
  familiesRelocated: number;
  livestockLost: number;
  housesDestroyed: number;
  housesAffected: number;
  roadsDestroyed: number;
  bridgesDestroyed: number;
  electricityDestroyed: number;
  economicLoss: number;
  reported: boolean;
}

export interface BipadIncident {
  id: number;
  title: string | null;
  titleNe: string | null;
  incidentOn: string | null;
  reportedOn: string | null;
  streetAddress: string | null;
  hazard: number | null;
  lossId: number | null;
  /** BIPAD's provenance field: 'nepal_police', 'dhm', 'other'. */
  source: string | null;
  verified: boolean;
  lat: number | null;
  lon: number | null;
  loss?: BipadLoss | null;
  point?: { type: string; coordinates?: [number, number] } | null;
}

export interface BipadAlert {
  id: number;
  title: string | null;
  titleNe: string | null;
  description: string | null;
  source: string | null;
  startedOn: string | null;
  expireOn: string | null;
  referenceType: string | null;
  public: boolean;
  verified: boolean;
  lat: number | null;
  lon: number | null;
  point?: { type: string; coordinates?: [number, number] } | null;
}

/** Tally of what BIPAD holds for the corridor — never presented as the national toll. */
export interface CorridorTotals {
  incidentCount: number;
  incidentsWithFigures: number;
  /** Incidents logged with no damage figures entered. Shown, never silently summed as zero. */
  incidentsAwaitingFigures: number;
  deaths: number;
  missing: number;
  injured: number;
  affected: number;
  familiesAffected: number;
  familiesEvacuated: number;
  familiesRelocated: number;
  housesDestroyed: number;
  bridgesDestroyed: number;
  roadsDestroyed: number;
  economicLoss: number;
}

export interface CorridorIncidents {
  incidents: BipadIncident[];
  totals: CorridorTotals | null;
  error: string | null;
  source: SourceRef;
  fetchedAt: string;
}

// ─── Broadcast video ────────────────────────────────────────────────────────

/**
 * One piece of broadcast coverage. Atlas holds only the identifier and the
 * metadata YouTube publishes for it — playback happens in YouTube's own player,
 * so the outlet keeps its audience and Atlas stores no video.
 */
export interface FloodVideo {
  id: string;
  title: string;
  channel: string | null;
  channelUrl: string | null;
  thumbnail: string;
  url: string;
  embedUrl: string;
  publishedAt: string | null;
}

export interface VideoFeed {
  videos: FloodVideo[];
  live?: FloodVideo[];
  /** True when a YOUTUBE_API_KEY is configured and cross-channel search is live. */
  searchEnabled: boolean;
  error: string | null;
  fetchedAt: string;
}

// ─── SitRep figures ─────────────────────────────────────────────────────────
//
// The authoritative toll, from Nepal Police district reporting and NDRRMA
// situation reports. Held as reviewed content rather than fetched, because
// these numbers are compiled by hand from PDFs and briefings and must not
// change on the page without someone having looked at them.

export interface SitrepValue extends Bilingual<'label'>, Bilingual<'note'>, Bilingual<'detail'>, Bilingual<'unit'> {
  /** Stable key when the same figure is reused on the live tiles. */
  id?: string;
  value: number;
  /** Rendered after the number, e.g. the "+" in "13,248+". */
  suffix?: string;
  /**
   * True when this figure sits OUTSIDE its group's total — medical staff who
   * are not security personnel, helicopters that are not people. The flag is
   * what stops a reader, or a later edit, from adding it in.
   */
  exclusive?: boolean;
  /** True when a scrape currently supplies this figure. Shown as a pulse, not the word "live". */
  live?: boolean;
}

export interface SitrepHeadline extends Bilingual<'label'>, Bilingual<'unit'> {
  id: string;
  value: number;
  suffix?: string;
  /** Printed before the number, e.g. the "~" in "~450". */
  approximate?: boolean;
  tone: 'critical' | 'warning' | 'positive';
  source: string;
  /** True when the Rasuwa flood bulletin scrape currently overlays this tile. */
  live?: boolean;
}

/**
 * Cash received into the Prime Minister's Disaster Relief Fund, and parallel
 * pledges that the source keeps apart from that total.
 */
export interface FloodReliefReceived {
  as_of?: string;
  as_of_label_en?: string;
  as_of_label_ne?: string;
  sources?: SourceRef[];
  headline?: SitrepHeadline[];
  breakdowns?: SitrepBreakdown[];
  /** Pledges, in-kind cargo and other collections that are not the PM fund. */
  exclusive?: SitrepValue[];
  discrepancies?: SitrepDiscrepancy[];
}

/** One line on the NDRRMA in-kind demand list. */
export interface ReliefNeedItem extends Bilingual<'label'>, Bilingual<'detail'>, Bilingual<'unit'> {
  id: string;
  value?: number;
  /** True when the source published the item with no quantity. */
  unspecified?: boolean;
}

export interface ReliefNeedGroup extends Bilingual<'title'> {
  id: string;
  items: ReliefNeedItem[];
}

export interface ReliefWarehouseContact extends Bilingual<'name'> {
  phone: string;
}

export interface ReliefWarehouse extends Bilingual<'name'> {
  id: string;
  contacts: ReliefWarehouseContact[];
}

/**
 * What NDRRMA is still asking for, and the warehouses that will take it.
 *
 * Separate from the cash in the Prime Minister's fund: tents are not rupees.
 */
export interface FloodReliefNeeded extends Bilingual<'warehouse_note'> {
  as_of?: string;
  as_of_label_en?: string;
  as_of_label_ne?: string;
  sources?: SourceRef[];
  headline?: SitrepHeadline[];
  groups?: ReliefNeedGroup[];
  warehouses?: ReliefWarehouse[];
}

export interface SitrepBreakdown
  extends Bilingual<'title'>, Bilingual<'caption'>, Bilingual<'do_not_merge'> {
  id: string;
  total: number;
  suffix?: string;
  tone: 'critical' | 'warning' | 'positive';
  items: SitrepValue[];
  /** Figures shown beside the group but deliberately outside its total. */
  aside?: SitrepValue[];
  /**
   * Set when the items overlap rather than partition the total, so the
   * reconciliation check must not treat a difference as an error.
   */
  no_total_check?: boolean;
  /** True when this group currently comes from the bulletin scrape. */
  live?: boolean;
}

export interface SitrepNote extends Bilingual<'title'>, Bilingual<'body'> {
  id: string;
}

export interface SitrepNameList extends Bilingual<'label'> {
  id: string;
  value: number;
  /** Set when Atlas holds the actual names, so the card can link through. */
  href?: string;
  /** True when a scrape currently supplies this row. */
  live?: boolean;
}

/** A breakdown whose parts stopped adding up to its stated total. */
export interface SitrepDiscrepancy {
  id: string;
  stated: number;
  summed: number;
}

/**
 * One class in the Copernicus EMSR927 AOI01 grading table.
 *
 * `affected` is the published total for the class, not a re-sum. 433 is all
 * buildings; 392 is residential inside that — they are never added.
 */
export interface DamageGradeRow extends Bilingual<'label'>, Bilingual<'unit'> {
  id: string;
  group: 'hazard' | 'people' | 'buildings' | 'transport' | 'facilities' | 'landcover';
  destroyed?: number | null;
  damaged?: number | null;
  possible?: number | null;
  affected?: number | null;
  aoi?: number | null;
  /** Share as the source printed it, e.g. "77.5%". Not recomputed. */
  share?: string | null;
  approximate?: boolean;
}

export interface NeaPlant extends Bilingual<'name'>, Bilingual<'remarks'> {
  id: string;
  mw: number;
  /** True only when the NEA notice marked the plant as directly affected. */
  hit: boolean;
}

/**
 * A Copernicus product map or an AOI ground photograph from the bulletin.
 *
 * `lat`/`lon` on photographs are the reviewed flood-path pin for the place
 * the caption names, not GPS of the shutter. Maps have no coordinates —
 * Copernicus does not publish this AOI as a live GeoJSON feed.
 */
export interface DamageImage extends Bilingual<'caption'> {
  id: string;
  kind: 'overview' | 'detail' | 'infographic' | 'photo';
  src: string;
  imageProxy?: string | null;
  alt?: string;
  href?: string;
  lat?: number;
  lon?: number;
  place_id?: string;
}

/**
 * Copernicus EMSR927 Syapru Besi grading and the NEA 10 Bhadra notice.
 *
 * The bulletin compilation is scraped for the Copernicus table; the NEA
 * plants stay reviewed — that notice does not move every cycle.
 */
export interface FloodDamageContent {
  as_of?: string;
  as_of_label_en?: string;
  as_of_label_ne?: string;
  sources?: SourceRef[];
  copernicus?: {
    title_en?: string;
    title_ne?: string;
    lead_en?: string;
    lead_ne?: string;
    note_en?: string;
    note_ne?: string;
    portal_url?: string;
    headline?: SitrepHeadline[];
    rows?: DamageGradeRow[];
    /** EMSR927 grading maps reprinted by the bulletin. */
    maps?: DamageImage[];
    /** Syabrubesi / Timure photographs from the same compilation. */
    photos?: DamageImage[];
  };
  power?: {
    title_en?: string;
    title_ne?: string;
    body_en?: string;
    body_ne?: string;
    note_en?: string;
    note_ne?: string;
    foot_en?: string;
    foot_ne?: string;
    listed_mw?: number;
    affected_mw?: number;
    phones?: string[];
    plants?: NeaPlant[];
    uncontacted?: SitrepValue;
    langtang_staff?: SitrepValue;
  };
}

/**
 * Live Copernicus grading from the Rasuwa flood bulletin's damage page.
 *
 * Overlay onto reviewed damage; a failed read, or a scrape whose building
 * arithmetic does not close, leaves the reviewed figures standing.
 */
export interface BulletinDamage {
  rows: DamageGradeRow[];
  headline: SitrepHeadline[];
  maps?: DamageImage[];
  photos?: DamageImage[];
  asOfLabelEn: string | null;
  asOfLabelNe: string | null;
  error: string | null;
  source: SourceRef;
  fetchedAt: string;
}

/**
 * The headline figures as the Rasuwa flood bulletin currently states them.
 *
 * Same shape as the reviewed breakdowns it stands in for, so the overview
 * renders either without knowing which it got. Empty with an error set means
 * the scrape failed and the reviewed figures should stay on the page.
 */
export interface BulletinSitrep {
  breakdowns: SitrepBreakdown[];
  /** The bulletin's own dateline, e.g. "14 Bhadra". */
  asOfLabelEn: string | null;
  asOfLabelNe: string | null;
  error: string | null;
  source: SourceRef;
  fetchedAt: string;
}

export interface SitrepContent {
  as_of?: string;
  as_of_label_en?: string;
  as_of_label_ne?: string;
  sources?: SourceRef[];
  headline?: SitrepHeadline[];
  breakdowns?: SitrepBreakdown[];
  infrastructure?: Bilingual<'title'> & { items?: SitrepValue[] };
  notes?: SitrepNote[];
  name_lists?: Bilingual<'title'> & Bilingual<'do_not_merge'> & { lists?: SitrepNameList[] };
  missing_found?: Bilingual<'title'> &
    Bilingual<'do_not_merge'> & {
      missing?: SitrepNameList[];
      found?: SitrepNameList[];
      found_total?: number;
    };
  /**
   * Filled in at load. Empty when every breakdown reconciles; any entry means
   * a hand edit broke the arithmetic and the page says so rather than
   * publishing a total its own parts contradict.
   */
  discrepancies?: SitrepDiscrepancy[];
}

// ─── Scheduled refresh ──────────────────────────────────────────────────────

/** How one upstream fared on the last refresh cycle. */
export interface FeedStatus {
  /** Source key, e.g. "rescue" or "videos". */
  key: string;
  ok: boolean;
  /** ISO time of the last cycle in which this source answered. */
  lastSuccess: string | null;
  lastAttempt: string | null;
  error: string | null;
  durationMs: number | null;
}

/** The refresher's view of the desk, served to routes instead of a cold fetch. */
export interface FloodDeskStore {
  river: RiverGauges | null;
  corridor: CorridorIncidents | null;
  alerts: BipadAlert[];
  rescue: RescueRegister | null;
  portal: RescuePortalStats | null;
  videos: VideoFeed | null;
  news: NewsItem[];
  /**
   * Live corridor toll from the Rasuwa flood bulletin. Overlay onto reviewed
   * sitrep; a failed read leaves the reviewed figures standing.
   */
  sitrep: BulletinSitrep | null;
  /**
   * Live Copernicus EMSR927 table from the bulletin's damage page. Overlay
   * onto reviewed damage; a failed read leaves the reviewed figures standing.
   */
  damage: BulletinDamage | null;
  /** NDRRMA national Daily Disaster Bulletin — newest first. */
  dailyBulletin: FloodOfficialFeed<NdrrmaBulletin> | null;
  /** NDRRMA press notes, for the Coverage page. */
  pressReleases: FloodOfficialFeed<NdrrmaNotice> | null;
  /** Standing NDRRMA public advisories. */
  advisories: FloodOfficialFeed<NationalAdvisory> | null;
  /** OPMCM government-effort log. */
  govEfforts: FloodOfficialFeed<GovEffort> | null;
  /** Hazard-scoped ministry posts from the nepal.gov.np updates portal. */
  govUpdates: FloodOfficialFeed<GovUpdate> | null;
  /** OPMCM emergency-contact directory. */
  portalContacts: FloodOfficialFeed<PortalContact> | null;
  /** OPMCM missing-and-found register. */
  opmcmPersons: OpmcmPersonRegister | null;
  /** OPMCM geolocated help requests, for the situation map. */
  helpRequests: FloodOfficialFeed<HelpRequest> | null;
  /** Live district contact lists from BIPAD, for the contacts page. */
  officialContacts: FloodOfficialFeed<BipadDistrictContacts> | null;
  /** NDRRMA's featured photographs. */
  featuredPhotos: FloodOfficialFeed<NdrrmaPhoto> | null;
  /** NDRRMA's site-wide notice — its current "read this first". */
  popups: FloodOfficialFeed<NdrrmaPopup> | null;
  /** The OPMCM portal's own home-page photographs. */
  carousel: FloodOfficialFeed<PortalCarouselPhoto> | null;
  /** Donation channels as the OPMCM portal publishes them, live. */
  donationChannels: FloodOfficialFeed<PortalDonationChannel> | null;
  /** The portal's newest filings — help asked for, and help offered. */
  latestActivity: PortalActivity | null;
  /** The OPMCM missing-and-found register as map points. */
  personPoints: FloodOfficialFeed<PersonMapPoint> | null;
  health: FeedStatus[];
  lastRunAt: string | null;
  nextRunAt: string | null;
  intervalMinutes: number;
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
  /** Optional. Absent means the flood desk's community sections hide themselves. */
  database: { url: string | null; secretKey: string | null };
  storage: {
    endpoint: string | null;
    publicEndpoint: string | null;
    accessKey: string | null;
    secretKey: string | null;
    secure: boolean;
    bucket: string;
    region: string;
    presignedExpirySeconds: number;
  };
  community: { ipSalt: string | null; adminToken: string | null };
  floodRefresh: { intervalMinutes: number; token: string | null };
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
  complete(
    system: string,
    user: string,
    opts?: { maxTokens?: number; timeout?: number; json?: boolean },
  ): Promise<{ text: string }>;
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

// ─── BIPAD Datasets ─────────────────────────────────────────────────────────

export interface BipadRiverStation {
  id: number;
  title?: string;
  waterLevel?: number | null;
  warningLevel?: number | null;
  dangerLevel?: number | null;
  waterLevelOn?: string | null;
  steady?: string | null;
  image?: string | null;
  point?: { type: string; coordinates?: [number, number] } | null;
  province?: number;
}

export interface BipadRainAverage {
  interval: number;
  value: number | null;
  status: {
    danger: boolean;
    warning: boolean;
  };
}

export interface BipadRainStation {
  id: number;
  title?: string;
  measuredOn?: string | null;
  point?: { type: string; coordinates?: [number, number] } | null;
  averages?: BipadRainAverage[];
  status?: string | null;
  province?: number;
}

export interface BipadEarthquake {
  id: number;
  magnitude?: number | null;
  address?: string | null;
  eventOn?: string | null;
  point?: { type: string; coordinates?: [number, number] } | null;
  depth?: number | null;
  province?: number;
}

export interface BipadPayload {
  riverStations: BipadRiverStation[];
  rainStations: BipadRainStation[];
  alerts: BipadAlert[];
  incidents: BipadIncident[];
  earthquakes: BipadEarthquake[];
}

// ─── Climate context ────────────────────────────────────────────────────────

export type ClimateMetricId =
  | 'cumulative_1750'
  | 'cumulative_1850'
  | 'annual_latest'
  | 'per_capita'
  | 'consumption';

export interface ClimateMetricRow {
  id: string;
  labelEn: string;
  labelNe: string;
  value: number;
}

export interface ClimateMetric {
  id: ClimateMetricId;
  year: number;
  unit: 'pct' | 'mt' | 't';
  nameEn: string;
  nameNe: string;
  captionEn: string | null;
  captionNe: string | null;
  scaleCaptionEn: string | null;
  scaleCaptionNe: string | null;
  rows: ClimateMetricRow[];
  scaleRows: ClimateMetricRow[];
}

export interface ClimateEmissions {
  year: number | null;
  defaultMetric: ClimateMetricId;
  metrics: Partial<Record<ClimateMetricId, ClimateMetric>>;
  error: string | null;
  stale: boolean;
  source: SourceRef & { datasetUrl?: string; attribution?: string };
  fetchedAt: string | null;
  lastAttemptAt: string | null;
}

export interface ClimateFact {
  id: string;
  statementEn: string;
  statementNe: string;
  organisation: string | null;
  published: string | null;
  url: string;
  /** Signed Atlas media proxy; raw upstream URL never leaves the API. */
  imageProxy?: string | null;
  imageAltEn?: string | null;
  imageAltNe?: string | null;
  imageCreditEn?: string | null;
  imageCreditNe?: string | null;
}

export interface ClimateArrivedHazard {
  id: string;
  labelEn: string;
  labelNe: string;
  incidents: number[];
  deaths: Array<number | null>;
  affected: Array<number | null>;
  deathsRecords: number[];
  affectedRecords: number[];
}

export interface ClimateArrived {
  years: number[];
  hazards: ClimateArrivedHazard[];
  windowStart: number | null;
  windowEnd: number | null;
  truncated: boolean;
  error: string | null;
  stale: boolean;
  source: SourceRef;
  fetchedAt: string | null;
  lastAttemptAt: string | null;
}

export interface ClimateSectionCopy {
  headlineEn?: string | null;
  headlineNe?: string | null;
  captionEn?: string | null;
  captionNe?: string | null;
  truncatedEn?: string | null;
  truncatedNe?: string | null;
  percent?: number;
  fromYear?: number;
  toYear?: number;
  factId?: string;
  china?: number;
  nepal?: number;
  india?: number;
}

export interface ClimateSection {
  titleEn: string | null;
  titleNe: string | null;
  standfirstEn: string | null;
  standfirstNe: string | null;
  ice: ClimateSectionCopy | null;
  lakes: ClimateSectionCopy | null;
  arrived: ClimateSectionCopy | null;
  cause: ClimateSectionCopy | null;
  news: ClimateSectionCopy | null;
}

export interface ClimatePanelFlag {
  enabled: boolean;
  todo: string | null;
}

/** A ministry post, quoted as published. Atlas does not paraphrase these. */
export interface ClimateStatement {
  id: string;
  title: string | null;
  titleNe: string | null;
  bodyEn: string | null;
  bodyNe: string | null;
  ministry: string | null;
  publishedAt: string | null;
  link: string;
  needleId?: string | null;
  /** True when Atlas supplied English because the government published none. */
  translated?: boolean;
}

export interface ClimateContextPayload {
  emissions: ClimateEmissions;
  arrived: ClimateArrived;
  facts: ClimateFact[];
  statements: ClimateStatement[];
  section: ClimateSection;
  panels: Record<'heat' | 'water' | 'air' | 'fire', ClimatePanelFlag>;
  disclaimerEn: string | null;
  disclaimerNe: string | null;
  generatedAt: string;
}
