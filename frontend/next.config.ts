import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  async rewrites() {
    const backendUrl =
      process.env.BACKEND_INTERNAL_URL?.replace(/\/$/, "") ??
      "http://127.0.0.1:8000";

    return [
      {
        source: "/backend-api/:path*",
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/service-worker.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
