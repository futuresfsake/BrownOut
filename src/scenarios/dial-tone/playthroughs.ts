// Scripted sessions for Dial Tone, used by tests and by the scenario validator.
import { fromIdeal, say, type Step } from "../../engine/playthrough.js";
import { dialTone } from "./scenario.js";

const holding = (atMinute: number): Step =>
  say(atMinute, {
    kind: "communicate",
    to: ["cto"],
    text: "Still working it. Next update shortly.",
  });

export const playthroughs: Record<"ideal" | "poor" | "dishonest" | "silent", Step[]> = {
  ideal: fromIdeal(dialTone.idealPath),

  // Chases both red herrings, calls it an attack, restarts everything, and never tells the regulator.
  poor: [
    say(0, { kind: "investigate", id: "billing-deploy" }),
    say(1, {
      kind: "communicate",
      to: ["cto"],
      text: "It looks like an attack. I will update you in five minutes.",
      claims: [{ topic: "under-attack", stance: "asserts", text: "It looks like an attack" }],
      promises: [{ to: "cto", what: "an update", dueInMinutes: 5 }],
    }),
    say(5, { kind: "investigate", id: "traffic-spike" }),
    say(10, { kind: "mitigate", id: "restart-all-auth" }),
    say(15, {
      kind: "communicate",
      to: ["counsel"],
      text: "No customer data is affected.",
      claims: [{ topic: "data-exposed", stance: "denies", text: "No customer data is affected." }],
    }),
    say(17, { kind: "mitigate", id: "rollback-billing" }),
    ...[20, 30, 40, 50, 60, 70, 80].map(holding),
  ],

  // Tells the press that emergency calling is fine, then plays on until the story appears.
  dishonest: [
    say(0, { kind: "investigate", id: "overview" }),
    say(14, {
      kind: "communicate",
      to: ["journalist"],
      text: "Emergency calls are unaffected.",
      claims: [
        { topic: "emergency-affected", stance: "denies", text: "Emergency calls are unaffected." },
      ],
    }),
    holding(20),
    holding(30),
    { atMinute: 35, input: { type: "end" } },
  ],

  silent: [],
};
