import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Test runner configuration.
 *
 * - `edge-runtime` matches the V8-isolate style runtime Convex queries and mutations run in (Web Crypto,
 *   no Node built-ins), which is what `convex-test` expects.
 * - `convex-test` must be inlined so its `import.meta.glob` of the functions directory is processed by Vite.
 * - Domain modules are pure and run in the same environment (they only use Web Crypto and Intl).
 */
export default defineConfig({
  resolve: {
    alias: {
      "@convex": fileURLToPath(new URL("./convex", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "edge-runtime",
    include: ["tests/**/*.test.ts"],
    server: { deps: { inline: ["convex-test"] } },
    testTimeout: 20_000,
  },
});
