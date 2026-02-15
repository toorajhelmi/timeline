import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
