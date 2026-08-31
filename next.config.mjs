/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // CSV import (Phase 5) sends the parsed file to a Server Action as
      // JSON. Default (1mb) is too small for a few thousand POS export
      // rows; the importer itself caps at 5,000 rows (see
      // src/app/manager/settings/data-sources/actions.ts) well under what
      // this allows.
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
