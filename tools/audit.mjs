// Dependency audit for production dependencies. High and critical findings fail.
import { logRun, run } from "./lib.mjs";

const status = run("npm", ["audit", "--omit=dev", "--audit-level=high"]);
logRun("check", "npm audit --omit=dev", status === 0 ? "clean" : `failed (${status})`);
process.exit(status);
