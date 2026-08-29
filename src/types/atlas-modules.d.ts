// Type declarations for the plain-ESM half of Atlas.
//
// The sweep pipeline (apis/, lib/**/*.mjs) is written in JavaScript on purpose:
// each source module runs standalone under bare node with no build step. That
// means TypeScript cannot see its types, and left to itself would infer `any`
// at every import. These declarations pin the boundary to the domain model in
// lib/types.ts, so a shape change in the pipeline surfaces as a type error in
// the UI rather than silently flowing through as `any`.

declare module '*/atlas.config.mjs' {
  import type { AtlasConfig } from '@/types';
  const config: AtlasConfig;
  export default config;
}

declare module '*/lib/synthesize.mjs' {
  import type { HazardRead, HazardSnapshot, HazardStory } from '@/types';

  export function synthesize(raw: unknown): Promise<HazardSnapshot>;
  export function generateIdeas(snapshot: HazardSnapshot): HazardRead[];
  export function fetchAllNews(): Promise<HazardStory[]>;
  export function summarizeReportedImpact(news: HazardStory[]): {
    count: number;
    topRegions: Array<{ region: string; count: number }>;
    headline: string | null;
  };
}

declare module '*/apis/briefing.mjs' {
  export function fullBriefing(): Promise<{
    atlas: import('@/types').SweepMeta;
    sources: Record<string, unknown>;
    errors: Array<{ name: string; error: string }>;
    timing: Record<string, { status: string; ms: number }>;
  }>;
  export function runSource(
    name: string,
    fn: (...args: unknown[]) => Promise<unknown>,
    ...args: unknown[]
  ): Promise<{ name: string; status: string; durationMs: number; data?: unknown; error?: string }>;
}

declare module '*/lib/delta/index.mjs' {
  import type { MemoryManagerLike } from '@/types';
  export const MemoryManager: new (runsDir: string) => MemoryManagerLike;
  export function computeDelta(
    current: unknown,
    previous: unknown,
    thresholdOverrides?: Record<string, unknown>,
  ): import('@/types').SweepDelta | null;
}

declare module '*/lib/llm/index.mjs' {
  import type { AtlasConfig, LLMProviderLike } from '@/types';
  export function createLLMProvider(cfg: AtlasConfig['llm']): LLMProviderLike | null;
}

declare module '*/lib/llm/ideas.mjs' {
  import type { HazardRead, HazardSnapshot, LLMProviderLike, SweepDelta } from '@/types';
  export function generateLLMIdeas(
    provider: LLMProviderLike,
    snapshot: HazardSnapshot,
    delta: SweepDelta | null,
    previousIdeas?: HazardRead[],
  ): Promise<HazardRead[] | null>;
}

declare module '*/lib/alerts/telegram.mjs' {
  import type { AlerterLike } from '@/types';
  export const TelegramAlerter: new (cfg: Record<string, unknown>) => AlerterLike;
}

declare module '*/lib/alerts/discord.mjs' {
  import type { AlerterLike } from '@/types';
  export const DiscordAlerter: new (cfg: Record<string, unknown>) => AlerterLike;
}

declare module '*/apis/sources/nepal-news.mjs' {
  import type { NewsResponse } from '@/types';
  export function fetchTopicNews(opts?: {
    topic?: string;
    window?: string;
    limit?: number;
    sourceCap?: number;
  }): Promise<NewsResponse>;
  export const SUPPORTED_TOPICS: Set<string>;
  export const SUPPORTED_WINDOWS: Set<string>;
  export const DEFAULT_TOPIC: string;
}

declare module '*/apis/utils/flood-scope.mjs' {
  /** The event's start date, the lower bound of every incident query. */
  export const EVENT_START: string;
  /** The districts the desk covers, with the ids BIPAD files them under. */
  export const AFFECTED_DISTRICTS: ReadonlyArray<{ id: number; en: string; ne: string }>;
  export const CORRIDOR_BBOX: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  export function inCorridor(lat: number | null, lon: number | null): boolean;
}

declare module '*/apis/utils/nepal.mjs' {
  export interface ProvinceBox {
    label: string;
    lamin: number;
    lomin: number;
    lamax: number;
    lomax: number;
    capital: string;
  }
  export interface CityPoint {
    label: string;
    lat: number;
    lon: number;
    province: string;
  }

  export const NEPAL_BBOX: { lamin: number; lomin: number; lamax: number; lomax: number };
  export const NEPAL_CENTER: { lat: number; lon: number };
  export const NEPAL_ISO: { alpha2: string; alpha3: string; numeric: number; name: string };
  export const SEISMIC_BBOX: { lamin: number; lomin: number; lamax: number; lomax: number };
  export const PROVINCES: Record<string, ProvinceBox>;
  export const CITIES: Record<string, CityPoint>;
  export const NEPAL_KEYWORDS: string[];

  export function inNepal(lat: number, lon: number): boolean;
  export function provinceOf(lat: number, lon: number): string | null;
  export function mentionsNepal(text: string): boolean;
}

