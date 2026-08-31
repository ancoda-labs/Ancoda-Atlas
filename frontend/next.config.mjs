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
    const api = (process.env.ATLAS_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '');
    return [
      { source: '/api/v1/:path*', destination: `${api}/api/v1/:path*` },
      // The live sweep stream. Not versioned — it is a stream, not a resource.
      { source: '/events', destination: `${api}/events` },
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
