// Text clean-up for the local matcher. Plain string work: no model, no network, no dictionary file.

const CONTRACTIONS: [RegExp, string][] = [
  [/\bwhat's\b/g, "what is"],
  [/\bit's\b/g, "it is"],
  [/\bthat's\b/g, "that is"],
  [/\bthere's\b/g, "there is"],
  [/\bwe're\b/g, "we are"],
  [/\bwe've\b/g, "we have"],
  [/\bi'm\b/g, "i am"],
  [/\bi'll\b/g, "i will"],
  [/\bwe'll\b/g, "we will"],
  [/\bi've\b/g, "i have"],
  [/\bcan't\b/g, "can not"],
  [/\bcannot\b/g, "can not"],
  [/\bwon't\b/g, "will not"],
  [/\bdon't\b/g, "do not"],
  [/\bdoesn't\b/g, "does not"],
  [/\bdidn't\b/g, "did not"],
  [/\bisn't\b/g, "is not"],
  [/\baren't\b/g, "are not"],
  [/\bwasn't\b/g, "was not"],
  [/\bweren't\b/g, "were not"],
  [/\bhaven't\b/g, "have not"],
  [/\bhasn't\b/g, "has not"],
];

// Canonical word first, then the things people type that mean the same.
const SHARED_SYNONYMS: Record<string, string[]> = {
  rollback: [
    "roll back",
    "rolled back",
    "rolling back",
    "revert",
    "reverted",
    "undo",
    "put back",
    "back out",
  ],
  restart: ["reboot", "rebooted", "bounce", "power cycle", "turn off and on", "kick"],
  attack: ["ddos", "dos attack", "attacked", "attacker", "hacked", "hack", "hackers", "intrusion"],
  cert: ["certificate", "certificates", "certs", "tls", "ssl"],
  auth: ["authentication", "sign in", "sign-in", "signin", "log in", "login", "logins"],
  statuspage: ["status page", "status site"],
  emergency: [
    "emergency services",
    "emergency calls",
    "emergency calling",
    "emergency call",
    "emergency lines",
    "911",
    "999",
    "112",
  ],
  log: ["logs", "log files", "logfile"],
  change: ["changed", "changes", "modified", "altered", "different"],
  check: [
    "look at",
    "look into",
    "inspect",
    "examine",
    "investigate",
    "review",
    "verify",
    "see if",
    "find out",
    "confirm",
    "analyse",
    "analyze",
  ],
  deploy: ["deployment", "deployed", "release", "released", "rollout", "rolled out", "shipped"],
  customer: ["customers", "subscribers", "subscriber", "users", "user"],
  traffic: ["requests", "load", "flood"],
  node: ["nodes", "server", "servers", "box", "boxes", "machine", "machines", "host", "hosts"],
};

const STOPWORDS = new Set(
  (
    "a an the to of on in for at by with from into is are was were be been am do does did " +
    "i we you me my our us it this that these those and or but so please can could would should " +
    "will shall may any some there here now right just then also still really very have has had " +
    "get got give let lets go going what which who how when where why whether if as about up out " +
    // Filler that carries no meaning but is rare enough to look meaningful to a ranker.
    "something anything everything nothing thing things stuff lately currently recently around " +
    "someone anyone people all every each more most much many like"
  ).split(" "),
);

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Lower-case, expand contractions, and reduce punctuation to spaces. Keeps digits and colons. */
export function clean(text: string): string {
  let t = text.toLowerCase().replace(/[’‘`]/g, "'");
  for (const [pattern, replacement] of CONTRACTIONS) t = t.replace(pattern, replacement);
  return t
    .replace(/[^a-z0-9:'\- ]+/g, " ")
    .replace(/'/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Replaces every known variant with its canonical word. Longer variants are tried first. */
export function applySynonyms(text: string, extra: Record<string, string[]> = {}): string {
  const pairs: [string, string][] = [];
  for (const table of [SHARED_SYNONYMS, extra]) {
    for (const [canonical, variants] of Object.entries(table)) {
      for (const v of variants) pairs.push([clean(v), canonical]);
    }
  }
  pairs.sort((a, b) => b[0].length - a[0].length);
  let t = ` ${text} `;
  for (const [variant, canonical] of pairs) {
    if (!variant) continue;
    t = t.replace(new RegExp(`(?<![a-z0-9])${escapeRegExp(variant)}(?![a-z0-9])`, "g"), canonical);
  }
  return t.replace(/\s+/g, " ").trim();
}

/** A light stemmer: enough to make "restarting", "restarted" and "restarts" the same word. */
export function stem(word: string): string {
  let w = word;
  if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
  else if (w.length > 4 && /(s|x|z|ch|sh)es$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  if (w.length > 4 && w.endsWith("e")) w = w.slice(0, -1);
  if (w.length > 3 && w.at(-1) === w.at(-2)) w = w.slice(0, -1);
  return w;
}

/** The meaningful words of a text, cleaned, with synonyms applied and stemmed. */
export function tokens(text: string, extra: Record<string, string[]> = {}): string[] {
  return applySynonyms(clean(text), extra)
    .split(" ")
    .map((w) => w.replace(/^-+|-+$/g, ""))
    .filter((w) => w.length > 0 && !STOPWORDS.has(w))
    .map(stem);
}

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 40,
  "forty-five": 45,
  sixty: 60,
  couple: 2,
  few: 3,
};

/**
 * Finds a time the player committed to, in minutes from now. Understands "in ten minutes",
 * "within 15 min", "in half an hour", "within the hour" and "by 02:30".
 */
export function minutesFromNow(text: string, nowClockMinutes: number): number | null {
  const t = clean(text);
  const byClock = /\b(?:by|at|before)\s+(\d{1,2}):(\d{2})\b/.exec(t);
  if (byClock) {
    const target = Number(byClock[1]) * 60 + Number(byClock[2]);
    const diff = (((target - nowClockMinutes) % 1440) + 1440) % 1440;
    return diff > 0 && diff <= 720 ? diff : null;
  }
  // `t` has single spaces only (see clean), so these patterns use literal spaces.
  if (/\b(?:in|within) half an? hour\b/.test(t)) return 30;
  if (/\bwithin the hour\b/.test(t)) return 60;
  const amount =
    /\b(?:in|within|give me|need) (?:about |another |a )?(\d{1,3}|[a-z-]{1,12}) (?:more )?(min|mins|minute|minutes|hour|hours)\b/.exec(
      t,
    );
  if (!amount) return null;
  const raw = amount[1] ?? "";
  const n = /^\d+$/.test(raw) ? Number(raw) : NUMBER_WORDS[raw];
  if (n === undefined || n <= 0) return null;
  const minutes = (amount[2] ?? "").startsWith("hour") ? n * 60 : n;
  return minutes <= 720 ? minutes : null;
}
