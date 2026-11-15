# Glossary

| Term | Meaning |
|---|---|
| Action | Free text the player types to say what they do or order. |
| Beat | An authored event that fires at a set simulated time or when a condition becomes true, for example "the CTO asks for an ETA". |
| Board | The panel showing the clock, system status and the hard numbers. |
| Catalogue | The list of one hundred situations in situation-catalog.md. |
| Claim | A statement the player puts on the record about a topic, for example "no customer data was exposed". |
| Claims ledger | The engine's record of every claim, who heard it, and whether it was true and supported when made. |
| Clue | An authored fact about the incident that an investigation can reveal. Some clues are red herrings. |
| Commitment | A promise the player made to a stakeholder, with a due time when one was given. |
| Debrief | The end-of-session review: scores, evidence, and a stronger alternative response. |
| Engine | The deterministic TypeScript module that holds state and resolves turns. It makes no model calls. |
| Event log | The append-only list of everything that happened in a session. Score, debrief and replay are all derived from it. |
| Flat view | The whole game laid out as one HTML page with no 3D. An equal alternative to the room. |
| Ground truth | The authored facts of a scenario: root cause, timeline, what works and what does not. Hidden from the player. |
| Intent | The structured reading of a player's action, produced by the matcher. |
| Matcher | The local code that turns typed text into an intent. No model and no network. |
| Investigation | An authored thing the player can look into. Reveals zero or more clues. |
| Mitigation | An authored change the player can make to the systems. May help, do nothing, or make things worse. |
| Lesson | Authored debrief text for one trap, shown when the player fell into it or avoided it. |
| Situation | Another word for a scenario, used for the entries in the catalogue. |
| Panel | An HTML view of the board, log, inbox or press. Used by both the room and flat view. |
| Replay | Watching a saved session play back. |
| Room | The 3D operations room the player sits in. Shows where things are and what needs attention. |
| Scenario | One authored incident: ground truth, stakeholders, beats, investigations, mitigations, scoring targets. |
| Seed | A number that fixes every random choice in a session, so a run can be reproduced. |
| Sim time | The clock inside the scenario. It advances when the player acts and, slowly, while they are idle. |
| Signal | Something the room does to show state: a lamp, a lit screen, the light level. Derived from public state by pure functions. |
| Stakeholder | A person in the situation who messages the player: the CTO, support lead, counsel, comms lead, journalist and others. Their words are authored. |
| Station | One of five fixed camera positions in the room: desk, log, inbox, board, press. |
| Trust | A 0 to 100 value per stakeholder, changed only by engine rules. |
| Turn | One pass: the matcher reads the input, the engine resolves it, the text is shown. |
