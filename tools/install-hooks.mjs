// Points git at the committed hooks in .githooks/. Runs from `npm install` (the prepare script).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { capture, repoRoot, run } from "./lib.mjs";

// CI does not commit, and a source download has no .git folder.
if (process.env.CI || !existsSync(join(repoRoot, ".git"))) process.exit(0);

const inside = capture("git", ["rev-parse", "--is-inside-work-tree"]);
if (inside.status !== 0) process.exit(0);

process.exit(run("git", ["config", "core.hooksPath", ".githooks"]));
