import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  allowedDevOrigins: [".monkeycode-ai.live"],
  experimental: {
    globalNotFound: true,
    // Keep recently visited RSC payloads in the client router cache so
    // sidebar navigation and back/forward are instant instead of refetching.
    staleTimes: {
      dynamic: 60,
      static: 300,
    },
  },
};

export default nextConfig;
