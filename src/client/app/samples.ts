// Recorded sessions that ship with the game, to watch from the start screen (F-45). Only the
// seed and the moves are kept: the session itself is played from them each time, so a sample
// can never disagree with the situation it belongs to. A test plays each one to its ending.
import type { Move } from "./game.js";

export interface Sample {
  scenarioId: string;
  title: string;
  /** One sentence on what there is to see. */
  about: string;
  seed: number;
  moves: Move[];
}

const say = (text: string, thread?: string): Move =>
  thread ? { t: "say", text, thread } : { t: "say", text };
const wait: Move = { t: "wait" };
const idle = (n: number): Move => ({ t: "tick", n });

export const samples: Sample[] = [
  {
    scenarioId: "dial-tone",
    title: "A bad start, then a recovery",
    about:
      "The lead restarts everything first, which makes it worse, then finds what changed and puts it right.",
    seed: 7,
    moves: [
      say("look at the overall picture"),
      idle(2),
      say("No ETA yet. I will update you in ten minutes.", "cto"),
      say("restart every auth-core node"),
      wait,
      idle(1),
      say("find out what changed on auth-core"),
      wait,
      say("roll back the certificate bundle on the bad nodes"),
      say("Please update the status page: we have an outage.", "comms"),
      say(
        "Outage in two regions, we know the cause, fix under way. Tell customers we are working on it.",
        "support",
      ),
      say("A certificate bundle on auth-core is the cause. Rolling it back now.", "cto"),
      wait,
      say(
        "We are aware of an outage in two regions. We have identified the cause and a fix is under way.",
        "journalist",
      ),
      say("check whether emergency calls were affected"),
      say(
        "This is an availability incident. I see no sign of data exposure so far. I will confirm after the access logs are reviewed.",
        "counsel",
      ),
      wait,
      say("Emergency calling was affected. Please notify the regulator duty line.", "comms"),
      say("verify that service has recovered"),
      wait,
      say("tell the CTO, support and comms: service is restored. All clear."),
    ],
  },
];

export const sampleFor = (scenarioId: string): Sample | undefined =>
  samples.find((s) => s.scenarioId === scenarioId);
