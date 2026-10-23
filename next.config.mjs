/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
    // Don't reuse cached copies of dynamic pages (e.g. the dashboard) on
    // client-side navigation — otherwise new certificates don't show up.
    staleTimes: {
      dynamic: 0,
    },
  },
};

export default nextConfig;
