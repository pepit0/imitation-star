import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["replicate"],
  experimental: {
    serverActions: {
      bodySizeLimit: "200mb",
    },
    proxyClientMaxBodySize: "200mb",
  },
};

export default nextConfig;
