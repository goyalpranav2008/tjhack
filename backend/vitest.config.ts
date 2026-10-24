import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Integration tests hit SQLite with many sequential inserts; allow generous time.
    testTimeout: 60000,
    // Global setup creates test.db before any worker runs; teardown deletes it.
    globalSetup: [path.resolve(__dirname, "src/__tests__/globalSetup.ts")],
    // vmForks avoids the singleFork channel-blocking issue with top-level execSync.
    pool: "vmForks",
  },
});
