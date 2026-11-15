# Simulation engine

The engine is a pure function over state:

```ts
resolve(scenario: Scenario, state: SessionState, input: EngineInput): Resolution
```

It reads no clock, makes no network call and uses no global random source. Randomness comes from a seeded generator stored in the state.

## Inputs

```ts
type EngineInput =
  | { type: "intent"; intent: Intent }      // from the interpret step
  | { type: "wait" }                        // to next event, max 5 sim minutes
  | { type: "tick"; minutes: number }       // idle clock
  | { type: "cancelTask" }
  | { type: "end" };                        // player closes the incident
```

`Intent` is defined in [model-contract.md](model-contract.md). The engine treats it as untrusted: every ID is checked against the scenario and unknown IDs are dropped.

## State

```ts
interface SessionState {
  scenarioId: string;
  seed: number;
  rng: RngState;
  minute: number;                    // sim minutes since start
  status: "running" | "resolved" | "relieved" | "timeout" | "ended";

  systems: Record<SystemId, "ok" | "degraded" | "down">;
  metrics: Record<MetricId, number>;         // customers affected, tickets, error rate
  visibleMetrics: MetricId[];                // which numbers the player can see yet

  revealedClues: ClueId[];
  appliedMitigations: { id: MitigationId; atMinute: number }[];
  task: Task | null;                         // what the on-shift engineer is doing
  queuedTask: Task | null;

  firedBeats: BeatId[];
  threads: Record<StakeholderId, Thread>;    // messages and unanswered flags
  trust: Record<StakeholderId, number>;      // 0 to 100
  commitments: Commitment[];
  claims: Claim[];
  obligations: Record<ObligationId, ObligationState>;

  log: EngineEvent[];                        // append-only
}
```

The event log is the source of truth for scoring, the debrief, export and replay. State can be rebuilt by replaying the log's inputs.

## Output

```ts
interface Resolution {
  state: SessionState;
  events: EngineEvent[];             // what happened this turn, in order
  renderRequests: RenderRequest[];   // text for the narrator to write
}
```

A render request carries everything the narrator may use for one piece of text:

```ts
interface RenderRequest {
  id: string;
  kind: "taskResult" | "message" | "press" | "alert" | "actionAck";
  from: StakeholderId | "system";
  channel: "log" | "chat" | "email" | "press";
  purpose: string;                   // authored, e.g. "demand an ETA within 10 minutes"
  facts: Fact[];                     // the only facts and numbers allowed in this text
  tone: { trust: "low" | "mid" | "high"; urgency: "low" | "mid" | "high" };
  quote?: { claimId: string; text: string };   // the player's own earlier words
  fallbackText: string;              // authored, used if the model fails
  maxChars: number;
}
```

## Order of resolution

For an intent, in this order:

1. **Spend the player's minute.** Orders and replies cost one sim minute.
2. **Record what was said.** Store claims and promises from the intent (see ledgers). Mark the threads the player replied to as answered.
3. **Start, queue or reject the task.** If the intent names an investigation or mitigation and its preconditions hold, it becomes the running task, or the queued task if one is running.
4. **Advance the clock** one minute at a time to the turn's end. For each minute:
   1. Update metrics from the impact model.
   2. Complete the task if it is due and apply its effect.
   3. Check commitments that fall due.
   4. Apply trust decay for unanswered messages.
   5. Fire beats whose time or condition is met.
   6. Check obligations and endings.
5. **Build render requests** for everything that needs words: task results, new messages, press items.

`wait` and `tick` start at step 4.

## Impact model

Each scenario defines its metrics as functions of time and of which mitigations are active. They are authored as piecewise-linear curves, not formulas in prose, so they can be plotted and tested.

For scenario 1, customers affected follows a "growing" curve while the fault is present (devices fail as their sessions expire), a "spike" curve after a mass restart, and a "recovery" curve after the correct fix. Tickets follow customers affected with a delay.

Metrics are integers. The engine rounds once, when it writes the value into state.

## Investigations and clues

```ts
interface Investigation {
  id: InvestigationId;
  label: string;                 // shown to the interpreter, never to the player
  examples: string[];            // sample phrasings, for the interpreter
  durationMinutes: number;
  requires?: Condition;          // e.g. clue "tls-failures" revealed
  reveals: ClueId[];
  resultPurpose: string;         // what the narrator should convey
  fallbackText: string;
}

interface Clue {
  id: ClueId;
  fact: string;                  // the plain statement of the fact
  kind: "true" | "redHerring" | "symptom";
  supportsClaims?: { topic: ClaimTopic; stance: Stance }[];
}
```

