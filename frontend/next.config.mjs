import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Parent ~/package-lock.json is outside this repo; pin Turbopack to the app root.
  turbopack: {
    root,
  },
  reactStrictMode: true,

  /**
   * Proxy the API through this origin in development.
   *
   * With NEXT_PUBLIC_API_BASE_URL unset, config/axios.ts calls /api/v1 on the
   * frontend's own origin and these rewrites forward it to the API container.
   * Same-origin means no CORS preflight, which on a high-latency mobile
   * connection costs a full round trip before any request starts.
   *
   * In production the browser bundle is built with the public API hostname and
   * calls it directly, so these rewrites are a development convenience rather
   * than the deployed path.
   */
  async rewrites() {
    const fallbackApi =
      process.env.NODE_ENV === 'production'
        ? (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://api:8000')
        : 'http://localhost:8000';
    const api = (process.env.ATLAS_API_BASE_URL || fallbackApi).replace(/\/+$/, '');
    return [
      { source: '/api/v1/:path*', destination: `${api}/api/v1/:path*` },
      // The live sweep stream. Not versioned — it is a stream, not a resource.
      { source: '/events', destination: `${api}/events` },
      // Proxied images — gauge portraits and press photographs. The API mints
      // these paths itself and they land in an <img src>, not in an axios
      // call, so they never pass through API_BASE and cannot carry the
      // absolute host the bundle was built with. Unlike the two rewrites
      // above this one is load-bearing in production as well: without it
      // every station photo and every press thumbnail 404s on the frontend
      // origin. Kept apart from /api/v1 so only these two image routes are
      // reachable this way.
      { source: '/api/flood/station-photo', destination: `${api}/api/v1/flood/station-photo` },
      { source: '/api/flood/media/image', destination: `${api}/api/v1/flood/media/image` },
      { source: '/api/flood/insights', destination: `${api}/api/v1/flood/insights` },
    ];
  },
  async headers() {
    return [
      {
        // Admin outlines change only on deploy. Without this, Next's default
        // max-age=0 re-downloads several megabytes on every visit.
        source: '/data/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
