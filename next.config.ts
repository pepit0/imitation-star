import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["replicate", "ffmpeg-static"],
  experimental: {
    serverActions: {
      // Match convert-ogv storage ceiling so large CV OGVs can POST locally.
      bodySizeLimit: "300mb",
    },
    // Default 10mb / prior 100mb blocked ~120 MB OGV direct convert on localhost.
    proxyClientMaxBodySize: "300mb",
  },
  outputFileTracingIncludes: {
    "/api/packs/convert-ogv": ["./node_modules/ffmpeg-static/ffmpeg*"],
  },
};

export default nextConfig;
