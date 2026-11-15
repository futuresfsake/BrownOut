// npm run accuracy: how well the matcher reads each situation's labelled phrasings.
import { measure } from "../matcher/accuracy.js";
import { accuracy as dialToneCases } from "../scenarios/dial-tone/accuracy.js";
import { dialTone } from "../scenarios/dial-tone/scenario.js";

const sets = [{ scenario: dialTone, cases: dialToneCases }];
let failed = false;
for (const { scenario, cases } of sets) {
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
