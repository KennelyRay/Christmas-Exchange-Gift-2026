import type { NextConfig } from "next";

const useTestDatabase = process.env.E2E_PGLITE === "1";

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: useTestDatabase ? ["@electric-sql/pglite"] : [],
  images: useTestDatabase
    ? // The local test storage runs on localhost, which the image optimizer refuses to fetch.
      { unoptimized: true }
    : {
        // Every Neon branch has its own storage host, so all of them are allowed, but only this bucket.
        remotePatterns: [{ protocol: "https", hostname: "**.aws.neon.tech", pathname: "/wishlist-photos/**" }],
      },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
    resolveAlias: useTestDatabase ? { "@/db/client": "./e2e/pglite-client.ts" } : {},
  },
};

export default nextConfig;
