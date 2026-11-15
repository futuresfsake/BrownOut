// Checks what is committed, beyond what a secrets scanner looks for.
//   node tools/check-tracked.mjs files [dir]     tracked file names and contents
//   node tools/check-tracked.mjs messages [dir]  commit messages in every branch
// Exit codes: 0 clean, 1 problem found.
//
// The patterns below are assembled from pieces on purpose, so that this file does not
// contain the very strings it forbids and cannot flag itself.
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { capture, logRun } from "./lib.mjs";

const mode = process.argv[2] ?? "";
const dir = process.argv[3] ?? process.cwd();

if (mode !== "files" && mode !== "messages") {
  console.error("usage: node tools/check-tracked.mjs <files|messages> [dir]");
  process.exit(64);
}

const problems = [];

if (mode === "files") {
  const listed = capture("git", ["ls-files", "-z"], { cwd: dir });
  if (listed.status !== 0) {
    console.error("could not list tracked files: is this a git repository?");
    process.exit(1);
  }
  const files = listed.stdout.split("\0").filter(Boolean);

  const guideFile = ["CLAUDE", ".md"].join("");
  const toolDir = [".cla", "ude/"].join("");
  const keyExtensions = [".pem", ".key", ".p12", ".pfx"];

  const nameProblem = (file) => {
    const base = file.split("/").pop() ?? file;
    if (base === ".env" || (base.startsWith(".env.") && base !== ".env.example")) {
      return "environment file is tracked";
    }
    if (keyExtensions.some((ext) => base.endsWith(ext)) || base.startsWith("id_rsa")) {
      return "key file is tracked";
    }
    if (base === guideFile || file.startsWith(toolDir) || file.includes("/" + toolDir)) {
      return "local tooling file is tracked";
    }
    return null;
  };

  // Matches a Windows user-folder path with either slash style; Node and vitest print forward slashes.
  const driveRoot = ["[A-Za-z]:[\\\\/]", "Us", "ers", "[\\\\/]"].join("");
  const patterns = [
    ["local Windows path", new RegExp(driveRoot)],
    ["local macOS path", new RegExp(["/Us", "ers/[^/\\s]+/"].join(""))],
    ["local Linux path", new RegExp(["/ho", "me/[^/\\s]+/"].join(""))],
  ];

  const skipContent = /\.(png|gif|jpe?g|webp|woff2?|ico|pdf|zip)$|(^|\/)package-lock\.json$/;
  for (const file of files) {
    const bad = nameProblem(file);
    if (bad) problems.push(`${file}: ${bad}`);
    if (skipContent.test(file)) continue;
    const full = join(dir, file);
    let text;
    try {
      if (statSync(full).size > 2_000_000) continue;
      text = readFileSync(full, "utf8");
    } catch {
      continue; // deleted in the working tree, or not readable
    }
    if (text.includes("\0")) continue;
    text.split(/\r?\n/).forEach((line, i) => {
      for (const [label, re] of patterns) {
        if (re.test(line)) problems.push(`${file}:${i + 1}: ${label}`);
      }
    });
  }
} else {
  const log = capture("git", ["log", "--all", "--format=%H%x00%B%x01"], { cwd: dir });
  if (log.status !== 0) {
    console.error("could not read commit messages: is this a git repository?");
    process.exit(1);
  }
  const trailer = new RegExp(["co-", "authored-", "by:"].join(""), "i");
  const banner = new RegExp(["gener", "ated (with|by)"].join(""), "i");
  for (const entry of log.stdout.split("\x01").filter((e) => e.trim())) {
    const [hash = "", body = ""] = entry.trim().split("\0");
    if (trailer.test(body))
      problems.push(`${hash.slice(0, 8)}: commit message has a co-author trailer`);
    if (banner.test(body)) problems.push(`${hash.slice(0, 8)}: commit message has a tool banner`);
  }
}

if (problems.length > 0) {
  for (const p of problems) console.error(`tracked (${mode}): ${p}`);
  logRun("check", `check-tracked ${mode}`, `failed (${problems.length})`);
  process.exit(1);
}
console.log(`tracked (${mode}): clean`);
logRun("check", `check-tracked ${mode}`, "clean");
