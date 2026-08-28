/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['discord.js', 'pg', 'minio'],
  reactStrictMode: true,
};

export default nextConfig;
