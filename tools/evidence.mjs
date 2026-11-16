#!/usr/bin/env node
// Runs the checks for a milestone and saves what each one printed under testresults/dod/<name>/.
// Usage: npm run evidence -- m3b
//
// The files are what the tools said, with two changes: colour codes are removed, and the path of
// this checkout is replaced by <repo>, so that nothing about the machine it ran on is committed.
// Screenshots and frame rates have their own commands: `npm run e2e:evidence` and
// `npm run e2e:measure`.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { capture, repoRoot } from "./lib.mjs";

const name = process.argv[2];
if (!name || !/^[a-z0-9-]+$/.test(name)) {
  console.error("usage: npm run evidence -- <milestone folder, for example m3b>");
  process.exit(2);
}
const root = resolve(repoRoot);
const out = join(root, "testresults", "dod", name);
mkdirSync(out, { recursive: true });

/** The checkout's path as tools print it: either kind of slash, any case of the drive letter. */
const pathPattern = new RegExp(
  root
    .split(/[\\/]/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[\\\\/]+"),
  "gi",
);
const colour = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
const clean = (text) => text.replace(colour, "").replace(pathPattern, "<repo>");

// Each tool is started through Node from its own file, so no shell is involved.
const bin = (...parts) => join(root, "node_modules", ...parts);
const eslint = bin("eslint", "bin", "eslint.js");
const tsc = bin("typescript", "bin", "tsc");
const prettier = bin("prettier", "bin", "prettier.cjs");
const vitest = bin("vitest", "vitest.mjs");
const vite = bin("vite", "bin", "vite.js");
const playwright = bin("@playwright", "test", "cli.js");
const script = (file, ...args) => [join(root, "tools", file), ...args];

let failed = false;

/** Saves several commands' output as one file. `brief` keeps only the exit code of a command. */
function save(file, steps) {
  const parts = [];
  for (const step of steps) {
    const result = capture(process.execPath, step.run);
    if (result.status !== 0) failed = true;
    const text = clean(`${result.stdout}${result.stderr}`).trimEnd();
    parts.push(step.brief ? `${step.brief}: exit ${result.status}` : text);
    console.log(`${result.status === 0 ? "ok  " : "FAIL"} ${file}`);
  }
  writeFileSync(join(out, file), `${parts.join("\n")}\n`);
}

save("lint-typecheck-format.txt", [
  { run: [eslint, ".", "--max-warnings", "0"], brief: "eslint" },
  { run: [tsc, "--noEmit"], brief: "tsc" },
  { run: [prettier, "--check", "."] },
]);
save("tests.txt", [{ run: [vitest, "run"] }]);
save("coverage.txt", [{ run: [vitest, "run", "--coverage"] }]);
save("validator.txt", [{ run: script("validate-scenario.mjs") }]);
save("build.txt", [{ run: [vite, "build"] }]);
save("browser-tests.txt", [{ run: [playwright, "test", "--project=chromium"] }]);
save("accessibility.txt", [
  { run: [playwright, "test", "--project=chromium", "e2e/a11y.spec.ts"] },
]);
save("security.txt", [
  { run: script("secrets.mjs", "tree") },
  { run: script("semgrep.mjs") },
  { run: script("audit.mjs") },
  { run: script("check-tracked.mjs", "files") },
]);

process.exit(failed ? 1 : 0);
