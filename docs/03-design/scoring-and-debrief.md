# Scoring and debrief

The engine computes the score from the event log. The same log always gives the same score. The debrief is assembled from the score lines and the situation's authored lessons; no model writes any of it (DL-24, DL-27).

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

`worst` is the no-action session and `best` is the ideal path, both computed per scenario by running them through the engine. A session that stops before the scenario's last minute is projected forward as if nothing more were done, so ending an unfixed incident early does not look like good containment.

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

The debrief screen shows these lines under each dimension. Selecting one goes to the event on the timeline.

A line that sums up the whole session, such as the share of messages answered in time, has no single event behind it. It is measured when the session ends, so it points at the session's end (DL-48). Every line can then be followed to a moment in the log (FR-26).

## Debrief screen

1. **Header.** Situation, overall score and label, one sentence on how it ended, then the ending, the length in game minutes with its clock times, and the seed. Real time is not recorded (DL-50).
2. **Five dimensions.** Score and the evidence lines for each. Each line is a link to its moment on the timeline.
3. **Timeline.** The whole session on one axis with customers affected drawn as a line, and under it the same moments as a list in words (DL-48). Marked: the first sight of the root cause, each change made (a harmful one is marked as such), each promise kept or broken, each statement and any that turned out wrong, each duty met, late or missed, the end, and any other event the debrief points at.
4. **Went well and missed.** The situation's authored lessons whose conditions this session met, each linked to its event.
5. **One thing.** The largest single loss of points, linked to its event.
6. **A stronger response, beside yours.** Five to eight steps of the ideal path, each with its time and an authored reason, and beside each one when the player did the same thing or that they did not (DL-49).
7. **Actions.** Play again with the same seed, play again with a new one, save the session to a file, watch it back.

## Rules for debrief text

These bind whoever writes a situation's lessons and the engine's score reasons.

- Refer to the player as "you".
- Be specific. "Restarting every sign-in server made every connected phone sign in again" and not "some mitigations were unhelpful".
- Give credit where the log supports it. A debrief that only lists faults is not accurate.
- Do not state numbers that are not in the log.
- An action the situation could not match (L-01) is not counted as a mistake.
- No general advice that is not tied to an event in this session.

## A stronger response

A step of a situation's ideal path may carry a `why`: one sentence on the reason for it. The steps that have one are the stronger response, so the author chooses five to eight. A step counts as done by the player when:

| Step | Done when |
|---|---|
| An investigation or a change | The player ordered the same one |
| A message that carries an instruction | The player gave the same instruction |
| A plain message | The player wrote to the same person. Messages are matched in order, so two authored messages to one person need two from the player. |

The time is compared with the authored minute: within a minute is "on time", otherwise so many minutes later or sooner. Whether the player's message said the right thing is the business of the honesty and communication scores, not of this table.

## Saving and watching a session

The debrief can save the session as a file and play it back. The file format, the checks on opening one and the replay are in [high-level-design.md](high-level-design.md) and [security-overview.md](../04-security/security-overview.md) (DL-44 to DL-47).
