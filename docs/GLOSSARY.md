# Glossary

| Term | Meaning |
|---|---|
| Action | Free text the player types to say what they do or order. |
| Beat | An authored event that fires at a set simulated time or when a condition becomes true, for example "the CTO asks for an ETA". |
| Board | The panel showing the clock, system status and the hard numbers. |
| Cassette | A recorded set of model responses for one session, used to replay it without calling the model. |
| Claim | A statement the player puts on the record about a topic, for example "no customer data was exposed". |
| Claims ledger | The engine's record of every claim, who heard it, and whether it was true and supported when made. |
| Clue | An authored fact about the incident that an investigation can reveal. Some clues are red herrings. |
| Commitment | A promise the player made to a stakeholder, with a due time when one was given. |
| Debrief | The end-of-session review: scores, evidence, and a stronger alternative response. |
| Engine | The deterministic TypeScript module that holds state and resolves turns. It makes no model calls. |
| Event log | The append-only list of everything that happened in a session. Score, debrief and replay are all derived from it. |
| Ground truth | The authored facts of a scenario: root cause, timeline, what works and what does not. Hidden from the player. |
| Intent | The structured reading of a player's action, produced by the interpret step. |
| Interpret | The first model call in a turn: free text in, intent out. |
| Investigation | An authored thing the player can look into. Reveals zero or more clues. |
| Mitigation | An authored change the player can make to the systems. May help, do nothing, or make things worse. |
| Narrate | The second model call in a turn: resolved facts in, written messages out. |
| Render request | One piece of text the engine asks the narrator to write, with the facts it may use. |
| Replay mode | Running a recorded session with no model calls. |
| Scenario | One authored incident: ground truth, stakeholders, beats, investigations, mitigations, scoring targets. |
| Seed | A number that fixes every random choice in a session, so a run can be reproduced. |
| Sim time | The clock inside the scenario. It advances when the player acts and, slowly, while they are idle. |
| Stakeholder | A person the model plays: the CTO, support lead, counsel, comms lead, journalist and others. |
| Trust | A 0 to 100 value per stakeholder, changed only by engine rules. |
| Turn | One pass through the pipeline: interpret, resolve, narrate. |
