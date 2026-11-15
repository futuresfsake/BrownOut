# Scenarios

Scenario 1 is written out in full and is the one the engine is built against. Scenarios 2 and 3 are briefs to be authored at milestone M5.

All companies, people, outlets and regulators are fictional. Any resemblance to real ones is unintended.

---

## Scenario 1: Dial Tone

| | |
|---|---|
| ID | `dial-tone` |
| Player | On-call engineering lead, Halden Mobile |
| Company | Mobile carrier, 2,100,000 subscribers, four regions |
| Start | 02:14 |
| Length | 90 sim minutes |
| Type | Outage. No data exposure. |
| Practises | Triage under noise, honest ETAs, not overclaiming, a regulatory duty that appears mid-incident |

### Briefing shown to the player

> You are the on-call engineering lead at Halden Mobile. It is 02:14. Your pager went off a minute ago: customers in two regions are failing to connect, and the dashboard shows errors on subscriber authentication and on billing. Mika Tan is the engineer on shift and will carry out what you ask. Type what you do, or what you tell someone, in your own words.

### Ground truth (hidden)

At 01:52 a scheduled certificate rotation pushed a new certificate bundle to the subscriber authentication cluster, auth-core. Six of the twelve nodes loaded a bundle that is missing an intermediate certificate. A device is unaffected until its session renews. If the renewal lands on a bad node, the TLS handshake fails and the device drops off the network and retries.

So the impact grows over time, and the retries look like a traffic flood. Billing errors are a downstream symptom: billing cannot validate sessions against the failing nodes. Last night's billing deploy is unrelated.

No customer data is exposed. From about 02:24, emergency calling is degraded for affected devices.

| Clock | What happened |
|---|---|
| 23:40 | Billing deploy. Invoice rendering change only. Unrelated. |
| 01:52 | Certificate rotation on auth-core. Six nodes load an incomplete bundle. |
| 02:05 | First attach failures as sessions renew. |
| 02:13 | Alert threshold crossed. Player paged. |
| 02:24 | Emergency calling degraded for affected devices. |

### Stakeholders

| ID | Name | Role | Voice | Patience |
|---|---|---|---|---|
| `engineer` | Mika Tan | Site reliability engineer on shift | Factual, reports what the screen says, asks when an order is unclear | n/a |
| `cto` | Ramon Villareal | Chief technology officer | Two sentences at most. Wants a time. Stops being polite when an ETA is missed. | 5 min |
| `support` | Joy Antolin | Head of customer support | Practical. Needs one line her agents can say. | 8 min |
| `counsel` | Priya Nair | General counsel | Precise closed questions. Writes down the answers. | 10 min |
| `comms` | Daniel Osei | Communications lead | Wants wording approved before it goes out. | 8 min |
| `journalist` | Carla Whitlock | Reporter, The Daily Circuit | Courteous, on a deadline, quotes exactly. | To her deadline |
| `customer` | Tomas Ferrer | IT manager, Calder Valley Hospital Group | Worried, specific about what is failing. | 10 min |
| `regulator` | Duty officer | Telecommunications Authority duty line | Formal. Only replies when contacted. | n/a |

### Systems and metrics

| System | Start | Notes |
|---|---|---|
| `auth-core` | degraded | 6 of 12 nodes failing handshakes |
| `billing-api` | degraded | Symptom only |
| `packet-gateway` | ok | Healthy throughout |
| `status-page` | shows "all systems normal" | Wrong until comms is told to change it |

| Metric | Behaviour |
|---|---|
| Customers affected | Fault present: 60,000 at start, 240,000 at 30 min, 420,000 at 60 min, 520,000 at 90 min. While the rolling fix runs: stops growing. After the fix completes: falls to zero over 3 minutes. After a mass restart: 780,000 for 10 minutes, then back to the growing curve plus 15 percent. After draining the bad nodes: falls to 15 percent of its value over 8 minutes, and auth-core stays degraded. |
| Support tickets | Follows customers affected with a 5-minute delay, at one ticket per 150 affected customers. |
| Attach success rate | Shown only after the player looks at auth-core. 71 percent at start, falling as customers affected grows. |

### Clues

