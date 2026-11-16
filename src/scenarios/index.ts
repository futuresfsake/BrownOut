// Every situation that can be played, in catalogue order. A situation is its data, its scripted
// sessions for the validator, and its labelled phrasings for the matcher's accuracy test.
import type { Step } from "../engine/playthrough.js";
import type { Scenario } from "../engine/schema.js";
import { accuracy as dialToneAccuracy, type AccuracyCase } from "./dial-tone/accuracy.js";
import { playthroughs as dialTonePlaythroughs } from "./dial-tone/playthroughs.js";
import { dialTone } from "./dial-tone/scenario.js";
import { accuracy as openBucketAccuracy } from "./open-bucket/accuracy.js";
import { playthroughs as openBucketPlaythroughs } from "./open-bucket/playthroughs.js";
import { openBucket } from "./open-bucket/scenario.js";
import { accuracy as slowBurnAccuracy } from "./slow-burn/accuracy.js";
import { playthroughs as slowBurnPlaythroughs } from "./slow-burn/playthroughs.js";
import { slowBurn } from "./slow-burn/scenario.js";

export interface ScenarioEntry {
  /** The number in the catalogue, as in docs/03-design/situation-catalog.md. */
  catalogue: string;
  scenario: Scenario;
  playthroughs: Record<"ideal" | "poor" | "dishonest" | "silent", Step[]>;
  accuracy: AccuracyCase[];
}

export const scenarios: ScenarioEntry[] = [
  {
    catalogue: "S-001",
    scenario: dialTone,
    playthroughs: dialTonePlaythroughs,
    accuracy: dialToneAccuracy,
  },
  {
    catalogue: "S-011",
    scenario: openBucket,
    playthroughs: openBucketPlaythroughs,
    accuracy: openBucketAccuracy,
  },
  {
    catalogue: "S-021",
    scenario: slowBurn,
    playthroughs: slowBurnPlaythroughs,
    accuracy: slowBurnAccuracy,
  },
];

export function findScenario(id: string): ScenarioEntry | undefined {
  return scenarios.find((entry) => entry.scenario.id === id);
}
