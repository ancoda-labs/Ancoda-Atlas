/** @type {import('next').NextConfig} */
const nextConfig = {
  // Native canvas rasterizes official PDFs before Tarka OCR. Keep its platform
  // binary (and PDF.js, which loads it in Node) out of Turbopack's ESM chunks.
  serverExternalPackages: ['discord.js', 'pg', 'minio', '@napi-rs/canvas', 'pdfjs-dist'],
  reactStrictMode: true,
};

export default nextConfig;
