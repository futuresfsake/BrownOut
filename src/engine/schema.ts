// The scenario format and the intent format, as zod schemas. See docs/03-design/scenario-format.md.
// A scenario is data only: no code, no free-form expressions. Conditions are a small fixed set.
import { z } from "zod";

export type Stance = "asserts" | "denies" | "uncertain";
export type Truth = "true" | "false" | "unknowable";
export type SystemStatus = "ok" | "degraded" | "down";
export type ObligationState = "dormant" | "open" | "met" | "late" | "missed";

// Optional fields carry `| undefined` so that zod's output type and this type agree under
// exactOptionalPropertyTypes.
export type Condition =
  | { type: "clue"; id: string }
  | { type: "mitigation"; id: string }
  | { type: "investigation"; id: string }
  | { type: "metricAbove"; id: string; value: number }
  | { type: "metricBelow"; id: string; value: number }
  | { type: "minuteAtLeast"; value: number }
  | {
      type: "claim";
      topic: string;
      stance?: Stance | undefined;
      truth?: Truth | undefined;
      supported?: boolean | undefined;
      to?: string | undefined;
      /** Whether the player has since taken the statement back themselves. */
      corrected?: boolean | undefined;
    }
  | { type: "trustBelow"; who: string; value: number }
  | { type: "beatFired"; id: string }
  | { type: "commitmentBroken"; to?: string | undefined }
  | { type: "directiveSent"; id: string; to?: string | undefined }
  | { type: "unanswered"; who: string }
  | { type: "obligation"; id: string; state: ObligationState }
  | { type: "all"; of: Condition[] }
  | { type: "any"; of: Condition[] }
  | { type: "not"; of: Condition };

const id = z.string().min(1);
const minutes = z.number().int().min(0);
const stance = z.enum(["asserts", "denies", "uncertain"]);
const truth = z.enum(["true", "false", "unknowable"]);
const systemStatus = z.enum(["ok", "degraded", "down"]);
const obligationState = z.enum(["dormant", "open", "met", "late", "missed"]);

export const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.strictObject({ type: z.literal("clue"), id }),
    z.strictObject({ type: z.literal("mitigation"), id }),
    z.strictObject({ type: z.literal("investigation"), id }),
    z.strictObject({ type: z.literal("metricAbove"), id, value: z.number() }),
    z.strictObject({ type: z.literal("metricBelow"), id, value: z.number() }),
    z.strictObject({ type: z.literal("minuteAtLeast"), value: minutes }),
    z.strictObject({
      type: z.literal("claim"),
      topic: id,
      stance: stance.optional(),
      truth: truth.optional(),
      supported: z.boolean().optional(),
      to: id.optional(),
      corrected: z.boolean().optional(),
    }),
    z.strictObject({ type: z.literal("trustBelow"), who: id, value: z.number() }),
    z.strictObject({ type: z.literal("beatFired"), id }),
    z.strictObject({ type: z.literal("commitmentBroken"), to: id.optional() }),
    z.strictObject({ type: z.literal("directiveSent"), id, to: id.optional() }),
    z.strictObject({ type: z.literal("unanswered"), who: id }),
    z.strictObject({ type: z.literal("obligation"), id, state: obligationState }),
    z.strictObject({ type: z.literal("all"), of: z.array(ConditionSchema) }),
    z.strictObject({ type: z.literal("any"), of: z.array(ConditionSchema) }),
    z.strictObject({ type: z.literal("not"), of: ConditionSchema }),
  ]),
);

// What the player (or the interpreter in M2) asks the engine to do.
export const IntentSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("investigate"), id }),
  z.strictObject({ kind: z.literal("mitigate"), id }),
  z.strictObject({
    kind: z.literal("communicate"),
    to: z.array(id).min(1),
    text: z.string().optional(),
    directives: z.array(id).optional(),
    claims: z.array(z.strictObject({ topic: id, stance, text: z.string() })).optional(),
    promises: z
      .array(
        z.strictObject({
          to: id,
          what: z.string(),
          dueInMinutes: z.number().int().positive().nullable(),
        }),
      )
      .optional(),
  }),
  z.strictObject({ kind: z.literal("other"), text: z.string().optional() }),
]);
export type Intent = z.infer<typeof IntentSchema>;

