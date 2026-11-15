// Runs the steps of a git hook in order and stops at the first failure.
//   node tools/hook.mjs pre-commit
//   node tools/hook.mjs pre-push
// CI runs the same scripts; see .github/workflows/ci.yml and docs/07-process/workflows.md.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { logRun, repoRoot, run } from "./lib.mjs";

const node = process.execPath;

const preCommit = [
  ["secrets in staged changes", node, ["tools/secrets.mjs", "staged"]],
  ["tracked files", node, ["tools/check-tracked.mjs", "files"]],
  ["lint", "npm", ["run", "lint", "--silent"]],
  ["type-check", "npm", ["run", "typecheck", "--silent"]],
  ["tests", "npm", ["test", "--silent"]],
];

const prePush = [
  ["secrets in history", node, ["tools/secrets.mjs", "history"]],
  ["tracked files", node, ["tools/check-tracked.mjs", "files"]],
  ["commit messages", node, ["tools/check-tracked.mjs", "messages"]],
  ["static analysis", node, ["tools/semgrep.mjs"]],
  ["dependency audit", node, ["tools/audit.mjs"]],
  ["lint", "npm", ["run", "lint", "--silent"]],
  ["type-check", "npm", ["run", "typecheck", "--silent"]],
  ["tests", "npm", ["test", "--silent"]],
];

// Scenario validation exists from milestone M1. Until then there is nothing to validate.
if (existsSync(join(repoRoot, "tools", "validate-scenario.mjs"))) {
  prePush.push(["scenario validation", node, ["tools/validate-scenario.mjs"]]);
}

const hooks = new Map([
  ["pre-commit", preCommit],
  ["pre-push", prePush],
]);
const name = process.argv[2] ?? "";
const steps = hooks.get(name);
if (!steps) {
  console.error(`usage: node tools/hook.mjs <${[...hooks.keys()].join("|")}>`);
  process.exit(64);
}

for (const [label, cmd, args] of steps) {
  console.log(`\n[${name}] ${label}`);
  const status = run(cmd, args);
  if (status !== 0) {
    console.error(`\n[${name}] stopped: "${label}" failed (exit ${status}).`);
    logRun(name, label, `failed (${status})`);
    process.exit(1);
  }
  logRun(name, label, "passed");
}
console.log(`\n[${name}] all checks passed`);
