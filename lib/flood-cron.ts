// The ten-minute refresh for the flood desk.
//
// Every live source behind /bhotekoshi-flood is pulled on a schedule rather
// than on a reader's request. Two reasons, and the second is the important one:
//
//   Speed. A cold request used to mean waiting on BIPAD, NDRRMA, YouTube's
//   oEmbed endpoint and half a dozen RSS feeds in series. Now the page is served
//   from whatever the last cycle produced.
//
//   Survivability. Government portals go down hardest exactly when a disaster
//   makes everyone load them at once. Because each source keeps its last good
//   result, an upstream outage degrades to slightly older figures with an
//   honest timestamp, instead of an empty page. A failed source never
//   overwrites good data with nothing.
//
// The cycle is deliberately not transactional: sources are refreshed
// independently and one failing has no effect on the others.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { fetchCorridorGauges } from './flood';
import { proxyUrlFor } from './news-media';
import { scheduleCatchup } from './news-digest-store';
import type { FeedStatus, FloodDeskStore, NewsItem } from './types';
import { errorMessage } from './types';

const DEFAULT_INTERVAL_MINUTES = 10;
const STORE_FILE = 'flood-desk.json';

function intervalMinutes(): number {
  const raw = Number(process.env.FLOOD_REFRESH_INTERVAL_MINUTES);
  // Below a couple of minutes this would hammer government portals during the
  // exact event that has everyone else hammering them too.
  return Number.isFinite(raw) && raw >= 2 ? raw : DEFAULT_INTERVAL_MINUTES;
}

function emptyStore(): FloodDeskStore {
  return {
    river: null,
    corridor: null,
    alerts: [],
    rescue: null,
    family: null,
    bulletinRescue: null,
    videos: null,
    news: [],
    health: [],
    lastRunAt: null,
    nextRunAt: null,
    intervalMinutes: intervalMinutes(),
  };
}

interface CronGlobal {
  __atlasFloodStore?: FloodDeskStore;
  __atlasFloodTimer?: NodeJS.Timeout | null;
  __atlasFloodRunning?: boolean;
}
const g = globalThis as unknown as CronGlobal;

