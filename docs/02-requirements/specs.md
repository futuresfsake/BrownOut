# Requirements

Each requirement is testable. The "Check" column says how.

## Functional

### Sessions

| ID | Requirement | Check |
|---|---|---|
| FR-01 | A player can start a session by choosing a scenario. No sign-up. | Browser test |
| FR-02 | A session has an ID that cannot be guessed (at least 128 bits of randomness). | Unit test |
| FR-03 | A session expires two hours after its last turn. | Unit test with a fake clock |
| FR-04 | Only one turn per session is processed at a time. A second request while one is running gets HTTP 409. | Integration test |
| FR-05 | A session can be given a seed. Without one, the server picks one and reports it. | Unit test |

### Turns

| ID | Requirement | Check |
|---|---|---|
| FR-06 | The player can submit free text up to 600 characters as an action or as a reply to a thread. | Integration test |
| FR-07 | Each submitted action appears in the log with a one-line restatement of how it was understood. | Browser test |
| FR-08 | An action that matches no authored investigation or mitigation costs time and returns an inconclusive result. It never changes a system's status. | Engine test |
| FR-09 | Orders and replies cost one sim minute. Tasks take their authored duration and run one at a time, with a queue of one. | Engine test |
| FR-10 | While idle and not paused, sim time advances one minute per 15 real seconds. | Browser test with a fake timer |
| FR-11 | A turn that produces nothing to write makes no model call. | Integration test counting calls |

### Simulation

| ID | Requirement | Check |
|---|---|---|
| FR-12 | Given the same scenario, seed and sequence of intents, the engine produces an identical event log. | Property test |
| FR-13 | Beats fire at their authored time, or when their condition becomes true, exactly once. | Engine test |
| FR-14 | A clue is revealed only by an investigation that lists it and whose preconditions are met. | Engine test |
| FR-15 | Every promise with a stated time is stored as a commitment and marked kept or broken when it falls due. | Engine test |
| FR-16 | Every claim on a tracked topic is stored with its audience, its truth against ground truth, and whether the player had evidence for it at that moment. | Engine test |
| FR-17 | A false or unsupported claim made to the press or to counsel schedules its authored consequence beat. | Engine test |
| FR-18 | Trust changes only through the rules in simulation-engine.md. | Engine test |
| FR-19 | The session ends in exactly one of: resolved, relieved, time out, ended by player. | Engine test |

### Model output

| ID | Requirement | Check |
|---|---|---|
| FR-20 | All model output is validated against a zod schema before use. | Unit test with invalid samples |
| FR-21 | Narrated text may contain only numbers that the engine supplied for that piece of text. A violation is retried once, then replaced with fallback text. | Unit test of the guard |
| FR-22 | Narrated text must not contain the text of a clue the player has not revealed. | Scripted playthrough check |
| FR-23 | When a model call fails, is declined, is cut off, or fails validation twice, the turn completes with authored fallback text. | Integration test with a failing stub |
| FR-24 | Model output is displayed as plain text. It is never interpreted as HTML or Markdown. | Unit test with markup in a cassette |

### Debrief

| ID | Requirement | Check |
|---|---|---|
| FR-25 | The score is computed by the engine and is identical for identical event logs. | Unit test |
| FR-26 | Every statement in the written debrief cites at least one event ID, and every cited ID exists in the log. | Unit test of the citation check |

### Operation

| ID | Requirement | Check |
|---|---|---|
| FR-27 | Token usage and estimated cost are recorded for every model call. When the day's total reaches the configured budget, live play is refused until the next day and replay still works. | Integration test |
| FR-28 | With no API key configured, the server starts in replay mode and says so in the interface. | Integration test |
| FR-29 | A finished session can be exported as JSON and loaded again. A loaded file is validated before anything is rendered from it. | Unit and browser test |

### Views

| ID | Requirement | Check |
|---|---|---|
| FR-30 | The play screen has a 3D view and a flat view. Every action, panel, state and shortcut is available in both. | Browser tests in flat view, checklist in 3D |
| FR-31 | The player can switch between the views at any time without losing session state, scroll position in the log, or text typed in the decision box. | Browser test |
| FR-32 | If WebGL 2 is unavailable or the graphics context is lost and not restored, the game continues in flat view and says why. | Browser test with WebGL disabled |
| FR-33 | The decision box and the status strip are visible and usable at every camera station. | Browser test |
| FR-34 | Every station can be reached by keyboard and by an HTML control, not only by pointing at the scene. | Browser test |
| FR-35 | All text of more than a few words is HTML. The scene draws only the clock, the wall board figures and the television headline. | Code review |
| FR-36 | Room signals (lamps, lights, screens) are derived from the same public state as the panels. The room holds no game state of its own. | Unit test of the state-to-scene mapping |

## Non-functional

| ID | Requirement | Check |
|---|---|---|
| NFR-01 | Latency target for a live turn: the resolved state reaches the browser within 4 seconds and the written text within 12 seconds, at the median. These are targets to confirm or revise with the M2 spike. | M2 measurements |
| NFR-02 | The engine resolves a turn in under 20 milliseconds without the model. | Benchmark test |
| NFR-03 | The API key exists only in the server's environment. It is never sent to the browser, logged or written to an export. | Code review, bundle search in CI |
| NFR-04 | Text contrast meets WCAG 2.2 AA at every severity level of the interface. | Automated and manual check |
| NFR-05 | The whole game is playable with a keyboard. New messages are announced to screen readers. | Browser test, manual check |
| NFR-06 | The interface works from 360 pixels wide. | Screenshot evidence |
| NFR-07 | No personal data is collected. No analytics, no cookies beyond what a session needs. | Code review |
| NFR-08 | No high or critical vulnerability in production dependencies at release. | `npm audit --omit=dev` |
| NFR-09 | Engine line coverage at or above 90 percent. Overall at or above 80 percent. | Coverage report |
| NFR-10 | The server refuses more than 10 turn requests per minute per session and more than 5 new sessions per hour per address. | Integration test |
| NFR-11 | The 3D view meets the performance targets in ui-design.md on the two reference devices. These are targets to confirm or revise with the M3 stage B spike. | Readings saved as evidence |
| NFR-12 | The 3D code is a separate chunk. The start screen is interactive before it loads, and flat view never downloads it. | Build report, network trace |
| NFR-13 | When nothing in the scene is changing, no frames are drawn. | Frame counter in a browser test |
| NFR-14 | Light changes never flash more than twice in one second. With reduced motion set, camera moves are cuts and light changes are instant. | Unit test of the transition timing, manual check |
| NFR-15 | No 3D asset, font or sound is fetched from a third-party origin. | Network trace in a browser test |