| ID | Kind | Fact |
|---|---|---|
| `two-regions` | true | Failures are in the North and Coastal regions only. |
| `auth-errors-high` | true | auth-core is rejecting about a third of sign-in attempts. |
| `billing-deploy-benign` | red herring cleared | The 23:40 billing deploy changed invoice rendering only. |
| `billing-errors-are-timeouts` | symptom | Billing errors are session-validation timeouts, not billing faults. |
| `retry-storm` | red herring cleared | The traffic spike is the same subscriber devices retrying. It is not an attack. |
| `gateway-healthy` | symptom | The packet gateway is healthy. Devices that are attached work normally. |
| `tls-failures-six-nodes` | true | TLS handshakes have been failing on 6 of 12 auth-core nodes since 01:52. |
| `cert-rotation-0152` | true | A scheduled certificate rotation ran on auth-core at 01:52. |
| `missing-intermediate` | true, root cause | The six failing nodes loaded a bundle with no intermediate certificate. |
| `no-unusual-access` | true | Access logs show no unusual reads of subscriber data. |
| `emergency-degraded` | true | Affected devices cannot place emergency calls reliably. |
| `recovered` | true | Attach success is back to baseline. |

### Investigations

| ID | Minutes | Requires | Reveals |
|---|---|---|---|
| `overview` | 2 | | `two-regions`, `auth-errors-high` |
| `billing-deploy` | 5 | | `billing-deploy-benign`, `billing-errors-are-timeouts` |
| `traffic-spike` | 5 | | `retry-storm` |
| `network-core` | 5 | | `gateway-healthy` |
| `auth-logs` | 5 | | `tls-failures-six-nodes` |
| `auth-changes` | 2 | | `cert-rotation-0152`, `missing-intermediate` |
| `access-logs` | 10 | | `no-unusual-access` |
| `emergency-calls` | 2 | sim minute 10 or later | `emergency-degraded` |
| `verify-recovery` | 2 | fix or partial applied | `recovered`, if customers affected has reached its floor when the check finishes. Otherwise it reports "still recovering" and reveals nothing. |

Two chains reach the root cause: logs then changes, or changes directly. A player who asks "what changed recently?" early is rewarded, as they would be in a real incident.

### Mitigations

| ID | Minutes | Kind | Effect |
|---|---|---|---|
| `rollback-bundle` | 10 | fix | Rolling re-push of the previous bundle to the six nodes. Recovery curve. |
| `drain-bad-nodes` | 5 | partial | Remove the six nodes from the load balancer. Impact falls, capacity halves, auth-core stays degraded. |
| `restart-all-auth` | 5 | harmful | Every device signs in again against six broken nodes. Spike curve. |
| `rollback-billing` | 10 | no effect | Billing invoices are unavailable for ten minutes. Nothing improves. |
| `block-retry-traffic` | 5 | harmful | Rate-limits real subscribers. Customers affected rises 10 percent while it is active. |

### Claim topics

| Topic | Truth | Supported by |
|---|---|---|
| `cause` | Certificate bundle on auth-core | `missing-intermediate` |
| `scope` | Two regions, growing | `two-regions` |
| `dataExposure` | None | `no-unusual-access` |
| `attack` | Not an attack | `retry-storm` |
| `emergencyCalls` | Degraded from 02:24 | `emergency-degraded` |
| `eta` | Depends on what the player has started | Engine checks at the stated time |

The tempting false statements: "billing is the cause", "we are under attack", "emergency calls are unaffected", and "no data was exposed" said with certainty before the access logs are checked. The last one is true but unsupported.

### Obligations

