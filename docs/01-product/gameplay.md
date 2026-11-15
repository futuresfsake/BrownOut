# Gameplay

## The loop

1. The player reads the board, the log and the inbox.
2. The player does one thing: types an action, replies to a message, or waits.
3. The engine moves the clock, applies the consequences and decides which beats fire.
4. New findings and messages appear.
5. Repeat until the incident ends.

## What the player can do

| Input | Where | Example |
|---|---|---|
| Action | The decision box under the log | "Pull the auth-core error logs for the last 30 minutes." |
| Reply | The reply box inside a message thread | To the CTO: "No ETA yet. I will update you at 02:30 whatever I have." |
| Wait | A button | Moves to the next event, up to five sim minutes. |
| Cancel task | A control on the running task | Stops what the on-shift engineer is doing. |
| Pause | A button | Stops the idle clock. |
| End | A button, with confirmation | Closes the incident and goes to the debrief. |

There is no list of available actions. The opening screen says only who you are, what you can see, and that you can type anything a person in that seat could do or order.

One input can do several things. "Tell Mika to roll back the cert bundle on two nodes, and tell the CTO I'll have an ETA in ten minutes" is one investigation-or-mitigation plus one promise.

## Time

- The scenario starts at a set sim time, for scenario 1 at 02:14.
- Giving an order or sending a reply costs the player one sim minute.
- Investigations and mitigations are tasks carried out by the on-shift engineer. A task takes 2 sim minutes for a quick look, 5 for a standard job and 10 for a long one, unless the scenario sets its own duration. The result arrives when the task finishes.
- The engineer does one task at a time. A second order waits in a queue of one. The player can cancel the running task.
- The player is free to reply to people while a task runs. That is the point: there is one pair of hands and several people asking.
- Wait moves the clock to the next event (a task finishing or a message arriving), up to five sim minutes.
- While the player is idle, one sim minute passes every 15 real seconds.
- The clock does not move while a turn is being processed.
- Each scenario has a hard end, for scenario 1 at 90 sim minutes.

## What the player sees

The player sits at a desk in a 3D operations room. Each of the three things below is an object in the room and an HTML panel that opens beside it: the wall board, the logbook, and the phone and desk monitor. The press appears on a television. The room itself reports how things are going: lamps stay lit on devices with unanswered messages, and the ceiling lights dim as the incident gets worse. The same panels are available as a flat page. See [UI design](../03-design/ui-design.md).

**Board.** Sim clock, minutes elapsed, status of each system, and the hard numbers: customers affected, support tickets open, error rate. Numbers the player has no way to know yet are shown as unknown, not as zero.

**Log.** The duty log. Every action the player took, restated in one line as the engine understood it, followed by what was found or what happened. Alerts also land here.

**Inbox.** One thread per stakeholder, plus press. Unanswered messages are marked. A thread shows any promise the player made in it and when it falls due.

## Stakeholders

Each has a role, a goal, a voice, a patience and a trust level. Trust is not shown as a number; it shows in how they write.

| Stakeholder | Wants | Gets worse when |
|---|---|---|
| CTO | An ETA, then to be kept informed | Ignored, or given an ETA that is missed without warning |
| Support lead | Something true to tell customers | Left without a line to give |
| Counsel | To know whether data is involved | Told "definitely not" without evidence |
| Comms lead | An approved statement and status page | The status page stays green during an outage |
| Journalist | A comment before their deadline | Stonewalled, or told something that proves false |
| On-shift engineer | Clear instructions | Given vague or conflicting ones |

The on-shift engineer is the player's hands. Investigations and mitigations are carried out by them, and their reports appear in the log.

## What gets remembered

- **Promises.** "I'll update you in ten minutes" becomes a commitment with a due time. Keeping it raises trust. Missing it lowers trust and the stakeholder says so.
- **Claims.** "No customer data is affected" is stored with who heard it and what the player knew at that moment. If it was false, or was said with certainty the player did not have, it can return later as a follow-up question, a quote in a press story, or a line in the debrief.
- **Silence.** Unanswered messages cost trust over time.

## How it ends

| Ending | Trigger |
|---|---|
| Resolved | The correct mitigation is applied, recovery is verified, and the key stakeholders have been told. |
| Relieved | CTO trust falls below the scenario's floor. The CTO takes over the incident. |
| Time out | The scenario's hard end is reached. |
| Ended by player | The player closes the incident early. |

Every ending leads to the debrief.

## A worked session, scenario 1

Times are sim time. This is one possible path, not the only good one.

| Time | What happens |
|---|---|
| 02:14 | Alert: attach failures rising in two regions. Billing errors also elevated. |
| 02:14 | Player: "Check whether last night's deploy touched the billing service." Costs 5 minutes. |
| 02:17 | CTO: "What's the ETA? I need something in ten minutes." |
| 02:19 | Log: the 23:40 billing deploy changed invoice rendering only. Billing errors are session-validation timeouts, not billing faults. |
| 02:20 | Support: 400 tickets, all "no signal" or "can't connect". |
| 02:20 | Player replies to CTO: "No ETA yet. Billing looks like a symptom. Update at 02:30." A commitment is recorded for 02:30. |
| 02:21 | Player: "Pull auth-core logs for the last 30 minutes." Costs 5 minutes. |
| 02:26 | Log: TLS handshake failures on 6 of 12 auth-core nodes since 01:52. |
| 02:26 | Journalist: customers are posting about an outage. Comment by 02:45? |
| 02:27 | Player: "What changed on auth-core around 01:52?" Costs 2 minutes. |
| 02:29 | Log: scheduled certificate rotation at 01:52. Six nodes loaded a bundle missing an intermediate certificate. |
| 02:29 | Counsel: could customer data be exposed? |
| 02:30 | Player replies to CTO with cause and plan. Commitment kept. |
| 02:31 | Player: "Push the previous bundle to the six bad nodes, rolling, one at a time." Costs 10 minutes. |
| 02:33 | Player replies to counsel: "Availability incident. No sign of exposure so far. I'll confirm after access logs are reviewed." Recorded as an uncertain claim, which is accurate. |
| 02:34 | Comms: the status page still says all systems normal. |
| 02:35 | Player replies to journalist: confirms an outage in two regions, cause identified, fix in progress, no ETA promised. |
| 02:39 | Hospital network IT reports their emergency lines are affected. The regulator notification clock starts. |
| 02:41 | Log: all nodes on the previous bundle. Attach success recovering. |
| 02:42 | Player: "Tell comms to notify the regulator duty line and update the status page." The status page is late; the regulator notice is in time. |
| 02:45 | Player: "Confirm attach success rate is back to normal." Takes 2 minutes. |
| 02:47 | Log: attach success back to baseline. Recovery verified. |
| 02:48 | Player sends an all-clear to CTO, support and comms. Incident resolved. |

A player who instead restarts every auth-core node at 02:21 forces every connected device to sign in again against six broken nodes. Customers affected jumps, the journalist's story is harsher, and the debrief points at that minute.
