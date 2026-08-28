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

declare module '*/lib/schema.mjs' {
  /** Idempotent DDL for the flood desk's community tables. */
  export const SCHEMA_SQL: string;
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
    lang: 'en' | 'ne',
    windowLabel?: string,
  ): Promise<{ draft: DigestDraft; generator: 'llm' | 'extractive'; model: string | null }>;
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

