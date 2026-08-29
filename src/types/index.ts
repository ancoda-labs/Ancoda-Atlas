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
  bulletinRescue?: BulletinRescue | null;
  portal?: RescuePortalStats | null;
  dailyBulletin?: FloodOfficialFeed<NdrrmaBulletin> | null;
  advisories?: FloodOfficialFeed<NationalAdvisory> | null;
  govEfforts?: FloodOfficialFeed<GovEffort> | null;
  portalContacts?: FloodOfficialFeed<PortalContact> | null;
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
  nationality: string | null;
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
  /** Inline base64 data-URI preview, or null. */
  thumb: string | null;
  /** Signed media-proxy path for the full image, or null. */
  imageProxy: string | null;
}

export interface OpmcmPersonRegister {
  lost: OpmcmPersonReport[];
  found: OpmcmPersonReport[];
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
  familiesEvacuated: number;
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
  value: number;
  /** Rendered after the number, e.g. the "+" in "13,248+". */
  suffix?: string;
  /**
   * True when this figure sits OUTSIDE its group's total — medical staff who
   * are not security personnel, helicopters that are not people. The flag is
   * what stops a reader, or a later edit, from adding it in.
   */
  exclusive?: boolean;
}

export interface SitrepHeadline extends Bilingual<'label'> {
  id: string;
  value: number;
  suffix?: string;
  tone: 'critical' | 'warning' | 'positive';
  source: string;
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
}

export interface SitrepNote extends Bilingual<'title'>, Bilingual<'body'> {
  id: string;
}

export interface SitrepNameList extends Bilingual<'label'> {
  id: string;
  value: number;
  /** Set when Atlas holds the actual names, so the card can link through. */
  href?: string;
}

/** A breakdown whose parts stopped adding up to its stated total. */
export interface SitrepDiscrepancy {
  id: string;
  stated: number;
  summed: number;
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
  /** NDRRMA national Daily Disaster Bulletin — newest first. */
  dailyBulletin: FloodOfficialFeed<NdrrmaBulletin> | null;
  /** NDRRMA press notes, for the Coverage page. */
  pressReleases: FloodOfficialFeed<NdrrmaNotice> | null;
  /** Standing NDRRMA public advisories. */
  advisories: FloodOfficialFeed<NationalAdvisory> | null;
  /** OPMCM government-effort log. */
  govEfforts: FloodOfficialFeed<GovEffort> | null;
  /** OPMCM emergency-contact directory. */
  portalContacts: FloodOfficialFeed<PortalContact> | null;
  /** OPMCM missing-and-found register. */
  opmcmPersons: OpmcmPersonRegister | null;
  /** OPMCM geolocated help requests, for the situation map. */
  helpRequests: FloodOfficialFeed<HelpRequest> | null;
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
