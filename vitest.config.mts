import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    clearMocks: true,
    // Migration suites boot an in-process PostgreSQL and replay the whole chain.
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
