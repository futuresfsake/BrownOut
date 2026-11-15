import js from "@eslint/js";
import security from "eslint-plugin-security";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "node_modules/",
      "dist/",
      "coverage/",
      ".tools/",
      "cassettes/",
      "testresults/",
      "test-results/",
      "playwright-report/",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  security.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      eqeqeq: ["error", "always"],
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // The build scripts and tests read repository paths and assemble patterns from pieces on
    // purpose (see tools/check-tracked.mjs). None of it takes input from outside the repository.
    files: ["tools/**/*.mjs"],
    rules: {
      "security/detect-non-literal-fs-filename": "off",
      "security/detect-non-literal-regexp": "off",
    },
  },
  {
    files: ["tests/**/*.ts"],
    rules: {
      "security/detect-non-literal-fs-filename": "off",
      "security/detect-non-literal-regexp": "off",
    },
  },
  {
    // The simulation looks things up by id in records all the time. The ids are never raw player
    // text: an intent is checked against the scenario's own ids before the engine uses it, and the
    // validator checks every id inside the scenario. The rule cannot see that, so it flags every
    // lookup. Writes into records that hold system ids are additionally guarded with Object.hasOwn.
    files: ["src/**/*.ts", "tests/**/*.ts"],
    rules: { "security/detect-object-injection": "off" },
  },
);
