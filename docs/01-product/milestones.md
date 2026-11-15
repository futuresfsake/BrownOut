# Milestones

Each milestone ends in something that runs. A milestone is finished only when every exit criterion is met and the evidence is saved under `testresults/dod/` (see [workflows](../07-process/workflows.md)).

The order is deliberate: the engine is playable before the model is connected, and the model pipeline is proven before the interface is built.

Each milestone lists its user stories. The stories, with acceptance criteria, are in [user-stories.md](user-stories.md).

## M0: Repository and guards

**Stories:** US-01 to US-04.

Set the project up so that every later commit is checked.

- `package.json`, TypeScript in strict mode, ESLint, Prettier, Vitest.
- Folder layout from [high-level design](../03-design/high-level-design.md).
- `.githooks/` with pre-commit and pre-push checks: gitleaks, semgrep, lint, type-check, tests.
- GitHub Actions workflow running the same checks.
- `tools/` with the scripts the hooks call.

**Exit:** a commit containing a planted fake-secret pattern, built at runtime in a test, is blocked locally. CI is green on an empty test suite. `npm audit` reports no high or critical issue in production dependencies.

## M1: Engine and scenario 1, no model

**Stories:** US-05 to US-15.

Build the whole simulation as a pure module and make scenario 1 playable in a terminal.

- State, clock, impact curves, beats, investigations, mitigations, ledgers, trust, endings.
- Scenario schema in zod. Scenario 1 authored as data.
- Scenario validator: the scenario loads, every ID referenced exists, the ideal path reaches the resolved ending, and no clue is unreachable.
- Score computation.
- Terminal runner where the player picks intents from a list and the text comes from authored fallback copy.

**Exit:** the ideal path of scenario 1 ends resolved with a score at or above 85. The "restart everything" path shows the impact spike. The same seed and the same intents produce an identical event log across two runs. Engine line coverage is at or above 90 percent.

## M2: Model pipeline

**Stories:** US-16 to US-24.

Connect interpret and narrate. Start with a measurement spike.

- **Spike first:** ten scripted turns of scenario 1 against the live model. Record latency and token usage per call at low and medium effort. Write the results to `docs/05-quality/` and settle O-03.
- Interpret and narrate calls with schemas built from the scenario.
- Guards: schema validation, numeric guard, leak check, one retry, then fallback text.
- Refusal and truncation handling.
- Cassette recording and playback.
- Usage logging and the daily budget switch.
- Interpreter accuracy set: at least 40 labelled actions for scenario 1.

**Exit:** scenario 1 is playable in the terminal with free text. Interpreter accuracy on the labelled set is at or above 90 percent. A scripted 15-turn session produces no numeric guard failure that reaches the player. The estimate in model-contract.md is replaced with measured cost and latency.

## M3: Web interface

Two stages. Stage A is a complete interface on its own, so the game is playable in a browser before any 3D work starts (risk R-09).

State the visual direction in each pull request before building, as [ui-design](../03-design/ui-design.md) requires.

### Stage A: panels and flat view

**Stories:** US-25 to US-31.

- Scenario picker, briefing, and the play screen in flat view against the turn stream.
- Board, log, inbox and press panels, the decision box and the status strip, with all panel states listed in ui-design.md.
- Idle clock, pause, wait, end.
- Desktop and phone layouts.
- Playwright tests running against a cassette.

**Exit A:** scenario 1 is playable in a browser in flat view from briefing to an ending. Screenshots at 1440, 768 and 375 pixels wide are saved as evidence. Automated accessibility checks report no serious or critical issue. Keyboard-only play works.

### Stage B: the 3D room

**Stories:** US-32 to US-38.

- Start with a one-day spike: the empty room, one station move and one HTML panel beside an object, measured on the two reference devices. Confirm the font and content-security-policy questions in ui-design.md.
- The room: walls, desk, wall board, clock, logbook, desk monitor, phone, television, second desk, ceiling lights, emergency strip.
- Five camera stations, the panels from stage A anchored to their objects, the always-on decision box and status strip.
- Object signals and the three light levels, driven by the same state as the panels.
- Loading the 3D code separately during the briefing. Fallback and the offer of flat view.
- Phone layout for the room.
- Sound, if time allows (F-67).

**Exit B:** scenario 1 is playable in the 3D room from briefing to an ending on a laptop and on a phone. Switching between 3D and flat view mid-session loses nothing. Every station is reachable by keyboard. With WebGL turned off the game starts in flat view with a notice. The performance targets in ui-design.md are met on both reference devices, or the misses are written down with the readings. The owner has reviewed the screenshots (risk R-11).

## M4: Debrief, export and replay

**Stories:** US-39 to US-44.

- Debrief call with event citations checked by the engine.
- Debrief screen: scores with evidence, marked timeline, alternative timeline.
- Export a session. Load and replay a session, validated before use.
- Replay mode for the whole app, with one bundled session.

**Exit:** a finished session shows a debrief in which every cited event exists in the log. An exported file replays to the same final state. Starting the server with no API key gives a working replay-only app.

## M5: Scenarios 2 and 3

**Stories:** US-45 to US-47.

- Author Open Bucket and Slow Burn from the briefs in [scenarios](../03-design/scenarios.md).
- Each passes the validator and has an interpreter accuracy set.
- Scripted playthroughs per scenario: one ideal, one poor, one dishonest.

**Exit:** all three scenarios pass their scripted playthroughs. In the dishonest playthrough of scenario 3 the false statement is quoted back to the player before the session ends.

## M6: Demo and close-out

**Stories:** US-48 to US-51.

- Public replay deployment (O-01, O-02).
- README rewritten for a visitor: what it is, screenshots, a short recording, how to run it locally, known limits.
- Licence decision (O-04).
- Final self-audit against these documents, saved under `docs/10-reviews/`.

**Exit:** the public URL loads and replays a session with no API key on the server. A full secrets scan of the whole git history is clean. Every must-priority feature in features.md is either done or listed as a known limit.
