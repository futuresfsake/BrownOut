// A whole session of Dial Tone as a player would type it, ending resolved with seed 7.
// The unit tests run it through the game functions and the browser tests type it into the page,
// so both prove the same thing: the game can be won by typing.

export interface TypedStep {
  text: string;
  /** Set when the text is typed as a reply inside this person's thread. */
  thread?: string;
}

export const SEED = 7;

export const resolvedPlay: TypedStep[] = [
  { text: "look at the overall picture" },
  { text: "No ETA yet. I will update you in ten minutes.", thread: "cto" },
  { text: "find out what changed on auth-core" },
  { text: "wait" },
  { text: "roll back the certificate bundle on the bad nodes" },
  { text: "Please update the status page: we have an outage.", thread: "comms" },
  {
    text: "Outage in two regions, we know the cause, fix under way. Tell customers we are working on it.",
    thread: "support",
  },
  { text: "A certificate bundle on auth-core is the cause. Rolling it back now.", thread: "cto" },
  { text: "wait" },
  {
    text: "We are aware of an outage in two regions. We have identified the cause and a fix is under way.",
    thread: "journalist",
  },
  { text: "check whether emergency calls were affected" },
  {
    text: "This is an availability incident. I see no sign of data exposure so far. I will confirm after the access logs are reviewed.",
    thread: "counsel",
  },
  {
    text: "Emergency calling was affected. Please notify the regulator duty line.",
    thread: "comms",
  },
  { text: "wait" },
  { text: "verify that service has recovered" },
  { text: "wait" },
  { text: "tell the CTO, support and comms: service is restored. All clear." },
];