declare module '*/lib/news-digest.mjs' {
  import type { LLMProviderLike, NewsItem } from '@/types';
  export interface DigestDraft {
    headline: string;
    summary: string;
    bullets: string[];
  }
  export const BUCKET_MINUTES: number;
  export function bucketStartFor(date: Date): Date;
  export function bucketEndFor(start: Date): Date;
  export function draftDigest(
    provider: LLMProviderLike | null,
    items: Array<Pick<NewsItem, 'title' | 'source'> & Partial<NewsItem>>,
    /** 'en' or 'ne' for the stored digests; any registry code for live insights. */
    lang: string,
    windowLabel?: string,
    /** The language's English name, for codes outside the module's own map. */
    languageName?: string | null,
  ): Promise<{ draft: DigestDraft; generator: 'llm' | 'extractive'; model: string | null }>;
  /** The brief with no model in it: the strongest headline and the distinct ones under it. */
  export function extractiveDigest(
    items: Array<Pick<NewsItem, 'title' | 'source'> & Partial<NewsItem>>,
    lang: string,
  ): DigestDraft;
  /** Carry a finished brief into another language, changing nothing else. */
  export function translateDigest(
    provider: LLMProviderLike | null,
    draft: DigestDraft,
    lang: string,
    languageName?: string | null,
  ): Promise<{ draft: DigestDraft; model: string | null; translated: boolean }>;
}

declare module '*/apis/sources/ndrrma.mjs' {
  import type { RescuePlace, RescuedPerson, RescueRegister, RescueSummary } from '@/types';
  export function getRescuedPersons(): Promise<RescuedPerson[]>;
  export function getRescueSummary(): Promise<RescueSummary>;
  export function getRescueLocations(): Promise<{ rescued: RescuePlace[]; stationed: RescuePlace[] }>;
  export function getRescueRegister(): Promise<RescueRegister>;
}

declare module '*/apis/sources/bipad.mjs' {
  import type { BipadAlert, BipadHazard, BipadIncident, CorridorIncidents } from '@/types';
  export const HAZARD: { FLOOD: number; LANDSLIDE: number; HEAVY_RAINFALL: number; THUNDERBOLT: number };
  export const CORRIDOR_BBOX: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  export function getHazards(): Promise<BipadHazard[]>;
  export function getIncidents(opts?: { hazard?: number; since?: string; corridorOnly?: boolean }): Promise<BipadIncident[]>;
  export function getAlerts(opts?: { limit?: number }): Promise<BipadAlert[]>;
  export function getCorridorIncidents(opts?: { since?: string }): Promise<CorridorIncidents>;
}

declare module '*/apis/sources/youtube.mjs' {
  import type { VideoFeed } from '@/types';
  export const DEFAULT_CHANNELS: Array<{ id: string; name: string }>;
  export function getFloodVideos(opts?: {
    channels?: Array<{ id: string; name: string }>;
    limit?: number;
    query?: string;
  }): Promise<VideoFeed>;
}

declare module '*/apis/sources/family-register.mjs' {
  import type { FamilyRegister } from '@/types';
  export function getFamilyRegister(): Promise<FamilyRegister>;
}

declare module '*/apis/sources/bulletin-rescue.mjs' {
  import type { BulletinRescue } from '@/types';
  export function getBulletinRescue(): Promise<BulletinRescue>;
}

declare module '*/apis/sources/bulletin-sitrep.mjs' {
  import type { BulletinSitrep } from '@/types';
  export function getBulletinSitrep(): Promise<BulletinSitrep>;
}

declare module '*/apis/sources/rescue-portal.mjs' {
  import type {
    GovEffort,
    HelpRequest,
    PortalContact,
    RescuePortalStats,
    SourceRef,
  } from '@/types';
  export function getRescuePortalStats(): Promise<RescuePortalStats>;
  export function getGovernmentEfforts(opts?: { limit?: number }): Promise<{
    items: GovEffort[];
    error: string | null;
    source: SourceRef;
    fetchedAt: string;
  }>;
  export function getEmergencyContacts(opts?: { limit?: number }): Promise<{
    items: PortalContact[];
    error: string | null;
    source: SourceRef;
    fetchedAt: string;
  }>;
  /** A person report as the portal published it; `image` is a raw upstream URL. */
  export interface PortalPersonRaw {
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
    thumb: string | null;
    image: string | null;
  }
  export function getPersonReports(opts: { type: 'lost' | 'found'; limit?: number }): Promise<{
    items: PortalPersonRaw[];
    error: string | null;
    source: SourceRef;
    fetchedAt: string;
  }>;
  export function getPersonRegister(): Promise<{
    lost: PortalPersonRaw[];
    found: PortalPersonRaw[];
    error: string | null;
    source: SourceRef;
    fetchedAt: string;
  }>;
  export function getHelpRequestsMap(opts?: { limit?: number }): Promise<{
    requests: HelpRequest[];
    error: string | null;
    source: SourceRef;
    fetchedAt: string;
  }>;
}

declare module '*/apis/sources/ndrrma-bulletin.mjs' {
  import type { SourceRef } from '@/types';
  export interface NdrrmaBulletinRaw {
    id: number;
    title: string | null;
    titleNe: string | null;
    summary: string | null;
    summaryNe: string | null;
    date: string | null;
    pdfUrl: string | null;
    image: string | null;
  }
  export function getDailyBulletins(opts?: { limit?: number }): Promise<{
    bulletins: NdrrmaBulletinRaw[];
    error: string | null;
    source: SourceRef;
    fetchedAt: string;
  }>;
}

declare module '*/apis/sources/ndrrma-notices.mjs' {
  import type { NationalAdvisory, SourceRef } from '@/types';
  export interface NdrrmaNoticeRaw {
    id: number;
    title: string | null;
    titleNe: string | null;
    summary: string | null;
    summaryNe: string | null;
    date: string | null;
    image: string | null;
  }
  export function getPressReleases(opts?: { limit?: number }): Promise<{
    items: NdrrmaNoticeRaw[];
    error: string | null;
    source: SourceRef;
    fetchedAt: string;
  }>;
  export function getNationalAdvisories(): Promise<{
    advisories: NationalAdvisory[];
    error: string | null;
    source: SourceRef;
    fetchedAt: string;
  }>;
}

