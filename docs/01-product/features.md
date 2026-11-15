# Features

Priority: **must** is needed for version 1, **should** is planned for version 1 if time allows, **later** is out of version 1.

## Play

| ID | Feature | Priority | Milestone |
|---|---|---|---|
| F-01 | Scenario picker with a one-paragraph briefing per scenario | must | M3 |
| F-02 | Free-text action box | must | M3 |
| F-03 | Reply to a specific stakeholder thread | must | M3 |
| F-04 | Wait button (five sim minutes) | must | M3 |
| F-05 | Idle clock with pause | must | M3 |
| F-06 | One-line restatement of how each action was understood | must | M2 |
| F-07 | Board panel with clock, system status and hard numbers | must | M3 |
| F-08 | Log panel of actions, findings and alerts | must | M3 |
| F-09 | Inbox panel with one thread per stakeholder, and a press panel | must | M3 |
| F-13 | Decision box and status strip on screen at all times, in both views | must | M3 |
| F-10 | Open commitments shown in the thread they were made in, with due time | should | M3 |
| F-11 | End the incident early | must | M3 |
| F-12 | Seed shown on the debrief so a run can be repeated | should | M4 |

## Room

| ID | Feature | Priority | Milestone |
|---|---|---|---|
| F-60 | 3D war room with wall board, clock, logbook, desk monitor, phone, television and a second desk | must | M3 stage B |
| F-61 | Five camera stations, reached by clicking an object, by number keys, or by swiping on a phone | must | M3 stage B |
| F-62 | HTML panel beside the object at each station | must | M3 stage B |
| F-63 | Objects signal when they need attention: phone lights, lamp stays on while unanswered, television turns on | must | M3 stage B |
| F-64 | Room lights dim in three steps with severity, and the emergency strip comes on | must | M3 stage B |
| F-65 | Flat view with every feature of the 3D view, switchable at any time | must | M3 stage A |
| F-66 | Automatic offer of flat view when 3D is unavailable or slow | must | M3 stage B |
| F-67 | Generated sound for messages, alerts and severity, with a mute control | should | M3 stage B |
| F-68 | Modelled characters | later | |

## Simulation

| ID | Feature | Priority | Milestone |
|---|---|---|---|
| F-20 | Deterministic engine with seeded variation | must | M1 |
| F-21 | Timed and conditional beats | must | M1 |
| F-22 | Investigations that reveal clues, including red herrings | must | M1 |
| F-23 | Mitigations that help, do nothing, or make things worse | must | M1 |
| F-24 | Commitments ledger with due times | must | M1 |
| F-25 | Claims ledger checked against ground truth and against what the player knew | must | M1 |
| F-26 | Trust per stakeholder, changed only by rules | must | M1 |
| F-27 | Four endings: resolved, relieved, time out, ended by player | must | M1 |
| F-28 | Terminal runner for playing a scenario without the model or the interface | must | M1 |

## Model

| ID | Feature | Priority | Milestone |
|---|---|---|---|
| F-30 | Interpret step: free text to structured intent | must | M2 |
| F-31 | Narrate step: resolved facts to written messages in each stakeholder's voice | must | M2 |
| F-32 | Numeric guard and leak check on narrated text | must | M2 |
| F-33 | Authored fallback text when the model fails | must | M2 |
| F-34 | Recorded responses (cassettes) for repeatable runs | must | M2 |
| F-35 | Token usage and cost recorded per call | must | M2 |
| F-36 | Daily budget switch that turns live play off | must | M2 |

## Debrief

| ID | Feature | Priority | Milestone |
|---|---|---|---|
| F-40 | Score in five dimensions, each with the events that produced it | must | M4 |
| F-41 | Timeline of the session with the key moments marked | must | M4 |
| F-42 | Written debrief: went well, missed, one thing to change | must | M4 |
| F-43 | "A stronger response" shown as an alternative timeline | must | M4 |
| F-44 | Export the session as a JSON event log | must | M4 |
| F-45 | Replay an exported or bundled session | must | M4 |
| F-46 | Print-friendly debrief | later | |

## Content

| ID | Feature | Priority | Milestone |
|---|---|---|---|
| F-50 | Scenario 1, Dial Tone: carrier outage | must | M1 |
| F-51 | Scenario 2, Open Bucket: data exposure | should | M5 |
| F-52 | Scenario 3, Slow Burn: an outage that is really an attack | should | M5 |
| F-53 | Scenario validation tool that proves each scenario is solvable | must | M1 |
| F-54 | Difficulty settings | later | |
| F-55 | Model-generated scenarios | later | |
| F-56 | Team play | later | |
