// Scripted sessions for Double Charge, used by tests and by the scenario validator.
import { fromIdeal, say, type Step } from "../../engine/playthrough.js";
import { holding } from "../kit.js";
import { doubleCharge } from "./scenario.js";

export const playthroughs: Record<"ideal" | "poor" | "dishonest" | "silent", Step[]> = {
  ideal: fromIdeal(doubleCharge.idealPath),

  // Lets support say "pending", fixes the code on the live run, counts the duplicates but tells
  // neither the processor nor the customers, and misses a promised time.
  poor: [
    say(1, {
      kind: "communicate",
      to: ["cto"],
      text: "It is a handful of tickets. I will update you in five minutes.",
      promises: [{ to: "cto", what: "an update", dueInMinutes: 5 }],
    }),
    say(2, { kind: "mitigate", id: "hotfix-live" }),
    say(7, {
      kind: "communicate",
      to: ["support"],
      text: "Yes, tell them it is a pending hold that will drop off.",
      claims: [
        {
          topic: "pending-hold",
          stance: "asserts",
          text: "Yes, tell them it is a pending hold that will drop off.",
        },
      ],
    }),
    say(11, { kind: "investigate", id: "ticket-sample" }),
    say(15, { kind: "investigate", id: "processor-records" }),
    ...[20, 28, 36, 44, 52, 60, 68, 76, 84].map(holding),
  ],

  // Tells the press it is only a handful, then plays on until the piece appears.
  dishonest: [
    say(0, { kind: "investigate", id: "overview" }),
    say(8, { kind: "communicate", to: ["cto"], text: "Looking into it now." }),
    holding(16),
    say(20, {
      kind: "communicate",
      to: ["journalist"],
      text: "Only a handful of customers were affected.",
      claims: [
        {
          topic: "handful-only",
          stance: "asserts",
          text: "Only a handful of customers were affected.",
        },
      ],
    }),
    holding(28),
    holding(36),
    { atMinute: 45, input: { type: "end" } },
  ],

  silent: [],
};
