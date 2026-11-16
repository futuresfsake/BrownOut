// Scripted sessions for Slow Burn, used by tests and by the scenario validator.
import { fromIdeal, say, type Step } from "../../engine/playthrough.js";
import { holding } from "../kit.js";
import { slowBurn } from "./scenario.js";

/** The natural, wrong first statement, approved for the status page. */
export const FIRST_STATEMENT = "Post it: a performance issue, customers are not affected.";

export const playthroughs: Record<"ideal" | "poor" | "dishonest" | "silent", Step[]> = {
  ideal: fromIdeal(slowBurn.idealPath),

  // Calls it load, adds capacity, looks at the logs but never calls security or the regulator,
  // misses a promised time and lets the noon payouts go.
  poor: [
    say(1, {
      kind: "communicate",
      to: ["cto"],
      text: "It is a capacity problem from the marketing email. I will update you in five minutes.",
      claims: [
        {
          topic: "performance-only",
          stance: "asserts",
          text: "It is a capacity problem from the marketing email.",
        },
      ],
      promises: [{ to: "cto", what: "an update", dueInMinutes: 5 }],
    }),
    say(2, { kind: "mitigate", id: "add-capacity" }),
    say(8, { kind: "investigate", id: "signin-logs" }),
    say(12, { kind: "investigate", id: "attempt-pattern" }),
    ...[18, 26, 34, 42, 50, 58, 66, 74, 82].map(holding),
  ],

  // Approves "customers are not affected" for the status page, then plays on until it is quoted.
  dishonest: [
    say(0, { kind: "investigate", id: "overview" }),
    say(10, {
      kind: "communicate",
      to: ["comms"],
      text: FIRST_STATEMENT,
      directives: ["update-status-page"],
      claims: [{ topic: "customers-affected", stance: "denies", text: FIRST_STATEMENT }],
    }),
    holding(16),
    holding(24),
    holding(32),
    { atMinute: 40, input: { type: "end" } },
  ],

  silent: [],
};
