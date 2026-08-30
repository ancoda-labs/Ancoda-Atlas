import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getFloodStore, runFloodRefresh } from '@/lib/flood-cron';
import { errorMessage } from '@/types';

export const dynamic = 'force-dynamic';

// Refresh status, and a manual trigger.
//
// GET  — how each upstream fared on the last cycle. Unauthenticated, because
//        knowing whether the figures on the page are twelve minutes old or two
//        hours old is not a secret; it is the first thing an operator needs.
// POST — run a cycle now. Behind FLOOD_REFRESH_TOKEN so an external scheduler
//        (systemd timer, Kubernetes CronJob, GitHub Actions) can drive it in a
//        deployment where the in-process timer is not wanted.

function tokenMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET() {
  const store = getFloodStore();
  return NextResponse.json({
    lastRunAt: store.lastRunAt,
    nextRunAt: store.nextRunAt,
    intervalMinutes: store.intervalMinutes,
    health: store.health,
    counts: {
      gauges: store.river?.gauges.length ?? 0,
      incidents: store.corridor?.incidents.length ?? 0,
      alerts: store.alerts.length,
      rescued: store.rescue?.persons.length ?? 0,
      videos: store.videos?.videos.length ?? 0,
      news: store.news.length,
      sitrep: store.sitrep?.breakdowns.length ?? 0,
      damage: store.damage?.rows.length ?? 0,
      damageMaps: store.damage?.maps?.length ?? 0,
      dailyBulletin: store.dailyBulletin?.items.length ?? 0,
      pressReleases: store.pressReleases?.items.length ?? 0,
      advisories: store.advisories?.items.length ?? 0,
      govEfforts: store.govEfforts?.items.length ?? 0,
      portalContacts: store.portalContacts?.items.length ?? 0,
      opmcmPersons: store.opmcmPersons?.fetched ?? 0,
      helpRequests: store.helpRequests?.items.length ?? 0,
      personPoints: store.personPoints?.items.length ?? 0,
      officialContacts: (store.officialContacts?.items ?? []).reduce((n, d) => n + d.contacts.length, 0),
      carousel: store.carousel?.items.length ?? 0,
      featuredPhotos: store.featuredPhotos?.items.length ?? 0,
      popups: store.popups?.items.length ?? 0,
      donationChannels: store.donationChannels?.items.length ?? 0,
      latestFilings:
        (store.latestActivity?.requests.length ?? 0) + (store.latestActivity?.offers.length ?? 0),
    },
  });
}

export async function POST(req: NextRequest) {
  const expected = process.env.FLOOD_REFRESH_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: 'refresh_token_not_configured', hint: 'Set FLOOD_REFRESH_TOKEN to enable external triggering.' },
      { status: 404 },
    );
  }

  const presented = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!presented || !tokenMatches(presented, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const store = await runFloodRefresh();
    return NextResponse.json({
      refreshed: true,
      lastRunAt: store.lastRunAt,
      health: store.health.map(h => ({ key: h.key, ok: h.ok, durationMs: h.durationMs })),
    });
  } catch (err) {
    console.error('[Flood refresh] Manual cycle failed:', errorMessage(err));
    return NextResponse.json({ error: 'refresh_failed' }, { status: 500 });
  }
}
