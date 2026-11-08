import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { NextConfig } from "next";

const require = createRequire(import.meta.url);
const reactClientBuild = join(dirname(require.resolve("react/package.json")), "cjs/react.production.js");
const setImmediateShim = join(process.cwd(), "src/lib/edge/timers-shim.cjs");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  webpack: (config, { nextRuntime, webpack }) => {
    // react-pdf's reconciler reads React's client internals, but the edge runtime
    // resolves `react` to the react-server build which omits them. The PDF
    // bootstrap imports this alias to inject the symbol before loading the
    // renderer, and `setImmediate` (used by the scheduler) is shimmed in the same
    // edge bundles.
    config.resolve.alias["#react-client-internals"] = reactClientBuild;
    if (nextRuntime === "edge") {
      config.plugins.push(
        new webpack.ProvidePlugin({
          setImmediate: setImmediateShim,
        }),
      );
    }
    return config;
  },
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
