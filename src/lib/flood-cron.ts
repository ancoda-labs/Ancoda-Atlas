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
import type { FeedStatus, FloodDeskStore, NewsItem, OpmcmPersonRegister, OpmcmPersonReport } from '@/types';
import { errorMessage } from '@/types';

const DEFAULT_INTERVAL_MINUTES = 10;
const STORE_FILE = 'flood-desk.json';

/**
 * The shape of the persisted store.
 *
 * Bump this whenever a field in FloodDeskStore changes shape — a renamed key,
 * a new required sub-field, a list that gains a third bucket.
 *
 * Without it the restore below is a trap. It merges whatever is on disk over
 * the empty store, so a file written by an older build silently supplies an
 * older shape for a key the new code assumes it owns, and the first component
 * to read a field that did not exist then crashes the page. That is exactly how
 * the rescue page went down for a reader after the OPMCM register grew its
 * third list: the previous build's `{lost, found}` restored cleanly over a
 * shape that now also expects `other`.
 *
 * A mismatched file is discarded rather than migrated. The only cost is one
 * cold cycle after a deploy; the alternative is a page that throws — or, more
 * quietly, one that renders a field the restored rows simply do not have.
 *
 * v3 added `country` to the NDRRMA rescued-persons rows. A v2 store restores
 * cleanly without it, and the rescue table then prints "FOREIGN" beside a
 * hundred Indian nationals with no country against any of them — no error, no
 * warning, just a column that is silently blank.
 */
const STORE_VERSION = 3;

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
    portal: null,
    videos: null,
    news: [],
    dailyBulletin: null,
    pressReleases: null,
    advisories: null,
    govEfforts: null,
    portalContacts: null,
    opmcmPersons: null,
    helpRequests: null,
    officialContacts: null,
    featuredPhotos: null,
    popups: null,
    carousel: null,
    donationChannels: null,
    latestActivity: null,
    personPoints: null,
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
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  } catch (err) {
    console.warn(`[Flood cron] Failed to ensure runs directory exists: ${dir} (filesystem might be read-only)`, errorMessage(err));
  }
  return dir;
}

/** The last cycle's results. Never null — an unwarmed store is simply empty. */
export function getFloodStore(): FloodDeskStore {
  if (!g.__atlasFloodStore) {
    g.__atlasFloodStore = loadFromDisk() ?? emptyStore();
  }
  // The schedule is supposed to be started by instrumentation.ts. On the
  // deployed host it was not — every desk route answered while lastRunAt
  // stayed null — so the first read of the store starts it too. Idempotent,
  // and it returns before the cycle it kicks off finishes.
  startFloodCron();
  return g.__atlasFloodStore;
}

function loadFromDisk(): FloodDeskStore | null {
  try {
    const path = join(runsDir(), STORE_FILE);
    if (!existsSync(path)) return null;
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as FloodDeskStore & { version?: number };
    if (parsed.version !== STORE_VERSION) {
      console.log(
        `[Flood cron] Ignoring desk store written for shape v${parsed.version ?? 'unversioned'} ` +
          `(this build expects v${STORE_VERSION}) — starting cold`,
      );
      return null;
    }
    console.log('[Flood cron] Restored desk store from disk');
    return { ...emptyStore(), ...parsed };
  } catch (err) {
    console.warn('[Flood cron] Could not restore store:', errorMessage(err));
    return null;
  }
}

