// Play a situation in the terminal. No model, no network: you type, the matcher reads it.
//   npm run play                          type what you do
//   npm run play -- --scenario dial-tone --seed 42
//   npm run play -- --auto ideal          watch a scripted session and read the debrief
// While playing: "?" lists everything you could do, "@cto text" replies in someone's thread.
import { createInterface } from "node:readline";
import { buildDebrief } from "../engine/debrief.js";
import { clockOf, createSession, resolve } from "../engine/engine.js";
import { play } from "../engine/playthrough.js";
import type { Scenario } from "../engine/schema.js";
import type { EngineEvent, SessionState } from "../engine/state.js";
import { applyIntents, takeTurn } from "../game/turn.js";
import type { Candidate } from "../matcher/matcher.js";
import { findScenario, scenarios } from "../scenarios/index.js";
import { buildMenu } from "./options.js";

function arg(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : undefined;
}

const HIDDEN = new Set(["session_started", "clue_revealed", "mitigation_applied", "trust"]);

function show(scenario: Scenario, events: EngineEvent[]): void {
  for (const e of events) {
    if (HIDDEN.has(e.type) || e.text === undefined) continue;
    console.log(`  ${clockOf(scenario, e.minute)}  ${e.text}`);
  }
}

function board(scenario: Scenario, state: SessionState): void {
  const systems = scenario.systems
    .map(
      (s) =>
        `${s.label.split(" (")[0]}: ${s.labels?.[state.systems[s.id] ?? "ok"] ?? state.systems[s.id]}`,
    )
    .join(" | ");
  const numbers = scenario.metrics
    .map((m) => {
      const value = (state.series[m.id]?.[state.minute] ?? 0).toLocaleString("en-US");
      return `${m.label}: ${state.visibleMetrics.includes(m.id) ? value : "unknown"}`;
    })
    .join(" | ");
  console.log(`\n[${clockOf(scenario, state.minute)}]  ${systems}\n        ${numbers}`);
  if (state.task)
    console.log(`        Mika is busy until ${clockOf(scenario, state.task.endMinute)}.`);
  const waiting = scenario.stakeholders
    .filter((s) => state.threads[s.id]?.unansweredSince !== undefined)
    .map((s) => s.name);
  if (waiting.length > 0) console.log(`        Waiting for a reply: ${waiting.join(", ")}`);
}

function debrief(scenario: Scenario, state: SessionState): void {
  const d = buildDebrief(scenario, state);
  console.log(`\n${d.headline}`);
  for (const [dimension, s] of Object.entries(d.score.dimensions)) {
    console.log(`\n${dimension}: ${s.score}`);
    for (const line of s.lines)
      console.log(`  ${line.delta >= 0 ? "+" : ""}${line.delta}  ${line.reason}`);
  }
  for (const cap of d.score.caps) console.log(`\n${cap}`);
  if (d.wentWell.length > 0) console.log("\nWent well:");
  for (const p of d.wentWell) console.log(`  - ${p.text}`);
  if (d.missed.length > 0) console.log("\nMissed:");
  for (const p of d.missed) console.log(`  - ${p.text}`);
  console.log(`\nOne thing: ${d.oneThing.text}`);
  console.log("\nA stronger response:");
  for (const s of d.stronger) console.log(`  ${s.clock}  ${s.step}`);
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
console.log('\nType "?" to list what you could do, or "@name message" to reply to someone.');
show(scenario, events);
const menu = buildMenu(scenario);
// Reading lines as a stream works for a keyboard and for piped input alike.
const rl = createInterface({ input: process.stdin });
const lines = rl[Symbol.asyncIterator]();
let pending: Candidate[] | undefined;

const list = (items: { label: string }[]) =>
  items.forEach((o, n) => console.log(`  ${String(n + 1).padStart(2)}. ${o.label}`));

while (state.status === "running") {
  board(scenario, state);
  process.stdout.write(
    pending ? "\nWhich did you mean? (number, or type again) " : "\nWhat do you do? ",
  );
  const next = await lines.next();
  if (next.done) break; // input ended (piped input, or the terminal was closed)
  const answer = next.value.trim();
  if (answer === "") continue;
  console.log();

  // A number picks from whichever list is on screen.
  if (/^\d+$/.test(answer)) {
    const picked = pending?.[Number(answer) - 1];
    const option = pending ? undefined : menu[Number(answer) - 1];
    if (picked) {
      ({ state, events } = applyIntents(scenario, state, [picked.intent]));
    } else if (option) {
      ({ state, events } = resolve(scenario, state, option.input));
    } else {
      console.log("Not an option.");
      continue;
    }
    pending = undefined;
    show(scenario, events);
    continue;
  }
  pending = undefined;
  if (answer === "?") {
    list(menu);
    continue;
  }

  const reply = /^@(\S+)\s+(.+)$/.exec(answer);
  const thread = reply
    ? scenario.stakeholders.find((s) =>
        [s.id, ...s.name.toLowerCase().split(" "), ...(s.aliases ?? [])].includes(
          (reply[1] ?? "").toLowerCase(),
        ),
      )?.id
    : undefined;
  const turn = takeTurn(scenario, state, reply && thread ? (reply[2] ?? "") : answer, thread);
  state = turn.state;
  for (const line of turn.restatements) console.log(`  (read as: ${line})`);
  for (const part of turn.unread) console.log(`  (not understood: "${part}")`);
  show(scenario, turn.events);
  if (turn.choose) {
    console.log("Did you mean:");
    list(turn.choose);
    pending = turn.choose;
  }
  if (turn.suggestions && turn.suggestions.length > 0) {
    console.log("Nearest things you could do:");
    list(turn.suggestions);
    pending = turn.suggestions;
  }
}
rl.close();
debrief(scenario, state);
