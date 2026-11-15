// Validates the authored scenarios. Runs the TypeScript validator through tsx.
import { run } from "./lib.mjs";

process.exit(run("npx", ["tsx", "src/tools/validate.ts", ...process.argv.slice(2)]));
