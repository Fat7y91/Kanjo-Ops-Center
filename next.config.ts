import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // `puppeteer` ships a Chromium download and must not be bundled by webpack; it
  // is required at runtime from node_modules by the contract PDF route.
  serverExternalPackages: ["puppeteer", "puppeteer-core"],
  allowedDevOrigins: ["*.monkeycode-ai.live", ".monkeycode-ai.live"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "drive.google.com" },
      { protocol: "https", hostname: "drive.usercontent.google.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
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
