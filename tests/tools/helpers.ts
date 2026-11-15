import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export const repoRoot = join(import.meta.dirname, "..", "..");

export function git(cwd: string, ...args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
}

/** A throwaway git repository. Remove it with `cleanup()`. */
export function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), "brownout-test-"));
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.name", "Test Author");
  git(dir, "config", "user.email", "test@example.invalid");
  git(dir, "config", "commit.gpgsign", "false");
  return {
    dir,
    write(file: string, text: string) {
      const full = join(dir, file);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, text);
    },
    add: () => git(dir, "add", "-A"),
    commit: (message: string) => git(dir, "commit", "-q", "-m", message),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/** Run one of the scripts in tools/ and return what it did. */
export function runTool(script: string, args: string[], env: Record<string, string> = {}) {
  const result = spawnSync(process.execPath, [join(repoRoot, "tools", script), ...args], {
    encoding: "utf8",
    env: { ...process.env, BROWNOUT_NO_LOG: "1", ...env },
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

// Secret-shaped values are built at run time from pieces. A literal one in this file would be a
// finding in its own right, even if it were fake.
export const fakeAwsKey = (): string => ["AK", "IA", "Z7XQ3MB", "N5VWP2LK4"].join("");
export const localWindowsPath = (): string =>
  ["C:", "\\", "Users", "\\", "someone", "\\", "app"].join("");
export const localForwardSlashPath = (): string =>
  ["C:", "/", "Users", "/", "someone", "/", "app"].join("");
export const coAuthorTrailer = (): string =>
  ["Co-Authored", "-By: Someone <x@example.invalid>"].join("");
