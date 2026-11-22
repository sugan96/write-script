import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static files only, no server (docs/0002-storage-byos.md decision 5).
  output: "export",
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
