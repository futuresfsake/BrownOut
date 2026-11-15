# Scenario format

A scenario is data. It contains no code. It is validated with zod when the server starts and by the validator tool in CI.

## Files

```
src/scenarios/dial-tone/
  scenario.ts        the scenario object, typed against the schema
  accuracy.json      labelled player phrasings for the interpreter test
  ideal-path.json    the intents of the authored best response
```

## Top-level shape

```ts
interface Scenario {
  id: string;                       // "dial-tone"
  title: string;
  version: number;                  // bump when content changes; cassettes record it
  briefing: {
    role: string;                   // who the player is
    situation: string;              // what they can see at the start
    canDo: string;                  // one sentence on what they may type
  };
  startClock: string;               // "02:14"
  lengthMinutes: number;            // hard end

  company: { name: string; facts: Fact[] };
  stakeholders: Stakeholder[];
  systems: SystemDef[];
  metrics: MetricDef[];             // with curves per impact mode
  groundTruth: {
    summary: string;                // never sent to interpret or narrate
    timeline: { clock: string; what: string }[];
  };

  clues: Clue[];
  investigations: Investigation[];
  mitigations: Mitigation[];
  claimTopics: ClaimTopicDef[];     // topic, true stance, which clues support which stance
  obligations: Obligation[];
  beats: Beat[];

  endings: { cto_trust_floor: number; allClearTo: StakeholderId[] };
  scoring: ScoringTargets;          // best and worst case, time-to-cause target
  idealPath: IdealStep[];
  variation: VariationDef;          // what the seed may change
}
```

`Clue`, `Investigation`, `Mitigation` and `Beat` are defined in [simulation-engine.md](simulation-engine.md).

## Stakeholder

```ts
interface Stakeholder {
  id: StakeholderId;
  name: string;
  role: string;
  wants: string;                    // one sentence
  voice: string;                    // how they write: length, habits, what they never say
  patienceMinutes: number;          // time before an unanswered message costs trust
  startTrust: number;
  channel: "chat" | "email";
}
```

## Authoring rules

1. **One root cause.** The seed never changes it.
2. **Solvable from the opening.** At least two different chains of investigations lead from the opening clues to the root cause.
3. **At least two red herrings**, each with an investigation that clears it up. A red herring is never a dead end that only wastes time; clearing it tells the player something.
4. **At least one harmful mitigation** that a reasonable person might try.
5. **At least one tempting false statement**, with a consequence beat that quotes it back.
6. **Every beat and result has fallback text** that reads acceptably on its own.
7. **Every clue has leak terms**: the words that must not appear in narrated text before the clue is revealed.
8. **Facts carry their own numbers.** A fact is a short sentence plus the list of numbers and times in it, so the numeric guard has something to check against.
9. **Example phrasings are varied.** Each investigation and mitigation has at least five, written the way different people would say it, including vague and blunt versions.
10. **Fictional names only.** No real company, outlet, regulator or person.
11. **The scenario teaches response, not attack.** Describe what the responder sees and does. Never include working exploit steps.

## What the validator proves

`tools/validate-scenario` fails the build unless:

- The scenario parses against the schema.
- Every ID referenced anywhere exists.
- Every clue is revealed by at least one investigation.
- Every `requires` condition can be satisfied.
- Replaying `ideal-path.json` ends in `resolved`, with a score at or above 85.
- Replaying no actions at all does not resolve the incident. In Dial Tone it ends as `relieved`, because the unanswered CTO takes over at minute 54.
- Each harmful mitigation produces a worse containment score than not applying it.
- Every beat fires in at least one of the scripted playthroughs.
- No fallback text contains a number that is missing from its facts.
- No two beats for the same stakeholder fire in the same minute on the ideal path.

## Fact

```ts
interface Fact {
  id: string;
  text: string;                     // "TLS handshakes are failing on 6 of 12 auth-core nodes."
  numbers: string[];                // ["6", "12"]
  dynamic?: MetricId[];             // metrics to substitute at render time
}
```

Dynamic facts are how live numbers reach the narrator. The engine fills in the current value and adds it to `numbers` before sending the render request.
