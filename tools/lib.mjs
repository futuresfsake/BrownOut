// Shared helpers for the scripts in tools/. Plain Node, no dependencies, so the hooks work
// before `npm install` has finished and behave the same on Windows, macOS and Linux.
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Append one line to run-log.jsonl (ignored by git). Never throws; the log is a convenience. */
export function logRun(phase, what, result) {
  if (process.env.BROWNOUT_NO_LOG === "1") return;
  try {
    const line = JSON.stringify({ time: new Date().toISOString(), phase, what, result });
    appendFileSync(join(repoRoot, "run-log.jsonl"), line + "\n");
  } catch {
    // ignore
  }
}

// npm and npx are .cmd files on Windows and need a shell to start.
const needsShell = (cmd) => process.platform === "win32" && (cmd === "npm" || cmd === "npx");

/** Run a command with output shown. Returns its exit status, or 127 if it could not start. */
export function run(cmd, args, { cwd = repoRoot, env = {} } = {}) {
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: "inherit",
    shell: needsShell(cmd),
    env: { ...process.env, ...env },
  });
  if (result.error) return 127;
  return result.status ?? 1;
}

/** Run a command and capture its output. */
export function capture(cmd, args, { cwd = repoRoot } = {}) {
  const result = spawnSync(cmd, args, { cwd, encoding: "utf8", shell: needsShell(cmd) });
  return {
    status: result.error ? 127 : (result.status ?? 1),
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

/** True if the command can be started at all. */
export function canRun(cmd, args = ["--version"]) {
  const result = spawnSync(cmd, args, { stdio: "ignore", shell: needsShell(cmd) });
  return !result.error;
}