function persist(store: FloodDeskStore): void {
  try {
    writeFileSync(join(runsDir(), STORE_FILE), JSON.stringify({ ...store, version: STORE_VERSION }));
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
          // No `since` — the source resolves the event's start from the shared
          // scope, so the refresher and a direct call cannot disagree.
          return getCorridorIncidents();
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
        'portal',
        store,
        async () => {
          const { getRescuePortalStats } = await import('@/apis/sources/rescue-portal.mjs');
          const stats = await getRescuePortalStats();
          if (stats.error) throw new Error(stats.error);
          return stats;
        },
        value => {
          store.portal = value;
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

      refresh(
        'ndrrmaBulletin',
        store,
        async () => {
          const { getDailyBulletins } = await import('@/apis/sources/ndrrma-bulletin.mjs');
          const feed = await getDailyBulletins({ limit: 5 });
          if (feed.error && !feed.bulletins.length) throw new Error(feed.error);
          return {
            items: feed.bulletins.map(b => ({
              id: b.id,
              title: b.title,
              titleNe: b.titleNe,
              summary: b.summary,
              summaryNe: b.summaryNe,
              date: b.date,
              pdfUrl: b.pdfUrl,
              imageProxy: proxyUrlFor(b.image),
            })),
            error: feed.error,
            source: feed.source,
            fetchedAt: feed.fetchedAt,
          };
        },
        value => {
          store.dailyBulletin = value;
        },
      ),

      refresh(
        'ndrrmaNotices',
        store,
        async () => {
          const { getPressReleases, getNationalAdvisories } = await import('@/apis/sources/ndrrma-notices.mjs');
          const [press, adv] = await Promise.all([
            getPressReleases({ limit: 12 }),
            getNationalAdvisories(),
          ]);
          if (press.error && !press.items.length && adv.error && !adv.advisories.length) {
            throw new Error(press.error || adv.error);
          }
          store.pressReleases = {
            items: press.items.map(n => ({
              id: n.id,
              title: n.title,
              titleNe: n.titleNe,
              summary: n.summary,
              summaryNe: n.summaryNe,
              date: n.date,
              imageProxy: proxyUrlFor(n.image),
            })),
            error: press.error,
            source: press.source,
            fetchedAt: press.fetchedAt,
          };
          return { items: adv.advisories, error: adv.error, source: adv.source, fetchedAt: adv.fetchedAt };
        },
        value => {
          store.advisories = value;
        },
      ),

      refresh(
        'govEfforts',
        store,
        async () => {
          const { getGovernmentEfforts } = await import('@/apis/sources/rescue-portal.mjs');
          const feed = await getGovernmentEfforts({ limit: 20 });
          if (feed.error && !feed.items.length) throw new Error(feed.error);
          return feed;
        },
        value => {
          store.govEfforts = value;
        },
      ),

      refresh(
        'portalContacts',
        store,
        async () => {
          const { getEmergencyContacts } = await import('@/apis/sources/rescue-portal.mjs');
          const feed = await getEmergencyContacts({ limit: 50 });
          if (feed.error && !feed.items.length) throw new Error(feed.error);
          return feed;
        },
        value => {
          store.portalContacts = value;
        },
      ),

      refresh(
        'opmcmPersons',
        store,
        async () => {
          const { getPersonRegister } = await import('@/apis/sources/rescue-portal.mjs');
          const register = await getPersonRegister();
          if (register.error && !register.lost.length && !register.found.length) {
            throw new Error(register.error);
          }
          const withProxy = (list: typeof register.lost): OpmcmPersonReport[] =>
            list.map(({ image, ...rest }) => ({ ...rest, imageProxy: proxyUrlFor(image) }));
          return {
            lost: withProxy(register.lost),
            found: withProxy(register.found),
            other: withProxy(register.other),
            total: register.total,
            fetched: register.fetched,
            error: register.error,
            source: register.source,
            fetchedAt: register.fetchedAt,
          } satisfies OpmcmPersonRegister;
        },
        value => {
          store.opmcmPersons = value;
        },
      ),

      refresh(
        'helpRequests',
        store,
        async () => {
          const { getHelpRequestsMap } = await import('@/apis/sources/rescue-portal.mjs');
          const feed = await getHelpRequestsMap({ limit: 200 });
          if (feed.error && !feed.requests.length) throw new Error(feed.error);
          return { items: feed.requests, error: feed.error, source: feed.source, fetchedAt: feed.fetchedAt };
        },
        value => {
          store.helpRequests = value;
        },
      ),

      // The local government's own contact register. This is why the contacts
      // page no longer depends on one hand-typed district: BIPAD publishes the
      // list for every affected district and it moves when the portal does.
      refresh(
        'officialContacts',
        store,
        async () => {
          const { getDistrictContacts } = await import('@/apis/sources/bipad.mjs');
          const feed = await getDistrictContacts();
          if (feed.error && !feed.districts.length) throw new Error(feed.error);
          return { items: feed.districts, error: feed.error, source: feed.source, fetchedAt: feed.fetchedAt };
        },
        value => {
          store.officialContacts = value;
        },
      ),

      refresh(
        'personPoints',
        store,
        async () => {
          const { getPersonMapPoints } = await import('@/apis/sources/rescue-portal.mjs');
          const feed = await getPersonMapPoints({ limit: 200 });
          if (feed.error && !feed.points.length) throw new Error(feed.error);
          return { items: feed.points, error: feed.error, source: feed.source, fetchedAt: feed.fetchedAt };
        },
        value => {
          store.personPoints = value;
        },
      ),

      refresh(
        'portalLatest',
        store,
        async () => {
          const { getLatestActivity } = await import('@/apis/sources/rescue-portal.mjs');
          const feed = await getLatestActivity({ limit: 6 });
          if (feed.error && !feed.requests.length && !feed.offers.length) throw new Error(feed.error);
          return feed;
        },
        value => {
          store.latestActivity = value;
        },
      ),

      refresh(
        'portalCarousel',
        store,
        async () => {
          const { getCarousel } = await import('@/apis/sources/rescue-portal.mjs');
          const feed = await getCarousel();
          if (feed.error && !feed.items.length) throw new Error(feed.error);
          return {
            items: feed.items.map(({ image, ...rest }) => ({ ...rest, imageProxy: proxyUrlFor(image) })),
            error: feed.error,
            source: feed.source,
            fetchedAt: feed.fetchedAt,
          };
        },
        value => {
          store.carousel = value;
        },
      ),

      // The portal's donation channels. Kept in the store so the giving page can
      // show them beside — never inside — the reviewed accounts.
      refresh(
        'portalDonations',
        store,
        async () => {
          const { getDonationChannels } = await import('@/apis/sources/rescue-portal.mjs');
          const feed = await getDonationChannels({ limit: 12 });
          if (feed.error && !feed.items.length) throw new Error(feed.error);
          return {
            items: feed.items.map(({ qrImage, ...rest }) => ({ ...rest, qrProxy: proxyUrlFor(qrImage) })),
            error: feed.error,
            source: feed.source,
            fetchedAt: feed.fetchedAt,
          };
        },
        value => {
          store.donationChannels = value;
        },
      ),

      refresh(
        'ndrrmaMedia',
        store,
        async () => {
          const { getFeaturedPhotos, getWebsitePopups } = await import('@/apis/sources/ndrrma-notices.mjs');
          const [photos, popups] = await Promise.all([getFeaturedPhotos({ limit: 12 }), getWebsitePopups()]);
          if (photos.error && !photos.items.length && popups.error) throw new Error(photos.error);
          // An empty popup list is a real state — NDRRMA is not always raising
          // a notice — so it is stored rather than treated as a failed read.
          store.popups = {
            items: popups.items.map(({ image, ...rest }) => ({ ...rest, imageProxy: proxyUrlFor(image) })),
            error: popups.error,
            source: popups.source,
            fetchedAt: popups.fetchedAt,
          };
          return {
            items: photos.items.map(({ image, ...rest }) => ({ ...rest, imageProxy: proxyUrlFor(image) })),
            error: photos.error,
            source: photos.source,
            fetchedAt: photos.fetchedAt,
          };
        },
        value => {
          store.featuredPhotos = value;
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

  // The interval is armed BEFORE the first warm, and the order matters: the
  // warm calls getFloodStore(), which calls back into this function, and until
  // the timer exists the guard above lets that call straight through. Warming
  // first therefore recurses — it logged this line 1868 times before the
  // ordering was fixed.
  g.__atlasFloodTimer = setInterval(() => {
    runFloodRefresh().catch(err => console.error('[Flood cron] Cycle failed:', errorMessage(err)));
  }, minutes * 60 * 1000);

  // Do not hold the process open on this timer alone.
  g.__atlasFloodTimer.unref?.();

  runFloodRefresh().catch(err => console.error('[Flood cron] Initial cycle failed:', errorMessage(err)));
}

export function stopFloodCron(): void {
  if (g.__atlasFloodTimer) {
    clearInterval(g.__atlasFloodTimer);
    g.__atlasFloodTimer = null;
  }
}
