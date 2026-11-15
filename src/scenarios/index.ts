import type { Step } from "../engine/playthrough.js";
import type { Scenario } from "../engine/schema.js";
import { playthroughs as dialTonePlaythroughs } from "./dial-tone/playthroughs.js";
import { dialTone } from "./dial-tone/scenario.js";

export interface ScenarioEntry {
  scenario: Scenario;
  playthroughs: Record<"ideal" | "poor" | "dishonest" | "silent", Step[]>;
}

export const scenarios: ScenarioEntry[] = [
  { scenario: dialTone, playthroughs: dialTonePlaythroughs },
];

export function findScenario(id: string): ScenarioEntry | undefined {
  return scenarios.find((entry) => entry.scenario.id === id);
}