// How a metric moves once a "mode" is active. Segments run in order from the moment of the
// switch. `curve` ignores the switch time and follows scenario minutes.
const SegmentSchema = z.union([
  z.strictObject({
    kind: z.literal("curve"),
    points: z.array(z.tuple([z.number(), z.number()])).min(1),
  }),
  z.strictObject({
    kind: z.literal("ramp"),
    over: z.number().positive(),
    to: z.number().optional(),
    toFactor: z.number().optional(),
  }),
  z.strictObject({ kind: z.literal("hold"), for: z.number().positive().optional() }),
  z.strictObject({ kind: z.literal("follow"), mode: id, multiplier: z.number().optional() }),
]);
export type Segment = z.infer<typeof SegmentSchema>;

const StakeholderSchema = z.strictObject({
  id,
  name: z.string().min(1),
  role: z.string().min(1),
  wants: z.string().min(1),
  voice: z.string().min(1),
  // Minutes before an unanswered message starts to cost trust. 0 means replies are not expected.
  patienceMinutes: minutes,
  startTrust: z.number().min(0).max(100),
  channel: z.enum(["chat", "email", "press"]),
  // Who is hurt most by a false statement. Used by scoring.
  audience: z.enum(["internal", "sensitive", "press"]),
  // Other ways a player might refer to this person: "legal", "the reporter". Used by the matcher.
  aliases: z.array(z.string().min(1)).optional(),
});

const SystemSchema = z.strictObject({
  id,
  label: z.string().min(1),
  start: systemStatus,
  labels: z.record(z.string(), z.string()).optional(),
});

const MetricSchema = z.strictObject({
  id,
  label: z.string().min(1),
  visibleWhen: ConditionSchema.nullable(),
  derive: z
    .union([
      z.strictObject({
        kind: z.literal("delayedDivide"),
        from: id,
        delayMinutes: minutes,
        divisor: z.number().positive(),
      }),
      z.strictObject({ kind: z.literal("saturating"), from: id, k: z.number().positive() }),
    ])
    .optional(),
});

const ClueSchema = z.strictObject({
  id,
  kind: z.enum(["true", "redHerring", "symptom"]),
  fact: z.string().min(1),
  // Words that must not appear in written text before this clue is revealed.
  leakTerms: z.array(z.string().min(1)).min(1),
});

const InvestigationSchema = z.strictObject({
  id,
  label: z.string().min(1),
  examples: z.array(z.string().min(1)),
  durationMinutes: z.number().int().min(1),
  requires: ConditionSchema.optional(),
  reveals: z.array(id),
  // Reveal only if this holds when the task finishes; otherwise `notYetText` is shown.
  revealsWhen: ConditionSchema.optional(),
  resultPurpose: z.string().min(1),
  resultText: z.string().min(1),
  notYetText: z.string().optional(),
  facts: z.array(z.string()).optional(),
});

const MitigationSchema = z.strictObject({
  id,
  label: z.string().min(1),
  examples: z.array(z.string().min(1)),
  durationMinutes: z.number().int().min(1),
  requires: ConditionSchema.optional(),
  kind: z.enum(["fix", "partial", "noEffect", "harmful"]),
  onStart: z.strictObject({ mode: id }).optional(),
  onComplete: z.strictObject({
    mode: id.optional(),
    systems: z.record(z.string(), systemStatus).optional(),
  }),
  resultPurpose: z.string().min(1),
  resultText: z.string().min(1),
  facts: z.array(z.string()).optional(),
});

const DirectiveSchema = z.strictObject({
  id,
  label: z.string().min(1),
  examples: z.array(z.string().min(1)),
  // Only these stakeholders can carry it out. Absent means anyone.
  toAny: z.array(id).optional(),
  effects: z.strictObject({ systems: z.record(z.string(), systemStatus) }).optional(),
});

const ClaimTopicSchema = z.strictObject({
  id,
  statement: z.string().min(1),
  // Is the statement true? If `trueFromMinute` is set, it is false before that minute.
  statementTrue: z.boolean(),
  trueFromMinute: minutes.optional(),
  supportsAsserts: z.array(id),
  supportsDenies: z.array(id),
  // When a false claim on this topic comes to light.
  surfacesWhen: ConditionSchema.optional(),
  // Words that show a typed message is about this topic. Used by the matcher.
  phrases: z.array(z.string().min(1)).optional(),
});

