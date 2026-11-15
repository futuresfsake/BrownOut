// Play a scenario in the terminal with no model. Everything you read is authored text.
//   npm run play                          interactive, scenario 1
//   npm run play -- --scenario dial-tone --seed 42
//   npm run play -- --auto ideal          play a scripted session and print the debrief
import { createInterface } from "node:readline/promises";
import { clockOf, createSession, resolve } from "../engine/engine.js";
import { play } from "../engine/playthrough.js";
import { score } from "../engine/score.js";
import type { Scenario } from "../engine/schema.js";
import type { EngineEvent, SessionState } from "../engine/state.js";
import { findScenario, scenarios } from "../scenarios/index.js";
import { buildMenu } from "./options.js";

function arg(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : undefined;
}

function show(scenario: Scenario, events: EngineEvent[]): void {
  for (const e of events) {
    if (
      e.type === "session_started" ||
      e.type === "clue_revealed" ||
      e.type === "mitigation_applied"
    )
      continue;
    if (e.text === undefined) continue;
    console.log(`  ${clockOf(scenario, e.minute)}  ${e.text}`);
  }
}

function board(scenario: Scenario, state: SessionState): void {
  const systems = scenario.systems
    .map(
      (s) =>
        `${s.label.split(" (")[0]}: ${scenario.systems.find((x) => x.id === s.id)?.labels?.[state.systems[s.id] ?? "ok"] ?? state.systems[s.id]}`,
    )
    .join(" | ");
  const numbers = scenario.metrics
    .map(
      (m) =>
        `${m.label}: ${state.visibleMetrics.includes(m.id) ? (state.series[m.id]?.[state.minute] ?? 0).toLocaleString("en-US") : "unknown"}`,
    )
    .join(" | ");
  console.log(`\n[${clockOf(scenario, state.minute)}]  ${systems}\n        ${numbers}`);
  if (state.task)
    console.log(`        Mika is busy until ${clockOf(scenario, state.task.endMinute)}.`);
}

function debrief(scenario: Scenario, state: SessionState): void {
  const result = score(scenario, state);
  console.log(`\nEnded: ${state.status}. Score ${result.overall} - ${result.label}.`);
  for (const [dimension, d] of Object.entries(result.dimensions)) {
    console.log(`\n${dimension}: ${d.score}`);
    for (const line of d.lines)
      console.log(`  ${line.delta >= 0 ? "+" : ""}${line.delta}  ${line.reason}`);
  }
  for (const cap of result.caps) console.log(`\n${cap}`);
}

const entry = findScenario(arg("scenario") ?? "dial-tone") ?? scenarios[0];
if (!entry) throw new Error("no scenarios are registered");
const { scenario } = entry;
const seed = Number(arg("seed") ?? 1);

const auto = arg("auto");
if (auto !== undefined) {
  const steps = (entry.playthroughs as Record<string, typeof entry.playthroughs.ideal>)[auto];
  if (!steps) {
    console.error(
      `unknown playthrough "${auto}". Try: ${Object.keys(entry.playthroughs).join(", ")}`,
    );
    process.exit(64);
  }
  const { state } = play(scenario, steps, { seed });
  show(scenario, state.log);
  debrief(scenario, state);
  process.exit(0);
}

let { state, events } = createSession(scenario, seed);
console.log(`\n${scenario.title}\n\n${scenario.briefing.situation}\n\n${scenario.briefing.canDo}`);
show(scenario, events);
const menu = buildMenu(scenario);
const rl = createInterface({ input: process.stdin, output: process.stdout });
while (state.status === "running") {
  board(scenario, state);
  menu.forEach((o, n) => console.log(`  ${String(n + 1).padStart(2)}. ${o.label}`));
  const answer = (await rl.question("\nChoose a number: ")).trim();
  const choice = menu[Number(answer) - 1];
  if (!choice) {
    console.log("Not an option.");
    continue;
  }
  ({ state, events } = resolve(scenario, state, choice.input));
  console.log();
  show(scenario, events);
}
rl.close();
debrief(scenario, state);
