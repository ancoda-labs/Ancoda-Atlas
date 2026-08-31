import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Parent ~/package-lock.json is outside this repo; pin Turbopack to the app root.
  turbopack: {
    root,
  },
  serverExternalPackages: ['discord.js', 'minio'],
  reactStrictMode: true,
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
