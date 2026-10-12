import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // A lockfile in the home directory would otherwise make Turbopack
  // treat C:\Users\HP as the workspace root.
  turbopack: {
    root: path.join(__dirname),
  },
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  outputFileTracingIncludes: {
    "*": ["./db/schema.sql"],
  },
};

export default nextConfig;