A clue's `supportsClaims` is how the engine knows whether a later statement was backed by evidence.

## Mitigations

```ts
interface Mitigation {
  id: MitigationId;
  label: string;
  examples: string[];
  durationMinutes: number;
  requires?: Condition;
  effect: Effect;                // switches impact curves, sets system status
  kind: "fix" | "partial" | "noEffect" | "harmful";
  resultPurpose: string;
  fallbackText: string;
}
```

A harmful mitigation is not a game over. It changes the curves and the story gets worse.

## Ledgers

**Commitments.** A promise in an intent becomes:

```ts
interface Commitment {
  id: string;
  to: StakeholderId;
  what: string;                  // short restatement
  madeAtMinute: number;
  dueMinute: number | null;
  status: "open" | "kept" | "broken";
  sourceEventId: string;
}
```

A commitment is kept when the player sends that stakeholder a message at or before the due minute. It is broken at the due minute otherwise. A commitment about an outcome ("fixed by 02:40") is kept or broken by the state at the due minute.

**Claims.**

```ts
interface Claim {
  id: string;
  topic: ClaimTopic;             // per scenario: cause, scope, dataExposure, eta, safety
  stance: "asserts" | "denies" | "uncertain";
  audience: StakeholderId[];
  text: string;                  // the player's words, trimmed
  madeAtMinute: number;
  truth: "true" | "false" | "unknowable";
  supported: boolean;            // did revealed clues back this stance at that moment?
  sourceEventId: string;
}
```

Four cases matter:

| Truth | Supported | Meaning | Consequence |
|---|---|---|---|
| true | yes | Accurate and evidenced | Trust up |
| true | no | Lucky guess stated as fact | Small honesty penalty, noted in debrief |
| false | no | Wrong and unevidenced | Consequence beat when the truth surfaces |
| any | n/a, stance uncertain | "We don't know yet" | No penalty. Counsel and the journalist accept it once, then press for a time. |

## Trust

Trust starts at the scenario's value per stakeholder, 60 by default. Rules:

| Event | Change |
|---|---|
| Reply within the stakeholder's patience | +4 |
| Commitment kept | +6 |
| Proactive update (a message that is not a reply) | +5 |
| Each sim minute a message is unanswered past patience | -1 |
| Commitment broken | -12 |
| False claim to this stakeholder surfaces | -20 |
| Accurate, supported claim | +3 |

Values are clamped to 0 to 100 and are tuning constants kept in one file. The narrator sees trust only as low (under 35), mid, or high (over 70).

## Beats

```ts
interface Beat {
  id: BeatId;
  from: StakeholderId | "system";
  channel: "chat" | "email" | "press" | "log";
  when: { atMinute: number } | { condition: Condition; delayMinutes?: number };
  unless?: Condition;            // skip if this is already true
  purpose: string;
  facts: FactRef[];
  startsObligation?: ObligationId;
  expectsReplyWithin?: number;   // sets the unanswered timer
  fallbackText: string;
}
```

Conditions are a small authored expression type (clue revealed, mitigation applied, metric above a value, claim with a given topic and truth exists, trust below a value, beat fired), combined with all, any and not. There is no free-form code in a scenario.

## Obligations

Things the player must do within a time once a trigger happens, for example notifying the regulator within 30 sim minutes of learning that emergency calling is affected. An obligation is met by an intent of kind `communicate` or `escalate` that names the right party after the trigger.

## Endings

Checked each minute, first match wins:

1. **resolved**: the fix mitigation is applied, a verifying investigation has completed after it, and an all-clear has gone to every stakeholder the scenario lists.
2. **relieved**: CTO trust is below the scenario's floor.
3. **timeout**: the scenario's last minute is reached.
4. **ended**: the player chose to end.

## Seeded variation

The seed changes only what the scenario marks as variable: jitter of a few minutes on some beats, which of two red herrings is prominent, and the order of simultaneous messages. The root cause never varies within a scenario, so the validator can prove solvability.

## What the engine never does

- Call the model or the network.
- Read the wall clock.
- Produce player-facing prose other than authored fallback text.
- Trust an ID it has not checked against the scenario.
