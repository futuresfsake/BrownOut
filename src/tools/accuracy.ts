// npm run accuracy: how well the matcher reads each situation's labelled phrasings.
// Pass a situation id to measure one: npm run accuracy -- open-bucket
import { measure } from "../matcher/accuracy.js";
import { scenarios } from "../scenarios/index.js";

const wanted = process.argv[2];
const entries = wanted ? scenarios.filter((e) => e.scenario.id === wanted) : scenarios;
if (entries.length === 0) {
  console.error(`no scenario named "${wanted ?? ""}"`);
  process.exit(64);
}

let failed = false;
for (const { scenario, accuracy: cases } of entries) {
  const r = measure(scenario, cases);
  const first = (100 * r.first) / r.total;
  const offered = (100 * r.offered) / r.total;
  console.log(`${scenario.id}: ${r.total} labelled phrasings`);
  console.log(
    `  right reading first:                 ${r.first} (${first.toFixed(1)}%, target 85%)`,
  );
  console.log(
    `  first or offered as "did you mean":  ${r.offered} (${offered.toFixed(1)}%, target 97%)`,
  );
  for (const m of r.misses) {
    console.log(`  ${m.offeredOk ? "asked " : "MISSED"} "${m.text}" -> ${m.got}`);
  }
  if (first < 85 || offered < 97) failed = true;
}
process.exit(failed ? 1 : 0);