const ObligationSchema = z.strictObject({
  id,
  label: z.string().min(1),
  trigger: ConditionSchema,
  withinMinutes: z.number().int().min(1),
  satisfiedBy: z.strictObject({
    directive: id,
    toAny: z.array(id).optional(),
    toAll: z.array(id).optional(),
  }),
});

const BeatSchema = z.strictObject({
  id,
  from: id, // a stakeholder id, or "system"
  channel: z.enum(["chat", "email", "press", "log"]),
  when: z.union([
    z.strictObject({ atMinute: minutes, jitter: z.number().int().min(0).optional() }),
    z.strictObject({ condition: ConditionSchema, delayMinutes: minutes.optional() }),
  ]),
  unless: ConditionSchema.optional(),
  purpose: z.string().min(1),
  facts: z.array(z.string()),
  fallbackText: z.string().min(1),
  // Other wordings of the same message for when the sender's trust is low or high.
  variants: z.strictObject({ low: z.string().optional(), high: z.string().optional() }).optional(),
  quotesClaim: id.optional(),
});

// A piece of debrief text, shown when its condition holds at the end of the session.
const LessonSchema = z.strictObject({
  id,
  kind: z.enum(["fell", "avoided"]),
  when: ConditionSchema,
  text: z.string().min(1),
  // Which event to point at: its type, and optionally the id or topic it carries.
  evidence: z.strictObject({ type: z.string().min(1), id: id.optional() }).optional(),
});

const IdealStepSchema = z.strictObject({
  atMinute: minutes,
  intent: IntentSchema,
  // Why this step, in a sentence. Steps that have one are the ones the debrief shows as the
  // stronger response; the rest are needed to play the path but are not worth a line.
  why: z.string().min(1).optional(),
});

export const ScenarioSchema = z.strictObject({
  id,
  title: z.string().min(1),
  version: z.number().int().min(1),
  briefing: z.strictObject({
    role: z.string().min(1),
    situation: z.string().min(1),
    canDo: z.string().min(1),
  }),
  startClock: z.string().regex(/^\d{2}:\d{2}$/),
  lengthMinutes: z.number().int().min(10),
  stakeholders: z.array(StakeholderSchema).min(1),
  systems: z.array(SystemSchema).min(1),
  metrics: z.array(MetricSchema).min(1),
  driverMetric: id,
  startMode: id,
  modes: z.record(z.string(), z.array(SegmentSchema).min(1)),
  severeAbove: z.number().positive(),
  clues: z.array(ClueSchema),
  investigations: z.array(InvestigationSchema),
  mitigations: z.array(MitigationSchema),
  directives: z.array(DirectiveSchema),
  claimTopics: z.array(ClaimTopicSchema),
  obligations: z.array(ObligationSchema),
  beats: z.array(BeatSchema),
  endings: z.strictObject({
    ctoTrustFloor: z.number().min(0).max(100),
    resolvedWhen: ConditionSchema,
  }),
  scoring: z.strictObject({ rootCauseClue: id, causeTargetMinute: z.number().int().min(1) }),
  idealPath: z.array(IdealStepSchema).min(1),
  // Situation-specific ways of saying things: canonical word, then what players may type instead.
  synonyms: z.record(z.string(), z.array(z.string().min(1))).optional(),
  lessons: z.array(LessonSchema).optional(),
});
export type Lesson = z.infer<typeof LessonSchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;
export type Stakeholder = z.infer<typeof StakeholderSchema>;
export type Beat = z.infer<typeof BeatSchema>;
export type Investigation = z.infer<typeof InvestigationSchema>;
export type Mitigation = z.infer<typeof MitigationSchema>;
export type Directive = z.infer<typeof DirectiveSchema>;
export type ClaimTopic = z.infer<typeof ClaimTopicSchema>;
export type Obligation = z.infer<typeof ObligationSchema>;
export type IdealStep = z.infer<typeof IdealStepSchema>;
