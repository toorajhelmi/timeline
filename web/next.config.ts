import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Auth URL migration.
      { source: "/login", destination: "/auth/login", permanent: true },
      { source: "/signup", destination: "/auth/signup", permanent: true },

      // Admin URL migration.
      { source: "/admin/:path*", destination: "/dashboard/:path*", permanent: true },

      // Admin API migration.
      { source: "/api/admin/:path*", destination: "/api/dashboard/:path*", permanent: true },

      // Legacy/experimental routes (kept as redirects so single-letter paths don't remain in `app/`).
      { source: "/t/:slug/a", destination: "/timelines/:slug", permanent: true },
      { source: "/t/:slug/b", destination: "/timelines/:slug", permanent: true },
      { source: "/t/:slug", destination: "/timelines/:slug", permanent: true },
      { source: "/t/:slug/add", destination: "/timelines/:slug/add", permanent: true },
      { source: "/t/:slug/settings", destination: "/timelines/:slug/settings", permanent: true },
      { source: "/t/:slug/e/:id", destination: "/timelines/:slug/entries/:id", permanent: true },

      // Legacy API paths.
      { source: "/api/t/:slug/entries", destination: "/api/timelines/:slug/entries", permanent: true },
      { source: "/api/t/:slug/key-moments", destination: "/api/timelines/:slug/key-moments", permanent: true },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  experimental: {
    // We upload images/videos via Server Actions in some flows. Default is 1MB which breaks media.
    serverActions: {
      bodySizeLimit: "80mb",
    },
  },
};

export default nextConfig;
