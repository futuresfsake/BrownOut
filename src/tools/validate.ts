// node tools/validate-scenario.mjs [scenario-id]: validates every scenario, or one.
import { validateScenario } from "../engine/validate.js";
import { scenarios } from "../scenarios/index.js";

const wanted = process.argv[2];
const entries = wanted ? scenarios.filter((e) => e.scenario.id === wanted) : scenarios;
if (entries.length === 0) {
  console.error(`no scenario named "${wanted ?? ""}"`);
  process.exit(64);
}

let failed = 0;
for (const entry of entries) {
  const report = validateScenario(entry);
  if (report.errors.length === 0) {
    console.log(`${entry.scenario.id}: valid (${report.notes.join("; ")})`);
  } else {
    failed += 1;
    console.error(`${entry.scenario.id}: ${report.errors.length} problem(s)`);
    for (const error of report.errors) console.error(`  - ${error}`);
  }
}
process.exit(failed === 0 ? 0 : 1);
