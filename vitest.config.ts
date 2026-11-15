import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    environment: "node",
    passWithNoTests: true,
    // The guard tests start git and gitleaks in temporary repositories.
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      // Thin wrappers around the terminal: the logic they call is tested.
      exclude: ["src/cli/play.ts", "src/tools/**"],
      thresholds: {
        "src/engine/**": { lines: 90 },
        lines: 80,
      },
    },
  },
});
