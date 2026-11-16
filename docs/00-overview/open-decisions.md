# Open decisions, risks and known limits

## Open decisions

Each entry has a default. The build proceeds on the default until the owner decides otherwise.

| ID | Question | Default | Decide by |
|---|---|---|---|
| O-01 | Should the public deployment allow live play, and who pays for it? | Decided (DL-24, DL-26): yes, and nobody pays. The game runs in the browser with no model. | Done |
| O-02 | Where is the demo hosted? | Free static hosting (GitHub Pages). | M6 |
| O-03 | Should the interpret step move to a smaller, faster model? | No longer applies (DL-24): there is no model. | Done |
| O-04 | Which licence? | None yet, which means all rights reserved. | Before M6 |
| O-05 | Model-generated scenarios? | No. Situations are authored, from the catalogue of one hundred (DL-28). | Done |
| O-06 | Is pausing allowed? | Yes. It is a practice tool. A "no pause" option can come later. | M3 |
| O-07 | Should scenario 1 be set in a named country with its real regulator? | No. Fictional carrier, fictional regulator, simplified deadlines. Real law would need review by someone qualified. | M5 |
| O-08 | Is sound on by default? | Decided (DL-41): off. The player turns it on from the status strip. | Done |

## Risks

| ID | Risk | Effect | Response |
|---|---|---|---|
| R-01 | Turn latency. Fable 5.2 always thinks before answering, and a turn has two calls. | A slow turn breaks the feeling of pressure. | Measure in the M2 spike before building the interface. Levers in order: low effort on interpret, small output caps, show the engine result before the prose (DL-13), a smaller interpret model (O-03), fast mode. Target in NFR-01. |
| R-02 | Cost per session is unknown until measured. | Live play could be dearer than expected. | Record token usage per call from the first live call. Daily budget switch (FR-27). Replace the estimate in model-contract.md with measured numbers at M2. |
| R-03 | The model declines a turn. Scenarios mention breaches and attackers. | A turn has no text. | Check `stop_reason` on every response, enable server-side fallbacks, then use authored fallback text (DL-08). Scenarios describe response to incidents, never how to cause one. |
| R-04 | The narrator contradicts the ground truth or leaks an unrevealed fact. | The mystery is spoiled or unfair. | Narrator receives only the facts for each render request plus what the player already knows. Numeric guard and leak check (model-contract.md). Scripted playthroughs in CI look for leaked clue text. |
| R-05 | The interpreter maps a creative action to the wrong authored option. | The player feels misread. | The log shows a one-line restatement of how the action was read. Accuracy set of labelled actions per scenario, run in CI against cassettes and on demand against the live model. |
| R-06 | The player tries to instruct the model through the action box. | Attempted prompt injection. | Player text is data inside a delimited field. The interpreter can only output enumerated IDs. The engine decides outcomes. See security-overview.md. |
| R-07 | Scope. Three scenarios, a custom interface and a model pipeline is a lot. | The build stalls before anything is playable. | Scenario 1 is playable from a terminal at the end of M1 with no model and no interface. Scenarios 2 and 3 come last. |
| R-08 | An API change makes the documented request shape wrong. | Calls fail with a 400. | model-contract.md states what was checked and when. Confirm against the current SDK documentation at the start of M2. |
| R-09 | The 3D room takes far longer than a flat page and delays everything after it. | The project stalls at M3. | M3 is split: stage A builds the panels and flat view and is a complete, playable interface. Stage B adds the room on top. Geometry is simple shapes built in code (DL-20). If stage B slips, the game still ships in flat view. |
| R-10 | The room runs badly on ordinary laptops and phones. | Stutter, heat, drained battery. | Frames are drawn only when something changes. No real-time shadows or post-processing. Budgets in ui-design.md are measured on two reference devices. Flat view is offered when the frame rate stays low. |
| R-11 | The room looks like a generic 3D demo. | It undercuts the point of building it. | One committed style (card model, toon shading, inked edges, the project palette). The "not allowed" list in ui-design.md. Screenshots reviewed by the owner before stage B is merged. |
| R-12 | The local matcher misreads what the player typed. | The player feels unheard, which a model would have handled better. | It asks "did you mean" when candidates are close and lists the nearest options when nothing matches. Accuracy is measured on a labelled set per situation and enforced in the tests. |
| R-13 | Authoring one hundred situations is too much work. | The catalogue is never finished. | Waves of ten from a shared kit, with a small authoring target per situation. The game is complete after wave 1. The validator stops a rushed situation from shipping. |

Risks R-01, R-02, R-03 and R-08 were about the model (latency, cost, declined requests, API changes). They no longer apply since DL-24.

## Known limits

These are accepted for version 1 and should be stated in the README once the app exists.

| ID | Limit |
|---|---|
| L-01 | Creativity is bounded by the authored scenario. An action that matches no authored investigation or mitigation costs time and returns an inconclusive result. |
| L-02 | One player. No team roles, no handover between shifts. |
| L-03 | A session lives in the browser tab and ends with it, unless the player saved it to a file from the debrief. |
| L-04 | Stakeholders do not talk to each other on screen. Their coordination is authored into beats. |
| L-05 | English only. |
| L-06 | The score rewards the authored ideal path. A valid unconventional response can score lower than it deserves. The debrief says so when the player used unmatched actions. |
| L-07 | Regulatory and legal content is fictional and simplified. |
| L-08 | No people are modelled in the room. Stakeholders are devices; the on-shift engineer is a lit desk. |
| L-09 | The 3D room needs WebGL 2. Without it the game runs in flat view. |
| L-10 | The camera has five fixed positions. The player cannot walk around or look freely. |
| L-11 | Situation data, including the hidden cause, is in the files the browser downloads. A player who reads the page source can find the answer. |
| L-12 | Understanding of typed text is limited to what the matcher and the authored phrasings cover. Unusual wording may need a second try. |
| L-13 | The room's frame rate has been read on one laptop with a separate graphics card. It has not been read on integrated graphics or on a phone (NFR-11). Until it is, the offer of flat view on a slow device (DL-42) is the safeguard. |
