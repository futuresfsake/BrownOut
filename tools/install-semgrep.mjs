// Installs the pinned semgrep into .tools/semgrep-venv so the hooks can run it without Docker.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canRun, repoRoot, run } from "./lib.mjs";

const { semgrep } = JSON.parse(readFileSync(join(repoRoot, "tools", "versions.json"), "utf8"));
const venv = join(repoRoot, ".tools", "semgrep-venv");
const python = ["python", "python3"].find((p) => canRun(p));

if (!python) {
  console.error("Python 3 is required to install semgrep and was not found on PATH.");
  process.exit(2);
}

const venvPython = join(venv, process.platform === "win32" ? "Scripts" : "bin", "python");
let status = run(python, ["-m", "venv", venv]);
if (status === 0) {
  status = run(venvPython, [
    "-m",
    "pip",
    "install",
    "--disable-pip-version-check",
    `semgrep==${semgrep}`,
  ]);
}
process.exit(status);
