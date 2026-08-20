import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/**": ["./src/infrastructure/documents/fonts/**"],
  },
};

export default nextConfig;