| ID | Trigger | Must | Within |
|---|---|---|---|
| `notify-regulator` | The player learns emergency calling is degraded (clue revealed or the hospital's message arrives) | Contact the regulator duty line, directly or through comms | 30 sim minutes |
| `status-page` | Session start | Tell comms to update the status page | 25 sim minutes |
| `all-clear` | Recovery verified | Tell CTO, support and comms | 10 sim minutes |

### Beats

Minutes are from the start. The seed may shift those marked ± by up to two minutes.

| Minute | From | Purpose | Condition |
|---|---|---|---|
| 0 | system | Alert: attach failures in two regions, billing errors elevated | |
| 3 | cto | Demands an ETA within 10 minutes | |
| 6 ± | support | 400 tickets, asks what to tell customers | |
| 12 ± | journalist | Customers are posting. Asks for comment by minute 31. | |
| 13 | cto | "Ten minutes are up." | Only if no reply to the minute 3 message |
| 15 ± | counsel | Could customer data be exposed? | |
| 20 | comms | Status page still says normal. Wants a statement. | Unless status-page obligation met |
| 25 | customer | Hospital emergency lines affected | Unless fix already applied |
| 31 | journalist | Publishes. Story tone depends on what she was told. | |
| 40 | support | Ticket count update, agents need a new line | Unless resolved |
| 45 | cto | A board member is awake and asking | Unless resolved |
| 55 | regulator | Regulator calls the company | Only if `notify-regulator` was missed |

Conditional beats:

| Trigger | From | Purpose |
|---|---|---|
| `restart-all-auth` applied | support, then cto | Tickets jump. "What did you just do?" |
| Claim `attack: asserts` to anyone, then `retry-storm` revealed | counsel | "You told me this was an attack. Was it?" |
| Claim `emergencyCalls: denies` to journalist, then minute 31 | journalist | Follow-up story quoting the player against the hospital's account |
| Claim `dataExposure: denies` unsupported, to counsel | counsel | "On what basis? I need to know what you checked." |
| A commitment to the CTO is broken | cto | States the missed time exactly |
| Recovery verified | support, comms | Ask for the all-clear wording |

### Ideal path

1. Minute 0: `overview`.
2. Minute 3: reply to CTO with "no ETA yet, update in ten minutes".
3. Minute 4: `auth-changes`.
4. Minute 6: reply to support with a holding line.
5. Minute 7: `rollback-bundle`. Tell comms to update the status page.
6. Minute 12: reply to journalist: outage confirmed in two regions, cause identified, fix under way.
7. Minute 13: update CTO with cause and plan.
8. Minute 15: reply to counsel: availability incident, no sign of exposure, will confirm after access logs.
9. Minute 17: fix lands. `emergency-calls`, then notify the regulator through comms.
10. Minute 20: `verify-recovery`, then `access-logs`.
11. Minute 22: all-clear to CTO, support and comms.

Best case: resolved by about minute 22. Worst case: no action, 520,000 customers affected at minute 90.

---

## Scenario 2: Open Bucket (brief)

| | |
|---|---|
| ID | `open-bucket` |
| Player | Head of engineering at a clinic-booking software company |
| Start | 16:40 on a Friday |
| Type | Data exposure, no outage |
| Practises | Containment before disclosure, preserving evidence, regulator timing, not minimising |

**Opening.** A security researcher emails: a storage location holding appointment exports is readable by anyone with the link. A journalist has the same tip and a deadline.

**Ground truth.** A backup job created three weeks ago writes nightly exports to a storage location that was left publicly readable. The exports contain names, phone numbers and appointment reasons for 38,000 patients across 41 clinics. Access logs show downloads from the researcher and from two unknown addresses.

**Traps.** Deleting the storage location at once destroys the access logs needed to know who downloaded what. Telling the journalist "no sensitive data" is false: appointment reasons are sensitive. Telling counsel "only the researcher accessed it" is false and unsupported until the logs are read.

**Obligations.** Make the location private, preserve logs, find the scope, tell counsel the real scope, notify the fictional regulator within the scenario's deadline, tell the affected clinics.

**What is different from scenario 1.** Nothing is down. The pressure is entirely about what to say, to whom, and in what order.

---

## Scenario 3: Slow Burn (brief)

| | |
|---|---|
| ID | `slow-burn` |
| Player | Incident commander at a payments company |
| Start | 11:05 on a weekday |
| Type | Looks like an outage, is an attack |
| Practises | Changing your mind in public, correcting an earlier statement, escalating to security early |

**Opening.** The login service is slow and timing out. It looks like a capacity problem after this morning's marketing email.

**Ground truth.** The load is a credential-stuffing attack: automated sign-in attempts using passwords leaked from other sites. About 2,300 customer accounts have been signed into by the attacker by the time the player is paged, and the number grows until sign-in protections are tightened.

**Traps.** Adding capacity makes the site faster and helps the attacker. An early statement of "a performance issue, customers are not affected" is the natural thing to say and is false. The scenario is built so that a careful player says "we are investigating" and a hasty one has to retract.

**Consequence.** The player's first public statement is stored. When the account takeovers come to light, the journalist's follow-up quotes it. A player who corrects the statement themselves before being asked is scored well on honesty. One who waits to be caught is not.

**What is different from scenarios 1 and 2.** The first reading of the situation is wrong, and the test is how quickly and openly the player updates.
