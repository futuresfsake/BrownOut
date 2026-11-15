// Secrets scan with gitleaks.
//   node tools/secrets.mjs staged [dir]    staged changes (pre-commit)
//   node tools/secrets.mjs history [dir]   every commit (pre-push, CI, before going public)
//   node tools/secrets.mjs tree [dir]      files on disk
// Exit codes: 0 clean, 1 leak found, 2 gitleaks is missing. A missing tool never passes.
import { canRun, logRun, run } from "./lib.mjs";

const modes = new Map([
  ["staged", ["git", "--staged"]],
  ["history", ["git"]],
  ["tree", ["dir"]],
]);

const mode = process.argv[2] ?? "";
const dir = process.argv[3] ?? process.cwd();
const bin = process.env.BROWNOUT_GITLEAKS ?? "gitleaks";
const what = `gitleaks ${mode}`;
const modeArgs = modes.get(mode);

if (!modeArgs) {
  console.error(`usage: node tools/secrets.mjs <${[...modes.keys()].join("|")}> [dir]`);
  process.exit(64);
}

if (!canRun(bin, ["version"])) {
  console.error(
    `${bin} is not installed or not on PATH, so the secrets scan could not run.\n` +
      "Install it from https://github.com/gitleaks/gitleaks and try again.\n" +
      "This check never passes silently.",
  );
  logRun("check", what, "gitleaks missing");
  process.exit(2);
}

const status = run(bin, [...modeArgs, "--no-banner", "--redact", "."], { cwd: dir });
if (status === 0) {
  console.log(`secrets (${mode}): clean`);
  logRun("check", what, "clean");
  process.exit(0);
}
console.error(`secrets (${mode}): gitleaks reported a problem (exit ${status})`);
logRun("check", what, `failed (${status})`);
process.exit(1);
