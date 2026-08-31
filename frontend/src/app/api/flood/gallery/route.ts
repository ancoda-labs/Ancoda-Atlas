import { NextResponse } from 'next/server';
import { getFloodStore } from '@/lib/flood-cron';
import { cacheFor, noStore } from '@/lib/http-cache';
import type { FloodOfficialFeed, NdrrmaPhoto, PortalCarouselPhoto } from '@/types';
import { errorMessage } from '@/types';

export const dynamic = 'force-dynamic';

// The two government photo feeds, for the Coverage page.
//
// One is the OPMCM rescue portal's own home-page carousel — photographs of this
// response, captioned in both languages by the people running it. The other is
// NDRRMA's featured gallery, which is national rather than flood-specific and is
// labelled that way on the page.
//
// Neither set is copied: every image is streamed from the government server at
// request time through the signed media proxy (lib/news-media.ts), the same way
// the newsroom photographs on that page are.

const CACHE_TTL_S = 600;

interface GalleryPayload {
  carousel: FloodOfficialFeed<PortalCarouselPhoto> | null;
  featured: FloodOfficialFeed<NdrrmaPhoto> | null;
  generatedAt: string;
}

export async function GET() {
  const store = getFloodStore();
  if (store.carousel || store.featuredPhotos) {
    const res = NextResponse.json({
      carousel: store.carousel,
      featured: store.featuredPhotos,
      generatedAt: store.lastRunAt || new Date().toISOString(),
    } satisfies GalleryPayload);
    res.headers.set('X-Atlas-Cache', 'cron');
    return cacheFor(res, { edge: CACHE_TTL_S });
  }

  // Cold start: the first request after a deploy, before a cycle has landed.
  try {
    const { getCarousel } = await import('@/apis/sources/rescue-portal.mjs');
    const { getFeaturedPhotos } = await import('@/apis/sources/ndrrma-notices.mjs');
    const { proxyUrlFor } = await import('@/lib/news-media');
    const [carousel, featured] = await Promise.all([getCarousel(), getFeaturedPhotos({ limit: 12 })]);
    const payload: GalleryPayload = {
      carousel: {
        items: carousel.items.map(({ image, ...rest }) => ({ ...rest, imageProxy: proxyUrlFor(image) })),
        error: carousel.error,
        source: carousel.source,
        fetchedAt: carousel.fetchedAt,
      },
      featured: {
        items: featured.items.map(({ image, ...rest }) => ({ ...rest, imageProxy: proxyUrlFor(image) })),
        error: featured.error,
        source: featured.source,
        fetchedAt: featured.fetchedAt,
      },
      generatedAt: new Date().toISOString(),
    };
    const empty = !payload.carousel?.items.length && !payload.featured?.items.length;
    const res = NextResponse.json(payload);
    return empty ? noStore(res) : cacheFor(res, { edge: CACHE_TTL_S });
  } catch (err) {
    const message = errorMessage(err);
    console.error('[Gallery API] Failed:', message);
    return noStore(
      NextResponse.json({ carousel: null, featured: null, generatedAt: new Date().toISOString() }, { status: 200 }),
    );
  }
}
