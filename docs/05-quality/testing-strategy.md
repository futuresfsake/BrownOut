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
| Signal tests | The pure mapping from public state to room description: light level, lamps, wall board, television | None | Every commit |
| Interface logic | The pure functions between the engine and the panels (`src/client/app`): the log feed, the board, threads, saving and restoring, and a whole typed session to the resolved ending | None | Every commit |
| Browser tests, flat view | Against the built site with a fixed seed: briefing to the resolved ending by typing, keyboard-only play, phone layout at 375 and 360 px, accessibility scan, the idle clock with a fake timer, a reload, and a count of network requests | None | Every pull request, in CI. Locally with `npm run e2e` |
| Signal tests, continued | Station data, camera easing, the light fade and its two dips, the slow-frame counter, text fitting, and which sounds a change makes (`tests/client/room.test.ts`) | None | Every commit |
| Browser tests, 3D view | A whole typed session to the resolved ending in the room, on a laptop and at phone size. Each station opens its panel. Keys, buttons, clicking an object and swiping. Switching views keeps the session, typed text and log position. WebGL off and a lost graphics context fall back to flat view. No frames while idle. Draw calls and triangles under budget. The 3D chunk is separate, under 300 KB compressed, and never fetched by flat view. Accessibility scan at every station | None | Every pull request, in CI. Locally with `npm run e2e` |
| 3D screenshots | Every station at each light level and each room state, at three widths, and a short recording (`npm run e2e:evidence`) | None | By hand at M3 stage B and M6 |
| Frame-rate readings | Every frame timed while the camera moves, written with the name of the graphics card (`npm run e2e:measure`, DL-43) | None | By hand on each reference device at M3 stage B and M6 |
| Interpreter accuracy | Labelled phrasings per scenario mapped to the expected intent | Live | On demand and before a release |
| Narration checks | Scripted sessions against the live model, counting guard failures, fallbacks and declines | Live | On demand and before a release |

Nothing in CI calls the model. Live checks cost money and are run deliberately, with the cost reported.

## The model in tests

- A `ModelClient` interface has three implementations: live, cassette and stub.
- The stub can be told to time out, decline, return invalid JSON, or return text that breaks a guard. Every failure path in high-level-design.md has a test that uses it.
- Cassettes are reviewed like code. A change to a prompt that changes a cassette shows up in the diff.

## Testing the 3D room

The room is hard to test by looking at pixels and does not need to be, because of how it is built:

- All behaviour lives in the panels and in the engine, which are tested without 3D.
- What the room shows is decided by pure functions in `signals/`. Those are unit tested: given this state, the light level is 2, the phone lamp is on, the television is off.
- The 3D browser tests check wiring, not appearance. They use the HTML station buttons to move around, and read what the room shows from `data-` attributes on its element and from the sentence written for screen readers.
- The room counts its own frames. A test waits until the count stops before it looks, and the idle test asserts that it stays stopped.
- Headless browsers draw WebGL with a software renderer. That is enough to prove the scene loads and responds. It says nothing about speed, so frame rates are read separately on real devices with `npm run e2e:measure`.
- Appearance is checked by a person against the screenshots, at M3 stage B and again at M6.

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
