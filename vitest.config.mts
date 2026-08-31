import { defineConfig } from "vitest/config";
import path from "node:path";

// Pure-function unit tests only (the metric engine, gamification math) —
// no React/DOM environment needed, so no jsdom dependency to install.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
