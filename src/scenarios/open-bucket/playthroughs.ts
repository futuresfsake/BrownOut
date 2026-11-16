// Scripted sessions for Open Bucket, used by tests and by the scenario validator.
import { fromIdeal, say, type Step } from "../../engine/playthrough.js";
import { holding } from "../kit.js";
import { openBucket } from "./scenario.js";

export const playthroughs: Record<"ideal" | "poor" | "dishonest" | "silent", Step[]> = {
  ideal: fromIdeal(openBucket.idealPath),

  // Calls it a hack, deletes the evidence, tells counsel only the researcher had the files,
  // misses a promised time and never tells the regulator.
  poor: [
    say(1, {
      kind: "communicate",
      to: ["cto"],
      text: "We have been hacked. I will update you in five minutes.",
      claims: [{ topic: "app-hacked", stance: "asserts", text: "We have been hacked." }],
      promises: [{ to: "cto", what: "an update", dueInMinutes: 5 }],
    }),
    say(2, { kind: "mitigate", id: "delete-store" }),
    say(5, { kind: "investigate", id: "app-intrusion" }),
    say(14, {
      kind: "communicate",
      to: ["counsel"],
      text: "Only the researcher downloaded the files.",
      claims: [
        {
          topic: "only-researcher",
          stance: "asserts",
          text: "Only the researcher downloaded the files.",
        },
      ],
    }),
    ...[20, 28, 36, 44, 52, 60, 68, 76, 84].map(holding),
  ],

  // Tells the press nothing sensitive was in the files, then plays on until the story appears.
  dishonest: [
    say(0, { kind: "investigate", id: "open-the-link" }),
    say(10, {
      kind: "communicate",
      to: ["journalist"],
      text: "No sensitive data was exposed.",
      claims: [
        { topic: "sensitive-data", stance: "denies", text: "No sensitive data was exposed." },
      ],
    }),
    holding(16),
    holding(24),
    holding(32),
    holding(39),
    { atMinute: 45, input: { type: "end" } },
  ],

  silent: [],
};