function runsDir(): string {
  const dir = join(process.cwd(), 'runs');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/** The last cycle's results. Never null — an unwarmed store is simply empty. */
export function getFloodStore(): FloodDeskStore {
  if (!g.__atlasFloodStore) {
    g.__atlasFloodStore = loadFromDisk() ?? emptyStore();
  }
  return g.__atlasFloodStore;
}

function loadFromDisk(): FloodDeskStore | null {
  try {
    const path = join(runsDir(), STORE_FILE);
    if (!existsSync(path)) return null;
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as FloodDeskStore;
    console.log('[Flood cron] Restored desk store from disk');
    return { ...emptyStore(), ...parsed };
  } catch (err) {
    console.warn('[Flood cron] Could not restore store:', errorMessage(err));
    return null;
  }
}

function persist(store: FloodDeskStore): void {
  try {
    writeFileSync(join(runsDir(), STORE_FILE), JSON.stringify(store));
  } catch (err) {
    // Losing the on-disk copy costs a cold start, not correctness.
    console.warn('[Flood cron] Could not persist store:', errorMessage(err));
  }
}

/**
 * Refresh one source, keeping the previous value if it fails.
 *
 * This is the whole resilience story in one function: `apply` runs only on
 * success, so a portal that has fallen over leaves yesterday's figures standing
 * with an honest `lastSuccess` beside them rather than blanking the section.
 */
async function refresh<T>(
  key: string,
  store: FloodDeskStore,
  load: () => Promise<T>,
  apply: (value: T) => void,
): Promise<FeedStatus> {
  const startedAt = Date.now();
  const attemptAt = new Date().toISOString();
  const previous = store.health.find(h => h.key === key);
  try {
    apply(await load());
    return {
      key,
      ok: true,
      lastSuccess: attemptAt,
      lastAttempt: attemptAt,
      error: null,
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    const message = errorMessage(err);
    console.error(`[Flood cron] ${key} failed:`, message);
    return {
      key,
      ok: false,
      lastSuccess: previous?.lastSuccess ?? null,
      lastAttempt: attemptAt,
      error: message,
      durationMs: Date.now() - startedAt,
    };
  }
}

/** Run one full cycle. Safe to call directly — the manual refresh route does. */
export async function runFloodRefresh(): Promise<FloodDeskStore> {
  if (g.__atlasFloodRunning) {
    console.log('[Flood cron] Cycle already in progress, skipping');
    return getFloodStore();
  }
  g.__atlasFloodRunning = true;
  const store = getFloodStore();
  const startedAt = Date.now();

  try {
    const health = await Promise.all([
      refresh('river', store, () => fetchCorridorGauges(), value => {
        store.river = value;
      }),

      refresh(
        'corridor',
        store,
        async () => {
          const { getCorridorIncidents } = await import('@/apis/sources/bipad.mjs');
          return getCorridorIncidents({ since: '2026-08-20' });
        },
        value => {
          store.corridor = value;
        },
      ),

      refresh(
        'alerts',
        store,
        async () => {
          const { getAlerts } = await import('@/apis/sources/bipad.mjs');
          return getAlerts({ limit: 40 });
        },
        value => {
          store.alerts = value;
        },
      ),

      refresh(
        'rescue',
        store,
        async () => {
          const { getRescueRegister } = await import('@/apis/sources/ndrrma.mjs');
          const register = await getRescueRegister();
          // A register that arrived empty with an error is a failed fetch, not
          // an emptied register — treat it as failure so the old one survives.
          if (register.error && register.persons.length === 0) throw new Error(register.error);
          return register;
        },
        value => {
          store.rescue = value;
        },
      ),

      refresh(
        'family',
        store,
        async () => {
          const { getFamilyRegister } = await import('@/apis/sources/family-register.mjs');
          const register = await getFamilyRegister();
          if (register.error) throw new Error(register.error);
          return register;
        },
        value => {
          store.family = value;
        },
      ),

      refresh(
        'bulletinRescue',
        store,
        async () => {
          const { getBulletinRescue } = await import('@/apis/sources/bulletin-rescue.mjs');
          const register = await getBulletinRescue();
          if (register.error) throw new Error(register.error);
          return register;
        },
        value => {
          store.bulletinRescue = value;
        },
      ),

      refresh(
        'videos',
        store,
        async () => {
          const { getFloodVideos } = await import('@/apis/sources/youtube.mjs');
          const feed = await getFloodVideos({ limit: 24 });
          if (!feed.videos.length && feed.error) throw new Error(feed.error);
          return feed;
        },
        value => {
          store.videos = value;
        },
      ),

      refresh(
        'news',
        store,
        async () => {
          const { fetchTopicNews } = await import('@/apis/sources/nepal-news.mjs');
          const data = await fetchTopicNews({ topic: 'flood', window: '48h', limit: 40, sourceCap: 8 });
          // Image URLs are signed here, on the server, where the key lives.
          const items: NewsItem[] = (data.items || []).map(item => ({
            ...item,
            imageProxy: proxyUrlFor(item.image),
          }));
          if (!items.length) throw new Error('no items');
          return items;
        },
        value => {
          store.news = value;
        },
      ),
    ]);

    store.health = health;
    store.lastRunAt = new Date().toISOString();
    store.intervalMinutes = intervalMinutes();
    store.nextRunAt = new Date(Date.now() + store.intervalMinutes * 60 * 1000).toISOString();

    // Digests write to Postgres on their own schedule and are deliberately not
    // awaited: a slow model must never hold up the rest of the cycle.
    scheduleCatchup();

    persist(store);

    const failed = health.filter(h => !h.ok);
    console.log(
      `[Flood cron] Cycle done in ${Date.now() - startedAt}ms — ` +
        `${health.length - failed.length}/${health.length} sources ok` +
        (failed.length ? ` (failed: ${failed.map(f => f.key).join(', ')})` : ''),
    );
    return store;
  } finally {
    g.__atlasFloodRunning = false;
  }
}

/** Start the schedule. Idempotent, so a hot reload does not stack timers. */
export function startFloodCron(): void {
  if (g.__atlasFloodTimer) return;
  const minutes = intervalMinutes();
  console.log(`[Flood cron] Starting — refreshing every ${minutes} minutes`);

  // Warm immediately, then settle into the interval.
  runFloodRefresh().catch(err => console.error('[Flood cron] Initial cycle failed:', errorMessage(err)));

  g.__atlasFloodTimer = setInterval(() => {
    runFloodRefresh().catch(err => console.error('[Flood cron] Cycle failed:', errorMessage(err)));
  }, minutes * 60 * 1000);

  // Do not hold the process open on this timer alone.
  g.__atlasFloodTimer.unref?.();
}

export function stopFloodCron(): void {
  if (g.__atlasFloodTimer) {
    clearInterval(g.__atlasFloodTimer);
    g.__atlasFloodTimer = null;
  }
}
