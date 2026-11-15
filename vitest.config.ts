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
      reporter: ["text-summary", "json-summary"],
      include: ["src/**/*.ts"],
    },
  },
});
