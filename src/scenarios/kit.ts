// The shared kit: the people, questions, duties and lines that most situations have in common,
// written once (DL-28). A situation takes what fits, renames it and adds what is its own.
// Nothing here decides anything: these are builders for the same plain data a situation could
// write out by hand.
import type { Beat, Directive, Lesson, Scenario, Stakeholder } from "../engine/schema.js";
import { say, type Step } from "../engine/playthrough.js";

type Obligation = Scenario["obligations"][number];

/**
 * The person who carries out what the player orders. The engine and the interface know this
 * person by the id "engineer" and by name, so it is the same Mika in every situation: the one
 * colleague who is always on shift with you.
 */
export const mika = (role = "Engineer on shift"): Stakeholder => ({
  id: "engineer",
  name: "Mika Tan",
  role,
  wants: "Clear orders",
  voice: "Factual. Reports what the screen says. Asks when an order is unclear.",
  patienceMinutes: 0,
  startTrust: 70,
  channel: "chat",
  audience: "internal",
});

/** The kinds of people who turn up in an incident, with how they write and how long they wait. */
const KINDS = {
  /**
   * Whoever the player answers to. The id is "cto" in every situation because the engine ends
   * the session when this person's trust runs out, whatever their title is.
   */
  boss: {
    id: "cto",
    wants: "To know how bad it is, then to be kept informed",
    voice:
      "Two sentences at most. Wants a time. Stops being polite when a promised time is missed.",
    patienceMinutes: 5,
    startTrust: 60,
    channel: "chat",
    audience: "internal",
    aliases: ["the boss", "my boss"],
  },
  support: {
    id: "support",
    wants: "One true line the front line can say",
    voice: "Practical and tired. Gives numbers.",
    patienceMinutes: 8,
    startTrust: 60,
    channel: "chat",
    audience: "internal",
    aliases: ["support", "support lead", "head of support", "customer support", "helpdesk"],
  },
  counsel: {
    id: "counsel",
    wants: "The facts in writing, and what each one is based on",
    voice: "Precise closed questions. Writes down the answers.",
    patienceMinutes: 10,
    startTrust: 60,
    channel: "email",
    audience: "sensitive",
    aliases: ["counsel", "legal", "lawyer", "lawyers", "general counsel"],
  },
  comms: {
    id: "comms",
    wants: "Approved wording, and nothing public that is wrong",
    voice: "Careful. Wants wording approved before it goes out.",
    patienceMinutes: 8,
    startTrust: 60,
    channel: "chat",
    audience: "internal",
    aliases: ["comms", "communications", "pr", "pr team", "comms lead"],
  },
  journalist: {
    id: "journalist",
    wants: "A comment before the deadline",
    voice: "Courteous, on a deadline, quotes exactly.",
    patienceMinutes: 19,
    startTrust: 50,
    channel: "press",
    audience: "press",
    aliases: ["journalist", "reporter", "press", "media", "newspaper"],
  },
  regulator: {
    id: "regulator",
    wants: "A notification, on time",
    voice: "Formal. Only calls when something is missing.",
    patienceMinutes: 15,
    startTrust: 60,
    channel: "chat",
    audience: "sensitive",
    aliases: ["regulator", "authority"],
  },
  /** Someone outside the company who is affected and wants to know what to do. */
  customer: {
    id: "customer",
    wants: "To know what to tell their own people",
    voice: "Worried and specific about what is failing.",
    patienceMinutes: 10,
    startTrust: 60,
    channel: "email",
    audience: "sensitive",
    aliases: [],
  },
  /** Someone outside the company who holds part of the answer: a vendor, a researcher. */
  outsider: {
    id: "outsider",
    wants: "An answer, and to know they were heard",
    voice: "Polite and exact. Has seen this before.",
    patienceMinutes: 15,
    startTrust: 55,
    channel: "email",
    audience: "sensitive",
    aliases: [],
  },
} satisfies Record<string, Omit<Stakeholder, "name" | "role">>;

