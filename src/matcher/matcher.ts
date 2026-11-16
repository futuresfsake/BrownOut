// The local matcher: turns what the player typed into intents the engine accepts.
// No model and no network. See docs/03-design/local-play.md.
import { parseClock } from "../engine/clock.js";
import type { Intent, Scenario, Stance } from "../engine/schema.js";
import { clean, minutesFromNow, tokens } from "./text.js";

export interface Candidate {
  label: string;
  intent: Intent;
  score: number;
}

export type Reading =
  /** Understood. `unread` lists parts of the input that were not. */
  | { kind: "act"; intents: Intent[]; restatements: string[]; unread: string[] }
  /** Two or three things it could mean. Costs the player nothing until they choose. */
  | { kind: "choose"; candidates: Candidate[] }
  /** Nothing close. `suggestions` are the nearest things the player could do. */
  | { kind: "unknown"; suggestions: Candidate[] }
  | { kind: "control"; control: "wait" | "cancelTask" };

export interface ReadContext {
  /** Sim minutes since the start, used to turn "by 02:30" into a due time. */
  minute: number;
  /** Set when the text was typed as a reply inside someone's thread. */
  threadId?: string | undefined;
}

// Tuning. Raised or lowered against the accuracy sets in tests, never by feel.
export const THRESHOLDS = {
  act: 0.5, // at or above this, with a clear lead, just do it
  lead: 0.1, // how far ahead of the runner-up the winner must be
  ask: 0.24, // at or above this, ask "did you mean"
  directive: 0.3, // a request inside a message to someone
} as const;

const WATCHED = ["cto", "support", "comms"];

// Stemmed verbs that mean "change something", as opposed to "look at something".
const CHANGE_VERBS = new Set(
  "rollback restart drain block throttl limit remov disabl enabl push kil stop cut drop send notify post publish updat redeploy switch shut delet wipe eras mov move renam lock clos paus freez revert undo revok".split(
    " ",
  ),
);

// Verbs that say "do the thing" without saying which thing.
const GENERIC_VERBS = new Set("check pull show see run make take put grab read".split(" "));

interface Option {
  type: "investigate" | "mitigate" | "directive";
  id: string;
  label: string;
  phrases: string[][];
}

interface Index {
  options: Option[];
  idf: Map<string, number>;
  unseen: number;
  aliases: { id: string; pattern: RegExp }[];
  topics: { id: string; phrases: string[][] }[];
}

