import type { NextConfig } from "next";

const useTestDatabase = process.env.E2E_PGLITE === "1";

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: useTestDatabase ? ["@electric-sql/pglite"] : [],
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