export type Kind = keyof typeof KINDS;

/**
 * One person of a kind. Give the name and the role; anything else replaces the kind's default.
 * Aliases are added to the kind's own, so "the reporter" works everywhere.
 */
export function person(
  kind: Kind,
  who: Pick<Stakeholder, "name" | "role"> & Partial<Omit<Stakeholder, "name" | "role">>,
): Stakeholder {
  const base: Omit<Stakeholder, "name" | "role"> = KINDS[kind];
  return {
    ...base,
    ...who,
    aliases: [...new Set([...(base.aliases ?? []), ...(who.aliases ?? [])])],
  };
}

/** Ways of asking the questions that open most incidents. Added to a situation's own wording. */
export const ASKS = {
  overview: [
    "What are we seeing right now?",
    "Give me an overview of the situation",
    "Quick look at the whole picture",
    "What do we know so far?",
    "Where do things stand?",
  ],
  whatChanged: [
    "What changed recently?",
    "What was the last change before this started?",
    "Has anything been changed or deployed lately?",
    "Check the change history",
    "Who touched this last, and when?",
  ],
  whoIsAffected: [
    "Who is affected?",
    "How many people does this touch?",
    "What is the scope of this?",
    "How big is this?",
    "Which customers are hit?",
  ],
  isItOver: [
    "Is it over?",
    "Confirm that it is fixed",
    "Verify the fix worked",
    "Are we back to normal?",
    "Check that nothing is still going wrong",
  ],
} as const;

/** The all-clear: a message, not a system. The same in every situation. */
export const allClear = (label = "Send the all-clear"): Directive => ({
  id: "all-clear",
  label,
  examples: [
    "Tell everyone it is over",
    "Send the all-clear",
    "Let them know it's resolved",
    "Incident is over, tell the team",
    "Announce that it is dealt with",
    "It is closed. All clear.",
    "All clear",
  ],
});

/** The duty to send the all-clear once the end is confirmed. */
export const allClearDuty = (confirmedClue: string, toAll: string[]): Obligation => ({
  id: "all-clear",
  label: "All-clear sent",
  trigger: { type: "clue", id: confirmedClue },
  withinMinutes: 10,
  satisfiedBy: { directive: "all-clear", toAll },
});

/** The boss stating a missed time exactly. `first` is their first name. */
export const bossMissed = (first: string, title: string): Beat => ({
  id: "cto-missed",
  from: "cto",
  channel: "chat",
  when: { condition: { type: "commitmentBroken", to: "cto" } },
  purpose: "State the missed time exactly",
  facts: [`${title} was promised an update by {brokenDue} and did not get one.`],
  fallbackText: `${first}: You said I would hear from you by {brokenDue}. I did not.`,
});

/** The boss asking again when the first message went unanswered. */
export const bossAsksAgain = (first: string, atMinute: number, question: string): Beat => ({
  id: "cto-again",
  from: "cto",
  channel: "chat",
  when: { atMinute },
  unless: { type: "not", of: { type: "unanswered", who: "cto" } },
  purpose: "Ask again, because the first message was not answered",
  facts: ["Ten minutes have passed with no answer."],
  fallbackText: `${first}: Ten minutes are up. ${question}`,
});

/** The lesson every situation shares: a promised time that was missed. */
export const brokePromise: Lesson = {
  id: "broke-a-promise",
  kind: "fell",
  when: { type: "commitmentBroken" },
  text: "You promised an update by a set time and missed it. A missed time costs more trust than saying 'no ETA yet'.",
  evidence: { type: "commitment_broken" },
};

/** A holding message to the boss, for scripted sessions that need to stay alive. */
export const holding = (atMinute: number): Step =>
  say(atMinute, {
    kind: "communicate",
    to: ["cto"],
    text: "Still working it. Next update shortly.",
  });