const indexes = new WeakMap<Scenario, Index>();
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function buildIndex(sc: Scenario): Index {
  const syn = sc.synonyms ?? {};
  const option = (
    type: Option["type"],
    o: { id: string; label: string; examples: string[] },
  ): Option => ({
    type,
    id: o.id,
    label: o.label,
    phrases: [o.label, ...o.examples].map((p) => tokens(p, syn)).filter((p) => p.length > 0),
  });
  const options = [
    ...sc.investigations.map((o) => option("investigate", o)),
    ...sc.mitigations.map((o) => option("mitigate", o)),
    ...sc.directives.map((o) => option("directive", o)),
  ];
  // Words that appear in few options tell them apart, so they count for more.
  const df = new Map<string, number>();
  for (const o of options) {
    for (const t of new Set(o.phrases.flat())) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const idf = new Map<string, number>();
  for (const [t, n] of df) idf.set(t, Math.log(1 + options.length / n));
  const aliases = sc.stakeholders
    .filter((s) => s.id !== "engineer")
    .map((s) => {
      const words = [s.name, ...s.name.split(" "), ...(s.aliases ?? [])].map(clean).filter(Boolean);
      const alternatives = [...new Set(words)]
        .sort((a, b) => b.length - a.length)
        .map(escapeRegExp);
      return {
        id: s.id,
        pattern: new RegExp(`(?<![a-z0-9])(?:${alternatives.join("|")})(?![a-z0-9])`),
      };
    });
  const topics = sc.claimTopics.map((t) => ({
    id: t.id,
    phrases: (t.phrases ?? []).map((p) => tokens(p, syn)).filter((p) => p.length > 0),
  }));
  return { options, idf, unseen: Math.log(1 + options.length), aliases, topics };
}

function indexOf(sc: Scenario): Index {
  let index = indexes.get(sc);
  if (!index) {
    index = buildIndex(sc);
    indexes.set(sc, index);
  }
  return index;
}

/** Cosine similarity over words weighted by rarity. Words the scenario never uses still count against. */
function similarity(index: Index, a: string[], b: string[]): number {
  const weight = (t: string) => index.idf.get(t) ?? index.unseen;
  const setA = new Set(a);
  const setB = new Set(b);
  let shared = 0;
  let normA = 0;
  let normB = 0;
  for (const t of setA) {
    normA += weight(t) ** 2;
    if (setB.has(t)) shared += weight(t) ** 2;
  }
  for (const t of setB) normB += weight(t) ** 2;
  return normA === 0 || normB === 0 ? 0 : shared / Math.sqrt(normA * normB);
}

function defaultRecipients(sc: Scenario, directiveId: string): string[] {
  const directive = sc.directives.find((d) => d.id === directiveId);
  const first = directive?.toAny?.[0];
  if (first) return [first];
  return WATCHED.filter((id) => sc.stakeholders.some((s) => s.id === id));
}

function toIntent(sc: Scenario, o: Option, text?: string): Intent {
  if (o.type === "investigate") return { kind: "investigate", id: o.id };
  if (o.type === "mitigate") return { kind: "mitigate", id: o.id };
  return {
    kind: "communicate",
    to: defaultRecipients(sc, o.id),
    text: text ?? `${o.label}.`,
    directives: [o.id],
  };
}

function rank(sc: Scenario, index: Index, words: string[], only?: Option["type"]): Candidate[] {
  return index.options
    .filter((o) => !only || o.type === only)
    .map((o) => ({
      label: o.label,
      intent: toIntent(sc, o),
      score: Math.max(0, ...o.phrases.map((p) => similarity(index, words, p))),
    }))
    .sort((a, b) => b.score - a.score);
}

const names = (sc: Scenario, ids: string[]) =>
  ids.map((id) => sc.stakeholders.find((s) => s.id === id)?.name ?? id).join(", ");

const EVERYONE = /\b(everyone|everybody|all of them|the team|all stakeholders|them all)\b/;

function findRecipients(sc: Scenario, index: Index, cleaned: string): string[] {
  const found = index.aliases.filter((a) => a.pattern.test(cleaned)).map((a) => a.id);
  if (EVERYONE.test(cleaned)) {
    for (const id of WATCHED) {
      if (sc.stakeholders.some((s) => s.id === id) && !found.includes(id)) found.push(id);
    }
  }
  return found;
}

const QUESTION =
  /\?\s*$|^(?:is|are|was|were|do|does|did|can|could|has|have|what|why|how|who|when|where|which)\b/;
const UNCERTAIN =
  /\b(?:might|may|maybe|possibly|perhaps|unsure|not sure|do not know|unknown|unclear|investigating|looking into|checking|so far|not yet|yet|to be confirmed|can not confirm|too early|early to say|will confirm)\b/;
const NEGATIVE =
  /\b(?:no|not|never|none|nothing|without|unaffected|unrelated|fine|safe|secure|normal|working|ok|okay|ruled out|rule out)\b/;

/**
 * Statements of fact in a message. A statement is asserted or denied by its own sentence: "we
 * know the cause. Tell customers we are working on it" does not deny the cause because the next
 * sentence says "working". A hedge anywhere in the message softens all of it. The quoted text is
 * always the whole message, as the player wrote it.
 */
function findClaims(index: Index, raw: string, wordsOf: (text: string) => string[]) {
  const whole = clean(raw);
  if (QUESTION.test(raw.trim()) || QUESTION.test(whole)) return [];
  const hedged = UNCERTAIN.test(whole);
  const found = new Map<string, Stance>();
  for (const sentence of raw.split(/(?<=[.!?;])\s+/)) {
    const have = new Set(wordsOf(sentence));
    const stance: Stance = hedged
      ? "uncertain"
      : NEGATIVE.test(clean(sentence))
        ? "denies"
        : "asserts";
    for (const t of index.topics) {
      if (found.has(t.id)) continue;
      if (t.phrases.some((p) => p.every((w) => have.has(w)))) found.set(t.id, stance);
    }
  }
  return index.topics
    .filter((t) => found.has(t.id))
    .map((t) => ({ topic: t.id, stance: found.get(t.id) as Stance, text: raw.trim() }));
}

const WILL =
  /\b(?:i|we) will (?:update|call|get back|let you know|come back|report back|confirm|message|email|ring)\b/;

function findPromises(sc: Scenario, raw: string, to: string[], minute: number) {
  const due = minutesFromNow(raw, parseClock(sc.startClock) + minute);
  if (due === null && !WILL.test(clean(raw))) return [];
  return to.map((who) => ({ to: who, what: "an update", dueInMinutes: due }));
}

type ClauseResult =
  | { kind: "act"; intent: Intent; restatement: string }
  | { kind: "choose"; candidates: Candidate[] }
  | { kind: "unknown"; suggestions: Candidate[] }
  | { kind: "control"; control: "wait" | "cancelTask" };

// Applied to text whose whitespace is already single spaces, so no repeated-whitespace groups.
const TO_MIKA = /^(?:mika[,:]? ?|(?:tell|ask|have|get) mika (?:to )?)/i;

/** The start of something said to a person, as opposed to something done. */
const SPEECH =
  /^(?:please )?(?:tell|ask|let|notify|call|email|message|reply|update|inform|warn|brief|thank|phone|ring|contact|answer|respond)\b/;
/** "... to the", just before a name: "report this to the regulator". */
const TO_SOMEONE = /\bto(?: the| our| my)? $/;

/**
 * The one option that the words name exactly: the same words as its label or as one of its
 * example phrasings, in any order. Typing an option's own name is never a question, however
 * many other options share some of its words. One word is not enough.
 */
function exactly(index: Index, words: string[], allow: (o: Option) => boolean): Option | null {
  const typed = new Set(words);
  if (typed.size < 2) return null;
  const same = index.options.filter(
    (o) =>
      allow(o) &&
      o.phrases.some((p) => {
        const phrase = new Set(p);
        return phrase.size === typed.size && [...phrase].every((w) => typed.has(w));
      }),
  );
  return same.length === 1 ? (same[0] ?? null) : null;
}

type ClearAction =
  | { kind: "act"; result: ClauseResult }
  | { kind: "ask"; candidates: Candidate[] }
  | { kind: "none" };

/**
 * Whether the words plainly name something to look at or something to change. Only those two:
 * a request to a person is a message, and is handled as one.
 */
function clearAction(
  sc: Scenario,
  index: Index,
  raw: string,
  cleaned: string,
  words: string[],
): ClearAction {
  const exact = exactly(index, words, (o) => o.type !== "directive");
  if (exact) {
    return {
      kind: "act",
      result: {
        kind: "act",
        intent: toIntent(sc, exact),
        restatement: `Ask Mika: ${exact.label}`,
      },
    };
  }
  const inquiry = QUESTION.test(raw.trim()) || QUESTION.test(cleaned) || words.includes("check");
  const change = words.some((w) => CHANGE_VERBS.has(w));
  const ranked = index.options
    .filter((o) => o.type !== "directive")
    .map((o) => {
      const looks = o.type === "investigate";
      const base = Math.max(0, ...o.phrases.map((p) => similarity(index, words, p)));
      const factor =
        inquiry && !change ? (looks ? 1.15 : 0.7) : change && !inquiry ? (looks ? 0.85 : 1.1) : 1;
      return { label: o.label, intent: toIntent(sc, o), score: Math.min(1, base * factor) };
    })
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best) return { kind: "none" };
  if (
    words.length >= 2 &&
    best.score >= THRESHOLDS.act &&
    best.score - (ranked[1]?.score ?? 0) >= THRESHOLDS.lead
  ) {
    return {
      kind: "act",
      result: { kind: "act", intent: best.intent, restatement: `Ask Mika: ${best.label}` },
    };
  }
  if (inquiry && best.score >= THRESHOLDS.ask) {
    return { kind: "ask", candidates: ranked.filter((c) => c.score >= THRESHOLDS.ask) };
  }
  return { kind: "none" };
}

