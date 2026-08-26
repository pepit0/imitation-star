import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["replicate", "ffmpeg-static"],
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    },
    proxyClientMaxBodySize: "100mb",
  },
  outputFileTracingIncludes: {
    "/api/packs/convert-ogv": ["./node_modules/ffmpeg-static/ffmpeg*"],
  },
};

export default nextConfig;
