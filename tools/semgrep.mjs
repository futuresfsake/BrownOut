// Static analysis with semgrep. Looks for the binary in this order:
//   BROWNOUT_SEMGREP, `semgrep` on PATH, then .tools/semgrep-venv (npm run tools:semgrep).
// Exit codes: 0 clean, 1 findings, 2 semgrep is missing. A missing tool never passes.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { canRun, logRun, repoRoot, run } from "./lib.mjs";

const venvBin = join(
  repoRoot,
  ".tools",
  "semgrep-venv",
  process.platform === "win32" ? "Scripts" : "bin",
  process.platform === "win32" ? "semgrep.exe" : "semgrep",
);

const candidates = [process.env.BROWNOUT_SEMGREP, "semgrep", venvBin].filter(Boolean);
const bin = candidates.find((c) => (existsSync(c) ? true : canRun(c)));

if (!bin) {
  console.error(
    "semgrep is not installed, so static analysis could not run.\n" +
      "Run `npm run tools:semgrep` to install the pinned version into .tools/.\n" +
      "This check never passes silently.",
  );
  logRun("check", "semgrep", "semgrep missing");
  process.exit(2);
}

const status = run(
  bin,
  [
    "scan",
    "--config",
    "p/javascript",
    "--config",
    "p/typescript",
    "--config",
    "p/secrets",
    "--metrics",
    "off",
    "--error",
    "--quiet",
    "--exclude",
    "node_modules",
    "--exclude",
    ".tools",
    "--exclude",
    "coverage",
    ".",
  ],
  { env: { PYTHONUTF8: "1" } },
);

if (status === 0) {
  console.log("semgrep: clean");
  logRun("check", "semgrep", "clean");
} else {
  console.error(`semgrep: failed (exit ${status})`);
  logRun("check", "semgrep", `failed (${status})`);
}
process.exit(status);
