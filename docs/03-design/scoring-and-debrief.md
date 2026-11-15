# Scoring and debrief

The engine computes the score from the event log. The same log always gives the same score. The model explains the score; it does not set it (DL-09).

## Dimensions

| Dimension | Weight | Question it answers |
|---|---|---|
| Containment | 30 | How much harm did customers take, compared with the best and worst possible? |
| Diagnosis | 20 | How directly did the player get to the cause? |
| Communication | 20 | Were people answered, updated and given promises that were kept? |
| Honesty | 20 | Was what the player said true, and backed by what they knew? |
| Obligations | 10 | Were the required notifications made in time? |

Each dimension is 0 to 100. The overall score is the weighted sum, rounded.

## Rules

All constants live in one file and are tuning values.

### Containment

Customer-minutes is the sum of customers affected over every sim minute of the session.

```
base = 100 * (worst - actual) / (worst - best)      clamped to 0..100
score = base - 10 for each harmful mitigation applied
```

`worst` is the no-action session and `best` is the ideal path, both precomputed per scenario by the validator.

### Diagnosis

| Part | Points |
|---|---|
| Root-cause clue revealed | 40 |
| Time to root cause: full marks at or before the scenario's target minute, falling to zero at three times the target | 30 |
| Clean path: start at 30, minus 10 for each no-effect or harmful mitigation applied, minus 5 for each red-herring investigation run after the clue that rules it out | 30 |

### Communication

| Part | Points |
|---|---|
| Share of messages answered within the sender's patience | 40 |
| Share of commitments kept. No commitments made counts as half marks. | 30 |
| Proactive updates: the CTO, support and comms each heard from the player at least once in every 20 sim minutes | 30 |

### Honesty

Start at 100.

| Event | Change |
|---|---|
| False claim to an internal stakeholder | -30 |
| False claim to the press, counsel or the regulator | -45 |
| Assertion that was true but unsupported when made | -10 |
| False claim corrected by the player before its consequence beat fired | +20 back |

### Obligations

Each obligation scores 100 if met in time, 50 if met late, 0 if missed. The dimension is the average.

## Caps and labels

- A false claim to the press that was never corrected caps the overall score at 69.
- Ending as `relieved` caps the overall score at 59.

| Overall | Label |
|---|---|
| 85 to 100 | Strong response |
| 70 to 84 | Solid response |
| 50 to 69 | Shaky response |
| 0 to 49 | Lost control |

## Evidence

For every point gained or lost, the engine records which event caused it:

```ts
interface ScoreLine {
  dimension: Dimension;
  delta: number;
  reason: string;          // authored template, e.g. "Commitment to the CTO broken"
  eventIds: string[];
}
```

The debrief screen shows these lines under each dimension. Selecting one scrolls the timeline to the event.

## Debrief screen

1. **Header.** Scenario, ending, overall score and label, session length in sim and real minutes, the seed.
2. **Five dimensions.** Score and the evidence lines for each.
3. **Timeline.** The whole session on one axis with customers affected drawn as a line. Marked on it: the first sight of the root cause, each mitigation, each kept or broken commitment, each claim, each obligation deadline.
4. **Went well and missed.** Written by the model, each point linked to its events.
5. **A stronger response.** The alternative timeline, five to eight steps with a reason for each, written by the model from the authored ideal path and adapted to what the player actually did.
6. **One thing.** The single change that would have mattered most.
7. **Actions.** Play again with the same seed, play again with a new one, export the session.

## Debrief rules for the model

- Refer to the player as "you".
- Be specific. "At 02:21 you restarted every auth-core node" and not "some mitigations were unhelpful".
- Give credit where the log supports it. A debrief that only lists faults is not accurate.
- Do not state numbers that are not in the log.
- When the player used actions the scenario could not match (L-01), say that the simulation could not judge them, and do not count them as mistakes.
- No general advice that is not tied to an event in this session.

## Fallback

If the debrief call fails or fails its guards twice, the screen shows sections 1 to 3 and 7, and section 5 is built from the authored ideal path without adaptation. The player still gets a complete, correct score.
