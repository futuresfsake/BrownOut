# Testing strategy

The design puts everything that must be exact into code that can be tested without a model. The model-facing parts are tested with recorded responses, and separately measured against the live model on demand.

## Layers

| Layer | What it covers | Model calls | Runs |
|---|---|---|---|
| Engine unit tests | Clock, curves, beats, tasks, ledgers, trust, endings, scoring | None | Every commit |
| Engine property tests | Same seed and intents give the same log. Metrics stay within bounds. A beat never fires twice. Trust stays 0 to 100. | None | Every commit |
| Scenario validation | The checks listed in scenario-format.md | None | Every commit |
| Scripted playthroughs | Ideal, poor and dishonest sessions per scenario, as lists of intents, with assertions on the ending, score range and consequence beats | None | Every commit |
| Guard tests | Schema, coverage, numeric guard, leak check, citation check, with good and bad samples | None | Every commit |
| Pipeline integration | Full turns through interpret, resolve and narrate using cassettes and failing stubs | None | Every commit |
| API integration | Routes, validation, limits, 409 on overlapping turns, replay mode with no key | None | Every commit |
| Browser tests | Start to debrief in replay mode, keyboard-only play, mobile layout, accessibility scan | None | Every push |
| Interpreter accuracy | Labelled phrasings per scenario mapped to the expected intent | Live | On demand and before a release |
| Narration checks | Scripted sessions against the live model, counting guard failures, fallbacks and declines | Live | On demand and before a release |

Nothing in CI calls the model. Live checks cost money and are run deliberately, with the cost reported.

## The model in tests

- A `ModelClient` interface has three implementations: live, cassette and stub.
- The stub can be told to time out, decline, return invalid JSON, or return text that breaks a guard. Every failure path in high-level-design.md has a test that uses it.
- Cassettes are reviewed like code. A change to a prompt that changes a cassette shows up in the diff.

## Interpreter accuracy set

Per scenario, at least 40 entries:

```json
{ "text": "what changed on the auth boxes in the last hour?", "thread": null,
  "expect": { "kind": "investigate", "investigationId": "auth-changes" } }
```

It includes vague phrasings, two-part orders, replies containing promises and claims, things that should match nothing, and injection attempts. The pass mark is 90 percent, with every miss listed in the report.

## Scripted playthroughs

Each is a list of engine inputs with the sim minute at which it is given.

| Playthrough | Asserts |
|---|---|
| Ideal | Ends resolved. Overall 85 or more. No consequence beat fires. |
| Poor | Chases both red herrings, applies a harmful mitigation. Ends resolved late or times out. Containment under 50. |
| Dishonest | Makes the scenario's tempting false statement to the press. The follow-up beat fires and carries the exact quote. Honesty under 60. Overall capped at 69. |
| Silent | No input at all. Ends in timeout or relieved. Every unconditional beat fires. |

## Accessibility

- Automated scan on every screen in the browser tests. No serious or critical finding.
- Manual pass at M3 and M6: keyboard only, a screen reader on the play screen, 200 percent zoom, reduced motion.

## Coverage

- Engine: 90 percent of lines or more.
- Whole project: 80 percent or more.
- Coverage is a floor, not the goal. The scripted playthroughs and property tests are what show the simulation is right.

## Definition of done

A milestone or a pull request is done when:

1. Its acceptance criteria in milestones.md or the linked requirement are met.
2. Lint, type-check and all test layers that run in CI pass.
3. The security checks in security-overview.md pass and their result is written in the pull request.
4. New behaviour has tests. A fixed bug has a test that failed before the fix.
5. Interface work has screenshots at three widths.
6. Documents that the change makes wrong are corrected in the same pull request.
7. Evidence is saved under `testresults/dod/<milestone>/`: test summary, coverage summary, security scan output, screenshots where relevant.

## Spike reports

Measurement work, starting with the M2 latency and cost spike, is written up in this folder as `spike-<topic>.md` with the method, the raw numbers and the decision taken.