function readClause(sc: Scenario, index: Index, rawClause: string, ctx: ReadContext): ClauseResult {
  const spaced = rawClause.replace(/\s+/g, " ").trim();
  const addressedToMika = TO_MIKA.test(spaced);
  const raw = spaced.replace(TO_MIKA, "");
  const cleaned = clean(raw);
  const words = tokens(raw, sc.synonyms ?? {});

  if (!ctx.threadId && words.length <= 4) {
    // "hold" and "cancel" also begin orders ("hold the payouts", "cancel the campaign"), so as
    // controls they must be the whole of what was typed, or be followed only by "it" or "that".
    if (
      /^(?:wait|hold on|stand by|standby|do nothing|sit tight)\b/.test(cleaned) ||
      /^hold(?: it| off| that)?$/.test(cleaned)
    ) {
      return { kind: "control", control: "wait" };
    }
    if (
      /^(?:cancel|abort)(?: it| that| this| the task| the job| what mika is doing)?$/.test(
        cleaned,
      ) ||
      /^(?:stop that|stop it|stop mika|never mind|scrap that)\b/.test(cleaned)
    ) {
      return { kind: "control", control: "cancelTask" };
    }
  }

  const inThread = ctx.threadId !== undefined && ctx.threadId !== "engineer";
  const mentioned = addressedToMika ? [] : findRecipients(sc, index, cleaned);
  // Naming someone is not always writing to them: "who is this researcher?" is a question about
  // her, and "only the researcher has the files", typed to counsel, is a statement to counsel.
  // Text is addressed when it opens with a verb of speech or a name, or says "to" someone.
  const addressed =
    mentioned.length > 0 &&
    (SPEECH.test(cleaned) ||
      // "everyone" and "the team" are only ever people being told something.
      EVERYONE.test(cleaned) ||
      index.aliases.some((a) => {
        const found = a.pattern.exec(cleaned);
        return (
          found !== null && (found.index === 0 || TO_SOMEONE.test(cleaned.slice(0, found.index)))
        );
      }));
  let recipients = mentioned;
  if (inThread && ctx.threadId) {
    // A reply in a thread goes to that person. Others are added only when it is addressed to them.
    recipients = addressed ? [...new Set([ctx.threadId, ...mentioned])] : [ctx.threadId];
  }

  // Someone is named but not addressed, in the decision box. If the words fit something to look
  // at or to change, that is what was meant. If it is a question that fits nothing clearly, the
  // player is asked, with writing to the person as one of the choices.
  if (!inThread && recipients.length > 0 && !addressed) {
    const action = clearAction(sc, index, raw, cleaned, words);
    if (action.kind === "act") return action.result;
    if (action.kind === "ask") {
      const write: Candidate = {
        label: `Write to ${names(sc, recipients)}`,
        intent: { kind: "communicate", to: recipients, text: raw },
        score: 0,
      };
      return { kind: "choose", candidates: [...action.candidates.slice(0, 2), write] };
    }
  }

  if (recipients.length > 0) {
    const request = rank(sc, index, words, "directive")[0];
    const directives =
      request && request.score >= THRESHOLDS.directive ? request.intent : undefined;
    const claims = findClaims(index, raw, (text) => tokens(text, sc.synonyms ?? {}));
    const promises = findPromises(sc, raw, recipients, ctx.minute);
    const intent: Intent = {
      kind: "communicate",
      to: recipients,
      text: raw,
      ...(directives?.kind === "communicate" && directives.directives
        ? { directives: directives.directives }
        : {}),
      ...(claims.length > 0 ? { claims } : {}),
      ...(promises.length > 0 ? { promises } : {}),
    };
    const asked =
      request && request.score >= THRESHOLDS.directive ? ` (asks: ${request.label})` : "";
    return { kind: "act", intent, restatement: `To ${names(sc, recipients)}${asked}` };
  }

  // A question is a request to look, never a request to change something. An instruction with a
  // change verb is the reverse. This separates "did the billing release cause this?" from
  // "roll back the billing release", which share most of their words.
  const inquiry =
    QUESTION.test(raw.trim()) ||
    QUESTION.test(cleaned) ||
    words.includes("check") ||
    /\b(?:show|see)\b/.test(cleaned);
  const change = words.some((w) => CHANGE_VERBS.has(w));
  const bias = (c: Candidate): number => {
    const looks = c.intent.kind === "investigate";
    if (inquiry && !change) return c.score * (looks ? 1.15 : 0.7);
    if (change && !inquiry) return c.score * (looks ? 0.85 : 1.1);
    return c.score;
  };
  const exact = exactly(index, words, () => true);
  if (exact) {
    const intent = toIntent(sc, exact, raw);
    return {
      kind: "act",
      intent,
      restatement:
        intent.kind === "communicate"
          ? `To ${names(sc, intent.to)} (asks: ${exact.label})`
          : `Ask Mika: ${exact.label}`,
    };
  }
  const ranked = rank(sc, index, words)
    .map((c) => ({ ...c, score: Math.min(1, bias(c)) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const second = ranked[1];
  if (!best || best.score < THRESHOLDS.ask)
    return { kind: "unknown", suggestions: ranked.slice(0, 3) };
  // A short request that fits two or more options equally well ("check the logs", when there are
  // two kinds of log) is a question for the player, however the ranking happens to fall.
  const content = words.filter((w) => !GENERIC_VERBS.has(w));
  if (content.length > 0 && content.length <= 2) {
    const covering = new Set(
      index.options
        .filter((o) => {
          // A question can only be confused with other things to look at, and an instruction
          // only with other things to change.
          const looks = o.type === "investigate";
          if (inquiry && !change && !looks) return false;
          if (change && !inquiry && looks) return false;
          const vocabulary = new Set(o.phrases.flat());
          return content.every((w) => vocabulary.has(w));
        })
        .map((o) => o.label),
    );
    if (covering.size >= 2) {
      return {
        kind: "choose",
        candidates: ranked.filter((c) => covering.has(c.label)).slice(0, 3),
      };
    }
  }
  // One word is never enough to act on. It can only be offered back as a question.
  const enoughToAct = words.length >= 2;
  if (
    enoughToAct &&
    best.score >= THRESHOLDS.act &&
    best.score - (second?.score ?? 0) >= THRESHOLDS.lead
  ) {
    const intent = best.intent.kind === "communicate" ? { ...best.intent, text: raw } : best.intent;
    const restatement =
      intent.kind === "communicate"
        ? `To ${names(sc, intent.to)} (asks: ${best.label})`
        : `Ask Mika: ${best.label}`;
    return { kind: "act", intent, restatement };
  }
  const close = ranked.filter((c) => c.score >= THRESHOLDS.ask && best.score - c.score <= 0.15);
  return { kind: "choose", candidates: close.slice(0, 3) };
}

// A second instruction inside one input: "..., and tell the CTO ...".
const SPLIT =
  /\s*[,;.]?\s+(?:and then|and also|and|then|also)\s+(?=(?:tell|ask|let|notify|call|email|message|reply|update|inform|have|get)\s)/i;

/** Reads what the player typed. Pure: the same scenario, text and context give the same reading. */
export function read(sc: Scenario, text: string, ctx: ReadContext): Reading {
  const index = indexOf(sc);
  const input = text.slice(0, 600).trim();
  if (input.length === 0) return { kind: "unknown", suggestions: rank(sc, index, []).slice(0, 3) };

  const clauses = ctx.threadId
    ? [input]
    : input
        .split(SPLIT)
        .filter((c) => c.trim().length > 0)
        .slice(0, 3);
  const results = clauses.map((clause) => ({ clause, result: readClause(sc, index, clause, ctx) }));
  const first = results[0];
  if (!first) return { kind: "unknown", suggestions: [] };

  const acts = results.filter((r) => r.result.kind === "act");
  if (acts.length === 0 || results.length === 1) {
    const r = first.result;
    if (r.kind === "act") {
      return { kind: "act", intents: [r.intent], restatements: [r.restatement], unread: [] };
    }
    return r;
  }
  const intents: Intent[] = [];
  const restatements: string[] = [];
  const unread: string[] = [];
  for (const { clause, result } of results) {
    if (result.kind === "act") {
      intents.push(result.intent);
      restatements.push(result.restatement);
    } else {
      unread.push(clause.trim());
    }
  }
  return { kind: "act", intents, restatements, unread };
}
